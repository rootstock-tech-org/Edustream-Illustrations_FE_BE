import type { ParameterValues } from '@/domain/parameters/parameter.schema';
import { solveFeedbackNetwork, type FeedbackNetwork } from '@/domain/sequential/feedback-solver';
import type { DeviceState } from '@/domain/simulation/analytical/network-solver';

/**
 * 3:8 decoder: each output Yk is a single 3-input AND term over A2/A1/A0
 * (direct or inverted per bit of k) — the enable-less counterpart of the
 * DEMUX's per-line AND terms (built the same NAND-then-invert way).
 */
export const DECODER3TO8_NETWORK: FeedbackNetwork = {
  A2Bar: { inputs: ['A2', 'A2'] },
  A1Bar: { inputs: ['A1', 'A1'] },
  A0Bar: { inputs: ['A0', 'A0'] },
  Y0n: { inputs: ['A2Bar', 'A1Bar', 'A0Bar'] },
  Y0: { inputs: ['Y0n', 'Y0n'] },
  Y1n: { inputs: ['A2Bar', 'A1Bar', 'A0'] },
  Y1: { inputs: ['Y1n', 'Y1n'] },
  Y2n: { inputs: ['A2Bar', 'A1', 'A0Bar'] },
  Y2: { inputs: ['Y2n', 'Y2n'] },
  Y3n: { inputs: ['A2Bar', 'A1', 'A0'] },
  Y3: { inputs: ['Y3n', 'Y3n'] },
  Y4n: { inputs: ['A2', 'A1Bar', 'A0Bar'] },
  Y4: { inputs: ['Y4n', 'Y4n'] },
  Y5n: { inputs: ['A2', 'A1Bar', 'A0'] },
  Y5: { inputs: ['Y5n', 'Y5n'] },
  Y6n: { inputs: ['A2', 'A1', 'A0Bar'] },
  Y6: { inputs: ['Y6n', 'Y6n'] },
  Y7n: { inputs: ['A2', 'A1', 'A0'] },
  Y7: { inputs: ['Y7n', 'Y7n'] },
};

export interface Decoder3To8Inputs {
  readonly a2: boolean;
  readonly a1: boolean;
  readonly a0: boolean;
}

export interface Decoder3To8Solution {
  readonly outputs: readonly [number, number, number, number, number, number, number, number];
  readonly voltages: Readonly<Record<string, number>>;
  readonly transistors: Readonly<Record<string, readonly DeviceState[]>>;
}

export function solveDecoder3to8(inputs: Decoder3To8Inputs, values: ParameterValues, vdd: number): Decoder3To8Solution {
  const bit = (b: boolean) => (b ? vdd : 0);
  const externalInputs = { A2: bit(inputs.a2), A1: bit(inputs.a1), A0: bit(inputs.a0) };
  const { voltages, transistors } = solveFeedbackNetwork(DECODER3TO8_NETWORK, externalInputs, {}, values, vdd);
  const outputs: [number, number, number, number, number, number, number, number] = [
    voltages.Y0 ?? 0,
    voltages.Y1 ?? 0,
    voltages.Y2 ?? 0,
    voltages.Y3 ?? 0,
    voltages.Y4 ?? 0,
    voltages.Y5 ?? 0,
    voltages.Y6 ?? 0,
    voltages.Y7 ?? 0,
  ];
  return { outputs, voltages, transistors };
}
