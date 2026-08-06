'use client';
import { Schematic3DLazy } from '@/viz/logic3d/Schematic3DLazy';
import type { Gate3DSpec, Wire3DSpec, Label3DSpec } from '@/viz/logic3d/Schematic3D';

/**
 * JK flip-flop, 3D — two 3-input input NANDs (J·CLK·Q̄, K·CLK·Q) feeding a
 * cross-coupled NAND pair, with the Q / Q̄ outputs looped back around the
 * outside into the input gates. Extruded gates + tube wires.
 */
export function JkFlipFlopDiagram({
  vdd,
  voltages,
}: {
  vdd: number;
  voltages: Readonly<Record<string, number>>;
  pulseTick?: number;
}) {
  const hi = (v: number | undefined) => (v ?? 0) > vdd / 2;
  const gm1 = hi(voltages.GM1);
  const gm2 = hi(voltages.GM2);
  const q = hi(voltages.Q);
  const qBar = hi(voltages.QBar);
  const gates: Gate3DSpec[] = [
    { kind: 'nand', gx: 70, gy: 34, high: gm1 },
    { kind: 'nand', gx: 70, gy: 118, high: gm2 },
    { kind: 'nand', gx: 210, gy: 44, high: q },
    { kind: 'nand', gx: 210, gy: 110, high: qBar },
  ];
  const wires: Wire3DSpec[] = [
    { points: [[30, 46], [74, 46]] },
    { points: [[30, 146], [74, 146]] },
    { points: [[30, 96], [44, 96]] },
    { points: [[44, 54], [44, 138]] },
    { points: [[44, 54], [74, 54]] },
    { points: [[44, 138], [74, 138]] },
    { points: [[126, 54], [180, 54], [180, 56], [214, 56]], high: gm1 },
    { points: [[126, 138], [180, 138], [214, 138]], high: gm2 },
    { points: [[266, 64], [280, 64], [280, 96], [206, 96], [206, 122], [214, 122]], high: q },
    { points: [[266, 130], [294, 130], [294, 84], [200, 84], [200, 72], [214, 72]], high: qBar },
    { points: [[266, 64], [312, 64]], high: q },
    { points: [[266, 130], [312, 130]], high: qBar },
    { points: [[300, 64], [300, 18], [54, 18], [54, 130], [74, 130]], high: q },
    { points: [[300, 130], [300, 196], [62, 196], [62, 62], [74, 62]], high: qBar },
  ];
  const labels: Label3DSpec[] = [
    { x: 22, y: 46, text: 'J', bold: true },
    { x: 22, y: 146, text: 'K', bold: true },
    { x: 22, y: 96, text: 'CLK', bold: true },
    { x: 320, y: 64, text: 'Q', bold: true },
    { x: 320, y: 130, text: 'Q̄', bold: true },
  ];
  return <Schematic3DLazy width={340} height={210} gates={gates} wires={wires} labels={labels} spanWorld={11.5} flow staticView className="h-[240px] w-full" />;
}
