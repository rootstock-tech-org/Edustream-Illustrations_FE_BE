'use client';
import { formatQuantity } from '@/domain/units';
import type { Explanation } from '@/domain/explainability/explanation.types';
import { useSimulation } from '@/ui/hooks/useSimulation';

interface Props {
  onInspect: (title: string, explanation: Explanation) => void;
}

/** The six required device outputs, each linking to its derivation. */
export function OutputPanel({ onInspect }: Props) {
  const { result, status } = useSimulation();

  if (!result) {
    return <p className="text-sm text-ink-muted">{status === 'error' ? 'Simulation error.' : 'Computing…'}</p>;
  }

  const { operatingPoint: op, metrics } = result;
  const cards: Array<{ label: string; value: string; explanation?: Explanation }> = [
    { label: 'Output Voltage', value: formatQuantity(op.outputVoltage.quantity), explanation: op.outputVoltage.explanation },
    { label: 'Through Current', value: formatQuantity(op.current.quantity), explanation: op.current.explanation },
    { label: 'Total Power', value: formatQuantity(metrics.totalPower.quantity), explanation: metrics.totalPower.explanation },
    { label: 'Leakage', value: formatQuantity(metrics.leakage.quantity), explanation: metrics.leakage.explanation },
    { label: 'Propagation Delay', value: formatQuantity(metrics.propagationDelay.quantity), explanation: metrics.propagationDelay.explanation },
    { label: 'Switching Threshold', value: formatQuantity(metrics.switchingThreshold.quantity), explanation: metrics.switchingThreshold.explanation },
  ];

  return (
    <section aria-label="Outputs" className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        {cards.map((c) => (
          <button
            key={c.label}
            type="button"
            onClick={() => c.explanation && onInspect(c.label, c.explanation)}
            className="glass-2 lift flex flex-col items-start gap-1 rounded-xl p-3 text-left"
          >
            <span className="eyebrow text-[9px] text-ink-muted">{c.label}</span>
            <span className="font-mono text-lg tabular-nums text-ink">{c.value}</span>
            {c.explanation && <span className="text-[10px] text-accent">Show derivation →</span>}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2" aria-label="Transistor regions">
        {op.transistors.map((t) => (
          <span
            key={t.id}
            className="rounded-md bg-white/5 px-2 py-1 text-xs ring-1 ring-white/10"
          >
            <span className="text-ink-muted">{t.id}</span>{' '}
            <span className="font-medium text-ink">{t.region}</span>{' '}
            <span className="text-ink-muted">({formatQuantity(t.current)})</span>
          </span>
        ))}
      </div>
    </section>
  );
}
