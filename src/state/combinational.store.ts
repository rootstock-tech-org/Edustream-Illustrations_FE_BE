import { create } from 'zustand';
import { defaultValues, type ParameterValues } from '@/domain/parameters/parameter.schema';
import { standardCmosSchema } from '@/domain/devices/shared';
import { solveMux4to1 } from '@/domain/combinational/mux';
import { solveDemux1to4 } from '@/domain/combinational/demux';
import { solveEncoder8to3 } from '@/domain/combinational/encoder';
import { solveDecoder3to8 } from '@/domain/combinational/decoder';

/**
 * State for the "Combinational Logic" section — MUX / DEMUX / Encoder /
 * Decoder. Unlike Sequential Logic there is no clock or memory: every input
 * toggle immediately re-solves the real NAND network (src/domain/combinational)
 * and the new output voltages are stored directly, matching how a real
 * combinational circuit responds instantly to its inputs.
 */
const values: ParameterValues = defaultValues(standardCmosSchema);
const vdd = values.VDD as number;

interface MuxInputs {
  readonly i0: boolean;
  readonly i1: boolean;
  readonly i2: boolean;
  readonly i3: boolean;
  readonly s1: boolean;
  readonly s0: boolean;
}
const initialMuxInputs: MuxInputs = { i0: false, i1: false, i2: false, i3: false, s1: false, s0: false };

interface DemuxInputs {
  readonly d: boolean;
  readonly s1: boolean;
  readonly s0: boolean;
}
const initialDemuxInputs: DemuxInputs = { d: false, s1: false, s0: false };

interface EncoderInputs {
  readonly i0: boolean;
  readonly i1: boolean;
  readonly i2: boolean;
  readonly i3: boolean;
  readonly i4: boolean;
  readonly i5: boolean;
  readonly i6: boolean;
  readonly i7: boolean;
}
const initialEncoderInputs: EncoderInputs = { i0: true, i1: false, i2: false, i3: false, i4: false, i5: false, i6: false, i7: false };

interface DecoderInputs {
  readonly a2: boolean;
  readonly a1: boolean;
  readonly a0: boolean;
}
const initialDecoderInputs: DecoderInputs = { a2: false, a1: false, a0: false };

interface CombinationalStore {
  readonly values: ParameterValues;
  readonly vdd: number;

  readonly muxInputs: MuxInputs;
  readonly muxY: number;
  setMuxInput: (key: keyof MuxInputs, v: boolean) => void;

  readonly demuxInputs: DemuxInputs;
  readonly demuxY: readonly [number, number, number, number];
  setDemuxInput: (key: keyof DemuxInputs, v: boolean) => void;

  readonly encoderInputs: EncoderInputs;
  readonly encoderY: readonly [number, number, number];
  /** Selecting a new active line clears every other line (one-hot input). */
  setEncoderActive: (key: keyof EncoderInputs) => void;

  readonly decoderInputs: DecoderInputs;
  readonly decoderY: readonly [number, number, number, number, number, number, number, number];
  setDecoderInput: (key: keyof DecoderInputs, v: boolean) => void;
}

export const useCombinationalStore = create<CombinationalStore>((set, get) => ({
  values,
  vdd,

  muxInputs: initialMuxInputs,
  muxY: solveMux4to1(initialMuxInputs, values, vdd).y,
  setMuxInput: (key, v) => {
    const muxInputs = { ...get().muxInputs, [key]: v };
    set({ muxInputs, muxY: solveMux4to1(muxInputs, values, vdd).y });
  },

  demuxInputs: initialDemuxInputs,
  demuxY: (() => {
    const s = solveDemux1to4(initialDemuxInputs, values, vdd);
    return [s.y0, s.y1, s.y2, s.y3];
  })(),
  setDemuxInput: (key, v) => {
    const demuxInputs = { ...get().demuxInputs, [key]: v };
    const s = solveDemux1to4(demuxInputs, values, vdd);
    set({ demuxInputs, demuxY: [s.y0, s.y1, s.y2, s.y3] });
  },

  encoderInputs: initialEncoderInputs,
  encoderY: (() => {
    const s = solveEncoder8to3(initialEncoderInputs, values, vdd);
    return [s.y2, s.y1, s.y0];
  })(),
  setEncoderActive: (key) => {
    const cleared = Object.fromEntries(Object.keys(get().encoderInputs).map((k) => [k, k === key])) as unknown as EncoderInputs;
    const s = solveEncoder8to3(cleared, values, vdd);
    set({ encoderInputs: cleared, encoderY: [s.y2, s.y1, s.y0] });
  },

  decoderInputs: initialDecoderInputs,
  decoderY: solveDecoder3to8(initialDecoderInputs, values, vdd).outputs,
  setDecoderInput: (key, v) => {
    const decoderInputs = { ...get().decoderInputs, [key]: v };
    set({ decoderInputs, decoderY: solveDecoder3to8(decoderInputs, values, vdd).outputs });
  },
}));
