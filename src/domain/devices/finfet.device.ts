import type { TransistorDevice } from './device.types';
import { transistorSchema, buildTransistorParams, TPARAM } from './transistor-shared';

/**
 * FinFET Explorer — the 3-D tri-gate device: a thin vertical silicon FIN
 * (Source/Drain at its two ends) with the gate wrapped around three of its
 * faces instead of laid flat on top. Standalone tab: its own id/visuals, no
 * changes to NMOS/PMOS/CMOS Inverter/MOSFET. Reuses the exact same n-channel
 * MOSFET model as the other explorers — this app's electrical model doesn't
 * distinguish planar vs. fin geometry, only the surrounding scene/labels do.
 */
export const finfetDevice: TransistorDevice = {
  kind: 'transistor',
  id: 'finfet',
  name: 'FinFET',
  description: 'The tri-gate FinFET anatomy: Source, Gate, Drain and the raised silicon Fin the gate wraps around.',
  conceptId: 'mosfet-nmos',
  transistorType: 'nmos',
  parameterSchema: transistorSchema,
  buildParams: (values) => buildTransistorParams(values, 'nmos'),
  vgsKey: TPARAM.VGS,
  vdsKey: TPARAM.VDS,
};
