/**
 * CommunicationTool.jsx
 * ---------------------
 * Full-screen Communication tool: drive an MQTT publish/subscribe network
 * (publish rate, QoS, packet loss) and watch packets flow from publishers
 * through the broker to the subscribers, with live delivery stats.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { MousePointerClick, PanelLeft, PanelRight, RadioTower } from 'lucide-react';
import NetworkScene from './NetworkScene';
import KnowledgeCheckLauncher from '../../components/KnowledgeCheckLauncher';
import ModelOverview from '../../components/ModelOverview';
import { useTheme } from '../../theme';
import { NODES, KNOWLEDGE_QUESTIONS } from './data';
import { NodeSelector, QosExplorer, ProtocolComparator, MqttTopicBuilder, LatencyEstimator, CommunicationAdvisor } from './Widgets';

const TABS = ['Compare', 'Topic', 'Latency', 'Advisor', 'Nodes', 'QoS'];
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
      <path d={path} fill="none" stroke="#38bdf8" strokeWidth="1.5" />
    </svg>
  );
}

function WidgetPanel({ selectedId, onSelect, qos, onQos }) {
  const [tab, setTab] = useState('Compare');
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
        {tab === 'Compare' && <ProtocolComparator />}
        {tab === 'Topic' && <MqttTopicBuilder />}
        {tab === 'Latency' && <LatencyEstimator />}
        {tab === 'Advisor' && <CommunicationAdvisor />}
        {tab === 'Nodes' && <NodeSelector selectedId={selectedId} onSelect={onSelect} />}
        {tab === 'QoS' && <QosExplorer qos={qos} onQos={onQos} />}
      </div>
    </div>
  );
}

export default function CommunicationTool() {
  const { canvasBg, theme } = useTheme();
  const floorColor = theme === 'light' ? '#dbe2ee' : '#111826';
  const [rate, setRate] = useState(6);
  const [qos, setQos] = useState(1);
  const [loss, setLoss] = useState(10);
  const [selectedId, setSelectedId] = useState('broker');
  const [stats, setStats] = useState({ delivered: 0, lost: 0, latency: 33 });
  const [history, setHistory] = useState([]);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);


  const ctrl = useRef({ rate, qos, loss });
  ctrl.current = { rate, qos, loss };

  // Timestamps of real delivery/loss events reported by the 3D scene.
  const events = useRef({ delivered: [], lost: [] });
  const onEvent = useCallback((type) => {
    const arr = events.current[type];
    if (arr) arr.push(performance.now());
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      const now = performance.now();
      const cut = now - 1000;
      const e = events.current;
      e.delivered = e.delivered.filter((t) => t >= cut);
      e.lost = e.lost.filter((t) => t >= cut);
      const { qos: q, rate: r } = ctrl.current;
      const latency = Math.round(6 + r * 1.4 + (q === 0 ? 0 : q === 1 ? 18 : 45));
      const delivered = e.delivered.length;
      const lost = e.lost.length;
      setStats({ delivered, lost, latency });
      setHistory((h) => [...h.slice(-HIST + 1), delivered]);
    }, 250);
    return () => clearInterval(id);
  }, []);

  // Effective packet drop shown in the 3D scene (higher QoS re-sends, so fewer drop).
  const dropPct = qos === 0 ? loss : qos === 1 ? loss * 0.2 : loss * 0.02;
  const selected = NODES.find((n) => n.id === selectedId) ?? NODES[0];
  const maxDelivered = Math.max(20, ...history);


  return (
    <div className="relative h-full w-full">
      <Canvas shadows="percentage" camera={{ position: [5.5, 4, 7], fov: 46 }}>
        <color attach="background" args={[canvasBg]} />
        <NetworkScene rate={rate} dropPct={dropPct} selectedId={selectedId} onSelect={setSelectedId} onEvent={onEvent} floorColor={floorColor} light={theme === 'light'} />
      </Canvas>

      <div className="pointer-events-none absolute left-72 top-4 rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1.5 text-xs text-slate-300 backdrop-blur">
        <span className="inline-flex items-center gap-1.5"><MousePointerClick className="h-3.5 w-3.5" /> Publish & watch it flow · tap a node</span>
      </div>

      <ModelOverview
        accent="brand"
        title="An MQTT Publish / Subscribe Network"
        points={[
          'Two sensors publish messages to a central broker, which fans them out to the subscribers.',
          'The arrows are live messages travelling the network; lost ones turn red and drop away.',
          'Change publish rate, QoS and packet loss to watch delivery, loss and latency respond.',
        ]}
      />

      {/* Left: controls + widgets */}
      {leftOpen ? (
        <div className="absolute left-3 top-16 bottom-3 flex w-64 flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/80 backdrop-blur">
          <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
            <p className="text-[10px] uppercase tracking-widest text-slate-500">Network controls</p>
            <button onClick={() => setLeftOpen(false)} className="text-slate-500 hover:text-slate-200"><PanelLeft className="h-4 w-4" /></button>
          </div>
          <div className="space-y-3 border-b border-slate-800 p-3">
            <label className="block">
              <span className="mb-1 flex justify-between text-[11px] text-slate-400"><span>Publish rate</span><span className="text-slate-200">{rate} msg/s</span></span>
              <input type="range" min="1" max="20" value={rate} onChange={(e) => setRate(Number(e.target.value))} className="w-full" style={{ accentColor: '#38bdf8' }} />
            </label>
            <div>
              <span className="mb-1 block text-[11px] text-slate-400">Quality of Service</span>
              <div className="grid grid-cols-3 gap-1">
                {[0, 1, 2].map((q) => (
                  <button key={q} onClick={() => setQos(q)} className={`rounded-lg border px-2 py-1 text-[11px] font-semibold ${qos === q ? 'border-brand-400/60 bg-brand-500/15 text-brand-200' : 'border-slate-700 text-slate-300 hover:border-slate-600'}`}>QoS {q}</button>
                ))}
              </div>
            </div>
            <label className="block">
              <span className="mb-1 flex justify-between text-[11px] text-slate-400"><span>Packet loss</span><span className="text-slate-200">{loss}%</span></span>
              <input type="range" min="0" max="40" value={loss} onChange={(e) => setLoss(Number(e.target.value))} className="w-full" style={{ accentColor: '#f87171' }} />
            </label>
          </div>
          <div className="min-h-0 flex-1"><WidgetPanel selectedId={selectedId} onSelect={setSelectedId} qos={qos} onQos={setQos} /></div>
        </div>
      ) : (
        <button onClick={() => setLeftOpen(true)} className="absolute left-3 top-16 rounded-lg border border-slate-700 bg-slate-900/80 p-2 text-slate-300 backdrop-blur"><PanelLeft className="h-4 w-4" /></button>
      )}

      {/* Right: live delivery stats */}
      {rightOpen ? (
        <div className="absolute right-3 top-16 w-64 rounded-2xl border border-slate-800 bg-slate-950/80 p-3 backdrop-blur">
          <div className="mb-2 flex items-center justify-between">
            <p className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-brand-400"><RadioTower className="h-3.5 w-3.5" /> Live traffic</p>
            <button onClick={() => setRightOpen(false)} className="text-slate-500 hover:text-slate-200"><PanelRight className="h-4 w-4" /></button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2">
              <p className="text-[10px] text-slate-400">Delivered</p>
              <p className="text-lg font-bold tabular-nums text-brand-300">{stats.delivered}<span className="ml-0.5 text-[10px] font-normal text-slate-500">msg/s</span></p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2">
              <p className="text-[10px] text-slate-400">Lost</p>
              <p className={`text-lg font-bold tabular-nums ${stats.lost > 0 ? 'text-rose-300' : 'text-slate-100'}`}>{stats.lost}<span className="ml-0.5 text-[10px] font-normal text-slate-500">msg/s</span></p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2">
              <p className="text-[10px] text-slate-400">Latency</p>
              <p className={`text-lg font-bold tabular-nums ${stats.latency > 60 ? 'text-amber-300' : 'text-slate-100'}`}>{stats.latency}<span className="ml-0.5 text-[10px] font-normal text-slate-500">ms</span></p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2">
              <p className="text-[10px] text-slate-400">QoS</p>
              <p className="text-lg font-bold tabular-nums text-slate-100">{qos}</p>
            </div>
          </div>

          <div className="mt-3">
            <p className="mb-1 text-[10px] text-slate-400">Delivered throughput</p>
            <Spark data={history} max={maxDelivered} />
          </div>

          <div className="mt-3 rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
            <p className="text-[10px] uppercase tracking-wider text-brand-400">{selected.role}</p>
            <p className="text-sm font-bold text-slate-100">{selected.name}</p>
            <p className="text-[11px] text-slate-500">topic: <span className="font-mono text-brand-300">{selected.topic}</span></p>
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
