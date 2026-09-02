/**
 * Widgets.jsx (Communication)
 * ---------------------------
 * Interactive widgets: Node Selector (drives the 3D network), Protocol
 * Recommender, QoS Explorer (drives the model's QoS) and Topology Explorer.
 */
import { useMemo, useState } from 'react';
import Challenge from '../../components/Challenge';
import {
  NODES,
  PROTO_REQUIREMENTS,
  PROTOCOLS,
  QOS_LEVELS,
  PACKET_INFO,
  TOPOLOGIES,
  COMPARE_DIMS,
  COMPARE_PROTOCOLS,
  TOPIC_LEVELS,
  LATENCY_LINKS,
  estimateLatency,
  COMM_CHALLENGE,
} from './data';

const chip = (active) =>
  `rounded-lg border px-2.5 py-1.5 text-[10px] font-semibold transition-all duration-150 active:translate-y-px ${
    active
      ? 'border-brand-400/60 bg-gradient-to-b from-brand-400/25 to-brand-600/15 text-brand-100 shadow-[0_3px_12px_-2px_rgba(6,182,212,0.55)] ring-1 ring-brand-400/30'
      : 'border-slate-700/80 bg-gradient-to-b from-slate-700/50 to-slate-900/70 text-slate-300 shadow-[0_2px_6px_-1px_rgba(0,0,0,0.5)] hover:-translate-y-0.5 hover:border-slate-500 light:border-slate-300 light:from-slate-100 light:to-slate-200 light:text-slate-600'
  }`;

const panel3d = 'rounded-xl border border-white/10 bg-gradient-to-br from-slate-800/70 to-slate-950/85 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.8)] ring-1 ring-white/5 backdrop-blur-sm';

const ROLE_LABEL = { publisher: 'Publisher', broker: 'Broker', subscriber: 'Subscriber' };

// Controlled: picking a node highlights it on the 3D network.
export function NodeSelector({ selectedId, onSelect }) {
  const sel = NODES.find((n) => n.id === selectedId) ?? NODES[0];
  return (
    <div>
      <p className="mb-2 text-[10px] text-slate-500">Pick a node to highlight it on the network.</p>
      <div className="flex flex-wrap gap-1.5">
        {NODES.map((n) => (
          <button key={n.id} onClick={() => onSelect(n.id)} className={chip(n.id === selectedId)}>{n.name}</button>
        ))}
      </div>
      <div className={`mt-2 p-3 ${panel3d}`}>
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-slate-100">{sel.name}</p>
          <span className="rounded-full bg-brand-500/15 px-2 py-0.5 text-[9px] font-semibold text-brand-300">{ROLE_LABEL[sel.role]}</span>
        </div>
        <p className="mt-0.5 text-[10px] text-slate-500">topic: <span className="font-mono text-brand-300">{sel.topic}</span></p>
        <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">{sel.detail}</p>
      </div>
    </div>
  );
}

