/**
 * Widgets.jsx (Foundations)
 * -------------------------
 * The module's four interactive widgets, real tools, not static boxes:
 * Industry Evolution Timeline, RAMI Explorer, ISA-95 Pyramid, IoT vs IIoT
 * Comparator. Each is click-driven.
 */
import { useState } from 'react';
import { IOT_ARCH_LAYERS, INDUSTRY_STAGES, RAMI_AXES, ISA95_LEVELS, IOT_COMPARISON } from './data';

const panel3d = 'rounded-xl border border-white/10 bg-gradient-to-br from-slate-800/70 to-slate-950/85 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.8)] ring-1 ring-white/5';
const slab = (active) =>
  `transition-all duration-150 active:translate-y-px ${
    active
      ? 'border-brand-400/60 bg-gradient-to-b from-brand-400/25 to-brand-600/15 text-brand-50 shadow-[0_5px_18px_-4px_rgba(6,182,212,0.6)] ring-1 ring-brand-400/30 -translate-y-0.5'
      : 'border-slate-700/80 bg-gradient-to-b from-slate-700/50 to-slate-900/70 text-slate-300 shadow-[0_3px_8px_-2px_rgba(0,0,0,0.6)] hover:-translate-y-0.5 hover:border-slate-500'
  }`;

/** Controlled selector: clicking a layer highlights it on the 3D architecture stack. */
export function ArchLayerSelector({ selectedId, onSelect }) {
  return (
    <div>
      <p className="text-[11px] text-slate-400">Pick a layer to light it up on the 3D stack.</p>
      <div className="mt-2 flex flex-col-reverse gap-1.5">
        {IOT_ARCH_LAYERS.map((l) => (
          <button key={l.id} onClick={() => onSelect(l.id)}
            className={`flex items-center justify-between rounded-lg border px-2.5 py-2 text-left ${slab(l.id === selectedId)}`}>
            <span className="text-[11px] font-semibold">{l.name}</span>
            <span className="text-[9px] text-slate-500">{l.short}</span>
          </button>
        ))}
      </div>
      <p className="mt-2 text-[10px] text-slate-500">The selected layer scales up in the scene and its details show on the right. Clicking a slab in the 3D view keeps this list in sync.</p>
    </div>
  );
}

export function IndustryTimeline() {
  const [sel, setSel] = useState(INDUSTRY_STAGES.length - 1);
  const s = INDUSTRY_STAGES[sel];
  return (
    <div>
      <div className="relative mb-4">
        <div className="absolute left-0 right-0 top-2.5 h-0.5 bg-slate-700" />
        <div className="relative flex justify-between">
          {INDUSTRY_STAGES.map((st, i) => (
            <button key={st.id} onClick={() => setSel(i)} className="flex flex-1 flex-col items-center gap-1">
              <span className={`h-5 w-5 rounded-full border-2 transition-all duration-150 ${i === sel ? 'border-brand-300 bg-brand-400 shadow-[0_0_12px_2px_rgba(6,182,212,0.7)] scale-110' : 'border-slate-600 bg-slate-900 hover:border-slate-400'}`} />
              <span className={`text-[9px] font-semibold ${i === sel ? 'text-brand-400' : 'text-slate-500'}`}>{st.label.replace('Industry ', '')}</span>
            </button>
          ))}
        </div>
      </div>
      <div className={`p-3 ${panel3d}`}>
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-bold text-slate-100">{s.title}</span>
          <span className="text-[10px] text-slate-500">{s.year}</span>
        </div>
        <p className="text-[11px] text-brand-400">{s.driver}</p>
        <p className="mt-1 text-[11px] text-slate-400">{s.description}</p>
      </div>
    </div>
  );
}

