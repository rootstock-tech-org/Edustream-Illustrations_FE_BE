'use client';
import { useLabModes } from '@/viz/three/lab-modes';
import { REGION_INFO, ANATOMY_NODES } from '@/viz/three/anatomy-content';

/**
 * Learning-mode side card. When a device region is pinned (clicked), it explains
 * what it is, what it does, and why it matters — supporting the geometry, not
 * replacing it — with a Prev/Next stepper for a guided anatomy tour.
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
    <div className="glass-3 pointer-events-auto absolute bottom-4 left-4 w-72 rounded-2xl p-4">
      {info ? (
        <>
          <div className="flex items-center justify-between">
            <p className="eyebrow text-[11px] text-accent">{info.term}</p>
            <button onClick={() => setSelected(null)} className="text-ink-muted hover:text-ink" aria-label="Close">✕</button>
          </div>
          <p className="mt-2 text-sm text-ink">{info.what}</p>
          <p className="mt-2 text-xs text-ink-muted"><span className="text-white/80">Does — </span>{info.does}</p>
          <p className="mt-1 text-xs text-ink-muted"><span className="text-white/80">Why — </span>{info.why}</p>
          <div className="mt-3 flex items-center justify-between">
            <button onClick={() => step(-1)} className="rounded-md bg-white/5 px-2.5 py-1 text-xs text-ink-muted ring-1 ring-white/10 hover:text-ink">‹ Prev</button>
            <span className="font-mono text-[10px] text-ink-muted">{idx + 1} / {ANATOMY_NODES.length}</span>
            <button onClick={() => step(1)} className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-white">Next ›</button>
          </div>
        </>
      ) : (
        <>
          <p className="eyebrow text-[11px] text-accent">Learning mode</p>
          <p className="mt-2 text-sm text-ink-muted">Click any region of the device — gate, oxide, source, drain, channel, or substrate — to learn what it is, what it does, and why it matters.</p>
          <button onClick={() => step(1)} className="mt-3 rounded-md bg-accent px-3 py-1 text-xs font-medium text-white">Start tour ›</button>
        </>
      )}
    </div>
  );
}
