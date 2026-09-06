import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Marking out doorways on a still frame.
 *
 * Rectangles rather than polygons: doors are rectangular, an operator will
 * draw several in a sitting, and dragging a box is far quicker than clicking
 * four corners each time. A door seen at a sharp angle is really a trapezoid,
 * so a rectangle takes in a little wall — which costs nothing, because a
 * detection is matched to a region by overlap rather than by fitting it.
 *
 * Coordinates are fractions of the picture, the same units the backend stores
 * and the live overlay draws in. Nothing here has to know the camera's
 * resolution, and a calibration made on one holds good on another.
 *
 * Controls
 * --------
 * Drag on empty space to draw a new doorway. Click one to select it. Drag a
 * selected one to move it, or its bottom-right corner to resize. Backspace or
 * Delete removes it, Escape deselects.
 */

const HANDLE = 12;

//: Smallest box worth keeping, as a fraction of the picture, when the module
//: being drawn has not said. Its own limits arrive as props and are preferred.
//:
//: This constant used to be the rule, with a comment claiming it matched the
//: backend's floor. That claim quietly became false the day the server gained
//: an area rule the canvas knew nothing about — leaving a band of boxes the
//: canvas drew happily and the server refused. A copied constant is only
//: correct until the original moves.
const FALLBACK_MIN_SIZE = 0.02;

const TONES = {
  idle: { stroke: "#2563EB", fill: "rgba(37,99,235,0.14)" },
  selected: { stroke: "#D97706", fill: "rgba(217,119,6,0.20)" },
  drawing: { stroke: "#16A34A", fill: "rgba(22,163,74,0.16)" },
};

