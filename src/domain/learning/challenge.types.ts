import type { MetricKey } from './metrics';

/**
 * A guided-learning challenge: a measurable goal plus constraints, all defined
 * as references to engine metrics. There are NO stored answers — success is a
 * function of the live simulation deltas (see challenge.evaluator.ts).
 */
export interface Challenge {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly goal: ChallengeGoal;
  readonly constraints: readonly ChallengeConstraint[];
  /** Concept ids surfaced to the tutor when explaining the outcome. */
  readonly conceptIds: readonly string[];
}

export interface ChallengeGoal {
  readonly metric: MetricKey;
  readonly direction: 'decrease' | 'increase';
  /** Required improvement vs the baseline, in percent. */
  readonly byPercent: number;
}

export interface ChallengeConstraint {
  readonly metric: MetricKey;
  /** The direction that is limited (e.g. limit how much power may increase). */
  readonly direction: 'increase' | 'decrease';
  /** Maximum allowed change in that direction, in percent. */
  readonly maxPercent: number;
}
