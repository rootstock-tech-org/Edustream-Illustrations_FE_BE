import { describe, it, expect } from 'vitest';
import { runSimulation, PROTOCOL_VERSION } from './protocol';
import { cmosInverter } from '@/domain/devices/cmos-inverter.device';
import { defaultValues } from '@/domain/parameters/parameter.schema';

const values = defaultValues(cmosInverter.parameterSchema);

describe('worker protocol', () => {
  it('returns a result for a valid request', () => {
    const res = runSimulation({
      kind: 'simulate',
      id: 7,
      version: PROTOCOL_VERSION,
      deviceId: 'cmos-inverter',
      values,
    });
    expect(res.kind).toBe('result');
    expect(res.id).toBe(7);
    if (res.kind === 'result') {
      expect(res.result.deviceId).toBe('cmos-inverter');
      expect(res.elapsedMs).toBeGreaterThanOrEqual(0);
    }
  });

  it('rejects a protocol-version mismatch', () => {
    const res = runSimulation({
      kind: 'simulate',
      id: 1,
      version: 999,
      deviceId: 'cmos-inverter',
      values,
    });
    expect(res.kind).toBe('error');
  });

  it('returns an error (never throws) for an unknown device', () => {
    const res = runSimulation({
      kind: 'simulate',
      id: 2,
      version: PROTOCOL_VERSION,
      deviceId: 'does-not-exist',
      values,
    });
    expect(res.kind).toBe('error');
    if (res.kind === 'error') expect(res.message).toContain('does-not-exist');
  });
});
