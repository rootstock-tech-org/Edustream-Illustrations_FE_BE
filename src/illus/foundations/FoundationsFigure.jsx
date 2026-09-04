/*
 * Foundations D3 figure (Rulebook §12). The four IIoT layers as a left-to-right
 * pipeline (signals flow left→right, §5.14), each showing its budgeted latency,
 * with end-to-end / network / processing / throughput readouts. Pure render.
 */
import { Defs, Frame, Grid, Wire, Port, ProvenanceBadge, FigureTitle, Legend, Readout } from '../primitives';
import { NetNode } from '../symbols/networks';
import { C, W, GRID, MEDIUM, TYPE } from '../tokens';

const LAYERS = [
  { id: 'sensing', cx: 140, label: 'Sensing', sub: 'sensors' },
  { id: 'network', cx: 370, label: 'Network', sub: 'connectivity' },
  { id: 'proc', cx: 600, label: 'Data Processing', sub: 'analytics' },
  { id: 'app', cx: 830, label: 'Application', sub: 'dashboards' },
];
const LY = 200;

export default function FoundationsFigure({ spec, bound = [], tSim = 0, showGrid = true, onPick, selected }) {
  const [w, h] = [960, 600];
  const boundOf = (tag) => bound.find((q) => q.tag === tag);
  const disp = (q, si) => (si == null ? undefined : si * (q.display.scale ?? 1) + (q.display.offset ?? 0));
  const key = (fn) => (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } };
  const pick = (id, label) => (onPick ? { tabIndex: 0, role: 'button', 'aria-label': label, className: 'ill-pick', style: { cursor: 'pointer' }, onClick: () => onPick(id), onKeyDown: key(() => onPick(id)) } : {});
  const readoutPos = { E2E: [96, 340], NET: [296, 340], PROC: [496, 340], THR: [696, 340] };
  const layerMs = { network: boundOf('NET'), proc: boundOf('PROC') };

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img" aria-labelledby="fn-ttl fn-desc" style={{ maxHeight: '100%' }}>
      <title id="fn-ttl">{spec.name}</title>
      <desc id="fn-desc">The four IIoT layers in series — sensing, network, data processing and application — with the latency each contributes to the end-to-end budget.</desc>
      <Defs />
      <Frame w={w} h={h} />
      {showGrid && <Grid w={w} h={h} />}
      <FigureTitle text={`${spec.name} — ${spec.standard}`} />

      <g id="L3-media">
        {LAYERS.slice(0, -1).map((n, i) => (
          <Wire key={i} points={[[n.cx + 52, LY], [LAYERS[i + 1].cx - 52, LY]]} medium="data" directional />
        ))}
      </g>

      <g id="L4-components">
        {LAYERS.map((n) => {
          const perLayer = n.id === 'network' ? layerMs.network : n.id === 'proc' ? layerMs.proc : null;
          return (
            <g key={n.id}>
              <NetNode cx={n.cx} cy={LY} w={104} label={n.label} sub={n.sub} state={perLayer ? perLayer.state : 'normal'} />
              <Port x={n.cx - 52} y={LY} connected />
              <Port x={n.cx + 52} y={LY} connected />
              {perLayer && <text x={n.cx} y={LY + 48} textAnchor="middle" fontFamily={TYPE.value.font} fontSize={12} fill={C.structure}>{perLayer.value} ms</text>}
              {!perLayer && <text x={n.cx} y={LY + 48} textAnchor="middle" fontFamily={TYPE.value.font} fontSize={12} fill={C.inactive}>{n.id === 'sensing' ? '2' : '8'} ms</text>}
            </g>
          );
        })}
        <text x={480} y={LY - 42} textAnchor="middle" fontFamily={TYPE.tag.font} fontSize={10} fill={C.inactive}>end-to-end latency budget (sum of layers)</text>
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

      <Legend x={GRID.safe} y={452} title="IIoT STACK"
        entries={[
          { kind: 'fill', color: C.canvas, label: 'Layer (device/service)' },
          { kind: 'line', color: MEDIUM.data.stroke, width: W.W2, dash: '2 3', label: 'Data flow' },
        ]} />

      <ProvenanceBadge x={w - GRID.safe - 260} y={h - GRID.safe - 34} model={spec.model.id} version={spec.model.version} tSim={tSim} />
    </svg>
  );
}
