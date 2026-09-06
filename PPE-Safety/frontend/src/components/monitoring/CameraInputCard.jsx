import { useEffect, useRef, useState } from "react";
import {
  Camera,
  Link2,
  MonitorSmartphone,
  Play,
  Square,
  Upload,
  Video,
} from "lucide-react";

import Badge from "../common/Badge";
import Button from "../common/Button";
import Panel from "../common/Panel";
import { cameraApi } from "../../services/moduleApi";
import CameraRegistrationDialog from "../camera/CameraRegistrationDialog";
import { cameraRegistryApi } from "../../services/cameraRegistry";
import TimestampAreaPanel from "./TimestampAreaPanel";

/**
 * The one camera input component.
 *
 * Every monitoring page uses this — restricted zone, PPE, gloves, doors, and
 * anything added later — so the operator learns one workflow and it never
 * changes. Nothing here is module-specific; the camera is shared
 * infrastructure and each module simply analyses whatever it is pointed at.
 *
 * Workflow, identical on every page:
 *
 *     pick a source  ->  connect it  ->  start watching
 *
 * Callers get told what happened through onSourceChanged / onWatchingChanged
 * and handle their own refresh; this component owns only the input controls.
 */

const SOURCES = [
  {
    id: "browser",
    label: "This device",
    icon: MonitorSmartphone,
    hint: "Use the camera on the computer or phone you are looking at",
  },
  {
    id: "video",
    label: "Video file",
    icon: Video,
    hint: "Upload a recording to review",
  },
  {
    id: "rtsp",
    label: "Network camera",
    icon: Link2,
    hint: "Connect a CCTV camera on the network by its address",
  },
];

