/**
 * ChallengePanel.jsx
 * ------------------
 * A spacious, focused overlay for an Engineering Challenge, so the task gets its
 * own room instead of being crammed into a side tab. The tool owns the state
 * (open, picked option, phase, message); this component just presents it well.
 */
import { Target, CheckCircle2, XCircle, X } from 'lucide-react';

const ACCENTS = {
  brand: { text: 'text-brand-300', chip: 'border-brand-400/60 bg-brand-500/15 text-brand-100 ring-1 ring-brand-400/30', bar: 'from-brand-500 to-brand-600' },
  teal: { text: 'text-teal-300', chip: 'border-teal-400/60 bg-teal-500/15 text-teal-100 ring-1 ring-teal-400/30', bar: 'from-teal-500 to-teal-600' },
  orange: { text: 'text-orange-300', chip: 'border-orange-400/60 bg-orange-500/15 text-orange-100 ring-1 ring-orange-400/30', bar: 'from-orange-500 to-orange-600' },
  indigo: { text: 'text-indigo-300', chip: 'border-indigo-400/60 bg-indigo-500/15 text-indigo-100 ring-1 ring-indigo-400/30', bar: 'from-indigo-500 to-indigo-600' },
  violet: { text: 'text-violet-300', chip: 'border-violet-400/60 bg-violet-500/15 text-violet-100 ring-1 ring-violet-400/30', bar: 'from-violet-500 to-violet-600' },
  emerald: { text: 'text-emerald-300', chip: 'border-emerald-400/60 bg-emerald-500/15 text-emerald-100 ring-1 ring-emerald-400/30', bar: 'from-emerald-500 to-emerald-600' },
  cyan: { text: 'text-cyan-300', chip: 'border-cyan-400/60 bg-cyan-500/15 text-cyan-100 ring-1 ring-cyan-400/30', bar: 'from-cyan-500 to-cyan-600' },
  amber: { text: 'text-amber-300', chip: 'border-amber-400/60 bg-amber-500/15 text-amber-100 ring-1 ring-amber-400/30', bar: 'from-amber-500 to-amber-600' },
};

export default function ChallengePanel({ open, onClose, accent = 'brand', title, goal, brief, options = [], picked, onPick, phase = 'todo', message }) {
  if (!open) return null;
  const a = ACCENTS[accent] ?? ACCENTS.brand;
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center p-4">
      <button aria-label="Close challenge" onClick={onClose} className="absolute inset-0 cursor-default bg-slate-950/70 backdrop-blur-sm" />
      <div className="relative z-10 w-full max-w-xl overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-slate-900 to-slate-950 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)] ring-1 ring-white/5 light:bg-white light:from-white light:to-slate-100">
        <div className={`h-1 w-full bg-gradient-to-r ${a.bar}`} />
        <div className="p-5">
          <button onClick={onClose} className="absolute right-3 top-4 rounded-lg p-1 text-slate-400 hover:bg-white/5 hover:text-slate-200"><X className="h-4 w-4" /></button>
          <p className={`inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest ${a.text} light:text-slate-600`}>
            <Target className="h-4 w-4" /> Engineering Challenge
          </p>
          <h3 className="mt-1.5 text-xl font-bold text-white light:text-slate-900">{title}</h3>
          <p className="mt-1 text-[13px] leading-relaxed text-slate-300 light:text-slate-600">{goal}</p>

          {brief && (
            <div className="mt-4 rounded-xl border border-slate-700/70 bg-slate-800/40 p-3.5 text-[12.5px] leading-relaxed text-slate-300 light:border-slate-300 light:bg-slate-100 light:text-slate-700">
              {brief}
            </div>
          )}

          {options.length > 0 && (
            <div className="mt-4 grid grid-cols-2 gap-2">
              {options.map((o) => (
                <button key={o.id} onClick={() => onPick(o.id)}
                  className={`rounded-xl border p-3 text-left transition-all duration-150 active:translate-y-px ${
                    picked === o.id
                      ? a.chip
                      : 'border-slate-700/80 bg-slate-800/50 text-slate-300 hover:-translate-y-0.5 hover:border-slate-500 light:border-slate-300 light:bg-slate-50 light:text-slate-600'
                  }`}>
                  <span className="block text-[13px] font-semibold">{o.label}</span>
                  {o.sub && <span className="mt-0.5 block text-[10px] opacity-80">{o.sub}</span>}
                </button>
              ))}
            </div>
          )}

          {phase === 'won' && (
            <div className="mt-4 rounded-xl border border-emerald-500/50 bg-emerald-500/10 p-3.5">
              <p className="inline-flex items-center gap-1.5 text-sm font-bold text-emerald-300 light:text-emerald-700"><CheckCircle2 className="h-4 w-4" /> Solved</p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-slate-300 light:text-slate-700">{message}</p>
            </div>
          )}
          {phase === 'fail' && (
            <div className="mt-4 rounded-xl border border-rose-500/50 bg-rose-500/10 p-3.5">
              <p className="inline-flex items-center gap-1.5 text-sm font-bold text-rose-300 light:text-rose-700"><XCircle className="h-4 w-4" /> Not yet</p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-slate-300 light:text-slate-700">{message}</p>
            </div>
          )}
          {phase === 'todo' && message && (
            <p className="mt-4 text-[12px] leading-relaxed text-slate-400 light:text-slate-500">{message}</p>
          )}
        </div>
      </div>
    </div>
  );
}
