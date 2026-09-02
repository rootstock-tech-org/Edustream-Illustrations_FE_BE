/**
 * Widgets.jsx (Edge AI)
 * ---------------------
 * Interactive widgets: Placement selector (drives the 3D pipeline), Hardware
 * explorer, Optimisation explorer and an Edge/Cloud/Hybrid recommender.
 */
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  PLACEMENTS,
  HARDWARE,
  OPTIMIZATIONS,
  RECO_REQUIREMENTS,
  RECO_CANDIDATES,
  MODELS,
  computeInference,
  TINYML_OPTS,
  EDGE_BUDGET_MB,
  shrinkModel,
  computeCost,
  FLOW_BY_PLACEMENT,
} from './data';

const chip = (active) =>
  `rounded-lg border px-2.5 py-1.5 text-[10px] font-semibold transition-all duration-150 active:translate-y-px ${
    active
      ? 'border-brand-400/60 bg-gradient-to-b from-brand-400/25 to-brand-600/15 text-brand-100 shadow-[0_3px_12px_-2px_rgba(6,182,212,0.55)] ring-1 ring-brand-400/30'
      : 'border-slate-700/80 bg-gradient-to-b from-slate-700/50 to-slate-900/70 text-slate-300 shadow-[0_2px_6px_-1px_rgba(0,0,0,0.5)] hover:-translate-y-0.5 hover:border-slate-500 light:border-slate-300 light:from-slate-100 light:to-slate-200 light:text-slate-600'
  }`;

const panel3d = 'rounded-xl border border-white/10 bg-gradient-to-br from-slate-800/70 to-slate-950/85 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.8)] ring-1 ring-white/5 backdrop-blur-sm';

// Controlled: choosing a placement moves where inference runs on the 3D model.
export function PlacementSelector({ placement, onPlacement }) {
  const sel = PLACEMENTS.find((p) => p.id === placement) ?? PLACEMENTS[0];
  return (
    <div>
      <p className="mb-2 text-[10px] text-slate-500">Where does the model run? It changes the live pipeline.</p>
      <div className="flex flex-wrap gap-1.5">
        {PLACEMENTS.map((p) => (
          <button key={p.id} onClick={() => onPlacement(p.id)} className={chip(p.id === placement)}>{p.name}</button>
        ))}
      </div>
      <div className={`mt-2 p-3 ${panel3d}`}>
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-slate-100">{sel.name}</p>
          <span className="rounded-full bg-brand-500/15 px-2 py-0.5 text-[9px] font-semibold text-brand-300">{sel.tag}</span>
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">{sel.detail}</p>
      </div>
    </div>
  );
}

