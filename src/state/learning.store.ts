import { create } from 'zustand';
import type { ParameterValues } from '@/domain/parameters/parameter.schema';
import type { SimulationResult } from '@/domain/simulation/result.types';
import { useDeviceStore } from './device.store';
import { useSimulationStore } from './simulation.store';

export type LearningMode = 'explore' | 'guided' | 'variation';

/**
 * Guided-mode state: which challenge is active and the baseline captured when
 * it started. Challenge scoring compares the live result against this baseline
 * (in the evaluator) — the store only holds the references.
 */
interface LearningStore {
  mode: LearningMode;
  activeChallengeId: string | null;
  baseline: SimulationResult | null;
  baselineValues: ParameterValues | null;
  setMode: (mode: LearningMode) => void;
  startChallenge: (id: string) => void;
  exitChallenge: () => void;
  resetToBaseline: () => void;
}

export const useLearningStore = create<LearningStore>((set, get) => ({
  mode: 'explore',
  activeChallengeId: null,
  baseline: null,
  baselineValues: null,
  setMode: (mode) =>
    set(mode === 'guided' ? { mode } : { mode, activeChallengeId: null }),
  startChallenge: (id) => {
    // Challenges are gate-circuit goals; the baseline is only meaningful for a
    // gate result (single transistors don't expose Guided mode).
    const r = useSimulationStore.getState().result;
    set({
      mode: 'guided',
      activeChallengeId: id,
      baseline: r && r.kind === 'gate' ? r : null,
      baselineValues: { ...useDeviceStore.getState().values },
    });
  },
  exitChallenge: () => set({ activeChallengeId: null, baseline: null, baselineValues: null }),
  resetToBaseline: () => {
    const values = get().baselineValues;
    if (values) useDeviceStore.getState().setValues(values);
  },
}));
