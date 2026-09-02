/**
 * FoundationsTool.jsx
 * -------------------
 * Full-screen Foundations tool: the interactive 3D IIoT-architecture scene plus a
 * collapsible panel of the module's real interactive widgets (Timeline, RAMI
 * Explorer, ISA-95 Pyramid, IoT vs IIoT Comparator), a quiz and references.
 */
import { useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Play, Pause, RotateCw, MousePointerClick, PanelLeft, PanelRight } from 'lucide-react';
import FactoryScene from './FactoryScene';
import KnowledgeCheckLauncher from '../../components/KnowledgeCheckLauncher';
import ModelOverview from '../../components/ModelOverview';
import { useTheme } from '../../theme';
import { IndustryTimeline, RamiExplorer, Isa95Pyramid, IoTComparator, ArchLayerSelector } from './Widgets';
import { IOT_ARCH_LAYERS, KNOWLEDGE_QUESTIONS, TECH_INFO, LAYER_LATENCY_MS } from './data';

const TABS = ['Layers', 'Timeline', 'RAMI', 'ISA-95', 'IoT vs IIoT'];
// Fixed sensor -> application latency floor (sum of the per-layer budget).
const PIPELINE_MS = Object.values(LAYER_LATENCY_MS).reduce((a, b) => a + b, 0);
const STREAM_PACKETS = 4; // arrows animating in the 3D stream (matches FactoryScene)

function WidgetPanel({ selectedId, onSelect }) {
  const [tab, setTab] = useState('Layers');
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap gap-1 border-b border-slate-800 p-2">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`rounded-md px-2 py-1 text-[11px] font-medium ${tab === t ? 'bg-brand-500/15 text-brand-400' : 'text-slate-400 hover:text-slate-200'}`}>
            {t}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {tab === 'Layers' && <ArchLayerSelector selectedId={selectedId} onSelect={onSelect} />}
        {tab === 'Timeline' && <IndustryTimeline />}
        {tab === 'RAMI' && <RamiExplorer />}
        {tab === 'ISA-95' && <Isa95Pyramid />}
        {tab === 'IoT vs IIoT' && <IoTComparator />}
      </div>
    </div>
  );
}

