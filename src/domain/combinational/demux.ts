import type { ParameterValues } from '@/domain/parameters/parameter.schema';
import { solveFeedbackNetwork, type FeedbackNetwork } from '@/domain/sequential/feedback-solver';
import type { DeviceState } from '@/domain/simulation/analytical/network-solver';

/**
 * 1:4 DEMUX: each output Yk = D · (select matches k), a single AND term per
 * line. Built as NAND(D, sel-literals) then inverted back (NAND-as-inverter)
 * so the exposed output is the true AND, not its complement.
 */
export const DEMUX1TO4_NETWORK: FeedbackNetwork = {
  S1Bar: { inputs: ['S1', 'S1'] },
  S0Bar: { inputs: ['S0', 'S0'] },
  Y0n: { inputs: ['D', 'S1Bar', 'S0Bar'] },
  Y0: { inputs: ['Y0n', 'Y0n'] },
  Y1n: { inputs: ['D', 'S1Bar', 'S0'] },
  Y1: { inputs: ['Y1n', 'Y1n'] },
  Y2n: { inputs: ['D', 'S1', 'S0Bar'] },
  Y2: { inputs: ['Y2n', 'Y2n'] },
  Y3n: { inputs: ['D', 'S1', 'S0'] },
  Y3: { inputs: ['Y3n', 'Y3n'] },
};

export interface Demux1To4Inputs {
  readonly d: boolean;
  readonly s1: boolean;
  readonly s0: boolean;
}

export interface Demux1To4Solution {
  readonly y0: number;
  readonly y1: number;
  readonly y2: number;
  readonly y3: number;
  readonly voltages: Readonly<Record<string, number>>;
  readonly transistors: Readonly<Record<string, readonly DeviceState[]>>;
}

export function solveDemux1to4(inputs: Demux1To4Inputs, values: ParameterValues, vdd: number): Demux1To4Solution {
  const bit = (b: boolean) => (b ? vdd : 0);
  const externalInputs = { D: bit(inputs.d), S1: bit(inputs.s1), S0: bit(inputs.s0) };
  const { voltages, transistors } = solveFeedbackNetwork(DEMUX1TO4_NETWORK, externalInputs, {}, values, vdd);
  return { y0: voltages.Y0 ?? 0, y1: voltages.Y1 ?? 0, y2: voltages.Y2 ?? 0, y3: voltages.Y3 ?? 0, voltages, transistors };
}
