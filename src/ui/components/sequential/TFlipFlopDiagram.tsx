'use client';
import { Schematic3DLazy } from '@/viz/logic3d/Schematic3DLazy';
import type { Gate3DSpec, Wire3DSpec, Label3DSpec } from '@/viz/logic3d/Schematic3D';

/**
 * T flip-flop, 3D — the single T line feeds two AND gates (with CLK and cross-
 * feedback) driving a cross-coupled OR-latch pair → Q / Q̄. Live state is the
 * real JK-network solve (T ties J=K). Extruded gates + tube wires.
 */
export function TFlipFlopDiagram({
  vdd,
  voltages,
}: {
  vdd: number;
  voltages: Readonly<Record<string, number>>;
  pulseTick?: number;
}) {
  const hi = (v: number | undefined) => (v ?? 0) > vdd / 2;
  const a1 = hi(voltages.GM1);
  const a2 = hi(voltages.GM2);
  const q = hi(voltages.Q);
  const qBar = hi(voltages.QBar);
  const gates: Gate3DSpec[] = [
    { kind: 'and', gx: 70, gy: 34, high: a1 },
    { kind: 'and', gx: 70, gy: 118, high: a2 },
    { kind: 'or', gx: 210, gy: 44, high: q },
    { kind: 'or', gx: 210, gy: 110, high: qBar },
  ];
  const wires: Wire3DSpec[] = [
    { points: [[30, 96], [40, 96]] },
    { points: [[40, 46], [40, 146]] },
    { points: [[40, 46], [74, 46]] },
    { points: [[40, 146], [74, 146]] },
    { points: [[30, 118], [52, 118]] },
    { points: [[52, 54], [52, 138]] },
    { points: [[52, 54], [74, 54]] },
    { points: [[52, 138], [74, 138]] },
    { points: [[118, 54], [180, 54], [180, 56], [214, 56]], high: a1 },
    { points: [[118, 138], [180, 138], [214, 138]], high: a2 },
    { points: [[264, 64], [280, 64], [280, 96], [206, 96], [206, 122], [214, 122]], high: q },
    { points: [[264, 130], [294, 130], [294, 84], [200, 84], [200, 72], [214, 72]], high: qBar },
    { points: [[264, 64], [312, 64]], high: q },
    { points: [[264, 130], [312, 130]], high: qBar },
    { points: [[300, 64], [300, 18], [54, 18], [54, 130], [74, 130]], high: q },
    { points: [[300, 130], [300, 196], [62, 196], [62, 62], [74, 62]], high: qBar },
  ];
  const labels: Label3DSpec[] = [
    { x: 22, y: 96, text: 'T', bold: true },
    { x: 22, y: 118, text: 'CLK', bold: true },
    { x: 320, y: 64, text: 'Q', bold: true },
    { x: 320, y: 130, text: 'Q̄', bold: true },
  ];
  return <Schematic3DLazy width={340} height={210} gates={gates} wires={wires} labels={labels} spanWorld={11.5} className="h-[240px] w-full" />;
}
