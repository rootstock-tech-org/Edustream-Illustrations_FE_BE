/*
 * Robotics D3 figure (Rulebook §12, §5.10 true proportion). Draws the 2-link arm
 * from the joint angles at a real scale, with the reach envelope, and live
 * end-effector / joint-torque readouts. Pure render — kinematics come from params.
 */
import { Defs, Frame, Grid, ProvenanceBadge, FigureTitle, Legend, Readout } from '../primitives';
import { L1, L2 } from './model';
import { C, W, GRID, TYPE } from '../tokens';

const BASE = [330, 430];
const SCALE = 150; // px per metre

export default function RoboFigure({ spec, bound = [], params = {}, tSim = 0, showGrid = true, onPick, selected }) {
  const [w, h] = [960, 600];
  const boundOf = (tag) => bound.find((q) => q.tag === tag);
  const disp = (q, si) => (si == null ? undefined : si * (q.display.scale ?? 1) + (q.display.offset ?? 0));
  const key = (fn) => (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } };
  const pick = (id, label) => (onPick ? { tabIndex: 0, role: 'button', 'aria-label': label, className: 'ill-pick', style: { cursor: 'pointer' }, onClick: () => onPick(id), onKeyDown: key(() => onPick(id)) } : {});

  const t1 = ((params.theta1 ?? 45) * Math.PI) / 180;
  const t2 = ((params.theta2 ?? 30) * Math.PI) / 180;
  const toScreen = (wx, wy) => [BASE[0] + wx * SCALE, BASE[1] - wy * SCALE];
  const elbow = toScreen(L1 * Math.cos(t1), L1 * Math.sin(t1));
  const ee = toScreen(L1 * Math.cos(t1) + L2 * Math.cos(t1 + t2), L1 * Math.sin(t1) + L2 * Math.sin(t1 + t2));
  const t1s = boundOf('T1')?.state || 'normal';
  const t2s = boundOf('T2')?.state || 'normal';
  const jc = (s) => (s === 'fault' ? C.fault : s === 'warning' ? C.warn : C.select);

  const readoutPos = { X: [96, 500], Y: [296, 500], T1: [496, 500], T2: [696, 500] };

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img" aria-labelledby="rb-ttl rb-desc" style={{ maxHeight: '100%' }}>
      <title id="rb-ttl">{spec.name}</title>
      <desc id="rb-desc">A two-link planar robot arm at the chosen joint angles, drawn to scale with its reach envelope, showing the end-effector position and the gravity-holding torque at each joint.</desc>
      <Defs />
      <Frame w={w} h={h} />
      {showGrid && <Grid w={w} h={h} />}
      <FigureTitle text={`${spec.name} — ${spec.standard}`} />

      {/* reach envelope + ground */}
      <g id="L1-envelope">
        <circle cx={BASE[0]} cy={BASE[1]} r={(L1 + L2) * SCALE} fill="none" stroke={C.hairline} strokeWidth={W.W1} strokeDasharray="6 4" />
        <line x1={BASE[0] - 40} y1={BASE[1]} x2={BASE[0] + (L1 + L2) * SCALE + 20} y2={BASE[1]} stroke={C.inactive} strokeWidth={W.W1} />
        <text x={BASE[0] + (L1 + L2) * SCALE} y={BASE[1] - 8} textAnchor="end" fontFamily={TYPE.tag.font} fontSize={10} fill={C.inactive}>reach {(L1 + L2).toFixed(1)} m</text>
      </g>

      {/* arm */}
      <g id="L4-arm">
        {/* base mount */}
        <rect x={BASE[0] - 16} y={BASE[1]} width={32} height={18} fill={C.surface2} stroke={C.structure} strokeWidth={W.W3} />
        {/* link 1 */}
        <line x1={BASE[0]} y1={BASE[1]} x2={elbow[0]} y2={elbow[1]} stroke={C.structure} strokeWidth={W.W4} strokeLinecap="round" />
        {/* link 2 */}
        <line x1={elbow[0]} y1={elbow[1]} x2={ee[0]} y2={ee[1]} stroke={C.structure} strokeWidth={W.W4} strokeLinecap="round" />
        {/* joints */}
        <g {...pick('T1', 'Shoulder joint, click to explain')}><circle cx={BASE[0]} cy={BASE[1]} r={9} fill={C.canvas} stroke={jc(t1s)} strokeWidth={W.W4} /></g>
        <g {...pick('T2', 'Elbow joint, click to explain')}><circle cx={elbow[0]} cy={elbow[1]} r={8} fill={C.canvas} stroke={jc(t2s)} strokeWidth={W.W4} /></g>
        {/* end-effector gripper */}
        <g {...pick('X', 'End-effector, click to explain')}>
          <circle cx={ee[0]} cy={ee[1]} r={5} fill={C.select} />
          <line x1={ee[0] - 8} y1={ee[1] - 8} x2={ee[0] + 8} y2={ee[1] - 8} stroke={C.select} strokeWidth={W.W3} />
        </g>
        <text x={BASE[0]} y={BASE[1] + 32} textAnchor="middle" fontFamily={TYPE.tag.font} fontSize={10} fill={C.inactive}>base · shoulder</text>
        <text x={elbow[0] + 12} y={elbow[1]} fontFamily={TYPE.tag.font} fontSize={10} fill={C.inactive}>elbow</text>
      </g>

      <g id="L5-state">
        {spec.quantities.map((q) => {
          const bnd = boundOf(q.tag); const pos = readoutPos[q.tag];
          if (!bnd || !pos) return null;
          const [min, max] = q.range || [0, 100];
          return (
            <g key={q.key} {...pick(q.tag, `${q.label} ${bnd.value} ${bnd.displaySymbol}, ${bnd.state}`)}>
              <rect x={pos[0] - 6} y={pos[1] - 14} width={150} height={48} fill="transparent" />
              <Readout x={pos[0]} y={pos[1]} tag={q.tag} value={bnd.value} unit={bnd.displaySymbol} state={bnd.state}
                bar={{ min, max, lo: disp(q, q.limits?.lo), hi: disp(q, q.limits?.hi), hiHi: disp(q, q.limits?.hiHi), value: Number(bnd.value) }} />
            </g>
          );
        })}
      </g>

      <Legend x={GRID.safe} y={352} title="ARM"
        entries={[
          { kind: 'line', color: C.structure, width: W.W4, label: 'Rigid link' },
          { kind: 'line', color: C.select, width: W.W4, label: 'Joint / end-effector' },
          { kind: 'line', color: C.hairline, width: W.W1, dash: '6 4', label: 'Reach envelope' },
        ]} />

      <ProvenanceBadge x={w - GRID.safe - 260} y={h - GRID.safe - 34} model={spec.model.id} version={spec.model.version} tSim={tSim} />
    </svg>
  );
}
