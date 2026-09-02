/**
 * CapstoneTool.jsx
 * ----------------
 * Full-screen Capstone: assemble a smart factory by toggling the eight pillars.
 * A readiness score and maturity level rise as you build and connect them.
 */
import { useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { MousePointerClick, PanelLeft, PanelRight, Factory, Check } from 'lucide-react';
import CapstoneScene from './CapstoneScene';
import KnowledgeCheckLauncher from '../../components/KnowledgeCheckLauncher';
import ModelOverview from '../../components/ModelOverview';
import { useTheme } from '../../theme';
import { STATIONS, maturityFor, KNOWLEDGE_QUESTIONS } from './data';
import { PillarsRecap, DesignTips, MaturityLadder } from './Widgets';

const TABS = ['Pillars', 'Maturity', 'Tips'];

function WidgetPanel({ score }) {
  const [tab, setTab] = useState('Maturity');
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap gap-1 border-b border-slate-800 p-2">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`rounded-md px-2 py-1 text-[11px] font-medium ${tab === t ? 'bg-cyan-500/15 text-cyan-400 light:text-cyan-700' : 'text-slate-400 hover:text-slate-200'}`}>
            {t}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {tab === 'Pillars' && <PillarsRecap />}
        {tab === 'Maturity' && <MaturityLadder score={score} />}
        {tab === 'Tips' && <DesignTips />}
      </div>
    </div>
  );
}

export default function CapstoneTool() {
  const { canvasBg, theme } = useTheme();
  const floorColor = theme === 'light' ? '#dbe2ee' : '#111826';

  const [enabled, setEnabled] = useState(() => ({ foundations: true, sensors: true, communication: false, edge: false, control: false, predictive: false, security: false, robotics: false }));
  const [selectedId, setSelectedId] = useState('foundations');
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);

  const toggle = (id) => { setSelectedId(id); setEnabled((e) => ({ ...e, [id]: !e[id] })); };

  const built = STATIONS.filter((s) => enabled[s.id]).length;
  const score = Math.round((built / STATIONS.length) * 100);
  const maturity = maturityFor(score);
  const missing = STATIONS.filter((s) => !enabled[s.id]);
  const selected = STATIONS.find((s) => s.id === selectedId) ?? STATIONS[0];

  return (
    <div className="relative h-full w-full">
      <Canvas shadows="percentage" camera={{ position: [0, 6.5, 10], fov: 46 }}>
        <color attach="background" args={[canvasBg]} />
        <CapstoneScene enabled={enabled} selectedId={selectedId} onToggle={toggle} floorColor={floorColor} light={theme === 'light'} />
      </Canvas>

      <div className="pointer-events-none absolute left-72 top-4 rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1.5 text-xs text-slate-300 backdrop-blur">
        <span className="inline-flex items-center gap-1.5"><MousePointerClick className="h-3.5 w-3.5" /> Build your factory · tap a station</span>
      </div>

      <ModelOverview
        accent="cyan"
        title="Build a Smart Factory"
        points={[
          'Each block is a pillar you learned: sensors, networks, edge AI, control, predictive maintenance, security and robotics.',
          'Tap a station to build it or remove it. Built neighbours connect with flowing data links.',
          'The more pillars you connect, the higher your readiness score climbs, from Traditional up to Autonomous.',
        ]}
      />

      {/* Left: build list + widgets */}
      {leftOpen ? (
        <div className="absolute left-3 top-16 bottom-3 flex w-64 flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/80 backdrop-blur">
          <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
            <p className="text-[10px] uppercase tracking-widest text-slate-500">Factory pillars</p>
            <button onClick={() => setLeftOpen(false)} className="text-slate-500 hover:text-slate-200"><PanelLeft className="h-4 w-4" /></button>
          </div>
          <div className="grid grid-cols-1 gap-1.5 border-b border-slate-800 p-3">
            {STATIONS.map((s) => (
              <button key={s.id} onClick={() => toggle(s.id)} className={`flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-left text-[11px] font-semibold ${enabled[s.id] ? 'border-slate-600 bg-slate-800/70 text-slate-100' : 'border-slate-700 text-slate-400 hover:border-slate-600'}`}>
                <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: enabled[s.id] ? s.color : '#475569' }} /> {s.name}</span>
                {enabled[s.id] && <Check className="h-3.5 w-3.5 text-emerald-400" />}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1"><WidgetPanel score={score} /></div>
        </div>
      ) : (
        <button onClick={() => setLeftOpen(true)} className="absolute left-3 top-16 rounded-lg border border-slate-700 bg-slate-900/80 p-2 text-slate-300 backdrop-blur"><PanelLeft className="h-4 w-4" /></button>
      )}

      {/* Right: readiness */}
      {rightOpen ? (
        <div className="absolute right-3 top-16 w-64 rounded-2xl border border-slate-800 bg-slate-950/80 p-3 backdrop-blur">
          <div className="mb-2 flex items-center justify-between">
            <p className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-cyan-300 light:text-cyan-700"><Factory className="h-3.5 w-3.5" /> Factory readiness</p>
            <button onClick={() => setRightOpen(false)} className="text-slate-500 hover:text-slate-200"><PanelRight className="h-4 w-4" /></button>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-[10px] text-slate-400">Readiness</p>
                <p className="text-2xl font-bold tabular-nums text-cyan-300">{score}<span className="ml-0.5 text-[11px] font-normal text-slate-500">%</span></p>
              </div>
              <span className="rounded-full bg-cyan-500/15 px-2 py-0.5 text-[10px] font-semibold text-cyan-300 light:bg-cyan-100 light:text-cyan-700">{maturity.name}</span>
            </div>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
              <div className="h-full rounded-full bg-cyan-400 transition-all" style={{ width: `${score}%` }} />
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">{maturity.detail}</p>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2">
              <p className="text-[10px] text-slate-400">Pillars built</p>
              <p className="text-lg font-bold tabular-nums text-slate-100">{built}<span className="text-[10px] font-normal text-slate-500">/{STATIONS.length}</span></p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2">
              <p className="text-[10px] text-slate-400">Missing</p>
              <p className={`text-lg font-bold tabular-nums ${missing.length ? 'text-amber-300' : 'text-emerald-300'}`}>{missing.length}</p>
            </div>
          </div>

          {!enabled.security && built > 0 && (
            <p className="mt-2 rounded-lg border border-rose-500/40 bg-rose-500/10 p-2 text-[11px] text-rose-300">Warning: no cybersecurity. A connected factory without defence is exposed.</p>
          )}

          <div className="mt-2 rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
            <p className="text-sm font-bold text-slate-100">{selected.name}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{selected.detail}</p>
            <p className="mt-1.5 text-[10px] font-semibold" style={{ color: enabled[selected.id] ? '#34d399' : '#94a3b8' }}>{enabled[selected.id] ? 'Built' : 'Not built · tap to add'}</p>
          </div>
        </div>
      ) : (
        <button onClick={() => setRightOpen(true)} className="absolute right-3 top-16 rounded-lg border border-slate-700 bg-slate-900/80 p-2 text-slate-300 backdrop-blur"><PanelRight className="h-4 w-4" /></button>
      )}

      <KnowledgeCheckLauncher questions={KNOWLEDGE_QUESTIONS} accent="cyan" />
    </div>
  );
}
