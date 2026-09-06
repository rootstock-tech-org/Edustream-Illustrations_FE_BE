import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Clock3, TriangleAlert, X } from "lucide-react";
import { Link } from "react-router-dom";

import Button from "../common/Button";

/**
 * How each camera-clock verdict reads on the card. The verdict words come
 * from the frame clock itself over the analysis socket (browser sources)
 * or /api/timestamp-clock/status (server sources).
 */
const CLOCK_BADGES = {
  valid: { icon: Check, tone: "text-success", label: "Clock detected — events carry the footage's own time" },
  checking: { icon: Clock3, tone: "text-text-muted", label: "Checking for a burned-in clock…" },
  unavailable: { icon: TriangleAlert, tone: "text-warning", label: "No usable camera clock" },
  invalid: { icon: TriangleAlert, tone: "text-warning", label: "Camera clock cannot be trusted" },
};

/**
 * Where this camera's burned-in timestamp is, marked by hand.
 *
 * The clock reader finds most overlays on its own — burned timestamps live
 * in the top or bottom strip and both are scanned — but a plant camera can
 * put its clock anywhere. This panel is for that camera: freeze a still,
 * drag one box over the timestamp, save. From then on the reader looks
 * exactly there, and marking again replaces the box.
 *
 * One box per camera, stored server-side against the camera source: every
 * browser camera shares one mark (the server cannot tell two browsers'
 * devices apart), a server-side source keeps its own. Clearing hands the
 * region back to auto-detection.
 *
 * The drag is a deliberate reduction of the doors editor: one rectangle,
 * draw to replace, nothing to select or move. The full editor earns its
 * complexity from many named regions; a single box does not.
 */
