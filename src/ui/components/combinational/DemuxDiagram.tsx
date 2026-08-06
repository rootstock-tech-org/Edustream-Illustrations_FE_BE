'use client';
import { Schematic3DLazy } from '@/viz/logic3d/Schematic3DLazy';
import type { Gate3DSpec, Wire3DSpec, Label3DSpec } from '@/viz/logic3d/Schematic3D';

/**
 * 1:4 demultiplexer, 3D — matches the reference sheet (page 2): D on the left,
 * S₁/S₀ across the top through two inverters, four AND gates driving Y0..Y3.
 * Reproduces the reference equations exactly (S₀-as-MSB ordering):
 *   Y0=D·S̄0·S̄1  Y1=D·S̄0·S1  Y2=D·S0·S̄1  Y3=D·S0·S1.
 * Outputs are computed locally so the lit gate always matches its own label.
 */
export function DemuxDiagram({
  d,
  s1,
  s0,
}: {
  d: boolean;
  s1: boolean;
  s0: boolean;
}) {
  const xS1 = 118, xS1b = 150, xS0 = 176, xS0b = 208, bot = 250, xD = 92, gx = 250;
  const andY = [30, 88, 146, 204];
  const eqn = ['Y0 = D·S̄0·S̄1', 'Y1 = D·S̄0·S1', 'Y2 = D·S0·S̄1', 'Y3 = D·S0·S1'];
  // reference minterms: Y0=S̄1S̄0, Y1=S1S̄0, Y2=S̄1S0, Y3=S1S0
  const out = [d && !s1 && !s0, d && s1 && !s0, d && !s1 && s0, d && s1 && s0];
  const taps: Array<[[boolean, number], [boolean, number]]> = [
    [[!s1, xS1b], [!s0, xS0b]], // Y0: S̄1, S̄0
    [[s1, xS1], [!s0, xS0b]],   // Y1: S1, S̄0
    [[!s1, xS1b], [s0, xS0]],   // Y2: S̄1, S0
    [[s1, xS1], [s0, xS0]],     // Y3: S1, S0
  ];

  const gates: Gate3DSpec[] = [
    ...andY.map((ay, i) => ({ kind: 'and' as const, gx, gy: ay, high: out[i]! })),
    { kind: 'not', gx: xS1 + 6, gy: 18, scale: 0.55, high: !s1 },
    { kind: 'not', gx: xS0 + 6, gy: 18, scale: 0.55, high: !s0 },
  ];

  const wires: Wire3DSpec[] = [
    { points: [[xS1, 22], [xS1, bot]], high: s1 },
    { points: [[xS0, 22], [xS0, bot]], high: s0 },
    { points: [[xS1, 30], [xS1 + 8, 30]], high: s1 },
    { points: [[xS1 + 41, 30], [xS1b, 30], [xS1b, bot]], high: !s1 },
    { points: [[xS0, 30], [xS0 + 8, 30]], high: s0 },
    { points: [[xS0 + 41, 30], [xS0b, 30], [xS0b, bot]], high: !s0 },
    { points: [[16, 150], [xD, 150]], high: d },
    { points: [[xD, andY[0]! + 6], [xD, andY[3]! + 6]], high: d },
  ];
  andY.forEach((ay, i) => {
    const inTop = ay + 6;
    wires.push({ points: [[xD, inTop], [gx + 4, inTop]], high: d });
    taps[i]!.forEach(([hi, tx], k) => {
      const ty = ay + 16 + k * 9;
      wires.push({ points: [[tx, ty], [gx + 4, ty]], high: hi });
    });
    wires.push({ points: [[gx + 48, ay + 20], [gx + 66, ay + 20]], high: out[i]! });
  });

  const labels: Label3DSpec[] = [
    { x: xS1, y: 16, text: 'S₁', bold: true },
    { x: xS0, y: 16, text: 'S₀', bold: true },
    { x: 10, y: 150, text: 'D', bold: true },
    ...andY.map((ay, i) => ({ x: gx + 92, y: ay + 20, text: eqn[i]!, bold: true })),
  ];

  return <Schematic3DLazy width={452} height={300} gates={gates} wires={wires} labels={labels} spanWorld={15} className="h-[300px] w-full" />;
}
