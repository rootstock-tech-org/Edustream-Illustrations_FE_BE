'use client';
import { formatQuantity, type SiUnit } from '@/domain/units';
import type { Histogram } from '@/domain/graph/histogram';

const W = 300;
const H = 90;

/**
 * Lightweight SVG histogram. Bars transition height as samples stream in, so
 * the distribution visibly "fills" during a Monte Carlo run. Presentation-only.
 */
export function HistogramView({
  histogram,
  unit,
  colorToken = 'accent',
  specLimit,
  side = 'below',
}: {
  histogram: Histogram;
  unit: SiUnit;
  colorToken?: string;
  specLimit?: number | null;
  side?: 'below' | 'above';
}) {
  const { bins, min, max, maxCount, mean } = histogram;
  const span = max - min || 1;
  const xFor = (v: number) => ((v - min) / span) * W;
  const barW = bins.length ? W / bins.length : W;
  const color = `rgb(var(--${colorToken}))`;

  return (
    <svg viewBox={`0 0 ${W} ${H + 18}`} className="w-full" role="img" aria-label="distribution histogram">
      {/* pass/fail shaded region relative to the spec limit */}
      {specLimit != null && (
        <rect
          x={side === 'below' ? 0 : xFor(specLimit)}
          y={0}
          width={side === 'below' ? xFor(specLimit) : W - xFor(specLimit)}
          height={H}
          fill="rgb(var(--nmos) / 0.08)"
        />
      )}

      {bins.map((b, i) => {
        const h = maxCount ? (b.count / maxCount) * H : 0;
        return (
          <rect
            key={i}
            x={i * barW + 0.5}
            y={H - h}
            width={Math.max(0.5, barW - 1)}
            height={h}
            fill={color}
            opacity={0.85}
            style={{ transition: 'y 200ms ease, height 200ms ease' }}
          />
        );
      })}

      {/* mean marker */}
      {maxCount > 0 && <line x1={xFor(mean)} y1={0} x2={xFor(mean)} y2={H} stroke="rgb(var(--ink))" strokeOpacity={0.5} strokeDasharray="2 2" />}

      {/* spec limit marker */}
      {specLimit != null && <line x1={xFor(specLimit)} y1={0} x2={xFor(specLimit)} y2={H} stroke="rgb(var(--pmos))" strokeWidth={1.5} />}

      {/* axis min/max */}
      <text x={0} y={H + 14} fill="rgb(var(--ink-muted))" fontSize={9}>{formatQuantity({ value: min, unit })}</text>
      <text x={W} y={H + 14} fill="rgb(var(--ink-muted))" fontSize={9} textAnchor="end">{formatQuantity({ value: max, unit })}</text>
    </svg>
  );
}
