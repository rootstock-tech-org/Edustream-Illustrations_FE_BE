/*
 * PLC ladder D3 figure (Illustration Rulebook §12). Pure render of the solved
 * ladder + tank state — no logic here, it consumes `contacts`/`level` computed by
 * the model. Rungs read left rail → right (§15.2). Energised segments use the
 * active colour/weight; de-energised stay present in the structure colour.
 */
import { Defs, Frame, Grid, ProvenanceBadge, FigureTitle, Legend, Readout } from '../primitives';
import { Rail, Rung, ContactNO, ContactNC, Coil } from '../symbols/ladder';
import { C, W, GRID, TYPE } from '../tokens';

const RAIL_L = 72;
const RAIL_R = 560;
const Y_PUMP = 208;
const Y_SEAL = 260;
const Y_VALVE = 360;

export default function PlcFigure({ spec, contacts, level = 0, params, bound = [], tSim = 0, showGrid = true, onPick, selected }) {
  const [w, h] = [960, 600];
  const boundOf = (tag) => bound.find((q) => q.tag === tag);
  const key = (fn) => (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } };
  const pick = (id, label) => (onPick ? { tabIndex: 0, role: 'button', 'aria-label': label, className: 'ill-pick', style: { cursor: 'pointer' }, onClick: () => onPick(id), onKeyDown: key(() => onPick(id)) } : {});

  // rung-1 (pump) segment energisation, left→right
  const s0 = true; // left rail is live
  const s1 = contacts.run; // after Run
  const s2 = s1 && (contacts.lLow || contacts.seal); // after OR branch
  const s3 = s2 && contacts.notHigh; // after LvlHigh NC == pump

  // tank geometry
  const TX = 648, TW = 120, TTOP = 132, TBOT = 468, TH = TBOT - TTOP;
  const lvlY = TBOT - (level / 100) * TH;
  const spY = (p) => TBOT - (p / 100) * TH;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img" aria-labelledby="plc-ttl plc-desc" style={{ maxHeight: '100%' }}>
      <title id="plc-ttl">{spec.name}</title>
      <desc id="plc-desc">A PLC ladder rung that latches a pump coil between low and high level setpoints, shown live beside the controlled tank. Drawn to {spec.standard}.</desc>
      <Defs />
      <Frame w={w} h={h} />
      {showGrid && <Grid w={w} h={h} />}
      <FigureTitle text={`${spec.name} — ${spec.standard}`} />

      {/* scan-cycle strip */}
      <text x={GRID.safe} y={92} fontFamily={TYPE.tag.font} fontSize={11} fill={C.inactive} letterSpacing="0.06em">
        SCAN: READ INPUTS → SOLVE LADDER → WRITE OUTPUTS · {(spec.model && '20 ms')}
      </text>

      {/* L3/L4: ladder */}
      <g id="L4-ladder">
        <Rail x={RAIL_L} y1={168} y2={400} />
        <Rail x={RAIL_R} y1={168} y2={400} />

        {/* rung 1: Pump */}
        <Rung x1={RAIL_L} x2={144} y={Y_PUMP} on={s0} />
        <g {...pick(spec.quantities[1].tag, 'Run contact')}><ContactNO cx={162} cy={Y_PUMP} on={contacts.run} name="Run" addr="%IX0.0" /></g>
        <Rung x1={180} x2={236} y={Y_PUMP} on={s1} />

        {/* OR branch: LvlLow || Pump seal-in */}
        <line x1={236} y1={Y_PUMP} x2={236} y2={Y_SEAL} stroke={s1 ? C.select : C.structure} strokeWidth={s1 ? W.W5 : W.W3} />
        <ContactNO cx={280} cy={Y_PUMP} on={contacts.lLow} name="LvlLow" addr="%IX0.1" />
        <ContactNO cx={280} cy={Y_SEAL} on={contacts.seal} name="Pump (seal-in)" addr="%QX0.0" />
        <Rung x1={236} x2={262} y={Y_PUMP} on={s1} />
        <Rung x1={298} x2={324} y={Y_PUMP} on={s1 && contacts.lLow} />
        <Rung x1={236} x2={262} y={Y_SEAL} on={s1} />
        <Rung x1={298} x2={324} y={Y_SEAL} on={s1 && contacts.seal} />
        <line x1={324} y1={Y_PUMP} x2={324} y2={Y_SEAL} stroke={s2 ? C.select : C.structure} strokeWidth={s2 ? W.W5 : W.W3} />

        <Rung x1={324} x2={392} y={Y_PUMP} on={s2} />
        <ContactNC cx={410} cy={Y_PUMP} on={contacts.notHigh} name="LvlHigh" addr="%IX0.2" />
        <Rung x1={428} x2={492} y={Y_PUMP} on={s3} />
        <g {...pick(spec.quantities[1].tag, 'Pump coil, click to explain')}><Coil cx={510} cy={Y_PUMP} on={contacts.pump} name="Pump" addr="%QX0.0" /></g>
        <Rung x1={528} x2={RAIL_R} y={Y_PUMP} on={contacts.pump} />

        {/* rung 2: Valve = Pump */}
        <Rung x1={RAIL_L} x2={144} y={Y_VALVE} on={s0} />
        <ContactNO cx={162} cy={Y_VALVE} on={contacts.pump} name="Pump" addr="%QX0.0" />
        <Rung x1={180} x2={492} y={Y_VALVE} on={contacts.pump} />
        <g {...pick(spec.quantities[2].tag, 'Valve coil, click to explain')}><Coil cx={510} cy={Y_VALVE} on={contacts.valve} name="Valve" addr="%QX0.1" /></g>
        <Rung x1={528} x2={RAIL_R} y={Y_VALVE} on={contacts.valve} />
      </g>

      {/* tank linked view */}
      <g id="L2-tank" {...pick(spec.quantities[0].tag, 'Tank level, click to explain')}>
        <rect x={TX} y={TTOP} width={TW} height={TH} fill="none" stroke={C.structure} strokeWidth={W.W4} />
        <rect x={TX + 2} y={lvlY} width={TW - 4} height={TBOT - lvlY} fill={C.primary} fillOpacity="0.28" />
        <line x1={TX} y1={lvlY} x2={TX + TW} y2={lvlY} stroke={C.primary} strokeWidth={W.W3} />
        {/* setpoint markers */}
        <line x1={TX - 8} y1={spY(params.highSP)} x2={TX} y2={spY(params.highSP)} stroke={C.warn} strokeWidth={W.W2} />
        <text x={TX - 12} y={spY(params.highSP) + 3} textAnchor="end" fontFamily={TYPE.tag.font} fontSize={10} fill={C.inactive}>HIGH {params.highSP}</text>
        <line x1={TX - 8} y1={spY(params.lowSP)} x2={TX} y2={spY(params.lowSP)} stroke={C.warn} strokeWidth={W.W2} />
        <text x={TX - 12} y={spY(params.lowSP) + 3} textAnchor="end" fontFamily={TYPE.tag.font} fontSize={10} fill={C.inactive}>LOW {params.lowSP}</text>
        <text x={TX + TW / 2} y={TTOP - 8} textAnchor="middle" fontFamily={TYPE.label.font} fontSize={12} fill={C.structure}>Tank</text>
      </g>

      {/* L5: readouts */}
      <g id="L5-state">
        {(() => {
          const b = boundOf(spec.quantities[0].tag);
          if (!b) return null;
          return <g {...pick(spec.quantities[0].tag, `Level ${b.value}%`)}><Readout x={TX} y={TBOT + 26} tag="Level" value={b.value} unit="%" state={b.state} bar={{ min: 0, max: 100, hiHi: 95, lo: 5, value: Number(b.value) }} /></g>;
        })()}
      </g>

      <Legend
        x={GRID.safe}
        y={452}
        title="LADDER"
        entries={[
          { kind: 'line', color: C.select, width: W.W5, label: 'Energised (conducting)' },
          { kind: 'line', color: C.inactive, width: W.W2, label: 'De-energised' },
          { kind: 'line', color: C.primary, width: W.W3, label: 'Tank liquid' },
        ]}
      />

      <ProvenanceBadge x={w - GRID.safe - 260} y={h - GRID.safe - 34} model={spec.model.id} version={spec.model.version} tSim={tSim} />
    </svg>
  );
}
