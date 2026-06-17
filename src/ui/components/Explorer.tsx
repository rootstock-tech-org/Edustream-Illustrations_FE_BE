'use client';
import { useState } from 'react';
import type { Explanation } from '@/domain/explainability/explanation.types';
import { formatQuantity } from '@/domain/units';
import { useSimulation } from '@/ui/hooks/useSimulation';
import { useDevice } from '@/ui/hooks/useDevice';
import { DevicePicker } from './DevicePicker';
import { ParameterPanel } from './ParameterPanel';
import { OutputPanel } from './OutputPanel';
import { ExplanationPanel } from './ExplanationPanel';
import { ImpactCard } from './ImpactCard';
import { TutorChat } from './TutorChat';
import { PerfHud } from './PerfHud';
import { ModeTabs } from './ModeTabs';
import { LabToggles } from './LabToggles';
import { LearningCard } from './LearningCard';
import { PresetGallery } from './PresetGallery';
import { ChallengePanel } from './ChallengePanel';
import { MonteCarloPanel } from './MonteCarloPanel';
import { useLearning } from '@/ui/hooks/useLearning';
import { GraphPanel } from '@/viz/graph/GraphPanel';
import { DeviceSceneCard } from '@/viz/three/DeviceSceneCard';

/**
 * Device-as-laboratory layout: the interactive device is the hero (full-width,
 * tall), with live readouts floating beside it. Graphs, explanations, and the
 * tutor become a secondary instrument deck; precise sliders live in a collapsed
 * drawer (the accessible, fine-control fallback). Pure composition.
 */
export function Explorer() {
  const { result } = useSimulation();
  const { setParameter } = useDevice();
  const { mode } = useLearning();
  const [inspected, setInspected] = useState<{ title: string; explanation: Explanation } | null>(null);

  return (
    <main className="mx-auto flex max-w-[1700px] flex-col gap-5 p-3 md:p-5">
      <header className="glass flex flex-wrap items-center justify-between gap-3 rounded-2xl px-5 py-3">
        <div className="flex items-center gap-3">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-sm font-bold text-white shadow-[0_0_20px_rgba(223,37,49,0.5)]">◆</span>
          <div>
            <h1 className="eyebrow text-sm text-ink">Probe Station</h1>
            <p className="text-xs text-ink-muted">Interactive semiconductor laboratory</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ModeTabs />
          <LabToggles />
          <PerfHud />
          <PresetGallery />
          <DevicePicker />
        </div>
      </header>

      {/* HERO: the interactive device */}
      <section className="relative h-[62vh] min-h-[30rem] w-full overflow-hidden rounded-3xl glass">
        <DeviceSceneCard />
        {result && (
          <div className="pointer-events-none absolute right-4 top-4 flex flex-col gap-2">
            <FloatingChip label="Vout" value={formatQuantity(result.operatingPoint.outputVoltage.quantity)} />
            <FloatingChip label="I_D" value={formatQuantity(result.operatingPoint.current.quantity)} />
            <FloatingChip label="Delay" value={formatQuantity(result.metrics.propagationDelay.quantity)} />
            <FloatingChip label="Power" value={formatQuantity(result.metrics.totalPower.quantity)} />
          </div>
        )}
        <div className="pointer-events-none absolute left-4 top-4 max-w-[16rem]">
          <p className="eyebrow text-[10px] text-accent">Drag the device</p>
          <p className="text-xs text-ink-muted">Grab the W / L / Tox grips, or click VDD / VIN to edit. Everything updates live.</p>
        </div>
        <LearningCard />
      </section>

      {/* Advanced settings — the device is the primary control surface; these
          sliders are the precise / accessible fallback (collapsed by default). */}
      <details className="glass rounded-2xl px-5 py-3">
        <summary className="eyebrow cursor-pointer text-[11px] text-ink-muted">Advanced settings — precise sliders</summary>
        <div className="mt-4">
          <ParameterPanel />
        </div>
      </details>

      {/* Secondary instrument deck */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="flex flex-col gap-5">
          {mode === 'variation' ? (
            <MonteCarloPanel />
          ) : (
            result && (
              <div className="glass rounded-2xl p-5">
                <GraphPanel result={result} onScrubInput={(vin) => setParameter('Vin', vin)} />
              </div>
            )
          )}
        </section>

        <aside className="flex flex-col gap-5">
          {mode === 'guided' && <ChallengePanel />}
          <ImpactCard />
          <OutputPanel onInspect={(title, explanation) => setInspected({ title, explanation })} />
          <div className="glass rounded-2xl p-5">
            <ExplanationPanel title={inspected?.title ?? 'Derivation'} explanation={inspected?.explanation ?? null} />
          </div>
          <TutorChat />
        </aside>
      </div>
    </main>
  );
}

function FloatingChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass-2 flex min-w-[7rem] flex-col rounded-xl px-3 py-1.5">
      <span className="eyebrow text-[8px] text-ink-muted">{label}</span>
      <span className="font-mono text-sm tabular-nums text-ink">{value}</span>
    </div>
  );
}
