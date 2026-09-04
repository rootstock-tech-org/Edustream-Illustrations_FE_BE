/*
 * Smart Factory — Illustration primitives (Illustration Rulebook §5, §6, §9).
 * Pure SVG building blocks shared by every figure. Each is a pure function of its
 * props (no state, no physics, no Math.random) and reads geometry from tokens.js
 * and colors from CSS variables, so a figure is deterministic and theme-swappable.
 */
import { C, W, GRID, DASH, MEDIUM, TYPE } from './tokens';

/* ---- helpers ---------------------------------------------------------------- */

// A point a fraction (0..1) along an orthogonal/straight polyline, plus the local
// angle — used to place flow arrowheads at 25% and 75% (§5.8).
function pointAlong(points, frac) {
  const segs = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1];
    const [bx, by] = points[i];
    const len = Math.hypot(bx - ax, by - ay);
    segs.push({ ax, ay, bx, by, len });
    total += len;
  }
  let target = total * frac;
  for (const s of segs) {
    if (target <= s.len || s === segs[segs.length - 1]) {
      const t = s.len === 0 ? 0 : target / s.len;
      return { x: s.ax + (s.bx - s.ax) * t, y: s.ay + (s.by - s.ay) * t, angle: Math.atan2(s.by - s.ay, s.bx - s.ax) };
    }
    target -= s.len;
  }
  return { x: points[0][0], y: points[0][1], angle: 0 };
}

/* ---- defs: hatches + nothing that isn't fixed (§7.4) ------------------------ */

export function Defs() {
  return (
    <defs>
      <pattern id="h45" width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
        <line x1="0" y1="0" x2="0" y2="6" stroke="#767e95" strokeWidth="0.5" opacity="0.35" />
      </pattern>
      <pattern id="h135" width="6" height="6" patternTransform="rotate(135)" patternUnits="userSpaceOnUse">
        <line x1="0" y1="0" x2="0" y2="6" stroke="#767e95" strokeWidth="0.5" opacity="0.35" />
      </pattern>
      <pattern id="cross" width="6" height="6" patternUnits="userSpaceOnUse">
        <path d="M0 0 L6 6 M6 0 L0 6" stroke="#767e95" strokeWidth="0.5" opacity="0.35" fill="none" />
      </pattern>
      <pattern id="dot" width="6" height="6" patternUnits="userSpaceOnUse">
        <circle cx="3" cy="3" r="0.7" fill="#767e95" opacity="0.35" />
      </pattern>
    </defs>
  );
}

/* ---- L0 canvas + L1 grid ---------------------------------------------------- */

// Canvas fill + safe-area inset (§6.1). Square corners on the frame (§5.4).
export function Frame({ w, h }) {
  return (
    <g id="L0-canvas">
      <rect x="0" y="0" width={w} height={h} fill={C.canvas} />
      <rect
        x={GRID.safe}
        y={GRID.safe}
        width={w - GRID.safe * 2}
        height={h - GRID.safe * 2}
        fill="none"
        stroke={C.hairline}
        strokeWidth={W.W0}
      />
    </g>
  );
}

// 8 du construction dots (§6.2). Toggleable layer; suppressed on physical views.
export function Grid({ w, h, step = GRID.base }) {
  const dots = [];
  for (let x = GRID.safe; x <= w - GRID.safe; x += step) {
    for (let y = GRID.safe; y <= h - GRID.safe; y += step) {
      dots.push(<circle key={`${x}-${y}`} cx={x} cy={y} r="0.4" fill={C.hairline} opacity="0.35" />);
    }
  }
  return <g id="L1-grid">{dots}</g>;
}

/* ---- L3 media: wires with flow direction (§5.8) ---------------------------- */

// Filled arrowhead triangle, length 8, half-width 3 (§6.4).
function Arrowhead({ x, y, angle, color }) {
  const L = 8;
  const hw = 3;
  const tip = [x + Math.cos(angle) * (L / 2), y + Math.sin(angle) * (L / 2)];
  const back = [x - Math.cos(angle) * (L / 2), y - Math.sin(angle) * (L / 2)];
  const perp = [Math.cos(angle + Math.PI / 2) * hw, Math.sin(angle + Math.PI / 2) * hw];
  const p = `${tip[0]},${tip[1]} ${back[0] + perp[0]},${back[1] + perp[1]} ${back[0] - perp[0]},${back[1] - perp[1]}`;
  return <polygon points={p} fill={color} stroke="none" />;
}

