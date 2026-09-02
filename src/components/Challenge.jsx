/**
 * Challenge.jsx
 * -------------
 * A reusable "Engineering Challenge" card: shows a mission goal and gives live
 * pass / fail feedback driven by the tool's simulation. The tool computes the
 * phase ('todo' | 'won' | 'fail') and a message from its live readings; this
 * component just presents it, turning a sandbox into an active-learning task.
 */
import { Target, CheckCircle2, XCircle } from 'lucide-react';

const ACCENTS = {
  teal: 'text-teal-300 light:text-teal-700',
  brand: 'text-brand-300 light:text-brand-700',
  emerald: 'text-emerald-300 light:text-emerald-700',
  amber: 'text-amber-300 light:text-amber-700',
  rose: 'text-rose-300 light:text-rose-700',
  indigo: 'text-indigo-300 light:text-indigo-700',
  violet: 'text-violet-300 light:text-violet-700',
  orange: 'text-orange-300 light:text-orange-700',
  cyan: 'text-cyan-300 light:text-cyan-700',
};

export default function Challenge({ accent = 'teal', title, goal, phase = 'todo', message }) {
  const a = ACCENTS[accent] ?? ACCENTS.teal;
  return (
    <div className="space-y-2.5">
      <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-2.5">
        <p className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider ${a}`}>
          <Target className="h-3.5 w-3.5" /> Engineering Challenge
        </p>
        <p className="mt-1 text-sm font-bold text-slate-100">{title}</p>
        <p className="mt-1 text-[11px] leading-relaxed text-slate-300">{goal}</p>
      </div>

      {phase === 'won' && (
        <div className="rounded-lg border border-emerald-500/50 bg-emerald-500/10 p-2.5">
          <p className="inline-flex items-center gap-1.5 text-sm font-bold text-emerald-300 light:text-emerald-700"><CheckCircle2 className="h-4 w-4" /> Solved</p>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-300">{message}</p>
        </div>
      )}
      {phase === 'fail' && (
        <div className="rounded-lg border border-rose-500/50 bg-rose-500/10 p-2.5">
          <p className="inline-flex items-center gap-1.5 text-sm font-bold text-rose-300 light:text-rose-700"><XCircle className="h-4 w-4" /> Not yet</p>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-300">{message}</p>
        </div>
      )}
      {phase === 'todo' && (
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
          <p className="text-[11px] leading-relaxed text-slate-400">{message}</p>
        </div>
      )}
    </div>
  );
}
