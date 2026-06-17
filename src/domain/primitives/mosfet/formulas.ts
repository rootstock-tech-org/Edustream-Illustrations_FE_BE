import { defineFormula } from '@/domain/formulas/formula.registry';
import type { Vars } from '@/domain/formulas/formula.registry';
import { PHYSICS, SILICON, MODEL } from './constants';

/**
 * Every MOSFET equation, declared exactly once. Each `fn` is pure and works in
 * SI units; fundamental constants are baked into `fn` and documented in
 * `assumptions`, while the substitutions surfaced to the learner are the
 * quantities they actually control.
 */

const { Q, K_BOLTZMANN } = PHYSICS;

export const thermalVoltage = defineFormula<Vars & { T: { value: number } }>({
  id: 'thermal-voltage',
  conceptId: 'thermal-voltage',
  latex: 'V_T = \\dfrac{k T}{q}',
  summary: 'Thermal voltage sets the scale of carrier statistics.',
  resultUnit: 'V',
  assumptions: ['k and q are fundamental constants.'],
  fn: ({ T }) => (K_BOLTZMANN * T.value) / Q,
});

export const oxideCapacitance = defineFormula<Vars & { T_ox: { value: number } }>({
  id: 'oxide-capacitance',
  conceptId: 'oxide-capacitance',
  latex: 'C_{ox} = \\dfrac{\\varepsilon_{ox}}{T_{ox}}',
  summary: 'Thinner oxide → larger gate capacitance → stronger drive.',
  resultUnit: 'F/m^2',
  assumptions: ['ε_ox = 3.9·ε₀ (SiO₂).'],
  fn: ({ T_ox }) => SILICON.EPS_OX / T_ox.value,
});

export const bulkPotential = defineFormula<
  Vars & { V_T: { value: number }; N_a: { value: number } }
>({
  id: 'bulk-potential',
  conceptId: 'fermi-potential',
  latex: '\\phi_F = V_T \\ln\\!\\left(\\dfrac{N_a}{n_i}\\right)',
  summary: 'Bulk Fermi potential from substrate doping.',
  resultUnit: 'V',
  assumptions: ['n_i taken at 300 K (1.0×10¹⁶ m⁻³).'],
  fn: ({ V_T, N_a }) => V_T.value * Math.log(N_a.value / SILICON.NI_300K),
});

/**
 * Effective threshold including body effect, temperature drift, and corner.
 * γ (body-effect factor) is computed internally from C_ox and N_a.
 */
export const thresholdVoltage = defineFormula<
  Vars & {
    V_th0: { value: number };
    C_ox: { value: number };
    N_a: { value: number };
    'φ_F': { value: number };
    V_SB: { value: number };
    T: { value: number };
    'ΔV_corner': { value: number };
  }
>({
  id: 'threshold-voltage',
  conceptId: 'threshold-voltage',
  latex:
    'V_{th} = V_{th0} + \\gamma\\left(\\sqrt{2\\phi_F + V_{SB}} - \\sqrt{2\\phi_F}\\right) + \\alpha\\,(T - T_0) + \\Delta V_{corner}',
  summary: 'Threshold shifts with body bias, temperature, and process corner.',
  resultUnit: 'V',
  assumptions: [
    'γ = √(2·q·ε_si·N_a) / C_ox.',
    `α (temp. coeff.) = ${MODEL.VTH_TEMP_COEFF} V/K.`,
  ],
  fn: ({ V_th0, C_ox, N_a, 'φ_F': phiF, V_SB, T, 'ΔV_corner': dCorner }) => {
    const gamma = Math.sqrt(2 * Q * SILICON.EPS_SI * N_a.value) / C_ox.value;
    const twoPhiF = 2 * phiF.value;
    const bodyEffect =
      gamma * (Math.sqrt(twoPhiF + V_SB.value) - Math.sqrt(twoPhiF));
    const tempShift = MODEL.VTH_TEMP_COEFF * (T.value - MODEL.T_NOMINAL);
    return V_th0.value + bodyEffect + tempShift + dCorner.value;
  },
});

export const carrierMobility = defineFormula<
  Vars & {
    'µ_0': { value: number };
    T: { value: number };
    corner_scale: { value: number };
  }
