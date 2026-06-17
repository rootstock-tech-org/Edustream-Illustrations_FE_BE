import type { SimulationResult } from '@/domain/simulation/result.types';
import type { GraphSpec } from './graph.spec';

/**
 * Pure transforms from a SimulationResult into GraphSpecs. Living in the domain
 * keeps the "what to plot" decision out of React and reusable by both the
 * chart renderer and the accessible table.
 */

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
