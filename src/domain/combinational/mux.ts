import type { ParameterValues } from '@/domain/parameters/parameter.schema';
import { solveFeedbackNetwork, type FeedbackNetwork } from '@/domain/sequential/feedback-solver';
import type { DeviceState } from '@/domain/simulation/analytical/network-solver';

/**
 * 4:1 MUX, real 2-level NAND-NAND (AND-OR-Invert-Invert) realization of
 * Y = S1'S0'I0 + S1'S0 I1 + S1 S0'I2 + S1 S0 I3 — the textbook SOP-to-NAND
 * mapping (each first-level NAND computes NOT of one product term; the
 * second-level NAND ORs them back via De Morgan). No new engine code: this
 * is just a feed-forward `FeedbackNetwork` (no cycles), solved with the same
 * Gauss–Seidel relaxation the sequential-logic feature uses for latches.
 *
 * The final OR-of-4 is built as a binary tree of 2-input NANDs rather than
 * one 4-input NAND: the analytical solver's series-branch bisection cost is
 * exponential in the number of series transistors (~48^k for a k-wide gate),
 * so a single 4-input NAND is ~48x slower than two 2-input NANDs — enough to
 * blow past vitest's timeout. Keeping every gate at fan-in ≤ 3 keeps this
 * fast (the same width already used safely by the JK flip-flop).
 */
export const MUX4TO1_NETWORK: FeedbackNetwork = {
  S1Bar: { inputs: ['S1', 'S1'] },
  S0Bar: { inputs: ['S0', 'S0'] },
  G0: { inputs: ['S1Bar', 'S0Bar', 'I0'] },
  G1: { inputs: ['S1Bar', 'S0', 'I1'] },
  G2: { inputs: ['S1', 'S0Bar', 'I2'] },
  G3: { inputs: ['S1', 'S0', 'I3'] },
  ABn: { inputs: ['G0', 'G1'] },
  AB: { inputs: ['ABn', 'ABn'] },
  CDn: { inputs: ['G2', 'G3'] },
  CD: { inputs: ['CDn', 'CDn'] },
  Y: { inputs: ['AB', 'CD'] },
};

export interface Mux4To1Inputs {
  readonly i0: boolean;
  readonly i1: boolean;
  readonly i2: boolean;
  readonly i3: boolean;
  readonly s1: boolean;
  readonly s0: boolean;
}

export interface Mux4To1Solution {
  readonly y: number;
  readonly voltages: Readonly<Record<string, number>>;
  readonly transistors: Readonly<Record<string, readonly DeviceState[]>>;
}

export function solveMux4to1(inputs: Mux4To1Inputs, values: ParameterValues, vdd: number): Mux4To1Solution {
  const bit = (b: boolean) => (b ? vdd : 0);
  const externalInputs = {
    I0: bit(inputs.i0),
    I1: bit(inputs.i1),
    I2: bit(inputs.i2),
    I3: bit(inputs.i3),
    S1: bit(inputs.s1),
    S0: bit(inputs.s0),
  };
  const { voltages, transistors } = solveFeedbackNetwork(MUX4TO1_NETWORK, externalInputs, {}, values, vdd);
  return { y: voltages.Y ?? 0, voltages, transistors };
}
