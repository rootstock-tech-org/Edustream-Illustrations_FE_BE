import { useDeviceStore } from './device.store';
import { useSimulationStore } from './simulation.store';
import { createSimulationBridge, type SimulationBridge } from './worker-bridge';

/**
 * Orchestrates the parameter-change → debounce → worker → result pipeline. This
 * is the seam that keeps the 60 FPS render path decoupled from the sub-50 ms
 * compute path: rapid slider input is coalesced, and only the newest request's
 * result is committed to the store.
 */
const DEBOUNCE_MS = 24; // ~1.5 frames — coalesces drags without feeling laggy

export interface SimulationRunner {
  /** Debounced run on the next idle window. */
  schedule: () => void;
  /** Run immediately (e.g. initial mount). */
  runNow: () => Promise<void>;
  dispose: () => void;
}

export function createSimulationRunner(
  bridge: SimulationBridge = createSimulationBridge(),
): SimulationRunner {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let latest = 0;

  async function runNow() {
    const { deviceId, values } = useDeviceStore.getState();
    const seq = ++latest;
    useSimulationStore.getState()._markRunning(seq);
    try {
      const res = await bridge.simulate(deviceId, values);
      if (seq !== latest) return; // a newer request superseded this one
      useSimulationStore.getState()._applyResult(res.result, values, res.elapsedMs, seq);
    } catch (err) {
      if (seq !== latest) return;
      useSimulationStore
        .getState()
        ._applyError(err instanceof Error ? err.message : String(err), seq);
    }
  }

  function schedule() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(runNow, DEBOUNCE_MS);
  }

  // Recompute whenever the device or its parameters change.
  const unsubscribe = useDeviceStore.subscribe(schedule);

  return {
    schedule,
    runNow,
    dispose: () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
      bridge.dispose();
    },
  };
}