export default function TimestampAreaPanel({ webcam, serverWatching }) {
  const active = Boolean(webcam?.active) || Boolean(serverWatching);

  //: Which source bucket the mark belongs to, in the store's own terms.
  const source = webcam?.active ? "browser" : "__current__";

  const [saved, setSaved] = useState(null);
  const [still, setStill] = useState(null);
  const [box, setBox] = useState(null);
  const [drag, setDrag] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [serverClock, setServerClock] = useState(null);
  const surfaceRef = useRef(null);

  // The camera-clock verdict for whatever is feeding now. A browser
  // source says it on every analysis reply; a server source is polled —
  // gently — from the clock's status route.
  const clockStatus = webcam?.active
    ? webcam?.result?.camera_clock ?? null
    : serverWatching
      ? serverClock
      : null;

  useEffect(() => {
    if (!serverWatching || webcam?.active) {
      setServerClock(null);
      return undefined;
    }

    let stale = false;
    const ask = () => {
      fetch("/api/timestamp-clock/status")
        .then((r) => r.json())
        .then((body) => {
          if (stale) return;
          const clocks = body?.data?.clocks || [];
          setServerClock(clocks.length ? clocks[0].clock : null);
        })
        .catch(() => {});
    };
    ask();
    const timer = setInterval(ask, 5000);
    return () => {
      stale = true;
      clearInterval(timer);
    };
  }, [serverWatching, webcam?.active]);

  // What is already marked for this camera, read when the panel appears
  // and whenever the active source flips between browser and server.
  useEffect(() => {
    let stale = false;

    fetch(`/api/timestamp-clock/config?source=${encodeURIComponent(source)}`)
      .then((r) => r.json())
      .then((body) => {
        if (!stale) setSaved(body?.data?.box ?? null);
      })
      .catch(() => {});

    return () => {
      stale = true;
    };
  }, [source, active]);

  const beginMarking = useCallback(async () => {
    setMessage("");

    // A picture that stays put while the operator drags. The browser's own
    // camera never reaches the server, so its still is taken locally; a
    // server-side source answers from the frame it is holding right now.
    if (webcam?.active) {
      const url = webcam.snapshot?.();
      if (!url) {
        setMessage("No picture yet — wait for the camera to start.");
        return;
      }
      setStill(url);
    } else {
      try {
        // Raw JPEG bytes, deliberately uncached — the box must be drawn
        // over what the camera shows now.
        const reply = await fetch("/camera/freeze-frame");
        if (!reply.ok) throw new Error();
        const blob = await reply.blob();
        setStill(URL.createObjectURL(blob));
      } catch {
        setMessage("Could not fetch a still from the camera.");
        return;
      }
    }

    setBox(null);
  }, [webcam]);

  const stopMarking = useCallback(() => {
    setStill((old) => {
      // A server still is an object URL; give its memory back.
      if (old && old.startsWith("blob:")) URL.revokeObjectURL(old);
      return null;
    });
    setBox(null);
    setDrag(null);
  }, []);

  /** Pointer position as fractions of the still. */
  const fractions = (event) => {
    const rect = surfaceRef.current.getBoundingClientRect();
    return [
      Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    ];
  };

  const onPointerDown = (event) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const [x, y] = fractions(event);
    setDrag([x, y]);
    setBox([x, y, x, y]);
  };

  const onPointerMove = (event) => {
    if (!drag) return;
    const [x, y] = fractions(event);
    setBox([drag[0], drag[1], x, y]);
  };

  const onPointerUp = () => setDrag(null);

  const usable =
    box &&
    Math.abs(box[2] - box[0]) > 0.01 &&
    Math.abs(box[3] - box[1]) > 0.01;

  const save = useCallback(async () => {
    if (!usable) return;
    setBusy(true);
    setMessage("");

    try {
      const reply = await fetch("/api/timestamp-clock/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, box }),
      });
      const body = await reply.json();
      if (!reply.ok) throw new Error(body?.detail || "Could not save.");

      setSaved(body?.data?.box ?? box);
      setMessage("Saved — the clock reads exactly there now.");
      stopMarking();
    } catch (error) {
      setMessage(String(error.message || error));
    } finally {
      setBusy(false);
    }
  }, [box, source, stopMarking, usable]);

  const clear = useCallback(async () => {
    setBusy(true);
    setMessage("");

    try {
      await fetch("/api/timestamp-clock/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, box: null }),
      });
      setSaved(null);
      setMessage("Cleared — auto-detection takes over.");
    } catch {
      setMessage("Could not clear the marked area.");
    } finally {
      setBusy(false);
    }
  }, [source]);

  const badge = clockStatus ? CLOCK_BADGES[clockStatus] : null;
  const clockBad = clockStatus === "unavailable" || clockStatus === "invalid";

  return (
    <div className="border-t border-border pt-3 mt-3 space-y-2">
      <p className="text-xs font-medium text-text-secondary flex items-center gap-1.5">
        <Clock3 size={13} aria-hidden="true" />
        Timestamp area
      </p>

      {badge && (
        <p className={`text-xs flex items-center gap-1.5 ${badge.tone}`}>
          <badge.icon size={13} aria-hidden="true" />
          {badge.label}
        </p>
      )}

      {/* One active warning while the verdict stands — state, not a stream
          of alerts — resolved by the badge above turning green the moment
          a clock is read. */}
      {clockBad && (
        <div
          role="alert"
          className="text-xs rounded-lg px-3 py-2 leading-relaxed border text-text-secondary bg-subtle border-warning/40 space-y-1"
        >
          <p className="font-medium text-text flex items-center gap-1.5">
            <TriangleAlert size={13} className="text-warning" aria-hidden="true" />
            Camera clock not configured
          </p>
          <p>
            {clockStatus === "invalid"
              ? "The timestamp burned into this picture jumped backward and cannot be trusted."
              : "The system could not detect a valid camera timestamp."}{" "}
            Safety events from this camera currently use the system clock.
            Verify the camera clock before synchronising events with external
            systems.
          </p>
          <p>
            <Link to="/cameras" className="font-medium text-primary hover:underline">
              Review camera
            </Link>
          </p>
        </div>
      )}

      {still ? (
        <div className="space-y-2">
          <div
            ref={surfaceRef}
            className="relative rounded-lg overflow-hidden cursor-crosshair select-none touch-none"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          >
            <img
              src={still}
              alt="Still frame for marking the timestamp area"
              className="block w-full"
              draggable={false}
            />
            {box && (
              <div
                className="absolute border-2 border-primary bg-primary/15 pointer-events-none"
                style={{
                  left: `${Math.min(box[0], box[2]) * 100}%`,
                  top: `${Math.min(box[1], box[3]) * 100}%`,
                  width: `${Math.abs(box[2] - box[0]) * 100}%`,
                  height: `${Math.abs(box[3] - box[1]) * 100}%`,
                }}
              />
            )}
          </div>

          <p className="text-xs text-text-muted">
            Drag one box over the timestamp burned into the picture.
          </p>

          <div className="flex gap-2">
            <Button size="sm" variant="primary" onClick={save}
                    disabled={!usable || busy}>
              {busy ? "Saving…" : "Save area"}
            </Button>
            <Button size="sm" variant="secondary" icon={X}
                    onClick={stopMarking} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-text-muted">
            {saved
              ? "A timestamp area is marked for this camera — the clock reads exactly there."
              : "The clock scans the top and bottom of the picture on its own. Mark the exact spot if the timestamp lives somewhere else."}
          </p>

          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={beginMarking}
                    disabled={!active || busy}>
              {saved ? "Re-mark area" : "Mark timestamp area"}
            </Button>
            {saved && (
              <Button size="sm" variant="secondary" onClick={clear}
                      disabled={busy}>
                Clear
              </Button>
            )}
          </div>

          {!active && (
            <p className="text-[11px] text-text-muted">
              Start a camera first — the box is drawn over its live picture.
            </p>
          )}
        </div>
      )}

      {message && <p className="text-xs text-text-secondary">{message}</p>}
    </div>
  );
}
