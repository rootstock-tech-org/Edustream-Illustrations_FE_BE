import type { TransistorDevice } from './device.types';
import { transistorSchema, buildTransistorParams, TPARAM } from './transistor-shared';

/**
 * PMOS Explorer — the complement. A single p-channel MOSFET in an n-well. Same
 * capabilities as the NMOS explorer, but it teaches COMPLEMENTARY behaviour:
 * the device conducts as the gate is pulled LOW (holes form the channel), and
 * its body sits in an n-well tied high. Biases are entered as source-referenced
 * magnitudes (|V_GS|, |V_DS|), so the shared model is reused unchanged.
 */
export const pmosDevice: TransistorDevice = {
  kind: 'transistor',
  id: 'pmos',
  name: 'PMOS',
  description: 'A single p-channel MOSFET in an n-well: complementary conduction and I–V family.',
  conceptId: 'mosfet-pmos',
  transistorType: 'pmos',
  parameterSchema: transistorSchema,
  buildParams: (values) => buildTransistorParams(values, 'pmos'),
  vgsKey: TPARAM.VGS,
  vdsKey: TPARAM.VDS,
};
