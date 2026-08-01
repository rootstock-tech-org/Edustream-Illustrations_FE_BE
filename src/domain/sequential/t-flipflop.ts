import type { ParameterValues } from '@/domain/parameters/parameter.schema';
import { initJkFlipFlop, stepJkFlipFlop } from './jk-flipflop';
import type { FlipFlopState } from './flipflop.types';

/**
 * T flip-flop — literally a JK flip-flop with J and K tied to the same T
 * input (T=1 toggles on each rising edge, T=0 holds). Reuses the JK
 * flip-flop's exact cross-coupled master-slave NAND network; no new
 * topology is needed.
 */
export interface TFlipFlopInputs {
  readonly t: boolean;
  readonly clk: boolean;
}

export function initTFlipFlop(vdd: number): FlipFlopState {
  return initJkFlipFlop(vdd);
}

export function stepTFlipFlop(
  prev: FlipFlopState,
  inputs: TFlipFlopInputs,
  values: ParameterValues,
  vdd: number,
): FlipFlopState {
  return stepJkFlipFlop(prev, { j: inputs.t, k: inputs.t, clk: inputs.clk }, values, vdd);
}
