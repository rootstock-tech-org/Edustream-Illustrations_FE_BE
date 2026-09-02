/**
 * Widgets.jsx (Predictive Maintenance)
 * ------------------------------------
 * Interactive widgets: the maintenance strategy ladder, a LIVE P-F curve that
 * marks the machine's current health, the condition-monitoring techniques and
 * the health bands.
 */
import { useState } from 'react';
import { STRATEGIES, TECHNIQUES, HEALTH_BANDS, PF, bandFor } from './data';

const chip = (active) =>
  `rounded-lg border px-2.5 py-1.5 text-[10px] font-semibold transition-all duration-150 active:translate-y-px ${
    active
      ? 'border-rose-400/60 bg-rose-500/25 text-white shadow-[0_3px_12px_-2px_rgba(251,113,133,0.5)] ring-1 ring-rose-400/30 light:bg-rose-400 light:text-slate-900 light:border-rose-500'
      : 'border-slate-700/80 bg-gradient-to-b from-slate-700/50 to-slate-900/70 text-slate-300 shadow-[0_2px_6px_-1px_rgba(0,0,0,0.5)] hover:-translate-y-0.5 hover:border-slate-500 light:border-slate-300 light:from-slate-100 light:to-slate-200 light:text-slate-600'
  }`;

const panel3d = 'rounded-xl border border-white/10 bg-gradient-to-br from-slate-800/70 to-slate-950/85 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.8)] ring-1 ring-white/5 backdrop-blur-sm';

export function StrategyExplorer() {
  const [sel, setSel] = useState('predictive');
  const s = STRATEGIES.find((x) => x.id === sel) ?? STRATEGIES[0];
  return (
    <div>
      <p className="mb-2 text-[10px] text-slate-500">The maintenance strategy ladder, cheapest to smartest.</p>
      <div className="flex flex-wrap gap-1.5">
        {STRATEGIES.map((x) => (
          <button key={x.id} onClick={() => setSel(x.id)} className={chip(x.id === sel)}>{x.name}</button>
        ))}
      </div>
      <div className={`mt-2 p-3 ${panel3d}`}>
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-slate-100">{s.name}</p>
          <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[9px] font-semibold text-rose-300 light:bg-slate-200 light:text-rose-700">{s.tag}</span>
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">{s.detail}</p>
      </div>
    </div>
  );
}

// Live P-F curve: condition falls over time; a dot marks the current health.
export function PFCurve({ health }) {
  const W = 240;
  const H = 120;
  const curveH = (x) => 100 - 90 * Math.pow(x, 1.8); // health as a function of normalised time
  const xFor = (h) => Math.max(0, Math.min(1, Math.pow((100 - h) / 90, 1 / 1.8)));
  const yOf = (h) => (1 - h / 100) * H;
  const pts = Array.from({ length: 41 }, (_, i) => {
    const x = i / 40;
    return `${(x * W).toFixed(1)} ${yOf(curveH(x)).toFixed(1)}`;
  });
  const path = `M ${pts.join(' L ')}`;
  const dotX = xFor(health) * W;
  const dotY = yOf(health);
  const band = bandFor(health);
  return (
    <div>
      <p className="mb-2 text-[10px] text-slate-500">The P-F curve. The dot is the machine right now.</p>
      <div className={`p-3 ${panel3d}`}>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
          {/* P and F guide lines */}
          <line x1="0" y1={yOf(PF.P.at)} x2={W} y2={yOf(PF.P.at)} stroke="#fbbf24" strokeWidth="1" strokeDasharray="4 3" opacity="0.7" />
          <line x1="0" y1={yOf(PF.F.at)} x2={W} y2={yOf(PF.F.at)} stroke="#fb7185" strokeWidth="1" strokeDasharray="4 3" opacity="0.7" />
          <text x="3" y={yOf(PF.P.at) - 3} fill="#fbbf24" fontSize="8">P · detectable</text>
          <text x="3" y={yOf(PF.F.at) - 3} fill="#fb7185" fontSize="8">F · failure</text>
          {/* Degradation curve */}
          <path d={path} fill="none" stroke="#94a3b8" strokeWidth="1.6" />
          {/* Live position */}
          <circle cx={dotX} cy={dotY} r="5" fill={band.color} stroke="#0a0e14" strokeWidth="1" />
        </svg>
      </div>
      <p className="mt-2 text-[10px] leading-relaxed text-slate-500">{PF.interval}</p>
    </div>
  );
}

export function TechniqueExplorer() {
  const [sel, setSel] = useState(TECHNIQUES[0].id);
  const t = TECHNIQUES.find((x) => x.id === sel) ?? TECHNIQUES[0];
  return (
    <div>
      <p className="mb-2 text-[10px] text-slate-500">How condition is measured without stopping the machine.</p>
      <div className="flex flex-wrap gap-1.5">
        {TECHNIQUES.map((x) => (
          <button key={x.id} onClick={() => setSel(x.id)} className={chip(x.id === sel)}>{x.name}</button>
        ))}
      </div>
      <div className={`mt-2 p-3 ${panel3d}`}>
        <p className="text-xs font-bold text-slate-100">{t.name}</p>
        <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">{t.detail}</p>
      </div>
    </div>
  );
}

// Reflects the model: the current health band is highlighted.
export function HealthBands({ health }) {
  const current = bandFor(health).id;
  return (
    <div>
      <p className="mb-2 text-[10px] text-slate-500">Condition bands and what each one means to do.</p>
      <div className="space-y-1.5">
        {HEALTH_BANDS.map((b) => (
          <div key={b.id} className={`rounded-lg border p-2.5 ${b.id === current ? 'border-white/30 bg-slate-800/70 ring-1 ring-white/10' : 'border-slate-700/70 bg-slate-800/40'}`}>
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold" style={{ color: b.color }}>
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: b.color }} /> {b.name}
                {b.id === current && <span className="text-[9px] font-normal text-slate-400">· now</span>}
              </span>
              <span className="text-[9px] tabular-nums text-slate-500">{b.min}%+</span>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{b.action}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
