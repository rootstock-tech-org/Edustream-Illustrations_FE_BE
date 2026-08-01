import type { ParameterValues } from '@/domain/parameters/parameter.schema';
import { solveFeedbackNetwork, type FeedbackNetwork } from './feedback-solver';
import type { FlipFlopState } from './flipflop.types';

/**
 * Positive-edge-triggered JK flip-flop: a master-slave pair, same as the D
 * flip-flop, but the master's two input NANDs are 3-input gates that also
 * take FEEDBACK from the slave's own Q/QBar outputs. That feedback is the
 * classic trick that makes J=K=1 safely TOGGLE instead of racing into the
 * disallowed S=R=1 state a plain SR latch would hit:
 *
 *   CLKBar = NAND(CLK, CLK)
 *   GM1 = NAND(J, CLKBar, QBar)     GM2 = NAND(K, CLKBar, Q)
 *   QM  = NAND(GM1, QMBar)          QMBar = NAND(GM2, QM)      — master
 *   GS1 = NAND(QM, CLK)             GS2 = NAND(QMBar, CLK)
 *   Q   = NAND(GS1, QBar)           QBar  = NAND(GS2, Q)       — slave
 *
 * Because the master only samples Q/QBar once per clock cycle (while CLK is
 * low, before the edge) and freezes the instant CLK rises, this is immune to
 * the "1s catching" race a level-sensitive JK latch would suffer from.
 */
export const JK_FLIPFLOP_NETWORK: FeedbackNetwork = {
  CLKBar: { inputs: ['CLK', 'CLK'] },
  GM1: { inputs: ['J', 'CLKBar', 'QBar'] },
  GM2: { inputs: ['K', 'CLKBar', 'Q'] },
  QM: { inputs: ['GM1', 'QMBar'] },
  QMBar: { inputs: ['GM2', 'QM'] },
  GS1: { inputs: ['QM', 'CLK'] },
  GS2: { inputs: ['QMBar', 'CLK'] },
  Q: { inputs: ['GS1', 'QBar'] },
  QBar: { inputs: ['GS2', 'Q'] },
};

export interface JkFlipFlopInputs {
  readonly j: boolean;
  readonly k: boolean;
  readonly clk: boolean;
}

/** Consistent power-on state for J=K=0, CLK=0 (Q=0). */
export function initJkFlipFlop(vdd: number): FlipFlopState {
  return {
    voltages: {
      CLKBar: vdd, GM1: vdd, GM2: vdd, QM: 0, QMBar: vdd,
      GS1: vdd, GS2: vdd, Q: 0, QBar: vdd,
    },
    q: 0,
    qBar: vdd,
    transistors: {},
  };
}

export function stepJkFlipFlop(
  prev: FlipFlopState,
  inputs: JkFlipFlopInputs,
  values: ParameterValues,
  vdd: number,
): FlipFlopState {
  const externalInputs = {
    J: inputs.j ? vdd : 0,
    K: inputs.k ? vdd : 0,
    CLK: inputs.clk ? vdd : 0,
  };
  const sol = solveFeedbackNetwork(JK_FLIPFLOP_NETWORK, externalInputs, prev.voltages, values, vdd);
  return {
    voltages: sol.voltages,
    q: sol.voltages.Q!,
    qBar: sol.voltages.QBar!,
    transistors: sol.transistors,
  };
}
