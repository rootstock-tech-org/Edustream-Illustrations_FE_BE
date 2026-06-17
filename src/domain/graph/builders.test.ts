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
});