export function HardwareExplorer() {
  const [sel, setSel] = useState(HARDWARE[0].id);
  const h = HARDWARE.find((x) => x.id === sel) ?? HARDWARE[0];
  return (
    <div>
      <p className="mb-2 text-[10px] text-slate-500">AI accelerators, on the edge and in the cloud.</p>
      <div className="flex flex-wrap gap-1.5">
        {HARDWARE.map((x) => (
          <button key={x.id} onClick={() => setSel(x.id)} className={chip(x.id === sel)}>{x.name}</button>
        ))}
      </div>
      <div className={`mt-2 p-3 ${panel3d}`}>
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-slate-100">{h.name}</p>
          <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ${h.where === 'edge' ? 'bg-violet-500/15 text-violet-300 light:bg-violet-100 light:text-violet-700' : 'bg-fuchsia-500/15 text-fuchsia-300 light:bg-fuchsia-100 light:text-fuchsia-700'}`}>{h.where === 'edge' ? 'Edge' : 'Cloud'}</span>
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">{h.detail}</p>
      </div>
    </div>
  );
}

export function OptimizeExplorer() {
  const [sel, setSel] = useState(OPTIMIZATIONS[0].id);
  const o = OPTIMIZATIONS.find((x) => x.id === sel) ?? OPTIMIZATIONS[0];
  return (
    <div>
      <p className="mb-2 text-[10px] text-slate-500">Shrink a model so it fits on the edge.</p>
      <div className="flex flex-wrap gap-1.5">
        {OPTIMIZATIONS.map((x) => (
          <button key={x.id} onClick={() => setSel(x.id)} className={chip(x.id === sel)}>{x.name}</button>
        ))}
      </div>
      <div className={`mt-2 p-3 ${panel3d}`}>
        <p className="text-xs font-bold text-slate-100">{o.name}</p>
        <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">{o.detail}</p>
      </div>
    </div>
  );
}

export function Recommender() {
  const [sel, setSel] = useState(() => new Set());
  const toggle = (id) =>
    setSel((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  const ranked = useMemo(() => {
    const chosen = [...sel];
    return RECO_CANDIDATES
      .map((c, i) => ({ c, i, score: chosen.filter((r) => c.fits.includes(r)).length }))
      .sort((a, b) => b.score - a.score || a.i - b.i);
  }, [sel]);
  const top = ranked[0]?.score ?? 0;
  return (
    <div>
      <p className="mb-2 text-[10px] text-slate-500">Pick what matters, the best placement rises to the top.</p>
      <div className="flex flex-wrap gap-1.5">
        {RECO_REQUIREMENTS.map((r) => (
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

const PLACEMENT_HUE = { edge: '#a78bfa', cloud: '#f472b6', hybrid: '#22d3ee' };

/** Edge vs Cloud Calculator: compare live latency of all three placements. */
export function EdgeCloudCalculator() {
  const [modelId, setModelId] = useState('base');
  const [network, setNetwork] = useState(6);
  const rows = ['edge', 'cloud', 'hybrid'].map((p) => ({ p, r: computeInference({ placement: p, modelId, network, fps: 15 }) }));
  const maxLat = Math.max(...rows.map((x) => x.r.latency), 1);
  return (
    <div>
      <p className="mb-2 text-[10px] text-slate-500">Compare where the model runs. Bars are live latency.</p>
      <div className="flex flex-wrap gap-1.5">
        {MODELS.map((m) => (
          <button key={m.id} onClick={() => setModelId(m.id)} className={chip(m.id === modelId)}>{m.name}</button>
        ))}
      </div>
      <label className="mt-2 block">
        <span className="flex justify-between text-[10px] text-slate-400"><span>Network quality</span><span className="tabular-nums text-slate-200">{network}/10</span></span>
        <input type="range" min="1" max="10" value={network} onChange={(e) => setNetwork(Number(e.target.value))} className="w-full" style={{ accentColor: '#38bdf8' }} />
      </label>
      <div className="mt-2 space-y-2">
        {rows.map(({ p, r }) => (
          <div key={p} className={`p-2.5 ${panel3d}`}>
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-bold capitalize text-slate-100">{p}</span>
              <span className="tabular-nums text-slate-300">{r.latency} ms · {r.accuracy}% acc · {r.privacy} privacy</span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-800">
              <motion.div className="h-full rounded-full" style={{ backgroundColor: PLACEMENT_HUE[p] }} animate={{ width: `${(r.latency / maxLat) * 100}%` }} transition={{ duration: 0.5, ease: 'easeOut' }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** TinyML Advisor: stack optimisations and watch the model shrink under the edge budget. */
export function TinyMlAdvisor() {
  const [modelId, setModelId] = useState('large');
  const [opts, setOpts] = useState(() => new Set(['quant']));
  const base = MODELS.find((m) => m.id === modelId) ?? MODELS[0];
  const res = shrinkModel(base.sizeMB, base.accuracy, [...opts]);
  const toggle = (id) => setOpts((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const pct = Math.min(100, (res.mb / base.sizeMB) * 100);
  const budgetPct = Math.min(100, (EDGE_BUDGET_MB / base.sizeMB) * 100);
  return (
    <div>
      <p className="mb-2 text-[10px] text-slate-500">Shrink a model to fit a Coral / Jetson edge budget ({EDGE_BUDGET_MB} MB).</p>
      <div className="flex flex-wrap gap-1.5">
        {MODELS.map((m) => (
          <button key={m.id} onClick={() => setModelId(m.id)} className={chip(m.id === modelId)}>{m.name}</button>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {TINYML_OPTS.map((o) => (
          <button key={o.id} onClick={() => toggle(o.id)} className={chip(opts.has(o.id))}>{o.name}</button>
        ))}
      </div>
      <div className={`mt-2 p-3 ${panel3d}`}>
        <div className="flex items-baseline justify-between">
          <span className="text-[10px] text-slate-400">Model size</span>
          <span className="text-lg font-bold tabular-nums text-brand-300">{res.mb < 1 ? res.mb.toFixed(2) : res.mb.toFixed(1)}<span className="ml-0.5 text-[10px] font-normal text-slate-500">MB</span></span>
        </div>
        <div className="relative mt-1 h-3 overflow-hidden rounded-full bg-slate-800">
          <motion.div className={`h-full rounded-full ${res.fits ? 'bg-emerald-400' : 'bg-rose-400'}`} animate={{ width: `${pct}%` }} transition={{ duration: 0.5, ease: 'easeOut' }} />
          <div className="absolute inset-y-0 w-px bg-amber-300" style={{ left: `${budgetPct}%` }} title="Edge budget" />
        </div>
        <div className="mt-2 flex items-center justify-between text-[10px]">
          <span className={`rounded-full px-2 py-0.5 font-semibold ${res.fits ? 'bg-emerald-500/15 text-emerald-300 light:bg-emerald-100 light:text-emerald-700' : 'bg-rose-500/15 text-rose-300 light:bg-rose-100 light:text-rose-700'}`}>{res.fits ? 'Fits on edge' : 'Still too big'}</span>
          <span className="tabular-nums text-slate-400">{base.sizeMB} MB → {res.mb < 1 ? res.mb.toFixed(2) : res.mb.toFixed(1)} MB · {res.acc}% acc</span>
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-slate-500">{[...opts].map((id) => TINYML_OPTS.find((o) => o.id === id)?.note).filter(Boolean).join(' ') || 'Toggle optimisations to shrink the model.'}</p>
      </div>
    </div>
  );
}

/** Data Flow Explorer: animate what actually travels the link for each placement. */
export function DataFlowExplorer() {
  const [placement, setPlacement] = useState('cloud');
  const f = FLOW_BY_PLACEMENT[placement];
  const dotSize = Math.max(6, Math.min(20, 5 + Math.sqrt(f.kb) * 1.1));
  const nodes = ['Camera', 'Edge', 'Cloud'];
  return (
    <div>
      <p className="mb-2 text-[10px] text-slate-500">Watch what leaves the device on the link.</p>
      <div className="flex flex-wrap gap-1.5">
        {PLACEMENTS.map((p) => (
          <button key={p.id} onClick={() => setPlacement(p.id)} className={chip(p.id === placement)}>{p.name}</button>
        ))}
      </div>
      <div className={`mt-2 p-3 ${panel3d}`}>
        <div className="relative flex items-center justify-between">
          {nodes.map((n) => (
            <div key={n} className="z-10 flex flex-col items-center gap-1">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-600 bg-slate-800 text-[8px] font-bold text-slate-300">{n[0]}</div>
              <span className="text-[8px] text-slate-500">{n}</span>
            </div>
          ))}
          {/* Animated packets travelling the link */}
          <div className="pointer-events-none absolute left-4 right-4 top-4 h-0 -translate-y-1/2">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={`${placement}-${i}`}
                className="absolute top-0 rounded-full"
                style={{ width: dotSize, height: dotSize, backgroundColor: f.hue, boxShadow: `0 0 10px ${f.hue}`, marginTop: -dotSize / 2 }}
                initial={{ left: '0%', opacity: 0 }}
                animate={{ left: placement === 'edge' ? ['0%', '50%'] : ['0%', '100%'], opacity: [0, 1, 1, 0] }}
                transition={{ duration: placement === 'edge' ? 1.4 : 2.4, repeat: Infinity, delay: i * 0.7, ease: 'linear' }}
              />
            ))}
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between rounded-lg border border-slate-700/60 bg-slate-900/50 px-2.5 py-1.5">
          <span className="text-[10px] text-slate-400">On the wire</span>
          <span className="text-[11px] font-bold" style={{ color: f.hue }}>{f.size} · {f.kb} KB/frame</span>
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">{f.leaves}</p>
      </div>
    </div>
  );
}

/** Cost Calculator: monthly cost of a fleet for each placement (illustrative). */
export function CostCalculator() {
  const [placement, setPlacement] = useState('cloud');
  const [devices, setDevices] = useState(20);
  const [fps, setFps] = useState(5);
  const c = computeCost({ placement, devices, fps });
  const maxItem = Math.max(...c.items.map((i) => i.amount), 1);
  return (
    <div>
      <p className="mb-2 text-[10px] text-slate-500">Estimate the monthly cost of the fleet (illustrative).</p>
      <div className="flex flex-wrap gap-1.5">
        {PLACEMENTS.map((p) => (
          <button key={p.id} onClick={() => setPlacement(p.id)} className={chip(p.id === placement)}>{p.name}</button>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]">
        <label>
          <span className="text-slate-400">Devices: <span className="tabular-nums text-slate-200">{devices}</span></span>
          <input type="range" min="1" max="200" value={devices} onChange={(e) => setDevices(Number(e.target.value))} className="w-full" style={{ accentColor: '#38bdf8' }} />
        </label>
        <label>
          <span className="text-slate-400">FPS each: <span className="tabular-nums text-slate-200">{fps}</span></span>
          <input type="range" min="1" max="30" value={fps} onChange={(e) => setFps(Number(e.target.value))} className="w-full" style={{ accentColor: '#38bdf8' }} />
        </label>
      </div>
      <div className={`mt-2 p-3 ${panel3d}`}>
        <div className="flex items-baseline justify-between">
          <span className="text-[10px] text-slate-400">Estimated / month</span>
          <motion.span key={c.total} initial={{ scale: 0.9, opacity: 0.6 }} animate={{ scale: 1, opacity: 1 }} className="text-2xl font-bold tabular-nums text-brand-300">${c.total.toLocaleString()}</motion.span>
        </div>
        <div className="mt-2 space-y-1.5">
          {c.items.map((it) => (
            <div key={it.label} className="flex items-center gap-2">
              <span className="w-28 shrink-0 text-[10px] text-slate-500">{it.label}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
                <motion.div className="h-full rounded-full bg-brand-400" animate={{ width: `${(it.amount / maxItem) * 100}%` }} transition={{ duration: 0.5, ease: 'easeOut' }} />
              </div>
              <span className="w-12 shrink-0 text-right text-[10px] tabular-nums text-slate-300">${it.amount.toLocaleString()}</span>
            </div>
          ))}
        </div>
        <p className="mt-1.5 text-[10px] text-slate-500">{(c.inferPerMo / 1e6).toFixed(1)}M inferences/month. Cloud scales with usage; edge is mostly fixed hardware.</p>
      </div>
    </div>
  );
}
