/*
 * Predictive Maintenance — operable D3 twin (Rulebook §3.3, §10). Steady state:
 * the figure is still; changing a parameter or injecting a fault re-solves the
 * bearing condition and RUL. No physics in this component.
 */
import { useMemo, useState } from 'react';
import PmFigure from '../../illus/predictive-maintenance/PmFigure';
import { PM_SPEC as SPEC } from '../../illus/predictive-maintenance/spec';
import { evaluate, NAMEPLATE } from '../../illus/predictive-maintenance/model';
import { bind } from '../../illus/binding';
import { Section, Slider, Derivation, PortTable, NotesBlock } from '../../illus/chrome';

const nameplate = () => ({ load: NAMEPLATE.load, rpm: NAMEPLATE.rpm, health: NAMEPLATE.health });

export default function PredictiveMaintenanceTwin() {
  const [params, setParams] = useState(nameplate);
  const [faults, setFaults] = useState({ lubeLoss: false, imbalance: false, misalign: false });
  const [selected, setSelected] = useState(null);

  const out = useMemo(() => evaluate(params, faults), [params, faults]);
  const bound = useMemo(() => bind(SPEC, out, 0), [out]);
  const selQ = bound.find((b) => b.tag === selected);
  const reset = () => { setParams(nameplate()); setFaults({ lubeLoss: false, imbalance: false, misalign: false }); };

  return (
    <div className="flex h-full w-full" style={{ background: 'var(--ill-surface-2)', color: 'var(--ill-structure)' }}>
      <div className="flex-1 grid place-items-center p-4 min-w-0">
        <PmFigure spec={SPEC} bound={bound} onPick={setSelected} selected={selected} />
      </div>
      <aside className="w-[360px] shrink-0 overflow-y-auto border-l p-4 text-sm" style={{ borderColor: 'var(--ill-hairline)', background: 'var(--ill-surface)' }}>
        <Section title="Parameters">
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
          <p className="mt-1 text-[11px]" style={{ color: 'var(--ill-inactive)' }}>Drop bearing health or lose lubrication and watch RUL collapse — vibration + temperature rise together.</p>
        </Section>
        <Section title={selQ ? `Explain · ${selQ.tag}` : 'Explain'}>
          {selQ ? <Derivation q={selQ} /> : <p className="text-[12px]" style={{ color: 'var(--ill-inactive)' }}>Click a reading to see its formula, substituted numbers and assumptions.</p>}
        </Section>
        <Section title="Signals"><PortTable bound={bound} /></Section>
        <Section title="Notes — what the model does not do"><NotesBlock spec={SPEC} /></Section>
      </aside>
    </div>
  );
}
