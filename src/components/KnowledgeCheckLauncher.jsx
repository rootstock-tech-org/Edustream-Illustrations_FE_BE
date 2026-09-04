/**
 * KnowledgeCheckLauncher.jsx
 * --------------------------
 * A prominent launcher button plus a spacious modal that hosts the module's
 * Knowledge Check, so the check gets its own room instead of a cramped side tab.
 * Drop one into a tool and remove the old Knowledge Check tab. Self-contained
 * (owns its open state).
 */
import { useState } from 'react';
import { GraduationCap, X } from 'lucide-react';
import KnowledgeCheck from './KnowledgeCheck';

const BTN = {
  brand: 'from-brand-500 to-brand-600 shadow-brand-500/30',
  teal: 'from-teal-500 to-teal-600 shadow-teal-500/30',
  orange: 'from-orange-500 to-orange-600 shadow-orange-500/30',
  indigo: 'from-indigo-500 to-indigo-600 shadow-indigo-500/30',
  cyan: 'from-cyan-500 to-cyan-600 shadow-cyan-500/30',
  amber: 'from-amber-500 to-amber-600 shadow-amber-500/30',
  rose: 'from-rose-500 to-rose-600 shadow-rose-500/30',
  emerald: 'from-emerald-500 to-emerald-600 shadow-emerald-500/30',
  violet: 'from-violet-500 to-violet-600 shadow-violet-500/30',
};
const TEXT = {
  brand: 'text-brand-300 light:text-brand-700',
  teal: 'text-teal-300 light:text-teal-700',
  orange: 'text-orange-300 light:text-orange-700',
  indigo: 'text-indigo-300 light:text-indigo-700',
  cyan: 'text-cyan-300 light:text-cyan-700',
  amber: 'text-amber-300 light:text-amber-700',
  rose: 'text-rose-300 light:text-rose-700',
  emerald: 'text-emerald-300 light:text-emerald-700',
  violet: 'text-violet-300 light:text-violet-700',
};

export default function KnowledgeCheckLauncher({ questions, accent = 'brand', positionClass = 'bottom-4 left-1/2 -translate-x-1/2' }) {
  const [open, setOpen] = useState(false);
  const btn = BTN[accent] ?? BTN.brand;
  const text = TEXT[accent] ?? TEXT.brand;
  return (
    <>
      <button onClick={() => setOpen(true)} className={`absolute z-30 ${positionClass} inline-flex items-center gap-2 rounded-full bg-gradient-to-r ${btn} px-4 py-2 text-xs font-bold text-white shadow-lg ring-1 ring-white/10 transition-transform hover:-translate-y-0.5`}>
        <GraduationCap className="h-4 w-4" /> Knowledge Check
      </button>
      {open && (
        <div className="absolute inset-0 z-40 flex items-center justify-center p-4">
          <button aria-label="Close knowledge check" onClick={() => setOpen(false)} className="absolute inset-0 cursor-default bg-slate-950/70 backdrop-blur-sm" />
          <div className="relative z-10 w-full max-w-xl overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-slate-900 to-slate-950 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)] ring-1 ring-white/5 light:bg-white light:from-white light:to-slate-100">
            <div className={`h-1 w-full bg-gradient-to-r ${btn}`} />
            <div className="max-h-[80vh] overflow-y-auto p-5">
              <button onClick={() => setOpen(false)} className="absolute right-3 top-4 rounded-lg p-1 text-slate-400 hover:bg-white/5 hover:text-slate-200"><X className="h-4 w-4" /></button>
              <p className={`inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest ${text}`}>
                <GraduationCap className="h-4 w-4" /> Knowledge Check
              </p>
              <p className="mb-3 mt-1 text-[12px] text-slate-400 light:text-slate-600">Test what you learned in this module.</p>
              <KnowledgeCheck questions={questions} accent={accent} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
