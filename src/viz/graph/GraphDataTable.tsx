'use client';
import type { GraphSpec } from '@/domain/graph/graph.spec';

/**
 * The accessible equivalent of a chart, generated from the same GraphSpec. This
 * is the real screen-reader path for plotted data (canvas/SVG charts are not
 * natively accessible). Sampled to keep the table digestible.
 */
export function GraphDataTable({ spec, maxRows = 16 }: { spec: GraphSpec; maxRows?: number }) {
  const primary = spec.series[0];
  const n = primary?.points.length ?? 0;
  const stride = Math.max(1, Math.ceil(n / maxRows));
  const rows: number[] = [];
  for (let i = 0; i < n; i += stride) rows.push(i);

  return (
    <table className="w-full border-collapse text-xs">
      <caption className="sr-only">{spec.title} — data table</caption>
      <thead>
        <tr className="text-ink-muted">
          <th scope="col" className="px-2 py-1 text-left">{spec.x.label} ({spec.x.unit})</th>
          {spec.series.map((s) => (
            <th key={s.id} scope="col" className="px-2 py-1 text-right">{s.label} ({spec.y.unit})</th>
          ))}
        </tr>
      </thead>
      <tbody className="font-mono tabular-nums">
        {rows.map((i) => (
          <tr key={i} className="border-t border-white/5">
            <td className="px-2 py-1 text-left">{primary?.points[i]?.x.toPrecision(3)}</td>
            {spec.series.map((s) => (
              <td key={s.id} className="px-2 py-1 text-right">{s.points[i]?.y.toPrecision(3)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
