import { create } from 'zustand';
import type { SimulationResult } from '@/domain/simulation/result.types';
import type { ParameterValues } from '@/domain/parameters/parameter.schema';

export type SimulationStatus = 'idle' | 'running' | 'ready' | 'error';

/**
 * Holds the latest simulation RESULT and status. Updated only by the
 * simulation runner (never by components). The `seq` guards against stale
 * out-of-order results — only the newest request's result is applied.
 */
interface SimulationStore {
  status: SimulationStatus;
  result: SimulationResult | null;
  /** Parameter values that produced `result` (for before/after impact diffs). */
  valuesUsed: ParameterValues | null;
  /** The prior result and its values, for structured-impact comparison. */
  previousResult: SimulationResult | null;
  previousValues: ParameterValues | null;
  error: string | null;
  elapsedMs: number | null;
  seq: number;
  _markRunning: (seq: number) => void;
  _applyResult: (result: SimulationResult, values: ParameterValues, elapsedMs: number, seq: number) => void;
  _applyError: (message: string, seq: number) => void;
}

export const useSimulationStore = create<SimulationStore>((set, get) => ({
  status: 'idle',
  result: null,
  valuesUsed: null,
  previousResult: null,
  previousValues: null,
  error: null,
  elapsedMs: null,
  seq: 0,
  _markRunning: (seq) => set({ status: 'running', seq }),
  _applyResult: (result, values, elapsedMs, seq) => {
    if (seq < get().seq) return; // stale
    set((s) => ({
      status: 'ready',
      previousResult: s.result,
      previousValues: s.valuesUsed,
      result,
      valuesUsed: values,
      elapsedMs,
      error: null,
      seq,
    }));
  },
  _applyError: (message, seq) => {
    if (seq < get().seq) return;
    set({ status: 'error', error: message, seq });
  },
}));
