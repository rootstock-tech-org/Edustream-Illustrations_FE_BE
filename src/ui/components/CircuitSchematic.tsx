'use client';
import { useDevice } from '@/ui/hooks/useDevice';

/**
 * Compact CMOS-inverter schematic that doubles as a NAVIGATION AID and a
 * connectivity REFERENCE (not decoration). Every wire meets at an exact shared
 * coordinate, so the topology is electrically correct:
 *   • PMOS source → VDD (top), PMOS drain → Vout (shared output)
 *   • NMOS drain → Vout (top), NMOS source → GND (bottom)
 *   • both gates ← Vin (shared gate bus); output → Vout with a load cap CL → GND
 * Click PMOS / NMOS to jump to that single-device explorer; click the output
 * node to return to the full CMOS Inverter. The active device is highlighted.
 */
const INK = 'rgb(var(--ink-muted))';
const ACC = 'rgb(var(--accent))';
const GLOW = { filter: 'drop-shadow(0 0 4px var(--accent-glow))' };

// shared layout anchors — wires reference these so connections always meet
const CX = 112; // transistor + output column
const GATE_BUS = 84; // shared gate bus
const VOUT_X = 182;
const VDD_Y = 22;
const PMOS_Y = 66;
const OUT_Y = 120;
const NMOS_Y = 174;
const GND_Y = 214;
const T = 24; // terminal lead length (centre → terminal tip)

export function CircuitSchematic({ className = '' }: { className?: string }) {
  const { deviceId, setDevice } = useDevice();

  const pmosOn = deviceId === 'pmos';
  const nmosOn = deviceId === 'nmos';
  const invOn = deviceId === 'cmos-inverter';

  return (
    <svg viewBox="0 0 214 240" className={className} role="img" aria-label="CMOS inverter schematic — click a transistor to explore it">
      {/* rails / wires — every endpoint lands on a shared anchor */}
      <g stroke={INK} strokeWidth={1.6} fill="none" strokeLinecap="round">
        {/* VDD bar + stub → PMOS source (top terminal at PMOS_Y - T) */}
        <line x1={CX - 15} y1={VDD_Y} x2={CX + 15} y2={VDD_Y} />
        <line x1={CX} y1={VDD_Y} x2={CX} y2={PMOS_Y - T} />
        {/* PMOS drain (bottom) → output node */}
        <line x1={CX} y1={PMOS_Y + T} x2={CX} y2={OUT_Y} />
        {/* output node → NMOS drain (top) */}
        <line x1={CX} y1={OUT_Y} x2={CX} y2={NMOS_Y - T} />
        {/* NMOS source (bottom) → GND */}
        <line x1={CX} y1={NMOS_Y + T} x2={CX} y2={GND_Y} />
        {/* GND symbol */}
        <line x1={CX - 12} y1={GND_Y} x2={CX + 12} y2={GND_Y} />
        <line x1={CX - 8} y1={GND_Y + 4} x2={CX + 8} y2={GND_Y + 4} />
        <line x1={CX - 4} y1={GND_Y + 8} x2={CX + 4} y2={GND_Y + 8} />
        {/* output node → Vout */}
        <line x1={CX} y1={OUT_Y} x2={VOUT_X} y2={OUT_Y} />
        {/* load cap CL tapped off the output wire → GND */}
        <line x1={150} y1={OUT_Y} x2={150} y2={OUT_Y + 28} />
        <line x1={142} y1={OUT_Y + 28} x2={158} y2={OUT_Y + 28} />
        <line x1={142} y1={OUT_Y + 34} x2={158} y2={OUT_Y + 34} />
        <line x1={150} y1={OUT_Y + 34} x2={150} y2={OUT_Y + 48} />
        <line x1={145} y1={OUT_Y + 48} x2={155} y2={OUT_Y + 48} />
        {/* Vin → shared gate bus → both gates */}
        <line x1={28} y1={OUT_Y} x2={GATE_BUS} y2={OUT_Y} />
        <line x1={GATE_BUS} y1={PMOS_Y} x2={GATE_BUS} y2={NMOS_Y} />
      </g>

      {/* electrical nodes */}
      <circle cx={CX} cy={OUT_Y} r={3} fill={invOn ? ACC : INK} style={invOn ? GLOW : undefined} />
      <circle cx={GATE_BUS} cy={OUT_Y} r={2.2} fill={INK} />
      <circle cx={28} cy={OUT_Y} r={2.2} fill={INK} />

      {/* PMOS (top) — source at VDD, drain at output */}
      <Transistor cx={CX} cy={PMOS_Y} type="pmos" sourceSide="top" active={pmosOn} onClick={() => setDevice('pmos')} />
      {/* NMOS (bottom) — drain at output, source at GND */}
      <Transistor cx={CX} cy={NMOS_Y} type="nmos" sourceSide="bottom" active={nmosOn} onClick={() => setDevice('nmos')} />

      {/* output hit-target → full inverter */}
      <g className="cursor-pointer" onClick={() => setDevice('cmos-inverter')}>
        <circle cx={CX} cy={OUT_Y} r={10} fill="transparent" />
        <circle cx={VOUT_X} cy={OUT_Y} r={10} fill="transparent" />
      </g>

      {/* rail labels — fill adapts to theme (light on dark, dark on light) */}
      <g fill="rgb(var(--ink))" fontSize={11} fontFamily="var(--font-mono)">
        <text x={CX} y={VDD_Y - 6} textAnchor="middle">VDD</text>
        <text x={22} y={OUT_Y + 4} textAnchor="end">Vin</text>
        <text x={VOUT_X + 5} y={OUT_Y + 4}>Vout</text>
        <text x={162} y={OUT_Y + 32} fontSize={9} fill={INK}>CL</text>
      </g>
      {/* device labels on the LEFT (gate side) — keeps them clear of the GND
          symbol & Vout/CL on the right, which was causing confusion */}
      <g fontSize={10} fontWeight={600} textAnchor="end">
        <text x={CX - 32} y={PMOS_Y + 4} fill={pmosOn ? ACC : 'rgb(var(--ink))'} style={pmosOn ? GLOW : undefined} className="cursor-pointer" onClick={() => setDevice('pmos')}>PMOS</text>
        <text x={CX - 32} y={NMOS_Y + 4} fill={nmosOn ? ACC : 'rgb(var(--ink))'} style={nmosOn ? GLOW : undefined} className="cursor-pointer" onClick={() => setDevice('nmos')}>NMOS</text>
      </g>
    </svg>
  );
}

