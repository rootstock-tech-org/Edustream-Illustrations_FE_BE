import { quantity } from '@/domain/units';
import type { Explanation } from '@/domain/explainability/explanation.types';
import type { ParameterValues, ParameterDescriptor } from '@/domain/parameters/parameter.schema';
import type { TransistorDevice } from '@/domain/devices/device.types';
import type { MosfetParameters } from '@/domain/primitives/mosfet';
import { solveMosfet, mosfetCurrent, computeThreshold } from '@/domain/primitives/mosfet';
import type { TransistorResult, IVPoint } from './transistor.types';

/**
 * Single-transistor solver. It is NOT a new physics model — it drives the SAME
 * `solveMosfet` / `mosfetCurrent` used by the gate engine, just with the biases
 * supplied directly by the student instead of derived from a circuit. So the
 * drain-current law remains single-source (Risk R6), and transconductance is a
 * central difference of that very law (no second, drifting formula for gₘ).
 */
export const TRANSISTOR_ENGINE_ID = 'transistor-analytical';

const SWEEP_POINTS = 56;
const GM_DELTA = 0.01; // V, central-difference step for gₘ

const num = (values: ParameterValues, key: string): number => {
  const v = values[key];
  return typeof v === 'number' ? v : Number(v);
};

/** Continuous [min,max] for a parameter key, with a safe fallback. */
function bias(device: TransistorDevice, key: string, fallbackMax: number): { min: number; max: number } {
  const d: ParameterDescriptor | undefined = device.parameterSchema.groups
    .flatMap((g) => g.parameters)
    .find((p) => p.key === key);
  if (d && d.kind.type === 'continuous') return { min: d.kind.min, max: d.kind.max };
  return { min: 0, max: fallbackMax };
}

/** Sample I_D over a V_DS sweep at a fixed V_GS (fast path, no explanations). */
function sweepVds(params: MosfetParameters, vgs: number, vdsMax: number): IVPoint[] {
  const pts: IVPoint[] = [];
  for (let i = 0; i < SWEEP_POINTS; i++) {
    const vds = (vdsMax * i) / (SWEEP_POINTS - 1);
    pts.push({ x: vds, y: mosfetCurrent(params, { vgs, vds }).current });
  }
  return pts;
}

/** Sample I_D over a V_GS sweep at a fixed V_DS. */
function sweepVgs(params: MosfetParameters, vgsMax: number, vds: number): IVPoint[] {
  const pts: IVPoint[] = [];
  for (let i = 0; i < SWEEP_POINTS; i++) {
    const vgs = (vgsMax * i) / (SWEEP_POINTS - 1);
    pts.push({ x: vgs, y: mosfetCurrent(params, { vgs, vds }).current });
  }
  return pts;
}

export function simulateTransistor(device: TransistorDevice, values: ParameterValues): TransistorResult {
  const params = device.buildParams(values);
  const vgs = num(values, device.vgsKey);
  const vds = num(values, device.vdsKey);
  const { max: vgsMax } = bias(device, device.vgsKey, 1.8);
  const { max: vdsMax } = bias(device, device.vdsKey, 1.8);

  // --- Operating point (explained path) ---------------------------------
  const sol = solveMosfet(params, { vgs, vds });
  const threshold = computeThreshold(params, 0);

  // --- Transconductance: central difference of the SAME current model ----
  const vgsHi = Math.min(vgsMax, vgs + GM_DELTA);
  const vgsLo = Math.max(0, vgs - GM_DELTA);
  const idHi = mosfetCurrent(params, { vgs: vgsHi, vds }).current;
  const idLo = mosfetCurrent(params, { vgs: vgsLo, vds }).current;
  const gm = vgsHi > vgsLo ? (idHi - idLo) / (vgsHi - vgsLo) : 0;
  const gmExplanation: Explanation = {
    formulaId: 'transconductance',
    conceptId: 'transconductance',
    summary: 'Transconductance gₘ = ∂I_D/∂V_GS — how strongly the gate controls the drain current (the device’s small-signal gain).',
    latex: 'g_m = \\frac{\\partial I_D}{\\partial V_{GS}} \\approx \\frac{I_D(V_{GS}+\\Delta) - I_D(V_{GS}-\\Delta)}{2\\Delta}',
    substitutions: [
      { symbol: 'V_GS', quantity: quantity(vgs, 'V') },
      { symbol: 'Δ', quantity: quantity(GM_DELTA, 'V') },
      { symbol: 'I_D(V_GS+Δ)', quantity: quantity(idHi, 'A') },
      { symbol: 'I_D(V_GS−Δ)', quantity: quantity(idLo, 'A') },
    ],
    result: quantity(gm, 'A/V'),
    assumptions: [
      'Central finite-difference of the same drain-current model used everywhere — gₘ is never an independent formula.',
      'V_DS held fixed; in saturation gₘ ≈ k′(W/L)·V_ov.',
    ],
    regionOfOperation: sol.region,
    children: [sol.explanation],
  };

  // --- I–V families ------------------------------------------------------
  const gateValues = Array.from({ length: 5 }, (_, i) => (vgsMax * (i + 1)) / 5);
  const idVds = gateValues.map((vg, i) => ({
    id: `vgs-${i}`,
    label: `V_GS = ${vg.toFixed(2)} V`,
    vgs: vg,
    points: sweepVds(params, vg, vdsMax),
  }));
  const idVgs = {
    id: 'idvgs',
    label: `I_D–V_GS @ V_DS = ${vds.toFixed(2)} V`,
    points: sweepVgs(params, vgsMax, vds),
  };

  return {
    kind: 'transistor',
    deviceId: device.id,
    engineId: TRANSISTOR_ENGINE_ID,
    type: device.transistorType,
    operatingPoint: {
      drainCurrent: { quantity: sol.current, explanation: sol.explanation },
      transconductance: { quantity: quantity(gm, 'A/V'), explanation: gmExplanation },
      threshold: { quantity: threshold.quantity, explanation: threshold.explanation },
      overdrive: sol.overdrive,
      region: sol.region,
      vgs,
      vds,
    },
    idVds,
    idVgs,
  };
}
