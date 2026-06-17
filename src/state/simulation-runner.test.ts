import { describe, it, expect, beforeEach } from 'vitest';
import { createSimulationRunner } from './simulation-runner';
import { useDeviceStore } from './device.store';
import { useSimulationStore } from './simulation.store';

describe('simulation runner', () => {
  beforeEach(() => {
    useDeviceStore.getState().reset();
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
    const high = useSimulationStore.getState().result!.operatingPoint.outputVoltage.quantity.value;

    useDeviceStore.getState().setParameter('Vin', 1.75);
    await runner.runNow();
    const low = useSimulationStore.getState().result!.operatingPoint.outputVoltage.quantity.value;

    expect(high).toBeGreaterThan(low); // inverter: low input → high output
    runner.dispose();
  });

  it('clamps out-of-range parameters via the schema', () => {
    useDeviceStore.getState().setParameter('VDD', 999);
    expect(useDeviceStore.getState().values.VDD).toBeLessThanOrEqual(3.3);
  });
});
