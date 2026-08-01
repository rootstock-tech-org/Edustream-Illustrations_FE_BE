/**
 * T flip-flop: the JK master-slave circuit with J and K both tied to the
 * same T input — the diagram reuses the JK topology but shows the single T
 * line splitting into the J/K pins.
 */
export function TFlipFlopDiagram({ vdd, qm, q, pulseTick }: { vdd: number; qm: number; q: number; pulseTick: number }) {
  const hi = (v: number) => v > vdd / 2;
  const stroke = 'rgb(var(--ink-muted))';
  const dot = (v: number) => (hi(v) ? '#22c55e' : 'rgb(var(--ink-muted))');
  return (
    <svg viewBox="0 0 320 160" className="h-auto w-full" role="img" aria-label="T flip-flop schematic (JK with J=K=T)">
      <g stroke={stroke} strokeWidth={1.2} fill="none" className="wire-flow">
        <line x1={10} y1={35} x2={30} y2={35} /> {/* T */}
        <line x1={30} y1={25} x2={30} y2={45} />
        <line x1={30} y1={25} x2={70} y2={25} /> {/* -> J */}
        <line x1={30} y1={45} x2={70} y2={45} /> {/* -> K */}
        <line x1={10} y1={95} x2={40} y2={95} /> {/* CLK */}
        <line x1={40} y1={95} x2={40} y2={110} />
        <line x1={40} y1={95} x2={70} y2={95} />
        <line x1={40} y1={110} x2={210} y2={110} />
        <line x1={160} y1={45} x2={210} y2={45} /> {/* QM -> slave */}
        <line x1={300} y1={35} x2={314} y2={35} /> {/* Q out */}
        <line x1={300} y1={55} x2={314} y2={55} /> {/* Q̄ out */}
        <polyline points="314,55 314,130 60,130 60,32 70,32" strokeDasharray="3 2" />
        <polyline points="314,35 306,35 306,145 55,145 55,52 70,52" strokeDasharray="3 2" />
      </g>
      <text x={6} y={32} fontSize={9} fontFamily="var(--font-mono)" fill="rgb(var(--ink-muted))">T</text>
      <text x={6} y={92} fontSize={9} fontFamily="var(--font-mono)" fill="rgb(var(--ink-muted))">CLK</text>
      <text x={318} y={38} fontSize={9} fontFamily="var(--font-mono)" textAnchor="end" fill="rgb(var(--ink-muted))">Q</text>
      <text x={318} y={58} fontSize={9} fontFamily="var(--font-mono)" textAnchor="end" fill="rgb(var(--ink-muted))">Q̄</text>
      <text x={160} y={155} textAnchor="middle" fontSize={8} fontFamily="var(--font-mono)" fill="rgb(var(--ink-muted))">J = K = T; feedback (dashed) loops Q, Q̄ back in</text>

      <rect key={`m-${pulseTick}`} x={70} y={15} width={90} height={60} rx={8} fill="none" stroke={stroke} strokeWidth={1.4} className="gate-flash" style={{ animationDelay: '0ms' }} />
      <text x={115} y={30} textAnchor="middle" fontSize={9} fontWeight={700} fill="rgb(var(--ink))">Master Latch</text>
      <text x={115} y={53} textAnchor="middle" fontSize={8} fontFamily="var(--font-mono)" fill="rgb(var(--ink-muted))">3-in NAND + fb</text>
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
