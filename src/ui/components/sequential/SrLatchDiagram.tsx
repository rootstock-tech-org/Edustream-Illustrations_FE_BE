'use client';
import { Schematic3DLazy } from '@/viz/logic3d/Schematic3DLazy';
import type { Gate3DSpec, Wire3DSpec, Label3DSpec } from '@/viz/logic3d/Schematic3D';

/**
 * Gated SR latch, 3D — two input NANDs (S·CLK, R·CLK) feeding a cross-coupled
 * NAND pair → Q / Q̄, rendered as extruded gates + tube wires. Same topology
 * and coordinates as the reference gate-level schematic.
 */
export function SrLatchDiagram({
  vdd,
  g1,
  g2,
  q,
  qBar,
}: {
  vdd: number;
  g1: number;
  g2: number;
  q: number;
  qBar: number;
  pulseTick?: number;
}) {
  const hi = (v: number) => v > vdd / 2;
  const gates: Gate3DSpec[] = [
    { kind: 'nand', gx: 70, gy: 30, high: hi(g1) },
    { kind: 'nand', gx: 70, gy: 120, high: hi(g2) },
    { kind: 'nand', gx: 200, gy: 50, high: hi(q) },
    { kind: 'nand', gx: 200, gy: 110, high: hi(qBar) },
  ];
  const wires: Wire3DSpec[] = [
    { points: [[34, 42], [74, 42]] },
    { points: [[34, 150], [74, 150]] },
    { points: [[52, 58], [52, 132]] },
    { points: [[52, 58], [74, 58]] },
    { points: [[52, 132], [74, 132]] },
    { points: [[126, 50], [150, 50], [150, 62], [204, 62]], high: hi(g1) },
    { points: [[126, 140], [150, 140], [150, 138], [204, 138]], high: hi(g2) },
    { points: [[256, 70], [270, 70], [270, 100], [196, 100], [196, 122], [204, 122]], high: hi(q) },
    { points: [[256, 130], [284, 130], [284, 88], [190, 88], [190, 78], [204, 78]], high: hi(qBar) },
    { points: [[256, 70], [302, 70]], high: hi(q) },
    { points: [[256, 130], [302, 130]], high: hi(qBar) },
  ];
  const labels: Label3DSpec[] = [
    { x: 24, y: 42, text: 'S', bold: true },
    { x: 24, y: 150, text: 'R', bold: true },
    { x: 40, y: 95, text: 'CLK', bold: true },
    { x: 314, y: 70, text: 'Q', bold: true },
    { x: 314, y: 130, text: 'Q̄', bold: true },
  ];
  return <Schematic3DLazy width={320} height={190} gates={gates} wires={wires} labels={labels} spanWorld={11} className="h-[230px] w-full" />;
}
