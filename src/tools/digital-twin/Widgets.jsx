/**
 * Widgets.jsx (Digital Twin)
 * --------------------------
 * Explainers: twin types, the sense-sync-simulate-act loop and use cases.
 */
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { TWIN_TYPES, DATA_FLOW, USE_CASES, INTEGRATION_LEVELS, TWIN_CAPS, twinLevel, CPS_STAGES } from './data';

const chip = (active) =>
  `rounded-lg border px-2.5 py-1.5 text-[10px] font-semibold transition-all duration-150 active:translate-y-px ${
    active
      ? 'border-indigo-400/60 bg-indigo-500/25 text-white shadow-[0_3px_12px_-2px_rgba(129,140,248,0.5)] ring-1 ring-indigo-400/30 light:bg-indigo-400 light:text-slate-900 light:border-indigo-500'
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

export function TwinTypes() {
  return <Explorer items={TWIN_TYPES} prompt="Digital twins by scope, small to large." />;
}
export function DataLoop() {
  return <Explorer items={DATA_FLOW} prompt="The twin's data loop: sense, sync, simulate, act." />;
}
export function UseCases() {
  return <Explorer items={USE_CASES} prompt="What digital twins are used for." />;
}
export function IntegrationLevels() {
  return <Explorer items={INTEGRATION_LEVELS} prompt="Model, shadow or twin? Set by the data-flow direction (Kritzinger 2018)." />;
}

const LEVEL_PCT = { model: 33, shadow: 66, twin: 100 };

/** Digital Twin Builder: toggle capabilities and watch which level you have built. */
export function TwinBuilder() {
  const [scope, setScope] = useState('asset');
  const [caps, setCaps] = useState(() => new Set(['link']));
  const level = twinLevel(caps);
  const toggle = (id) => setCaps((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const sc = TWIN_TYPES.find((t) => t.id === scope) ?? TWIN_TYPES[1];
  return (
    <div>
      <p className="mb-2 text-[10px] text-slate-500">Assemble a twin. What you switch on decides its level.</p>
      <span className="text-[9px] uppercase tracking-wider text-slate-500">Scope</span>
      <div className="mt-0.5 flex flex-wrap gap-1">
        {TWIN_TYPES.map((t) => (
          <button key={t.id} onClick={() => setScope(t.id)} className={chip(t.id === scope)}>{t.name.replace(' twin', '')}</button>
        ))}
      </div>
      <span className="mt-2 block text-[9px] uppercase tracking-wider text-slate-500">Capabilities</span>
      <div className="mt-0.5 space-y-1">
        {TWIN_CAPS.map((c) => (
          <button key={c.id} onClick={() => toggle(c.id)} className={`flex w-full items-center justify-between rounded-lg border px-2.5 py-1.5 text-left ${chip(caps.has(c.id))}`}>
            <span>{c.name}</span>
            <span className={`h-2 w-2 rounded-full ${caps.has(c.id) ? 'bg-emerald-400' : 'bg-slate-600'}`} />
          </button>
        ))}
      </div>
      <div className={`mt-2 p-3 ${panel3d}`}>
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-indigo-300 light:text-indigo-700">{level.name}</p>
          <span className="text-[9px] text-slate-500">{sc.name}</span>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-800">
          <motion.div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500" animate={{ width: `${LEVEL_PCT[level.id]}%` }} transition={{ duration: 0.5, ease: 'easeOut' }} />
        </div>
        <div className="mt-1 flex justify-between text-[8px] uppercase tracking-wider text-slate-500">
          <span>Model</span><span>Shadow</span><span>Twin</span>
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">{level.detail}</p>
      </div>
    </div>
  );
}

const SPEED_PCT = (rpm) => Math.max(0, Math.min(100, ((rpm - 500) / 1200) * 100));

/** Monitoring Dashboard: live gauges reading the running twin sim. */
export function MonitoringDashboard({ physicalSpeed = 0, twinSpeed = 0, divergence = 0, syncPct = 0, latency = 0 }) {
  const R = 26;
  const C = 2 * Math.PI * R;
  const tone = syncPct >= 85 ? '#34d399' : syncPct >= 60 ? '#f59e0b' : '#f87171';
  return (
    <div>
      <p className="mb-2 text-[10px] text-slate-500">Live telemetry from the running twin.</p>
      <div className={`p-3 ${panel3d}`}>
        <div className="flex items-center gap-3">
          <svg viewBox="0 0 64 64" className="h-16 w-16 shrink-0">
            <circle cx="32" cy="32" r={R} fill="none" stroke="#1e293b" strokeWidth="7" />
            <circle cx="32" cy="32" r={R} fill="none" stroke={tone} strokeWidth="7" strokeLinecap="round"
              strokeDasharray={C} strokeDashoffset={C * (1 - syncPct / 100)} transform="rotate(-90 32 32)"
              style={{ transition: 'stroke-dashoffset 0.3s ease, stroke 0.3s' }} />
            <text x="32" y="35" textAnchor="middle" className="fill-slate-100 text-[13px] font-bold">{syncPct}%</text>
          </svg>
          <div className="min-w-0 flex-1">
            <p className="text-[9px] uppercase tracking-wider text-slate-500">Sync health · latency {latency} ms</p>
            <div className="mt-1 grid grid-cols-2 gap-1.5">
              <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-1.5">
                <p className="text-[9px] text-slate-500">Physical</p>
                <p className="text-sm font-bold tabular-nums text-slate-100">{Math.round(physicalSpeed)}<span className="text-[9px] text-slate-500"> rpm</span></p>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-1.5">
                <p className="text-[9px] text-slate-500">Twin</p>
                <p className="text-sm font-bold tabular-nums text-indigo-300">{Math.round(twinSpeed)}<span className="text-[9px] text-slate-500"> rpm</span></p>
              </div>
            </div>
          </div>
        </div>
        <div className="mt-2">
          <div className="flex justify-between text-[9px] text-slate-500"><span>Divergence</span><span className="tabular-nums text-slate-300">{Math.round(divergence)} rpm</span></div>
          <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-slate-800">
            <motion.div className="h-full rounded-full" style={{ backgroundColor: tone }} animate={{ width: `${Math.min(100, divergence / 3)}%` }} transition={{ duration: 0.3 }} />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Synchronization Viewer: live physical vs twin needles and the gap between them. */
export function SynchronizationViewer({ physicalSpeed = 0, twinSpeed = 0, divergence = 0, syncRate = 5, onSyncRate }) {
  const Needle = ({ label, rpm, color }) => (
    <div>
      <div className="flex justify-between text-[10px]"><span className="text-slate-400">{label}</span><span className="tabular-nums text-slate-200">{Math.round(rpm)} rpm</span></div>
      <div className="mt-0.5 h-2.5 overflow-hidden rounded-full bg-slate-800">
        <motion.div className="h-full rounded-full" style={{ backgroundColor: color }} animate={{ width: `${SPEED_PCT(rpm)}%` }} transition={{ duration: 0.15 }} />
      </div>
    </div>
  );
  return (
    <div>
      <p className="mb-2 text-[10px] text-slate-500">The physical asset moves continuously; the twin only jumps on each sync.</p>
      <div className={`space-y-2 p-3 ${panel3d}`}>
        <Needle label="Physical asset" rpm={physicalSpeed} color="#94a3b8" />
        <Needle label="Digital twin" rpm={twinSpeed} color="#818cf8" />
        <div className="flex items-center justify-between rounded-lg border border-slate-700/60 bg-slate-900/50 px-2.5 py-1.5">
          <span className="text-[10px] text-slate-400">Lag / divergence</span>
          <span className={`text-[11px] font-bold tabular-nums ${divergence > 120 ? 'text-rose-300' : divergence > 40 ? 'text-amber-300' : 'text-emerald-300'}`}>{Math.round(divergence)} rpm</span>
        </div>
      </div>
      {onSyncRate && (
        <label className="mt-2 block">
          <span className="flex justify-between text-[10px] text-slate-400"><span>Sync rate</span><span className="tabular-nums text-slate-200">{syncRate}/s</span></span>
          <input type="range" min="1" max="20" value={syncRate} onChange={(e) => onSyncRate(Number(e.target.value))} className="w-full" style={{ accentColor: '#818cf8' }} />
        </label>
      )}
      <p className="mt-1.5 text-[10px] text-slate-500">Raise the sync rate to shrink the gap; lower it and the twin visibly lags.</p>
    </div>
  );
}

/** CPS Explorer: the cyber-physical loop, with a token cycling through the stages. */
export function CpsExplorer() {
  const [sel, setSel] = useState('cyber');
  const [active, setActive] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setActive((a) => (a + 1) % CPS_STAGES.length), 900);
    return () => clearInterval(id);
  }, []);
  const s = CPS_STAGES.find((x) => x.id === sel) ?? CPS_STAGES[0];
  return (
    <div>
      <p className="mb-2 text-[10px] text-slate-500">A cyber-physical system: sense, decide, act, closing the loop.</p>
      <div className="flex flex-wrap items-center gap-1">
        {CPS_STAGES.map((st, i) => (
          <div key={st.id} className="flex items-center">
            <button onClick={() => setSel(st.id)}
              className={`rounded-lg border px-2 py-1 text-[10px] font-semibold transition-all ${sel === st.id ? 'text-slate-900' : 'text-slate-300 hover:border-slate-500'}`}
              style={sel === st.id
                ? { backgroundColor: st.hue, borderColor: st.hue }
                : { borderColor: '#475569', boxShadow: active === i ? `0 0 10px ${st.hue}` : 'none' }}>
              {st.name}
            </button>
            {i < CPS_STAGES.length - 1 && <span className="px-0.5 text-slate-600">→</span>}
          </div>
        ))}
        <span className="text-[10px] text-slate-600">↺</span>
      </div>
      <div className={`mt-2 p-3 ${panel3d}`}>
        <p className="text-xs font-bold" style={{ color: s.hue }}>{s.name}</p>
        <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">{s.detail}</p>
      </div>
    </div>
  );
}
