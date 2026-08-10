'use client';
import { useEffect, useState } from 'react';
import type { Explanation } from '@/domain/explainability/explanation.types';
import { formatQuantity } from '@/domain/units';
import { useGateResult, useTransistorResult } from '@/ui/hooks/useSimulation';
import { useDevice } from '@/ui/hooks/useDevice';
import { useLabModes } from '@/viz/three/lab-modes';
import { DevicePicker } from './DevicePicker';
import { ParameterPanel } from './ParameterPanel';
import { OutputPanel } from './OutputPanel';
import { TransistorOutputs } from './TransistorOutputs';
import { ExplanationPanel } from './ExplanationPanel';
import { ImpactCard } from './ImpactCard';
import { TutorChat } from './TutorChat';
import { ThemeToggle } from './ThemeToggle';
import { LearningCard } from './LearningCard';
import { MonteCarloPanel } from './MonteCarloPanel';
import { AssessmentPanel } from './AssessmentPanel';
import { CircuitSchematic } from './CircuitSchematic';
import { formatLength } from '@/viz/three/DimensionLines';
import { GraphPanel } from '@/viz/graph/GraphPanel';
import { TransistorGraphPanel } from '@/viz/graph/TransistorGraphPanel';
import { DeviceSceneCard } from '@/viz/three/DeviceSceneCard';
import { SingleTransistorCard } from '@/viz/three/SingleTransistorCard';
import { FeedbackBar } from './FeedbackBar';
import dynamic from 'next/dynamic';

const MosfetScene3D = dynamic(() => import('@/viz/three/MosfetScene3D').then((m) => m.MosfetScene3D), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse rounded-xl bg-surface-elevated" />,
});
const FinfetScene3D = dynamic(() => import('@/viz/three/FinfetScene3D').then((m) => m.FinfetScene3D), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse rounded-xl bg-surface-elevated" />,
});
import { GateSceneCard } from '@/viz/three/GateSceneCard';
import { FabricationSection } from './FabricationSection';
import { SequentialLogicSection } from './sequential/SequentialLogicSection';
import { CombinationalLogicSection } from './combinational/CombinationalLogicSection';
import { LogicGatesSection } from './logic/LogicGatesSection';

type Tab = 'explore' | 'analyze' | 'variation' | 'learn';
const TABS: ReadonlyArray<{ id: Tab; label: string }> = [
  { id: 'explore', label: 'Explore' },
  { id: 'analyze', label: 'Analyze' },
  { id: 'variation', label: 'Variation' },
  { id: 'learn', label: 'Learn' },
];

/**
 * Probe Station — a laboratory bench, not a scrolling page. Fixed full-height
 * shell: LEFT = controls, CENTER = the live device (with its CMOS schematic
 * nav-aid and L/W dimension callouts), RIGHT = the instrument readout that swaps
 * per tab (Explore · Analyze · Variation · Learn). All physics/graphs/sims are
 * the existing engine — this is pure composition.
 */
