/*
 * Process discipline symbol library (Illustration Rulebook §15 · ISA-5.1 / ISO 10628).
 * Each symbol is a pure function drawn on a local origin at the component centre,
 * outline at W4, no fill (canvas), so it reads with all fills removed (§5.2).
 * These are recognised symbols, not labelled boxes (§5.1).
 */
import { C, W, TYPE } from '../tokens';

// Rotating machine — motor: a circle with 'M' (IEC 60617). r = 24 du.
export function Motor({ cx, cy, r = 24 }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={C.canvas} stroke={C.structure} strokeWidth={W.W4} />
      <text x={cx} y={cy + 5} textAnchor="middle" fontFamily={TYPE.label.font} fontSize={16} fontWeight={700} fill={C.structure}>
        M
      </text>
    </g>
  );
}

// Centrifugal pump (ISO 10628): circle casing with an impeller triangle whose
// apex points to the discharge (right). Suction enters at the bottom.
export function Pump({ cx, cy, r = 24 }) {
  const tri = `${cx - r * 0.55},${cy - r * 0.5} ${cx - r * 0.55},${cy + r * 0.5} ${cx + r * 0.6},${cy}`;
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={C.canvas} stroke={C.structure} strokeWidth={W.W4} />
      <polygon points={tri} fill="none" stroke={C.structure} strokeWidth={W.W3} strokeLinejoin="miter" />
    </g>
  );
}

// Coupling between motor shaft and pump — two short flanges on the shaft.
export function Coupling({ cx, cy }) {
  return (
    <g stroke={C.structure} strokeWidth={W.W3}>
      <line x1={cx - 4} y1={cy - 8} x2={cx - 4} y2={cy + 8} />
      <line x1={cx + 4} y1={cy - 8} x2={cx + 4} y2={cy + 8} />
    </g>
  );
}

// Pedestal / plummer-block bearing on the drive train (a small housing on the shaft).
export function Bearing({ cx, cy }) {
  return (
    <g stroke={C.structure} strokeWidth={W.W3} fill={C.canvas}>
      <rect x={cx - 10} y={cy - 6} width={20} height={12} />
      <line x1={cx - 10} y1={cy + 6} x2={cx + 10} y2={cy + 6} strokeWidth={W.W4} />
    </g>
  );
}

// ISA-5.1 field instrument bubble: a circle (field-mounted = plain, no bar) with a
// two-line tag — letters over number. r = 18 du, outline at instrument weight W3.
export function Instrument({ cx, cy, letters, number, r = 16, state }) {
  const stroke = state && state.color ? state.color : C.structure;
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={C.canvas} stroke={stroke} strokeWidth={W.W3} />
      <text x={cx} y={cy - 1} textAnchor="middle" fontFamily={TYPE.tag.font} fontSize={10} fontWeight={600} fill={C.structure} letterSpacing="0.02em">
        {letters}
      </text>
      <text x={cx} y={cy + 11} textAnchor="middle" fontFamily={TYPE.tag.font} fontSize={10} fill={C.inactive}>
        {number}
      </text>
    </g>
  );
}

// A boundary port at the frame edge: a filled triangle across the edge + a tag (§5.6).
export function BoundaryPort({ x, y, dir = 'in', side = 'left', tag }) {
  const L = 10;
  // triangle points across the frame edge in the flow direction
  const pts =
    side === 'left'
      ? `${x - L},${y - 5} ${x - L},${y + 5} ${x},${y}`
      : side === 'right'
        ? `${x + L},${y - 5} ${x + L},${y + 5} ${x},${y}`
        : `${x - 5},${y + L} ${x + 5},${y + L} ${x},${y}`;
  return (
    <g>
      <polygon points={pts} fill={C.inactive} stroke="none" />
      {tag && (
        <text
          x={side === 'right' ? x + L + 4 : x - L - 4}
          y={side === 'bottom' ? y + L + 12 : y + 3}
          textAnchor={side === 'right' ? 'start' : side === 'bottom' ? 'middle' : 'end'}
          fontFamily={TYPE.tag.font}
          fontSize={TYPE.tag.size}
          fill={C.inactive}
        >
          {tag}
        </text>
      )}
    </g>
  );
}
