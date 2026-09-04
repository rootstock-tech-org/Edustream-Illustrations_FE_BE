/*
 * Generic block/pipeline figure (Rulebook §12). Renders a row of stage boxes
 * joined by data flow, plus a row of live readouts (with envelope bars) for the
 * spec's quantities. Pure render of bound quantities — used by dataflow-style
 * tools so each one doesn't re-draw the same scaffold.
 */
import { Defs, Frame, Grid, Wire, Port, ProvenanceBadge, FigureTitle, Legend, Readout } from './primitives';
import { NetNode } from './symbols/networks';
import { C, W, GRID, MEDIUM, TYPE } from './tokens';

export default function BlockFigure({ spec, bound = [], tSim = 0, showGrid = true, onPick, selected, stages, flowLabel, legend }) {
  const [w, h] = [960, 600];
  const boundOf = (tag) => bound.find((q) => q.tag === tag);
  const disp = (q, si) => (si == null ? undefined : si * (q.display.scale ?? 1) + (q.display.offset ?? 0));
  const key = (fn) => (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } };
  const pick = (id, label) => (onPick ? { tabIndex: 0, role: 'button', 'aria-label': label, className: 'ill-pick', style: { cursor: 'pointer' }, onClick: () => onPick(id), onKeyDown: key(() => onPick(id)) } : {});

  const NY = 196;
  const left = 130, right = w - 130;
  const step = stages.length > 1 ? (right - left) / (stages.length - 1) : 0;
  const nodes = stages.map((s, i) => ({ ...s, cx: Math.round((left + i * step) / 4) * 4 }));

  const qs = spec.quantities;
  const rLeft = 96, rStep = qs.length > 0 ? (w - 192) / Math.max(1, qs.length) : 0;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img" aria-labelledby="bf-ttl bf-desc" style={{ maxHeight: '100%' }}>
      <title id="bf-ttl">{spec.name}</title>
      <desc id="bf-desc">{spec.name}, drawn to {spec.standard}. A staged pipeline with live model-computed readings.</desc>
      <Defs />
      <Frame w={w} h={h} />
      {showGrid && <Grid w={w} h={h} />}
      <FigureTitle text={`${spec.name} — ${spec.standard}`} />

      <g id="L3-media">
        {nodes.slice(0, -1).map((n, i) => (
          <Wire key={i} points={[[n.cx + 54, NY], [nodes[i + 1].cx - 54, NY]]} medium="data" directional />
        ))}
      </g>

      <g id="L4-components">
        {nodes.map((n) => {
          const st = n.stateTag ? (boundOf(n.stateTag)?.state || 'normal') : 'normal';
          return (
            <g key={n.label}>
              <NetNode cx={n.cx} cy={NY} w={108} label={n.label} sub={n.sub} state={st} />
              <Port x={n.cx - 54} y={NY} connected />
              <Port x={n.cx + 54} y={NY} connected />
            </g>
          );
        })}
        {flowLabel && <text x={w / 2} y={NY - 42} textAnchor="middle" fontFamily={TYPE.tag.font} fontSize={10} fill={C.inactive}>{flowLabel}</text>}
      </g>

      <g id="L5-state">
        {qs.map((q, i) => {
          const bnd = boundOf(q.tag);
          if (!bnd) return null;
          const x = Math.round((rLeft + i * rStep) / 4) * 4;
          const [min, max] = q.range || [0, 100];
          return (
            <g key={q.key} {...pick(q.tag, `${q.label} ${bnd.value} ${bnd.displaySymbol}, ${bnd.state}`)}>
              <rect x={x - 6} y={336 - 14} width={Math.min(150, rStep - 8)} height={48} fill="transparent" />
              <Readout x={x} y={336} tag={q.tag} value={bnd.value} unit={bnd.displaySymbol} state={bnd.state}
                bar={{ min, max, lo: disp(q, q.limits?.lo), hi: disp(q, q.limits?.hi), hiHi: disp(q, q.limits?.hiHi), value: Number(bnd.value) }} />
            </g>
          );
        })}
      </g>

      <Legend x={GRID.safe} y={452} title="LEGEND"
        entries={legend || [
          { kind: 'fill', color: C.canvas, label: 'Stage (block)' },
          { kind: 'line', color: MEDIUM.data.stroke, width: W.W2, dash: '2 3', label: 'Data flow' },
        ]} />

      <ProvenanceBadge x={w - GRID.safe - 260} y={h - GRID.safe - 34} model={spec.model.id} version={spec.model.version} tSim={tSim} />
    </svg>
  );
}
