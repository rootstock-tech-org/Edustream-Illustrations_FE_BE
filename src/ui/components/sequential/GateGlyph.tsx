/** A small NAND-gate glyph (flat body + bubble), colour-coded live by its
 *  output voltage — green when high, muted when low. Colour changes fade in
 *  smoothly, and a `pulseKey` (bump it on every clock pulse) triggers a
 *  staggered flash so the signal visibly sweeps through the circuit. Reused
 *  across every flip-flop diagram so the visual language stays consistent. */
export function NandGateGlyph({
  x,
  y,
  w = 46,
  h = 26,
  label,
  high,
  pulseKey,
  pulseDelayMs = 0,
}: {
  x: number;
  y: number;
  w?: number;
  h?: number;
  label: string;
  high: boolean;
  pulseKey?: number;
  pulseDelayMs?: number;
}) {
  const color = high ? '#22c55e' : 'rgb(var(--ink-muted))';
  const r = h / 2;
  const body = `M ${x} ${y} h ${w - r} a ${r} ${r} 0 0 1 0 ${h} h -${w - r} Z`;
  const transition = { transition: 'stroke 350ms ease, fill 350ms ease' };
  return (
    <g key={pulseKey} className={pulseKey ? 'gate-flash' : undefined} style={pulseKey ? { animationDelay: `${pulseDelayMs}ms` } : undefined}>
      <path d={body} fill="none" stroke={color} strokeWidth={1.6} style={transition} />
      <circle cx={x + w + 3} cy={y + r} r={2.6} fill="none" stroke={color} strokeWidth={1.4} style={transition} />
      <text x={x + (w - r) / 2} y={y + r + 3} textAnchor="middle" fontSize={9} fontFamily="var(--font-mono)" fill={color} fontWeight={700} style={transition}>
        {label}
      </text>
    </g>
  );
}

/** A plain labelled wire endpoint (external input pin). */
export function InputPin({ x, y, label, align = 'end' }: { x: number; y: number; label: string; align?: 'start' | 'end' | 'middle' }) {
  return (
    <text x={x} y={y + 3} textAnchor={align} fontSize={9} fontFamily="var(--font-mono)" fill="rgb(var(--ink-muted))">
      {label}
    </text>
  );
}
