import type { SimulationResult } from '@/domain/simulation/result.types';
import type { GraphAnnotation, GraphSpec } from './graph.spec';

/**
 * Pure transforms from a SimulationResult into GraphSpecs. Living in the domain
 * keeps the "what to plot" decision out of React and reusable by both the
 * chart renderer and the accessible table.
 */

/** Spec for each of the inverter's five VTC operating regions (in Vin order). */
const REGION = {
  A: { code: 'A', label: 'nMOS cutoff · pMOS linear', colorToken: 'ink-muted' },
  B: { code: 'B', label: 'nMOS saturation · pMOS linear', colorToken: 'nmos' },
  C: { code: 'C', label: 'nMOS saturation · pMOS saturation', colorToken: 'accent' },
  D: { code: 'D', label: 'nMOS linear · pMOS saturation', colorToken: 'pmos' },
  E: { code: 'E', label: 'nMOS linear · pMOS cutoff', colorToken: 'ink-muted' },
} as const;
type RegionKey = keyof typeof REGION;

/**
 * The five textbook regions of the CMOS-inverter VTC, derived from the device
 * physics. As Vin sweeps 0→VDD each MOSFET moves cutoff → saturation → linear:
 *   A  Vin < Vtn          nMOS cutoff   · pMOS linear   (Vout = VDD)
 *   B  Vtn < Vin < ~V_M    nMOS sat      · pMOS linear
 *   C  Vin ≈ V_M           nMOS sat      · pMOS sat      (steep transition)
 *   D  ~V_M < Vin          nMOS linear   · pMOS sat
 *   E  Vin > VDD − |Vtp|   nMOS linear   · pMOS cutoff   (Vout = 0)
 * The cutoff edges are exact (Vin = Vtn and Vin = VDD − |Vtp|). The both-sat
 * region C is essentially vertical in the ideal square-law model (zero width
 * without channel-length modulation), so we render it as a thin band centred on
 * V_M — the standard textbook depiction — wide enough to read.
 */
function inverterRegionBands(result: SimulationResult): GraphAnnotation[] {
  const pts = result.transferCurve.points;
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (!first || !last || pts.length < 2) return [];

  const txs = result.operatingPoint.transistors;
  const nmos = txs.find((t) => t.type === 'nmos');
  const pmos = txs.find((t) => t.type === 'pmos');
  if (!nmos || !pmos) return [];

  const vtn = Math.abs(nmos.threshold.value);
  const vtp = Math.abs(pmos.threshold.value);
  const v0 = first.vin;
  const vdd = pts.reduce((m, p) => Math.max(m, p.vin), v0);
  const vm = result.metrics.switchingThreshold.quantity.value;

  const clamp = (x: number) => Math.min(Math.max(x, v0), vdd);
  const bAB = clamp(vtn); // nMOS turns on
  const bDE = clamp(vdd - vtp); // pMOS turns off
  const center = Math.min(Math.max(vm, bAB), bDE);
  const step = (vdd - v0) / (pts.length - 1);
  const halfC = Math.max(step / 2, (bDE - bAB) * 0.05); // thin but legible
  const cLo = Math.max(bAB, center - halfC);
  const cHi = Math.min(bDE, center + halfC);

  const raw: ReadonlyArray<readonly [RegionKey, number, number]> = [
    ['A', v0, bAB],
    ['B', bAB, cLo],
    ['C', cLo, cHi],
    ['D', cHi, bDE],
    ['E', bDE, vdd],
  ];
  return raw
    .filter(([, x0, x1]) => x1 - x0 > 1e-6) // drop any region squeezed to nothing
    .map(([key, x0, x1]) => ({ kind: 'band', x0, x1, ...REGION[key] }));
}

export function voltageTransferCurve(result: SimulationResult): GraphSpec {
  const points = result.transferCurve.points.map((p) => ({ x: p.vin, y: p.vout }));
  const vm = result.metrics.switchingThreshold.quantity.value;
  const op = result.operatingPoint;
  return {
    id: 'vtc',
    title: 'Voltage Transfer Characteristic',
    x: { label: 'Input Voltage Vin', unit: 'V' },
    y: { label: 'Output Voltage Vout', unit: 'V' },
    series: [{ id: 'vout', label: 'Vout', points, colorToken: 'accent' }],
    annotations: [
      // Region bands first so they paint behind the operating-point marker / V_M line.
      ...inverterRegionBands(result),
      { kind: 'vline', x: vm, label: `V_M = ${vm.toFixed(3)} V`, colorToken: 'ink-muted' },
      {
        kind: 'point',
        x: op.inputVoltage.value,
        y: op.outputVoltage.quantity.value,
        label: 'Operating point',
        colorToken: 'nmos',
      },
    ],
  };
}

export function shortCircuitCurrent(result: SimulationResult): GraphSpec {
  const points = result.transferCurve.points.map((p) => ({ x: p.vin, y: p.current }));
  return {
    id: 'isc',
    title: 'Short-Circuit Current',
    x: { label: 'Input Voltage Vin', unit: 'V' },
    y: { label: 'Through Current', unit: 'A' },
    series: [{ id: 'isc', label: 'I(Vin)', points, colorToken: 'pmos' }],
  };
}

export const GRAPH_BUILDERS = [voltageTransferCurve, shortCircuitCurrent] as const;
