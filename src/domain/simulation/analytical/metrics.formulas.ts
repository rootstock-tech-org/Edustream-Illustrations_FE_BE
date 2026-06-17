import { defineFormula } from '@/domain/formulas/formula.registry';
import type { Vars } from '@/domain/formulas/formula.registry';

/** Device-level metric formulas — declared once, like the device equations. */

export const propagationDelayHalf = defineFormula<
  Vars & { C_L: { value: number }; V_DD: { value: number }; I_on: { value: number } }
>({
  id: 'propagation-delay-half',
  conceptId: 'propagation-delay',
  latex: 't_{p} = \\dfrac{C_L\\,V_{DD}}{2\\,I_{on}}',
  summary: 'Delay to swing the load through half VDD at the on-current.',
  resultUnit: 's',
  assumptions: ['Average-current (not full transient) approximation.'],
  fn: ({ C_L, V_DD, I_on }) => (C_L.value * V_DD.value) / (2 * Math.max(I_on.value, 1e-18)),
});

export const averageDelay = defineFormula<
  Vars & { t_pHL: { value: number }; t_pLH: { value: number } }
>({
  id: 'propagation-delay-average',
  conceptId: 'propagation-delay',
  latex: 't_p = \\dfrac{t_{pHL} + t_{pLH}}{2}',
  summary: 'Propagation delay is the mean of the fall and rise delays.',
  resultUnit: 's',
  fn: ({ t_pHL, t_pLH }) => (t_pHL.value + t_pLH.value) / 2,
});

export const dynamicPower = defineFormula<
  Vars & { 'α': { value: number }; C_L: { value: number }; V_DD: { value: number }; f: { value: number } }
>({
  id: 'dynamic-power',
  conceptId: 'dynamic-power',
  latex: 'P_{dyn} = \\alpha\\,C_L\\,V_{DD}^2\\,f',
  summary: 'Switching power charges and discharges the load each cycle.',
  resultUnit: 'W',
  assumptions: ['Activity factor α = 1; f estimated as 1/(2·t_p).'],
  fn: ({ 'α': alpha, C_L, V_DD, f }) => alpha.value * C_L.value * V_DD.value ** 2 * f.value,
});

export const staticPower = defineFormula<
  Vars & { I_leak: { value: number }; V_DD: { value: number } }
>({
  id: 'static-power',
  conceptId: 'static-power',
  latex: 'P_{stat} = I_{leak}\\,V_{DD}',
  summary: 'Leakage current drawn from the supply even when idle.',
  resultUnit: 'W',
  fn: ({ I_leak, V_DD }) => I_leak.value * V_DD.value,
});

export const totalPower = defineFormula<
  Vars & { P_dyn: { value: number }; P_stat: { value: number } }
>({
  id: 'total-power',
  conceptId: 'power-dissipation',
  latex: 'P = P_{dyn} + P_{stat}',
  summary: 'Total power is dynamic plus static dissipation.',
  resultUnit: 'W',
  fn: ({ P_dyn, P_stat }) => P_dyn.value + P_stat.value,
});
