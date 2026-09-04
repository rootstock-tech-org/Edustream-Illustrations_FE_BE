/*
 * PLC & SCADA — operable D3 twin (Illustration Rulebook §3.3, §10). Runs the plant
 * model in a scan loop (the tank genuinely fills/drains, so motion = modelled
 * change, §11), renders the live ladder + tank, and exposes operator controls,
 * fault injection, explain-on-click, a port table and the assumptions.
 */
import { useEffect, useRef, useState } from 'react';
import PlcFigure from '../../illus/plc-scada/PlcFigure';
import { PLC_SPEC as SPEC } from '../../illus/plc-scada/spec';
import { stepPlant, solveLadder, NAMEPLATE, CONFIG, ADDR } from '../../illus/plc-scada/model';
import { Section, Slider, Derivation, PortTable, NotesBlock } from '../../illus/chrome';

const nameplate = () => ({ run: true, mode: 'auto', manualPump: false, lowSP: NAMEPLATE.lowSP, highSP: NAMEPLATE.highSP, demand: NAMEPLATE.demand });

export default function PlcScadaTwin() {
  const [params, setParams] = useState(nameplate);
  const [faults, setFaults] = useState({ weldedPump: false, stuckLow: false });
  const [selected, setSelected] = useState(null);
  const [tSim, setTSim] = useState(0);
  const [level, setLevel] = useState(50);

  const levelRef = useRef(50);
  const sealRef = useRef(false);
  const paramsRef = useRef(params); paramsRef.current = params;
  const faultsRef = useRef(faults); faultsRef.current = faults;

  useEffect(() => {
    const dt = 0.1;
    const id = setInterval(() => {
      const st = stepPlant({ level: levelRef.current, pumpSeal: sealRef.current }, dt, paramsRef.current, faultsRef.current);
      levelRef.current = st.level;
      sealRef.current = st.pumpSeal;
      setLevel(st.level);
      setTSim((t) => +(t + dt).toFixed(1));
    }, 100);
    return () => clearInterval(id);
  }, []);

  // current-scan solve for the live figure (does not advance the level)
  const levelLow = level <= params.lowSP;
  const levelHigh = level >= params.highSP;
  const solved = solveLadder({ run: params.run, mode: params.mode, manualPump: params.manualPump, levelLow, levelHigh, pumpSeal: sealRef.current }, faults);
  const contacts = { run: params.run, lLow: faults.stuckLow || levelLow, seal: sealRef.current, notHigh: !levelHigh, pump: solved.pump, valve: solved.valve };

  const bound = [
    { key: 'level', tag: ADDR.level, label: 'Tank level', value: level.toFixed(0), displaySymbol: '%', state: level >= 95 ? 'fault' : level <= 5 ? 'warning' : 'normal', source: 'model', explanation: { title: 'Tank level', latex: 'L_{t+1} = L_t + (q_{in} - q_{out})\\,\\Delta t', steps: [['inflow q_in', solved.pump ? `${CONFIG.inRate} %/s` : '0'], ['outflow q_out', `${((params.demand / 100) * CONFIG.outRate).toFixed(0)} %/s`], ['level', `${level.toFixed(0)} %`]], result: `${level.toFixed(0)} %`, assumptions: ['First-order tank; linear inflow/outflow.', 'No valve stroke time or sensor lag.'] } },
    { key: 'pump', tag: ADDR.pump, label: 'Pump coil', value: solved.pump ? 'ON' : 'off', displaySymbol: '', state: 'normal', source: 'model', explanation: solved.explanation },
    { key: 'valve', tag: ADDR.valve, label: 'Valve coil', value: solved.valve ? 'ON' : 'off', displaySymbol: '', state: 'normal', source: 'model', explanation: { title: 'Valve coil', latex: '\\text{Valve} = \\text{Pump}', steps: [['Pump', solved.pump ? 'TRUE' : 'FALSE']], result: solved.valve ? 'ENERGISED' : 'off', assumptions: ['Valve follows the pump coil in this simple loop.'] } },
    { key: 'scan', tag: 'SCAN', label: 'Scan time', value: String(CONFIG.scanMs), displaySymbol: 'ms', state: 'normal', source: 'model', explanation: { title: 'Scan time', latex: '', steps: [['read + solve + write', `${CONFIG.scanMs} ms`]], result: `${CONFIG.scanMs} ms`, assumptions: ['Fixed nominal scan; real scan grows with program size.'] } },
  ];
  const selQ = bound.find((b) => b.tag === selected);

  const reset = () => { levelRef.current = 50; sealRef.current = false; setLevel(50); setParams(nameplate()); setFaults({ weldedPump: false, stuckLow: false }); };
  const toggle = (k) => setParams((s) => ({ ...s, [k]: !s[k] }));

  return (
    <div className="flex h-full w-full" style={{ background: 'var(--ill-surface-2)', color: 'var(--ill-structure)' }}>
      <div className="flex-1 grid place-items-center p-4 min-w-0">
        <PlcFigure spec={SPEC} contacts={contacts} level={level} params={params} bound={bound} tSim={tSim} onPick={setSelected} selected={selected} />
      </div>

      <aside className="w-[360px] shrink-0 overflow-y-auto border-l p-4 text-sm" style={{ borderColor: 'var(--ill-hairline)', background: 'var(--ill-surface)' }}>
        <Section title="Operator switches">
          <div className="mb-2 flex gap-2">
            <SwitchBtn on={params.run} label={params.run ? 'RUN' : 'STOP'} onClick={() => toggle('run')} />
            <SwitchBtn on={params.mode === 'auto'} label={params.mode === 'auto' ? 'AUTO' : 'MANUAL'} onClick={() => setParams((s) => ({ ...s, mode: s.mode === 'auto' ? 'manual' : 'auto' }))} />
            {params.mode === 'manual' && <SwitchBtn on={params.manualPump} label={params.manualPump ? 'PUMP ON' : 'PUMP OFF'} onClick={() => toggle('manualPump')} />}
          </div>
        </Section>

        <Section title="Setpoints">
          {SPEC.parameters.map((p) => (
            <Slider key={p.key} p={p} value={params[p.key]} onChange={(v) => setParams((s) => ({ ...s, [p.key]: v }))} />
          ))}
          <button onClick={reset} className="mt-1 w-full rounded-lg px-3 py-1.5 text-xs font-semibold" style={{ background: 'var(--ill-select)', color: '#fff' }}>Reset to nameplate</button>
        </Section>

        <Section title="Fault injection">
          {SPEC.faults.map((f) => (
            <button key={f.id} onClick={() => setFaults((s) => ({ ...s, [f.id]: !s[f.id] }))} title={f.description}
              className="mb-1.5 flex w-full items-center justify-between rounded-lg border px-3 py-1.5 text-left text-xs"
              style={{ borderColor: faults[f.id] ? 'var(--ill-fault)' : 'var(--ill-hairline)', color: faults[f.id] ? 'var(--ill-fault)' : 'var(--ill-structure)' }}>
              <span>{f.label}</span><span className="font-mono">{faults[f.id] ? 'ON' : 'off'}</span>
            </button>
          ))}
          <p className="mt-1 text-[11px]" style={{ color: 'var(--ill-inactive)' }}>Weld the pump contactor — the coil de-energises in logic but the tank keeps filling past HIGH. That is the insidious fault.</p>
        </Section>

        <Section title={selQ ? `Explain · ${selQ.tag}` : 'Explain'}>
          {selQ ? <Derivation q={selQ} /> : <p className="text-[12px]" style={{ color: 'var(--ill-inactive)' }}>Click a coil, contact, or the tank to see its logic / formula and assumptions.</p>}
        </Section>

        <Section title="I/O table"><PortTable bound={bound} /></Section>
        <Section title="Notes — what the model does not do"><NotesBlock spec={SPEC} /></Section>
      </aside>
    </div>
  );
}

function SwitchBtn({ on, label, onClick }) {
  return (
    <button onClick={onClick} className="rounded-lg border px-3 py-1.5 text-xs font-semibold" style={{ borderColor: on ? 'var(--ill-select)' : 'var(--ill-hairline)', color: on ? 'var(--ill-select)' : 'var(--ill-inactive)' }}>{label}</button>
  );
}
