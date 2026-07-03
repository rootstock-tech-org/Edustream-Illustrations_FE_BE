'use client';
import dynamic from 'next/dynamic';
import type { SimulationResult } from '@/domain/simulation/result.types';
import { GRAPH_BUILDERS } from '@/domain/graph/builders';
import type { GraphSpec, GraphAnnotation } from '@/domain/graph/graph.spec';
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
            <RegionLegend spec={spec} activeVin={op.inputVoltage.value} />
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

/**
 * Key for the VTC's operating-region bands. Each entry pairs the on-chart letter
 * with the nMOS/pMOS state it stands for, in the same colour as the shaded band.
 * The bits that VARY with the parameters are surfaced here: the live Vin RANGE
 * each region spans (boundaries recomputed from the thresholds + VDD), and a
 * "← now" marker on whichever region the current operating point (Vin) sits in —
 * so changing VDD / Vth / W / L visibly shifts the ranges and the active region.
 */
function RegionLegend({ spec, activeVin }: { spec: GraphSpec; activeVin?: number }) {
  const bands = (spec.annotations ?? []).filter(
    (a): a is Extract<GraphAnnotation, { kind: 'band' }> => a.kind === 'band',
  );
  if (bands.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1 text-[10px] text-ink-muted">
      {bands.map((b, i) => {
        const active = activeVin != null && activeVin >= b.x0 && activeVin <= b.x1;
        const tok = b.colorToken ?? 'accent';
        return (
          <li
            key={i}
            className={`flex items-center gap-1.5 rounded px-1 py-0.5 ${active ? 'bg-accent/10 ring-1 ring-accent/30' : ''}`}
          >
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ background: `rgb(var(--${tok}) / 0.5)`, outline: `1px solid rgb(var(--${tok}))` }}
            />
            <span className="font-mono font-medium text-ink">{b.code}</span>
            <span className="flex-1">{b.label}</span>
            <span className="font-mono tabular-nums text-ink-muted">
              {b.x0.toFixed(2)}–{b.x1.toFixed(2)} V
            </span>
            {active && <span className="font-medium text-accent">← now</span>}
          </li>
        );
      })}
    </ul>
  );
}
