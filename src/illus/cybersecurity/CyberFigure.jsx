/*
 * Cybersecurity D3 figure (Rulebook §12, §15 networks pack). The Purdue reference
 * model drawn as four stacked zones separated by conduit firewalls, with the live
 * posture readouts. Pure render — the risk numbers come from the model.
 */
import { Defs, Frame, Grid, ProvenanceBadge, FigureTitle, Legend, Readout } from '../primitives';
import { C, W, GRID, TYPE } from '../tokens';

const ZONES = [
  { id: 'ent', name: 'Enterprise (L4/5)', sub: 'ERP · business IT' },
  { id: 'dmz', name: 'Industrial DMZ (L3.5)', sub: 'historian · patch server' },
  { id: 'ctrl', name: 'Control (L2/1)', sub: 'SCADA · PLC' },
  { id: 'field', name: 'Field (L0)', sub: 'sensors · actuators' },
];

export default function CyberFigure({ spec, bound = [], tSim = 0, showGrid = true, onPick, selected }) {
  const [w, h] = [960, 620];
  const boundOf = (tag) => bound.find((q) => q.tag === tag);
  const disp = (q, si) => (si == null ? undefined : si * (q.display.scale ?? 1) + (q.display.offset ?? 0));
  const key = (fn) => (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } };
  const pick = (id, label) => (onPick ? { tabIndex: 0, role: 'button', 'aria-label': label, className: 'ill-pick', style: { cursor: 'pointer' }, onClick: () => onPick(id), onKeyDown: key(() => onPick(id)) } : {});

  const riskS = boundOf('RISK')?.state || 'normal';
  const zoneStroke = riskS === 'fault' ? C.fault : riskS === 'warning' ? C.warn : C.structure;

  const zx = GRID.safe + 24; const zw = 340; let zy = 96; const zh = 66; const gap = 44;
  const zonePos = ZONES.map((_, i) => zy + i * (zh + gap));

  const readoutPos = { RISK: [520, 130], EXP: [740, 130], BLAST: [520, 240], DEPTH: [740, 240] };

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img" aria-labelledby="cy-ttl cy-desc" style={{ maxHeight: '100%' }}>
      <title id="cy-ttl">{spec.name}</title>
      <desc id="cy-desc">The Purdue reference model shown as four stacked zones from enterprise IT down to the field, separated by conduit firewalls, with residual risk, attack surface, blast radius and defense depth readouts.</desc>
      <Defs />
      <Frame w={w} h={h} />
      {showGrid && <Grid w={w} h={h} />}
      <FigureTitle text={`${spec.name} — ${spec.standard}`} />

      <g id="L3-zones">
        {ZONES.map((z, i) => (
          <g key={z.id} {...pick('RISK', `${z.name} zone`)}>
            <rect x={zx} y={zonePos[i]} width={zw} height={zh} rx={2} fill={C.surface2} stroke={zoneStroke} strokeWidth={W.W3} />
            <text x={zx + 14} y={zonePos[i] + 26} fontFamily={TYPE.label.font} fontSize={13} fill={C.ink}>{z.name}</text>
            <text x={zx + 14} y={zonePos[i] + 46} fontFamily={TYPE.tag.font} fontSize={11} fill={C.inactive}>{z.sub}</text>
          </g>
        ))}
        {/* conduit firewalls between zones */}
        {ZONES.slice(0, -1).map((_, i) => {
          const cy = zonePos[i] + zh + gap / 2; const cx = zx + zw / 2;
          return (
            <g key={`fw${i}`}>
              <line x1={cx} y1={zonePos[i] + zh} x2={cx} y2={zonePos[i + 1]} stroke={C.structure} strokeWidth={W.W2} />
              <rect x={cx - 26} y={cy - 12} width={52} height={24} rx={2} fill={C.canvas} stroke={C.select} strokeWidth={W.W3} />
              {/* brick hatch = firewall (IEC-style conduit control) */}
              <line x1={cx - 26} y1={cy} x2={cx + 26} y2={cy} stroke={C.select} strokeWidth={W.W1} />
              <line x1={cx - 13} y1={cy - 12} x2={cx - 13} y2={cy} stroke={C.select} strokeWidth={W.W1} />
              <line x1={cx + 13} y1={cy - 12} x2={cx + 13} y2={cy} stroke={C.select} strokeWidth={W.W1} />
              <line x1={cx} y1={cy} x2={cx} y2={cy + 12} stroke={C.select} strokeWidth={W.W1} />
              <text x={cx + 34} y={cy + 4} fontFamily={TYPE.tag.font} fontSize={10} fill={C.inactive}>conduit FW</text>
            </g>
          );
        })}
      </g>

      <g id="L5-state">
        {spec.quantities.map((q) => {
          const bnd = boundOf(q.tag); const pos = readoutPos[q.tag];
          if (!bnd || !pos) return null;
          const [min, max] = q.range || [0, 100];
          return (
            <g key={q.key} {...pick(q.tag, `${q.label} ${bnd.value} ${bnd.displaySymbol}, ${bnd.state}`)}>
              <rect x={pos[0] - 6} y={pos[1] - 14} width={170} height={48} fill="transparent" />
              <Readout x={pos[0]} y={pos[1]} tag={q.tag} value={bnd.value} unit={bnd.displaySymbol} state={bnd.state}
                bar={{ min, max, lo: disp(q, q.limits?.lo), hi: disp(q, q.limits?.hi), hiHi: disp(q, q.limits?.hiHi), value: Number(bnd.value) }} />
            </g>
          );
        })}
      </g>

      <Legend x={520} y={352} title="ZONE MODEL"
        entries={[
          { kind: 'line', color: C.structure, width: W.W3, label: 'Security zone' },
          { kind: 'line', color: C.select, width: W.W3, label: 'Conduit firewall' },
        ]} />

      <ProvenanceBadge x={w - GRID.safe - 260} y={h - GRID.safe - 34} model={spec.model.id} version={spec.model.version} tSim={tSim} />
    </svg>
  );
}
