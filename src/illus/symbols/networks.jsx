/*
 * Networks discipline symbols (Rulebook §15 · house convention, declared in the
 * legend). A device node drawn as a true box (square corners, §5.4) with a type
 * label — not a decorated pill. Ports are placed by the figure.
 */
import { C, W, TYPE } from '../tokens';

export function NetNode({ cx, cy, w = 96, h = 56, label, sub, state }) {
  const stroke = state === 'fault' ? C.fault : state === 'warning' ? C.warn : C.structure;
  return (
    <g>
      <rect x={cx - w / 2} y={cy - h / 2} width={w} height={h} fill={C.canvas} stroke={stroke} strokeWidth={W.W4} />
      <text x={cx} y={cy - 2} textAnchor="middle" fontFamily={TYPE.label.font} fontSize={12} fontWeight={600} fill={C.structure}>{label}</text>
      {sub && <text x={cx} y={cy + 14} textAnchor="middle" fontFamily={TYPE.tag.font} fontSize={10} fill={C.inactive}>{sub}</text>}
    </g>
  );
}
