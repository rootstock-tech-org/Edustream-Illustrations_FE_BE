'use client';
import { useLabModes } from '@/viz/three/lab-modes';
import { REGION_INFO, ANATOMY_NODES } from '@/viz/three/anatomy-content';

/**
 * Learning-mode explainer. Rendered as a solid strip BELOW the device stage
 * (never over it), so it can't cover the device or its callout labels and the
 * device stays fully interactive. Click a region on the device — or use the
 * Prev/Next stepper — to walk the anatomy; this strip shows what each region
 * is, does, and why it matters.
 */
export function LearningCard() {
  const learning = useLabModes((s) => s.learning);
  const selected = useLabModes((s) => s.selected);
  const setSelected = useLabModes((s) => s.setSelected);
  if (!learning) return null;

  const info = selected ? REGION_INFO[selected] : null;
  const idx = selected ? ANATOMY_NODES.indexOf(selected as (typeof ANATOMY_NODES)[number]) : -1;
  const step = (d: number) => {
    const n = ANATOMY_NODES.length;
    const next = ((idx < 0 ? 0 : idx + d) % n + n) % n;
    setSelected(ANATOMY_NODES[next]!);
  };

  return (
    <section aria-label="Learning explainer" className="glass flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl px-5 py-4">
      {info ? (
        <>
          <div className="min-w-[12rem] flex-1">
            <p className="eyebrow text-[11px] text-accent">{info.term}</p>
            <p className="mt-1 text-sm text-ink">{info.what}</p>
            <div className="mt-2 flex flex-col gap-1 sm:flex-row sm:gap-x-8">
              <p className="text-xs text-ink-muted"><span className="font-medium text-ink">Does — </span>{info.does}</p>
              <p className="text-xs text-ink-muted"><span className="font-medium text-ink">Why — </span>{info.why}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => step(-1)} className="rounded-md bg-black/[0.04] px-2.5 py-1 text-xs text-ink-muted ring-1 ring-black/10 hover:text-ink dark:bg-white/5 dark:ring-white/10">‹ Prev</button>
            <span className="font-mono text-[10px] text-ink-muted">{idx + 1} / {ANATOMY_NODES.length}</span>
            <button onClick={() => step(1)} className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-surface">Next ›</button>
            <button onClick={() => setSelected(null)} className="ml-1 text-ink-muted hover:text-ink" aria-label="Clear selection">✕</button>
          </div>
        </>
      ) : (
        <>
          <div className="min-w-[12rem] flex-1">
            <p className="eyebrow text-[11px] text-accent">Learning mode</p>
            <p className="mt-1 text-sm text-ink-muted">Click any region on the device — gate, oxide, source, drain, channel, or substrate — to learn what it is, what it does, and why it matters. The device stays fully rotatable.</p>
          </div>
          <button onClick={() => step(1)} className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-surface">Start tour ›</button>
        </>
      )}
    </section>
  );
}
