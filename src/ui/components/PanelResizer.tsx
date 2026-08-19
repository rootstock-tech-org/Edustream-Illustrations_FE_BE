'use client';
import { useCallback, useRef } from 'react';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const STEP = 16;

/**
 * Drag handle between two panels. `grow` says which way the pointer must move
 * to make the measured panel wider: 'right' for a left-hand panel, 'left' for a
 * right-hand panel. Pointer capture keeps the drag alive over the 3D canvas,
 * which would otherwise swallow the move events.
 */
export function PanelResizer({
  value,
  min,
  max,
  onChange,
  grow,
  label,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
  grow: 'left' | 'right';
  label: string;
}) {
  const start = useRef({ x: 0, v: 0 });

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      start.current = { x: e.clientX, v: value };
    },
    [value],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
      const dx = e.clientX - start.current.x;
      onChange(clamp(start.current.v + (grow === 'right' ? dx : -dx), min, max));
    },
    [grow, max, min, onChange],
  );

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  }, []);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const dir = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
      if (!dir) return;
      e.preventDefault();
      onChange(clamp(value + dir * STEP * (grow === 'right' ? 1 : -1), min, max));
    },
    [grow, max, min, onChange, value],
  );

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={Math.round(value)}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={() => onChange(clamp(Math.round((min + max) / 2), min, max))}
      onKeyDown={onKeyDown}
      title={`${label} — drag, or focus and use ← →`}
      className="group relative hidden cursor-col-resize touch-none select-none md:block"
    >
      {/* hairline that thickens on hover/focus; the hit area is the full column */}
      <span className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 rounded-full bg-[color:var(--hairline)] transition-all group-hover:w-[3px] group-hover:bg-accent group-focus-visible:w-[3px] group-focus-visible:bg-accent" />
    </div>
  );
}
