'use client';
import { useSimulationStore } from '@/state/simulation.store';
import type { SimulationResult } from '@/domain/simulation/result.types';
import type { TransistorResult } from '@/domain/simulation/transistor/transistor.types';

/** Presentation-facing view of the latest simulation result + status. */
export function useSimulation() {
  const status = useSimulationStore((s) => s.status);
  const result = useSimulationStore((s) => s.result);
  const error = useSimulationStore((s) => s.error);
  const elapsedMs = useSimulationStore((s) => s.elapsedMs);
  return { status, result, error, elapsedMs };
}

/** Narrowed view: the latest GATE result, or null if the device is a transistor. */
export function useGateResult(): SimulationResult | null {
  const result = useSimulationStore((s) => s.result);
  return result && result.kind === 'gate' ? result : null;
}

/** Narrowed view: the latest single-TRANSISTOR result, or null otherwise. */
export function useTransistorResult(): TransistorResult | null {
  const result = useSimulationStore((s) => s.result);
  return result && result.kind === 'transistor' ? result : null;
}
