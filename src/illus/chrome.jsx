/*
 * Reusable chrome for D3 twins (Illustration Rulebook §9, §10). Parameter panel,
 * KaTeX derivation, port table and notes — shared across every tool so the panel
 * is generated from each spec, not hand-built per tool.
 */
import { useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

export function Section({ title, children }) {
  return (
    <section className="mb-4">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--ill-inactive)' }}>{title}</h3>
      {children}
    </section>
  );
}

export function Slider({ p, value, onChange }) {
  const pct = ((p.nameplate - p.min) / (p.max - p.min)) * 100;
  return (
    <div className="mb-3">
      <div className="mb-0.5 flex items-baseline justify-between">
        <span className="text-xs">{p.label}</span>
        <span className="font-mono text-xs">{value} <span style={{ color: 'var(--ill-inactive)' }}>{p.unit}</span></span>
      </div>
      <div className="relative">
        <input type="range" min={p.min} max={p.max} step={p.step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full" style={{ accentColor: 'var(--ill-select)' }} />
        <span className="pointer-events-none absolute -top-0.5 h-3 w-0.5" style={{ left: `${pct}%`, background: 'var(--ill-copper)' }} title={`Nameplate ${p.nameplate} ${p.unit}`} />
      </div>
    </div>
  );
}

export function Katex({ tex }) {
  const html = useMemo(() => {
    if (!tex) return '';
    try { return katex.renderToString(tex, { throwOnError: false, displayMode: false }); } catch { return tex; }
  }, [tex]);
  if (!tex) return null;
  return <span style={{ color: 'var(--ill-structure)' }} dangerouslySetInnerHTML={{ __html: html }} />;
}

const stateCol = (s) => (s === 'fault' ? 'var(--ill-fault)' : s === 'warning' ? 'var(--ill-warn)' : 'var(--ill-structure)');

export function Derivation({ q }) {
  const e = q.explanation;
  if (!e) return null;
  return (
    <div className="text-[12px]">
      <p className="mb-1 font-semibold">{e.title} = <span style={{ color: stateCol(q.state) }}>{q.value} {q.displaySymbol}</span></p>
      {e.latex ? <div className="mb-2"><Katex tex={e.latex} /></div> : null}
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

export function PortTable({ bound }) {
  return (
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
          <tr key={b.key}>
            <td className="py-0.5">{b.tag}</td>
            <td style={{ fontFamily: 'var(--font-sans)' }}>{b.label}</td>
            <td className="text-right" style={{ color: stateCol(b.state) }}>{b.value} {b.displaySymbol}</td>
            <td className="text-right" style={{ color: 'var(--ill-inactive)' }}>{b.source}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function NotesBlock({ spec }) {
  return (
    <ul className="list-disc pl-4 text-[11px]" style={{ color: 'var(--ill-inactive)' }}>
      {spec.assumptions.map((a, i) => <li key={i}>{a}</li>)}
      {(spec.notModelled || []).map((n, i) => <li key={`n${i}`}>Not modelled: {n}</li>)}
    </ul>
  );
}
