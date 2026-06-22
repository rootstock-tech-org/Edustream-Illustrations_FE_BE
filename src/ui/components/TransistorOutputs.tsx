'use client';
import { formatQuantity } from '@/domain/units';
import type { Explanation } from '@/domain/explainability/explanation.types';
import { useTransistorResult, useSimulation } from '@/ui/hooks/useSimulation';

interface Props {
  onInspect: (title: string, explanation: Explanation) => void;
}

const REGION_LABEL: Record<string, string> = {
  cutoff: 'Cutoff',
  triode: 'Triode (linear)',
  saturation: 'Saturation (active)',
};

/** The required single-transistor outputs: I_D, gₘ, V_th, and region. */
export function TransistorOutputs({ onInspect }: Props) {
  const result = useTransistorResult();
  const { status } = useSimulation();

  if (!result) {
    return <p className="text-sm text-ink-muted">{status === 'error' ? 'Simulation error.' : 'Computing…'}</p>;
  }

  const op = result.operatingPoint;
  const cards: Array<{ label: string; value: string; explanation: Explanation }> = [
    { label: 'Drain Current I_D', value: formatQuantity(op.drainCurrent.quantity), explanation: op.drainCurrent.explanation },
    { label: 'Transconductance gₘ', value: formatQuantity(op.transconductance.quantity), explanation: op.transconductance.explanation },
    { label: 'Threshold V_th', value: formatQuantity(op.threshold.quantity), explanation: op.threshold.explanation },
  ];

  return (
    <section aria-label="Transistor outputs" className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        {cards.map((c) => (
          <button
            key={c.label}
            type="button"
            onClick={() => onInspect(c.label, c.explanation)}
            className="glass-2 lift flex flex-col items-start gap-1 rounded-xl p-3 text-left"
          >
            <span className="eyebrow text-[9px] text-ink-muted">{c.label}</span>
            <span className="font-mono text-lg tabular-nums text-ink">{c.value}</span>
            <span className="text-[10px] text-accent">Show derivation →</span>
          </button>
        ))}
        <div className="glass-2 flex flex-col items-start gap-1 rounded-xl p-3">
          <span className="eyebrow text-[9px] text-ink-muted">Operating Region</span>
          <span className="font-mono text-lg tabular-nums text-ink">{REGION_LABEL[op.region] ?? op.region}</span>
          <span className="text-[10px] text-ink-muted">V_ov = {formatQuantity(op.overdrive)}</span>
        </div>
      </div>

      <p className="text-xs text-ink-muted">
        {result.type === 'pmos'
          ? 'PMOS conducts as the gate is pulled below the source; values are source-referenced magnitudes.'
          : 'NMOS conducts as the gate rises above threshold, forming an electron channel.'}
      </p>
    </section>
  );
}
