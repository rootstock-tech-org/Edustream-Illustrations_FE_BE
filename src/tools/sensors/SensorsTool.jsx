/**
 * SensorsTool.jsx
 * ---------------
 * Full-screen Sensors tool: drive the machine (load, RPM, injected bearing fault)
 * and watch the 3D machine spin/vibrate while the sensors produce live readings
 * with realistic thermal lag and noise. Click a sensor to focus its trace.
 */
import { useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { MousePointerClick, AlertTriangle, PanelLeft, PanelRight } from 'lucide-react';
import MachineScene from './MachineScene';
import KnowledgeCheckLauncher from '../../components/KnowledgeCheckLauncher';
import ModelOverview from '../../components/ModelOverview';
import { useTheme } from '../../theme';
import { METRICS, MACHINE_SENSORS, computeReadings, KNOWLEDGE_QUESTIONS } from './data';
import { SensorSelector, BoardSelector, ProtocolSelector, SignalVisualizer } from './Widgets';

const TABS = ['Select', 'Board', 'Protocol', 'Signal'];
const HIST = 40;

function metricTone(key, v) {
  const m = METRICS[key];
  if (v >= m.bad) return 'text-rose-300';
  if (v >= m.warn) return 'text-amber-300';
  return 'text-slate-100';
}

function Spark({ data, metric }) {
  const m = METRICS[metric];
  const W = 220;
  const H = 44;
  if (data.length < 2) return <div style={{ height: H }} />;
  const path = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * W;
      const y = Math.max(0, Math.min(H, H - ((v - m.min) / (m.max - m.min)) * H));
      return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-md border border-slate-800 bg-slate-950/60">
      <path d={path} fill="none" stroke="#34d399" strokeWidth="1.5" />
    </svg>
  );
}

function ReferencePanel({ selectedId, onSelect, rpm, reading, metricKey }) {
  const [tab, setTab] = useState('Select');
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap gap-1 border-b border-slate-800 p-2">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`rounded-md px-2 py-1 text-[11px] font-medium ${tab === t ? 'bg-emerald-500/15 text-emerald-300' : 'text-slate-400 hover:text-slate-200'}`}>
            {t}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {tab === 'Select' && <SensorSelector selectedId={selectedId} onSelect={onSelect} reading={reading} metricKey={metricKey} />}
        {tab === 'Board' && <BoardSelector />}
        {tab === 'Protocol' && <ProtocolSelector />}
        {tab === 'Signal' && <SignalVisualizer rpm={rpm} />}
      </div>
    </div>
  );
}

