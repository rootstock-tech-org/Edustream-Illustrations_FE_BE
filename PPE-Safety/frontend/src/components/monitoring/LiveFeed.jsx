import { useCallback, useEffect, useRef, useState } from "react";
import { EyeOff, Maximize2, VideoOff } from "lucide-react";

import Badge from "../common/Badge";
import Button from "../common/Button";
import DetectionOverlay from "./DetectionOverlay";
import colors from "../../theme/colors";
import { UNVERIFIED_LABEL } from "./legibility";

/**
 * Live view, shared by every monitoring module.
 *
 * The picture comes from one of two places. A network camera is streamed by
 * the server as MJPEG, which browsers render natively in an <img>. The operator's
 * own camera is shown directly from the device in a <video>, because sending
 * it to the server and waiting for the picture back would cost a round trip
 * per frame for a picture the browser already has.
 *
 * Either way the findings arrive separately as `findings` and are drawn over
 * the top, so what the operator watches stays smooth regardless of how often
 * the analysis comes back.
 *
 * What this component owns is the frame around all that: the connection
 * state, the status overlay, going fullscreen, and tracking the displayed
 * size so overlays sit on the picture rather than the letterbox around it.
 *
 * `overlay` is a render prop receiving the measured display size, used by the
 * restricted zone to draw its polygon. Modules that only watch pass nothing.
 *
 * `unverified` marks the picture as one the AI could not judge. It is drawn
 * over the picture rather than beside it, because the picture is the thing
 * being disclaimed — an operator looking at a dark frame with clean green
 * boxes on it has been told something false.
 */
