import { device, series, parallel } from '@/domain/netlist/netlist';
import type { DeviceDefinition } from './device.types';
import { buildMosfetParams, standardCmosSchema } from './shared';

/**
 * 2-input OR. OR = NOR (parallel NMOS pull-down, series PMOS pull-up) followed
 * by an inverter that flips NOT(A+B) back to A+B — see `and2.device.ts` for
 * why static CMOS needs the second stage, and `gate-cascade.ts` for how it's
 * solved. `buildNetlist` here is stage 1 (the NOR) only.
 */
export const or2: DeviceDefinition = {
  kind: 'gate',
  id: 'or2',
  name: 'OR Gate',
  hidden: true,
  description: 'OR = NOR (parallel NMOS / series PMOS) + an inverter that restores the true OR function.',
  conceptId: 'or-gate',
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
    pullUp: series(device('MPA'), device('MPB')),
    pullDown: parallel(device('MNA'), device('MNB')),
  }),
};