export default function DoorCanvas({
  doors = [],
  selectedId = null,
  onSelect,
  onDraw,
  onMove,
  onDelete,
  displaySize,
  // What an unnamed area is called on the picture. The editor itself is
  // about rectangles somebody drew, and doorways were only the first thing
  // that needed them — workstations are marked out exactly the same way.
  fallbackLabel = "Door",
  // The limits of whatever is being drawn, as that module reports them, so
  // the canvas refuses exactly what the server would rather than its own
  // approximation of it. Absent — an older backend — it falls back.
  minSide,
  minArea,
}) {
  const canvasRef = useRef(null);
  const [drag, setDrag] = useState(null);

  const width = displaySize?.width ?? 0;
  const height = displaySize?.height ?? 0;

  /** Pointer position as a fraction of the picture. */
  const toFraction = useCallback(
    (event) => {
      const box = canvasRef.current?.getBoundingClientRect();
      if (!box || !box.width || !box.height) return null;

      return {
        x: Math.min(Math.max((event.clientX - box.left) / box.width, 0), 1),
        y: Math.min(Math.max((event.clientY - box.top) / box.height, 0), 1),
      };
    },
    [],
  );

  /** The door under this point, topmost first, or null. */
  const hit = useCallback(
    (point) => {
      for (let i = doors.length - 1; i >= 0; i -= 1) {
        const [x1, y1, x2, y2] = doors[i].box;
        if (point.x >= x1 && point.x <= x2 && point.y >= y1 && point.y <= y2) {
          return doors[i];
        }
      }
      return null;
    },
    [doors],
  );

  /** Is this point on the selected door's resize corner? */
  const onHandle = useCallback(
    (point) => {
      const door = doors.find((d) => d.id === selectedId);
      if (!door || !width || !height) return false;

      const [, , x2, y2] = door.box;
      const reach = HANDLE / Math.min(width, height);

      return (
        Math.abs(point.x - x2) <= reach && Math.abs(point.y - y2) <= reach
      );
    },
    [doors, selectedId, width, height],
  );

  // --- drawing ---------------------------------------------------------

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !width || !height) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);

    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const paint = (box, tone, label) => {
      const x = box[0] * width;
      const y = box[1] * height;
      const w = (box[2] - box[0]) * width;
      const h = (box[3] - box[1]) * height;

      ctx.fillStyle = tone.fill;
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = tone.stroke;
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);

      if (label) {
        ctx.font = "600 12px system-ui, sans-serif";
        const textWidth = ctx.measureText(label).width;
        const top = y - 20 < 0 ? y : y - 20;

        ctx.fillStyle = tone.stroke;
        ctx.fillRect(x, top, textWidth + 10, 20);
        ctx.fillStyle = "#FFFFFF";
        ctx.fillText(label, x + 5, top + 14);
      }
    };

    doors.forEach((door, index) => {
      const chosen = door.id === selectedId;
      paint(
        door.box,
        chosen ? TONES.selected : TONES.idle,
        door.name || `${fallbackLabel} ${index + 1}`,
      );

      if (!chosen) return;

      // The one handle that makes resizing possible without building a full
      // shape editor: grab the corner, drag, done.
      const hx = door.box[2] * width;
      const hy = door.box[3] * height;

      ctx.fillStyle = TONES.selected.stroke;
      ctx.fillRect(hx - HANDLE / 2, hy - HANDLE / 2, HANDLE, HANDLE);
      ctx.strokeStyle = "#FFFFFF";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(hx - HANDLE / 2, hy - HANDLE / 2, HANDLE, HANDLE);
    });

    if (drag?.box) paint(drag.box, TONES.drawing, `New ${fallbackLabel.toLowerCase()}`);
  }, [doors, selectedId, drag, width, height, fallbackLabel]);

  // --- pointer ---------------------------------------------------------

  const onPointerDown = (event) => {
    const point = toFraction(event);
    if (!point) return;

    event.currentTarget.setPointerCapture?.(event.pointerId);

    if (onHandle(point)) {
      const door = doors.find((d) => d.id === selectedId);
      setDrag({ mode: "resize", id: door.id, box: [...door.box] });
      return;
    }

    const existing = hit(point);

    if (existing) {
      onSelect?.(existing.id);
      setDrag({
        mode: "move",
        id: existing.id,
        box: [...existing.box],
        from: point,
        origin: [...existing.box],
      });
      return;
    }

    onSelect?.(null);
    setDrag({ mode: "draw", from: point, box: [point.x, point.y, point.x, point.y] });
  };

  const onPointerMove = (event) => {
    if (!drag) return;

    const point = toFraction(event);
    if (!point) return;

    if (drag.mode === "draw") {
      setDrag({ ...drag, box: [drag.from.x, drag.from.y, point.x, point.y] });
      return;
    }

    if (drag.mode === "resize") {
      setDrag({
        ...drag,
        box: [drag.box[0], drag.box[1], point.x, point.y],
      });
      return;
    }

    // Moving: shift by how far the pointer has travelled, clamped so a door
    // cannot be pushed off the picture and lost.
    const dx = point.x - drag.from.x;
    const dy = point.y - drag.from.y;
    const [ox1, oy1, ox2, oy2] = drag.origin;

    const shiftX = Math.min(Math.max(dx, -ox1), 1 - ox2);
    const shiftY = Math.min(Math.max(dy, -oy1), 1 - oy2);

    setDrag({
      ...drag,
      box: [ox1 + shiftX, oy1 + shiftY, ox2 + shiftX, oy2 + shiftY],
    });
  };

  const onPointerUp = () => {
    if (!drag) return;

    const box = tidy(drag.box);
    const side = typeof minSide === "number" ? minSide : FALLBACK_MIN_SIZE;
    const width = box[2] - box[0];
    const height = box[3] - box[1];
    const usable =
      width >= side &&
      height >= side &&
      (typeof minArea !== "number" || width * height >= minArea);

    if (drag.mode === "draw") {
      // A click that was not a drag is a deselect, not a doorway the size of
      // a full stop.
      if (usable) onDraw?.(box);
    } else if (usable) {
      onMove?.(drag.id, box);
    }

    setDrag(null);
  };

  // --- keyboard --------------------------------------------------------

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        onSelect?.(null);
        return;
      }

      if (selectedId === null) return;

      if (event.key === "Backspace" || event.key === "Delete") {
        // Not while typing a door's name in the panel beside this.
        const tag = document.activeElement?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;

        event.preventDefault();
        onDelete?.(selectedId);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedId, onSelect, onDelete]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{ width, height }}
      className="absolute inset-0 touch-none cursor-crosshair"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      aria-label="Mark the doorways on the picture"
    />
  );
}

/** Corners in order, whichever way the drag went. */
function tidy(box) {
  const [x1, y1, x2, y2] = box;
  const [left, right] = x1 <= x2 ? [x1, x2] : [x2, x1];
  const [top, bottom] = y1 <= y2 ? [y1, y2] : [y2, y1];

  return [
    Math.min(Math.max(left, 0), 1),
    Math.min(Math.max(top, 0), 1),
    Math.min(Math.max(right, 0), 1),
    Math.min(Math.max(bottom, 0), 1),
  ];
}
