/**
 * EdgeAiTool.jsx
 * --------------
 * Full-screen Edge AI tool: decide where AI inference runs (edge / cloud /
 * hybrid), pick a model size and network quality, and watch the live trade-off
 * between latency, bandwidth, accuracy and privacy on a 3D pipeline.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { MousePointerClick, PanelLeft, PanelRight, Cpu } from 'lucide-react';
import PipelineScene from './PipelineScene';
import KnowledgeCheckLauncher from '../../components/KnowledgeCheckLauncher';
import ModelOverview from '../../components/ModelOverview';
import { useTheme } from '../../theme';
import { NODES, MODELS, computeInference, KNOWLEDGE_QUESTIONS } from './data';
import { PlacementSelector, HardwareExplorer, EdgeCloudCalculator, TinyMlAdvisor, DataFlowExplorer, CostCalculator } from './Widgets';

const TABS = ['Calculator', 'TinyML', 'Data Flow', 'Cost', 'Placement', 'Hardware'];
const HIST = 40;
const PRIVACY_TONE = { High: 'text-emerald-300', Medium: 'text-amber-300', Low: 'text-rose-300' };

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
      <path d={path} fill="none" stroke="#a78bfa" strokeWidth="1.5" />
    </svg>
  );
}

function WidgetPanel({ placement, onPlacement }) {
  const [tab, setTab] = useState('Calculator');
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
        {tab === 'Calculator' && <EdgeCloudCalculator />}
        {tab === 'TinyML' && <TinyMlAdvisor />}
        {tab === 'Data Flow' && <DataFlowExplorer />}
        {tab === 'Cost' && <CostCalculator />}
        {tab === 'Placement' && <PlacementSelector placement={placement} onPlacement={onPlacement} />}
        {tab === 'Hardware' && <HardwareExplorer />}
      </div>
    </div>
  );
}

export default function EdgeAiTool() {
  const { canvasBg, theme } = useTheme();
  const floorColor = theme === 'light' ? '#dbe2ee' : '#111826';
  const [placement, setPlacement] = useState('edge');
  const [modelId, setModelId] = useState('base');
  const [network, setNetwork] = useState(6);
  const [fps, setFps] = useState(15);
  const [selectedId, setSelectedId] = useState('edge');
  const [history, setHistory] = useState([]);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);

  const stats = useMemo(() => computeInference({ placement, modelId, network, fps }), [placement, modelId, network, fps]);

  const latencyRef = useRef(stats.latency);
  latencyRef.current = stats.latency;
  useEffect(() => {
    const id = setInterval(() => setHistory((h) => [...h.slice(-HIST + 1), latencyRef.current]), 250);
    return () => clearInterval(id);
  }, []);

  const selected = NODES.find((n) => n.id === selectedId) ?? NODES[0];
  const maxLatency = Math.max(60, ...history);

  return (
    <div className="relative h-full w-full">
      <Canvas shadows="percentage" camera={{ position: [0, 4.5, 10], fov: 46 }}>
        <color attach="background" args={[canvasBg]} />
        <PipelineScene placement={placement} fps={fps} selectedId={selectedId} onSelect={setSelectedId} floorColor={floorColor} light={theme === 'light'} />
      </Canvas>

      <div className="pointer-events-none absolute left-72 top-4 rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1.5 text-xs text-slate-300 backdrop-blur">
        <span className="inline-flex items-center gap-1.5"><MousePointerClick className="h-3.5 w-3.5" /> Choose where AI runs · tap a node</span>
      </div>

      <ModelOverview
        accent="violet"
        title="Where Should AI Inference Run?"
        points={[
          'A smart camera feeds an edge device and a cloud datacenter.',
          'Pick Edge, Cloud or Hybrid to move where the model runs; the spinning ring marks the node doing the thinking.',
          'Watch the live trade-off between latency, bandwidth, accuracy and privacy.',
        ]}
      />

      {/* Left: controls + widgets */}
      {leftOpen ? (
        <div className="absolute left-3 top-16 bottom-3 flex w-64 flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/80 backdrop-blur">
          <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
            <p className="text-[10px] uppercase tracking-widest text-slate-500">Inference controls</p>
            <button onClick={() => setLeftOpen(false)} className="text-slate-500 hover:text-slate-200"><PanelLeft className="h-4 w-4" /></button>
          </div>
          <div className="space-y-3 border-b border-slate-800 p-3">
            <div>
              <span className="mb-1 block text-[11px] text-slate-400">Run inference on</span>
              <div className="grid grid-cols-3 gap-1">
                {['edge', 'cloud', 'hybrid'].map((p) => (
                  <button key={p} onClick={() => setPlacement(p)} className={`rounded-lg border px-2 py-1 text-[11px] font-semibold capitalize ${placement === p ? 'border-violet-400/60 bg-violet-500/15 text-violet-200 light:border-violet-400 light:bg-violet-100 light:text-violet-700' : 'border-slate-700 text-slate-300 hover:border-slate-600'}`}>{p}</button>
                ))}
              </div>
            </div>
            <div>
              <span className="mb-1 block text-[11px] text-slate-400">Model size</span>
              <div className="grid grid-cols-3 gap-1">
                {MODELS.map((m) => (
                  <button key={m.id} onClick={() => setModelId(m.id)} className={`rounded-lg border px-2 py-1 text-[11px] font-semibold ${modelId === m.id ? 'border-violet-400/60 bg-violet-500/15 text-violet-200 light:border-violet-400 light:bg-violet-100 light:text-violet-700' : 'border-slate-700 text-slate-300 hover:border-slate-600'}`}>{m.name}</button>
                ))}
              </div>
            </div>
            <label className="block">
              <span className="mb-1 flex justify-between text-[11px] text-slate-400"><span>Network quality</span><span className="text-slate-200">{network}/10</span></span>
              <input type="range" min="1" max="10" value={network} onChange={(e) => setNetwork(Number(e.target.value))} className="w-full" style={{ accentColor: '#a78bfa' }} />
            </label>
            <label className="block">
              <span className="mb-1 flex justify-between text-[11px] text-slate-400"><span>Frame rate</span><span className="text-slate-200">{fps} fps</span></span>
              <input type="range" min="1" max="30" value={fps} onChange={(e) => setFps(Number(e.target.value))} className="w-full" style={{ accentColor: '#a78bfa' }} />
            </label>
          </div>
          <div className="min-h-0 flex-1"><WidgetPanel placement={placement} onPlacement={setPlacement} /></div>
        </div>
      ) : (
        <button onClick={() => setLeftOpen(true)} className="absolute left-3 top-16 rounded-lg border border-slate-700 bg-slate-900/80 p-2 text-slate-300 backdrop-blur"><PanelLeft className="h-4 w-4" /></button>
      )}

      {/* Right: live trade-offs */}
      {rightOpen ? (
        <div className="absolute right-3 top-16 w-64 rounded-2xl border border-slate-800 bg-slate-950/80 p-3 backdrop-blur">
          <div className="mb-2 flex items-center justify-between">
            <p className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-brand-300"><Cpu className="h-3.5 w-3.5" /> Live trade-offs</p>
            <button onClick={() => setRightOpen(false)} className="text-slate-500 hover:text-slate-200"><PanelRight className="h-4 w-4" /></button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2">
              <p className="text-[10px] text-slate-400">Latency</p>
              <p className={`text-lg font-bold tabular-nums ${stats.latency > 120 ? 'text-amber-300' : 'text-slate-100'}`}>{stats.latency}<span className="ml-0.5 text-[10px] font-normal text-slate-500">ms</span></p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2">
              <p className="text-[10px] text-slate-400">Bandwidth</p>
              <p className={`text-lg font-bold tabular-nums ${stats.bandwidth > 10 ? 'text-rose-300' : 'text-slate-100'}`}>{stats.bandwidth}<span className="ml-0.5 text-[10px] font-normal text-slate-500">Mbps</span></p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2">
              <p className="text-[10px] text-slate-400">Accuracy</p>
              <p className="text-lg font-bold tabular-nums text-slate-100">{stats.accuracy}<span className="ml-0.5 text-[10px] font-normal text-slate-500">%</span></p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2">
              <p className="text-[10px] text-slate-400">Privacy</p>
              <p className={`text-lg font-bold ${PRIVACY_TONE[stats.privacy]}`}>{stats.privacy}</p>
            </div>
          </div>

          <div className="mt-3">
            <p className="mb-1 text-[10px] text-slate-400">Latency trend</p>
            <Spark data={history} max={maxLatency} />
          </div>

          <div className="mt-3 rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
            <p className="text-[10px] uppercase tracking-wider text-brand-300">{selected.role === 'source' ? 'Source' : selected.role}</p>
            <p className="text-sm font-bold text-slate-100">{selected.name}</p>
            <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">{selected.detail}</p>
          </div>
        </div>
      ) : (
        <button onClick={() => setRightOpen(true)} className="absolute right-3 top-16 rounded-lg border border-slate-700 bg-slate-900/80 p-2 text-slate-300 backdrop-blur"><PanelRight className="h-4 w-4" /></button>
      )}

      <KnowledgeCheckLauncher questions={KNOWLEDGE_QUESTIONS} accent="brand" />
    </div>
  );
}
