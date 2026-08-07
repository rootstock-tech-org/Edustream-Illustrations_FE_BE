'use client';
import { useState } from 'react';
import dynamic from 'next/dynamic';
import type { GateKind } from '../logic/GateSymbols';
import { ToggleButton } from '../sequential/FlipFlopShell';
import { noseX as gateNoseX, isInverting, BUBBLE_R } from '@/viz/logic3d/gateShape';
import type { Gate3DSpec, Wire3DSpec, Label3DSpec } from '@/viz/logic3d/Schematic3D';

const Schematic3D = dynamic(() => import('@/viz/logic3d/Schematic3D').then((m) => m.Schematic3D), {
  ssr: false,
  loading: () => <div className="h-[160px] w-full animate-pulse rounded-lg bg-surface-elevated" />,
});

/**
 * Logic Gates — page 1 of the reference sheet, now as interactive 3D: the eight
 * fundamental gates (YES/NOT/AND/OR/XOR/NAND/NOR/XNOR) rendered as extruded
 * ANSI bodies with tube wires, each beside its full truth table (grouped
 * INPUT / OUTPUT header). Toggling A/B lights the gate live and highlights the
 * matching truth-table row.
 */

type GateDef = {
  kind: GateKind;
  name: string;
  inputs: 1 | 2;
  fn: (a: boolean, b: boolean) => boolean;
};

const GATES: readonly GateDef[] = [
  { kind: 'buffer', name: 'YES', inputs: 1, fn: (a) => a },
  { kind: 'not', name: 'NOT', inputs: 1, fn: (a) => !a },
  { kind: 'and', name: 'AND', inputs: 2, fn: (a, b) => a && b },
  { kind: 'or', name: 'OR', inputs: 2, fn: (a, b) => a || b },
  { kind: 'xor', name: 'XOR', inputs: 2, fn: (a, b) => a !== b },
  { kind: 'nand', name: 'NAND', inputs: 2, fn: (a, b) => !(a && b) },
  { kind: 'nor', name: 'NOR', inputs: 2, fn: (a, b) => !(a || b) },
  { kind: 'xnor', name: 'XNOR', inputs: 2, fn: (a, b) => a === b },
];

/** Reference row order: A then B counting 00, 10, 01, 11. */
const TWO_INPUT_ROWS: ReadonlyArray<readonly [boolean, boolean]> = [
  [false, false],
  [true, false],
  [false, true],
  [true, true],
];
const ONE_INPUT_ROWS: ReadonlyArray<readonly [boolean, boolean]> = [
  [false, false],
  [true, false],
];

export function LogicGatesSection({ onClose }: { onClose: () => void }) {
  return (
    <main className="flex h-[100dvh] flex-col gap-3 overflow-hidden p-3 md:p-4">
      <header className="glass flex items-center justify-between gap-3 rounded-2xl px-4 py-2.5">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="rounded-lg bg-black/[0.04] px-3 py-1.5 text-sm font-medium text-ink-muted ring-1 ring-black/10 transition hover:text-ink dark:bg-white/5 dark:ring-white/10"
          >
            ‹ Back
          </button>
          <div className="leading-tight">
            <h1 className="eyebrow text-sm text-ink">Logic Gates</h1>
            <p className="hidden text-[11px] text-ink-muted sm:block">The eight fundamental gates — symbols &amp; truth tables</p>
          </div>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto sm:grid-cols-2 xl:grid-cols-3">
        {GATES.map((g) => (
          <GateCard key={g.name} def={g} />
        ))}
      </div>
    </main>
  );
}

