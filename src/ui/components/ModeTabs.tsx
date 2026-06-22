'use client';
import { useLearning } from '@/ui/hooks/useLearning';
import { useDevice } from '@/ui/hooks/useDevice';
import type { LearningMode } from '@/state/learning.store';

const MODES: ReadonlyArray<{ id: LearningMode; label: string }> = [
  { id: 'explore', label: 'Explore' },
  { id: 'guided', label: 'Guided' },
  { id: 'variation', label: 'Variation' },
];

/**
 * Switches between free exploration and guided challenges. Guided + Variation
 * are gate-circuit experiences (challenges, process Monte Carlo), so for the
 * single-transistor explorers only Explore is offered — no half-built modes.
 */
export function ModeTabs() {
  const { mode, setMode } = useLearning();
  const { device } = useDevice();
  const available = device.kind === 'transistor' ? MODES.filter((m) => m.id === 'explore') : MODES;
  return (
    <div role="tablist" aria-label="Mode" className="flex rounded-full bg-black/[0.04] dark:bg-white/5 p-0.5 ring-1 ring-black/10 dark:ring-white/10">
      {available.map((m) => (
        <button
          key={m.id}
          role="tab"
          aria-selected={mode === m.id}
          onClick={() => setMode(m.id)}
          className={`rounded-full px-3 py-1 text-sm transition ${
            mode === m.id ? 'bg-accent text-surface' : 'text-ink-muted hover:text-ink'
          }`}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
