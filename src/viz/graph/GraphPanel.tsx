'use client';
import dynamic from 'next/dynamic';
import type { SimulationResult } from '@/domain/simulation/result.types';
import { GRAPH_BUILDERS } from '@/domain/graph/builders';
import type { GraphSpec } from '@/domain/graph/graph.spec';
import { GraphDataTable } from './GraphDataTable';
import type { GraphMarker } from './GraphView';

const GraphView = dynamic(() => import('./GraphView').then((m) => m.GraphView), {
  ssr: false,
  loading: () => <div className="h-56 w-full animate-pulse rounded-lg bg-surface-elevated" />,
});

/**
 * Renders every graph builder's output: chart + accessible data table. The VTC
 * gets a gliding operating-point marker and (via `onScrubInput`, supplied by the
 * UI layer) becomes a scrubbable input — Phase 4 coupling. `onScrubInput` is
 * passed in so viz/ stays free of state/ui imports.
 */
export function GraphPanel({
  result,
  onScrubInput,
}: {
  result: SimulationResult;
  onScrubInput?: (vin: number) => void;
}) {
  const op = result.operatingPoint;

  const markerFor = (spec: GraphSpec): GraphMarker | undefined => {
    if (spec.id === 'vtc') return { x: op.inputVoltage.value, y: op.outputVoltage.quantity.value };
    if (spec.id === 'isc') return { x: op.inputVoltage.value, y: op.current.quantity.value };
    return undefined;
  };

  const specs = GRAPH_BUILDERS.map((build) => build(result)).map((spec) => {
    // The animated marker replaces the static 'point' annotation on the VTC.
    if (spec.id !== 'vtc' || !spec.annotations) return spec;
    return { ...spec, annotations: spec.annotations.filter((a) => a.kind !== 'point') };
  });

  return (
    <div className="flex flex-col gap-6">
      {specs.map((spec) => {
        const marker = markerFor(spec);
        const scrubbable = spec.id === 'vtc' && onScrubInput;
        return (
          <figure key={spec.id} className="flex flex-col gap-2" role="group" aria-label={spec.title}>
            <div className="flex items-center justify-between">
              <figcaption className="text-sm font-medium text-ink">{spec.title}</figcaption>
              {scrubbable && <span className="text-[10px] text-ink-muted">drag to set Vᵢₙ</span>}
            </div>
            <GraphView
              spec={spec}
              {...(marker ? { marker } : {})}
              {...(scrubbable ? { onScrub: onScrubInput } : {})}
            />
            <details className="text-ink-muted">
              <summary className="cursor-pointer text-xs">Data table</summary>
              <div className="mt-2 overflow-x-auto">
                <GraphDataTable spec={spec} />
              </div>
            </details>
          </figure>
        );
      })}
    </div>
  );
}
