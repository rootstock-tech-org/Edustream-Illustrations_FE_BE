/**
 * PlcScadaTool.jsx
 * ----------------
 * Full-screen PLC & SCADA tool: a PLC controls a liquid tank (pump + valve) to
 * hold the level between setpoints. Drive it in Auto or Manual, watch the live
 * ladder logic and scan cycle, and read the SCADA/HMI values and alarms.
 */
import { useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { MousePointerClick, PanelLeft, PanelRight, Gauge, Power } from 'lucide-react';
import PlantScene from './PlantScene';
import KnowledgeCheckLauncher from '../../components/KnowledgeCheckLauncher';
import ModelOverview from '../../components/ModelOverview';
import { useTheme } from '../../theme';
import { NODES, stepPlant, SCAN_STEPS, KNOWLEDGE_QUESTIONS } from './data';
import { LadderDiagram, ScanCycle, IecExplorer, ScadaExplorer } from './Widgets';

const TABS = ['Ladder', 'Scan', 'Languages', 'SCADA'];
const HIST = 40;

function Spark({ data, max }) {
  const W = 220;
  const H = 40;
  if (data.length < 2) return <div style={{ height: H }} />;
  const path = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * W;
      const y = Math.max(0, Math.min(H, H - (v / max) * H));
      return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-md border border-slate-800 bg-slate-950/60">
      <path d={path} fill="none" stroke="#fbbf24" strokeWidth="1.5" />
    </svg>
  );
}

function WidgetPanel({ plc, scanPhase }) {
  const [tab, setTab] = useState('Ladder');
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap gap-1 border-b border-slate-800 p-2">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`rounded-md px-2 py-1 text-[11px] font-medium ${tab === t ? 'bg-amber-500/15 text-amber-400 light:text-amber-700' : 'text-slate-400 hover:text-slate-200'}`}>
            {t}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {tab === 'Ladder' && <LadderDiagram plc={plc} />}
        {tab === 'Scan' && <ScanCycle scanPhase={scanPhase} />}
        {tab === 'Languages' && <IecExplorer />}
        {tab === 'SCADA' && <ScadaExplorer />}
      </div>
    </div>
  );
}

