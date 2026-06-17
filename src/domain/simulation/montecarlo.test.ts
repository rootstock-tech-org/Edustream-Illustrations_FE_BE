import { describe, it, expect } from 'vitest';
import { runMonteCarlo } from './montecarlo';
import { cmosInverter } from '@/domain/devices/cmos-inverter.device';
import { defaultValues } from '@/domain/parameters/parameter.schema';

const base = defaultValues(cmosInverter.parameterSchema);

describe('Monte Carlo sampler', () => {
  it('is deterministic for a given seed', () => {
    const a = runMonteCarlo('cmos-inverter', base, 40, 123);
    const b = runMonteCarlo('cmos-inverter', base, 40, 123);
    expect(a).toEqual(b);
  });

  it('produces the requested number of spread samples', () => {
    const s = runMonteCarlo('cmos-inverter', base, 100, 7);
    expect(s).toHaveLength(100);
    const delays = s.map((x) => x.propagationDelay);
    const mean = delays.reduce((m, d) => m + d, 0) / delays.length;
    const variance = delays.reduce((v, d) => v + (d - mean) ** 2, 0) / delays.length;
    expect(variance).toBeGreaterThan(0); // there is genuine spread
    expect(delays.every((d) => d > 0)).toBe(true);
  });

  it('reflects the corner: FF is faster on average than SS', () => {
    const ff = runMonteCarlo('cmos-inverter', { ...base, corner: 'FF' }, 80, 5);
    const ss = runMonteCarlo('cmos-inverter', { ...base, corner: 'SS' }, 80, 5);
    const mean = (xs: { propagationDelay: number }[]) => xs.reduce((m, x) => m + x.propagationDelay, 0) / xs.length;
    expect(mean(ff)).toBeLessThan(mean(ss));
  });
});
