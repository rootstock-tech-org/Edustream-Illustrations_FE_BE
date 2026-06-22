'use client';
import { useMemo } from 'react';
import { buildImpact, type StructuredImpact } from '@/domain/education/impact';
import { useSimulationStore } from '@/state/simulation.store';
import { useDevice } from './useDevice';

/** Builds the structured before/after impact from the last two results. */
export function useImpact(): StructuredImpact | null {
  const prevResult = useSimulationStore((s) => s.previousResult);
  const prevValues = useSimulationStore((s) => s.previousValues);
  const curResult = useSimulationStore((s) => s.result);
  const curValues = useSimulationStore((s) => s.valuesUsed);
  const { device } = useDevice();

  return useMemo(() => {
    if (!prevResult || !prevValues || !curResult || !curValues) return null;
    // Structured impact is a gate-result diff; single transistors have no
    // before/after metric panel (their teaching surface is the I–V family).
    if (prevResult.kind !== 'gate' || curResult.kind !== 'gate') return null;
    return buildImpact({
      descriptors: device.parameterSchema.groups.flatMap((g) => g.parameters),
      prevValues,
      prevResult,
      curValues,
      curResult,
    });
  }, [prevResult, prevValues, curResult, curValues, device]);
}
