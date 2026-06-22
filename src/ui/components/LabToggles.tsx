'use client';
import { useLabModes } from '@/viz/three/lab-modes';

/** Toggles for the flat cross-section view and Learning-mode hover explanations. */
export function LabToggles() {
  const learning = useLabModes((s) => s.learning);
  const crossSection = useLabModes((s) => s.crossSection);
  const toggleLearning = useLabModes((s) => s.toggleLearning);
  const toggleCrossSection = useLabModes((s) => s.toggleCrossSection);

  return (
    <div className="flex items-center gap-1.5">
      <Toggle on={crossSection} onClick={toggleCrossSection} label="Cross-section" />
      <Toggle on={learning} onClick={toggleLearning} label="Learning" />
    </div>
  );
}

function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-full px-3 py-1 text-xs transition ${
        on ? 'bg-accent/90 text-surface shadow-[0_0_18px_rgba(122,229,130,0.45)]' : 'bg-black/[0.04] dark:bg-white/5 text-ink-muted ring-1 ring-black/10 dark:ring-white/10 hover:text-ink'
      }`}
    >
      {label}
    </button>
  );
}