/**
 * An enhancement-MOSFET glyph (gate electrode on the left, channel bar + three
 * contacts on the right, drain/source leads top & bottom). The body is tied to
 * the source side; PMOS carries the gate bubble. All terminal tips land exactly
 * at cy ± T so the surrounding rails connect cleanly.
 */
function Transistor({
  cx,
  cy,
  type,
  sourceSide,
  active,
  onClick,
}: {
  cx: number;
  cy: number;
  type: 'pmos' | 'nmos';
  sourceSide: 'top' | 'bottom';
  active: boolean;
  onClick: () => void;
}) {
  const col = active ? ACC : INK;
  const w = active ? 2.4 : 1.6;
  const gateTip = type === 'pmos' ? cx - 21 : cx - 16; // bubble sits between lead + electrode for PMOS
  // bulk tie: middle contact → the source-side lead
  const bulkY = sourceSide === 'top' ? cy - 12 : cy + 12;

  return (
    <g className="cursor-pointer" onClick={onClick} stroke={col} strokeWidth={w} fill="none" strokeLinecap="round" style={active ? GLOW : undefined}>
      {/* invisible hit area */}
      <rect x={cx - 26} y={cy - T} width={48} height={T * 2} fill="transparent" stroke="none" />
      {/* drain / source leads (tips at cy ± T) */}
      <line x1={cx} y1={cy - 12} x2={cx} y2={cy - T} />
      <line x1={cx} y1={cy + 12} x2={cx} y2={cy + T} />
      {/* channel bar + three contact stubs */}
      <line x1={cx - 9} y1={cy - 13} x2={cx - 9} y2={cy + 13} />
      <line x1={cx - 9} y1={cy - 12} x2={cx} y2={cy - 12} />
      <line x1={cx - 9} y1={cy} x2={cx} y2={cy} />
      <line x1={cx - 9} y1={cy + 12} x2={cx} y2={cy + 12} />
      {/* body tied to source */}
      <line x1={cx} y1={cy} x2={cx} y2={bulkY} />
      {/* gate electrode + lead from the shared bus */}
      <line x1={cx - 16} y1={cy - 12} x2={cx - 16} y2={cy + 12} />
      <line x1={GATE_BUS} y1={cy} x2={gateTip} y2={cy} />
      {type === 'pmos' && <circle cx={cx - 18.5} cy={cy} r={2.5} stroke={col} />}
    </g>
  );
}
