'use client';
import { FAB_STAGES, type FabStage } from '@/domain/education/fab-process';

/**
 * CMOS fabrication cross-section — a NEW illustration (separate from the device
 * explorers) that redraws, stage by stage, the 180 nm CMOS process from the deck:
 * a PMOS (left, in an n-well) beside an NMOS (right, in a p-well), isolated by
 * three STI regions. Colours follow the reference PDF exactly — purple silicon
 * wafer, pale-yellow STI/field oxide, blue silicon nitride, gold gate oxide,
 * pink photoresist, orange polysilicon, hatched wells, bright-yellow BPSG/IMD,
 * blue metal, grey tungsten plugs, orange passivation. Pure presentational SVG.
 */

// ── PDF-matched palette ──────────────────────────────────────────────────────
const C = {
  bg: '#ffffff',
  substrate: '#7c1178', // "Silicon Wafer" purple
  substrateEdge: '#4c0a4a',
  sti: '#f5efa6', // pale-yellow field / STI oxide
  stiEdge: '#b8ad46',
  nitride: '#5a83b3', // silicon nitride (blue)
  oxide: '#e7d24a', // pad / gate oxide (gold)
  resist: '#f2157a', // photoresist (pink)
  poly: '#ea7d1e', // polysilicon (orange)
  polyEdge: '#a8530a',
  spacer: '#5a83b3', // spacer sidewall (nitride/oxide, blue)
  bpsg: '#f8e63a', // BPSG / IMD (bright yellow)
  bpsgEdge: '#cbb92a',
  metal: '#7aa2d8', // AlCu metal
  metalEdge: '#4c6ea8',
  tungsten: '#cfcfd6', // W plug (grey)
  tungstenEdge: '#9a9aa4',
  passiv: '#f0902a', // passivation (orange)
  salicide: '#2fbcd6', // cobalt silicide (teal)
  nplus: '#4f86c6', // n⁺ S/D
  pplus: '#c85a9a', // p⁺ S/D
  edge: '#3a3a3a',
  label: '#20232a',
} as const;

// ── geometry ─────────────────────────────────────────────────────────────────
const W = 520;
const H = 300;
const SURF = 196; // silicon surface
const STIS: ReadonlyArray<readonly [number, number]> = [
  [8, 58],
  [222, 298],
  [462, 512],
];
const ACTIVE: ReadonlyArray<{ x0: number; x1: number; gate: number; kind: 'p' | 'n' }> = [
  { x0: 58, x1: 222, gate: 140, kind: 'p' }, // PMOS in n-well (left)
  { x0: 298, x1: 462, gate: 380, kind: 'n' }, // NMOS in p-well (right)
];
const GHW = 26; // gate half-width

// rounded-bottom "tub" (a well)
const tub = (x0: number, x1: number, depth: number, r = 16) => {
  const yb = SURF + depth;
  return `M ${x0} ${SURF} L ${x0} ${yb - r} Q ${x0} ${yb} ${x0 + r} ${yb} L ${x1 - r} ${yb} Q ${x1} ${yb} ${x1} ${yb - r} L ${x1} ${SURF} Z`;
};
// STI trapezoid (wider at the top, tapering into the silicon)
const stiPath = (x0: number, x1: number) => {
  const inset = 8;
  const top = SURF - 4;
  const bot = SURF + 44;
  return `M ${x0} ${top} L ${x1} ${top} L ${x1 - inset} ${bot} L ${x0 + inset} ${bot} Z`;
};

function Arrows({ x0, x1, color, count = 6 }: { x0: number; x1: number; color: string; count?: number }) {
  const items = [];
  for (let k = 0; k < count; k++) {
    const x = x0 + ((x1 - x0) * (k + 0.5)) / count;
    items.push(
      <g key={k}>
        <line x1={x} y1={40} x2={x} y2={SURF - 18} stroke={color} strokeWidth="1.4" />
        <polygon points={`${x - 3},${SURF - 22} ${x + 3},${SURF - 22} ${x},${SURF - 15}`} fill={color} />
      </g>,
    );
  }
  return <>{items}</>;
}

