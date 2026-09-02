/**
 * Widgets.jsx (PLC & SCADA)
 * -------------------------
 * Interactive widgets: a LIVE ladder-logic diagram that reflects the plant in
 * real time, the scan-cycle explainer, the IEC 61131-3 languages and the SCADA
 * level hierarchy.
 */
import { useState } from 'react';
import { SCAN_STEPS, IEC_LANGUAGES, SCADA_LEVELS, SCADA_COMPONENTS } from './data';

const chip = (active) =>
  `rounded-lg border px-2.5 py-1.5 text-[10px] font-semibold transition-all duration-150 active:translate-y-px ${
    active
      ? 'border-amber-400/60 bg-amber-500/25 text-white shadow-[0_3px_12px_-2px_rgba(251,191,36,0.5)] ring-1 ring-amber-400/30 light:bg-amber-400 light:text-slate-900 light:border-amber-500'
      : 'border-slate-700/80 bg-gradient-to-b from-slate-700/50 to-slate-900/70 text-slate-300 shadow-[0_2px_6px_-1px_rgba(0,0,0,0.5)] hover:-translate-y-0.5 hover:border-slate-500 light:border-slate-300 light:from-slate-100 light:to-slate-200 light:text-slate-600'
  }`;

const panel3d = 'rounded-xl border border-white/10 bg-gradient-to-br from-slate-800/70 to-slate-950/85 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.8)] ring-1 ring-white/5 backdrop-blur-sm';

