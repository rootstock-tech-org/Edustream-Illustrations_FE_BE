'use client';
import { useEffect } from 'react';
import { createSimulationRunner } from '@/state/simulation-runner';
import { useVizStore } from '@/state/viz.store';

/**
 * Client boundary that owns the simulation runner lifecycle and syncs the
 * reduced-motion preference. Mounting it once near the root wires the
 * parameter→worker→result pipeline for the whole app.
 */
export function SimulationProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const runner = createSimulationRunner();
    void runner.runNow();

    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => useVizStore.getState().setReducedMotion(mq.matches);
    sync();
    mq.addEventListener('change', sync);

    return () => {
      runner.dispose();
      mq.removeEventListener('change', sync);
    };
  }, []);

  return <>{children}</>;
}
