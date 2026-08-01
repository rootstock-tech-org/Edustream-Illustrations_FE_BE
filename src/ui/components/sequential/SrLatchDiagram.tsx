import { NandGateGlyph, InputPin } from './GateGlyph';

/**
 * Gated SR latch: G1=NAND(S,CLK), G2=NAND(R,CLK), Q=NAND(G1,Q̄), Q̄=NAND(G2,Q).
 * The two feedback lanes on the right are exactly the cross-coupled wires
 * that give the latch memory.
 */
export function SrLatchDiagram({
  vdd,
  g1,
  g2,
  q,
  qBar,
  pulseTick,
}: {
  vdd: number;
  g1: number;
  g2: number;
  q: number;
  qBar: number;
  pulseTick: number;
}) {
  const hi = (v: number) => v > vdd / 2;
  const stroke = 'rgb(var(--ink-muted))';
  return (
    <svg viewBox="0 0 320 170" className="h-auto w-full" role="img" aria-label="Gated SR latch, 4-NAND cross-coupled schematic">
      <g stroke={stroke} strokeWidth={1.2} fill="none" className="wire-flow">
        {/* S / R input wires */}
        <line x1={14} y1={27} x2={50} y2={27} />
        <line x1={14} y1={117} x2={50} y2={117} />
        {/* CLK bus */}
        <line x1={30} y1={39} x2={30} y2={129} />
        <line x1={30} y1={39} x2={50} y2={39} />
        <line x1={30} y1={129} x2={50} y2={129} />
        {/* G1 -> Q, G2 -> Q̄ */}
        <line x1={99} y1={33} x2={210} y2={27} />
        <line x1={99} y1={123} x2={210} y2={117} />
        {/* feedback: Q̄ -> Q (upper lane), Q -> Q̄ (lower lane) */}
        <polyline points="259,123 280,123 280,39 210,39" />
        <polyline points="259,33 295,33 295,129 210,129" />
      </g>
      <InputPin x={10} y={27} label="S" align="end" />
      <InputPin x={10} y={117} label="R" align="end" />
      <InputPin x={22} y={13} label="CLK" align="middle" />

      <NandGateGlyph x={50} y={20} label="G1" high={hi(g1)} pulseKey={pulseTick} pulseDelayMs={0} />
      <NandGateGlyph x={50} y={110} label="G2" high={hi(g2)} pulseKey={pulseTick} pulseDelayMs={0} />
      <NandGateGlyph x={210} y={20} label="Q" high={hi(q)} pulseKey={pulseTick} pulseDelayMs={220} />
      <NandGateGlyph x={210} y={110} label="Q̄" high={hi(qBar)} pulseKey={pulseTick} pulseDelayMs={220} />
    </svg>
  );
}
