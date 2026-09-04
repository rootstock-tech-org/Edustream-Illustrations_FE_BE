/*
 * Sensors D3 figure (Illustration Rulebook §12 layer contract). A pure render of
 * the spec + bound quantities — holds NO physics. Reads as a clean schematic with
 * overlays off (§3.4). Layers L0 canvas → L4 components here; state/annotation/
 * interaction overlays are layered on in later steps.
 */
import { Defs, Frame, Grid, Wire, Port, Node, Legend, ProvenanceBadge, FigureTitle, Readout } from '../primitives';
import { Motor, Pump, Coupling, Bearing, Instrument, BoundaryPort } from '../symbols/process';
import { C, W, GRID, MEDIUM, TYPE } from '../tokens';

// Where each instrument taps the process (bubble x, tap y on the measured feature).
const TAPS = {
  'TT-101': 312, // motor top (winding)
  'IT-104': 336, // supply line
  'VT-102': 352, // bearing
  'FT-103': 336, // discharge line
};

// Where each instrument's live readout block sits (kept clear of the geometry).
const READOUT = {
  'TT-101': [272, 172],
  'IT-104': [150, 200],
  'VT-102': [392, 452],
  'FT-103': [500, 172],
};

export default function SensorsFigure({ spec, bound = [], tSim = 0, showGrid = true, showState = true, onPick, selected }) {
  const [w, h] = [960, 600];
  const port = (id) => spec.ports.find((p) => p.id === id);
  const comp = (id) => spec.components.find((c) => c.id === id);
  const boundOf = (tag) => bound.find((q) => q.tag === tag);
  const stateColor = (tag) => {
    const b = boundOf(tag);
    if (!b || b.state === 'normal') return null;
    return { color: b.state === 'fault' ? C.fault : C.warn };
  };
  // SI limit → display units, for the envelope bands.
  const disp = (q, si) => (si == null ? undefined : si * (q.display.scale ?? 1) + (q.display.offset ?? 0));
  const key = (fn) => (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } };
  const pickProps = (id, label) => (onPick ? { tabIndex: 0, role: 'button', 'aria-label': label, className: 'ill-pick', style: { cursor: 'pointer' }, onClick: () => onPick(id), onKeyDown: key(() => onPick(id)) } : {});

  const routeOf = (l) => {
    const a = port(l.from).at;
    const b = port(l.to).at;
    // straight if aligned, else single elbow (orthogonal, §5.5)
    if (a[0] === b[0] || a[1] === b[1]) return [a, b];
    return [a, [b[0], a[1]], b];
  };

  const instruments = spec.components.filter((c) => c.symbol === 'instrument');

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img" aria-labelledby="sf-ttl sf-desc" style={{ maxHeight: '100%' }}>
      <title id="sf-ttl">{spec.name}</title>
      <desc id="sf-desc">
        A motor-driven centrifugal pump on a recirculation loop, instrumented with winding-temperature, bearing-vibration, discharge-flow and motor-current sensors. Drawn to {spec.standard}.
      </desc>
      <Defs />

      {/* L0 canvas + L1 grid */}
      <Frame w={w} h={h} />
      {showGrid && <Grid w={w} h={h} />}

      <FigureTitle text={`${spec.name} — ${spec.standard}`} />

      {/* L3 media: process links */}
      <g id="L3-media">
        {spec.links
          .filter((l) => l.rank !== 'auxiliary')
          .map((l) => (
            <Wire key={l.id} points={routeOf(l)} medium={l.medium} directional={l.medium === 'liquid' || l.medium === 'electrical'} />
          ))}

        {/* instrument signal leads (dashed) from tap point up/down to the bubble */}
        {instruments.map((ins) => {
          const bx = ins.at[0];
          const tapY = TAPS[ins.id];
          const sig = port(`${ins.id}.sig`).at;
          return (
            <g key={`lead-${ins.id}`}>
              <Wire points={[[bx, tapY], [bx, sig[1]]]} medium="signal" directional={false} />
              <Node x={bx} y={tapY} color={C.inactive} />
            </g>
          );
        })}
      </g>

      {/* L4 components: symbols, ports, boundary ports, labels */}
      <g id="L4-components">
        <Motor cx={comp('M1').at[0]} cy={comp('M1').at[1]} />
        <Pump cx={comp('P-101').at[0]} cy={comp('P-101').at[1]} />
        <Coupling cx={356} cy={336} />
        <Bearing cx={360} cy={336} />

        {instruments.map((ins) => {
          const [letters, number] = ins.id.split('-');
          const sel = selected === ins.id;
          return (
            <g key={ins.id} {...pickProps(ins.id, `${ins.label}, click to explain`)}>
              {sel && <circle cx={ins.at[0]} cy={ins.at[1]} r={22} fill={C.select} fillOpacity="0.12" />}
              {onPick && <rect x={ins.at[0] - 22} y={ins.at[1] - 22} width={44} height={44} fill="transparent" />}
              <Instrument cx={ins.at[0]} cy={ins.at[1]} letters={letters} number={number} state={stateColor(ins.id)} />
            </g>
          );
        })}

        {/* process port markers */}
        {spec.ports
          .filter((p) => !p.boundary && !p.id.endsWith('.sig'))
          .map((p) => (
            <Port key={p.id} x={p.at[0]} y={p.at[1]} connected />
          ))}

        {/* boundary ports at the frame edges */}
        <BoundaryPort x={port('SUP').at[0]} y={port('SUP').at[1]} side="left" tag="3~ 400 V" />
        <BoundaryPort x={port('SUC').at[0]} y={port('SUC').at[1]} side="bottom" tag="From tank" />
        <BoundaryPort x={port('DIS').at[0]} y={port('DIS').at[1]} side="right" tag="To header" />

        {/* component labels */}
        <text x={comp('M1').at[0]} y={comp('M1').at[1] + 46} textAnchor="middle" fontFamily={TYPE.label.font} fontSize={TYPE.label.size} fill={C.structure}>Drive motor</text>
        <text x={comp('M1').at[0]} y={comp('M1').at[1] + 60} textAnchor="middle" fontFamily={TYPE.tag.font} fontSize={TYPE.tag.size} fill={C.inactive} letterSpacing="0.06em">M1</text>
        <text x={comp('P-101').at[0]} y={comp('P-101').at[1] + 46} textAnchor="middle" fontFamily={TYPE.label.font} fontSize={TYPE.label.size} fill={C.structure}>Recirc pump</text>
        <text x={comp('P-101').at[0]} y={comp('P-101').at[1] + 60} textAnchor="middle" fontFamily={TYPE.tag.font} fontSize={TYPE.tag.size} fill={C.inactive} letterSpacing="0.06em">P-101</text>
      </g>

      {/* L5 state: live readouts + operating-envelope bars (toggleable) */}
      {showState && (
        <g id="L5-state">
          {spec.quantities.map((q) => {
            const b = boundOf(q.tag);
            const pos = READOUT[q.tag];
            if (!b || !pos) return null;
            const [min, max] = q.range || [0, 100];
            return (
              <g key={q.key} {...pickProps(q.tag, `${q.label} ${b.value} ${b.displaySymbol}, ${b.state}`)}>
                {onPick && <rect x={pos[0] - 6} y={pos[1] - 14} width={124} height={48} fill="transparent" />}
                <Readout
                  x={pos[0]}
                  y={pos[1]}
                  tag={q.tag}
                  value={b.value}
                  unit={b.displaySymbol}
                  state={b.state}
                  bar={{ min, max, lo: disp(q, q.limits?.lo), hi: disp(q, q.limits?.hi), hiHi: disp(q, q.limits?.hiHi), value: Number(b.value) }}
                />
              </g>
            );
          })}
        </g>
      )}

      {/* L6 (partial): legend + notes chrome inside frame */}
      <Legend
        x={GRID.safe}
        y={470}
        title="MEDIA"
        entries={[
          { kind: 'line', color: MEDIUM.electrical.stroke, width: W.W3, label: 'Electrical power' },
          { kind: 'line', color: MEDIUM.liquid.stroke, width: W.W3, label: 'Process liquid' },
          { kind: 'line', color: MEDIUM.mechanical.stroke, width: W.W4, label: 'Mechanical shaft' },
          { kind: 'line', color: MEDIUM.signal.stroke, width: W.W2, dash: '2 3', label: 'Instrument signal' },
        ]}
      />

      <ProvenanceBadge x={w - GRID.safe - 260} y={h - GRID.safe - 34} model={spec.model.id} version={spec.model.version} tSim={tSim} />
    </svg>
  );
}
