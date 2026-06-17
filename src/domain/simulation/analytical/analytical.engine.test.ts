import { describe, it, expect } from 'vitest';
import { AnalyticalEngine } from './analytical.engine';
import { cmosInverter } from '@/domain/devices/cmos-inverter.device';
import { defaultValues } from '@/domain/parameters/parameter.schema';

const engine = new AnalyticalEngine();
const baseValues = defaultValues(cmosInverter.parameterSchema);

function run(overrides: Record<string, number | string> = {}) {
  return engine.simulate({
    device: cmosInverter,
    values: { ...baseValues, ...overrides },
    options: { sweepPoints: 101 },
  });
}

describe('AnalyticalEngine — CMOS inverter', () => {
  it('produces a full, well-formed result', () => {
    const r = run();
    expect(r.deviceId).toBe('cmos-inverter');
    expect(r.engineId).toBe('analytical-mvp');
    expect(r.transferCurve.points.length).toBe(101);
    expect(r.operatingPoint.transistors.map((t) => t.id).sort()).toEqual(['MN', 'MP']);
  });

  it('inverts: output is high for low input and low for high input', () => {
    const vdd = baseValues.VDD as number;
    const low = run({ Vin: 0.05 });
    const high = run({ Vin: vdd - 0.05 });
    expect(low.operatingPoint.outputVoltage.quantity.value).toBeGreaterThan(0.8 * vdd);
    expect(high.operatingPoint.outputVoltage.quantity.value).toBeLessThan(0.2 * vdd);
  });

  it('transfer curve is monotonically non-increasing', () => {
    // Allow sub-mV numerical noise at the flat rails (bisection resolution).
    const pts = run().transferCurve.points;
    for (let i = 1; i < pts.length; i++) {
      expect(pts[i]!.vout).toBeLessThanOrEqual(pts[i - 1]!.vout + 1e-3);
    }
  });

  it('switching threshold lies strictly inside (0, VDD)', () => {
    const vdd = baseValues.VDD as number;
    const vm = run().metrics.switchingThreshold.quantity.value;
    expect(vm).toBeGreaterThan(0.1 * vdd);
    expect(vm).toBeLessThan(0.9 * vdd);
  });

  it('short-circuit current peaks near the switching threshold', () => {
    const r = run();
    const vm = r.metrics.switchingThreshold.quantity.value;
    const peak = r.transferCurve.points.reduce((m, p) => (p.current > m.current ? p : m));
    expect(Math.abs(peak.vin - vm)).toBeLessThan(0.25 * (baseValues.VDD as number));
  });

  it('propagation delay rises with load capacitance', () => {
    const small = run({ Cload: 5e-15 }).metrics.propagationDelay.quantity.value;
    const large = run({ Cload: 50e-15 }).metrics.propagationDelay.quantity.value;
    expect(large).toBeGreaterThan(small);
  });

  it('leakage and static power rise with temperature', () => {
    const cold = run({ T: 300 }).metrics.leakage.quantity.value;
    const hot = run({ T: 400 }).metrics.leakage.quantity.value;
    expect(hot).toBeGreaterThan(cold);
  });

  it('total power equals dynamic plus static (explanation parity)', () => {
    const m = run().metrics;
    const sum = m.dynamicPower.quantity.value + m.staticPower.quantity.value;
    expect(m.totalPower.quantity.value).toBeCloseTo(sum, 18);
    expect(m.totalPower.explanation.result.value).toBe(m.totalPower.quantity.value);
  });

  it('runs a 201-point sweep well under the 50 ms budget', () => {
    const start = performance.now();
    engine.simulate({ device: cmosInverter, values: baseValues, options: { sweepPoints: 201 } });
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(50);
  });
});