export default function LiveFeed({
  streamUrl,
  mediaStream,
  findings,
  connected = false,
  watching = false,
  alert = false,
  statusLabel,
  stats,
  overlay,
  frozenUrl,
  unverified = false,
  unverifiedReason,
  minHeight = 460,
}) {
  const containerRef = useRef(null);
  const imageRef = useRef(null);
  const videoRef = useRef(null);

  const [displaySize, setDisplaySize] = useState({ width: 0, height: 0 });
  const [failed, setFailed] = useState(false);

  // The device's own camera is shown directly rather than round-tripped
  // through the server: full frame rate, no latency, and the findings are
  // drawn over it as they arrive.
  const live = Boolean(mediaStream) && !frozenUrl;

  const showing = live || Boolean(streamUrl || frozenUrl);
  const source = frozenUrl || streamUrl;

  // Measure the rendered picture, not the element. object-contain letterboxes,
  // so the element is usually larger than the image inside it and an overlay
  // aligned to the element would sit off the picture.
  // Wrapped so the resize listener below can depend on it: `measure` reads
  // `live`, so a listener that captured the first render's version would go
  // on measuring the <img> after the view had switched to the <video>.
  const measure = useCallback(() => {
    // A successful load clears any previous failure, so the error state does
    // not need an effect to reset it when the source changes.
    setFailed(false);

    const el = live ? videoRef.current : imageRef.current;
    if (!el) return;

    const naturalWidth = live ? el.videoWidth : el.naturalWidth;
    const naturalHeight = live ? el.videoHeight : el.naturalHeight;
    if (!naturalWidth) return;

    const box = el.getBoundingClientRect();
    const scale = Math.min(
      box.width / naturalWidth,
      box.height / naturalHeight,
    );

    setDisplaySize({
      width: naturalWidth * scale,
      height: naturalHeight * scale,
      naturalWidth,
      naturalHeight,
    });
  }, [live]);

  useEffect(() => {
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  // Depends on `live` as well as the stream: showing a still swaps the <video>
  // out for an <img>, and coming back mounts a *new* video element. Keyed on
  // the stream alone this would not re-run, leaving that new element with no
  // source — a black picture with the findings still drawn over it.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !mediaStream) return;

    if (video.srcObject !== mediaStream) video.srcObject = mediaStream;

    video.play().catch(() => {
      // A browser refusing to autoplay a muted local stream is rare and not
      // worth an error message; the picture simply stays black.
    });
  }, [mediaStream, live]);

  const toggleFullscreen = async () => {
    const el = containerRef.current;
    if (!el) return;

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await el.requestFullscreen();
      }
    } catch {
      // Fullscreen is a convenience; a browser refusing it is not an error
      // worth surfacing to an operator.
    }
  };

  return (
    <div className="bg-surface border border-border rounded-xl shadow-panel overflow-hidden flex flex-col">
      <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          {alert ? (
            <Badge variant="danger" pulse>
              {statusLabel || "Action required"}
            </Badge>
          ) : unverified ? (
            // Deliberately not `statusLabel`: a page showing a checked photo
            // passes "Checked photo", and "Checked" is the one word this
            // picture has no right to.
            <Badge variant="warning">{UNVERIFIED_LABEL}</Badge>
          ) : watching ? (
            <Badge variant="success">{statusLabel || "Watching"}</Badge>
          ) : (
            <Badge variant="neutral">{statusLabel || "Not watching"}</Badge>
          )}

          {stats?.map(({ label, value }) => (
            <Badge key={label} variant="neutral" dot={false}>
              {label} {value}
            </Badge>
          ))}
        </div>

        <Button
          variant="ghost"
          size="sm"
          icon={Maximize2}
          onClick={toggleFullscreen}
          aria-label="Toggle fullscreen"
        />
      </div>

      <div
        ref={containerRef}
        className="relative flex-1 bg-slate-900 flex items-center justify-center"
        style={{ minHeight }}
      >
        {showing && !failed ? (
          <div
            className="relative"
            style={
              displaySize.width
                ? { width: displaySize.width, height: displaySize.height }
                : { width: "100%", height: "100%" }
            }
          >
            {live ? (
              <video
                ref={videoRef}
                muted
                playsInline
                aria-label="Live view"
                className="block w-full h-full object-contain"
                onLoadedMetadata={measure}
                onResize={measure}
              />
            ) : (
              <img
                ref={imageRef}
                src={source}
                alt={frozenUrl ? "Still frame for marking an area" : "Live view"}
                className="block w-full h-full object-contain"
                onLoad={measure}
                onError={() => setFailed(true)}
              />
            )}

            {/* Findings from the server, drawn here rather than painted into
                the picture and sent back. */}
            {findings && displaySize.width > 0 && (
              <DetectionOverlay
                regions={findings.regions}
                zones={findings.zones}
                capturedAt={findings.capturedAt}
                size={displaySize}
              />
            )}

            {/* Module-specific drawing, e.g. marking out a zone. */}
            {overlay?.(displaySize)}

            {/* Nothing was concluded from this picture. Drawn over it, and
                over any findings on it, because a dark frame with tidy boxes
                on it is exactly how an operator comes to believe a scene was
                checked. Hatched rather than dimmed: the operator still needs
                to see what is wrong with the picture in order to fix it. */}
            {unverified && (
              <div className="absolute inset-0 flex flex-col justify-end pointer-events-none">
                <div
                  className="absolute inset-0"
                  aria-hidden="true"
                  style={{
                    background: `repeating-linear-gradient(45deg, ${colors.warning}22 0 8px, transparent 8px 22px)`,
                  }}
                />
                <div
                  className="absolute inset-0 border-2 border-dashed"
                  aria-hidden="true"
                  style={{ borderColor: colors.warning }}
                />

                <div className="relative p-3 flex justify-center">
                  <p
                    role="status"
                    className="inline-flex items-start gap-2 max-w-[95%] rounded-lg
                               bg-warning-soft border border-warning/40 text-warning
                               px-3 py-2 text-xs font-semibold shadow-overlay"
                  >
                    <EyeOff size={14} className="shrink-0 mt-px" aria-hidden="true" />
                    <span>
                      {UNVERIFIED_LABEL}
                      {unverifiedReason ? ` — ${unverifiedReason}` : ""}
                    </span>
                  </p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 text-slate-400 px-6 text-center">
            <VideoOff size={34} aria-hidden="true" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-slate-200">
                {failed ? "Lost the picture" : "No camera connected"}
              </p>
              <p className="text-xs">
                {failed
                  ? "The camera stopped sending. Try starting it again."
                  : connected
                    ? "Press Start watching to see the live view."
                    : "Choose a camera on the right to begin."}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
