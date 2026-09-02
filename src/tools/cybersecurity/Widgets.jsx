/**
 * Widgets.jsx (Cybersecurity)
 * ---------------------------
 * Interactive explainers: the Purdue model, IEC 62443 zones & conduits and
 * Security Levels, and real OT threats.
 */
import { useState } from 'react';
import { PURDUE, SECURITY_LEVELS, THREATS, ZONES } from './data';

const chip = (active) =>
  `rounded-lg border px-2.5 py-1.5 text-[10px] font-semibold transition-all duration-150 active:translate-y-px ${
    active
      ? 'border-teal-400/60 bg-teal-500/25 text-white shadow-[0_3px_12px_-2px_rgba(45,212,191,0.5)] ring-1 ring-teal-400/30 light:bg-teal-400 light:text-slate-900 light:border-teal-500'
      : 'border-slate-700/80 bg-gradient-to-b from-slate-700/50 to-slate-900/70 text-slate-300 shadow-[0_2px_6px_-1px_rgba(0,0,0,0.5)] hover:-translate-y-0.5 hover:border-slate-500 light:border-slate-300 light:from-slate-100 light:to-slate-200 light:text-slate-600'
  }`;

const panel3d = 'rounded-xl border border-white/10 bg-gradient-to-br from-slate-800/70 to-slate-950/85 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.8)] ring-1 ring-white/5 backdrop-blur-sm';

export function PurdueLevels() {
  const [sel, setSel] = useState('l1');
  const p = PURDUE.find((x) => x.id === sel) ?? PURDUE[0];
  return (
    <div>
      <p className="mb-2 text-[10px] text-slate-500">The Purdue model: layers from the field up to the enterprise.</p>
      <div className="flex flex-col gap-1">
        {PURDUE.map((x) => (
          <button key={x.id} onClick={() => setSel(x.id)}
            className={`rounded-lg border px-2.5 py-1.5 text-left text-[11px] font-semibold ${sel === x.id ? 'border-teal-400/60 bg-teal-500/25 text-white light:bg-teal-400 light:text-slate-900 light:border-teal-500' : 'border-slate-700/80 bg-slate-800/50 text-slate-300 hover:border-slate-500'}`}>
            {x.name}
          </button>
        ))}
      </div>
      <div className={`mt-2 p-3 ${panel3d}`}>
        <p className="text-xs font-bold text-slate-100">{p.name}</p>
        <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">{p.detail}</p>
      </div>
    </div>
  );
}

export function ZonesConduits() {
  const [sel, setSel] = useState('supervisory');
  const z = ZONES.find((x) => x.id === sel) ?? ZONES[0];
  return (
    <div>
      <p className="mb-2 text-[10px] text-slate-500">IEC 62443 groups assets into zones; conduits carry traffic between them.</p>
      <div className="flex flex-wrap gap-1.5">
        {ZONES.map((x) => (
          <button key={x.id} onClick={() => setSel(x.id)} className={chip(sel === x.id)}>{x.name}</button>
        ))}
      </div>
      <div className={`mt-2 p-3 ${panel3d}`}>
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-slate-100">{z.name}</p>
          <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[9px] font-semibold text-teal-300 light:bg-slate-200 light:text-teal-700">{z.level}</span>
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">A zone with common security requirements. Traffic to the next zone must pass through a controlled conduit, so a breach in one zone is contained rather than spreading.</p>
      </div>
    </div>
  );
}

export function SecurityLevels() {
  const [sel, setSel] = useState('sl2');
  const s = SECURITY_LEVELS.find((x) => x.id === sel) ?? SECURITY_LEVELS[0];
  return (
    <div>
      <p className="mb-2 text-[10px] text-slate-500">IEC 62443 Security Levels rate the attacker each control resists.</p>
      <div className="flex flex-wrap gap-1.5">
        {SECURITY_LEVELS.map((x) => (
          <button key={x.id} onClick={() => setSel(x.id)} className={chip(sel === x.id)}>{x.name}</button>
        ))}
      </div>
      <div className={`mt-2 p-3 ${panel3d}`}>
        <p className="text-xs font-bold text-slate-100">{s.name}</p>
        <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">{s.detail}</p>
      </div>
    </div>
  );
}

export function Threats() {
  const [sel, setSel] = useState(THREATS[0].id);
  const t = THREATS.find((x) => x.id === sel) ?? THREATS[0];
  return (
    <div>
      <p className="mb-2 text-[10px] text-slate-500">Real threats OT networks face.</p>
      <div className="flex flex-wrap gap-1.5">
        {THREATS.map((x) => (
          <button key={x.id} onClick={() => setSel(x.id)} className={chip(sel === x.id)}>{x.name}</button>
        ))}
      </div>
      <div className={`mt-2 p-3 ${panel3d}`}>
        <p className="text-xs font-bold text-slate-100">{t.name}</p>
        <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">{t.detail}</p>
      </div>
    </div>
  );
}