>({
  id: 'carrier-mobility',
  conceptId: 'mobility',
  latex: '\\mu = \\mu_0 \\left(\\dfrac{T}{T_0}\\right)^{-1.5} \\cdot s_{corner}',
  summary: 'Carrier mobility falls with temperature (phonon scattering).',
  resultUnit: 'm^2/V·s',
  assumptions: ['Phonon-limited µ(T) ∝ T^−1.5.'],
  fn: ({ 'µ_0': mu0, T, corner_scale }) =>
    mu0.value *
    (T.value / MODEL.T_NOMINAL) ** MODEL.MOBILITY_TEMP_EXP *
    corner_scale.value,
});

export const processTransconductance = defineFormula<
  Vars & { 'µ': { value: number }; C_ox: { value: number } }
>({
  id: 'process-transconductance',
  conceptId: 'transconductance',
  latex: "k' = \\mu\\,C_{ox}",
  summary: 'Process transconductance combines mobility and oxide capacitance.',
  resultUnit: 'A/V^2',
  fn: ({ 'µ': mu, C_ox }) => mu.value * C_ox.value,
});

export const saturationCurrent = defineFormula<
  Vars & {
    "k'": { value: number };
    W: { value: number };
    L: { value: number };
    V_ov: { value: number };
    'λ': { value: number };
    V_DS: { value: number };
  }
>({
  id: 'drain-current-saturation',
  conceptId: 'saturation-region',
  latex:
    "I_D = \\tfrac{1}{2} k' \\dfrac{W}{L} V_{ov}^2 (1 + \\lambda V_{DS})",
  summary: 'Saturation: current is set by the gate overdrive, nearly flat in V_DS.',
  resultUnit: 'A',
  assumptions: ['Long-channel square-law; λ models channel-length modulation.'],
  fn: ({ "k'": k, W, L, V_ov, 'λ': lambda, V_DS }) =>
    0.5 * k.value * (W.value / L.value) * V_ov.value ** 2 * (1 + lambda.value * V_DS.value),
});

export const triodeCurrent = defineFormula<
  Vars & {
    "k'": { value: number };
    W: { value: number };
    L: { value: number };
    V_ov: { value: number };
    V_DS: { value: number };
    'λ': { value: number };
  }
>({
  id: 'drain-current-triode',
  conceptId: 'triode-region',
  latex:
    "I_D = k' \\dfrac{W}{L}\\left(V_{ov} V_{DS} - \\tfrac{V_{DS}^2}{2}\\right)(1 + \\lambda V_{DS})",
  summary: 'Triode: the channel acts like a voltage-controlled resistor.',
  resultUnit: 'A',
  fn: ({ "k'": k, W, L, V_ov, V_DS, 'λ': lambda }) =>
    k.value *
    (W.value / L.value) *
    (V_ov.value * V_DS.value - (V_DS.value * V_DS.value) / 2) *
    (1 + lambda.value * V_DS.value),
});

export const subthresholdCurrent = defineFormula<
  Vars & {
    "k'": { value: number };
    W: { value: number };
    L: { value: number };
    n: { value: number };
    V_T: { value: number };
    V_GS: { value: number };
    V_th: { value: number };
    V_DS: { value: number };
  }
>({
  id: 'drain-current-subthreshold',
  conceptId: 'subthreshold-conduction',
  latex:
    "I_D = k' \\dfrac{W}{L}(n-1) V_T^2\\, e^{(V_{GS}-V_{th})/n V_T}\\left(1 - e^{-V_{DS}/V_T}\\right)",
  summary: 'Below threshold, current is exponential in gate voltage — this is leakage.',
  resultUnit: 'A',
  assumptions: ['Weak-inversion (EKV-style) approximation.'],
  fn: ({ "k'": k, W, L, n, V_T, V_GS, V_th, V_DS }) =>
    k.value *
    (W.value / L.value) *
    (n.value - 1) *
    V_T.value ** 2 *
    Math.exp((V_GS.value - V_th.value) / (n.value * V_T.value)) *
    (1 - Math.exp(-V_DS.value / V_T.value)),
});