// A link between ports. `medium` picks color/weight/dash (§7.2). Directional links
// carry arrowheads at 25% and 75% (§5.8). `flow` animates dashes (§11) later.
export function Wire({ points, medium = 'signal', directional = true, color, width, dash }) {
  const m = MEDIUM[medium] || MEDIUM.signal;
  const stroke = color || m.stroke;
  const sw = width || m.width;
  const d = dash !== undefined ? dash : m.dash;
  const poly = points.map((p) => p.join(',')).join(' ');
  const a1 = directional ? pointAlong(points, 0.25) : null;
  const a2 = directional ? pointAlong(points, 0.75) : null;
  return (
    <g>
      <polyline
        points={poly}
        fill="none"
        stroke={stroke}
        strokeWidth={sw}
        strokeDasharray={d}
        strokeLinecap="butt"
        strokeLinejoin="miter"
      />
      {a1 && <Arrowhead x={a1.x} y={a1.y} angle={a1.angle} color={stroke} />}
      {a2 && <Arrowhead x={a2.x} y={a2.y} angle={a2.angle} color={stroke} />}
    </g>
  );
}

/* ---- L4 components: ports + junctions (§6.4) ------------------------------- */

// Connected = solid navy square; unconnected = open square (§6.4).
export function Port({ x, y, connected = true, tag }) {
  const s = 6;
  return (
    <g>
      <rect
        x={x - s / 2}
        y={y - s / 2}
        width={s}
        height={s}
        fill={connected ? C.structure : C.canvas}
        stroke={connected ? C.structure : C.primary}
        strokeWidth={W.W2}
      />
      {tag && (
        <text x={x + 6} y={y + 3} fontFamily={TYPE.tag.font} fontSize={TYPE.tag.size} fill={C.inactive} letterSpacing={TYPE.tag.spacing}>
          {tag}
        </text>
      )}
    </g>
  );
}

// Solid junction dot where 3+ conductors meet (§5.7).
export function Node({ x, y, color = C.primary }) {
  return <circle cx={x} cy={y} r="3" fill={color} />;
}

/* ---- L6 annotation: dimensions, callouts, legend (§9) ---------------------- */

// Horizontal or vertical dimension line with extension lines + knockout text (§9.1).
export function Dimension({ x1, y1, x2, y2, text, offset = 24 }) {
  const horizontal = y1 === y2;
  const dy = horizontal ? -offset : 0;
  const dx = horizontal ? 0 : offset;
  const midX = (x1 + x2) / 2 + dx;
  const midY = (y1 + y2) / 2 + dy;
  const tw = String(text).length * 6 + 4;
  return (
    <g stroke={C.inactive} strokeWidth={W.W1}>
      {/* extension lines */}
      <line x1={x1} y1={y1} x2={x1 + dx} y2={y1 + dy} />
      <line x1={x2} y1={y2} x2={x2 + dx} y2={y2 + dy} />
      {/* dimension line */}
      <line x1={x1 + dx} y1={y1 + dy} x2={x2 + dx} y2={y2 + dy} />
      <Arrowhead x={x1 + dx} y={y1 + dy} angle={horizontal ? 0 : Math.PI / 2} color={C.inactive} />
      <Arrowhead x={x2 + dx} y={y2 + dy} angle={horizontal ? Math.PI : -Math.PI / 2} color={C.inactive} />
      {/* knockout + text */}
      <rect x={midX - tw / 2} y={midY - 7} width={tw} height={12} fill={C.canvas} stroke="none" />
      <text x={midX} y={midY + 3} textAnchor="middle" stroke="none" fill={C.structure} fontFamily={TYPE.dim.font} fontSize={TYPE.dim.size}>
        {text}
      </text>
    </g>
  );
}

// Leader from a feature into a gutter label (§9.2). One elbow maximum.
export function Callout({ x, y, gx, gy, index, text }) {
  return (
    <g>
      <circle cx={x} cy={y} r="2" fill={C.structure} />
      <polyline points={`${x},${y} ${gx},${y} ${gx},${gy}`} fill="none" stroke={C.inactive} strokeWidth={W.W1} />
      <text x={gx + 6} y={gy + 3} fontFamily={TYPE.legend.font} fontSize={TYPE.legend.size} fill={C.structure}>
        {index != null ? `${index}. ` : ''}
        {text}
      </text>
    </g>
  );
}

// Legend card — swatches show the ACTUAL rendering (real weight/dash) (§9.3).
export function Legend({ x, y, entries, title = 'LEGEND' }) {
  const rowH = 18;
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x="0" y="0" width="184" height={entries.length * rowH + 30} rx="3" fill={C.surface} stroke={C.hairline} strokeWidth={W.W1} />
      <text x="12" y="18" fontFamily={TYPE.group.font} fontSize={TYPE.group.size} fontWeight={TYPE.group.weight} fill={C.structure} letterSpacing={TYPE.group.spacing}>
        {title}
      </text>
      {entries.map((e, i) => {
        const yy = 30 + i * rowH + 8;
        return (
          <g key={i}>
            {e.kind === 'line' ? (
              <line x1="12" y1={yy} x2="30" y2={yy} stroke={e.color} strokeWidth={e.width || W.W3} strokeDasharray={e.dash} />
            ) : (
              <rect x="12" y={yy - 6} width="12" height="12" fill={e.color} stroke="none" />
            )}
            <text x="40" y={yy + 3} fontFamily={TYPE.legend.font} fontSize={TYPE.legend.size} fill={C.structure}>
              {e.label}
            </text>
          </g>
        );
      })}
    </g>
  );
}