export default function SensorsTool() {
  const { canvasBg, theme } = useTheme();
  const floorColor = theme === 'light' ? '#dbe2ee' : '#111826';
  const [load, setLoad] = useState(45);
  const [rpm, setRpm] = useState(1200);
  const [fault, setFault] = useState(false);
  const [selectedId, setSelectedId] = useState('bearing');
  const [readings, setReadings] = useState({ temp: 45, vib: 1, flow: 0, current: 3 });
  const [history, setHistory] = useState({ temp: [], vib: [], flow: [], current: [] });
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);

  const stateRef = useRef({ load, rpm, fault });
  stateRef.current = { load, rpm, fault };
  const readingsRef = useRef({ temp: 45, vib: 1, flow: 0, current: 3 });

  useEffect(() => {
    const id = setInterval(() => {
      const t = computeReadings(stateRef.current);
      const r = readingsRef.current;
      r.temp += (t.tempTarget - r.temp) * 0.12; // thermal lag
      r.vib = Math.max(0, t.vib + (Math.random() - 0.5) * 0.3);
      r.flow = Math.max(0, t.flow + (Math.random() - 0.5) * 1);
      r.current = Math.max(0, t.current + (Math.random() - 0.5) * 0.2);
      setReadings({ ...r });
      setHistory((h) => ({
        temp: [...h.temp.slice(-HIST + 1), r.temp],
        vib: [...h.vib.slice(-HIST + 1), r.vib],
        flow: [...h.flow.slice(-HIST + 1), r.flow],
        current: [...h.current.slice(-HIST + 1), r.current],
      }));
    }, 150);
    return () => clearInterval(id);
  }, []);

  const selected = MACHINE_SENSORS.find((s) => s.id === selectedId);
  const selMetric = selected.metric;

  return (
    <div className="relative h-full w-full">
      <Canvas shadows="percentage" camera={{ position: [4.5, 3, 5], fov: 48 }}>
        <color attach="background" args={[canvasBg]} />
        <MachineScene rpm={rpm} vibration={readings.vib} selectedId={selectedId} onSelect={setSelectedId} readings={readings} floorColor={floorColor} light={theme === 'light'} />
      </Canvas>

      <div className="pointer-events-none absolute left-72 top-4 rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1.5 text-xs text-slate-300 backdrop-blur">
        <span className="inline-flex items-center gap-1.5">
          <MousePointerClick className="h-3.5 w-3.5" /> Drive the machine · click a sensor to focus its trace
        </span>
      </div>

      <ModelOverview
        accent="emerald"
        title="A Live Machine and Its Sensors"
        points={[
          'This 3D motor-pump is watched by four sensors: temperature, vibration, flow and current.',
          'Drive it with Load and Speed, or inject a bearing fault, and the readings react in real time.',
          'Markers glow amber or red as values cross warning limits; tap a sensor to focus its trace.',
        ]}
      />

      {/* Left: controls + reference */}
      {leftOpen ? (
        <div className="absolute left-3 top-16 bottom-3 flex w-64 flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/80 backdrop-blur">
          <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
            <p className="text-[10px] uppercase tracking-widest text-slate-500">Machine controls</p>
            <button onClick={() => setLeftOpen(false)} className="text-slate-500 hover:text-slate-200"><PanelLeft className="h-4 w-4" /></button>
          </div>
          <div className="space-y-3 border-b border-slate-800 p-3">
            <label className="block">
              <span className="mb-1 flex justify-between text-[11px] text-slate-400"><span>Load</span><span className="text-slate-200">{load}%</span></span>
              <input type="range" min="0" max="100" value={load} onChange={(e) => setLoad(Number(e.target.value))} className="w-full" style={{ accentColor: '#34d399' }} />
            </label>
            <label className="block">
              <span className="mb-1 flex justify-between text-[11px] text-slate-400"><span>Speed</span><span className="text-slate-200">{rpm} rpm</span></span>
              <input type="range" min="0" max="1500" step="10" value={rpm} onChange={(e) => setRpm(Number(e.target.value))} className="w-full" style={{ accentColor: '#34d399' }} />
            </label>
            <button
              onClick={() => setFault((f) => !f)}
              className={`flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-semibold ${fault ? 'border-rose-500/50 bg-rose-500/15 text-rose-200 light:border-rose-500 light:bg-rose-500 light:text-white' : 'border-slate-700 text-slate-300 hover:border-slate-600'}`}
            >
              <AlertTriangle className="h-3.5 w-3.5" /> {fault ? 'Bearing fault: ON' : 'Inject bearing fault'}
            </button>
          </div>
          <div className="min-h-0 flex-1"><ReferencePanel selectedId={selectedId} onSelect={setSelectedId} rpm={rpm} reading={readings[selMetric]} metricKey={selMetric} /></div>
        </div>
      ) : (
        <button onClick={() => setLeftOpen(true)} className="absolute left-3 top-16 rounded-lg border border-slate-700 bg-slate-900/80 p-2 text-slate-300 backdrop-blur"><PanelLeft className="h-4 w-4" /></button>
      )}

      {/* Right: live readings */}
      {rightOpen ? (
        <div className="absolute right-3 top-16 w-64 rounded-2xl border border-slate-800 bg-slate-950/80 p-3 backdrop-blur">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-widest text-emerald-400">Live readings</p>
            <button onClick={() => setRightOpen(false)} className="text-slate-500 hover:text-slate-200"><PanelRight className="h-4 w-4" /></button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(METRICS).map(([key, m]) => (
              <button
                key={key}
                onClick={() => setSelectedId(MACHINE_SENSORS.find((s) => s.metric === key)?.id ?? selectedId)}
                className={`rounded-lg border p-2 text-left ${selMetric === key ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-slate-800 bg-slate-900/60'}`}
              >
                <p className="text-[10px] text-slate-400">{m.label}</p>
                <p className={`text-lg font-bold tabular-nums ${metricTone(key, readings[key])}`}>
                  {readings[key].toFixed(m.decimals)}<span className="ml-0.5 text-[10px] font-normal text-slate-500">{m.unit}</span>
                </p>
              </button>
            ))}
          </div>

          <div className="mt-3 rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
            <p className="text-[10px] uppercase tracking-wider text-emerald-400">{selected.quantity}</p>
            <p className="text-sm font-bold text-slate-100">{selected.label}</p>
            <p className="text-[11px] text-slate-400">Sensor: <span className="text-emerald-300">{selected.sensor}</span></p>
            <div className="mt-2"><Spark data={history[selMetric]} metric={selMetric} /></div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">{selected.why}</p>
          </div>
        </div>
      ) : (
        <button onClick={() => setRightOpen(true)} className="absolute right-3 top-16 rounded-lg border border-slate-700 bg-slate-900/80 p-2 text-slate-300 backdrop-blur"><PanelRight className="h-4 w-4" /></button>
      )}

      <KnowledgeCheckLauncher questions={KNOWLEDGE_QUESTIONS} accent="emerald" />
    </div>
  );
}
