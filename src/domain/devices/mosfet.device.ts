import type { TransistorDevice } from './device.types';
import { transistorSchema, buildTransistorParams, TPARAM } from './transistor-shared';

/**
 * MOSFET Explorer — the generic textbook device (Source / Gate / Drain, n+
 * diffusions, channel, gate oxide, P-Type bulk) shown BEFORE the NMOS/PMOS
 * split. Standalone tab: its own id/visuals, no changes to NMOS/PMOS/CMOS
 * Inverter. Reuses the same n-channel MOSFET model as the NMOS explorer —
 * only the surrounding scene/labels differ.
 */
export const mosfetDevice: TransistorDevice = {
  kind: 'transistor',
  id: 'mosfet',
  name: 'MOSFET',
  description: 'The generic MOSFET anatomy: Source, Gate, Drain, n+ diffusions, channel and P-Type bulk.',
  conceptId: 'mosfet-nmos',
  transistorType: 'nmos',
  parameterSchema: transistorSchema,
  buildParams: (values) => buildTransistorParams(values, 'nmos'),
  vgsKey: TPARAM.VGS,
  vdsKey: TPARAM.VDS,
};
