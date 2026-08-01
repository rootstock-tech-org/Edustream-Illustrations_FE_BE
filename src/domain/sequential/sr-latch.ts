import type { ParameterValues } from '@/domain/parameters/parameter.schema';
import { solveFeedbackNetwork, type FeedbackNetwork } from './feedback-solver';
import type { FlipFlopState } from './flipflop.types';

/**
 * Gated SR latch — the fundamental memory cell every other flip-flop in this
 * module is built from. Four cross-coupled NAND gates:
 *
 *   G1 = NAND(S, CLK)      G2 = NAND(R, CLK)
 *   Q  = NAND(G1, QBar)    QBar = NAND(G2, Q)
 *
 * While CLK is low, G1 = G2 = 1 (inactive), so the Q/QBar pair simply holds
 * whatever it last converged to. While CLK is high, S/R pass through and
 * set/reset the latch. S = R = 1 while CLK is high is the disallowed
 * "invalid" input — the real netlist just resolves to whatever the physics
 * gives (typically Q = QBar, an illegal-but-real output), matching a real chip.
 */
export const SR_LATCH_NETWORK: FeedbackNetwork = {
  G1: { inputs: ['S', 'CLK'] },
  G2: { inputs: ['R', 'CLK'] },
  Q: { inputs: ['G1', 'QBar'] },
  QBar: { inputs: ['G2', 'Q'] },
};

export interface SrLatchInputs {
  readonly s: boolean;
  readonly r: boolean;
  readonly clk: boolean;
}

/** Reset (Q = 0) is the conventional power-on default for a real latch. */
export function initSrLatch(vdd: number): FlipFlopState {
  return {
    voltages: { G1: vdd, G2: vdd, Q: 0, QBar: vdd },
    q: 0,
    qBar: vdd,
    transistors: {},
  };
}

export function stepSrLatch(
  prev: FlipFlopState,
  inputs: SrLatchInputs,
  values: ParameterValues,
  vdd: number,
): FlipFlopState {
  const externalInputs = {
    S: inputs.s ? vdd : 0,
    R: inputs.r ? vdd : 0,
    CLK: inputs.clk ? vdd : 0,
  };
  const sol = solveFeedbackNetwork(SR_LATCH_NETWORK, externalInputs, prev.voltages, values, vdd);
  return {
    voltages: sol.voltages,
    q: sol.voltages.Q!,
    qBar: sol.voltages.QBar!,
    transistors: sol.transistors,
  };
}
