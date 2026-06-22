'use client';
import { formatQuantity } from '@/domain/units';
import { useGateResult } from '@/ui/hooks/useSimulation';
import {
  useAssessmentStore,
  gradeMetric,
  overallScore,
  type AssessmentMetric,
  type AssessmentResult,
} from '@/state/assessment.store';
import type { DeviceMetrics } from '@/domain/simulation/result.types';

/** Display spec for each gradeable metric (label + display scale + accessor). */
const SPECS: ReadonlyArray<{
  metric: AssessmentMetric;
  label: string;
  unit: 'ps' | 'mW' | 'µA';
  scale: number;
  pick: (m: DeviceMetrics) => number;
}> = [
  { metric: 'delay', label: 'Delay', unit: 'ps', scale: 1e-12, pick: (m) => m.propagationDelay.quantity.value },
  { metric: 'power', label: 'Power', unit: 'mW', scale: 1e-3, pick: (m) => m.totalPower.quantity.value },
  { metric: 'leakage', label: 'Leakage', unit: 'µA', scale: 1e-6, pick: (m) => m.leakage.quantity.value },
];

/**
 * Challenge / assessment panel (future-ready). Grades the live gate metrics
 * against editable targets and shows a 0–100 score — the seam for full
 * challenge workflows. Lower is better for delay / power / leakage.
 */
export function AssessmentPanel() {
  const result = useGateResult();
  const targets = useAssessmentStore((s) => s.targets);
  const setTarget = useAssessmentStore((s) => s.setTarget);
  const reset = useAssessmentStore((s) => s.reset);

  if (!result) {
    return (
      <section aria-label="Assessment" className="glass rounded-2xl p-5">
        <Header score={null} onReset={reset} />
        <p className="mt-3 text-xs text-ink-muted">Challenge grading targets gate metrics (delay / power / leakage). Switch to the CMOS Inverter to set goals and score your design.</p>
      </section>
    );
  }

  const graded: AssessmentResult[] = SPECS.flatMap((spec) => {
    const target = targets[spec.metric];
    if (target == null) return [];
    return [gradeMetric(spec.metric, target, spec.pick(result.metrics))];
  });
  const score = overallScore(graded);

  return (
    <section aria-label="Assessment" className="glass rounded-2xl p-5">
      <Header score={graded.length ? score : null} onReset={reset} />
      <p className="mt-1 text-[11px] text-ink-muted">Set goals; the design is graded live. Lower is better.</p>

      <div className="mt-3 flex flex-col gap-2">
        {SPECS.map((spec) => {
          const target = targets[spec.metric];
          const actual = spec.pick(result.metrics);
          const r = target == null ? null : gradeMetric(spec.metric, target, actual);
          return (
            <div key={spec.metric} className="flex items-center gap-2 rounded-xl bg-black/[0.03] p-2.5 ring-1 ring-black/5 dark:bg-white/5 dark:ring-white/10">
              <span className="w-16 text-xs font-medium text-ink">{spec.label}</span>
              <label className="flex items-center gap-1 text-[11px] text-ink-muted">
                ≤
                <input
                  type="number"
                  value={target == null ? '' : Number((target / spec.scale).toPrecision(3))}
                  onChange={(e) => {
                    const v = e.target.value;
                    setTarget(spec.metric, v === '' ? null : Number(v) * spec.scale);
                  }}
                  className="w-16 rounded-md border border-[color:var(--hairline)] bg-[var(--surface-elevated)] px-1.5 py-0.5 text-right font-mono text-xs text-ink outline-none focus:ring-2 focus:ring-accent/40"
                />
                <span className="w-7">{spec.unit}</span>
              </label>
              <span className="ml-auto font-mono text-xs tabular-nums text-ink-muted">
                {formatQuantity(
                  spec.metric === 'delay'
                    ? result.metrics.propagationDelay.quantity
                    : spec.metric === 'power'
                      ? result.metrics.totalPower.quantity
                      : result.metrics.leakage.quantity,
                )}
              </span>
              <span
                className={`grid h-5 w-5 place-items-center rounded-full text-[11px] ${
                  r == null ? 'text-ink-muted' : r.met ? 'bg-nmos/20 text-nmos' : 'bg-pmos/15 text-pmos'
                }`}
                aria-label={r == null ? 'not graded' : r.met ? 'met' : 'not met'}
              >
                {r == null ? '–' : r.met ? '✓' : '✕'}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Header({ score, onReset }: { score: number | null; onReset: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-sm font-semibold text-ink">Challenge</h2>
      <div className="flex items-center gap-2">
        {score != null && (
          <span className="rounded-full bg-accent/15 px-2.5 py-0.5 font-mono text-xs font-semibold text-accent">{score} / 100</span>
        )}
        <button onClick={onReset} className="text-[11px] text-ink-muted hover:text-ink">Reset</button>
      </div>
    </div>
  );
}
