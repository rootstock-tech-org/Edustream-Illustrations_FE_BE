'use client';
import { useSimulationStore } from '@/state/simulation.store';

/** Presentation-facing view of the latest simulation result + status. */
export function useSimulation() {
  const status = useSimulationStore((s) => s.status);
  const result = useSimulationStore((s) => s.result);
  const error = useSimulationStore((s) => s.error);
  const elapsedMs = useSimulationStore((s) => s.elapsedMs);
  return { status, result, error, elapsedMs };
}
