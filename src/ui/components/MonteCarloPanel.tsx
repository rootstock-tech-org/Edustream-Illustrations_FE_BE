'use client';
import { useEffect, useMemo, useState } from 'react';
import { histogram, yieldFraction } from '@/domain/graph/histogram';
import { formatQuantity } from '@/domain/units';
import { useDevice } from '@/ui/hooks/useDevice';
import { useMonteCarloStore } from '@/state/montecarlo.store';
import { HistogramView } from '@/viz/charts/HistogramView';

/**
 * Process-variation explorer. Streams Monte Carlo samples from the worker into
 * live histograms and computes yield against a draggable delay spec limit. The
 * corner sets the mean; the sampler adds the random spread (see montecarlo.ts).
 */
export function MonteCarloPanel() {
  const { deviceId, values } = useDevice();
  const running = useMonteCarloStore((s) => s.running);
  const samples = useMonteCarloStore((s) => s.samples);
  const target = useMonteCarloStore((s) => s.target);
  const run = useMonteCarloStore((s) => s.run);
  const cancel = useMonteCarloStore((s) => s.cancel);

  const [total, setTotal] = useState(600);
  const delays = useMemo(() => samples.map((s) => s.propagationDelay), [samples]);
  const leaks = useMemo(() => samples.map((s) => s.leakage), [samples]);
  const vms = useMemo(() => samples.map((s) => s.switchingThreshold), [samples]);
  const hDelay = useMemo(() => histogram(delays), [delays]);
  const hLeak = useMemo(() => histogram(leaks), [leaks]);
  const hVm = useMemo(() => histogram(vms), [vms]);

  const [spec, setSpec] = useState<number | null>(null);
  useEffect(() => {
    if (spec === null && hDelay.maxCount > 0) setSpec(hDelay.mean * 1.15);
  }, [hDelay, spec]);

  const yieldPct = spec != null && delays.length ? yieldFraction(delays, spec, 'below') * 100 : null;
  const progress = target > 0 ? Math.round((samples.length / target) * 100) : 0;

  return (
    <section aria-label="Process variation" className="flex flex-col gap-4 glass rounded-2xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-ink">Process Variation · Monte Carlo</h2>
          <p className="text-xs text-ink-muted">
            Corner <span className="font-mono text-ink">{String(values.corner)}</span> sets the mean; sampling adds the spread.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={total}
            onChange={(e) => setTotal(Number(e.target.value))}
            disabled={running}
            aria-label="Sample count"
            className="rounded-md bg-surface px-2 py-1.5 text-sm text-ink ring-1 ring-white/10"
          >
            {[300, 600, 1200].map((n) => (
              <option key={n} value={n}>{n} samples</option>
            ))}
          </select>
          {running ? (
            <button onClick={cancel} className="rounded-md bg-surface px-3 py-1.5 text-sm text-ink-muted ring-1 ring-white/10">
              Stop ({progress}%)
            </button>
          ) : (
            <button onClick={() => run(deviceId, values, total)} className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-surface">
              Run
            </button>
          )}
        </div>
      </div>

      {samples.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-muted">Run a sweep to see how fabrication variation spreads delay, leakage, and the trip point.</p>
      ) : (
        <div className="flex flex-col gap-5">
          {/* Yield + spec limit */}
          <div className="rounded-lg bg-surface p-3 ring-1 ring-white/10">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-ink">Yield @ delay ≤ spec</span>
              <span className="font-mono text-lg tabular-nums" style={{ color: 'rgb(var(--nmos))' }}>
                {yieldPct != null ? `${yieldPct.toFixed(0)}%` : '—'}
              </span>
            </div>
            {spec != null && (
              <div className="mt-2 flex items-center gap-3">
                <span className="text-xs text-ink-muted">Spec limit</span>
                <input
                  type="range"
                  min={hDelay.min}
                  max={hDelay.max}
                  step={(hDelay.max - hDelay.min) / 100 || 1}
                  value={spec}
                  onChange={(e) => setSpec(Number(e.target.value))}
                  className="flex-1 accent-accent"
                  aria-label="Delay spec limit"
                />
                <span className="w-16 text-right font-mono text-xs text-ink">{formatQuantity({ value: spec, unit: 's' })}</span>
              </div>
            )}
          </div>

          <Dist title={`Propagation Delay  ·  μ=${formatQuantity({ value: hDelay.mean, unit: 's' })}  σ=${formatQuantity({ value: hDelay.std, unit: 's' })}`}>
            <HistogramView histogram={hDelay} unit="s" colorToken="accent" specLimit={spec} side="below" />
          </Dist>
          <Dist title={`Leakage  ·  μ=${formatQuantity({ value: hLeak.mean, unit: 'A' })}  σ=${formatQuantity({ value: hLeak.std, unit: 'A' })}`}>
            <HistogramView histogram={hLeak} unit="A" colorToken="pmos" />
          </Dist>
          <Dist title={`Switching Threshold  ·  μ=${formatQuantity({ value: hVm.mean, unit: 'V' })}  σ=${formatQuantity({ value: hVm.std, unit: 'V' })}`}>
            <HistogramView histogram={hVm} unit="V" colorToken="nmos" />
          </Dist>

          <p className="text-[11px] text-ink-muted">{samples.length} samples · educational model, not signoff.</p>
        </div>
      )}
    </section>
  );
}

function Dist({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <figure className="flex flex-col gap-1">
      <figcaption className="font-mono text-[11px] text-ink-muted">{title}</figcaption>
      {children}
    </figure>
  );
}
