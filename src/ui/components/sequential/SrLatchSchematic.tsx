'use client';

/**
 * Gated SR latch ("SR Flip-Flop") drawn as a flat 2-D schematic, matching the
 * classic textbook figure: S and R (each gated by CLK) drive two input NANDs
 * that feed a cross-coupled NAND pair → Q / Q̄. Pure black-on-white SVG, no 3-D.
 */

const STROKE = '#111827';
const SW = 2;

// One 2-input NAND gate (AND body + output bubble) with its two input stubs.
function Nand({ x, y, label }: { x: number; y: number; label?: string }) {
  const sw = 26; // straight (left) portion width
  const r = 20; // half-height → arc radius (body height = 40)
  const bub = 5; // output bubble radius
  const cy = y + r;
  const tip = x + sw + r; // rightmost point of the AND body
  return (
    <g fill="none" stroke={STROKE} strokeWidth={SW} strokeLinejoin="round" strokeLinecap="round">
      {/* AND-shaped body */}
      <path d={`M ${x} ${y} h ${sw} a ${r} ${r} 0 0 1 0 ${2 * r} h ${-sw} z`} fill="#ffffff" />
      {/* inverting bubble */}
      <circle cx={tip + bub} cy={cy} r={bub} fill="#ffffff" />
      {label && (
        <text x={x + 14} y={cy + 4} fontSize="11" fill={STROKE} stroke="none" textAnchor="middle" fontFamily="ui-sans-serif, system-ui">
          {label}
        </text>
      )}
    </g>
  );
}

const Wire = ({ d }: { d: string }) => <path d={d} fill="none" stroke={STROKE} strokeWidth={SW} strokeLinejoin="round" strokeLinecap="round" />;
const Dot = ({ cx, cy }: { cx: number; cy: number }) => <circle cx={cx} cy={cy} r={3} fill={STROKE} />;

export function SrLatchSchematic({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 480 210" className={`h-auto w-full ${className}`} role="img" aria-label="SR flip-flop (gated SR latch) circuit">
      <rect x="0" y="0" width="480" height="210" fill="#ffffff" />

      {/* ── input signals ───────────────────────────────────────────── */}
      {/* S → G1 top input */}
      <Wire d="M 40 46 H 150" />
      <text x="26" y="50" fontSize="15" fontWeight="700" fill={STROKE} fontFamily="ui-sans-serif, system-ui">S</text>

      {/* CLK → vertical bus → G1 bottom input + G2 top input */}
      <Wire d="M 40 108 H 110" />
      <Wire d="M 110 62 V 154" />
      <Wire d="M 110 62 H 150" />
      <Wire d="M 110 154 H 150" />
      <Dot cx={110} cy={108} />
      <text x="10" y="112" fontSize="14" fontWeight="700" fill={STROKE} fontFamily="ui-sans-serif, system-ui">CLK</text>

      {/* R → G2 bottom input */}
      <Wire d="M 40 170 H 150" />
      <text x="26" y="174" fontSize="15" fontWeight="700" fill={STROKE} fontFamily="ui-sans-serif, system-ui">R</text>

      {/* ── input NANDs → cross-coupled pair ────────────────────────── */}
      {/* G1 out → G3 top input */}
      <Wire d="M 206 54 H 280 V 78 H 320" />
      {/* G2 out → G4 bottom input */}
      <Wire d="M 206 154 H 280 V 166 H 320" />

      {/* ── outputs + cross-coupled feedback ────────────────────────── */}
      {/* Q out */}
      <Wire d="M 376 86 H 452" />
      <text x="458" y="90" fontSize="15" fontWeight="700" fill={STROKE} fontFamily="ui-sans-serif, system-ui">Q</text>
      {/* Q̄ out */}
      <Wire d="M 376 158 H 452" />
      <text x="458" y="163" fontSize="15" fontWeight="700" fill={STROKE} fontFamily="ui-sans-serif, system-ui">Q̄</text>

      {/* Q feedback → G4 top input (crosses down) */}
      <Wire d="M 404 86 V 122 H 298 V 150 H 320" />
      <Dot cx={404} cy={86} />
      {/* Q̄ feedback → G3 bottom input (crosses up) */}
      <Wire d="M 428 158 V 106 H 290 V 94 H 320" />
      <Dot cx={428} cy={158} />

      {/* ── gates (drawn last so they sit above the wires) ──────────── */}
      <Nand x={150} y={34} />
      <Nand x={150} y={138} />
      <Nand x={320} y={66} />
      <Nand x={320} y={138} />
    </svg>
  );
}
