import { create } from 'zustand';
import type { ParameterValues } from '@/domain/parameters/parameter.schema';
import type { MonteCarloSample } from '@/domain/simulation/montecarlo';
import { createSimulationBridge, type SimulationBridge } from './worker-bridge';

/**
 * Drives the Monte Carlo run as progressive batches so the histograms grow live
 * while the UI stays at 60 FPS. Sampling happens in the worker (off the main
 * thread); this store only accumulates and exposes the spec limit / yield.
 */
const BATCH = 40;

interface MonteCarloStore {
  running: boolean;
  samples: MonteCarloSample[];
  target: number;
  run: (deviceId: string, baseValues: ParameterValues, total: number) => Promise<void>;
  cancel: () => void;
  clear: () => void;
}

let bridge: SimulationBridge | null = null;
let runToken = 0;

export const useMonteCarloStore = create<MonteCarloStore>((set) => ({
  running: false,
  samples: [],
  target: 0,
  run: async (deviceId, baseValues, total) => {
    if (!bridge) bridge = createSimulationBridge();
    const token = ++runToken;
    set({ running: true, samples: [], target: total });

    for (let done = 0; done < total; done += BATCH) {
      if (token !== runToken) return; // superseded or cancelled
      const count = Math.min(BATCH, total - done);
      const batch = await bridge.monteCarlo(deviceId, baseValues, count, token * 100000 + done);
      if (token !== runToken) return;
      set((s) => ({ samples: [...s.samples, ...batch] }));
    }
    if (token === runToken) set({ running: false });
  },
  cancel: () => {
    runToken++;
    set({ running: false });
  },
  clear: () => {
    runToken++;
    set({ running: false, samples: [], target: 0 });
  },
}));