export default function FoundationsTool() {
  const { canvasBg, theme } = useTheme();
  const labelColor = theme === 'light' ? '#0f172a' : '#e2e8f0';
  const subColor = theme === 'light' ? '#334155' : undefined;
  const [selectedId, setSelectedId] = useState(null);
  const [flowing, setFlowing] = useState(true);
  const [speed, setSpeed] = useState(3);
  const [autoRotate, setAutoRotate] = useState(false);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [tech, setTech] = useState(null);

  // No layer selected by default; clicking a layer toggles it (click again to deselect).
  const handleSelect = (id) => setSelectedId((cur) => (cur === id ? null : id));
  const selected = IOT_ARCH_LAYERS.find((l) => l.id === selectedId) ?? null;

  // Live pipeline telemetry (grounded, robot-arm style).
  // Sample rate = readings/s published up the stack; end-to-end latency = the
  // fixed per-layer budget plus a small queuing delay that grows with the rate.
  const throughput = flowing ? speed * 8 : 0; // messages / second
  const latency = flowing ? Math.round(PIPELINE_MS + throughput * 0.3) : 0; // ms sensor -> app
  const packetsInFlight = flowing ? STREAM_PACKETS : 0;

  return (
    <div className="relative h-full w-full">
      <Canvas shadows="soft" camera={{ position: [9, 5, 10], fov: 45 }}>
        <color attach="background" args={[canvasBg]} />
        <FactoryScene selectedId={selectedId} onSelect={handleSelect} flowing={flowing} speed={speed} autoRotate={autoRotate} labelColor={labelColor} subColor={subColor} light={theme === 'light'} />
      </Canvas>

      <div className="pointer-events-none absolute left-72 top-4 rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1.5 text-xs text-slate-300 backdrop-blur">
        <span className="inline-flex items-center gap-1.5"><MousePointerClick className="h-3.5 w-3.5" /> Drag to orbit · tap a layer</span>
      </div>

      <ModelOverview
        accent="brand"
        title="The IIoT Architecture Stack"
        points={[
          'This 3D stack is the 4-layer IoT architecture: sensing at the bottom, up to applications on top.',
          'The cyan arrow shows data flowing upward, from field sensors to dashboards and decisions.',
          'Tap any layer (or the list on the left) to inspect it; play the data flow and orbit to explore.',
        ]}
      />

      {leftOpen ? (
        <div className="absolute left-3 top-16 bottom-3 flex w-64 flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/80 backdrop-blur">
          <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
            <p className="text-[10px] uppercase tracking-widest text-slate-500">Widgets</p>
            <button onClick={() => setLeftOpen(false)} className="text-slate-500 hover:text-slate-200"><PanelLeft className="h-4 w-4" /></button>
          </div>
          <div className="min-h-0 flex-1"><WidgetPanel selectedId={selectedId} onSelect={handleSelect} /></div>
        </div>
      ) : (
        <button onClick={() => setLeftOpen(true)} className="absolute left-3 top-16 rounded-lg border border-slate-700 bg-slate-900/80 p-2 text-slate-300 backdrop-blur"><PanelLeft className="h-4 w-4" /></button>
      )}

      {rightOpen ? (
        <div className="absolute right-3 top-16 w-64 rounded-2xl border border-slate-800 bg-slate-950/80 p-4 backdrop-blur">
          <div className="mb-1 flex items-start justify-between">
            <p className="text-[10px] uppercase tracking-widest text-brand-400">{selected ? selected.short : 'Layer details'}</p>
            <button onClick={() => setRightOpen(false)} className="text-slate-500 hover:text-slate-200"><PanelRight className="h-4 w-4" /></button>
          </div>
          {selected ? (
            <>
              <h3 className="text-lg font-bold text-slate-100">{selected.name}</h3>
              <p className="mt-2 text-xs leading-relaxed text-slate-400">{selected.detail}</p>
              <p className="mt-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Technologies <span className="font-normal normal-case text-slate-600">· tap to learn</span></p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {selected.examples.map((ex) => {
                  const on = tech === ex;
                  return (
                    <button key={ex} onClick={() => setTech(on ? null : ex)}
                      className={`rounded-md border px-2 py-0.5 text-[11px] transition-all duration-150 ${on ? 'border-brand-400/60 bg-gradient-to-b from-brand-400/25 to-brand-600/15 text-brand-100 shadow-[0_2px_10px_-2px_rgba(6,182,212,0.55)]' : 'border-slate-700 bg-slate-800/60 text-slate-300 hover:-translate-y-0.5 hover:border-slate-500'}`}>
                      {ex}
                    </button>
                  );
                })}
              </div>
              {tech && selected.examples.includes(tech) && (
                <div className="mt-2 rounded-lg border border-brand-500/30 bg-gradient-to-br from-slate-800/70 to-slate-950/80 p-2.5 shadow-[0_8px_24px_-10px_rgba(0,0,0,0.7)]">
                  <p className="text-[11px] font-bold text-brand-300">{tech}</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-slate-300">{TECH_INFO[tech] ?? 'A key technology used at this layer.'}</p>
                </div>
              )}
            </>
          ) : (
            <p className="mt-8 text-center text-xs leading-relaxed text-slate-500">Tap a layer in the 3D stack, or the list on the left, to see its details. Tap it again to deselect.</p>
          )}
        </div>
      ) : (
        <button onClick={() => setRightOpen(true)} className="absolute right-3 top-16 rounded-lg border border-slate-700 bg-slate-900/80 p-2 text-slate-300 backdrop-blur"><PanelRight className="h-4 w-4" /></button>
      )}

      <KnowledgeCheckLauncher questions={KNOWLEDGE_QUESTIONS} accent="brand" positionClass="bottom-5 right-5" />

      <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-2xl border border-slate-800 bg-slate-950/90 px-4 py-2.5 backdrop-blur">
        <button onClick={() => setFlowing((f) => !f)} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-brand-400">
          {flowing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />} Data flow
        </button>
        <label className="flex items-center gap-2 text-xs text-slate-400">Speed
          <input type="range" min="1" max="8" value={speed} onChange={(e) => setSpeed(Number(e.target.value))} style={{ accentColor: '#06b6d4' }} />
          <span className="w-4 tabular-nums font-semibold text-brand-300">{speed}</span>
        </label>
        <button onClick={() => setAutoRotate((a) => !a)} className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold ${autoRotate ? 'border-brand-500/50 bg-brand-500/10 text-brand-300' : 'border-slate-700 text-slate-300 hover:border-slate-600'}`}>
          <RotateCw className="h-3.5 w-3.5" /> Auto-rotate
        </button>
        <div className="h-8 w-px bg-white/10" />
        <div className="flex items-center gap-3" title="Higher rate lifts throughput; latency is the fixed sensor-to-app budget plus queuing. Pause stops the flow.">
          <div className="text-center">
            <p className="text-[8px] uppercase tracking-wider text-slate-500">Status</p>
            <p className={`text-xs font-bold ${flowing ? 'text-emerald-300' : 'text-slate-400'}`}>{flowing ? 'Flowing' : 'Paused'}</p>
          </div>
          <div className="text-center">
            <p className="text-[8px] uppercase tracking-wider text-slate-500">Thrpt</p>
            <p className="text-xs font-bold tabular-nums text-brand-300">{throughput}<span className="text-[8px] font-normal text-slate-500">/s</span></p>
          </div>
          <div className="text-center">
            <p className="text-[8px] uppercase tracking-wider text-slate-500">Latency</p>
            <p className="text-xs font-bold tabular-nums text-amber-300">{latency}<span className="text-[8px] font-normal text-slate-500">ms</span></p>
          </div>
          <div className="text-center">
            <p className="text-[8px] uppercase tracking-wider text-slate-500">In flight</p>
            <p className="text-xs font-bold tabular-nums text-cyan-300">{packetsInFlight}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