export function Explorer() {
  const { device, values, setParameter } = useDevice();
  const isTransistor = device.kind === 'transistor';
  // The CMOS-inverter nav schematic only makes sense for the inverter-family
  // devices; the standalone MOSFET/FinFET stages hide it but keep the
  // cross-section toggle + L/W readout (they respond to the parameter sliders).
  const showStageAids = true;
  const showSchematic = device.id !== 'mosfet' && device.id !== 'finfet';
  const lLabel = formatLength(Number(values.L));
  const wLabel = formatLength(Number(values.W));
  const gateResult = useGateResult();
  const txResult = useTransistorResult();
  const [tab, setTab] = useState<Tab>('explore');
  const [inspected, setInspected] = useState<{ title: string; explanation: Explanation } | null>(null);
  const [fabOpen, setFabOpen] = useState(false);
  const [seqOpen, setSeqOpen] = useState(false);
  const [combOpen, setCombOpen] = useState(false);
  const [gatesOpen, setGatesOpen] = useState(false);

  const crossSection = useLabModes((s) => s.crossSection);
  const setCrossSection = useLabModes((s) => s.setCrossSection);

  // The Learn tab IS learning mode (anatomy callouts + clickable regions).
  useEffect(() => {
    useLabModes.getState().setLearning(tab === 'learn');
  }, [tab]);

  const onInspect = (title: string, explanation: Explanation) => setInspected({ title, explanation });

  // Fabrication walkthrough / Sequential Logic lab / Combinational Logic lab each fully replace the bench while open.
  if (fabOpen) return <FabricationSection onClose={() => setFabOpen(false)} />;
  if (seqOpen) return <SequentialLogicSection onClose={() => setSeqOpen(false)} />;
  if (combOpen) return <CombinationalLogicSection onClose={() => setCombOpen(false)} />;
  if (gatesOpen) return <LogicGatesSection onClose={() => setGatesOpen(false)} />;

  return (
    <main className="flex h-[100dvh] flex-col gap-3 overflow-hidden p-3 md:p-4">
      {/* ── top bar ── */}
      <header className="glass flex items-center justify-between gap-3 rounded-2xl px-4 py-2.5">
        <div className="flex items-center gap-3">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-sm font-bold text-white shadow-[0_0_20px_var(--accent-glow)]">◆</span>
          <div className="leading-tight">
            <h1 className="eyebrow text-sm text-ink">Probe Station</h1>
            <p className="hidden text-[11px] text-ink-muted sm:block">Interactive semiconductor laboratory</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setGatesOpen(true)}
            className="rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white shadow-[0_0_18px_var(--accent-glow)] transition hover:opacity-90"
          >
            Logic Gates
          </button>
          <button
            onClick={() => setFabOpen(true)}
            className="rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white shadow-[0_0_18px_var(--accent-glow)] transition hover:opacity-90"
          >
            Fabrication
          </button>
          <button
            onClick={() => setSeqOpen(true)}
            className="rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white shadow-[0_0_18px_var(--accent-glow)] transition hover:opacity-90"
          >
            Sequential Logic
          </button>
          <button
            onClick={() => setCombOpen(true)}
            className="rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white shadow-[0_0_18px_var(--accent-glow)] transition hover:opacity-90"
          >
            Combinational Logic
          </button>
          <DevicePicker />
          <ThemeToggle />
        </div>
      </header>

      {/* ── lab bench: a persistent LEFT sidebar (nav + controls + info), then
          the device + instruments. The sidebar shows from `md` up; at md–xl the
          instruments stack under the device, and at `xl` they move to a 3rd
          column. ── */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto md:grid-cols-[minmax(220px,250px)_minmax(0,1fr)] md:overflow-hidden">
        {/* LEFT — workspace nav + controls + info */}
        <aside className="glass flex min-h-0 flex-col overflow-hidden rounded-2xl">
          {/* vertical workspace nav */}
          <nav role="tablist" aria-label="Workspace" className="flex flex-col gap-1 p-2.5">
            {TABS.map((t) => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(t.id)}
                  className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition ${
                    active
                      ? 'bg-accent text-white shadow-[0_0_18px_var(--accent-glow)]'
                      : 'text-ink-muted hover:bg-black/[0.04] hover:text-ink dark:hover:bg-white/5'
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-white' : 'bg-current opacity-50'}`} />
                  {t.label}
                </button>
              );
            })}
          </nav>

          {/* controls — gets the flexible, scrollable middle */}
          <div className="border-t border-[color:var(--hairline)] px-4 pb-2 pt-2.5">
            <h2 className="eyebrow text-[11px] text-accent">Controls</h2>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
            <ParameterPanel />
          </div>

          {/* informative panel pinned below the controls */}
          <InfoPanel />
        </aside>

        {/* device + instruments: stacked (md) → two columns (xl) */}
        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto xl:grid xl:grid-cols-[minmax(0,1fr)_344px] xl:overflow-hidden">
          {/* CENTER — the device bench + its feedback (one grid column) */}
          <div className="flex min-h-0 flex-col gap-3 xl:overflow-y-auto">
          <section className="relative min-h-[22rem] shrink-0 overflow-hidden rounded-2xl glass xl:min-h-0">
          {device.id === 'mosfet' ? (
            <MosfetScene3D />
          ) : device.id === 'finfet' ? (
            <FinfetScene3D />
          ) : device.id === 'and2' || device.id === 'or2' ? (
            <GateSceneCard />
          ) : isTransistor ? (
            <SingleTransistorCard />
          ) : (
            <DeviceSceneCard />
          )}

          {/* stage toolbar */}
          {showStageAids && (
            <div className="absolute left-3 top-3 flex gap-2">
              <StageToggle on={crossSection} onClick={() => setCrossSection(!crossSection)} label="Cross-section" />
            </div>
          )}

          {/* fixed L / W readout — pinned in the top-left margin (where no
              rotating 3D label travels), so the dimension VALUES never collide
              with another chip or the geometry. The on-device brackets show
              WHICH spans these measure. */}
          {showStageAids && (
            <div className="pointer-events-none absolute left-3 top-12 flex flex-col gap-1 font-mono text-[10px]">
              <span className="inline-flex items-center gap-1.5 self-start rounded-md bg-black/65 px-2 py-0.5 text-white ring-1 ring-white/10 backdrop-blur-sm">
                L <span style={{ color: '#7df9ff', textShadow: '0 0 8px rgba(125,249,255,0.55)' }}>{lLabel}</span>
              </span>
              <span className="inline-flex items-center gap-1.5 self-start rounded-md bg-black/65 px-2 py-0.5 text-white ring-1 ring-white/10 backdrop-blur-sm">
                W <span style={{ color: '#7df9ff', textShadow: '0 0 8px rgba(125,249,255,0.55)' }}>{wLabel}</span>
              </span>
            </div>
          )}

          {/* CMOS schematic — connectivity reference + navigation aid (borderless,
              floats cleanly on the stage) */}
          {showSchematic && (
            <div className="pointer-events-none absolute right-3 top-3 w-[150px]">
              <p className="eyebrow mb-1 text-center text-[8px] text-ink-muted">Circuit · tap a device</p>
              <div className="pointer-events-auto">
                <CircuitSchematic className="h-auto w-full" />
              </div>
            </div>
          )}

        </section>

          {/* per-device feedback (thumbs + note), stored per illustration */}
          <div className="glass shrink-0 rounded-2xl p-3">
            <FeedbackBar id={`device-${device.id}`} />
          </div>
          </div>

          {/* RIGHT — instrument readout (swaps per tab) */}
          <aside className="flex flex-col gap-3 xl:min-h-0 xl:overflow-y-auto xl:pr-0.5">
          {tab === 'explore' && (
            <>
              {isTransistor ? (
                <>
                  <ImpactCard />
                  <TransistorOutputs onInspect={onInspect} />
                </>
              ) : (
                <>
                  <ImpactCard />
                  <OutputPanel onInspect={onInspect} />
                </>
              )}
              {inspected && (
                <div className="glass rounded-2xl p-4">
                  <ExplanationPanel title={inspected.title} explanation={inspected.explanation} />
                </div>
              )}
              <TutorChat />
            </>
          )}

          {tab === 'analyze' && (
            <>
              {isTransistor
                ? txResult && (
                    <div className="glass rounded-2xl p-4">
                      <TransistorGraphPanel result={txResult} />
                    </div>
                  )
                : gateResult && (
                    <div className="glass rounded-2xl p-4">
                      <GraphPanel result={gateResult} onScrubInput={(vin) => setParameter('Vin', vin)} />
                    </div>
                  )}
              {!isTransistor && <AssessmentPanel />}
            </>
          )}

          {tab === 'variation' &&
            (isTransistor ? (
              <Placeholder title="Process Variation" body="Monte-Carlo process variation is a gate-circuit study. Switch to the CMOS Inverter to sample threshold / length / oxide spread." />
            ) : (
              <MonteCarloPanel />
            ))}

          {tab === 'learn' && <LearningCard />}
          </aside>
        </div>
      </div>
    </main>
  );
}

