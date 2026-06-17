import { describe, it, expect } from 'vitest';
import { PRESETS } from './presets';
import { standardCmosSchema } from './shared';
import { clampParameter } from '@/domain/parameters/parameter.schema';
import { AnalyticalEngine } from '@/domain/simulation/analytical/analytical.engine';
import { cmosInverter } from './cmos-inverter.device';

const descriptors = standardCmosSchema.groups.flatMap((g) => g.parameters);

describe('technology presets', () => {
  it('every preset value is within its schema bounds (clamp is a no-op)', () => {
    for (const preset of PRESETS) {
      for (const d of descriptors) {
        const v = preset.values[d.key];
        expect(v, `${preset.id}.${d.key}`).not.toBeUndefined();
        expect(clampParameter(d, v!)).toBe(v);
      }
    }
  });

  it('presets produce distinct, simulatable behavior', () => {
    const engine = new AnalyticalEngine();
    const delays = PRESETS.map(
      (p) => engine.simulate({ device: cmosInverter, values: p.values, options: { sweepPoints: 41 } })
        .metrics.propagationDelay.quantity.value,
    );
    // Performance-optimized should be faster than mobile low-power.
    const perf = delays[PRESETS.findIndex((p) => p.id === 'perf-opt')]!;
    const mobile = delays[PRESETS.findIndex((p) => p.id === 'mobile-lp')]!;
    expect(perf).toBeLessThan(mobile);
  });
});
