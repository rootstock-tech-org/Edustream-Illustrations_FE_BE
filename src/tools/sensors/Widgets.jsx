/**
 * Widgets.jsx (Sensors)
 * ---------------------
 * The module's four real interactive widgets: Sensor Selector, Embedded Board
 * Selector, Protocol Selector and Signal Visualizer.
 */
import { useMemo, useState } from 'react';
import {
  SENSOR_TYPES,
  MACHINE_SENSORS,
  VIBRATION_ZONES,
  INSULATION_CLASSES,
  BOARD_REQUIREMENTS,
  EMBEDDED_BOARDS,
  PROTOCOL_REQUIREMENTS,
  WIRING_PROTOCOLS,
} from './data';

const chip = (active) =>
  `rounded-lg border px-2.5 py-1.5 text-[10px] font-semibold transition-all duration-150 active:translate-y-px ${
    active
      ? 'border-emerald-400/60 bg-gradient-to-b from-emerald-400/25 to-emerald-600/15 text-emerald-100 shadow-[0_3px_12px_-2px_rgba(16,185,129,0.55)] ring-1 ring-emerald-400/30'
      : 'border-slate-700/80 bg-gradient-to-b from-slate-700/50 to-slate-900/70 text-slate-300 shadow-[0_2px_6px_-1px_rgba(0,0,0,0.5)] hover:-translate-y-0.5 hover:border-slate-500 hover:from-slate-600/60'
  }`;

const panel3d = 'rounded-xl border border-white/10 bg-gradient-to-br from-slate-800/70 to-slate-950/85 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.8)] ring-1 ring-white/5 backdrop-blur-sm';

const toneClasses = {
  ok: 'border-emerald-500/50 bg-emerald-500/15 text-emerald-200 light:border-emerald-400 light:bg-emerald-100 light:text-emerald-800',
  warn: 'border-amber-500/50 bg-amber-500/15 text-amber-200 light:border-amber-400 light:bg-amber-100 light:text-amber-800',
  bad: 'border-rose-500/50 bg-rose-500/15 text-rose-200 light:border-rose-400 light:bg-rose-100 light:text-rose-800',
};

// A live, standards-based badge that reflects the machine's current reading.
function LiveStandard({ metricKey, reading }) {
  if (reading == null) return null;
  if (metricKey === 'vib') {
    const zone = VIBRATION_ZONES.find((z) => reading <= z.upto) ?? VIBRATION_ZONES[VIBRATION_ZONES.length - 1];
    return (
      <div className={`mt-2 rounded-lg border px-2.5 py-2 ${toneClasses[zone.tone]}`}>
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold">ISO 10816 · Zone {zone.zone}: {zone.label}</span>
          <span className="tabular-nums text-[11px] font-semibold">{reading.toFixed(1)} mm/s</span>
        </div>
        <p className="mt-0.5 text-[10px] opacity-90">{zone.note}</p>
      </div>
    );
  }
  if (metricKey === 'temp') {
    const cls = INSULATION_CLASSES.find((c) => reading <= c.max) ?? INSULATION_CLASSES[INSULATION_CLASSES.length - 1];
    const over = reading > INSULATION_CLASSES[INSULATION_CLASSES.length - 1].max;
    const tone = over ? 'bad' : reading > 130 ? 'warn' : 'ok';
    return (
      <div className={`mt-2 rounded-lg border px-2.5 py-2 ${toneClasses[tone]}`}>
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold">Insulation head-room</span>
          <span className="tabular-nums text-[11px] font-semibold">{reading.toFixed(0)}°C</span>
        </div>
          <p className="mt-0.5 text-[10px] opacity-90">{over ? 'Above the Class H 180°C limit, winding damage risk.' : `Within Class ${cls.cls} limit (${cls.max}°C). IEC 60034.`}</p>
      </div>
    );
  }
  return null;
}

// Controlled by the tool: picking a sensor highlights it on the 3D machine.
export function SensorSelector({ selectedId, onSelect, reading, metricKey }) {
  const sel = MACHINE_SENSORS.find((s) => s.id === selectedId) ?? MACHINE_SENSORS[0];
  const type = SENSOR_TYPES.find((t) => t.id === sel.quantity.toLowerCase());
  return (
    <div>
      <p className="mb-2 text-[10px] text-slate-500">Pick a sensor; it highlights on the machine and reads it live.</p>
      <div className="flex flex-wrap gap-1.5">
        {MACHINE_SENSORS.map((s) => (
          <button key={s.id} onClick={() => onSelect(s.id)} className={chip(s.id === selectedId)}>{s.quantity}</button>
        ))}
      </div>
      <div className={`mt-2 p-3 ${panel3d}`}>
        <p className="text-xs font-bold text-slate-100">{sel.label}</p>
        <p className="text-[11px] text-emerald-300">Sensor: {sel.sensor}</p>
        <p className="mt-1 text-[11px] text-slate-400">{sel.why}</p>
        <LiveStandard metricKey={metricKey} reading={reading} />
        {sel.spec && <p className="mt-2 rounded-md border border-slate-800 bg-slate-950/50 px-2 py-1.5 text-[10px] leading-relaxed text-slate-300"><span className="font-semibold text-slate-200">Spec:</span> {sel.spec}</p>}
        {type && <p className="mt-2 border-t border-slate-800 pt-2 text-[10px] text-slate-500">{type.detail}</p>}
      </div>
    </div>
  );
}

