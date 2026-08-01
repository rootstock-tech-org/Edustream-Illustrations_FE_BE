import { device, series, parallel } from '@/domain/netlist/netlist';
import type { DeviceDefinition } from './device.types';
import { buildMosfetParams, standardCmosSchema } from './shared';

/**
 * 2-input AND. Static CMOS is inherently inverting, so a true AND gate is two
 * cascaded stages: NAND (series NMOS pull-down, parallel PMOS pull-up) then an
 * inverter that flips NOT(A·B) back to A·B. The engine only solves ONE static
 * network at a time, so this device's `buildNetlist` is stage 1 (the NAND) —
 * the exact same topology as `nand2` — and the second-stage inverter is solved
 * separately (see `gate-cascade.ts`) and drawn as the closing stage in the 3D
 * scene. That composition (NAND + INV = AND) is exact, not an approximation.
 */
export const and2: DeviceDefinition = {
  kind: 'gate',
  id: 'and2',
  name: 'AND Gate',
  description: 'AND = NAND (series NMOS / parallel PMOS) + an inverter that restores the true AND function.',
  conceptId: 'and-gate',
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
