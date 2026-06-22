import { describe, it, expect, beforeEach } from 'vitest';
import { createSimulationRunner } from './simulation-runner';
import { useDeviceStore } from './device.store';
import { useSimulationStore } from './simulation.store';

/** Narrow the union result to the gate output voltage (test helper). */
function gateOutputVoltage(): number {
  const r = useSimulationStore.getState().result;
  if (!r || r.kind !== 'gate') throw new Error('expected a gate result');
  return r.operatingPoint.outputVoltage.quantity.value;
}

describe('simulation runner', () => {
  beforeEach(() => {
    // The default device is now the NMOS explorer (Phase 1 progression); these
    // gate-specific assertions select the inverter explicitly.
    useDeviceStore.getState().setDevice('cmos-inverter');
  });

  it('computes a result and marks the store ready', async () => {
    const runner = createSimulationRunner();
    await runner.runNow();
    const sim = useSimulationStore.getState();
    expect(sim.status).toBe('ready');
    expect(sim.result?.deviceId).toBe('cmos-inverter');
    runner.dispose();
  });

  it('reflects parameter changes in the next run', async () => {
    const runner = createSimulationRunner();
    useDeviceStore.getState().setParameter('Vin', 0.05);
    await runner.runNow();
    const high = gateOutputVoltage();

    useDeviceStore.getState().setParameter('Vin', 1.75);
    await runner.runNow();
    const low = gateOutputVoltage();

    expect(high).toBeGreaterThan(low); // inverter: low input → high output
    runner.dispose();
  });

  it('clamps out-of-range parameters via the schema', () => {
    useDeviceStore.getState().setParameter('VDD', 999);
    expect(useDeviceStore.getState().values.VDD).toBeLessThanOrEqual(3.3);
  });
});
