/*
 * Communication D3 figure (Rulebook §12). Sensor → Gateway → Edge → Cloud topology
 * with data links carrying flow, plus live goodput / latency / loss / utilisation
 * readouts. Pure render of bound quantities.
 */
import { Defs, Frame, Grid, Wire, Port, ProvenanceBadge, FigureTitle, Legend, Readout } from '../primitives';
import { NetNode } from '../symbols/networks';
import { C, W, GRID, MEDIUM, TYPE } from '../tokens';

const NODES = [
  { id: 'sensor', cx: 130, label: 'Sensor', sub: 'field' },
  { id: 'gw', cx: 370, label: 'Gateway', sub: 'protocol' },
  { id: 'edge', cx: 610, label: 'Edge', sub: 'compute' },
  { id: 'cloud', cx: 840, label: 'Cloud', sub: 'platform' },
];
const NY = 200;

export default function CommFigure({ spec, bound = [], tSim = 0, showGrid = true, onPick, selected }) {
  const [w, h] = [960, 600];
  const boundOf = (tag) => bound.find((q) => q.tag === tag);
  const disp = (q, si) => (si == null ? undefined : si * (q.display.scale ?? 1) + (q.display.offset ?? 0));
  const key = (fn) => (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } };
  const pick = (id, label) => (onPick ? { tabIndex: 0, role: 'button', 'aria-label': label, className: 'ill-pick', style: { cursor: 'pointer' }, onClick: () => onPick(id), onKeyDown: key(() => onPick(id)) } : {});

  const utilB = boundOf('UTIL');
  const linkState = utilB ? utilB.state : 'normal';
  const readoutPos = { THR: [96, 340], LAT: [296, 340], LOSS: [496, 340], UTIL: [696, 340] };

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img" aria-labelledby="cm-ttl cm-desc" style={{ maxHeight: '100%' }}>
      <title id="cm-ttl">{spec.name}</title>
      <desc id="cm-desc">A four-hop telemetry path from a field sensor through a gateway and edge node to the cloud, showing goodput, latency, packet loss and link utilisation. {spec.standard}.</desc>
      <Defs />
      <Frame w={w} h={h} />
      {showGrid && <Grid w={w} h={h} />}
      <FigureTitle text={`${spec.name} — ${spec.standard}`} />

      {/* L3 links */}
      <g id="L3-media">
        {NODES.slice(0, -1).map((n, i) => {
          const a = n.cx + 48, b = NODES[i + 1].cx - 48;
          const on = linkState !== 'normal' && i === 1; // the bottleneck link highlights under stress
          return <Wire key={i} points={[[a, NY], [b, NY]]} medium="data" directional color={on ? (linkState === 'fault' ? C.fault : C.warn) : MEDIUM.data.stroke} />;
        })}
      </g>

      {/* L4 nodes + ports */}
      <g id="L4-components">
        {NODES.map((n) => (
          <g key={n.id}>
            <NetNode cx={n.cx} cy={NY} label={n.label} sub={n.sub} state={n.id === 'gw' ? linkState : 'normal'} />
            <Port x={n.cx - 48} y={NY} connected />
            <Port x={n.cx + 48} y={NY} connected />
          </g>
        ))}
        <text x={480} y={NY + 62} textAnchor="middle" fontFamily={TYPE.tag.font} fontSize={10} fill={C.inactive}>bottleneck link (gateway → edge)</text>
      </g>

      {/* L5 readouts */}
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

      <Legend x={GRID.safe} y={452} title="LEGEND"
        entries={[
          { kind: 'line', color: MEDIUM.data.stroke, width: W.W2, dash: '2 3', label: 'Data link' },
          { kind: 'line', color: C.warn, width: W.W2, dash: '2 3', label: 'Congested link' },
          { kind: 'fill', color: C.canvas, label: 'Network device (box)' },
        ]} />

      <ProvenanceBadge x={w - GRID.safe - 260} y={h - GRID.safe - 34} model={spec.model.id} version={spec.model.version} tSim={tSim} />
    </svg>
  );
}
