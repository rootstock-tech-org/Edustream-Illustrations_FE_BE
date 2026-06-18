'use client';
import { useLearning } from '@/ui/hooks/useLearning';
import type { LearningMode } from '@/state/learning.store';

const MODES: ReadonlyArray<{ id: LearningMode; label: string }> = [
  { id: 'explore', label: 'Explore' },
  { id: 'guided', label: 'Guided' },
  { id: 'variation', label: 'Variation' },
];

/** Switches between free exploration and guided challenges. */
export function ModeTabs() {
  const { mode, setMode } = useLearning();
  return (
    <div role="tablist" aria-label="Mode" className="flex rounded-full bg-black/[0.04] dark:bg-white/5 p-0.5 ring-1 ring-black/10 dark:ring-white/10">
      {MODES.map((m) => (
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