function GateCard({ def }: { def: GateDef }) {
  const [a, setA] = useState(false);
  const [b, setB] = useState(false);
  const out = def.fn(a, def.inputs === 2 ? b : false);
  const rows = def.inputs === 2 ? TWO_INPUT_ROWS : ONE_INPUT_ROWS;
  const activeRow = rows.findIndex(([ra, rb]) => ra === a && (def.inputs === 1 || rb === b));

  return (
    <div className="glass flex flex-col gap-3 rounded-2xl p-4">
      <h3 className="text-center text-lg font-semibold text-ink">{def.name}</h3>

      <div className="overflow-hidden rounded-xl bg-[var(--surface-elevated)] ring-1 ring-black/10 dark:ring-white/10">
        <GateFigure def={def} a={a} b={b} out={out} />
      </div>

      <div className="flex justify-center gap-2">
        <ToggleButton label="A" on={a} onClick={() => setA((v) => !v)} />
        {def.inputs === 2 && <ToggleButton label="B" on={b} onClick={() => setB((v) => !v)} />}
      </div>

      <GateTruthTable def={def} rows={rows} out={def.fn} activeRow={activeRow} />
    </div>
  );
}

/** One gate as a 3D extruded body with input/output tube wires. */
function GateFigure({ def, a, b, out }: { def: GateDef; a: boolean; b: boolean; out: boolean }) {
  const W = 200;
  const H = 96;
  const gx = 70;
  const gy = 28;
  const single = def.inputs === 1;
  const cx = gx + 30;
  const cy = gy + 20;
  const inX = gx + 4;
  const outSvgX = cx + gateNoseX(def.kind) + (isInverting(def.kind) ? 2 * BUBBLE_R : 0);
  const inYs = single ? [cy] : [gy + 12, gy + 28];
  const inStates = single ? [a] : [a, b];

  const wires: Wire3DSpec[] = [
    ...inYs.map((y, i) => ({ points: [[24, y], [inX, y]] as [number, number][], high: inStates[i] })),
    { points: [[outSvgX, cy], [178, cy]] as [number, number][], high: out },
    // CMOS supply rails: HIGH output is pulled up from VDD, LOW output sinks to GND
    { points: [[cx, 9], [cx, gy]] as [number, number][], high: out },
    { points: [[cx, gy + 40], [cx, 87]] as [number, number][], high: !out },
  ];
  const labels: Label3DSpec[] = [
    ...inYs.map((y, i) => ({ x: 18, y, text: single ? 'A' : i === 0 ? 'A' : 'B' })),
    { x: 186, y: cy, text: 'Y' },
    { x: cx, y: 5, text: 'VDD' },
    { x: cx, y: 91, text: 'GND' },
  ];
  const gates: Gate3DSpec[] = [{ kind: def.kind, gx, gy, high: out }];

  return <Schematic3D width={W} height={H} gates={gates} wires={wires} labels={labels} spanWorld={7.5} flow staticView className="h-[160px] w-full" />;
}

/** Reference-style truth table with a grouped INPUT / OUTPUT header. */
function GateTruthTable({
  def,
  rows,
  out,
  activeRow,
}: {
  def: GateDef;
  rows: ReadonlyArray<readonly [boolean, boolean]>;
  out: (a: boolean, b: boolean) => boolean;
  activeRow: number;
}) {
  const two = def.inputs === 2;
  const head = 'border border-[color:var(--hairline)] bg-black/[0.04] px-2 py-1 font-semibold text-ink dark:bg-white/[0.06]';
  const cell = 'border border-[color:var(--hairline)] px-2 py-1 font-mono text-ink';
  return (
    <table className="w-full border-collapse text-center text-[11px]">
      <thead>
        <tr>
          <th className={head} colSpan={two ? 2 : 1}>
            INPUT
          </th>
          <th className={head} rowSpan={2}>
            OUTPUT
          </th>
        </tr>
        <tr>
          <th className={head}>A</th>
          {two && <th className={head}>B</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map(([ra, rb], i) => (
          <tr key={i} className={i === activeRow ? 'bg-[color:var(--accent)]/10' : undefined}>
            <td className={cell}>{ra ? 1 : 0}</td>
            {two && <td className={cell}>{rb ? 1 : 0}</td>}
            <td className={cell}>{out(ra, two ? rb : false) ? 1 : 0}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
