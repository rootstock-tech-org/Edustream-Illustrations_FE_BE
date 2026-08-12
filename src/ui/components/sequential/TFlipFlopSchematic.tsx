'use client';

/**
 * T flip-flop drawn as a flat 2-D schematic, matching the classic textbook
 * figure: T and CLK feed two 3-input AND gates (each also taking Q/Q̄ feedback)
 * that drive a cross-coupled NOR latch → Q / Q̄. Pure black-on-white SVG, no 3-D.
 */

const STROKE = '#111827';
const SW = 2;

const Wire = ({ d }: { d: string }) => <path d={d} fill="none" stroke={STROKE} strokeWidth={SW} strokeLinejoin="round" strokeLinecap="round" />;
const Dot = ({ cx, cy }: { cx: number; cy: number }) => <circle cx={cx} cy={cy} r={3} fill={STROKE} />;

// 3-input AND gate (flat back, round front, no bubble).
function And({ x, y }: { x: number; y: number }) {
  const sw = 26;
  const r = 22; // half-height → body height 44
  return <path d={`M ${x} ${y} h ${sw} a ${r} ${r} 0 0 1 0 ${2 * r} h ${-sw} z`} fill="#ffffff" stroke={STROKE} strokeWidth={SW} strokeLinejoin="round" />;
}

// 2-input NOR gate (OR body + output bubble).
function Nor({ x, y }: { x: number; y: number }) {
  const w = 52;
  const h = 44;
  const cy = y + h / 2;
  return (
    <g fill="#ffffff" stroke={STROKE} strokeWidth={SW} strokeLinejoin="round">
      <path
        d={`M ${x} ${y} Q ${x + w * 0.5} ${y} ${x + w} ${cy} Q ${x + w * 0.5} ${y + h} ${x} ${y + h} Q ${x + w * 0.28} ${cy} ${x} ${y} Z`}
      />
      <circle cx={x + w + 5} cy={cy} r={5} />
    </g>
  );
}

export function TFlipFlopSchematic({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 500 236" className={`h-auto w-full ${className}`} role="img" aria-label="T flip-flop circuit">
      <rect x="0" y="0" width="500" height="236" fill="#ffffff" />

      {/* ── inputs ──────────────────────────────────────────────────── */}
      {/* T → top input of both AND gates */}
      <text x="24" y="55" fontSize="15" fontWeight="700" fill={STROKE} fontFamily="ui-sans-serif, system-ui">T</text>
      <Wire d="M 40 51 H 120" />
      <Wire d="M 120 51 V 161" />
      <Wire d="M 120 51 H 170" />
      <Wire d="M 120 161 H 170" />
      <Dot cx={120} cy={51} />
      <Dot cx={120} cy={161} />

      {/* CLK → middle input of both AND gates */}
      <text x="14" y="119" fontSize="14" fontWeight="700" fill={STROKE} fontFamily="ui-sans-serif, system-ui">CLK</text>
      <Wire d="M 40 115 H 138" />
      <Wire d="M 138 62 V 172" />
      <Wire d="M 138 62 H 170" />
      <Wire d="M 138 172 H 170" />
      <Dot cx={138} cy={115} />

      {/* ── AND outputs → cross-coupled NOR latch ───────────────────── */}
      {/* AND1 out → NOR1 top input */}
      <Wire d="M 218 62 H 300 V 65 H 330" />
      {/* AND2 out → NOR2 bottom input */}
      <Wire d="M 218 172 H 300 V 171 H 330" />

      {/* NOR cross-coupling */}
      {/* NOR1 out → NOR2 top input */}
      <Wire d="M 392 74 H 410 V 112 H 312 V 153 H 330" />
      <Dot cx={410} cy={74} />
      {/* NOR2 out → NOR1 bottom input */}
      <Wire d="M 392 162 H 424 V 100 H 300 V 83 H 330" />
      <Dot cx={424} cy={162} />

      {/* ── outputs ─────────────────────────────────────────────────── */}
      <Wire d="M 392 74 H 470" />
      <text x="476" y="79" fontSize="15" fontWeight="700" fill={STROKE} fontFamily="ui-sans-serif, system-ui">Q</text>
      <Wire d="M 392 162 H 470" />
      <text x="476" y="167" fontSize="15" fontWeight="700" fill={STROKE} fontFamily="ui-sans-serif, system-ui">Q̄</text>

      {/* ── outer feedback loops (cross-coupled to the AND gates) ────── */}
      {/* Q → AND2 (bottom) 3rd input — loop over the top */}
      <Wire d="M 452 74 V 24 H 150 V 183 H 170" />
      <Dot cx={452} cy={74} />
      {/* Q̄ → AND1 (top) 3rd input — loop under the bottom */}
      <Wire d="M 440 162 V 212 H 158 V 73 H 170" />
      <Dot cx={440} cy={162} />

      {/* ── gates (above the wires) ─────────────────────────────────── */}
      <And x={170} y={40} />
      <And x={170} y={150} />
      <Nor x={330} y={52} />
      <Nor x={330} y={140} />
    </svg>
  );
}