/* ---- Chrome: the mandatory provenance badge (§2.4) ------------------------- */

// "MODEL — NOT CONNECTED TO PLANT" — fixed copy, never collapsed, bottom-right.
export function ProvenanceBadge({ x, y, model, version, tSim }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x="0" y="0" width="260" height="34" rx="3" fill={C.surface} stroke={C.hairline} strokeWidth={W.W1} />
      <text x="10" y="15" fontFamily={TYPE.badge.font} fontSize={TYPE.badge.size} fill={C.inactive} letterSpacing="0.08em">
        <tspan fill={C.copper}>{'\u25C7'} </tspan>
        MODEL — NOT CONNECTED TO PLANT
      </text>
      <text x="10" y="28" fontFamily={TYPE.badge.font} fontSize={TYPE.badge.size} fill={C.inactive}>
        {model} v{version} · t = {tSim.toFixed(1)} s (sim)
      </text>
    </g>
  );
}

// Figure title, top-left of the frame (§8).
export function FigureTitle({ x = GRID.safe, y = GRID.safe + 4, text }) {
  return (
    <text x={x} y={y} fontFamily={TYPE.title.font} fontSize={TYPE.title.size} fontWeight={TYPE.title.weight} fill={C.structure}>
      {text}
    </text>
  );
}

/* ---- L5 state: operating-envelope bar + live readout (§3.3.5, §10.2) -------- */

const stateColor = (s) => (s === 'fault' ? C.fault : s === 'warning' ? C.warn : C.structure);
const stateGlyph = (s) => (s === 'fault' ? '\u26A0' : s === 'warning' ? '\u25B3' : '');

// Horizontal envelope bar: normal band, warning band, danger band + a value tick.
// Thresholds (lo/hi/hiHi) and value are in DISPLAY units, range = [min,max].
export function EnvelopeBar({ x, y, w = 104, h = 6, min, max, lo, hi, hiHi, value, state }) {
  const f = (v) => x + Math.max(0, Math.min(1, (v - min) / (max - min))) * w;
  const bands = [];
  // normal (green) between low limit and high limit
  const nStart = lo != null ? f(lo) : x;
  const nEnd = hi != null ? f(hi) : x + w;
  bands.push(<rect key="n" x={nStart} y={y} width={Math.max(0, nEnd - nStart)} height={h} fill={C.success} fillOpacity="0.18" />);
  if (hi != null) bands.push(<rect key="w" x={f(hi)} y={y} width={Math.max(0, (hiHi != null ? f(hiHi) : x + w) - f(hi))} height={h} fill={C.warn} fillOpacity="0.22" />);
  if (hiHi != null) bands.push(<rect key="d" x={f(hiHi)} y={y} width={Math.max(0, x + w - f(hiHi))} height={h} fill={C.fault} fillOpacity="0.22" />);
  if (lo != null) bands.push(<rect key="lo" x={x} y={y} width={Math.max(0, f(lo) - x)} height={h} fill={C.warn} fillOpacity="0.22" />);
  const vx = f(value);
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={C.surface2} stroke={C.hairline} strokeWidth={W.W0} />
      {bands}
      <line x1={vx} y1={y - 2} x2={vx} y2={y + h + 2} stroke={stateColor(state)} strokeWidth={W.W3} />
    </g>
  );
}

// Live readout block: tag, value+unit (mono, provenance-styled §7.6), state glyph,
// and the envelope bar. `model` source renders with no container border.
export function Readout({ x, y, tag, value, unit, state = 'normal', bar }) {
  return (
    <g>
      <text x={x} y={y} fontFamily={TYPE.tag.font} fontSize={TYPE.tag.size} fill={C.inactive} letterSpacing="0.06em">{tag}</text>
      <text x={x} y={y + 16} fontFamily={TYPE.value.font} fontSize={15} fontWeight={600} fill={stateColor(state)}>
        {value}
        <tspan fontSize={TYPE.unit.size} fill={C.inactive}> {unit}</tspan>
        {stateGlyph(state) && <tspan dx="4" fill={stateColor(state)}>{stateGlyph(state)}</tspan>}
      </text>
      {bar && <EnvelopeBar x={x} y={y + 24} {...bar} state={state} />}
    </g>
  );
}
