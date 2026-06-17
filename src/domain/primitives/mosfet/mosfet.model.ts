import { quantity, scalar } from '@/domain/units';
import type { Quantity } from '@/domain/units';
import type { Explanation } from '@/domain/explainability/explanation.types';
import type { MosfetParameters, MosfetBias, RegionOfOperation } from './mosfet.types';
import {
  thermalVoltage,
  oxideCapacitance,
  bulkPotential,
  thresholdVoltage,
  carrierMobility,
  processTransconductance,
  saturationCurrent,
  triodeCurrent,
  subthresholdCurrent,
} from './formulas';
import { computeMobility } from './mobility';
import { computeThreshold } from './threshold';
import { computeLeakage } from './leakage';
import { cornerAdjustment } from './corner';

/** Numeric-only solution — no Explanation allocation (hot-path for sweeps). */
export interface MosfetNumeric {
  readonly current: number;
  readonly region: RegionOfOperation;
  readonly threshold: number;
  readonly overdrive: number;
}

/**
 * Fast path: drain current + region with NO explanation tree built. Used inside
 * sweep/solver inner loops where thousands of evaluations must fit the sub-50ms
 * budget. Calls the SAME registry `fn`s as the explained path, so the physics
 * remains single-source — only the explanation allocation is skipped.
 */
export function mosfetCurrent(params: MosfetParameters, bias: MosfetBias): MosfetNumeric {
  const vsb = bias.vsb ?? 0;
  const corner = cornerAdjustment(params.corner, params.type);
  const T = quantity(params.temperature, 'K');

  const vT = thermalVoltage.spec.fn({ T });
  const cOx = oxideCapacitance.spec.fn({ T_ox: quantity(params.Tox, 'm') });
  const phiF = bulkPotential.spec.fn({ V_T: quantity(vT, 'V'), N_a: quantity(params.Na, '1/m^3') });
  const vth = thresholdVoltage.spec.fn({
    V_th0: quantity(params.vth0, 'V'),
    C_ox: quantity(cOx, 'F/m^2'),
    N_a: quantity(params.Na, '1/m^3'),
    'φ_F': quantity(phiF, 'V'),
    V_SB: quantity(vsb, 'V'),
    T,
    'ΔV_corner': quantity(corner.deltaVth, 'V'),
  });
  const mu = carrierMobility.spec.fn({
    'µ_0': quantity(params.mobility0, 'm^2/V·s'),
    T,
    corner_scale: scalar(corner.mobilityScale),
  });
  const kPrime = processTransconductance.spec.fn({
    'µ': quantity(mu, 'm^2/V·s'),
    C_ox: quantity(cOx, 'F/m^2'),
  });

  const vov = bias.vgs - vth;
  const W = quantity(params.W, 'm');
  const L = quantity(params.L, 'm');
  const Vds = quantity(bias.vds, 'V');

  if (vov <= 0) {
    const current = subthresholdCurrent.spec.fn({
      "k'": quantity(kPrime, 'A/V^2'),
      W,
      L,
      n: scalar(params.subthresholdSlopeFactor),
      V_T: quantity(vT, 'V'),
      V_GS: quantity(bias.vgs, 'V'),
      V_th: quantity(vth, 'V'),
      V_DS: Vds,
    });
    return { current, region: 'cutoff', threshold: vth, overdrive: vov };
  }

  const region: RegionOfOperation = bias.vds < vov ? 'triode' : 'saturation';
  const Vov = quantity(vov, 'V');
  const lambda = quantity(params.lambda, '1/V');
  const current =
    region === 'triode'
      ? triodeCurrent.spec.fn({ "k'": quantity(kPrime, 'A/V^2'), W, L, V_ov: Vov, V_DS: Vds, 'λ': lambda })
      : saturationCurrent.spec.fn({ "k'": quantity(kPrime, 'A/V^2'), W, L, V_ov: Vov, 'λ': lambda, V_DS: Vds });
  return { current, region, threshold: vth, overdrive: vov };
}

/** Full solution for a single MOSFET at a single bias point. */
export interface MosfetSolution {
  /** Drain current magnitude (A). */
  readonly current: Quantity;
  /** Effective threshold voltage used (V). */
  readonly threshold: Quantity;
  /** Operating region. */
  readonly region: RegionOfOperation;
  /** Gate overdrive V_GS − V_th (V). */
  readonly overdrive: Quantity;
  /** Full derivation tree rooted at the drain current. */
  readonly explanation: Explanation;
}

/**
 * Solve one MOSFET. This is the SINGLE code path for drain current — region
 * selection picks which formula applies, but the current is never computed
 * anywhere else in the platform. PMOS is handled by callers passing
 * source-referenced magnitudes (see `mosfet.types.ts`).
 */
export function solveMosfet(params: MosfetParameters, bias: MosfetBias): MosfetSolution {
  const vsb = bias.vsb ?? 0;

  const cOx = oxideCapacitance({ T_ox: quantity(params.Tox, 'm') });
  const mobility = computeMobility(params);
  const kPrime = processTransconductance(
    { 'µ': mobility.quantity, C_ox: cOx.quantity },
    { children: [mobility.explanation, cOx.explanation] },
  );
  const threshold = computeThreshold(params, vsb);

  const vth = threshold.quantity.value;
  const vov = bias.vgs - vth;
  const overdrive = quantity(vov, 'V');
  const sharedChildren = [kPrime.explanation, threshold.explanation];

  // --- Cutoff: gate below threshold → subthreshold leakage ---------------
  if (vov <= 0) {
    const leakage = computeLeakage(params, bias.vgs, bias.vds, vsb);
    return {
      current: leakage.quantity,
      threshold: threshold.quantity,
      region: 'cutoff',
      overdrive,
      explanation: leakage.explanation,
    };
  }

  // --- Triode vs Saturation ---------------------------------------------
  const region: RegionOfOperation = bias.vds < vov ? 'triode' : 'saturation';
  const evaluation =
    region === 'triode'
      ? triodeCurrent(
          {
            "k'": kPrime.quantity,
            W: quantity(params.W, 'm'),
            L: quantity(params.L, 'm'),
            V_ov: overdrive,
            V_DS: quantity(bias.vds, 'V'),
            'λ': quantity(params.lambda, '1/V'),
          },
          { regionOfOperation: 'triode', children: sharedChildren },
        )
      : saturationCurrent(
          {
            "k'": kPrime.quantity,
            W: quantity(params.W, 'm'),
            L: quantity(params.L, 'm'),
            V_ov: overdrive,
            'λ': quantity(params.lambda, '1/V'),
            V_DS: quantity(bias.vds, 'V'),
          },
          { regionOfOperation: 'saturation', children: sharedChildren },
        );

  return {
    current: evaluation.quantity,
    threshold: threshold.quantity,
    region,
    overdrive,
    explanation: evaluation.explanation,
  };
}
