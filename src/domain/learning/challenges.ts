import type { Challenge } from './challenge.types';

/**
 * Declarative challenge catalogue. Each is a goal + constraints over engine
 * metrics; the evaluator decides success from live results. Adding a challenge
 * is data-only.
 */
export const CHALLENGES: readonly Challenge[] = [
  {
    id: 'reduce-delay',
    title: 'Speed it up',
    description: 'Reduce propagation delay by at least 30% while keeping total power within 10% of baseline.',
    goal: { metric: 'propagationDelay', direction: 'decrease', byPercent: 30 },
    constraints: [{ metric: 'totalPower', direction: 'increase', maxPercent: 10 }],
    conceptIds: ['propagation-delay', 'dynamic-power', 'channel-length'],
  },
  {
    id: 'cut-leakage',
    title: 'Tame the leakage',
    description: 'Cut leakage by at least 40% without slowing the gate more than 15%.',
    goal: { metric: 'leakage', direction: 'decrease', byPercent: 40 },
    constraints: [{ metric: 'propagationDelay', direction: 'increase', maxPercent: 15 }],
    conceptIds: ['subthreshold-conduction', 'threshold-voltage', 'propagation-delay'],
  },
  {
    id: 'shift-threshold',
    title: 'Raise the trip point',
    description: 'Increase the switching threshold by at least 15% (more pull-down noise margin) without adding more than 20% delay.',
    goal: { metric: 'switchingThreshold', direction: 'increase', byPercent: 15 },
    constraints: [{ metric: 'propagationDelay', direction: 'increase', maxPercent: 20 }],
    conceptIds: ['switching-threshold', 'threshold-voltage'],
  },
];

const BY_ID = new Map(CHALLENGES.map((c) => [c.id, c]));
export const listChallenges = (): readonly Challenge[] => CHALLENGES;
export const getChallenge = (id: string): Challenge | undefined => BY_ID.get(id);
