import { describe, it, expect } from 'vitest';
import { voltageTransferCurve, shortCircuitCurrent } from './builders';
import { AnalyticalEngine } from '@/domain/simulation/analytical/analytical.engine';
import { cmosInverter } from '@/domain/devices/cmos-inverter.device';
import { defaultValues } from '@/domain/parameters/parameter.schema';

const result = new AnalyticalEngine().simulate({
  device: cmosInverter,
  values: defaultValues(cmosInverter.parameterSchema),
  options: { sweepPoints: 41 },
});

describe('graph builders', () => {
  it('VTC spec carries the sweep points and a V_M annotation', () => {
    const spec = voltageTransferCurve(result);
    expect(spec.series[0]!.points).toHaveLength(41);
    expect(spec.x.unit).toBe('V');
    expect(spec.y.unit).toBe('V');
    const vline = spec.annotations?.find((a) => a.kind === 'vline');
    expect(vline).toBeDefined();
  });

  it('short-circuit-current spec plots current vs Vin', () => {
    const spec = shortCircuitCurrent(result);
    expect(spec.y.unit).toBe('A');
    expect(spec.series[0]!.points).toHaveLength(41);
  });

  it('VTC marks contiguous operating-region bands in A→E order', () => {
    const spec = voltageTransferCurve(result);
    const bands = (spec.annotations ?? []).filter((a) => a.kind === 'band') as Array<
      Extract<NonNullable<typeof spec.annotations>[number], { kind: 'band' }>
    >;
    // A symmetric inverter sweep exercises every region: cutoff → sat → both-sat → sat → cutoff.
    expect(bands.map((b) => b.code)).toEqual(['A', 'B', 'C', 'D', 'E']);
    // Bands are contiguous and span the whole 0→VDD sweep with no gaps/overlaps.
    const pts = result.transferCurve.points;
    const vdd = pts.reduce((m, p) => Math.max(m, p.vin), 0);
    expect(bands[0]!.x0).toBeCloseTo(pts[0]!.vin, 6);
    expect(bands[bands.length - 1]!.x1).toBeCloseTo(vdd, 6);
    for (let i = 1; i < bands.length; i++) expect(bands[i]!.x0).toBeCloseTo(bands[i - 1]!.x1, 6);
    // The central region is both-devices-saturation (the steep transition through V_M).
    const vm = result.metrics.switchingThreshold.quantity.value;
    const mid = bands.find((b) => b.x0 <= vm && vm <= b.x1);
    expect(mid?.code).toBe('C');
  });
});