/* ---- Live ladder logic ---- */
const Contact = ({ label, on, nc }) => (
  <span className={`inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[9px] transition-colors ${
    on ? 'border-emerald-400/70 bg-emerald-500/20 text-emerald-200' : 'border-slate-600 bg-slate-800/60 text-slate-400'
  }`}>
    {nc ? '\u2044' : ''}{label}
  </span>
);
const Coil = ({ label, on }) => (
  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[9px] transition-colors ${
    on ? 'border-amber-400/70 bg-amber-500/25 text-amber-100' : 'border-slate-600 bg-slate-800/60 text-slate-400'
  }`}>( {label} )</span>
);
const Rung = ({ children, coil }) => (
  <div className="flex items-center gap-1">
    <span className="text-slate-600">|</span>
    <div className="flex flex-1 items-center gap-1">
      {children}
      <span className="mx-1 flex-1 border-t border-dashed border-slate-600" />
    </div>
    {coil}
    <span className="text-slate-600">|</span>
  </div>
);
const Branch = ({ children }) => (
  <span className="inline-flex flex-col gap-0.5 rounded border border-slate-700 p-0.5">{children}</span>
);

export function LadderDiagram({ plc }) {
  const { run, lvlLow, lvlHigh, pump, valve, alarm, mode } = plc;
  return (
    <div>
      <p className="mb-2 text-[10px] text-slate-500">Live ladder logic. Green contacts are passing current right now.</p>
      <div className={`space-y-2.5 p-3 ${panel3d}`}>
        <Rung coil={<Coil label="Pump" on={pump} />}>
          <Contact label="Run" on={run} />
          <Branch>
            <Contact label="LvlLow" on={lvlLow} />
            <Contact label="Pump" on={pump} />
          </Branch>
          <Contact label="LvlHigh" nc on={!lvlHigh} />
        </Rung>
        <Rung coil={<Coil label="Valve" on={valve} />}>
          <Contact label="Pump" on={pump} />
        </Rung>
        <Rung coil={<Coil label="HiAlarm" on={alarm} />}>
          <Contact label="LvlHigh" on={lvlHigh} />
        </Rung>
        <Rung coil={<Coil label="RunLamp" on={run} />}>
          <Contact label="Run" on={run} />
        </Rung>
      </div>
      {mode === 'manual' ? (
        <p className="mt-2 text-[10px] text-amber-300/90">Manual mode: the operator forces the pump and valve, so the coils may not match the auto rungs.</p>
      ) : (
        <p className="mt-2 text-[10px] text-slate-500">Rung 1 is a seal-in latch: the pump holds on via its own contact until the level hits High.</p>
      )}
    </div>
  );
}

/* ---- Scan cycle ---- */
export function ScanCycle({ scanPhase }) {
  const [sel, setSel] = useState(SCAN_STEPS[0].id);
  const s = SCAN_STEPS.find((x) => x.id === sel) ?? SCAN_STEPS[0];
  return (
    <div>
      <p className="mb-2 text-[10px] text-slate-500">The PLC repeats these three steps, about 8 ms per loop. The ringed step is running live (slowed).</p>
      <div className="flex items-center gap-1">
        {SCAN_STEPS.map((st, i) => (
          <div key={st.id} className="flex flex-1 items-center">
            <button onClick={() => setSel(st.id)} className={`w-full rounded-lg border px-1.5 py-1.5 text-[10px] font-semibold ${st.id === sel ? 'border-amber-400/60 bg-amber-500/25 text-white light:bg-amber-400 light:text-slate-900 light:border-amber-500' : 'border-slate-700 text-slate-300'} ${i === scanPhase ? 'ring-2 ring-amber-400/70' : ''}`}>
              {i + 1}. {st.name}
            </button>
            {i < SCAN_STEPS.length - 1 && <span className="px-0.5 text-slate-600">{'\u2192'}</span>}
          </div>
        ))}
      </div>
      <div className={`mt-2 p-3 ${panel3d}`}>
        <p className="text-xs font-bold text-slate-100">{s.name}</p>
        <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">{s.detail}</p>
      </div>
    </div>
  );
}

/* ---- IEC 61131-3 languages ---- */
export function IecExplorer() {
  const [sel, setSel] = useState(IEC_LANGUAGES[0].id);
  const l = IEC_LANGUAGES.find((x) => x.id === sel) ?? IEC_LANGUAGES[0];
  return (
    <div>
      <p className="mb-2 text-[10px] text-slate-500">IEC 61131-3: the five standard PLC languages.</p>
      <div className="flex flex-wrap gap-1.5">
        {IEC_LANGUAGES.map((x) => (
          <button key={x.id} onClick={() => setSel(x.id)} className={chip(x.id === sel)}>{x.name}</button>
        ))}
      </div>
      <div className={`mt-2 p-3 ${panel3d}`}>
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-slate-100">{l.name}</p>
          <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[9px] font-semibold text-amber-300 light:bg-slate-200 light:text-amber-700">{l.tag}</span>
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">{l.detail}</p>
      </div>
    </div>
  );
}

/* ---- SCADA hierarchy ---- */
export function ScadaExplorer() {
  const [sel, setSel] = useState('l1');
  const all = [...SCADA_LEVELS, ...SCADA_COMPONENTS];
  const item = all.find((x) => x.id === sel) ?? SCADA_LEVELS[0];
  const isLevel = 'level' in item;
  return (
    <div>
      <p className="mb-2 text-[10px] text-slate-500">SCADA levels (top to field) and its building blocks.</p>
      <div className="flex flex-col gap-1">
        {[...SCADA_LEVELS].reverse().map((lv) => (
          <button key={lv.id} onClick={() => setSel(lv.id)}
            className={`flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-left ${sel === lv.id ? 'border-amber-400/60 bg-amber-500/25 text-white light:bg-amber-400 light:text-slate-900 light:border-amber-500' : 'border-slate-700/80 bg-slate-800/50 text-slate-300 hover:border-slate-500'}`}>
            <span className="text-[11px] font-semibold">{lv.name}</span>
            <span className="rounded bg-slate-900/60 px-1.5 text-[9px] text-slate-400">L{lv.level}</span>
          </button>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {SCADA_COMPONENTS.map((c) => (
          <button key={c.id} onClick={() => setSel(c.id)} className={chip(sel === c.id)}>{c.name}</button>
        ))}
      </div>
      <div className={`mt-2 p-3 ${panel3d}`}>
        <p className="text-xs font-bold text-slate-100">{isLevel ? `Level ${item.level} · ${item.name}` : item.name}</p>
        <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">{item.detail}</p>
      </div>
    </div>
  );
}
