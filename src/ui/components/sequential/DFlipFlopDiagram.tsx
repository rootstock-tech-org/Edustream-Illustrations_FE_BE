/**
 * D flip-flop: master-slave, drawn at the same block-diagram level of detail
 * as the reference chart (Master Latch → Slave Latch), each block internally
 * a real cross-coupled NAND pair gated by CLK̄ / CLK respectively — the small
 * dot inside each block reflects that block's live internal state (QM, Q).
 */
export function DFlipFlopDiagram({ vdd, qm, q, pulseTick }: { vdd: number; qm: number; q: number; pulseTick: number }) {
  const hi = (v: number) => v > vdd / 2;
  const stroke = 'rgb(var(--ink-muted))';
  const dot = (v: number) => (hi(v) ? '#22c55e' : 'rgb(var(--ink-muted))');
  return (
    <svg viewBox="0 0 320 140" className="h-auto w-full" role="img" aria-label="D flip-flop master-slave schematic">
      <g stroke={stroke} strokeWidth={1.2} fill="none" className="wire-flow">
        <line x1={10} y1={35} x2={70} y2={35} /> {/* D */}
        <line x1={10} y1={95} x2={70} y2={95} /> {/* CLK -> master (inverted) */}
        <circle cx={62} cy={95} r={3} />
        <line x1={160} y1={45} x2={210} y2={45} /> {/* QM -> slave D */}
        <line x1={10} y1={95} x2={40} y2={95} />
        <line x1={40} y1={95} x2={40} y2={110} />
        <line x1={40} y1={110} x2={210} y2={110} /> {/* CLK -> slave (direct) */}
        <line x1={300} y1={45} x2={314} y2={45} /> {/* Q out */}
      </g>
      <text x={6} y={32} fontSize={9} fontFamily="var(--font-mono)" fill="rgb(var(--ink-muted))">D</text>
      <text x={6} y={92} fontSize={9} fontFamily="var(--font-mono)" fill="rgb(var(--ink-muted))">CLK</text>
      <text x={316} y={48} fontSize={9} fontFamily="var(--font-mono)" textAnchor="end" fill="rgb(var(--ink-muted))">Q</text>

      <rect key={`m-${pulseTick}`} x={70} y={15} width={90} height={60} rx={8} fill="none" stroke={stroke} strokeWidth={1.4} className="gate-flash" style={{ animationDelay: '0ms' }} />
      <text x={115} y={30} textAnchor="middle" fontSize={9} fontWeight={700} fill="rgb(var(--ink))">Master Latch</text>
      <text x={115} y={53} textAnchor="middle" fontSize={8} fontFamily="var(--font-mono)" fill="rgb(var(--ink-muted))">2× NAND, en CLK̄</text>
      <circle cx={115} cy={62} r={4} fill={dot(qm)} style={{ transition: 'fill 350ms ease' }} />
      <text x={126} y={65} fontSize={8} fontFamily="var(--font-mono)" fill="rgb(var(--ink-muted))">QM</text>

      <rect key={`s-${pulseTick}`} x={210} y={15} width={90} height={60} rx={8} fill="none" stroke={stroke} strokeWidth={1.4} className="gate-flash" style={{ animationDelay: '260ms' }} />
      <text x={255} y={30} textAnchor="middle" fontSize={9} fontWeight={700} fill="rgb(var(--ink))">Slave Latch</text>
      <text x={255} y={53} textAnchor="middle" fontSize={8} fontFamily="var(--font-mono)" fill="rgb(var(--ink-muted))">2× NAND, en CLK</text>
      <circle cx={255} cy={62} r={4} fill={dot(q)} style={{ transition: 'fill 350ms ease' }} />
      <text x={266} y={65} fontSize={8} fontFamily="var(--font-mono)" fill="rgb(var(--ink-muted))">Q</text>
    </svg>
  );
}
