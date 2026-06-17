import { device } from '@/domain/netlist/netlist';
import type { DeviceDefinition } from './device.types';
import { buildMosfetParams, standardCmosSchema } from './shared';

/**
 * The CMOS inverter: one PMOS pull-up, one NMOS pull-down, gates tied to IN.
 * The simplest static-CMOS gate and the canonical teaching device.
 */
export const cmosInverter: DeviceDefinition = {
  id: 'cmos-inverter',
  name: 'CMOS Inverter',
  description: 'Complementary NMOS/PMOS pair implementing logical NOT.',
  conceptId: 'cmos-inverter',
  parameterSchema: standardCmosSchema,
  sweepInput: 'IN',
  characteristicVectors: [{ IN: false }, { IN: true }],
  buildNetlist: (values) => ({
    inputs: ['IN'],
    output: 'Y',
    transistors: {
      MN: { id: 'MN', gate: 'IN', params: buildMosfetParams(values, 'nmos') },
      MP: { id: 'MP', gate: 'IN', params: buildMosfetParams(values, 'pmos') },
    },
    pullUp: device('MP'),
    pullDown: device('MN'),
  }),
};
