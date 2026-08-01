import type { ParameterValues } from '@/domain/parameters/parameter.schema';
import { solveFeedbackNetwork, type FeedbackNetwork } from '@/domain/sequential/feedback-solver';
import type { DeviceState } from '@/domain/simulation/analytical/network-solver';

/**
 * 8:3 (non-priority) encoder: assumes exactly one input line is active and
 * produces its binary index. Each output bit is a plain OR of the input
 * lines whose index has that bit set — realized as NAND-of-inverted-inputs
 * (De Morgan OR-via-NAND), so I0 active correctly yields 000 without needing
 * to appear in any equation.
 *
 * Each 4-way OR is built as a binary tree of 2-input NANDs (fan-in ≤ 2)
 * rather than one 4-input NAND: the analytical solver's bisection cost is
 * exponential in a gate's series-transistor width (~48^k), so a flat 4-input
 * NAND is dramatically slower than two 2-input stages — see mux.ts for the
 * same fix applied to the MUX's output OR.
 */
export const ENCODER8TO3_NETWORK: FeedbackNetwork = {
  I1Bar: { inputs: ['I1', 'I1'] },
  I2Bar: { inputs: ['I2', 'I2'] },
  I3Bar: { inputs: ['I3', 'I3'] },
  I4Bar: { inputs: ['I4', 'I4'] },
  I5Bar: { inputs: ['I5', 'I5'] },
  I6Bar: { inputs: ['I6', 'I6'] },
  I7Bar: { inputs: ['I7', 'I7'] },
  Y0ABn: { inputs: ['I1Bar', 'I3Bar'] },
  Y0AB: { inputs: ['Y0ABn', 'Y0ABn'] },
  Y0CDn: { inputs: ['I5Bar', 'I7Bar'] },
  Y0CD: { inputs: ['Y0CDn', 'Y0CDn'] },
  Y0: { inputs: ['Y0AB', 'Y0CD'] },
  Y1ABn: { inputs: ['I2Bar', 'I3Bar'] },
  Y1AB: { inputs: ['Y1ABn', 'Y1ABn'] },
  Y1CDn: { inputs: ['I6Bar', 'I7Bar'] },
  Y1CD: { inputs: ['Y1CDn', 'Y1CDn'] },
  Y1: { inputs: ['Y1AB', 'Y1CD'] },
  Y2ABn: { inputs: ['I4Bar', 'I5Bar'] },
  Y2AB: { inputs: ['Y2ABn', 'Y2ABn'] },
  Y2CDn: { inputs: ['I6Bar', 'I7Bar'] },
  Y2CD: { inputs: ['Y2CDn', 'Y2CDn'] },
  Y2: { inputs: ['Y2AB', 'Y2CD'] },
};

export interface Encoder8To3Inputs {
  readonly i0: boolean;
  readonly i1: boolean;
  readonly i2: boolean;
  readonly i3: boolean;
  readonly i4: boolean;
  readonly i5: boolean;
  readonly i6: boolean;
  readonly i7: boolean;
}

export interface Encoder8To3Solution {
  readonly y2: number;
  readonly y1: number;
  readonly y0: number;
  readonly voltages: Readonly<Record<string, number>>;
  readonly transistors: Readonly<Record<string, readonly DeviceState[]>>;
}

export function solveEncoder8to3(inputs: Encoder8To3Inputs, values: ParameterValues, vdd: number): Encoder8To3Solution {
  const bit = (b: boolean) => (b ? vdd : 0);
  const externalInputs = {
    I0: bit(inputs.i0),
    I1: bit(inputs.i1),
    I2: bit(inputs.i2),
    I3: bit(inputs.i3),
    I4: bit(inputs.i4),
    I5: bit(inputs.i5),
    I6: bit(inputs.i6),
    I7: bit(inputs.i7),
  };
  const { voltages, transistors } = solveFeedbackNetwork(ENCODER8TO3_NETWORK, externalInputs, {}, values, vdd);
  return { y2: voltages.Y2 ?? 0, y1: voltages.Y1 ?? 0, y0: voltages.Y0 ?? 0, voltages, transistors };
}
