/*
 * Foundations — AssetSpec (Rulebook §4, networks/architecture; house convention).
 */
import { NAMEPLATE, MODEL } from './model.js';

export const FOUND_SPEC = {
  id: 'iiot-stack-latency',
  name: 'IIoT stack latency budget',
  discipline: 'networks',
  standard: 'IIoT 4-layer reference (see legend)',
  view: 'block',
  depth: 3,

  quantities: [
    { key: 'e2e', tag: 'E2E', label: 'End-to-end latency', unit: 's', display: { symbol: 'ms', scale: 1000 }, range: [0, 150], sigFigs: 3, anchor: 'app', limits: { hi: 0.05, hiHi: 0.1 }, formulaId: 'e2e' },
    { key: 'network', tag: 'NET', label: 'Network latency', unit: 's', display: { symbol: 'ms', scale: 1000 }, range: [0, 80], sigFigs: 3, anchor: 'net', limits: { hi: 0.02, hiHi: 0.05 }, formulaId: 'network' },
    { key: 'processing', tag: 'PROC', label: 'Processing latency', unit: 's', display: { symbol: 'ms', scale: 1000 }, range: [0, 80], sigFigs: 3, anchor: 'proc', limits: { hi: 0.03, hiHi: 0.06 }, formulaId: 'processing' },
    { key: 'throughput', tag: 'THR', label: 'Throughput', unit: '1/s', display: { symbol: 'msg/s', scale: 1 }, range: [0, 3000], sigFigs: 3, anchor: 'net', formulaId: 'thr' },
  ],

  parameters: [
    { key: 'rate', label: 'Sensor rate', symbol: 'λ', unit: 'msg/s', min: 0, max: 3000, step: 50, nameplate: NAMEPLATE.rate },
    { key: 'bandwidth', label: 'Network bandwidth', symbol: 'C', unit: 'Mbps', min: 1, max: 100, step: 1, nameplate: NAMEPLATE.bandwidth },
    { key: 'procLoad', label: 'Processing load', symbol: 'ρ', unit: '%', min: 0, max: 95, step: 5, nameplate: NAMEPLATE.procLoad },
  ],

  faults: [
    { id: 'netCongestion', label: 'Network congestion', description: 'Effective bandwidth drops to 40%. Network queueing dominates the whole budget.', affects: ['network', 'e2e'] },
    { id: 'procOverload', label: 'Processing overload', description: 'Analytics load jumps 45%. Processing queueing balloons — the layer that quietly breaks the latency budget.', affects: ['processing', 'e2e'] },
  ],

  assumptions: [
    'Fixed 256-byte messages; four serial layers.',
    'Per-layer base budgets are indicative reference values.',
    'Network and processing queueing use an M/M/1 approximation.',
  ],
  notModelled: ['Parallelism / batching within a layer', 'Retransmission and protocol overhead', 'Multi-tenant contention'],
  model: MODEL,
};
