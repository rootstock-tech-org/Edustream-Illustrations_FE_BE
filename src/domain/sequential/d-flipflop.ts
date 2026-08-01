import type { ParameterValues } from '@/domain/parameters/parameter.schema';
import { solveFeedbackNetwork, type FeedbackNetwork } from './feedback-solver';
import type { FlipFlopState } from './flipflop.types';

/**
 * Positive-edge-triggered D flip-flop, built the classic way: a master D
 * latch (transparent while CLK is LOW) feeding a slave D latch (transparent
 * while CLK is HIGH). D_BAR/CLK_BAR are each a NAND with both legs tied to
 * the same signal — the 7400 "NAND as inverter" trick — so every gate here
 * is still a plain NAND.
 *
 *   CLKBar = NAND(CLK, CLK)        DBar = NAND(D, D)
 *   GM1 = NAND(D, CLKBar)          GM2 = NAND(DBar, CLKBar)
 *   QM  = NAND(GM1, QMBar)         QMBar = NAND(GM2, QM)     — master latch
 *   GS1 = NAND(QM, CLK)            GS2 = NAND(QMBar, CLK)
 *   Q   = NAND(GS1, QBar)          QBar  = NAND(GS2, Q)      — slave latch
 *
 * While CLK=0 the master tracks D and the slave holds. The instant CLK rises
 * the master freezes (capturing D) and the slave becomes transparent and
 * copies the master's frozen value out to Q — i.e. D is captured exactly on
 * the rising edge, and Q is immune to any D changes while CLK stays high.
 */
export const D_FLIPFLOP_NETWORK: FeedbackNetwork = {
  CLKBar: { inputs: ['CLK', 'CLK'] },
  DBar: { inputs: ['D', 'D'] },
  GM1: { inputs: ['D', 'CLKBar'] },
  GM2: { inputs: ['DBar', 'CLKBar'] },
  QM: { inputs: ['GM1', 'QMBar'] },
  QMBar: { inputs: ['GM2', 'QM'] },
  GS1: { inputs: ['QM', 'CLK'] },
  GS2: { inputs: ['QMBar', 'CLK'] },
  Q: { inputs: ['GS1', 'QBar'] },
  QBar: { inputs: ['GS2', 'Q'] },
};

export interface DFlipFlopInputs {
  readonly d: boolean;
  readonly clk: boolean;
}

/** Consistent power-on state for D=0, CLK=0 (Q=0, master already tracking D=0). */
export function initDFlipFlop(vdd: number): FlipFlopState {
  return {
    voltages: {
      CLKBar: vdd, DBar: vdd, GM1: vdd, GM2: 0, QM: 0, QMBar: vdd,
      GS1: vdd, GS2: vdd, Q: 0, QBar: vdd,
    },
    q: 0,
    qBar: vdd,
    transistors: {},
  };
}

export function stepDFlipFlop(
  prev: FlipFlopState,
  inputs: DFlipFlopInputs,
  values: ParameterValues,
  vdd: number,
): FlipFlopState {
  const externalInputs = {
    D: inputs.d ? vdd : 0,
    CLK: inputs.clk ? vdd : 0,
  };
  const sol = solveFeedbackNetwork(D_FLIPFLOP_NETWORK, externalInputs, prev.voltages, values, vdd);
  return {
    voltages: sol.voltages,
    q: sol.voltages.Q!,
    qBar: sol.voltages.QBar!,
    transistors: sol.transistors,
  };
}
