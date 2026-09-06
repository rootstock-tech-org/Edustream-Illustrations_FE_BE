import { useEffect, useRef } from "react";

import {
  easingStep,
  leadAhead,
  reframe,
  retarget,
  SETTLED,
} from "./overlayMotion";

/**
 * Draws the findings over the live picture.
 *
 * The server used to paint the boxes onto each frame and send the picture
 * back, which meant the operator watched a slideshow of frames that had been
 * to the server and back — and the return trip was the larger half of the
 * exchange. Now the server sends only the shapes, and they are drawn here over
 * the camera's own smooth video.
 *
 * Two things are wrong with drawing an answer exactly as it arrives, and both
 * are fixed here.
 *
 * It arrives a few times a second, over video running at full frame rate, so
 * the shapes would jump between positions over a person moving continuously.
 * Each one eases towards its latest position instead.
 *
 * And it describes the scene as it was when the frame was taken, which on a
 * distant server is most of a second ago — long enough for a walking person to
 * leave their own outline behind them. Each shape is carried forward at the
 * speed it was last seen moving, by exactly the age of the answer it came
 * from, which puts it back on the person rather than in their wake.
 *
 * Coordinates arrive as fractions of the picture, so nothing has to agree on
 * a resolution — the same numbers work at any display size.
 *
 * A region carries a box, and where the model segments, an outline tracing the
 * subject itself. The outline is drawn in preference: it is unambiguous about
 * what was found and, against a marked area, about which side of the line the
 * person is on.
 */

const TONES = {
  ok: { stroke: "#16A34A", fill: "rgba(22,163,74,0.12)", text: "#FFFFFF" },
  danger: { stroke: "#DC2626", fill: "rgba(220,38,38,0.16)", text: "#FFFFFF" },
  warning: { stroke: "#D97706", fill: "rgba(217,119,6,0.14)", text: "#FFFFFF" },
  muted: { stroke: "#94A3B8", fill: "rgba(148,163,184,0.10)", text: "#FFFFFF" },
  neutral: { stroke: "#2563EB", fill: "rgba(37,99,235,0.12)", text: "#FFFFFF" },

  // Somebody is there and nothing was concluded about them. Amber like the
  // rest of the third state, and dashed — an unbroken line around a person
  // claims a judgement was made, which is the whole thing being fixed.
  // Without this entry an "unverified" tone would fall through to `neutral`
  // and be drawn as a confident blue box.
  unverified: { stroke: "#D97706", fill: "rgba(217,119,6,0.10)", text: "#FFFFFF" },
};

/** Tones drawn with a broken line, so shape carries the meaning too. */
const DASHED = new Set(["unverified"]);

export default function DetectionOverlay({
  regions = [],
  zones = [],
  size,
  capturedAt,
}) {
  const canvasRef = useRef(null);
  const tracksRef = useRef([]);
  const zonesRef = useRef(zones);
  const sizeRef = useRef(size);
  const runningRef = useRef(false);

  // Set by the frame loop below, so an answer arriving can wake it without
  // the loop having to sit spinning on the chance that one might.
  const startRef = useRef(null);

  // Latest answer becomes the position everything eases towards. Written in an
  // effect rather than during render: this is the frame loop's state, and the
  // loop reads it outside React's rendering entirely.
  useEffect(() => {
    // No timestamp means the caller cannot say how old this is, so it is
    // treated as describing now and carried forward by nothing.
    tracksRef.current = retarget(
      tracksRef.current,
      regions,
      capturedAt ?? performance.now(),
    );
    startRef.current?.();
  }, [regions, capturedAt]);

  useEffect(() => {
    zonesRef.current = zones;
    startRef.current?.();
  }, [zones]);

  useEffect(() => {
    sizeRef.current = size;
    startRef.current?.();
  }, [size]);

  useEffect(() => {
    let handle = 0;
    let previous = 0;

    const draw = (now) => {
      const elapsed = previous ? now - previous : 16;
      previous = now;

      const canvas = canvasRef.current;
      const view = sizeRef.current;

      if (!canvas || !view?.width || !view?.height) {
        handle = requestAnimationFrame(draw);
        return;
      }

      const step = easingStep(elapsed);

      let moving = false;

      tracksRef.current.forEach((track) => {
        const aim = leadAhead(track, now);

        for (let i = 0; i < 4; i += 1) {
          const gap = aim[i] - track.box[i];
          if (Math.abs(gap) > SETTLED) moving = true;
          track.box[i] += gap * step;
        }
      });

      // Drawn at device resolution so the lines are not soft on a retina
      // screen. Only resized when it has to be — assigning width or height
      // clears the canvas, even to the same value.
      const dpr = window.devicePixelRatio || 1;
      const pixelWidth = Math.round(view.width * dpr);
      const pixelHeight = Math.round(view.height * dpr);

      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }

      const ctx = canvas.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, view.width, view.height);

      drawZones(ctx, zonesRef.current, view);
      drawRegions(ctx, tracksRef.current, view);

      // Nothing left to animate: stop until the next answer wakes it, rather
      // than redrawing an unchanged picture sixty times a second. One last
      // frame has already been drawn above, so nothing is left half-moved.
      if (!moving) {
        runningRef.current = false;
        return;
      }

      handle = requestAnimationFrame(draw);
    };

    const start = () => {
      if (runningRef.current) return;
      runningRef.current = true;
      previous = 0;
      handle = requestAnimationFrame(draw);
    };

    startRef.current = start;
    start();

    return () => {
      startRef.current = null;
      cancelAnimationFrame(handle);
      runningRef.current = false;
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      style={{ width: size?.width, height: size?.height }}
      aria-hidden="true"
    />
  );
}

