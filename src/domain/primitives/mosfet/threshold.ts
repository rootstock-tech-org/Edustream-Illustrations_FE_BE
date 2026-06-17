import { quantity } from '@/domain/units';
import type { Evaluation } from '@/domain/formulas/formula.registry';
import type { MosfetParameters } from './mosfet.types';
import { thermalVoltage, oxideCapacitance, bulkPotential, thresholdVoltage } from './formulas';
import { cornerAdjustment } from './corner';

/**
 * Effective threshold voltage for the given source-body bias, with the full
 * derivation chain (thermal voltage → oxide capacitance → bulk potential →
 * threshold) attached as explanation children.
 */
export function computeThreshold(params: MosfetParameters, vsb: number): Evaluation {
  const vT = thermalVoltage({ T: quantity(params.temperature, 'K') });
  const cOx = oxideCapacitance({ T_ox: quantity(params.Tox, 'm') });
  const phiF = bulkPotential({
    V_T: vT.quantity,
    N_a: quantity(params.Na, '1/m^3'),
  });
  const { deltaVth } = cornerAdjustment(params.corner, params.type);

  return thresholdVoltage(
    {
      V_th0: quantity(params.vth0, 'V'),
      C_ox: cOx.quantity,
      N_a: quantity(params.Na, '1/m^3'),
      'φ_F': phiF.quantity,
      V_SB: quantity(vsb, 'V'),
      T: quantity(params.temperature, 'K'),
      'ΔV_corner': quantity(deltaVth, 'V'),
    },
    { children: [vT.explanation, cOx.explanation, phiF.explanation] },
  );
}
