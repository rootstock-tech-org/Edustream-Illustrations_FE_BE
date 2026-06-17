import { describe, it, expect } from 'vitest';
import { AnalyticalEngine } from '@/domain/simulation/analytical/analytical.engine';
import { cmosInverter } from '@/domain/devices/cmos-inverter.device';
import { defaultValues } from '@/domain/parameters/parameter.schema';
import { evaluateChallenge } from './challenge.evaluator';
import { getChallenge } from './challenges';
import { readMetric } from './metrics';

const engine = new AnalyticalEngine();
const base = defaultValues(cmosInverter.parameterSchema);
const run = (overrides: Record<string, number | string> = {}) =>
  engine.simulate({ device: cmosInverter, values: { ...base, ...overrides }, options: { sweepPoints: 81 } });

const challenge = getChallenge('reduce-delay')!;

describe('challenge evaluator', () => {
  it('reports zero change and not-solved when nothing changed', () => {
    const baseline = run();
    const evald = evaluateChallenge(challenge, baseline, baseline);
    expect(evald.goal.outcome.percentChange).toBeCloseTo(0, 6);
    expect(evald.goal.achievedPercent).toBeCloseTo(0, 6);
    expect(evald.solved).toBe(false);
  });

  it('computes percent deltas directly from engine outputs (no hardcoding)', () => {
    const baseline = run();
    const current = run({ L: 45e-9 }); // shorter channel → faster
    const evald = evaluateChallenge(challenge, baseline, current);

    const bDelay = readMetric(baseline, 'propagationDelay').value;
    const cDelay = readMetric(current, 'propagationDelay').value;
    const expectedPct = ((cDelay - bDelay) / Math.abs(bDelay)) * 100;

    expect(evald.goal.outcome.percentChange).toBeCloseTo(expectedPct, 6);
    // Goal is "decrease", so achieved is the negated change.
    expect(evald.goal.achievedPercent).toBeCloseTo(-expectedPct, 6);
    expect(cDelay).toBeLessThan(bDelay); // shorter L really is faster
  });

  it('marks the goal met only when the target improvement is reached', () => {
    const baseline = run();
    // A dramatic geometry change that clearly beats a 30% delay cut.
    const current = run({ L: 40e-9, W: 4e-6 });
    const evald = evaluateChallenge(challenge, baseline, current);
    expect(evald.goal.met).toBe(evald.goal.achievedPercent >= 30);
    expect(evald.solved).toBe(evald.goal.met && evald.constraints.every((c) => c.met));
  });

  it('enforces constraints in the limited direction', () => {
    const baseline = run();
    const current = run({ W: 3e-6 }); // wider → faster but more dynamic power
    const evald = evaluateChallenge(challenge, baseline, current);
    const powerCon = evald.constraints[0]!;
    const pPct = readMetric(current, 'totalPower').value;
    const bPct = readMetric(baseline, 'totalPower').value;
    const expectedDir = ((pPct - bPct) / Math.abs(bPct)) * 100; // increase direction
    expect(powerCon.changeInLimitedDirection).toBeCloseTo(expectedDir, 6);
    expect(powerCon.met).toBe(expectedDir <= 10);
  });
});
