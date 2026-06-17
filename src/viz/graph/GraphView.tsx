'use client';
import { useRef } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Customized,
  ResponsiveContainer,
} from 'recharts';
import type { GraphSpec } from '@/domain/graph/graph.spec';

const token = (name?: string) => (name ? `rgb(var(--${name}))` : 'rgb(var(--accent))');

export interface GraphMarker {
  readonly x: number;
  readonly y: number;
}

/**
 * Recharts renderer for a GraphSpec. Visual-only — it presents engine data and
 * never computes it. Optionally shows a gliding operating-point marker and
 * supports scrubbing (drag) to drive an input parameter (Phase 4 coupling).
 */
export function GraphView({
  spec,
  marker,
  onScrub,
}: {
  spec: GraphSpec;
  marker?: GraphMarker;
  onScrub?: (x: number) => void;
}) {
  const dragging = useRef(false);
  const primary = spec.series[0];
  const data = (primary?.points ?? []).map((p, i) => {
    const row: Record<string, number> = { x: p.x };
    for (const s of spec.series) row[s.id] = s.points[i]?.y ?? Number.NaN;
    return row;
  });

  const scrub = (state: { activeLabel?: string | number } | null) => {
    if (!onScrub || !state) return;
    const x = typeof state.activeLabel === 'number' ? state.activeLabel : Number(state.activeLabel);
    if (Number.isFinite(x)) onScrub(x);
  };

  return (
    <div className="h-56 w-full" aria-hidden="true" style={{ cursor: onScrub ? 'ew-resize' : 'default' }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 8, right: 12, bottom: 4, left: 4 }}
          onMouseDown={(s) => {
            if (!onScrub) return;
            dragging.current = true;
            scrub(s);
          }}
          onMouseMove={(s) => {
            if (dragging.current) scrub(s);
          }}
          onMouseUp={() => (dragging.current = false)}
          onMouseLeave={() => (dragging.current = false)}
        >
          <CartesianGrid stroke="rgb(var(--ink-muted) / 0.12)" />
          <XAxis
            dataKey="x"
            type="number"
            domain={['dataMin', 'dataMax']}
            tick={{ fill: 'rgb(var(--ink-muted))', fontSize: 11 }}
            tickFormatter={(v: number) => v.toFixed(1)}
          />
          <YAxis
            tick={{ fill: 'rgb(var(--ink-muted))', fontSize: 11 }}
            tickFormatter={(v: number) => (Math.abs(v) < 1e-3 ? v.toExponential(0) : v.toFixed(1))}
            width={44}
          />
          <Tooltip
            contentStyle={{ background: 'rgb(var(--surface-elevated))', border: 'none', borderRadius: 8, fontSize: 12 }}
            labelFormatter={(v: number) => `${spec.x.label}: ${v.toFixed(3)}`}
          />
          {spec.series.map((s) => (
            <Line
              key={s.id}
              type="monotone"
              dataKey={s.id}
              name={s.label}
              stroke={token(s.colorToken)}
              dot={false}
              strokeWidth={2}
              isAnimationActive={false}
            />
          ))}
          {spec.annotations?.map((a, i) =>
            a.kind === 'vline' ? (
              <ReferenceLine key={i} x={a.x} stroke={token(a.colorToken)} strokeDasharray="4 4" />
            ) : null,
          )}
          {marker && <Customized component={(p: object) => <OperatingMarker {...p} mx={marker.x} my={marker.y} />} />}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Animated operating-point marker. Positioned via Recharts' axis scales and
 * CSS-transitioned so it GLIDES to the new point as Vin changes (Phase 4).
 */
function OperatingMarker(props: {
  xAxisMap?: Record<string, { scale: (v: number) => number }>;
  yAxisMap?: Record<string, { scale: (v: number) => number }>;
  mx: number;
  my: number;
}) {
  const xAxis = props.xAxisMap && Object.values(props.xAxisMap)[0];
  const yAxis = props.yAxisMap && Object.values(props.yAxisMap)[0];
  if (!xAxis || !yAxis) return null;
  const cx = xAxis.scale(props.mx);
  const cy = yAxis.scale(props.my);
  return (
    <g
      style={{ transition: 'transform 320ms cubic-bezier(.22,1,.36,1)' }}
      transform={`translate(${cx},${cy})`}
    >
      <circle r={10} fill="rgb(var(--accent) / 0.18)" />
      <circle r={4.5} fill="rgb(var(--accent))" stroke="rgb(var(--surface))" strokeWidth={1.5} />
    </g>
  );
}