function Recommender({ requirements, candidates, prompt }) {
  const [sel, setSel] = useState(() => new Set());
  const toggle = (id) =>
    setSel((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
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
            <div key={c.id} className={`rounded-xl border p-2.5 transition-all duration-150 ${isTop ? 'border-emerald-400/50 bg-gradient-to-br from-emerald-500/20 to-emerald-700/10 shadow-[0_6px_20px_-6px_rgba(16,185,129,0.55)] ring-1 ring-emerald-400/25' : 'border-white/10 bg-gradient-to-br from-slate-800/60 to-slate-950/70 shadow-[0_4px_14px_-6px_rgba(0,0,0,0.7)]'}`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-100">{c.name}{isTop && <span className="ml-1 text-[10px] text-emerald-400">· best fit</span>}</span>
                {sel.size > 0 && <span className="text-[10px] tabular-nums text-slate-400">{score}/{sel.size}</span>}
              </div>
              <p className="mt-0.5 text-[10px] text-slate-400">{c.note}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function BoardSelector() {
  return <Recommender requirements={BOARD_REQUIREMENTS} candidates={EMBEDDED_BOARDS} prompt="Select what you need, and the best board rises to the top." />;
}

export function ProtocolSelector() {
  return <Recommender requirements={PROTOCOL_REQUIREMENTS} candidates={WIRING_PROTOCOLS} prompt="Select your wiring needs, and the best protocol rises to the top." />;
}

const W = 220;
const H = 90;
const MID = H / 2;
const AMP = 34;
const jitter = (i) => {
  const s = Math.sin(i * 12.9898) * 43758.5453;
  return s - Math.floor(s) - 0.5;
};

  // Signal frequency follows the live machine RPM: spin faster and the vibration
// signal gets faster, so a fixed sample rate can start to alias.
export function SignalVisualizer({ rpm = 1200 }) {
  const [samples, setSamples] = useState(20);
  const [noise, setNoise] = useState(false);
  const freq = Math.max(1, Math.min(8, Math.round(rpm / 200)));

  const { truePath, dots, aliasing } = useMemo(() => {
    let tp = '';
    for (let i = 0; i <= 200; i++) {
      const t = i / 200;
      const x = t * W;
      const y = MID - AMP * Math.sin(2 * Math.PI * freq * t);
      tp += `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)} `;
    }
    const pts = [];
    for (let i = 0; i < samples; i++) {
      const t = i / (samples - 1);
      const n = noise ? jitter(i) * 0.35 : 0;
      pts.push({ x: t * W, y: MID - AMP * (Math.sin(2 * Math.PI * freq * t) + n) });
    }
    return { truePath: tp, dots: pts, aliasing: samples / freq < 2 };
  }, [freq, samples, noise]);

  return (
    <div>
      <p className="mb-2 text-[10px] text-slate-500">Signal frequency follows machine RPM ({rpm} rpm → {freq} cycles). Change Speed on the left.</p>
      <svg viewBox={`0 0 ${W} ${H}`} className={`w-full ${panel3d}`}>
        <defs>
          <linearGradient id="sigFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#34d399" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
          </linearGradient>
          <filter id="sigGlow" x="-20%" y="-40%" width="140%" height="180%">
            <feGaussianBlur stdDeviation="2" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <line x1="0" y1={MID} x2={W} y2={MID} stroke="#1e293b" strokeWidth="1" />
        <path d={`${truePath} L ${W} ${H} L 0 ${H} Z`} fill="url(#sigFill)" stroke="none" />
        <path d={truePath} fill="none" stroke="#34d399" strokeWidth="1.8" filter="url(#sigGlow)" />
        {dots.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="2.6" fill="#67e8f9" stroke="#0a0e14" strokeWidth="0.6" />)}
      </svg>
      <div className="mt-2 space-y-2">
        <label className="block">
          <span className="mb-0.5 flex justify-between text-[10px] text-slate-400"><span>Samples</span><span>{samples}</span></span>
          <input type="range" min="4" max="48" value={samples} onChange={(e) => setSamples(Number(e.target.value))} className="w-full" style={{ accentColor: '#22d3ee' }} />
        </label>
        <label className="flex items-center gap-2 text-[11px] text-slate-300">
          <input type="checkbox" checked={noise} onChange={(e) => setNoise(e.target.checked)} style={{ accentColor: '#22d3ee' }} /> Add sensor noise
        </label>
      </div>
      <p className={`mt-2 rounded-md border px-2 py-1.5 text-[10px] leading-relaxed ${aliasing ? 'border-rose-500/40 bg-rose-500/10 text-rose-200 light:text-rose-700' : 'border-slate-800 bg-slate-900/60 text-slate-400'}`}>
            {aliasing ? 'Under-sampled! Fewer than 2 samples per cycle (Nyquist). Raise Samples or lower the machine Speed.' : 'Green = real signal, cyan dots = digital samples. Enough samples per cycle captures it.'}
      </p>
    </div>
  );
}
