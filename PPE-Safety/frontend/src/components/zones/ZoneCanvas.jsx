import { useCallback, useEffect, useRef, useState } from "react";

import { overlay as overlayColors } from "../../theme/colors";

/**
 * Polygon drawing surface, laid over a still frame.
 *
 * Coordinate spaces
 * -----------------
 * Points are stored in the *camera's own* pixel space, because that is where
 * the backend applies them: it fills the zone mask at the frame's native size.
 * The canvas is however large the picture happens to be rendered, so every
 * point is converted on the way in and on the way out.
 *
 * The previous implementation stored points against a hardcoded 640x480,
 * which silently misplaced the zone on any camera that was not exactly that
 * size — a 1080p camera would have its zone drawn in the top-left third of
 * the frame. `frameSize` now comes from the image's natural dimensions.
 *
 * Controls: click to add a point, double-click to close (3 points minimum),
 * Backspace or Ctrl+Z to undo, Escape to start over.
 */
export default function ZoneCanvas({
  active,
  points,
  setPoints,
  closed,
  onClose,
  displaySize,
  onFrameSize,
}) {
  const canvasRef = useRef(null);
  const [cursor, setCursor] = useState(null);

  const width = displaySize?.width ?? 0;
  const height = displaySize?.height ?? 0;

  // Native camera resolution. Falls back to the displayed size so the canvas
  // still behaves sensibly before the image has reported its dimensions.
  const frameWidth = displaySize?.naturalWidth || width || 1;
  const frameHeight = displaySize?.naturalHeight || height || 1;

  /** display px -> camera px */
  const toFrame = useCallback(
    (x, y) => ({
      x: (x / width) * frameWidth,
      y: (y / height) * frameHeight,
    }),
    [width, height, frameWidth, frameHeight],
  );

  /** camera px -> display px */
  const toDisplay = useCallback(
    (point) => ({
      x: (point.x / frameWidth) * width,
      y: (point.y / frameHeight) * height,
    }),
    [width, height, frameWidth, frameHeight],
  );

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!points.length) return;

    const scaled = points.map(toDisplay);

    ctx.beginPath();
    ctx.moveTo(scaled[0].x, scaled[0].y);
    scaled.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));

    if (!closed && cursor) ctx.lineTo(cursor.x, cursor.y);

    if (closed) {
      ctx.closePath();
      ctx.fillStyle = overlayColors.zoneFill;
      ctx.fill();
    }

    ctx.strokeStyle = overlayColors.zoneStroke;
    ctx.lineWidth = 2;
    ctx.stroke();

    scaled.forEach((p, i) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
      ctx.fillStyle = overlayColors.zoneVertex;
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = overlayColors.zoneStroke;
      ctx.stroke();

      // Number the vertices so an operator can see the drawing order.
      ctx.fillStyle = overlayColors.zoneStroke;
      ctx.font = "600 11px system-ui, sans-serif";
      ctx.fillText(String(i + 1), p.x + 9, p.y - 9);
    });

    if (!closed && cursor) {
      ctx.beginPath();
      ctx.arc(cursor.x, cursor.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = overlayColors.cursor;
      ctx.fill();
    }
  }, [points, closed, cursor, toDisplay]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !width || !height) return;

    canvas.width = width;
    canvas.height = height;
    draw();
  }, [width, height, draw]);

  useEffect(() => {
    draw();
  }, [draw]);

  // Report the camera's own size upward, so the area can be saved with the
  // picture size its coordinates belong to.
  useEffect(() => {
    if (!displaySize?.naturalWidth || !displaySize?.naturalHeight) return;

    onFrameSize?.({
      width: displaySize.naturalWidth,
      height: displaySize.naturalHeight,
    });
  }, [displaySize?.naturalWidth, displaySize?.naturalHeight, onFrameSize]);

  useEffect(() => {
    if (!active) return;

    const onKeyDown = (e) => {
      if (e.key === "Backspace" || (e.ctrlKey && e.key.toLowerCase() === "z")) {
        e.preventDefault();
        setPoints((prev) => prev.slice(0, -1));
      }

      if (e.key === "Escape") {
        setPoints([]);
        setCursor(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, setPoints]);

  const localPosition = (event) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  };

  const handleClick = (event) => {
    if (!active || closed) return;

    const { x, y } = localPosition(event);
    setPoints((prev) => [...prev, toFrame(x, y)]);
  };

  const handleMove = (event) => {
    if (!active || closed) return;
    setCursor(localPosition(event));
  };

  const handleDoubleClick = () => {
    if (!active || closed || points.length < 3) return;
    setCursor(null);
    onClose?.();
  };

  return (
    <canvas
      ref={canvasRef}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onMouseMove={handleMove}
      onMouseLeave={() => setCursor(null)}
      className={`absolute inset-0 ${
        active ? "cursor-crosshair" : "pointer-events-none"
      }`}
      style={{ width, height }}
    />
  );
}
