'use client';
import dynamic from 'next/dynamic';
import { formatQuantity } from '@/domain/units';
import type { Explanation } from '@/domain/explainability/explanation.types';

// KaTeX is heavy and only needed once a derivation is opened — code-split it out
// of the initial bundle so it never affects first paint / Lighthouse.
const Equation = dynamic(() => import('./math/Equation').then((m) => m.Equation), {
  ssr: false,
  loading: () => <span className="font-mono text-ink-muted">…</span>,
});

/**
 * Renders an Explanation tree with progressive disclosure. Because the tree is
 * emitted by the evaluators, every number here is provably the one the engine
 * used — this panel cannot show a stale or wrong derivation.
 */
export function ExplanationPanel({ title, explanation }: { title: string; explanation: Explanation | null }) {
  if (!explanation) {
    return (
      <p className="text-sm text-ink-muted">
        Select an output to see how it was derived from first principles.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <ExplanationNode explanation={explanation} defaultOpen />
    </div>
  );
}

function ExplanationNode({ explanation, defaultOpen = false }: { explanation: Explanation; defaultOpen?: boolean }) {
  const e = explanation;
  return (
    <details open={defaultOpen} className="glass-2 rounded-lg p-3">
      <summary className="cursor-pointer text-sm text-ink">
        {e.summary}{' '}
        <span className="font-mono text-accent">= {formatQuantity(e.result)}</span>
        {e.regionOfOperation && (
          <span className="ml-2 rounded bg-white/5 px-1.5 py-0.5 text-[10px] uppercase text-ink-muted">
            {e.regionOfOperation}
          </span>
        )}
      </summary>

      <div className="mt-2 flex flex-col gap-2 text-xs">
        <div className="overflow-x-auto rounded bg-black/30 p-2 text-ink">
          <Equation latex={e.latex} block />
        </div>

        {e.substitutions.length > 0 && (
          <ul className="flex flex-col gap-0.5">
            {e.substitutions.map((s) => (
              <li key={s.symbol} className="flex justify-between gap-4">
                <span className="font-mono text-ink-muted">{s.symbol}</span>
                <span className="font-mono tabular-nums text-ink">{formatQuantity(s.quantity)}</span>
              </li>
            ))}
          </ul>
        )}

        {e.assumptions.length > 0 && (
          <ul className="list-disc pl-4 text-ink-muted">
            {e.assumptions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        )}

        {e.children.length > 0 && (
          <div className="mt-1 flex flex-col gap-2 border-l border-white/10 pl-2">
            {e.children.map((child, i) => (
              <ExplanationNode key={`${child.formulaId}-${i}`} explanation={child} />
            ))}
          </div>
        )}
      </div>
    </details>
  );
}
