import { create } from 'zustand';

/**
 * Future-ready assessment / challenge hooks. Holds optional target specs for the
 * key gate metrics (delay, power, leakage) plus the scoring primitives. The UI
 * (AssessmentPanel) reads the live SimulationResult and grades it against these
 * targets — this store is the seam a full challenge-authoring workflow plugs
 * into later (named challenges, leaderboards, persistence) without touching the
 * physics engine.
 */
export type AssessmentMetric = 'delay' | 'power' | 'leakage';

/** A target: drive `metric` at or below `max` (lower-is-better for all three). */
export interface AssessmentTarget {
  readonly metric: AssessmentMetric;
  /** Upper bound in SI units (s, W, A). null = not graded. */
  readonly max: number | null;
}

export interface AssessmentResult {
  readonly metric: AssessmentMetric;
  readonly target: number;
  readonly actual: number;
  readonly met: boolean;
  /** 0..1 — full credit at/below target, decaying as it overshoots. */
  readonly score: number;
}

interface AssessmentStore {
  /** Whether challenge grading is active (Analyze tab opt-in). */
  enabled: boolean;
  targets: Record<AssessmentMetric, number | null>;
  setEnabled: (on: boolean) => void;
  setTarget: (metric: AssessmentMetric, max: number | null) => void;
  reset: () => void;
}

/** Sensible default targets for a 180 nm-ish inverter (editable in the UI). */
const DEFAULT_TARGETS: Record<AssessmentMetric, number | null> = {
  delay: 10e-12, // 10 ps
  power: 5e-3, // 5 mW
  leakage: 1e-6, // 1 µA
};

export const useAssessmentStore = create<AssessmentStore>((set) => ({
  enabled: false,
  targets: { ...DEFAULT_TARGETS },
  setEnabled: (on) => set({ enabled: on }),
  setTarget: (metric, max) => set((s) => ({ targets: { ...s.targets, [metric]: max } })),
  reset: () => set({ targets: { ...DEFAULT_TARGETS } }),
}));

/** Grade one metric: full credit at/below target, smooth decay past it. */
export function gradeMetric(metric: AssessmentMetric, target: number, actual: number): AssessmentResult {
  const met = actual <= target;
  // Score 1.0 at/under target; halve every time the overshoot doubles target.
  const ratio = target > 0 ? actual / target : Infinity;
  const score = ratio <= 1 ? 1 : Math.max(0, 1 / ratio);
  return { metric, target, actual, met, score };
}

/** Overall 0..100 score across the graded targets (null targets are skipped). */
export function overallScore(results: readonly AssessmentResult[]): number {
  if (results.length === 0) return 0;
  const avg = results.reduce((s, r) => s + r.score, 0) / results.length;
  return Math.round(avg * 100);
}
