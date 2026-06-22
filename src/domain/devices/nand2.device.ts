import { device, series, parallel } from '@/domain/netlist/netlist';
import type { DeviceDefinition } from './device.types';
import { buildMosfetParams, standardCmosSchema } from './shared';

/**
 * 2-input NAND. The extensibility proof: this file is the ONLY thing added to
 * support a new gate. The engine, solver, state, UI, graphs, and explanation
 * system are untouched — NAND is expressed entirely as a different netlist:
 *
 *   pull-down: MA ── MB in SERIES  (output low only when A AND B are high)
 *   pull-up:   MA ∥ MB in PARALLEL (output high when A OR B is low)
 */
export const nand2: DeviceDefinition = {
  kind: 'gate',
  id: 'nand2',
  name: 'NAND Gate',
  description: '2-input NAND: series NMOS pull-down, parallel PMOS pull-up.',
  conceptId: 'nand-gate',
  // Hidden from the primary learning flow (Phase 1 = NMOS → PMOS → Inverter).
  // Implementation retained; re-expose by removing this flag.
  hidden: true,
  parameterSchema: standardCmosSchema,
  sweepInput: 'A',
  characteristicVectors: [
    { A: false, B: false },
    { A: false, B: true },
    { A: true, B: false },
    { A: true, B: true },
  ],
  buildNetlist: (values) => ({
    inputs: ['A', 'B'],
    output: 'Y',
    transistors: {
      MNA: { id: 'MNA', gate: 'A', params: buildMosfetParams(values, 'nmos') },
      MNB: { id: 'MNB', gate: 'B', params: buildMosfetParams(values, 'nmos') },
      MPA: { id: 'MPA', gate: 'A', params: buildMosfetParams(values, 'pmos') },
      MPB: { id: 'MPB', gate: 'B', params: buildMosfetParams(values, 'pmos') },
    },
    pullUp: parallel(device('MPA'), device('MPB')),
    pullDown: series(device('MNA'), device('MNB')),
  }),
};
