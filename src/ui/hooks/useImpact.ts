'use client';
import { useMemo } from 'react';
import { buildImpact, buildTransistorImpact, type StructuredImpact } from '@/domain/education/impact';
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
    const descriptors = device.parameterSchema.groups.flatMap((g) => g.parameters);
    if (prevResult.kind === 'gate' && curResult.kind === 'gate') {
      return buildImpact({ descriptors, prevValues, prevResult, curValues, curResult });
    }
    if (prevResult.kind === 'transistor' && curResult.kind === 'transistor') {
      return buildTransistorImpact({ descriptors, prevValues, prevResult, curValues, curResult });
    }
    return null; // a device swap changed the result kind mid-diff — nothing sane to compare
  }, [prevResult, prevValues, curResult, curValues, device]);
}
