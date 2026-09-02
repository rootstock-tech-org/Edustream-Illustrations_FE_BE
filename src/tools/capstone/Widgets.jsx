/**
 * Widgets.jsx (Capstone)
 * ----------------------
 * Explainers: the Industry 4.0 pillars, the maturity ladder and design tips.
 */
import { useState } from 'react';
import { PILLARS_INFO, TIPS, MATURITY, maturityFor } from './data';

const chip = (active) =>
  `rounded-lg border px-2.5 py-1.5 text-[10px] font-semibold transition-all duration-150 active:translate-y-px ${
    active
      ? 'border-cyan-400/60 bg-cyan-500/25 text-white shadow-[0_3px_12px_-2px_rgba(34,211,238,0.5)] ring-1 ring-cyan-400/30 light:bg-cyan-400 light:text-slate-900 light:border-cyan-500'
      : 'border-slate-700/80 bg-gradient-to-b from-slate-700/50 to-slate-900/70 text-slate-300 shadow-[0_2px_6px_-1px_rgba(0,0,0,0.5)] hover:-translate-y-0.5 hover:border-slate-500 light:border-slate-300 light:from-slate-100 light:to-slate-200 light:text-slate-600'
  }`;

const panel3d = 'rounded-xl border border-white/10 bg-gradient-to-br from-slate-800/70 to-slate-950/85 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.8)] ring-1 ring-white/5 backdrop-blur-sm';

function Explorer({ items, prompt }) {
  const [sel, setSel] = useState(items[0].id);
  const it = items.find((x) => x.id === sel) ?? items[0];
  return (
    <div>
      <p className="mb-2 text-[10px] text-slate-500">{prompt}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((x) => (
          <button key={x.id} onClick={() => setSel(x.id)} className={chip(x.id === sel)}>{x.name}</button>
        ))}
      </div>
      <div className={`mt-2 p-3 ${panel3d}`}>
        <p className="text-xs font-bold text-slate-100">{it.name}</p>
        <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">{it.detail}</p>
      </div>
    </div>
  );
}

export function PillarsRecap() {
  return <Explorer items={PILLARS_INFO} prompt="The Industry 4.0 pillars this course covered." />;
}
export function DesignTips() {
  return <Explorer items={TIPS} prompt="Rules of thumb for building a smart factory." />;
}

export function MaturityLadder({ score }) {
  const current = maturityFor(score).name;
  return (
    <div>
      <p className="mb-2 text-[10px] text-slate-500">Your factory climbs this ladder as you add pillars.</p>
      <div className="space-y-1.5">
        {[...MATURITY].reverse().map((m) => (
          <div key={m.name} className={`rounded-lg border p-2.5 ${m.name === current ? 'border-cyan-400/50 bg-cyan-500/10 ring-1 ring-cyan-400/20' : 'border-slate-700/70 bg-slate-800/40'}`}>
            <div className="flex items-center justify-between">
              <span className={`text-xs font-bold ${m.name === current ? 'text-cyan-300 light:text-cyan-700' : 'text-slate-200'}`}>{m.name}{m.name === current && <span className="ml-1 text-[9px] font-normal text-slate-400">· you</span>}</span>
              <span className="text-[9px] tabular-nums text-slate-500">{m.min}%+</span>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{m.detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
