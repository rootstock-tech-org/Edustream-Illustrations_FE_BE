import { describe, it, expect } from 'vitest';
import { AnalyticalEngine } from '@/domain/simulation/analytical/analytical.engine';
import { cmosInverter } from '@/domain/devices/cmos-inverter.device';
import { standardCmosSchema } from '@/domain/devices/shared';
import { defaultValues } from '@/domain/parameters/parameter.schema';
import { buildImpact } from './impact';

const engine = new AnalyticalEngine();
const descriptors = standardCmosSchema.groups.flatMap((g) => g.parameters);
const base = defaultValues(cmosInverter.parameterSchema);
const run = (v: Record<string, number | string>) =>
  engine.simulate({ device: cmosInverter, values: { ...base, ...v }, options: { sweepPoints: 61 } });

describe('structured impact', () => {
  it('returns null when nothing changed', () => {
    const r = run({});
    expect(buildImpact({ descriptors, prevValues: base, prevResult: r, curValues: base, curResult: r })).toBeNull();
  });

  it('reports a shorter gate as faster, with measured device + circuit deltas', () => {
    const prevValues = base;
    const curValues = { ...base, L: 90e-9 };
    const impact = buildImpact({
      descriptors,
      prevValues,
      prevResult: run({}),
      curValues,
      curResult: run({ L: 90e-9 }),
    })!;

    // What changed: L decreased.
    const lChange = impact.whatChanged.find((c) => c.key === 'L')!;
    expect(lChange.percent).toBeLessThan(0);

    // Physical mechanism is the curated 'decrease' narrative for L.
    expect(impact.physical?.toLowerCase()).toContain('channel');
    expect(impact.tradeoff).toBeTruthy();

    // Device impact includes a measured W/L increase (shorter L → higher ratio).
    const wl = impact.deviceImpact.find((d) => d.label.includes('W/L'))!;
    expect(wl.delta.percent).toBeGreaterThan(0);

    // Circuit impact: propagation delay decreased (faster).
    const delay = impact.circuitImpact.find((c) => c.label.includes('delay'))!;
    expect(delay.delta.to).toBeLessThan(delay.delta.from);
  });

  it('every reported delta is measured from the two results (signs consistent)', () => {
    const impact = buildImpact({
      descriptors,
      prevValues: base,
      prevResult: run({}),
      curValues: { ...base, T: 400 },
      curResult: run({ T: 400 }),
    })!;
    // Hotter → leakage rises.
    const leak = impact.circuitImpact.find((c) => c.label === 'Leakage')!;
    expect(leak.delta.to).toBeGreaterThan(leak.delta.from);
    expect(leak.delta.percent).toBeGreaterThan(0);
  });
});
