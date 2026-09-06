import { useCallback, useEffect, useRef, useState } from "react";

import { cameraRegistryApi } from "../services/cameraRegistry";

import {
  ADAPT_EVERY_MS,
  DEFAULT_STEP,
  SIZE_STEPS,
  nextStep,
} from "./captureSizing";

/**
 * Analyse this device's camera on the server.
 *
 * The server-side capture path can only reach cameras the server can see. This
 * one runs the other way round: the browser captures the picture and pushes
 * JPEG frames over a WebSocket. The camera stays on the operator's desk while
 * the model runs wherever the GPU is.
 *
 * Two things can be the picture. `getUserMedia` gives this device's camera.
 * Pass `file` instead and the browser plays a recording the server is holding
 * and analyses that — which sounds like a detour, and is the opposite. The
 * server used to decode a recording, annotate it, re-encode it as JPEG and
 * push the result back, so the operator watched a picture that had made a
 * round trip it never needed to make. Played here it runs at full rate with
 * the browser's own buffering, and only the findings cross the network.
 *
 * By default only the findings come back, not a picture: the camera is already
 * here, so `stream` is shown directly at its own frame rate and the findings
 * are drawn over it. Pass `overlay: "image"` for a client that cannot draw its
 * own, and the annotated frames arrive as `frameUrl` instead.
 *
 * Pacing allows `maxInFlight` frames on the wire at once, so the capture rate
 * settles at whatever the link and server can actually sustain instead of
 * building a backlog. `fps` is a ceiling, not a promise.
 *
 * getUserMedia needs a secure context: https, or localhost. Both hosting
 * routes qualify, but plain http on a LAN address will not, and the browser
 * will refuse with a NotAllowedError rather than prompt.
 */

const DEFAULTS = {
  fps: 10,
  width: null,
  quality: null,

  // How many frames may be in flight at once.
  //
  // With strictly one, throughput is capped at 1 / round-trip — so a 650ms
  // link gives 1.5 pictures a second however fast the GPU is, because the
  // camera sits idle waiting for the previous answer. Allowing a second frame
  // on the wire overlaps the wait with the next capture and roughly doubles
  // the rate on a slow link, while changing nothing on a fast one.
  //
  // Floor. The pipeline grows from here to suit the link — see MAX_IN_FLIGHT.
  maxInFlight: 2,

  // What comes back per frame.
  //
  // "json" sends findings only — a few hundred bytes against the ~40 KB an
  // annotated frame costs, and the larger half of the exchange was the return
  // trip. "image" sends the annotated picture, for a client that cannot draw
  // its own overlay.
  overlay: "json",

  // A recording to analyse instead of this device's camera, as a URL the
  // browser can play. Null means use the camera.
  file: null,
};

//: Most frames that may be on the wire at once.
//:
//: Throughput is framesInFlight / roundTrip, so a fixed small number caps the
//: update rate on a distant server however fast the model is: at 480ms, two
//: frames in flight is four answers a second, and the GPU sits idle for most
//: of it. The pipeline is sized from the measured link instead, so it fills a
//: slow connection and stays small on a fast one.
//:
//: Bounded deliberately. Every frame in flight is a frame the server is
//: holding, so an unbounded pipeline is a way for one browser to exhaust its
//: memory. Six is enough to saturate a half-second link at ten frames a
//: second and no more.
const MAX_IN_FLIGHT = 6;

//: How old an answer may be by the time it lands, in ms.
//:
//: Findings are drawn over live video, so this is how far the boxes trail
//: the thing they describe. Two thirds of a second — where an unbounded
//: pipeline put it on a slow link — reads as the system being wrong rather
//: than late, because the box is visibly not where the person is.
//:
//: A ceiling on delay, not a target: on a fast link the pipeline is already
//: well inside it and this changes nothing.
const LATENCY_BUDGET_MS = 400;

//: How quickly the measured link time follows a change, 0-1 per answer.
//:
//: Low, because the pipeline depth is derived from it. Reacting to a single
//: slow answer would have the depth oscillating, which is worse for the
//: operator than being briefly wrong.
const LINK_SMOOTHING = 0.2;

