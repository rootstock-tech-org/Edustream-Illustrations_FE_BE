import type { TransistorDevice } from './device.types';
import { transistorSchema, buildTransistorParams, TPARAM } from './transistor-shared';

/**
 * NMOS Explorer — the first device a student meets. A single n-channel MOSFET
 * biased directly by V_GS / V_DS: drive the gate to form (or starve) the
 * electron inversion channel and watch the device move through cutoff → triode
 * → saturation, reading I_D, gₘ, V_th and the region of operation live.
 */
export const nmosDevice: TransistorDevice = {
  kind: 'transistor',
  id: 'nmos',
  name: 'NMOS',
  description: 'A single n-channel MOSFET: channel formation, regions, and I–V family.',
  conceptId: 'mosfet-nmos',
  transistorType: 'nmos',
  parameterSchema: transistorSchema,
  buildParams: (values) => buildTransistorParams(values, 'nmos'),
  vgsKey: TPARAM.VGS,
  vdsKey: TPARAM.VDS,
};