function Recommender({ requirements, candidates, prompt }) {
  const [sel, setSel] = useState(() => new Set());
  const toggle = (id) =>
    setSel((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  const ranked = useMemo(() => {
    const chosen = [...sel];
    return candidates
      .map((c, i) => ({ c, i, score: chosen.filter((r) => c.fits.includes(r)).length }))
      .sort((a, b) => b.score - a.score || a.i - b.i);
  }, [sel, candidates]);
  const top = ranked[0]?.score ?? 0;
  return (
    <div>
      <p className="mb-2 text-[10px] text-slate-500">{prompt}</p>
      <div className="flex flex-wrap gap-1.5">
        {requirements.map((r) => (
          <button key={r.id} onClick={() => toggle(r.id)} className={chip(sel.has(r.id))}>{r.label}</button>
        ))}
      </div>
      <div className="mt-2 space-y-1.5">
        {ranked.map(({ c, score }, idx) => {
          const isTop = sel.size > 0 && idx === 0 && score > 0 && score === top;
          return (
            <div key={c.id} className={`rounded-xl border p-2.5 transition-all duration-150 ${isTop ? 'border-brand-400/50 bg-gradient-to-br from-brand-500/20 to-brand-700/10 shadow-[0_6px_20px_-6px_rgba(6,182,212,0.55)] ring-1 ring-brand-400/25' : 'border-white/10 bg-gradient-to-br from-slate-800/60 to-slate-950/70 shadow-[0_4px_14px_-6px_rgba(0,0,0,0.7)]'}`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-100">{c.name}{isTop && <span className="ml-1 text-[10px] text-brand-400">· best fit</span>}</span>
                {sel.size > 0 && <span className="text-[10px] tabular-nums text-slate-400">{score}/{sel.size}</span>}
              </div>
              <p className="mt-0.5 text-[10px] leading-relaxed text-slate-400">{c.note}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ProtocolSelector() {
  return <Recommender requirements={PROTO_REQUIREMENTS} candidates={PROTOCOLS} prompt="Select what you need, and the best protocol rises to the top." />;
}

// Controlled by the tool: choosing a QoS also sets the network's QoS.
export function QosExplorer({ qos, onQos }) {
  const [pkt, setPkt] = useState(null);
  const sel = QOS_LEVELS.find((q) => q.id === qos) ?? QOS_LEVELS[0];
  return (
    <div>
      <p className="mb-2 text-[10px] text-slate-500">Pick a QoS level. It also drives the live network.</p>
      <div className="flex flex-wrap gap-1.5">
        {QOS_LEVELS.map((q) => (
          <button key={q.id} onClick={() => { onQos(q.id); setPkt(null); }} className={chip(q.id === qos)}>QoS {q.id}</button>
        ))}
      </div>
      <div className={`mt-2 p-3 ${panel3d}`}>
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-slate-100">{sel.name}</p>
          <span className="rounded-full bg-brand-500/15 px-2 py-0.5 text-[9px] font-semibold text-brand-300">{sel.tag}</span>
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">{sel.detail}</p>
        <p className="mt-2 text-[9px] uppercase tracking-wider text-slate-500">Handshake · tap a step</p>
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {sel.steps.map((s, i) => {
            const key = s.replace(/[^A-Z]/g, '');
            const active = pkt === key;
            return (
              <button
                key={i}
                onClick={() => setPkt(active ? null : key)}
                className={`rounded-md border px-1.5 py-0.5 font-mono text-[9px] transition-all ${
                  active
                    ? 'border-brand-400/70 bg-brand-500/25 text-brand-100 ring-1 ring-brand-400/30'
                    : 'border-brand-500/30 bg-brand-500/10 text-brand-200 hover:border-brand-400/60'
                }`}
              >
                {s}
              </button>
            );
          })}
        </div>
        {pkt && PACKET_INFO[pkt] && (
          <div className="mt-2 rounded-lg border border-brand-500/25 bg-brand-500/5 p-2">
            <p className="font-mono text-[10px] font-bold text-brand-300">{pkt}</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400">{PACKET_INFO[pkt]}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export function TopologyExplorer() {
  const [sel, setSel] = useState(TOPOLOGIES[0].id);
  const t = TOPOLOGIES.find((x) => x.id === sel) ?? TOPOLOGIES[0];
  return (
    <div>
      <p className="mb-2 text-[10px] text-slate-500">How the devices are wired together.</p>
      <div className="flex flex-wrap gap-1.5">
        {TOPOLOGIES.map((x) => (
          <button key={x.id} onClick={() => setSel(x.id)} className={chip(x.id === sel)}>{x.name}</button>
        ))}
      </div>
      <div className={`mt-2 p-3 ${panel3d}`}>
        <p className="text-xs font-bold text-slate-100">{t.name}</p>
        <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">{t.detail}</p>
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] text-emerald-300">+ {t.pro}</p>
          <p className="rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-[10px] text-rose-300">− {t.con}</p>
        </div>
      </div>
    </div>
  );
}

const PROTO_KEYS = Object.keys(COMPARE_PROTOCOLS);

/** Protocol Comparator: pick two protocols and read them side by side. */
export function ProtocolComparator() {
  const [a, setA] = useState('mqtt');
  const [b, setB] = useState('opcua');
  const pa = COMPARE_PROTOCOLS[a];
  const pb = COMPARE_PROTOCOLS[b];
  const Col = ({ sel, onPick, side }) => (
    <div className="flex flex-wrap gap-1">
      {PROTO_KEYS.map((k) => (
        <button key={k} onClick={() => onPick(k)} className={`rounded-md px-1.5 py-0.5 text-[9px] font-semibold ${k === sel ? (side === 'a' ? 'bg-brand-500/20 text-brand-200 ring-1 ring-brand-400/40' : 'bg-violet-500/20 text-violet-200 ring-1 ring-violet-400/40') : 'text-slate-400 hover:text-slate-200'}`}>
          {COMPARE_PROTOCOLS[k].name}
        </button>
      ))}
    </div>
  );
  return (
    <div>
      <p className="mb-2 text-[10px] text-slate-500">Pick two protocols to compare them side by side.</p>
      <div className="grid grid-cols-2 gap-2">
        <Col sel={a} onPick={setA} side="a" />
        <Col sel={b} onPick={setB} side="b" />
      </div>
      <div className="mt-2 overflow-hidden rounded-xl border border-slate-800">
        <div className="grid grid-cols-[0.9fr_1fr_1fr] bg-slate-900/70 text-[10px] font-bold">
          <span className="px-2 py-1.5 text-slate-500" />
          <span className="px-2 py-1.5 text-brand-300 light:text-brand-600">{pa.name}</span>
          <span className="px-2 py-1.5 text-violet-300 light:text-violet-600">{pb.name}</span>
        </div>
        {COMPARE_DIMS.map((d, i) => (
          <div key={d.id} className={`grid grid-cols-[0.9fr_1fr_1fr] text-[10px] ${i % 2 ? 'bg-slate-900/30' : ''}`}>
            <span className="px-2 py-1.5 font-medium text-slate-400">{d.label}</span>
            <span className="px-2 py-1.5 text-slate-300">{pa[d.id]}</span>
            <span className="px-2 py-1.5 text-slate-300">{pb[d.id]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** MQTT Topic Builder: assemble a hierarchical topic and see how wildcards match it. */
export function MqttTopicBuilder() {
  const [pick, setPick] = useState(() => Object.fromEntries(TOPIC_LEVELS.map((l) => [l.id, l.options[0]])));
  const topic = TOPIC_LEVELS.map((l) => pick[l.id]).join('/');
  const [subDepth, setSubDepth] = useState(3); // how many concrete levels a subscription keeps
  // Build a subscription: keep the first `subDepth` levels, then a wildcard.
  const kept = TOPIC_LEVELS.slice(0, subDepth).map((l) => pick[l.id]);
  const multi = subDepth >= TOPIC_LEVELS.length ? topic : [...kept, '#'].join('/');
  const single = subDepth >= TOPIC_LEVELS.length ? topic : [...TOPIC_LEVELS.slice(0, subDepth).map((l) => pick[l.id]), '+'].join('/');
  return (
    <div>
      <p className="mb-2 text-[10px] text-slate-500">Build a topic from its levels, then see which subscriptions catch it.</p>
      <div className="space-y-1.5">
        {TOPIC_LEVELS.map((l) => (
          <div key={l.id}>
            <span className="text-[9px] uppercase tracking-wider text-slate-500">{l.label}</span>
            <div className="mt-0.5 flex flex-wrap gap-1">
              {l.options.map((o) => (
                <button key={o} onClick={() => setPick((p) => ({ ...p, [l.id]: o }))} className={chip(pick[l.id] === o)}>{o}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className={`mt-2 p-3 ${panel3d}`}>
        <p className="text-[9px] uppercase tracking-wider text-slate-500">Published topic</p>
        <p className="mt-0.5 break-all font-mono text-[12px] font-bold text-brand-300">{topic}</p>
        <div className="mt-2">
          <span className="text-[9px] uppercase tracking-wider text-slate-500">Subscription depth: keep {subDepth} level{subDepth > 1 ? 's' : ''}</span>
          <input type="range" min={1} max={TOPIC_LEVELS.length} value={subDepth} onChange={(e) => setSubDepth(Number(e.target.value))} className="mt-1 w-full" style={{ accentColor: '#38bdf8' }} />
        </div>
        <div className="mt-1 space-y-1 text-[10px]">
          <p className="text-slate-400"><span className="font-mono text-emerald-300">{multi}</span> <span className="text-slate-500">— multi-level # catches this topic and everything below.</span></p>
          <p className="text-slate-400"><span className="font-mono text-amber-300">{single}</span> <span className="text-slate-500">— single-level + matches exactly one level in that slot.</span></p>
        </div>
      </div>
    </div>
  );
}

/** Latency Estimator: build up a one-way latency from link, hops, payload and QoS. */
export function LatencyEstimator() {
  const [linkId, setLinkId] = useState('wifi');
  const [hops, setHops] = useState(2);
  const [payload, setPayload] = useState(200);
  const [qos, setQos] = useState(1);
  const r = estimateLatency({ linkId, hops, payload, qos });
  const rows = [
    ['Link + hops', r.network],
    ['Serialise payload', r.serialise],
    ['QoS handshake', r.qosOverhead],
  ];
  return (
    <div>
      <p className="mb-2 text-[10px] text-slate-500">Estimate one-way message latency. Numbers are teaching estimates.</p>
      <span className="text-[9px] uppercase tracking-wider text-slate-500">Link</span>
      <div className="mt-0.5 flex flex-wrap gap-1">
        {LATENCY_LINKS.map((l) => (
          <button key={l.id} onClick={() => setLinkId(l.id)} className={chip(l.id === linkId)}>{l.name}</button>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]">
        <label>
          <span className="text-slate-400">Extra hops: <span className="tabular-nums text-slate-200">{hops}</span></span>
          <input type="range" min={0} max={6} value={hops} onChange={(e) => setHops(Number(e.target.value))} className="w-full" style={{ accentColor: '#38bdf8' }} />
        </label>
        <label>
          <span className="text-slate-400">Payload: <span className="tabular-nums text-slate-200">{payload} B</span></span>
          <input type="range" min={20} max={4000} step={20} value={payload} onChange={(e) => setPayload(Number(e.target.value))} className="w-full" style={{ accentColor: '#38bdf8' }} />
        </label>
      </div>
      <div className="mt-1">
        <span className="text-[9px] uppercase tracking-wider text-slate-500">MQTT QoS</span>
        <div className="mt-0.5 flex gap-1">
          {[0, 1, 2].map((q) => (
            <button key={q} onClick={() => setQos(q)} className={chip(q === qos)}>QoS {q}</button>
          ))}
        </div>
      </div>
      <div className={`mt-2 p-3 ${panel3d}`}>
        <div className="flex items-baseline justify-between">
          <span className="text-[10px] text-slate-400">Estimated latency</span>
          <span className="text-2xl font-bold tabular-nums text-brand-300">{r.total}<span className="ml-0.5 text-xs font-normal text-slate-500">ms</span></span>
        </div>
        <div className="mt-1.5 space-y-1">
          {rows.map(([label, v]) => (
            <div key={label} className="flex items-center gap-2">
              <span className="w-28 shrink-0 text-[10px] text-slate-500">{label}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
                <div className="h-full rounded-full bg-brand-400" style={{ width: `${Math.min(100, r.total ? (v / r.total) * 100 : 0)}%` }} />
              </div>
              <span className="w-10 shrink-0 text-right text-[10px] tabular-nums text-slate-300">{v}ms</span>
            </div>
          ))}
        </div>
        <p className="mt-1.5 text-[10px] text-slate-500">{r.link.note}</p>
      </div>
    </div>
  );
}

/** Communication Advisor: tick requirements and the best-fit protocol rises to the top. */
export function CommunicationAdvisor() {
  return <Recommender requirements={PROTO_REQUIREMENTS} candidates={PROTOCOLS} prompt="Tick what the application needs; the best-fit protocol rises to the top." />;
}

/** Engineering Challenge: choose the optimal protocol for the given plant. */
export function ProtocolChallenge() {
  const [pick, setPick] = useState(null);
  const correct = pick === COMM_CHALLENGE.answer;
  const phase = pick == null ? 'todo' : correct ? 'won' : 'fail';
  const message = pick == null ? 'Read the brief, then choose the protocol you would deploy.' : COMM_CHALLENGE.why[pick];
  return (
    <div>
      <div className="mb-2 rounded-lg border border-slate-700 bg-slate-900/60 p-2.5 text-[11px] leading-relaxed text-slate-300 light:border-slate-300 light:bg-slate-100 light:text-slate-600">{COMM_CHALLENGE.brief}</div>
      <div className="flex flex-wrap gap-1.5">
        {COMM_CHALLENGE.options.map((id) => (
          <button key={id} onClick={() => setPick(id)} className={chip(pick === id)}>{COMPARE_PROTOCOLS[id].name}</button>
        ))}
      </div>
      <div className="mt-2">
        <Challenge accent="brand" title="Pick the optimal protocol" goal="Choose the protocol best suited to this plant." phase={phase} message={message} />
      </div>
    </div>
  );
}
