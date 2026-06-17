import { quantity, scalar } from '@/domain/units';
import type { Evaluation } from '@/domain/formulas/formula.registry';
import type { MosfetParameters } from './mosfet.types';
import { carrierMobility } from './formulas';
import { cornerAdjustment } from './corner';

/** Temperature- and corner-adjusted carrier mobility, with explanation. */
export function computeMobility(params: MosfetParameters): Evaluation {
  const { mobilityScale } = cornerAdjustment(params.corner, params.type);
  return carrierMobility({
    'µ_0': quantity(params.mobility0, 'm^2/V·s'),
    T: quantity(params.temperature, 'K'),
    corner_scale: scalar(mobilityScale),
  });
}
