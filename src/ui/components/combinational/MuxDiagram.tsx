'use client';
import { Schematic3DLazy } from '@/viz/logic3d/Schematic3DLazy';
import type { Gate3DSpec, Wire3DSpec, Label3DSpec } from '@/viz/logic3d/Schematic3D';

/**
 * 4:1 multiplexer, 3D — Y = E·S̄1·S̄0·D0 + … + E·S1·S0·D3. Four AND gates (one
 * product term each) feed one OR gate; S1/S0 are complemented by two inverters
 * on the bottom select bus. Extruded gates + tube wires; live from the current
 * selection.
 */
export function MuxDiagram({
  d,
  s1,
  s0,
  y,
}: {
  d: readonly [boolean, boolean, boolean, boolean];
  s1: boolean;
  s0: boolean;
  y: boolean;
}) {
  const sel = (s1 ? 2 : 0) + (s0 ? 1 : 0);
  const andHi = [0, 1, 2, 3].map((i) => i === sel && d[i]!);
  // select buses spread wide apart so the vertical lines never bunch/overlap
  const xE = 48, xS1b = 76, xS1 = 104, xS0b = 132, xS0 = 160;
  const busTop = 14, busBot = 250, gx = 196;
  const andY = [18, 76, 134, 192];
  const terms: Array<Array<[boolean, number]>> = [
    [[true, xE], [!s1, xS1b], [!s0, xS0b]],
    [[true, xE], [!s1, xS1b], [s0, xS0]],
    [[true, xE], [s1, xS1], [!s0, xS0b]],
    [[true, xE], [s1, xS1], [s0, xS0]],
  ];

  const gates: Gate3DSpec[] = [
    ...andY.map((ay, i) => ({ kind: 'and' as const, gx, gy: ay, high: andHi[i]! })),
    { kind: 'or', gx: 300, gy: 87, high: y },
    { kind: 'not', gx: xS1b - 30, gy: 252, scale: 0.55, high: !s1 },
    { kind: 'not', gx: xS0b - 30, gy: 252, scale: 0.55, high: !s0 },
  ];

  const wires: Wire3DSpec[] = [
    { points: [[xE, busTop], [xE, busBot]], high: true },
    { points: [[xS1b, busTop], [xS1b, busBot]], high: !s1 },
    { points: [[xS1, busTop], [xS1, busBot]], high: s1 },
    { points: [[xS0b, busTop], [xS0b, busBot]], high: !s0 },
    { points: [[xS0, busTop], [xS0, busBot]], high: s0 },
    // OR collecting
    { points: [[244, 38], [264, 38], [280, 38], [280, 100], [300, 100]], high: andHi[0]! },
    { points: [[244, 96], [300, 96]], high: andHi[1]! },
    { points: [[244, 154], [264, 154], [284, 154], [284, 112], [300, 112]], high: andHi[2]! },
    { points: [[244, 212], [264, 212], [288, 212], [288, 118], [300, 118]], high: andHi[3]! },
    { points: [[354, 107], [376, 107]], high: y },
    // S1 inverter
    { points: [[xS1, busBot], [xS1, 278]], high: s1 },
    { points: [[xS1, 262], [xS1b + 4, 262]], high: s1 },
    { points: [[xS1b, busBot], [xS1b, 262]], high: !s1 },
    // S0 inverter
    { points: [[xS0, busBot], [xS0, 268], [xS0b + 4, 268]], high: s0 },
    { points: [[xS0b, busBot], [xS0b, 268]], high: !s0 },
  ];
  andY.forEach((ay, i) => {
    const inTop = ay + 6;
    wires.push({ points: [[14, inTop], [gx + 4, inTop]], high: d[i]! });
    terms[i]!.forEach(([hi, tx], k) => {
      const ty = ay + 15 + k * 9;
      wires.push({ points: [[tx, ty], [gx + 4, ty]], high: hi });
    });
    wires.push({ points: [[gx + 48, ay + 20], [gx + 68, ay + 20]], high: andHi[i]! });
  });

  const labels: Label3DSpec[] = [
    ...andY.map((ay, i) => ({ x: 6, y: ay + 6, text: `D${i}`, bold: true })),
    { x: 382, y: 107, text: 'Y', bold: true },
    { x: xS1, y: 288, text: 'S₁', bold: true },
    { x: xS0, y: 288, text: 'S₀', bold: true },
    { x: xE, y: 288, text: 'E', bold: true },
  ];

  return <Schematic3DLazy width={384} height={300} gates={gates} wires={wires} labels={labels} spanWorld={13} flow staticView className="h-[300px] w-full" />;
}
