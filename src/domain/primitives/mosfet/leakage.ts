import { quantity } from '@/domain/units';
import type { Evaluation } from '@/domain/formulas/formula.registry';
import type { MosfetParameters } from './mosfet.types';
import { thermalVoltage, oxideCapacitance, processTransconductance, subthresholdCurrent } from './formulas';
import { computeMobility } from './mobility';
import { computeThreshold } from './threshold';

/**
 * Subthreshold (weak-inversion) drain current for the given bias. With V_GS = 0
 * this is the device off-state leakage I_off, which dominates static power and
 * grows exponentially with temperature — a key teaching point.
 */
export function computeLeakage(
  params: MosfetParameters,
  vgs: number,
  vds: number,
  vsb = 0,
): Evaluation {
  const vT = thermalVoltage({ T: quantity(params.temperature, 'K') });
  const cOx = oxideCapacitance({ T_ox: quantity(params.Tox, 'm') });
  const mobility = computeMobility(params);
  const kPrime = processTransconductance(
    { 'µ': mobility.quantity, C_ox: cOx.quantity },
    { children: [mobility.explanation, cOx.explanation] },
  );
  const threshold = computeThreshold(params, vsb);

  return subthresholdCurrent(
    {
      "k'": kPrime.quantity,
      W: quantity(params.W, 'm'),
      L: quantity(params.L, 'm'),
      n: quantity(params.subthresholdSlopeFactor, '1'),
      V_T: vT.quantity,
      V_GS: quantity(vgs, 'V'),
      V_th: threshold.quantity,
      V_DS: quantity(vds, 'V'),
    },
    { regionOfOperation: 'cutoff', children: [kPrime.explanation, threshold.explanation, vT.explanation] },
  );
}