export default function PlcScadaTool() {
  const { canvasBg, theme } = useTheme();
  const floorColor = theme === 'light' ? '#dbe2ee' : '#111826';

  const [running, setRunning] = useState(true);
  const [mode, setMode] = useState('auto');
  const [lowSP, setLowSP] = useState(30);
  const [highSP, setHighSP] = useState(80);
  const [demand, setDemand] = useState(40);
  const [pumpCmd, setPumpCmd] = useState(false);
  const [valveCmd, setValveCmd] = useState(false);
  const [selectedId, setSelectedId] = useState('plc');

  const [out, setOut] = useState({ level: 50, pump: false, valve: false, lvlLow: false, lvlHigh: false, alarms: [] });
  const [scanPhase, setScanPhase] = useState(0);
  const [scanCount, setScanCount] = useState(0);
  const [history, setHistory] = useState([]);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);

  const ctrl = useRef({});
  ctrl.current = { running, mode, lowSP, highSP, demand, pumpCmd, valveCmd };
  const sim = useRef({ level: 50, pumpLatch: false });

  useEffect(() => {
    const id = setInterval(() => {
      const c = ctrl.current;
      const r = stepPlant({ ...c, level: sim.current.level, pumpLatch: sim.current.pumpLatch }, 0.12);
      sim.current.level = r.level;
      sim.current.pumpLatch = r.pumpLatch;
      setOut(r);
      setHistory((h) => [...h.slice(-HIST + 1), r.level]);
    }, 120);
    return () => clearInterval(id);
  }, []);

  // The real PLC scan runs in ~8 ms; step it at a readable pace so the three
  // phases (read -> execute -> write) are actually visible.
  const runningRef = useRef(running);
  runningRef.current = running;
  useEffect(() => {
    const id = setInterval(() => {
      if (!runningRef.current) return;
      setScanPhase((p) => {
        const next = (p + 1) % 3;
        if (next === 0) setScanCount((n) => n + 1);
        return next;
      });
    }, 550);
    return () => clearInterval(id);
  }, []);

  const alarm = out.lvlHigh || out.alarms.some((a) => a.sev === 'high');
  const plc = { run: running, lvlLow: out.lvlLow, lvlHigh: out.lvlHigh, pump: out.pump, valve: out.valve, alarm: out.lvlHigh, mode };
  const selected = NODES.find((n) => n.id === selectedId) ?? NODES[0];

  return (
    <div className="relative h-full w-full">
      <Canvas shadows="percentage" camera={{ position: [1, 4, 9], fov: 46 }}>
        <color attach="background" args={[canvasBg]} />
        <PlantScene
          level={out.level} lowSP={lowSP} highSP={highSP} pump={out.pump} valve={out.valve}
          running={running} alarm={alarm} scanPhase={scanPhase}
          selectedId={selectedId} onSelect={setSelectedId} floorColor={floorColor} light={theme === 'light'}
        />
      </Canvas>

      <div className="pointer-events-none absolute left-72 top-4 rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1.5 text-xs text-slate-300 backdrop-blur">
        <span className="inline-flex items-center gap-1.5"><MousePointerClick className="h-3.5 w-3.5" /> Control the plant · tap a device</span>
      </div>

      <ModelOverview
        accent="amber"
        title="A PLC-Controlled Tank (with SCADA)"
        points={[
          'The PLC reads the level sensor and drives the pump and inlet valve to hold the tank between the low and high setpoints.',
          'In Auto it runs ladder logic (see the Ladder widget light up live); in Manual you force the pump and valve yourself.',
          'The right panel is the SCADA/HMI: live values, alarms and a level trend, just like an operator screen.',
        ]}
      />

      {/* Left: controls + widgets */}
      {leftOpen ? (
        <div className="absolute left-3 top-16 bottom-3 flex w-64 flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/80 backdrop-blur">
          <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
            <p className="text-[10px] uppercase tracking-widest text-slate-500">Control panel</p>
            <button onClick={() => setLeftOpen(false)} className="text-slate-500 hover:text-slate-200"><PanelLeft className="h-4 w-4" /></button>
          </div>
          <div className="space-y-3 border-b border-slate-800 p-3">
            <button onClick={() => setRunning((r) => !r)} className={`inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold ${running ? 'bg-rose-500/90 text-white hover:bg-rose-500' : 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'}`}>
              <Power className="h-3.5 w-3.5" /> {running ? 'Stop' : 'Start'}
            </button>
            <div>
              <span className="mb-1 block text-[11px] text-slate-400">Mode</span>
              <div className="grid grid-cols-2 gap-1">
                {['auto', 'manual'].map((m) => (
                  <button key={m} onClick={() => setMode(m)} className={`rounded-lg border px-2 py-1 text-[11px] font-semibold capitalize ${mode === m ? 'border-amber-400/60 bg-amber-500/20 text-white light:bg-amber-400 light:text-slate-900 light:border-amber-500' : 'border-slate-700 text-slate-300 hover:border-slate-600'}`}>{m}</button>
                ))}
              </div>
            </div>
            {mode === 'auto' ? (
              <>
                <label className="block">
                  <span className="mb-1 flex justify-between text-[11px] text-slate-400"><span>Low setpoint</span><span className="text-slate-200">{lowSP}%</span></span>
                  <input type="range" min="5" max="60" value={lowSP} onChange={(e) => setLowSP(Math.min(Number(e.target.value), highSP - 5))} className="w-full" style={{ accentColor: '#fbbf24' }} />
                </label>
                <label className="block">
                  <span className="mb-1 flex justify-between text-[11px] text-slate-400"><span>High setpoint</span><span className="text-slate-200">{highSP}%</span></span>
                  <input type="range" min="40" max="95" value={highSP} onChange={(e) => setHighSP(Math.max(Number(e.target.value), lowSP + 5))} className="w-full" style={{ accentColor: '#fbbf24' }} />
                </label>
              </>
            ) : (
              <div className="grid grid-cols-2 gap-1">
                <button onClick={() => setPumpCmd((v) => !v)} disabled={!running} className={`rounded-lg border px-2 py-1 text-[11px] font-semibold disabled:opacity-40 ${pumpCmd ? 'border-emerald-400/60 bg-emerald-500/15 text-emerald-200' : 'border-slate-700 text-slate-300'}`}>Pump {pumpCmd ? 'ON' : 'OFF'}</button>
                <button onClick={() => setValveCmd((v) => !v)} disabled={!running} className={`rounded-lg border px-2 py-1 text-[11px] font-semibold disabled:opacity-40 ${valveCmd ? 'border-emerald-400/60 bg-emerald-500/15 text-emerald-200' : 'border-slate-700 text-slate-300'}`}>Valve {valveCmd ? 'OPEN' : 'SHUT'}</button>
              </div>
            )}
            <label className="block">
              <span className="mb-1 flex justify-between text-[11px] text-slate-400"><span>Outflow demand</span><span className="text-slate-200">{demand}%</span></span>
              <input type="range" min="0" max="100" value={demand} onChange={(e) => setDemand(Number(e.target.value))} className="w-full" style={{ accentColor: '#38bdf8' }} />
            </label>
          </div>
          <div className="min-h-0 flex-1"><WidgetPanel plc={plc} scanPhase={scanPhase} /></div>
        </div>
      ) : (
        <button onClick={() => setLeftOpen(true)} className="absolute left-3 top-16 rounded-lg border border-slate-700 bg-slate-900/80 p-2 text-slate-300 backdrop-blur"><PanelLeft className="h-4 w-4" /></button>
      )}

      {/* Right: SCADA / HMI */}
      {rightOpen ? (
        <div className="absolute right-3 top-16 w-64 rounded-2xl border border-slate-800 bg-slate-950/80 p-3 backdrop-blur">
          <div className="mb-2 flex items-center justify-between">
            <p className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-amber-300"><Gauge className="h-3.5 w-3.5" /> SCADA · HMI</p>
            <button onClick={() => setRightOpen(false)} className="text-slate-500 hover:text-slate-200"><PanelRight className="h-4 w-4" /></button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2">
              <p className="text-[10px] text-slate-400">Tank level</p>
              <p className={`text-lg font-bold tabular-nums ${out.lvlHigh ? 'text-rose-300' : 'text-slate-100'}`}>{Math.round(out.level)}<span className="ml-0.5 text-[10px] font-normal text-slate-500">%</span></p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2">
              <p className="text-[10px] text-slate-400">Pump</p>
              <p className={`text-lg font-bold ${out.pump ? 'text-emerald-300' : 'text-slate-400'}`}>{out.pump ? 'RUN' : 'OFF'}</p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2">
              <p className="text-[10px] text-slate-400">Inlet valve</p>
              <p className={`text-lg font-bold ${out.valve ? 'text-emerald-300' : 'text-slate-400'}`}>{out.valve ? 'OPEN' : 'SHUT'}</p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2">
              <p className="text-[10px] text-slate-400">Mode</p>
              <p className="text-lg font-bold capitalize text-slate-100">{running ? mode : 'Stopped'}</p>
            </div>
          </div>

          {/* PLC scan indicator */}
          <div className="mt-2 rounded-lg border border-slate-800 bg-slate-900/60 px-2 py-1.5" title="A real PLC scan runs in about 8 ms; shown slowed here so the three steps are visible.">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-400">Scan</span>
              <div className="flex gap-1">
                {SCAN_STEPS.map((s, i) => (
                  <span key={s.id} className={`h-1.5 w-1.5 rounded-full transition-colors ${i === scanPhase && running ? 'bg-amber-400' : 'bg-slate-700'}`} />
                ))}
              </div>
              <span className="text-[10px] font-semibold text-slate-300">{running ? SCAN_STEPS[scanPhase].name : 'Stopped'}</span>
              <span className="ml-auto text-[10px] tabular-nums text-slate-500">~8 ms</span>
            </div>
            <p className="mt-0.5 text-[9px] tabular-nums text-slate-500">scan #{scanCount.toLocaleString()} · slowed for clarity</p>
          </div>

          {/* Alarms */}
          <div className="mt-2 rounded-lg border border-slate-800 bg-slate-900/60 p-2">
            <p className="mb-1 text-[10px] uppercase tracking-wider text-slate-400">Alarms</p>
            {out.alarms.length === 0 ? (
              <p className="text-[11px] text-emerald-300">All normal</p>
            ) : (
              <div className="space-y-1">
                {out.alarms.map((a) => (
                  <p key={a.id} className={`flex items-center gap-1.5 text-[11px] ${a.sev === 'high' ? 'text-rose-300' : 'text-amber-300'}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${a.sev === 'high' ? 'bg-rose-400' : 'bg-amber-400'}`} /> {a.text}
                  </p>
                ))}
              </div>
            )}
          </div>

          <div className="mt-2">
            <p className="mb-1 text-[10px] text-slate-400">Level trend</p>
            <Spark data={history} max={100} />
          </div>

          <div className="mt-2 rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
            <p className="text-[10px] uppercase tracking-wider text-amber-300">{selected.role}</p>
            <p className="text-sm font-bold text-slate-100">{selected.name}</p>
            <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">{selected.detail}</p>
          </div>
        </div>
      ) : (
        <button onClick={() => setRightOpen(true)} className="absolute right-3 top-16 rounded-lg border border-slate-700 bg-slate-900/80 p-2 text-slate-300 backdrop-blur"><PanelRight className="h-4 w-4" /></button>
      )}

      <KnowledgeCheckLauncher questions={KNOWLEDGE_QUESTIONS} accent="amber" />
    </div>
  );
}
