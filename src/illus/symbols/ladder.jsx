/*
 * Automation discipline symbol library (Illustration Rulebook §15 · IEC 61131-3).
 * Ladder-diagram elements: power rails, normally-open / normally-closed contacts,
 * and coils. Energised (conducting) elements use the active emphasis colour +
 * weight (§7.5); de-energised elements stay present in the structure colour, so
 * state is never conveyed by colour alone (the flow of the rung + labels carry it).
 */
import { C, W, TYPE } from '../tokens';

const energColor = (on) => (on ? C.select : C.inactive);
const energW = (on) => (on ? W.W5 : W.W2);

// Vertical power rail (left = L+, right = neutral). Height spans the rungs.
export function Rail({ x, y1, y2 }) {
  return <line x1={x} y1={y1} x2={x} y2={y2} stroke={C.structure} strokeWidth={W.W4} strokeLinecap="butt" />;
}

// Plain rung wire segment.
export function Rung({ x1, x2, y, on }) {
  return <line x1={x1} y1={y} x2={x2} y2={y} stroke={energColor(on)} strokeWidth={energW(on)} strokeLinecap="butt" />;
}

// Normally-open contact --| |--  (conducts when its input is TRUE).
export function ContactNO({ cx, cy, on, name, addr }) {
  const c = energColor(on);
  return (
    <g>
      <line x1={cx - 6} y1={cy - 8} x2={cx - 6} y2={cy + 8} stroke={c} strokeWidth={W.W3} />
      <line x1={cx + 6} y1={cy - 8} x2={cx + 6} y2={cy + 8} stroke={c} strokeWidth={W.W3} />
      <Label cx={cx} cy={cy} name={name} addr={addr} />
    </g>
  );
}

// Normally-closed contact --|/|--  (conducts when its input is FALSE).
export function ContactNC({ cx, cy, on, name, addr }) {
  const c = energColor(on);
  return (
    <g>
      <line x1={cx - 6} y1={cy - 8} x2={cx - 6} y2={cy + 8} stroke={c} strokeWidth={W.W3} />
      <line x1={cx + 6} y1={cy - 8} x2={cx + 6} y2={cy + 8} stroke={c} strokeWidth={W.W3} />
      <line x1={cx - 6} y1={cy + 8} x2={cx + 6} y2={cy - 8} stroke={c} strokeWidth={W.W2} />
      <Label cx={cx} cy={cy} name={name} addr={addr} />
    </g>
  );
}

// Output coil --( )--  (energised when the rung to its left is TRUE).
export function Coil({ cx, cy, on, name, addr }) {
  const c = energColor(on);
  return (
    <g>
      <path d={`M ${cx - 8} ${cy - 9} A 9 9 0 0 0 ${cx - 8} ${cy + 9}`} fill="none" stroke={c} strokeWidth={W.W3} />
      <path d={`M ${cx + 8} ${cy - 9} A 9 9 0 0 1 ${cx + 8} ${cy + 9}`} fill="none" stroke={c} strokeWidth={W.W3} />
      <Label cx={cx} cy={cy} name={name} addr={addr} />
    </g>
  );
}

// Symbolic name above, IEC address below (§15.2: show %I/%Q + symbolic name).
function Label({ cx, cy, name, addr }) {
  return (
    <>
      {name && (
        <text x={cx} y={cy - 14} textAnchor="middle" fontFamily={TYPE.label.font} fontSize={11} fill={C.structure}>
          {name}
        </text>
      )}
      {addr && (
        <text x={cx} y={cy + 24} textAnchor="middle" fontFamily={TYPE.tag.font} fontSize={10} fill={C.inactive}>
          {addr}
        </text>
      )}
    </>
  );
}