/** Informative panel pinned below the controls — what this device is + live status. */
function InfoPanel() {
  const { device } = useDevice();
  const gate = useGateResult();
  const tx = useTransistorResult();

  const status = tx
    ? `Region · ${tx.operatingPoint.region}`
    : gate
      ? `Vout · ${formatQuantity(gate.operatingPoint.outputVoltage.quantity)}`
      : null;

  return (
    <div className="border-t border-[color:var(--hairline)] p-4">
      <p className="eyebrow text-[10px] text-accent">{device.name}</p>
      <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">{device.description}</p>
      {status && (
        <div className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-black/[0.04] px-2.5 py-1 text-[11px] font-medium text-ink ring-1 ring-black/5 dark:bg-white/5 dark:ring-white/10">
          <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_8px_var(--accent-glow)]" />
          {status}
        </div>
      )}
    </div>
  );
}

function StageToggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-full px-3 py-1 text-xs transition ${
        on
          ? 'bg-accent text-white shadow-[0_0_16px_var(--accent-glow)]'
          : 'bg-[var(--glass-fill-3)] text-ink-muted ring-1 ring-[color:var(--hairline)] backdrop-blur-md hover:text-ink'
      }`}
    >
      {label}
    </button>
  );
}

function Placeholder({ title, body }: { title: string; body: string }) {
  return (
    <div className="glass rounded-2xl p-5">
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      <p className="mt-2 text-xs text-ink-muted">{body}</p>
    </div>
  );
}
