import type { SimulationResult } from '@/domain/simulation/result.types';
import type { Challenge } from './challenge.types';
import { readMetric, type MetricKey } from './metrics';

/**
 * Scores a challenge purely from the baseline and current simulation results.
 * Every percentage is a measured delta between two engine outputs — the pass/
 * fail is computed, never looked up. This is the "no hardcoded answers" rule.
 */
export interface MetricOutcome {
  readonly metric: MetricKey;
  readonly baseline: number;
  readonly current: number;
  /** Signed percent change (current − baseline) / baseline · 100. */
  readonly percentChange: number;
}

export interface GoalEvaluation {
  readonly outcome: MetricOutcome;
  readonly targetPercent: number;
  /** Progress toward the goal in the desired direction, in percent. */
  readonly achievedPercent: number;
  readonly met: boolean;
}

export interface ConstraintEvaluation {
  readonly outcome: MetricOutcome;
  readonly limitPercent: number;
  /** Change in the limited direction (negative = moved favorably). */
  readonly changeInLimitedDirection: number;
  readonly met: boolean;
}

export interface ChallengeEvaluation {
  readonly goal: GoalEvaluation;
  readonly constraints: readonly ConstraintEvaluation[];
  readonly solved: boolean;
}

function outcome(metric: MetricKey, baseline: SimulationResult, current: SimulationResult): MetricOutcome {
  const b = readMetric(baseline, metric).value;
  const c = readMetric(current, metric).value;
  const percentChange = b !== 0 ? ((c - b) / Math.abs(b)) * 100 : 0;
  return { metric, baseline: b, current: c, percentChange };
}

export function evaluateChallenge(
  challenge: Challenge,
  baseline: SimulationResult,
  current: SimulationResult,
): ChallengeEvaluation {
  const goalOutcome = outcome(challenge.goal.metric, baseline, current);
  const achievedPercent =
    challenge.goal.direction === 'decrease' ? -goalOutcome.percentChange : goalOutcome.percentChange;
  const goal: GoalEvaluation = {
    outcome: goalOutcome,
    targetPercent: challenge.goal.byPercent,
    achievedPercent,
    met: achievedPercent >= challenge.goal.byPercent,
  };

  const constraints = challenge.constraints.map((con) => {
    const o = outcome(con.metric, baseline, current);
    const changeInLimitedDirection = con.direction === 'increase' ? o.percentChange : -o.percentChange;
    return {
      outcome: o,
      limitPercent: con.maxPercent,
      changeInLimitedDirection,
      met: changeInLimitedDirection <= con.maxPercent,
    };
  });

  return { goal, constraints, solved: goal.met && constraints.every((c) => c.met) };
}
