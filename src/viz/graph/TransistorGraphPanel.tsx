'use client';
import dynamic from 'next/dynamic';
import type { TransistorResult } from '@/domain/simulation/transistor/transistor.types';
import { TRANSISTOR_GRAPH_BUILDERS } from '@/domain/graph/transistor-builders';
import { GraphDataTable } from './GraphDataTable';
import type { GraphMarker } from './GraphView';

const GraphView = dynamic(() => import('./GraphView').then((m) => m.GraphView), {
  ssr: false,
  loading: () => <div className="h-56 w-full animate-pulse rounded-lg bg-surface-elevated" />,
});

/**
 * The two MOSFET characteristics for the single-transistor explorers, each with
 * an operating-point marker that glides as the student changes the bias. Built
 * from the same GraphSpec model as the gate charts (one renderer, one table).
 */
export function TransistorGraphPanel({ result }: { result: TransistorResult }) {
  const op = result.operatingPoint;
  const id = op.drainCurrent.quantity.value;

  const markerFor = (specId: string): GraphMarker | undefined => {
    if (specId === 'id-vgs') return { x: op.vgs, y: id };
    if (specId === 'id-vds') return { x: op.vds, y: id };
    return undefined;
  };

  const specs = TRANSISTOR_GRAPH_BUILDERS.map((build) => build(result));

  return (
    <div className="flex flex-col gap-6">
      {specs.map((spec) => {
        const marker = markerFor(spec.id);
        return (
          <figure key={spec.id} className="flex flex-col gap-2" role="group" aria-label={spec.title}>
            <figcaption className="text-sm font-medium text-ink">{spec.title}</figcaption>
            <GraphView spec={spec} {...(marker ? { marker } : {})} />
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