/** Marked areas. Drawn first, so a person standing in one is drawn on top. */
function drawZones(ctx, zones, view) {
  zones.forEach((zone) => {
    if (!zone.points?.length) return;

    const tone = TONES[zone.tone] ?? TONES.warning;

    ctx.beginPath();
    zone.points.forEach(([fx, fy], i) => {
      const x = fx * view.width;
      const y = fy * view.height;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();

    ctx.fillStyle = tone.fill;
    ctx.fill();

    // Dashed, so a marked area reads as a boundary rather than as another
    // detection. Both turn red when someone steps inside, and two identical
    // red rectangles would be one thing too many to tell apart at a glance.
    ctx.strokeStyle = tone.stroke;
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.stroke();
    ctx.setLineDash([]);

    // The zone's caption, at its highest corner: the name, with how long
    // somebody has been inside while somebody is. An alarm about "Loading
    // bay" needs the words on the picture too, or the operator is left
    // matching shapes to a list — and "how long" is the difference between
    // somebody passing through and somebody working in there.
    const caption =
      zone.occupied_seconds != null
        ? `${zone.name || `Zone ${zone.id ?? ""}`} · ${Math.round(zone.occupied_seconds)}s`
        : zone.name;

    if (caption) {
      let top = zone.points[0];
      for (const p of zone.points) if (p[1] < top[1]) top = p;

      const x = top[0] * view.width;
      const y = Math.max(14, top[1] * view.height - 6);

      ctx.font = "600 12px system-ui, sans-serif";
      ctx.fillStyle = tone.stroke;
      ctx.fillText(caption, x, y);
    }
  });
}

function drawRegions(ctx, tracks, view) {
  tracks.forEach(({ box, target }) => {
    const tone = TONES[target.tone] ?? TONES.neutral;

    const x = box[0] * view.width;
    const y = box[1] * view.height;
    const w = (box[2] - box[0]) * view.width;
    const h = (box[3] - box[1]) * view.height;

    ctx.strokeStyle = tone.stroke;
    ctx.lineWidth = target.tone === "muted" ? 1 : 2;
    ctx.setLineDash(DASHED.has(target.tone) ? [7, 5] : []);

    if (target.outline?.length >= 3) {
      // Traced round the subject itself. A rectangle says something was
      // found somewhere in this area; an outline says exactly what and
      // exactly where — and against a marked area, which side of the line
      // they are standing on.
      ctx.save();
      ctx.lineJoin = "round";
      ctx.beginPath();

      target.outline.forEach((point, i) => {
        const [ox, oy] = reframe(point, target.box, box);
        const px = ox * view.width;
        const py = oy * view.height;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });

      ctx.closePath();

      // Tinted more lightly than an area is. A marked area is empty floor,
      // but a person fills their own shape — and on a close camera that is
      // most of the picture, so a fill at the same strength would wash out
      // the very thing the operator is trying to look at.
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = tone.fill;
      ctx.fill();
      ctx.globalAlpha = 1;

      ctx.stroke();
      ctx.restore();
    } else {
      // No mask from this model, so the box is all there is.
      ctx.strokeRect(x, y, w, h);
    }

    if (!target.label) return;

    ctx.font = "600 12px system-ui, sans-serif";
    const padding = 5;
    const textWidth = ctx.measureText(target.label).width;
    const labelHeight = 20;

    // Above the box, unless that would be off the top of the picture.
    const labelY = y - labelHeight < 0 ? y : y - labelHeight;

    ctx.fillStyle = tone.stroke;
    ctx.fillRect(x, labelY, textWidth + padding * 2, labelHeight);

    ctx.fillStyle = tone.text;
    ctx.fillText(target.label, x + padding, labelY + 14);
  });
}
