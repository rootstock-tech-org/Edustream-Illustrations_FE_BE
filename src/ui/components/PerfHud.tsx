'use client';
import { useSimulation } from '@/ui/hooks/useSimulation';

/** Live compute-time readout against the sub-50 ms budget. */
export function PerfHud() {
  const { elapsedMs, status } = useSimulation();
  if (elapsedMs == null) return null;
  const withinBudget = elapsedMs < 50;
  return (
    <span
      className="flex items-center gap-1.5 rounded-full bg-black/[0.04] dark:bg-white/5 px-2.5 py-1 font-mono text-xs tabular-nums ring-1 ring-black/10 dark:ring-white/10"
      style={{ color: withinBudget ? 'rgb(var(--ink-muted))' : 'rgb(var(--accent))' }}
      title="Simulation compute time (target < 50 ms)"
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: withinBudget ? 'rgb(var(--ink-muted))' : 'rgb(var(--accent))' }} />
      {status === 'running' ? '…' : `${elapsedMs.toFixed(1)} ms`}
    </span>
  );
}
