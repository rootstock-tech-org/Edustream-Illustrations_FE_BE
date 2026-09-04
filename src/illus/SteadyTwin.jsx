/*
 * Generic steady-state D3 twin (Rulebook §3.3, §10). Renders a figure + the
 * standard chrome (parameter panel from the spec schema, fault injection,
 * explain-on-click, port table, notes). Holds no physics — it calls the tool's
 * pure evaluate() and binds the result. Used by every steady-state tool.
 */
import { useMemo, useState } from 'react';
import { bind } from './binding';
import { Section, Slider, Derivation, PortTable, NotesBlock } from './chrome';

export default function SteadyTwin({ spec, evaluate, Figure, tip }) {
  const np = () => Object.fromEntries(spec.parameters.map((p) => [p.key, p.nameplate]));
  const noFaults = () => Object.fromEntries((spec.faults || []).map((f) => [f.id, false]));
  const [params, setParams] = useState(np);
  const [faults, setFaults] = useState(noFaults);
  const [selected, setSelected] = useState(null);

  const out = useMemo(() => evaluate(params, faults), [params, faults, evaluate]);
  const bound = useMemo(() => bind(spec, out, 0), [out, spec]);
  const selQ = bound.find((b) => b.tag === selected);
  const reset = () => { setParams(np()); setFaults(noFaults()); };

  return (
    <div className="flex h-full w-full" style={{ background: 'var(--ill-surface-2)', color: 'var(--ill-structure)' }}>
      <div className="flex-1 grid place-items-center p-4 min-w-0">
        <Figure spec={spec} bound={bound} params={params} onPick={setSelected} selected={selected} />
      </div>
      <aside className="w-[360px] shrink-0 overflow-y-auto border-l p-4 text-sm" style={{ borderColor: 'var(--ill-hairline)', background: 'var(--ill-surface)' }}>
        <Section title="Parameters">
          {spec.parameters.map((p) => (
            <Slider key={p.key} p={p} value={params[p.key]} onChange={(v) => setParams((s) => ({ ...s, [p.key]: v }))} />
          ))}
          <button onClick={reset} className="mt-1 w-full rounded-lg px-3 py-1.5 text-xs font-semibold" style={{ background: 'var(--ill-select)', color: '#fff' }}>Reset to nameplate</button>
        </Section>
        {spec.faults?.length > 0 && (
          <Section title="Fault injection">
            {spec.faults.map((f) => (
              <button key={f.id} onClick={() => setFaults((s) => ({ ...s, [f.id]: !s[f.id] }))} title={f.description}
                className="mb-1.5 flex w-full items-center justify-between rounded-lg border px-3 py-1.5 text-left text-xs"
                style={{ borderColor: faults[f.id] ? 'var(--ill-fault)' : 'var(--ill-hairline)', color: faults[f.id] ? 'var(--ill-fault)' : 'var(--ill-structure)' }}>
                <span>{f.label}</span><span className="font-mono">{faults[f.id] ? 'ON' : 'off'}</span>
              </button>
            ))}
            {tip && <p className="mt-1 text-[11px]" style={{ color: 'var(--ill-inactive)' }}>{tip}</p>}
          </Section>
        )}
        <Section title={selQ ? `Explain · ${selQ.tag}` : 'Explain'}>
          {selQ ? <Derivation q={selQ} /> : <p className="text-[12px]" style={{ color: 'var(--ill-inactive)' }}>Click a reading in the figure to see its formula, substituted numbers and assumptions.</p>}
        </Section>
        <Section title="Signals"><PortTable bound={bound} /></Section>
        <Section title="Notes — what the model does not do"><NotesBlock spec={spec} /></Section>
      </aside>
    </div>
  );
}
