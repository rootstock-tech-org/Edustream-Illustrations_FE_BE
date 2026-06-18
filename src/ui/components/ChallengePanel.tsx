'use client';
import { formatQuantity } from '@/domain/units';
import { listChallenges, getChallenge } from '@/domain/learning/challenges';
import { evaluateChallenge, type ChallengeEvaluation } from '@/domain/learning/challenge.evaluator';
import { METRIC_LABEL } from '@/domain/learning/metrics';
import { useLearning } from '@/ui/hooks/useLearning';
import { useSimulation } from '@/ui/hooks/useSimulation';
import { useTutorStore } from '@/state/tutor.store';

/** Guided-mode panel: pick a challenge, then see live, engine-scored progress. */
export function ChallengePanel() {
  const { activeChallengeId, baseline, startChallenge, exitChallenge, resetToBaseline } = useLearning();
  const { result } = useSimulation();

  if (!activeChallengeId) {
    return (
      <section aria-label="Challenges" className="flex flex-col gap-3 glass rounded-2xl p-4">
        <h2 className="text-sm font-semibold text-ink">Guided Challenges</h2>
        <p className="text-xs text-ink-muted">Pick a goal. Your current settings become the baseline; tune parameters to beat it.</p>
        {listChallenges().map((c) => (
          <button
            key={c.id}
            onClick={() => startChallenge(c.id)}
            className="flex flex-col items-start gap-1 rounded-lg bg-surface p-3 text-left ring-1 ring-black/10 dark:ring-white/10 transition hover:ring-accent/60"
          >
            <span className="text-sm font-medium text-ink">{c.title}</span>
            <span className="text-xs text-ink-muted">{c.description}</span>
          </button>
        ))}
      </section>
    );
  }

  const challenge = getChallenge(activeChallengeId);
  const evaluation = challenge && baseline && result ? evaluateChallenge(challenge, baseline, result) : null;

  return (
    <section aria-label="Active challenge" className="flex flex-col gap-3 glass rounded-2xl p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-ink">{challenge?.title}</h2>
          <p className="text-xs text-ink-muted">{challenge?.description}</p>
        </div>
        {evaluation?.solved && (
          <span className="shrink-0 rounded-full bg-nmos/20 px-2 py-0.5 text-[11px] font-medium text-nmos">Solved ✓</span>
        )}
      </div>

      {evaluation && (
        <div className="flex flex-col gap-3">
          <Meter
            label={`Goal · ${METRIC_LABEL[evaluation.goal.outcome.metric]}`}
            detail={`${signed(evaluation.goal.achievedPercent)} of ${evaluation.goal.targetPercent}% needed`}
            ratio={evaluation.goal.achievedPercent / evaluation.goal.targetPercent}
            met={evaluation.goal.met}
            from={evaluation.goal.outcome.baseline}
            to={evaluation.goal.outcome.current}
            metric={evaluation.goal.outcome.metric}
          />
          {evaluation.constraints.map((con, i) => (
            <Meter
              key={i}
              label={`Limit · ${METRIC_LABEL[con.outcome.metric]}`}
              detail={`${signed(con.changeInLimitedDirection)} of ${con.limitPercent}% allowed`}
              ratio={con.changeInLimitedDirection / con.limitPercent}
              met={con.met}
              from={con.outcome.baseline}
              to={con.outcome.current}
              metric={con.outcome.metric}
            />
          ))}
        </div>
      )}

      <div className="mt-1 flex flex-wrap gap-2">
        <button onClick={() => askTutor(challenge?.title, evaluation)} className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-surface">
          Ask tutor why
        </button>
        <button onClick={resetToBaseline} className="rounded-md bg-surface px-2.5 py-1 text-xs text-ink-muted ring-1 ring-black/10 dark:ring-white/10 hover:text-ink">
          Reset
        </button>
        <button onClick={exitChallenge} className="rounded-md bg-surface px-2.5 py-1 text-xs text-ink-muted ring-1 ring-black/10 dark:ring-white/10 hover:text-ink">
          Change challenge
        </button>
      </div>
    </section>
  );
}

function Meter({
  label,
  detail,
  ratio,
  met,
  from,
  to,
  metric,
}: {
  label: string;
  detail: string;
  ratio: number;
  met: boolean;
  from: number;
  to: number;
  metric: string;
}) {
  const pct = Math.max(0, Math.min(1, ratio)) * 100;
  const color = met ? 'rgb(var(--nmos))' : 'rgb(var(--pmos))';
  const unit = unitFor(metric);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-ink-muted">{label}</span>
        <span className={met ? 'text-nmos' : 'text-ink-muted'}>{detail}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/[0.05] dark:bg-white/8">
        <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="flex justify-between font-mono text-[10px] text-ink-muted">
        <span>{formatQuantity({ value: from, unit })}</span>
        <span>→ {formatQuantity({ value: to, unit })}</span>
      </div>
    </div>
  );
}

const signed = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(0)}%`;

// Best-effort unit for display in the meter readout.
function unitFor(metric: string): 'A' | 'W' | 's' | 'V' {
  if (metric === 'drainCurrent' || metric === 'leakage') return 'A';
  if (metric.endsWith('Power')) return 'W';
  if (metric === 'propagationDelay') return 's';
  return 'V';
}

function askTutor(title: string | undefined, evaluation: ChallengeEvaluation | null) {
  const status = evaluation?.solved ? 'I solved it' : 'I have not solved it yet';
  const q = `I'm working on the challenge "${title ?? ''}". ${status}. Based on the current simulation, explain what my parameter changes did to the device and why, and suggest what to adjust next.`;
  void useTutorStore.getState().ask(q);
}
