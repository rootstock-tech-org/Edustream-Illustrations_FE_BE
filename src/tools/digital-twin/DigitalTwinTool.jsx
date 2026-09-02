/**
 * DigitalTwinTool.jsx
 * -------------------
 * Full-screen Digital Twin tool: drive a physical machine and watch its virtual
 * twin track it through periodic syncs. A low sync rate makes the twin lag and
 * diverge; a disturbance shows the twin catch up on the next sync.
 */
import { useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { MousePointerClick, PanelLeft, PanelRight, GitCompareArrows, Zap } from 'lucide-react';
import TwinScene from './TwinScene';
import KnowledgeCheckLauncher from '../../components/KnowledgeCheckLauncher';
import ModelOverview from '../../components/ModelOverview';
import { useTheme } from '../../theme';
import { NODES, KNOWLEDGE_QUESTIONS } from './data';
import { TwinBuilder, MonitoringDashboard, CpsExplorer, SynchronizationViewer } from './Widgets';

const TABS = ['Builder', 'Dashboard', 'CPS', 'Sync'];
const HIST = 40;

function DualSpark({ phys, twin, max }) {
  const W = 220;
  const H = 40;
  if (phys.length < 2) return <div style={{ height: H }} />;
  const toPath = (d) => d.map((v, i) => `${i ? 'L' : 'M'}${((i / (d.length - 1)) * W).toFixed(1)} ${Math.max(0, Math.min(H, H - (v / max) * H)).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-md border border-slate-800 bg-slate-950/60">
      <path d={toPath(phys)} fill="none" stroke="#94a3b8" strokeWidth="1.5" />
      <path d={toPath(twin)} fill="none" stroke="#818cf8" strokeWidth="1.5" strokeDasharray="3 2" />
    </svg>
  );
}

function WidgetPanel({ live }) {
  const [tab, setTab] = useState('Dashboard');
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap gap-1 border-b border-slate-800 p-2">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`rounded-md px-2 py-1 text-[11px] font-medium ${tab === t ? 'bg-indigo-500/15 text-indigo-400 light:text-indigo-700' : 'text-slate-400 hover:text-slate-200'}`}>
            {t}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {tab === 'Builder' && <TwinBuilder />}
        {tab === 'Dashboard' && <MonitoringDashboard {...live} />}
        {tab === 'CPS' && <CpsExplorer />}
        {tab === 'Sync' && <SynchronizationViewer {...live} />}
      </div>
    </div>
  );
}

export default function DigitalTwinTool() {
  const { canvasBg, theme } = useTheme();
  const floorColor = theme === 'light' ? '#dbe2ee' : '#111826';

  const [load, setLoad] = useState(50);
  const [syncRate, setSyncRate] = useState(5); // syncs per second
  const [selectedId, setSelectedId] = useState('twin');
  const [physicalSpeed, setPhysicalSpeed] = useState(1050);
  const [twinSpeed, setTwinSpeed] = useState(1050);
  const [divergence, setDivergence] = useState(0);
  const [hist, setHist] = useState({ p: [], t: [] });
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);

  const ctrl = useRef({ load, syncRate });
  ctrl.current = { load, syncRate };
  const sim = useRef({ twin: 1050, phys: 1050, lastSync: 0, disturb: 0 });

  useEffect(() => {
    const id = setInterval(() => {
      const { load: l, syncRate: sr } = ctrl.current;
      const now = performance.now();
      // The motor ramps toward its speed demand (mechanical inertia) instead of
      // jumping, so moving the load slider does not spike the divergence.
      const demand = 600 + (l / 100) * 900; // load 0-100% -> 600-1500 rpm
      sim.current.phys += (demand - sim.current.phys) * 0.12;
      sim.current.disturb *= 0.85; // disturbance decays
      const noise = (Math.random() - 0.5) * 30; // +/- rpm sensor noise
      const phys = sim.current.phys + noise + sim.current.disturb;
      // The twin only updates when a sync arrives (every 1000/syncRate ms).
      if (now - sim.current.lastSync >= 1000 / sr) {
        sim.current.twin = phys;
        sim.current.lastSync = now;
      }
      const twin = sim.current.twin;
      const div = Math.abs(phys - twin);
      setPhysicalSpeed(phys);
      setTwinSpeed(twin);
      setDivergence(div);
      setHist((h) => ({ p: [...h.p.slice(-HIST + 1), phys], t: [...h.t.slice(-HIST + 1), twin] }));
    }, 90);
    return () => clearInterval(id);
  }, []);

  const syncPct = Math.round(Math.max(0, Math.min(100, 100 * (1 - divergence / Math.max(1, physicalSpeed)))));
  const latency = Math.round(1000 / syncRate);
  const diverged = syncPct < 85; // twin turns amber only when the twin is genuinely stale
  const selected = NODES.find((n) => n.id === selectedId) ?? NODES[0];

  return (
    <div className="relative h-full w-full">
      <Canvas shadows="percentage" camera={{ position: [0, 4, 9], fov: 46 }}>
        <color attach="background" args={[canvasBg]} />
        <TwinScene physicalSpeed={physicalSpeed / 500} twinSpeed={twinSpeed / 500} syncRate={syncRate} diverged={diverged} selectedId={selectedId} onSelect={setSelectedId} floorColor={floorColor} light={theme === 'light'} />
      </Canvas>

      <div className="pointer-events-none absolute left-72 top-4 rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1.5 text-xs text-slate-300 backdrop-blur">
        <span className="inline-flex items-center gap-1.5"><MousePointerClick className="h-3.5 w-3.5" /> Drive the asset · watch the twin track · tap a node</span>
      </div>

      <ModelOverview
        accent="indigo"
        title="A Live Digital Twin"
        points={[
          'Left is the real machine; right is its digital twin, a virtual replica kept in sync by sensor data.',
          'Change the load or hit a disturbance and watch the twin catch up only on the next sync.',
          'Lower the sync rate and the twin lags and diverges (it turns amber). The panel shows sync %, divergence and latency.',
        ]}
      />

      {/* Left: controls + widgets */}
      {leftOpen ? (
        <div className="absolute left-3 top-16 bottom-3 flex w-64 flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/80 backdrop-blur">
          <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
            <p className="text-[10px] uppercase tracking-widest text-slate-500">Asset & sync</p>
            <button onClick={() => setLeftOpen(false)} className="text-slate-500 hover:text-slate-200"><PanelLeft className="h-4 w-4" /></button>
          </div>
          <div className="space-y-3 border-b border-slate-800 p-3">
            <label className="block">
              <span className="mb-1 flex justify-between text-[11px] text-slate-400"><span>Physical load</span><span className="text-slate-200">{load}%</span></span>
              <input type="range" min="0" max="100" value={load} onChange={(e) => setLoad(Number(e.target.value))} className="w-full" style={{ accentColor: '#818cf8' }} />
            </label>
            <label className="block">
              <span className="mb-1 flex justify-between text-[11px] text-slate-400"><span>Sync rate</span><span className="text-slate-200">{syncRate}/s</span></span>
              <input type="range" min="1" max="10" value={syncRate} onChange={(e) => setSyncRate(Number(e.target.value))} className="w-full" style={{ accentColor: '#818cf8' }} />
            </label>
            <button onClick={() => { sim.current.disturb += 220; }} className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-indigo-400/50 bg-indigo-500/15 px-3 py-1.5 text-xs font-semibold text-indigo-200 hover:bg-indigo-500/25 light:text-indigo-700">
              <Zap className="h-3.5 w-3.5" /> Disturbance
            </button>
          </div>
          <div className="min-h-0 flex-1"><WidgetPanel live={{ physicalSpeed, twinSpeed, divergence, syncPct, latency, syncRate }} /></div>
        </div>
      ) : (
        <button onClick={() => setLeftOpen(true)} className="absolute left-3 top-16 rounded-lg border border-slate-700 bg-slate-900/80 p-2 text-slate-300 backdrop-blur"><PanelLeft className="h-4 w-4" /></button>
      )}

      {/* Right: sync status */}
      {rightOpen ? (
        <div className="absolute right-3 top-16 w-64 rounded-2xl border border-slate-800 bg-slate-950/80 p-3 backdrop-blur">
          <div className="mb-2 flex items-center justify-between">
            <p className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-indigo-300 light:text-indigo-700"><GitCompareArrows className="h-3.5 w-3.5" /> Twin sync</p>
            <button onClick={() => setRightOpen(false)} className="text-slate-500 hover:text-slate-200"><PanelRight className="h-4 w-4" /></button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2">
              <p className="text-[10px] text-slate-400">Sync</p>
              <p className={`text-lg font-bold tabular-nums ${syncPct >= 85 ? 'text-emerald-300' : syncPct >= 55 ? 'text-amber-300' : 'text-rose-300'}`}>{syncPct}<span className="ml-0.5 text-[10px] font-normal text-slate-500">%</span></p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2">
              <p className="text-[10px] text-slate-400">Divergence</p>
              <p className={`text-lg font-bold tabular-nums ${diverged ? 'text-amber-300' : 'text-slate-100'}`}>{Math.round(divergence)}<span className="ml-0.5 text-[10px] font-normal text-slate-500">rpm</span></p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2">
              <p className="text-[10px] text-slate-400">Latency</p>
              <p className={`text-lg font-bold tabular-nums ${latency > 400 ? 'text-amber-300' : 'text-slate-100'}`}>{latency}<span className="ml-0.5 text-[10px] font-normal text-slate-500">ms</span></p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2">
              <p className="text-[10px] text-slate-400">Twin speed</p>
              <p className="text-lg font-bold tabular-nums text-indigo-300">{Math.round(twinSpeed)}<span className="ml-0.5 text-[10px] font-normal text-slate-500">rpm</span></p>
            </div>
          </div>

          <div className="mt-3">
            <p className="mb-1 flex items-center gap-2 text-[10px] text-slate-400">Physical <span className="h-0.5 w-4 bg-slate-400" /> vs Twin <span className="h-0.5 w-4 border-t border-dashed border-indigo-400" /></p>
            <DualSpark phys={hist.p} twin={hist.t} max={1600} />
          </div>

          <div className="mt-2 rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
            <p className="text-[10px] uppercase tracking-wider text-indigo-300 light:text-indigo-700">{selected.role}</p>
            <p className="text-sm font-bold text-slate-100">{selected.name}</p>
            <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">{selected.detail}</p>
          </div>
        </div>
      ) : (
        <button onClick={() => setRightOpen(true)} className="absolute right-3 top-16 rounded-lg border border-slate-700 bg-slate-900/80 p-2 text-slate-300 backdrop-blur"><PanelRight className="h-4 w-4" /></button>
      )}

      <KnowledgeCheckLauncher questions={KNOWLEDGE_QUESTIONS} accent="indigo" />
    </div>
  );
}
