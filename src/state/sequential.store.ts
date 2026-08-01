import { create } from 'zustand';
import { defaultValues, type ParameterValues } from '@/domain/parameters/parameter.schema';
import { standardCmosSchema } from '@/domain/devices/shared';
import { initSrLatch, stepSrLatch } from '@/domain/sequential/sr-latch';
import { initDFlipFlop, stepDFlipFlop } from '@/domain/sequential/d-flipflop';
import { initJkFlipFlop, stepJkFlipFlop } from '@/domain/sequential/jk-flipflop';
import { initTFlipFlop, stepTFlipFlop } from '@/domain/sequential/t-flipflop';
import type { FlipFlopState } from '@/domain/sequential/flipflop.types';

/**
 * State for the "Sequential Logic" section — four independent flip-flops,
 * each backed by REAL cross-coupled NAND physics (src/domain/sequential),
 * not a truth-table lookup. Each `pulse*` action runs the clock through a
 * full 0→1 transition (mirroring how the domain tests drive it): the
 * transparent phase lets a master stage sample its inputs, then the rising
 * edge captures it into the slave — exactly the two `stepX` calls a real
 * bench would need. Every flip-flop's full internal gate voltages persist
 * between pulses, so "hold" is real feedback memory, not a stored boolean.
 */
const values: ParameterValues = defaultValues(standardCmosSchema);
const vdd = values.VDD as number;

interface SequentialStore {
  readonly values: ParameterValues;
  readonly vdd: number;

  readonly sr: FlipFlopState;
  readonly srInputs: { s: boolean; r: boolean };
  setSrInput: (key: 's' | 'r', v: boolean) => void;
  pulseSr: () => void;
  resetSr: () => void;

  readonly d: FlipFlopState;
  readonly dInput: boolean;
  setDInput: (v: boolean) => void;
  pulseD: () => void;
  resetD: () => void;

  readonly jk: FlipFlopState;
  readonly jkInputs: { j: boolean; k: boolean };
  setJkInput: (key: 'j' | 'k', v: boolean) => void;
  pulseJk: () => void;
  resetJk: () => void;

  readonly t: FlipFlopState;
  readonly tInput: boolean;
  setTInput: (v: boolean) => void;
  pulseT: () => void;
  resetT: () => void;
}

export const useSequentialStore = create<SequentialStore>((set, get) => ({
  values,
  vdd,

  sr: initSrLatch(vdd),
  srInputs: { s: false, r: false },
  setSrInput: (key, v) => set((s) => ({ srInputs: { ...s.srInputs, [key]: v } })),
  pulseSr: () => {
    const { sr, srInputs } = get();
    const low = stepSrLatch(sr, { ...srInputs, clk: false }, values, vdd);
    const next = stepSrLatch(low, { ...srInputs, clk: true }, values, vdd);
    set({ sr: next });
  },
  resetSr: () => set({ sr: initSrLatch(vdd), srInputs: { s: false, r: false } }),

  d: initDFlipFlop(vdd),
  dInput: false,
  setDInput: (v) => set({ dInput: v }),
  pulseD: () => {
    const { d, dInput } = get();
    const low = stepDFlipFlop(d, { d: dInput, clk: false }, values, vdd);
    const next = stepDFlipFlop(low, { d: dInput, clk: true }, values, vdd);
    set({ d: next });
  },
  resetD: () => set({ d: initDFlipFlop(vdd), dInput: false }),

  jk: initJkFlipFlop(vdd),
  jkInputs: { j: false, k: false },
  setJkInput: (key, v) => set((s) => ({ jkInputs: { ...s.jkInputs, [key]: v } })),
  pulseJk: () => {
    const { jk, jkInputs } = get();
    const low = stepJkFlipFlop(jk, { ...jkInputs, clk: false }, values, vdd);
    const next = stepJkFlipFlop(low, { ...jkInputs, clk: true }, values, vdd);
    set({ jk: next });
  },
  resetJk: () => set({ jk: initJkFlipFlop(vdd), jkInputs: { j: false, k: false } }),

  t: initTFlipFlop(vdd),
  tInput: false,
  setTInput: (v) => set({ tInput: v }),
  pulseT: () => {
    const { t, tInput } = get();
    const low = stepTFlipFlop(t, { t: tInput, clk: false }, values, vdd);
    const next = stepTFlipFlop(low, { t: tInput, clk: true }, values, vdd);
    set({ t: next });
  },
  resetT: () => set({ t: initTFlipFlop(vdd), tInput: false }),
}));
