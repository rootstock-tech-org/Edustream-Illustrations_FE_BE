'use client';
import { useEffect, useMemo, useState } from 'react';
import { FeedbackBar } from './FeedbackBar';
import { FAB_STEPS } from '@/domain/education/fab-process';
import { FabricationScene3D } from '@/viz/fab/FabricationScene3D';

/**
 * Fabrication section — two views of the 180 nm CMOS flow:
 *  1. "Illustration": a NEW interactive cross-section that redraws the process
 *     stage by stage (auto-play or step through), styled to the reference deck.
 *  2. "Reference PDF": the actual uploaded slides (/fabrication.pdf), native viewer.
 * Esc returns to the Probe Station.
 */
const PDF_SRC = '/fabrication.pdf';

export function FabricationSection({ onClose }: { onClose: () => void }) {
  const [view, setView] = useState<'illustration' | 'pdf'>('illustration');
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const step = FAB_STEPS[i]!;
  const last = FAB_STEPS.length - 1;

  // Auto-advance while playing (illustration view only); stop at the end.
  useEffect(() => {
    if (!playing || view !== 'illustration') return;
    const id = setInterval(() => setI((c) => (c >= last ? c : c + 1)), 3200);
    return () => clearInterval(id);
  }, [playing, last, view]);
  useEffect(() => {
    if (playing && i >= last) setPlaying(false);
  }, [i, playing, last]);

  // Keyboard: ← / → to step, Esc to exit.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (view === 'illustration' && e.key === 'ArrowRight') setI((c) => Math.min(last, c + 1));
      else if (view === 'illustration' && e.key === 'ArrowLeft') setI((c) => Math.max(0, c - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [last, onClose, view]);

  const modules = useMemo(() => {
    const seen: string[] = [];
    for (const s of FAB_STEPS) if (!seen.includes(s.module)) seen.push(s.module);
    return seen;
  }, []);

  return (
    <main className="flex h-[100dvh] flex-col gap-3 overflow-hidden p-3 md:p-4">
      {/* top bar */}
      <header className="glass flex items-center justify-between gap-3 rounded-2xl px-4 py-2.5">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="rounded-lg bg-black/[0.04] px-3 py-1.5 text-sm font-medium text-ink-muted ring-1 ring-black/10 transition hover:text-ink dark:bg-white/5 dark:ring-white/10"
          >
            ‹ Back
          </button>
          <div className="leading-tight">
            <h1 className="eyebrow text-sm text-ink">Fabrication</h1>
            <p className="hidden text-[11px] text-ink-muted sm:block">Sculpting the Silicon CMOS on a 180 nm process</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* view toggle */}
          <div className="flex items-center rounded-lg bg-black/[0.04] p-0.5 ring-1 ring-black/10 dark:bg-white/5 dark:ring-white/10">
            {(['illustration', 'pdf'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`rounded-md px-2.5 py-1 text-[12px] font-medium transition ${
                  view === v ? 'bg-accent text-white shadow-[0_0_14px_var(--accent-glow)]' : 'text-ink-muted hover:text-ink'
                }`}
              >
                {v === 'illustration' ? 'Illustration' : 'Reference PDF'}
              </button>
            ))}
          </div>
          {view === 'illustration' && (
            <>
              <span className="font-mono text-[11px] text-ink-muted tabular-nums">{i + 1} / {FAB_STEPS.length}</span>
              <button
                onClick={() => (i >= last ? (setI(0), setPlaying(true)) : setPlaying((p) => !p))}
                className="rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white shadow-[0_0_18px_var(--accent-glow)]"
              >
                {playing ? '❚❚ Pause' : i >= last ? '↻ Replay' : '▶ Play'}
              </button>
            </>
          )}
        </div>
      </header>

      {view === 'pdf' ? (
        <div className="glass min-h-0 flex-1 overflow-hidden rounded-2xl">
          <object data={PDF_SRC} type="application/pdf" className="h-full w-full">
            <iframe src={PDF_SRC} title="Fabrication process deck" className="h-full w-full border-0" />
            <div className="grid h-full place-items-center p-6 text-center text-sm text-ink-muted">
              <p>
                Your browser can&apos;t display the PDF inline.{' '}
                <a href={PDF_SRC} target="_blank" rel="noopener noreferrer" className="text-accent underline">
                  Open the fabrication deck in a new tab
                </a>
                .
              </p>
            </div>
          </object>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto md:grid-cols-[minmax(180px,220px)_minmax(0,1fr)] md:overflow-hidden">
          {/* module timeline */}
          <aside className="glass flex min-h-0 flex-col overflow-hidden rounded-2xl">
            <div className="border-b border-[color:var(--hairline)] px-4 py-2.5">
              <h2 className="eyebrow text-[11px] text-accent">Process Modules</h2>
            </div>
            <nav className="min-h-0 flex-1 overflow-y-auto p-2.5">
              {modules.map((m) => {
                const first = FAB_STEPS.findIndex((s) => s.module === m);
                const active = step.module === m;
                const idxs = FAB_STEPS.reduce<number[]>((a, s, k) => (s.module === m ? [...a, k] : a), []);
                const done = !active && idxs.every((k) => k < i);
                return (
                  <button
                    key={m}
                    onClick={() => setI(first)}
                    className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[13px] font-medium transition ${
                      active
                        ? 'bg-accent text-white shadow-[0_0_18px_var(--accent-glow)]'
                        : 'text-ink-muted hover:bg-black/[0.04] hover:text-ink dark:hover:bg-white/5'
                    }`}
                  >
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${active ? 'bg-white' : done ? 'bg-accent' : 'bg-current opacity-40'}`} />
                    {m}
                  </button>
                );
              })}
            </nav>
          </aside>

          {/* stage illustration + description */}
          <section className="flex min-h-0 flex-col gap-3 overflow-y-auto">
            <div className="glass flex flex-col gap-3 rounded-2xl p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="eyebrow text-[11px] text-accent">{step.module}</p>
                <span className="rounded-full bg-black/[0.04] px-2.5 py-0.5 text-[11px] font-medium text-ink-muted ring-1 ring-black/10 dark:bg-white/5 dark:ring-white/10">
                  {step.method}
                </span>
              </div>
              <div className="h-[48vh] min-h-[300px] overflow-hidden rounded-xl bg-[var(--surface-elevated)] ring-1 ring-black/10 dark:ring-white/10">
                <FabricationScene3D step={step} />
              </div>
              <p className="text-[11px] text-ink-muted">Drag to rotate · scroll to zoom · ▶ Play to build the wafer up layer by layer</p>
              <h2 className="text-xl font-bold text-ink">{step.title}</h2>
              <p className="text-sm leading-relaxed text-ink-muted">{step.description}</p>
              <FeedbackBar id="fabrication" />
            </div>

            {/* controls */}
            <div className="glass flex items-center gap-3 rounded-2xl px-4 py-3">
              <button
                onClick={() => setI((c) => Math.max(0, c - 1))}
                disabled={i === 0}
                className="rounded-lg bg-black/[0.04] px-3 py-1.5 text-sm text-ink-muted ring-1 ring-black/10 transition enabled:hover:text-ink disabled:opacity-40 dark:bg-white/5 dark:ring-white/10"
              >
                ‹ Prev
              </button>
              <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/10">
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-accent transition-[width] duration-300"
                  style={{ width: `${((i + 1) / FAB_STEPS.length) * 100}%` }}
                />
              </div>
              <button
                onClick={() => setI((c) => Math.min(last, c + 1))}
                disabled={i === last}
                className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white transition disabled:opacity-40"
              >
                Next ›
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