/** ws:// or wss:// against the current origin, matching page security. */
function socketUrl(moduleId, overlay) {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/api/${moduleId}/ws?overlay=${overlay}`;
}

export function useWebcamAnalysis(moduleId, options = {}) {
  const { fps, width, quality, maxInFlight, overlay, file } = {
    ...DEFAULTS,
    ...options,
  };

  const [active, setActive] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [frameUrl, setFrameUrl] = useState(null);
  const [stream, setStream] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  // The camera register's questions. `pendingCamera` is set while the
  // operator is being asked to register a device this deployment has never
  // seen — start() pauses between acquiring the camera and opening the
  // socket until resolvePendingCamera is called. `cameraIdentity` is the
  // registered name and place of whatever device is feeding now, for the
  // card to show.
  const [pendingCamera, setPendingCamera] = useState(null);
  const [cameraIdentity, setCameraIdentity] = useState(null);

  const [stats, setStats] = useState({
    fps: 0,
    latencyMs: 0,
    analysisMs: 0,
    networkMs: 0,
  });

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const socketRef = useRef(null);
  const runningRef = useRef(false);
  const sentAtRef = useRef(0);
  const objectUrlRef = useRef(null);
  const tickRef = useRef({ count: 0, since: 0 });
  const inFlightRef = useRef(0);

  // When each frame still on the wire was taken. Answers come back in the
  // order the frames were sent, so the oldest belongs to the next answer.
  const captureTimesRef = useRef([]);

  // Encoding and sending are both asynchronous, so two frames captured in
  // order can finish encoding out of order and reach the socket swapped. The
  // server answers in the order it receives them, so a swap would pair every
  // answer with the wrong frame's timestamp — and the whole point of keeping
  // the timestamp is knowing exactly how old an answer is. Chaining the sends
  // keeps the wire order equal to the capture order.
  const sendChainRef = useRef(Promise.resolve());

  // Smoothed time the link takes, and the pipeline depth derived from it.
  const linkMsRef = useRef(0);

  //: Resolves the registration dialog's outcome back into a paused start().
  const cameraDecisionRef = useRef(null);
  const depthRef = useRef(0);

  // Which SIZE_STEPS entry frames are being captured at, the smoothed size
  // of a sent frame in bytes, and when the step last changed.
  const stepRef = useRef(DEFAULT_STEP);
  const frameBytesRef = useRef(0);
  const adaptedAtRef = useRef(0);
  const shrankAtRef = useRef(0);

  /** Release everything. Safe to call repeatedly. */
  const stop = useCallback(() => {
    runningRef.current = false;

    // A registration dialog still open has its answer now: the camera is
    // being stopped, so the paused start() is released and aborts.
    if (cameraDecisionRef.current) {
      cameraDecisionRef.current(null);
      cameraDecisionRef.current = null;
    }
    setPendingCamera(null);
    setCameraIdentity(null);
    cameraRegistryApi.clearContext().catch(() => {});

    if (socketRef.current) {
      try {
        socketRef.current.close();
      } catch {
        // Already closing.
      }
      socketRef.current = null;
    }

    if (streamRef.current) {
      // Without this the camera light stays on after leaving the page.
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      // A recording left playing goes on decoding in the background, and its
      // captured stream goes on producing frames nobody is looking at.
      videoRef.current.pause();
      videoRef.current.srcObject = null;
      videoRef.current.removeAttribute("src");
      videoRef.current.load();
      videoRef.current = null;
    }

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }

    setActive(false);
    setConnecting(false);
    setFrameUrl(null);
    setStream(null);
    // Cleared, or restarting replays the previous session's figures over a
    // blank picture until the first new frame lands.
    setResult(null);
    setStats({ fps: 0, latencyMs: 0, analysisMs: 0, networkMs: 0 });
    inFlightRef.current = 0;
    captureTimesRef.current = [];
    linkMsRef.current = 0;
    depthRef.current = 0;
    stepRef.current = DEFAULT_STEP;
    frameBytesRef.current = 0;
    adaptedAtRef.current = 0;
    shrankAtRef.current = 0;

    // Any frame still encoding belongs to the session being torn down. A
    // fresh chain drops it rather than letting it push a stale timestamp
    // into the next session's queue.
    sendChainRef.current = Promise.resolve();
  }, []);

  const start = useCallback(async (override = {}) => {
    setError(null);
    setConnecting(true);

    // The recording may be handed in directly rather than through the hook's
    // options: the moment after an upload, the caller has the file before
    // React has carried it through page state, and starting from the stale
    // option would open the device camera instead.
    const recording = override.file !== undefined ? override.file : file;

    // --- the picture ----------------------------------------------------
    //
    // One video element either way, so everything downstream — the capture
    // loop, the socket, the overlay — is identical whether the frames come
    // from a camera on the desk or a recording on the server.
    let socket;

    try {
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;

      if (recording) {
        video.loop = true;

        // Everything the element will buffer, it should buffer: a recording
        // played straight from this device ignores this, but one streamed
        // from a server stalls mid-review without it.
        video.preload = "auto";

        // Handlers before the source, or a recording that loads faster than
        // this function continues resolves nothing and the wait never ends.
        //
        // No crossOrigin here: the recording comes from the same origin as
        // the page. Setting it after the source — as this first did — aborts
        // the load already in flight and re-requests in CORS mode, which
        // showed up as a connection reset and a recording that would not
        // play at all.
        const ready = new Promise((resolve, reject) => {
          video.onloadeddata = resolve;
          video.onerror = () => {
            // Told apart from any other failure, because the caller can do
            // something about this one: a browser that cannot decode the
            // recording can still review it the slow way, with the server
            // decoding and streaming it back.
            const unplayable = video.error?.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED;

            const failure = new Error(
              unplayable
                ? "This browser cannot play that recording."
                : "Could not load that recording.",
            );
            failure.reason = unplayable ? "unplayable" : "unreadable";
            reject(failure);
          };
        });

        video.src = recording;

        await ready;
        await video.play();

        // Handed on as a MediaStream so the view shows exactly these frames.
        // Playing the file a second time in the visible element would drift
        // from this one, and the boxes would sit over the wrong moment.
        streamRef.current = video.captureStream?.() ?? null;
      } else {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error(
            "This browser will not share a camera over an insecure connection. Use the https address.",
          );
        }

        const camera = await navigator.mediaDevices.getUserMedia({
          // What the camera captures, not what is sent: frames are scaled
          // down to the step the link can carry. Asking for the largest
          // step keeps a sharp original to scale from.
          video: {
            width: { ideal: width ?? SIZE_STEPS[0].width },
            facingMode: "environment",
          },
          audio: false,
        });

        streamRef.current = camera;
        video.srcObject = camera;
        await video.play();

        // ---- the camera register ---------------------------------------
        //
        // The device is known now — its per-origin deviceId is the most
        // stable identifier a page can have for it — and analysis has not
        // started yet, which is exactly when the register's question
        // belongs. A device this deployment knows starts silently under its
        // registered name; an unknown one pauses here for the operator's
        // decision. The register being unreachable never stops the camera:
        // watching the floor must not be conditional on paperwork.
        try {
          const track = camera.getVideoTracks?.()[0];
          const deviceId = track?.getSettings?.().deviceId || null;

          if (deviceId) {
            const found = await cameraRegistryApi.lookup(deviceId);

            let registration = found.registered ? found.camera : null;

            if (!found.registered) {
              registration = await new Promise((resolve) => {
                cameraDecisionRef.current = resolve;
                setPendingCamera({
                  cameraId: deviceId,
                  label: track?.label || "",
                  kind: "browser",
                });
              });
              cameraDecisionRef.current = null;
              setPendingCamera(null);
            }

            // Stopped while the dialog was open: the camera is gone, so
            // there is nothing to start.
            if (!streamRef.current) {
              setConnecting(false);
              return { ok: false, reason: "cancelled" };
            }

            // Registered or declined, this device is the one feeding now —
            // events carry its name and place, or at least its identifier.
            cameraRegistryApi.setContext(deviceId).catch(() => {});
            setCameraIdentity(
              registration
                ? {
                    name: registration.camera_name,
                    location: registration.location,
                  }
                : null,
            );
          }
        } catch {
          // The register is unreachable; the camera starts regardless.
        }
      }

      setStream(streamRef.current);

      videoRef.current = video;
      canvasRef.current = document.createElement("canvas");

      socket = new WebSocket(socketUrl(moduleId, overlay));
      socket.binaryType = "arraybuffer";
      socketRef.current = socket;
    } catch (err) {
      stop();
      setConnecting(false);

      const message =
        err?.name === "NotAllowedError"
          ? "Camera access was blocked. Allow it in the browser and try again."
          : err?.name === "NotFoundError"
            ? "No camera found on this device."
            : err?.message || "Could not start the session.";

      // A codec this browser lacks is not an error the operator has to act
      // on — the caller falls back to the server decoding it — so it is
      // returned rather than shown.
      if (err?.reason !== "unplayable") setError(message);

      return { ok: false, reason: err?.reason ?? "failed", message };
    }

    socket.onopen = () => {
      runningRef.current = true;
      tickRef.current = { count: 0, since: performance.now() };
      setConnecting(false);
      setActive(true);
      inFlightRef.current = 0;
      captureTimesRef.current = [];
      pump();
    };

    socket.onerror = () => {
      setError("Lost the connection to the AI system.");
    };

    socket.onclose = () => {
      if (runningRef.current) {
        setError("The AI system closed the connection.");
      }
      stop();
    };

    socket.onmessage = (event) => {
      if (typeof event.data === "string") {
        // JSON half of the exchange: the analysis result.
        let payload;
        try {
          payload = JSON.parse(event.data);
        } catch {
          return;
        }

        // One exchange has completed either way, so its slot is free.
        inFlightRef.current = Math.max(0, inFlightRef.current - 1);
        const capturedAt = captureTimesRef.current.shift() ?? performance.now();

        if (payload.error) {
          // Recoverable: the server rejected one frame, not the session. The
          // loop must continue, or a single bad frame freezes the view for
          // good while the UI still claims to be watching.
          setError(payload.error);
          pump();
          return;
        }

        setError(null);

        // Carried with the findings so the overlay knows how old they are.
        // Everything in this answer describes the scene at that instant, and
        // the scene has moved on since.
        setResult({ ...payload, capturedAt });

        const roundTrip = performance.now() - capturedAt;
        const serverMs = payload.server_ms ?? 0;

        // What the link cost, with the server's own time taken out — both the
        // frame it analysed and the ones ahead of it in the queue.
        //
        // The queue has to come out or the sizing runs away. It answers one
        // frame at a time, so a frame sent with N already on the wire waits
        // for all of them first. Counting that wait as link time would make a
        // deeper pipeline look like a slower link, which would call for a
        // deeper pipeline still — straight to the ceiling, on a server where
        // the extra frames only ever sit in a queue growing stale.
        const depth = Math.max(maxInFlight, depthRef.current);
        const queued = Math.max(0, depth - 1) * serverMs;
        const link = Math.max(0, roundTrip - serverMs - queued);

        linkMsRef.current = linkMsRef.current
          ? linkMsRef.current + (link - linkMsRef.current) * LINK_SMOOTHING
          : link;

        // Three ceilings, whichever is lowest.
        //
        // Enough frames on the wire to keep the server busy while the next one
        // is still travelling — past that they only queue. Never more than
        // the requested frame rate needs, since a frame that would not have
        // been sent anyway gains nothing by being in flight. And never so
        // many that an answer arrives describing a scene that has moved on.
        //
        // That last one is not a refinement, it is the difference between a
        // live view and a replay. Every frame in the pipeline is a frame the
        // answer has to queue behind, so depth buys frame rate with delay —
        // and on a link that is *full* rather than merely distant it buys
        // nothing at all, because the frames leave no faster for being
        // queued earlier. An operator watching boxes lag two thirds of a
        // second behind the person they are drawn around is being shown the
        // past, so the delay is capped and the rate takes what is left.
        const toKeepBusy = 1 + linkMsRef.current / Math.max(serverMs, 1);
        const toHoldRate = (fps * (linkMsRef.current + serverMs)) / 1000;

        // What one frame costs the pipeline end to end, worked back from the
        // round trip actually measured at the depth actually in use.
        const perFrameMs = Math.max(1, roundTrip / Math.max(depth, 1));
        const withinDelay = LATENCY_BUDGET_MS / perFrameMs;

        depthRef.current = Math.min(
          MAX_IN_FLIGHT,
          Math.max(
            maxInFlight,
            Math.round(Math.min(toKeepBusy, toHoldRate, withinDelay)),
          ),
        );

        const tick = tickRef.current;
        tick.count += 1;
        const elapsed = performance.now() - tick.since;

        if (elapsed >= 1000) {
          // Analysis is what the server measured; the rest is the link. Shown
          // apart so a slow network is not mistaken for a slow model.
          const analysis = Math.round(payload.server_ms ?? 0);
          const achieved = (tick.count / elapsed) * 1000;
          const network = Math.max(0, Math.round(roundTrip) - analysis);

          setStats({
            fps: Math.round(achieved),
            latencyMs: Math.round(roundTrip),
            analysisMs: analysis,
            networkMs: network,
          });
          tickRef.current = { count: 0, since: performance.now() };

          adapt(achieved, analysis, network);
        }

        pump();
        return;
      }

      // Binary half: the annotated frame.
      const blob = new Blob([event.data], { type: "image/jpeg" });
      const url = URL.createObjectURL(blob);

      // Revoke the previous frame or the tab leaks a JPEG per frame — at
      // 10fps that is a gigabyte inside an hour.
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = url;

      setFrameUrl(url);
    };

    // --- capture loop ----------------------------------------------------

    /**
     * Match the size of the picture to what the link can carry.
     *
     * The rate the operator sees is the upload link divided by the size of
     * a frame, so on a slow connection a smaller picture is not a
     * compromise — it is the only thing that raises the rate at all. The
     * decision itself lives in captureSizing.js; this applies it, no more
     * often than ADAPT_EVERY_MS.
     */
    function adapt(achievedFps, analysisMs, networkMs) {
      // Nothing to decide when the caller pinned a size.
      if (width !== null || quality !== null) return;

      const now = performance.now();
      if (now - adaptedAtRef.current < ADAPT_EVERY_MS) return;

      const next = nextStep({
        step: stepRef.current,
        fps: achievedFps,
        analysisMs,
        networkMs,
        bytes: frameBytesRef.current,
        sinceShrinkMs: now - shrankAtRef.current,
      });

      if (next === stepRef.current) return;

      if (next > stepRef.current) shrankAtRef.current = now;

      stepRef.current = next;
      adaptedAtRef.current = now;

      // Sized for the new picture, not the old one, or the first second
      // after a change is judged on the previous step's figures.
      frameBytesRef.current = 0;
    }

    /**
     * Send frames until the pipeline is full.
     *
     * Called after every completed exchange and on connect. Waiting for each
     * answer before capturing the next caps throughput at one frame per round
     * trip; this keeps `maxInFlight` on the wire so the link's latency is
     * overlapped rather than paid serially.
     */
    function pump() {
      if (!runningRef.current) return;

      const depth = Math.max(maxInFlight, depthRef.current);

      while (inFlightRef.current < depth) {
        const sent = sendFrame();
        if (!sent) break;
      }
    }

    function sendFrame() {
      if (!runningRef.current) return false;

      const sock = socketRef.current;
      const vid = videoRef.current;
      const cvs = canvasRef.current;

      if (!sock || sock.readyState !== WebSocket.OPEN || !vid || !cvs) return false;
      if (!vid.videoWidth) {
        setTimeout(pump, 100);
        return false;
      }

      // Respect the requested ceiling even when the link is fast enough to
      // allow more — sending faster only burns bandwidth and battery.
      const sinceLast = performance.now() - sentAtRef.current;
      if (sinceLast < 1000 / fps) {
        setTimeout(pump, Math.ceil(1000 / fps - sinceLast));
        return false;
      }

      inFlightRef.current += 1;
      sentAtRef.current = performance.now();

      // The size to capture at: whatever the caller pinned, else the step
      // the link has settled on. Read per frame, so a change takes effect on
      // the next picture rather than the next session.
      const step = SIZE_STEPS[stepRef.current];
      const frameWidth = width ?? step.width;
      const frameQuality = quality ?? step.quality;

      const scale = frameWidth / vid.videoWidth;
      cvs.width = frameWidth;
      cvs.height = Math.round(vid.videoHeight * scale);

      // Taken before anything asynchronous happens, so it is the moment the
      // scene actually looked like this rather than the moment encoding
      // happened to finish.
      const capturedAt = performance.now();

      // The source's own position for this exact frame — a replayed file's
      // media time, a live camera's stream time. Sent ahead of the JPEG so
      // the server's burned-in-timestamp clock can anchor to the frame the
      // reading came from rather than to whenever it arrived.
      const mediaPos = Number.isFinite(vid.currentTime) ? vid.currentTime : null;

      cvs.getContext("2d").drawImage(vid, 0, 0, cvs.width, cvs.height);

      /** Give the slot back, or the pipeline starves a frame at a time. */
      const abandon = () => {
        inFlightRef.current = Math.max(0, inFlightRef.current - 1);
        pump();
      };

      const encoded = new Promise((resolve) => {
        cvs.toBlob(resolve, "image/jpeg", frameQuality);
      });

      sendChainRef.current = sendChainRef.current
        .then(() => encoded)
        .then(async (blob) => {
          if (!blob || !runningRef.current) return abandon();

          // What a picture actually costs on this link, smoothed. The
          // adaptation below reasons in bytes, and a guess from the
          // dimensions would be wrong by more than the thing it decides:
          // an empty corridor and a busy workshop differ threefold at the
          // same size.
          frameBytesRef.current = frameBytesRef.current
            ? frameBytesRef.current + (blob.size - frameBytesRef.current) * 0.3
            : blob.size;

          const socket = socketRef.current;
          if (socket?.readyState !== WebSocket.OPEN) return abandon();

          const buffer = await blob.arrayBuffer();

          // Re-checked after the await: a session can be stopped while a
          // frame is being read, and sending on a closed socket throws.
          if (socketRef.current?.readyState !== WebSocket.OPEN) return abandon();

          captureTimesRef.current.push(capturedAt);

          if (mediaPos != null) {
            // A 13-byte header ahead of the JPEG: "VTS1", version 1, then
            // this frame's media position as a big-endian float64. The
            // server strips it when present; a JPEG always begins FF D8,
            // so a server that predates the header still reads the bare
            // frames every older client sends.
            const framed = new Uint8Array(13 + buffer.byteLength);
            const head = new DataView(framed.buffer);
            head.setUint8(0, 0x56); // V
            head.setUint8(1, 0x54); // T
            head.setUint8(2, 0x53); // S
            head.setUint8(3, 0x31); // 1
            head.setUint8(4, 1);
            head.setFloat64(5, mediaPos, false);
            framed.set(new Uint8Array(buffer), 13);
            socketRef.current.send(framed.buffer);
          } else {
            socketRef.current.send(buffer);
          }
        })
        .catch(abandon);

      return true;
    }

    // Reached only when the picture and the socket were both set up. Any
    // failure above has already returned its reason.
    return { ok: true };
  }, [moduleId, fps, width, quality, maxInFlight, overlay, file, stop]);

  /**
   * A still of what the camera is seeing right now, as a data URL.
   *
   * Marking out an area needs a picture that stays put while the operator
   * clicks its corners. The server cannot supply one here — the camera is on
   * this device and the server never sees a frame it did not capture — so the
   * still is taken locally. Returns null before the first frame.
   */
  const snapshot = useCallback(() => {
    const video = videoRef.current;
    if (!video?.videoWidth) return null;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);

    return canvas.toDataURL("image/jpeg", 0.9);
  }, []);

  // Leaving the page must release the camera.
  useEffect(() => stop, [stop]);

  return {
    active,
    connecting,
    stream,        // the local camera, shown directly at full frame rate
    frameUrl,      // only with overlay: "image"
    result,
    error,
    stats,
    snapshot,
    start,
    stop,
    // The camera register: the device awaiting registration, the resolver
    // the dialog answers through, and the registered identity of whatever
    // is feeding now.
    pendingCamera,
    resolvePendingCamera: (registration) =>
      cameraDecisionRef.current?.(registration ?? null),
    cameraIdentity,
  };
}

export default useWebcamAnalysis;