export default function CameraInputCard({
  connected = false,
  watching = false,
  sourceLabel,
  busy = false,
  onSourceChanged,
  onWatchingChanged,
  onError,
  webcam,
}) {
  // Default to this device's camera when the page supports it: it is the only
  // source that needs no setup, and the one an operator can try immediately.
  const [selected, setSelected] = useState(webcam ? "browser" : "rtsp");
  const [streamUrl, setStreamUrl] = useState("");
  const [working, setWorking] = useState(false);
  const fileInputRef = useRef(null);

  // Where the server keeps the last uploaded recording, for the fallback.
  const serverPathRef = useRef(null);

  // The recording as an object URL on *this* device. Playback uses this, not
  // the server's copy: the operator just picked the file from their own
  // disk, and fetching it back over the link is what made review crawl and
  // stall. Revoked when the next recording replaces it.
  const localUrlRef = useRef(null);

  // How the current source is being handled — {text, tone} where tone is
  // "info" or "error". Kept here rather than raised only through onError:
  // the page's poll clears its error banner every couple of seconds, so a
  // message sent that way vanishes before it can be read. What the operator
  // must act on has to survive the poll.
  const [notice, setNotice] = useState(null);

  // Upload progress as a whole percentage, or null when nothing is being
  // sent. What is uploading is named so the label can say so.
  const [upload, setUpload] = useState(null); // {pct, what}

  const disabled = busy || working;

  // The object URL held for the current recording is released with the page.
  useEffect(
    () => () => {
      if (localUrlRef.current) URL.revokeObjectURL(localUrlRef.current);
    },
    [],
  );

  const report = (err, fallback) => {
    const message =
      err?.response?.data?.detail || err?.message || fallback;
    onError?.(message);
  };

  // A network camera awaiting registration: {cameraId, label, kind} plus
  // the connect continuation to run once the dialog closes.
  const [pendingNetwork, setPendingNetwork] = useState(null);

  const connectNetwork = async () => {
    setWorking(true);

    try {
      await cameraApi.setSource(streamUrl.trim());

      cameraRegistryApi.setContext(streamUrl.trim()).catch(() => {});
      onSourceChanged?.("Network camera");
    } catch (err) {
      report(err, "Could not connect to that camera.");
    } finally {
      setWorking(false);
    }
  };

  const handleConnect = async () => {
    if (selected === "video") {
      fileInputRef.current?.click();
      return;
    }

    if (selected === "rtsp" && !streamUrl.trim()) {
      onError?.("Enter the camera address first.");
      return;
    }

    // The register first: a camera this deployment has never seen is
    // offered for registration before it starts. The register being
    // unreachable never blocks the connection.
    const address = streamUrl.trim();

    try {
      const found = await cameraRegistryApi.lookup(address);

      if (!found.registered) {
        setPendingNetwork({
          cameraId: address,
          label: address,
          kind: "network",
        });
        return;
      }
    } catch {
      // Unreachable register; connect regardless.
    }

    await connectNetwork();
  };

  const handleFile = async (event) => {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;

    input.value = "";
    setWorking(true);
    setNotice(null);

    // Played from this device, starting now. The file is already in the
    // operator's hands — streaming it back from the server over a real link
    // is what made review stall and crawl. Locally it runs at the
    // recording's own speed whatever the connection is doing, and nothing
    // needs to be uploaded first.
    if (localUrlRef.current) URL.revokeObjectURL(localUrlRef.current);
    const localUrl = URL.createObjectURL(file);
    localUrlRef.current = localUrl;
    serverPathRef.current = null;

    onSourceChanged?.(file.name, localUrl);

    // No second press: choosing a recording is the instruction to review it.
    // The file is handed to start() directly rather than read from options,
    // which will not carry the new URL until React has re-rendered.
    const started = webcam ? await webcam.start({ file: localUrl }) : null;

    setWorking(false);

    if (!webcam || started?.ok) return;

    if (started?.reason === "unplayable") {
      // Only now does the server need a copy: this browser lacks the codec,
      // and the server can decode it instead. This is the one path that
      // uploads at all — a recording the browser can play goes nowhere.
      setWorking(true);
      setUpload({ pct: 0, what: "recording" });

      try {
        await cameraApi.uploadVideo(file, (pct) =>
          setUpload({ pct, what: "recording" }),
        );
        serverPathRef.current = `storage/uploads/${file.name}`;

        await cameraApi.setSource(serverPathRef.current);
        onSourceChanged?.(file.name, null);
        onWatchingChanged?.(true);
        setNotice({
          text:
            "This browser cannot play that recording, so the AI system " +
            "is playing it on its side instead. The picture may lag behind.",
          tone: "info",
        });
      } catch (err) {
        report(err, "Could not review that recording.");
        setNotice({
          text:
            err?.response?.data?.detail ||
            "This browser cannot play that recording, and sending it to " +
              "the AI system did not finish. Check the connection and try again.",
          tone: "error",
        });
      } finally {
        setUpload(null);
        setWorking(false);
      }
    }
  };

  const handleToggleWatching = async () => {
    // Neither this device's camera nor a recording touches the server-side
    // capture pipeline: the browser holds the picture and pushes frames, so
    // nothing has to be streamed back.
    if ((selected === "browser" || selected === "video") && webcam) {
      if (webcam.active) {
        webcam.stop();
        return;
      }

      const started = await webcam.start();

      // Some browsers ship without the codec a recording was made with —
      // H.264 in particular is absent from several builds. Rather than leave
      // the operator on a dead page, hand it back to the server, which
      // decodes it and streams the result. Slower, and it works.
      if (started?.reason === "unplayable" && serverPathRef.current) {
        setWorking(true);

        try {
          await cameraApi.setSource(serverPathRef.current);
          onSourceChanged?.(sourceLabel || "Recording", null);
          onWatchingChanged?.(true);
          setNotice({
            text:
              "This browser cannot play that recording, so the AI system " +
              "is playing it on its side instead. The picture may lag behind.",
            tone: "info",
          });
        } catch (err) {
          report(err, "Could not review that recording.");
        } finally {
          setWorking(false);
        }
      }

      return;
    }

    setWorking(true);

    try {
      if (watching) {
        await cameraApi.stop();
      } else {
        await cameraApi.start();
      }

      onWatchingChanged?.(!watching);
    } catch (err) {
      report(
        err,
        watching ? "Could not stop." : "Could not start. Check the camera.",
      );
    } finally {
      setWorking(false);
    }
  };

  const active = SOURCES.find((s) => s.id === selected);
  const browserMode = selected === "browser";
  const browserOn = browserMode && Boolean(webcam?.active);

  // A recording under review runs through the same browser-side session as
  // this device's camera, so the toggle must read from the session either
  // way — judged only by the server's state, it said "Start watching"
  // while a recording was already playing.
  const reviewOn = selected === "video" && Boolean(webcam?.active);
  const running = browserOn || reviewOn || (!browserMode && watching);

  return (
    <Panel
      title="Camera"
      icon={Camera}
      action={
        connected ? (
          <Badge variant="success">Connected</Badge>
        ) : (
          <Badge variant="neutral">Not connected</Badge>
        )
      }
    >
      <div className="space-y-4">
        <fieldset className="space-y-2" disabled={disabled}>
          <legend className="text-xs font-medium text-text-secondary mb-2">
            Where should we look?
          </legend>

          <div className="grid grid-cols-2 gap-2">
            {SOURCES.map(({ id, label, icon: Icon, disabled: off }) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  // Leaving browser mode while it is running must release the
                  // camera and the socket. Without this they keep running with
                  // no visible control to stop them, and the camera light
                  // stays on.
                  if (selected === "browser" && id !== "browser") {
                    webcam?.stop();
                  }
                  setSelected(id);
                }}
                disabled={off || disabled}
                aria-pressed={selected === id}
                className={`flex flex-col items-start gap-1.5 rounded-lg border p-3 text-left
                  transition-colors disabled:opacity-40 disabled:cursor-not-allowed
                  ${
                    selected === id
                      ? "border-primary bg-primary-soft text-primary"
                      : "border-border text-text-secondary hover:bg-hover hover:border-border-strong"
                  }`}
              >
                <Icon size={16} aria-hidden="true" />
                <span className="text-xs font-medium leading-tight">
                  {label}
                </span>
              </button>
            ))}
          </div>

          {active?.hint && (
            <p className="text-xs text-text-muted pt-1">{active.hint}</p>
          )}
        </fieldset>

        {selected === "rtsp" && (
          <label className="block">
            <span className="block text-xs font-medium text-text-secondary mb-1.5">
              Camera address
            </span>
            <input
              className="input"
              placeholder="rtsp://192.168.1.10:554/stream"
              value={streamUrl}
              onChange={(e) => setStreamUrl(e.target.value)}
              disabled={disabled}
            />
            <span className="block text-xs text-text-muted mt-1.5">
              Ask your IT team for this address if you don't have it.
            </span>
          </label>
        )}

        <div className="flex items-center gap-2 pt-1">
          {!browserMode && (
            <Button
              variant="secondary"
              icon={selected === "video" ? Upload : Link2}
              onClick={handleConnect}
              loading={working}
              disabled={disabled}
              className="flex-1"
            >
              {selected === "video" ? "Choose file" : "Connect"}
            </Button>
          )}

          <Button
            variant={running ? "danger" : "primary"}
            icon={running ? Square : Play}
            onClick={handleToggleWatching}
            loading={
              (browserMode || selected === "video") && webcam?.connecting
            }
            disabled={disabled}
            className="flex-1"
          >
            {running ? "Stop" : "Start watching"}
          </Button>
        </div>

        {upload && (
          <div
            className="space-y-1.5 border-t border-border pt-3"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={upload.pct}
            aria-label={`Uploading ${upload.what}`}
          >
            <div className="flex items-center justify-between text-xs">
              <span className="text-text-secondary">
                {upload.pct < 100
                  ? `Uploading ${upload.what}…`
                  : "Upload complete — the AI system is processing…"}
              </span>
              <span className="font-semibold text-text tabular-nums">
                {upload.pct}%
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-subtle overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-200"
                style={{ width: `${upload.pct}%` }}
              />
            </div>
          </div>
        )}

        {browserMode && (
          <p className="text-xs text-text-muted border-t border-border pt-3">
            {browserOn ? (
              <>
                The AI is checking {webcam.stats.fps} pictures a second
                {webcam.stats.analysisMs > 0 && (
                  <>
                    {" · "}each answer takes about{" "}
                    {(
                      (webcam.stats.analysisMs + webcam.stats.networkMs) / 1000
                    ).toFixed(1)}{" "}
                    seconds
                  </>
                )}
              </>
            ) : (
              "Your browser will ask permission to use the camera. Pictures are sent to the AI for checking and are not stored."
            )}
          </p>
        )}

        {browserMode && webcam?.cameraIdentity && (
          <p className="text-xs text-text-secondary border-t border-border pt-3">
            Camera:{" "}
            <span className="font-medium text-text">
              {webcam.cameraIdentity.name}
            </span>{" "}
            — {webcam.cameraIdentity.location}
          </p>
        )}

        {!browserMode && sourceLabel && (
          <p className="text-xs text-text-secondary border-t border-border pt-3">
            Currently showing{" "}
            <span className="font-medium text-text">{sourceLabel}</span>
          </p>
        )}

        {notice && (
          <p
            role={notice.tone === "error" ? "alert" : undefined}
            className={`text-xs rounded-lg px-3 py-2 leading-relaxed border ${
              notice.tone === "error"
                ? "text-danger bg-danger-soft border-danger/30"
                : "text-text-secondary bg-subtle border-border"
            }`}
          >
            {notice.text}
          </p>
        )}

        {/* A camera-level setting, so it lives on the camera card: where
            this source's burned-in timestamp is, for the event clock. */}
        <TimestampAreaPanel webcam={webcam} serverWatching={connected} />

        {webcam?.pendingCamera && (
          <CameraRegistrationDialog
            camera={webcam.pendingCamera}
            onRegistered={(registration) =>
              webcam.resolvePendingCamera(registration)
            }
            onSkip={() => webcam.resolvePendingCamera(null)}
          />
        )}

        {pendingNetwork && (
          <CameraRegistrationDialog
            camera={pendingNetwork}
            onRegistered={() => {
              setPendingNetwork(null);
              connectNetwork();
            }}
            onSkip={() => {
              setPendingNetwork(null);
              connectNetwork();
            }}
          />
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="video/mp4,video/webm,video/x-msvideo,video/quicktime,video/x-matroska,video/*"
          className="hidden"
          onChange={handleFile}
        />
      </div>
    </Panel>
  );
}
