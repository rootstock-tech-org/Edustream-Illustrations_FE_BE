/*
 * Sensors — operable D3 twin (Illustration Rulebook §3.3, §10). Full-screen tool:
 * the figure + a parameter panel generated from the spec schema, fault injection,
 * explain-on-click derivations, a port table and the notes/assumptions block.
 * Holds NO physics — it calls the pure model and binds the result.
 */
import { useEffect, useMemo, useState } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import SensorsFigure from '../../illus/sensors/SensorsFigure';
import { SENSORS_SPEC as SPEC } from '../../illus/sensors/spec';
import { evaluate, NAMEPLATE } from '../../illus/sensors/model';
import { bind } from '../../illus/binding';

const nameplateParams = () => ({ load: NAMEPLATE.load, rpm: NAMEPLATE.rpm, ambient: NAMEPLATE.ambient });

export default function SensorsTwin() {
  const [params, setParams] = useState(nameplateParams);
  const [faults, setFaults] = useState({ bearingWear: false, coolingLoss: false });
  const [selected, setSelected] = useState(null);
  const [tSim, setTSim] = useState(0);

  // one monotonic simulated clock (label only; the figure is still at steady state)
  useEffect(() => {
    const id = setInterval(() => setTSim((t) => +(t + 1).toFixed(0)), 1000);
    return () => clearInterval(id);
  }, []);

  const out = useMemo(() => evaluate(params, faults), [params, faults]);
  const bound = useMemo(() => bind(SPEC, out, tSim), [out, tSim]);
  const selQ = bound.find((b) => b.tag === selected);
  const atNameplate = params.load === NAMEPLATE.load && params.rpm === NAMEPLATE.rpm && params.ambient === NAMEPLATE.ambient && !faults.bearingWear && !faults.coolingLoss;

  const reset = () => { setParams(nameplateParams()); setFaults({ bearingWear: false, coolingLoss: false }); };

  return (
    <div className="flex h-full w-full" style={{ background: 'var(--ill-surface-2)', color: 'var(--ill-structure)' }}>
      {/* figure */}
      <div className="flex-1 grid place-items-center p-4 min-w-0">
        <SensorsFigure spec={SPEC} bound={bound} tSim={tSim} onPick={setSelected} selected={selected} />
      </div>

      {/* chrome panel (rounded chrome is allowed outside the drawing frame, §0.3) */}
      <aside className="w-[360px] shrink-0 overflow-y-auto border-l p-4 text-sm" style={{ borderColor: 'var(--ill-hairline)', background: 'var(--ill-surface)' }}>
        <Section title="Parameters">
          {SPEC.parameters.map((p) => (
            <Slider key={p.key} p={p} value={params[p.key]} onChange={(v) => setParams((s) => ({ ...s, [p.key]: v }))} />
          ))}
          <button onClick={reset} disabled={atNameplate} className="mt-2 w-full rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-40" style={{ background: 'var(--ill-select)', color: '#fff' }}>
            Reset to nameplate
          </button>
        </Section>

        <Section title="Fault injection">
          {SPEC.faults.map((f) => (
            <button
              key={f.id}
              onClick={() => setFaults((s) => ({ ...s, [f.id]: !s[f.id] }))}
              title={f.description}
              className="mb-1.5 flex w-full items-center justify-between rounded-lg border px-3 py-1.5 text-left text-xs"
              style={{ borderColor: faults[f.id] ? 'var(--ill-fault)' : 'var(--ill-hairline)', color: faults[f.id] ? 'var(--ill-fault)' : 'var(--ill-structure)' }}
            >
              <span>{f.label}</span>
              <span className="font-mono">{faults[f.id] ? 'ON' : 'off'}</span>
            </button>
          ))}
          <p className="mt-1 text-[11px]" style={{ color: 'var(--ill-inactive)' }}>Tip: turn on DE bearing wear — vibration and current rise, but flow does not. That is the insidious fault.</p>
        </Section>

        <Section title={selQ ? `Explain · ${selQ.tag}` : 'Explain'}>
          {selQ ? (
            <Derivation q={selQ} />
          ) : (
            <p className="text-[12px]" style={{ color: 'var(--ill-inactive)' }}>Click any reading in the figure to see its formula, the substituted numbers and the assumptions.</p>
          )}
        </Section>

        <Section title="Ports / signals">
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr style={{ color: 'var(--ill-inactive)' }}>
                <th className="py-1 text-left font-medium">Tag</th>
                <th className="text-left font-medium">Name</th>
                <th className="text-right font-medium">Value</th>
                <th className="text-right font-medium">Src</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {bound.map((b) => (
                <tr key={b.key} onMouseEnter={() => setSelected(b.tag)} style={{ cursor: 'default' }}>
                  <td className="py-0.5">{b.tag}</td>
                  <td style={{ fontFamily: 'var(--font-sans)' }}>{b.label}</td>
                  <td className="text-right" style={{ color: b.state === 'fault' ? 'var(--ill-fault)' : b.state === 'warning' ? 'var(--ill-warn)' : 'var(--ill-structure)' }}>{b.value} {b.displaySymbol}</td>
                  <td className="text-right" style={{ color: 'var(--ill-inactive)' }}>{b.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <Section title="Notes — what the model does not do">
          <ul className="list-disc pl-4 text-[11px]" style={{ color: 'var(--ill-inactive)' }}>
            {SPEC.assumptions.map((a, i) => <li key={i}>{a}</li>)}
            {SPEC.notModelled.map((n, i) => <li key={`n${i}`}>Not modelled: {n}</li>)}
          </ul>
        </Section>
      </aside>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="mb-4">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--ill-inactive)' }}>{title}</h3>
      {children}
    </section>
  );
}

function Slider({ p, value, onChange }) {
  const pct = ((p.nameplate - p.min) / (p.max - p.min)) * 100;
  return (
    <div className="mb-3">
      <div className="mb-0.5 flex items-baseline justify-between">
        <span className="text-xs">{p.label}</span>
        <span className="font-mono text-xs">{value} <span style={{ color: 'var(--ill-inactive)' }}>{p.unit}</span></span>
      </div>
      <div className="relative">
        <input type="range" min={p.min} max={p.max} step={p.step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full" style={{ accentColor: 'var(--ill-select)' }} />
        {/* nameplate marker (§10.2) */}
        <span className="pointer-events-none absolute -top-0.5 h-3 w-0.5" style={{ left: `${pct}%`, background: 'var(--ill-copper)' }} title={`Nameplate ${p.nameplate} ${p.unit}`} />
      </div>
    </div>
  );
}

function Katex({ tex }) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(tex, { throwOnError: false, displayMode: false });
    } catch {
      return tex;
    }
  }, [tex]);
  return <span style={{ color: 'var(--ill-structure)' }} dangerouslySetInnerHTML={{ __html: html }} />;
}

function Derivation({ q }) {
  const e = q.explanation;
  if (!e) return null;
  return (
    <div className="text-[12px]">
      <p className="mb-1 font-semibold">{e.title} = <span style={{ color: q.state === 'fault' ? 'var(--ill-fault)' : q.state === 'warning' ? 'var(--ill-warn)' : 'var(--ill-structure)' }}>{q.value} {q.displaySymbol}</span></p>
      <div className="mb-2"><Katex tex={e.latex} /></div>
      <table className="mb-2 w-full text-[11px]">
        <tbody className="font-mono">
          {e.steps.map((s, i) => (
            <tr key={i}><td className="pr-2" style={{ color: 'var(--ill-inactive)' }}>{s[0]}</td><td className="text-right">{s[1]}</td></tr>
          ))}
        </tbody>
      </table>
      <p className="text-[11px] font-semibold" style={{ color: 'var(--ill-inactive)' }}>Assumptions</p>
      <ul className="list-disc pl-4 text-[11px]" style={{ color: 'var(--ill-inactive)' }}>
        {e.assumptions.map((a, i) => <li key={i}>{a}</li>)}
      </ul>
    </div>
  );
}
