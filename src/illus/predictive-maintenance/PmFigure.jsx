/*
 * Predictive Maintenance D3 figure (Rulebook §12). A shaft on two bearings with a
 * rotor, plus live vibration / temperature / RUL readouts and ISO envelope bars.
 * Pure render of bound quantities — no physics here.
 */
import { Defs, Frame, Grid, ProvenanceBadge, FigureTitle, Legend, Readout } from '../primitives';
import { Bearing } from '../symbols/process';
import { C, W, GRID, TYPE } from '../tokens';

export default function PmFigure({ spec, bound = [], tSim = 0, showGrid = true, onPick, selected }) {
  const [w, h] = [960, 600];
  const boundOf = (tag) => bound.find((q) => q.tag === tag);
  const disp = (q, si) => (si == null ? undefined : si * (q.display.scale ?? 1) + (q.display.offset ?? 0));
  const key = (fn) => (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } };
  const pick = (id, label) => (onPick ? { tabIndex: 0, role: 'button', 'aria-label': label, className: 'ill-pick', style: { cursor: 'pointer' }, onClick: () => onPick(id), onKeyDown: key(() => onPick(id)) } : {});

  const shaftY = 240;
  const readoutPos = { 'VE-201': [96, 360], 'TE-202': [304, 360], 'RUL': [512, 360], 'CF-203': [720, 360] };

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img" aria-labelledby="pm-ttl pm-desc" style={{ maxHeight: '100%' }}>
      <title id="pm-ttl">{spec.name}</title>
      <desc id="pm-desc">A shaft carried on two bearings with a central rotor, monitored for vibration, bearing temperature and remaining useful life. Drawn to {spec.standard}.</desc>
      <Defs />
      <Frame w={w} h={h} />
      {showGrid && <Grid w={w} h={h} />}
      <FigureTitle text={`${spec.name} — ${spec.standard}`} />

      {/* L4: shaft + bearings + rotor */}
      <g id="L4-mech">
        <line x1={220} y1={shaftY} x2={740} y2={shaftY} stroke={C.structure} strokeWidth={W.W4} />
        {/* rotor disc */}
        <rect x={432} y={shaftY - 44} width={96} height={88} fill={C.surface2} stroke={C.structure} strokeWidth={W.W4} />
        <line x1={480} y1={shaftY - 44} x2={480} y2={shaftY + 44} stroke={C.inactive} strokeWidth={W.W1} />
        <text x={480} y={shaftY + 66} textAnchor="middle" fontFamily={TYPE.label.font} fontSize={12} fill={C.structure}>Rotor</text>
        {/* bearings */}
        <g {...pick('VE-201', 'Drive-end bearing, click to explain')}><Bearing cx={300} cy={shaftY} /></g>
        <Bearing cx={660} cy={shaftY} />
        <text x={300} y={shaftY + 40} textAnchor="middle" fontFamily={TYPE.tag.font} fontSize={10} fill={C.inactive}>DE bearing · VE-201</text>
        <text x={660} y={shaftY + 40} textAnchor="middle" fontFamily={TYPE.tag.font} fontSize={10} fill={C.inactive}>NDE bearing</text>
      </g>

      {/* L5: readouts */}
      <g id="L5-state">
        {spec.quantities.map((q) => {
          const b = boundOf(q.tag);
          const pos = readoutPos[q.tag];
          if (!b || !pos) return null;
          const [min, max] = q.range || [0, 100];
          return (
            <g key={q.key} {...pick(q.tag, `${q.label} ${b.value} ${b.displaySymbol}, ${b.state}`)}>
              <rect x={pos[0] - 6} y={pos[1] - 14} width={150} height={48} fill="transparent" />
              <Readout x={pos[0]} y={pos[1]} tag={q.tag} value={b.value} unit={b.displaySymbol} state={b.state}
                bar={{ min, max, lo: disp(q, q.limits?.lo), hi: disp(q, q.limits?.hi), hiHi: disp(q, q.limits?.hiHi), value: Number(b.value) }} />
            </g>
          );
        })}
      </g>

      <Legend x={GRID.safe} y={452} title="STATE"
        entries={[
          { kind: 'line', color: C.success, width: W.W3, label: 'Within limits' },
          { kind: 'line', color: C.warn, width: W.W3, label: 'Alarm / low RUL' },
          { kind: 'line', color: C.fault, width: W.W3, label: 'Danger' },
        ]} />

      <ProvenanceBadge x={w - GRID.safe - 260} y={h - GRID.safe - 34} model={spec.model.id} version={spec.model.version} tSim={tSim} />
    </svg>
  );
}
