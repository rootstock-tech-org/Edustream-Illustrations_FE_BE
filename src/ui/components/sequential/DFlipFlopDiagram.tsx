'use client';
import { Schematic3DLazy } from '@/viz/logic3d/Schematic3DLazy';
import type { Gate3DSpec, Wire3DSpec, Label3DSpec } from '@/viz/logic3d/Schematic3D';

/**
 * D flip-flop, 3D — D drives the top input NAND directly and the bottom NAND
 * through an inverter, both gated by CLK, feeding a cross-coupled NAND pair
 * → Q / Q̄. Extruded gates + tube wires; same topology as the reference.
 */
export function DFlipFlopDiagram({
  vdd,
  d,
  voltages,
}: {
  vdd: number;
  d: boolean;
  voltages: Readonly<Record<string, number>>;
  pulseTick?: number;
}) {
  const hi = (v: number | undefined) => (v ?? 0) > vdd / 2;
  const gm1 = hi(voltages.GM1);
  const gm2 = hi(voltages.GM2);
  const dbar = hi(voltages.DBar);
  const q = hi(voltages.Q);
  const qBar = hi(voltages.QBar);
  const gates: Gate3DSpec[] = [
    { kind: 'not', gx: 48, gy: 120, scale: 0.6, high: dbar },
    { kind: 'nand', gx: 86, gy: 26, high: gm1 },
    { kind: 'nand', gx: 86, gy: 120, high: gm2 },
    { kind: 'nand', gx: 210, gy: 44, high: q },
    { kind: 'nand', gx: 210, gy: 110, high: qBar },
  ];
  const wires: Wire3DSpec[] = [
    { points: [[30, 38], [90, 38]], high: d },
    { points: [[44, 38], [44, 132]], high: d },
    { points: [[81, 132], [90, 132]], high: dbar },
    { points: [[30, 100], [34, 100]] },
    { points: [[34, 54], [34, 148]] },
    { points: [[34, 54], [90, 54]] },
    { points: [[34, 148], [90, 148]] },
    { points: [[142, 46], [180, 46], [180, 56], [214, 56]], high: gm1 },
    { points: [[142, 140], [180, 140], [180, 138], [214, 138]], high: gm2 },
    { points: [[266, 64], [280, 64], [280, 96], [206, 96], [206, 122], [214, 122]], high: q },
    { points: [[266, 130], [294, 130], [294, 84], [200, 84], [200, 72], [214, 72]], high: qBar },
    { points: [[266, 64], [312, 64]], high: q },
    { points: [[266, 130], [312, 130]], high: qBar },
  ];
  const labels: Label3DSpec[] = [
    { x: 22, y: 38, text: 'D', bold: true },
    { x: 22, y: 100, text: 'CLK', bold: true },
    { x: 320, y: 64, text: 'Q', bold: true },
    { x: 320, y: 130, text: 'Q̄', bold: true },
  ];
  return <Schematic3DLazy width={340} height={200} gates={gates} wires={wires} labels={labels} spanWorld={11.5} flow staticView className="h-[230px] w-full" />;
}
