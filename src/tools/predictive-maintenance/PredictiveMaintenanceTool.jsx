/**
 * PredictiveMaintenanceTool.jsx
 * -----------------------------
 * Full-screen PdM tool: run a motor whose bearing degrades over time. Load and
 * a fault speed the wear; watch health fall, vibration and temperature rise,
 * and Remaining Useful Life count down. Replace the bearing to reset.
 */
import { useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { MousePointerClick, PanelLeft, PanelRight, Activity, Power, Wrench } from 'lucide-react';
import MachineHealthScene from './MachineHealthScene';
import KnowledgeCheckLauncher from '../../components/KnowledgeCheckLauncher';
import ModelOverview from '../../components/ModelOverview';
import { useTheme } from '../../theme';
import { NODES, stepHealth, bandFor, HEALTH_BANDS, KNOWLEDGE_QUESTIONS } from './data';
import { StrategyExplorer, PFCurve, TechniqueExplorer, HealthBands } from './Widgets';

const TABS = ['Strategies', 'P-F Curve', 'Techniques', 'Health bands'];
const HIST = 40;

function Spark({ data }) {
  const W = 220;
  const H = 40;
  if (data.length < 2) return <div style={{ height: H }} />;
  const path = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * W;
      const y = Math.max(0, Math.min(H, H - (v / 100) * H));
      return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-md border border-slate-800 bg-slate-950/60">
      <path d={path} fill="none" stroke="#fb7185" strokeWidth="1.5" />
    </svg>
  );
}

function WidgetPanel({ health }) {
  const [tab, setTab] = useState('P-F Curve');
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap gap-1 border-b border-slate-800 p-2">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`rounded-md px-2 py-1 text-[11px] font-medium ${tab === t ? 'bg-rose-500/15 text-rose-400 light:text-rose-700' : 'text-slate-400 hover:text-slate-200'}`}>
            {t}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {tab === 'Strategies' && <StrategyExplorer />}
        {tab === 'P-F Curve' && <PFCurve health={health} />}
        {tab === 'Techniques' && <TechniqueExplorer />}
        {tab === 'Health bands' && <HealthBands health={health} />}
      </div>
    </div>
  );
}