export function RamiExplorer() {
  const [axisId, setAxisId] = useState(RAMI_AXES[0].id);
  const axis = RAMI_AXES.find((a) => a.id === axisId);
  const [itemId, setItemId] = useState(RAMI_AXES[0].items[0].id);
  const item = axis.items.find((i) => i.id === itemId) ?? axis.items[0];
  const selAxis = (id) => {
    const a = RAMI_AXES.find((x) => x.id === id);
    setAxisId(id);
    setItemId(a.items[0].id);
  };
  return (
    <div>
      <div className="flex flex-wrap gap-1">
        {RAMI_AXES.map((a) => (
          <button key={a.id} onClick={() => selAxis(a.id)} className={`rounded-md px-2 py-1 text-[10px] font-semibold ${a.id === axisId ? 'bg-brand-500/15 text-brand-300 ring-1 ring-brand-500/40' : 'text-slate-400 hover:bg-slate-800'}`}>
            {a.name}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[10px] text-slate-500">{axis.caption}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {axis.items.map((it) => (
          <button key={it.id} onClick={() => setItemId(it.id)} className={`rounded-lg border px-2 py-1 text-[10px] ${slab(it.id === item.id)}`}>
            {it.name}
          </button>
        ))}
      </div>
      <div className={`mt-2 p-3 ${panel3d}`}>
        <p className="text-xs font-bold text-slate-100">{item.name}</p>
        <p className="mt-1 text-[11px] text-slate-400">{item.detail}</p>
      </div>
    </div>
  );
}

export function Isa95Pyramid() {
  const [level, setLevel] = useState(3);
  const sel = ISA95_LEVELS.find((l) => l.level === level);
  const widths = ['56%', '68%', '80%', '92%', '100%'];
  return (
    <div>
      <div className="flex flex-col items-center gap-1.5">
        {ISA95_LEVELS.map((l, i) => (
          <button key={l.level} onClick={() => setLevel(l.level)} style={{ width: widths[i] }}
            className={`flex items-center justify-between rounded-lg border px-2.5 py-2 ${slab(l.level === level)}`}>
            <span className="text-[10px] font-semibold">L{l.level} · {l.system}</span>
            <span className="text-[9px] text-slate-500">{l.timescale}</span>
          </button>
        ))}
      </div>
      <div className={`mt-3 p-3 ${panel3d}`}>
        <p className="text-xs font-bold text-slate-100">Level {sel.level} · {sel.name}</p>
        <p className="mt-1 text-[11px] text-slate-400">{sel.detail}</p>
      </div>
    </div>
  );
}

export function IoTComparator() {
  const [focus, setFocus] = useState(null);
  const toggle = (s) => setFocus((c) => (c === s ? null : s));
  return (
    <div>
      <div className="grid grid-cols-[1fr_1fr_1fr] gap-1">
        <span />
        {[['iot', 'Consumer IoT'], ['iiot', 'Industrial IoT']].map(([k, label]) => (
          <button key={k} onClick={() => toggle(k)}
            className={`rounded-md border px-2 py-1 text-[10px] font-semibold ${focus === k ? (k === 'iiot' ? 'border-brand-500/50 bg-brand-500/15 text-brand-200' : 'border-slate-500/50 bg-slate-600/20 text-slate-100') : 'border-slate-700 bg-slate-800/50 text-slate-300'} ${focus && focus !== k ? 'opacity-50' : ''}`}>
            {label}
          </button>
        ))}
      </div>
      <div className="mt-1.5 divide-y divide-slate-800 rounded-lg border border-slate-800">
        {IOT_COMPARISON.map((r) => (
          <div key={r.dimension} className="grid grid-cols-[1fr_1fr_1fr] gap-1 px-2 py-1.5 text-[10px]">
            <span className="text-slate-400">{r.dimension}</span>
            <span className={`text-slate-300 ${focus === 'iiot' ? 'opacity-40' : ''}`}>{r.iot}</span>
            <span className={`${focus === 'iiot' ? 'font-medium text-brand-200' : 'text-slate-300'} ${focus === 'iot' ? 'opacity-40' : ''}`}>{r.iiot}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
