'use client';
import { useLearningStore } from '@/state/learning.store';

/** Presentation-facing view of guided-mode state. */
export function useLearning() {
  return {
    mode: useLearningStore((s) => s.mode),
    activeChallengeId: useLearningStore((s) => s.activeChallengeId),
    baseline: useLearningStore((s) => s.baseline),
    setMode: useLearningStore((s) => s.setMode),
    startChallenge: useLearningStore((s) => s.startChallenge),
    exitChallenge: useLearningStore((s) => s.exitChallenge),
    resetToBaseline: useLearningStore((s) => s.resetToBaseline),
  };
}