export default function PredictiveMaintenanceTool() {
  const { canvasBg, theme } = useTheme();
  const floorColor = theme === 'light' ? '#dbe2ee' : '#111826';

  const [running, setRunning] = useState(true);
  const [load, setLoad] = useState(55);
  const [simSpeed, setSimSpeed] = useState(3);
  const [fault, setFault] = useState(false);
  const [selectedId, setSelectedId] = useState('bearing');

  const [out, setOut] = useState({ health: 100, vib: 1.2, temp: 55, rul: Infinity, band: 'healthy', wearPerDay: 1 });
  const [age, setAge] = useState(0);
  const [history, setHistory] = useState([]);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);

  const ctrl = useRef({});
  ctrl.current = { load, running, fault, simSpeed };
  const sim = useRef({ health: 100 });

  useEffect(() => {
    const id = setInterval(() => {
      const c = ctrl.current;
      const dtDays = c.simSpeed * 0.2; // days advanced per 200ms tick
      const r = stepHealth({ health: sim.current.health, load: c.load, running: c.running, fault: c.fault }, dtDays);
      sim.current.health = r.health;
      setOut(r);
      if (c.running) setAge((a) => a + dtDays);
      setHistory((h) => [...h.slice(-HIST + 1), r.health]);
    }, 200);
    return () => clearInterval(id);
  }, []);

  const replaceBearing = () => {
    sim.current.health = 100;
    setAge(0);
    setHistory([]);
  };

  const band = bandFor(out.health);
  const selected = NODES.find((n) => n.id === selectedId) ?? NODES[0];
  const rulText = out.health <= 10 ? 'Failed' : out.rul === Infinity ? '-' : `${Math.round(out.rul)}`;

  return (
    <div className="relative h-full w-full">
      <Canvas shadows="percentage" camera={{ position: [0.5, 3.5, 8], fov: 46 }}>
        <color attach="background" args={[canvasBg]} />
        <MachineHealthScene health={out.health} vib={out.vib} running={running} selectedId={selectedId} onSelect={setSelectedId} floorColor={floorColor} light={theme === 'light'} />
      </Canvas>

      <div className="pointer-events-none absolute left-72 top-4 rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1.5 text-xs text-slate-300 backdrop-blur">
        <span className="inline-flex items-center gap-1.5"><MousePointerClick className="h-3.5 w-3.5" /> Run it, let it wear · tap a part</span>
      </div>

      <ModelOverview
        accent="rose"
        title="A Machine That Wears Out"
        points={[
          'The motor drives a bearing that slowly degrades. Load and an injected fault speed up the wear.',
          'As health falls, the bearing shifts green to red, vibration shakes the machine and temperature rises.',
          'The right panel is the health monitor: condition, Remaining Useful Life (RUL) and a live P-F curve. Replace the bearing to reset.',
        ]}
      />

      {/* Left: controls + widgets */}
      {leftOpen ? (
        <div className="absolute left-3 top-16 bottom-3 flex w-64 flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/80 backdrop-blur">
          <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
            <p className="text-[10px] uppercase tracking-widest text-slate-500">Machine controls</p>
            <button onClick={() => setLeftOpen(false)} className="text-slate-500 hover:text-slate-200"><PanelLeft className="h-4 w-4" /></button>
          </div>
          <div className="space-y-3 border-b border-slate-800 p-3">
            <div className="grid grid-cols-2 gap-1.5">
              <button onClick={() => setRunning((r) => !r)} className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-bold ${running ? 'bg-rose-500/90 text-white hover:bg-rose-500' : 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'}`}>
                <Power className="h-3.5 w-3.5" /> {running ? 'Stop' : 'Run'}
              </button>
              <button onClick={replaceBearing} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-600 px-2 py-1.5 text-xs font-semibold text-slate-200 hover:border-slate-400">
                <Wrench className="h-3.5 w-3.5" /> Replace
              </button>
            </div>
            <label className="block">
              <span className="mb-1 flex justify-between text-[11px] text-slate-400"><span>Load</span><span className="text-slate-200">{load}%</span></span>
              <input type="range" min="0" max="100" value={load} onChange={(e) => setLoad(Number(e.target.value))} className="w-full" style={{ accentColor: '#fb7185' }} />
            </label>
            <label className="block">
              <span className="mb-1 flex justify-between text-[11px] text-slate-400"><span>Sim speed</span><span className="text-slate-200">{simSpeed} d/s</span></span>
              <input type="range" min="1" max="20" value={simSpeed} onChange={(e) => setSimSpeed(Number(e.target.value))} className="w-full" style={{ accentColor: '#38bdf8' }} />
            </label>
            <button onClick={() => setFault((f) => !f)} className={`inline-flex w-full items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-[11px] font-semibold ${fault ? 'border-rose-400/60 bg-rose-500/20 text-white light:bg-rose-400 light:text-slate-900 light:border-rose-500' : 'border-slate-700 text-slate-300 hover:border-slate-600'}`}>
              {fault ? 'Fault injected (3x wear)' : 'Inject bearing fault'}
            </button>
          </div>
          <div className="min-h-0 flex-1"><WidgetPanel health={out.health} /></div>
        </div>
      ) : (
        <button onClick={() => setLeftOpen(true)} className="absolute left-3 top-16 rounded-lg border border-slate-700 bg-slate-900/80 p-2 text-slate-300 backdrop-blur"><PanelLeft className="h-4 w-4" /></button>
      )}

      {/* Right: health monitor */}
      {rightOpen ? (
        <div className="absolute right-3 top-16 w-64 rounded-2xl border border-slate-800 bg-slate-950/80 p-3 backdrop-blur">
          <div className="mb-2 flex items-center justify-between">
            <p className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-rose-300 light:text-rose-700"><Activity className="h-3.5 w-3.5" /> Health monitor</p>
            <button onClick={() => setRightOpen(false)} className="text-slate-500 hover:text-slate-200"><PanelRight className="h-4 w-4" /></button>
          </div>

          {/* Big health + status */}
          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-[10px] text-slate-400">Health index</p>
                <p className="text-2xl font-bold tabular-nums" style={{ color: band.color }}>{Math.round(out.health)}<span className="ml-0.5 text-[11px] font-normal text-slate-500">%</span></p>
              </div>
              <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: `${band.color}22`, color: band.color }}>{band.name}</span>
            </div>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
              <div className="h-full rounded-full transition-all" style={{ width: `${out.health}%`, backgroundColor: band.color }} />
            </div>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2">
              <p className="text-[10px] text-slate-400">RUL</p>
              <p className={`text-lg font-bold tabular-nums ${out.health <= 20 ? 'text-rose-300' : 'text-slate-100'}`}>{rulText}<span className="ml-0.5 text-[10px] font-normal text-slate-500">{out.health <= 10 || out.rul === Infinity ? '' : 'days'}</span></p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2">
              <p className="text-[10px] text-slate-400">Age</p>
              <p className="text-lg font-bold tabular-nums text-slate-100">{Math.round(age)}<span className="ml-0.5 text-[10px] font-normal text-slate-500">days</span></p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2">
              <p className="text-[10px] text-slate-400">Vibration</p>
              <p className={`text-lg font-bold tabular-nums ${out.vib > 7.1 ? 'text-rose-300' : out.vib > 4.5 ? 'text-amber-300' : 'text-slate-100'}`}>{out.vib.toFixed(1)}<span className="ml-0.5 text-[10px] font-normal text-slate-500">mm/s</span></p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2">
              <p className="text-[10px] text-slate-400">Temp</p>
              <p className={`text-lg font-bold tabular-nums ${out.temp > 85 ? 'text-rose-300' : 'text-slate-100'}`}>{Math.round(out.temp)}<span className="ml-0.5 text-[10px] font-normal text-slate-500">°C</span></p>
            </div>
          </div>

          <div className="mt-2">
            <p className="mb-1 text-[10px] text-slate-400">Health trend</p>
            <Spark data={history} />
          </div>

          <div className="mt-2 rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
            <p className="text-[10px] uppercase tracking-wider text-rose-300 light:text-rose-700">{selected.role}</p>
            <p className="text-sm font-bold text-slate-100">{selected.name}</p>
            <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">{selected.detail}</p>
          </div>
        </div>
      ) : (
        <button onClick={() => setRightOpen(true)} className="absolute right-3 top-16 rounded-lg border border-slate-700 bg-slate-900/80 p-2 text-slate-300 backdrop-blur"><PanelRight className="h-4 w-4" /></button>
      )}

      <KnowledgeCheckLauncher questions={KNOWLEDGE_QUESTIONS} accent="rose" />
    </div>
  );
}