export function FabricationIllustration({ stage }: { stage: FabStage }) {
  const idx = FAB_STAGES.indexOf(stage);
  const ge = (s: FabStage) => idx >= FAB_STAGES.indexOf(s);
  const at = (s: FabStage) => stage === s;
  const preSTI = !ge('sti'); // wafer … stifill: flat films, then trenches

  const sdColor = (k: 'p' | 'n') => (k === 'p' ? C.pplus : C.nplus);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`CMOS fabrication cross-section: ${stage}`}>
      <defs>
        <pattern id="fabNwell" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="8" height="8" fill="#eef5fc" />
          <line x1="0" y1="0" x2="0" y2="8" stroke="#6aa6de" strokeWidth="1.1" />
        </pattern>
        <pattern id="fabPwell" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="8" height="8" fill="#fdf0e2" />
          <line x1="0" y1="0" x2="0" y2="8" stroke="#e39a52" strokeWidth="1.1" />
        </pattern>
      </defs>

      {/* white slide background (matches the deck) */}
      <rect x="0" y="0" width={W} height={H} fill={C.bg} />

      {/* silicon wafer */}
      <rect x="0" y={SURF} width={W} height={H - SURF} fill={C.substrate} stroke={C.substrateEdge} strokeWidth="1" />
      <text x={W - 8} y={H - 8} textAnchor="end" fontSize="11" fill="#ffffff" opacity="0.9">Silicon Wafer</text>

      {/* ── PRE-STI: flat film stack + trench states ─────────────────────────── */}
      {preSTI && (ge('padox') || ge('nitride')) && (
        <>
          {ge('padox') && <rect x="0" y={SURF - 5} width={W} height="5" fill={C.oxide} />}
          {ge('nitride') && <rect x="0" y={SURF - 16} width={W} height="11" fill={C.nitride} />}
          {ge('nitride') && (
            <text x={W - 8} y={SURF - 22} textAnchor="end" fontSize="10" fill={C.nitride}>Silicon Nitride</text>
          )}
        </>
      )}
      {preSTI &&
        (at('trench') || at('stifill')) &&
        STIS.map(([x0, x1], k) => (
          <g key={`tr-${k}`}>
            {/* trench cut through films + into silicon */}
            <rect x={x0} y={SURF - 16} width={x1 - x0} height={46 + 16} fill={C.bg} />
            {at('stifill') && (
              <>
                {/* HDP oxide overfilling the trench (bump above surface) */}
                <rect x={x0 - 3} y={SURF - 14} width={x1 - x0 + 6} height={58} rx="3" fill={C.sti} stroke={C.stiEdge} strokeWidth="0.75" />
              </>
            )}
          </g>
        ))}

      {/* ── POST-STI device cross-section ────────────────────────────────────── */}
      {ge('sti') && (
        <>
          {/* wells (hatched) */}
          {ge('wells') &&
            ACTIVE.map((a, k) => (
              <path key={`well-${k}`} d={tub(a.x0, a.x1, 82)} fill={`url(#${a.kind === 'p' ? 'fabNwell' : 'fabPwell'})`} stroke={C.edge} strokeWidth="0.6" opacity="0.95" />
            ))}
          {/* STI isolation */}
          {STIS.map(([x0, x1], k) => (
            <path key={`sti-${k}`} d={stiPath(x0, x1)} fill={C.sti} stroke={C.stiEdge} strokeWidth="0.9" />
          ))}
        </>
      )}

      {/* implant arrows on the active implant stages */}
      {at('wells') && (
        <>
          <Arrows x0={58} x1={222} color="#7ac043" count={6} />
          <Arrows x0={298} x1={462} color="#e0479b" count={6} />
        </>
      )}
      {(at('sde') || at('sd')) && <Arrows x0={40} x1={488} color="#e08a1e" count={12} />}

      {/* gate oxide + BPSG (drawn before poly so poly reads as embedded in BPSG) */}
      {ge('gateox') &&
        ACTIVE.map((a, k) => <rect key={`gox-${k}`} x={a.gate - GHW - 2} y={SURF - 4} width={GHW * 2 + 4} height="4" fill={C.oxide} />)}
      {ge('contact') && <rect x="0" y={SURF - 58} width={W} height="58" fill={C.bpsg} stroke={C.bpsgEdge} strokeWidth="0.6" />}

      {/* source/drain diffusions */}
      {ge('sde') &&
        ACTIVE.map((a, k) => {
          const col = sdColor(a.kind);
          const deep = ge('sd');
          const h = deep ? 20 : 8;
          const outer = deep ? 66 : 58;
          return (
            <g key={`sd-${k}`}>
              <rect x={a.gate - outer} y={SURF} width={outer - 30} height={h} fill={col} opacity="0.85" />
              <rect x={a.gate + 30} y={SURF} width={outer - 30} height={h} fill={col} opacity="0.85" />
            </g>
          );
        })}

      {/* poly gates + spacers + salicide caps */}
      {ACTIVE.map((a, k) => (
        <g key={`gate-${k}`}>
          {ge('spacer') && (
            <>
              <path d={`M ${a.gate - GHW} ${SURF - 30} L ${a.gate - GHW} ${SURF - 4} L ${a.gate - GHW - 11} ${SURF - 4} Q ${a.gate - GHW - 11} ${SURF - 22} ${a.gate - GHW} ${SURF - 30} Z`} fill={C.spacer} />
              <path d={`M ${a.gate + GHW} ${SURF - 30} L ${a.gate + GHW} ${SURF - 4} L ${a.gate + GHW + 11} ${SURF - 4} Q ${a.gate + GHW + 11} ${SURF - 22} ${a.gate + GHW} ${SURF - 30} Z`} fill={C.spacer} />
            </>
          )}
          {ge('poly') && <rect x={a.gate - GHW} y={SURF - 32} width={GHW * 2} height="28" rx="2" fill={C.poly} stroke={C.polyEdge} strokeWidth="0.8" />}
          {ge('salicide') && (
            <>
              <rect x={a.gate - GHW} y={SURF - 35} width={GHW * 2} height="4" fill={C.salicide} />
              <rect x={a.gate - 66} y={SURF - 2} width={36} height="4" fill={C.salicide} />
              <rect x={a.gate + 30} y={SURF - 2} width={36} height="4" fill={C.salicide} />
            </>
          )}
        </g>
      ))}

      {/* 1st interconnect: tungsten plugs + Metal-1 */}
      {ge('contact') && (
        <>
          {[93, 187, 333, 427].map((x) => (
            <rect key={`w-${x}`} x={x - 4} y={150} width={8} height={SURF - 150} fill={C.tungsten} stroke={C.tungstenEdge} strokeWidth="0.5" />
          ))}
          <rect x="85" y="142" width="110" height="10" rx="2" fill={C.metal} stroke={C.metalEdge} strokeWidth="0.6" />
          <rect x="325" y="142" width="110" height="10" rx="2" fill={C.metal} stroke={C.metalEdge} strokeWidth="0.6" />
          <text x={W - 8} y="150" textAnchor="end" fontSize="10" fill={C.label}>Metal-1</text>
        </>
      )}

      {/* upper interconnect: IMD + vias + Metal-2 */}
      {ge('metal2') && (
        <>
          <rect x="0" y="112" width={W} height="30" fill={C.bpsg} stroke={C.bpsgEdge} strokeWidth="0.6" />
          {[140, 380].map((x) => (
            <rect key={`via-${x}`} x={x - 4} y={112} width={8} height={30} fill={C.tungsten} stroke={C.tungstenEdge} strokeWidth="0.5" />
          ))}
          <rect x="70" y="104" width="380" height="10" rx="2" fill={C.metal} stroke={C.metalEdge} strokeWidth="0.6" />
          <text x={W - 8} y="112" textAnchor="end" fontSize="10" fill={C.label}>Metal-2</text>
        </>
      )}

      {/* passivation + bond-pad opening */}
      {ge('passiv') && (
        <>
          <rect x="0" y="80" width="236" height="24" fill={C.passiv} />
          <rect x="284" y="80" width={W - 284} height="24" fill={C.passiv} />
          <rect x="240" y="94" width="44" height="10" fill={C.metal} stroke={C.metalEdge} strokeWidth="0.6" />
          <text x="262" y="74" textAnchor="middle" fontSize="10" fill="#8a4a12">bond pad</text>
        </>
      )}

      {/* region labels */}
      {ge('wells') && !ge('contact') && (
        <>
          <text x="140" y={SURF + 54} textAnchor="middle" fontSize="11" fill={C.label}>n-well</text>
          <text x="380" y={SURF + 54} textAnchor="middle" fontSize="11" fill={C.label}>p-well</text>
        </>
      )}
      {ge('sti') && !ge('contact') && (
        <text x="260" y={SURF + 24} textAnchor="middle" fontSize="9" fill="#7a6f1e">STI</text>
      )}
      {ge('poly') && !ge('contact') && (
        <>
          <text x="140" y={SURF - 40} textAnchor="middle" fontSize="9" fill={C.polyEdge}>PMOS</text>
          <text x="380" y={SURF - 40} textAnchor="middle" fontSize="9" fill={C.polyEdge}>NMOS</text>
        </>
      )}
    </svg>
  );
}
