/**
 * ModelOverview.jsx
 * -----------------
 * A small intro card shown on top of each tool's 3D scene when the module opens,
 * so the user first reads what the model is and what it does, then explores it.
 * Dismissible, with a compact "What am I looking at?" button to reopen.
 */
import { useState } from 'react';
import { Info, X } from 'lucide-react';

const ACCENTS = {
  brand: { text: 'text-brand-300', dot: 'bg-brand-400' },
  emerald: { text: 'text-emerald-300', dot: 'bg-emerald-400' },
  violet: { text: 'text-violet-300', dot: 'bg-violet-400' },
  amber: { text: 'text-amber-300', dot: 'bg-amber-400' },
  rose: { text: 'text-rose-300', dot: 'bg-rose-400' },
  teal: { text: 'text-teal-300', dot: 'bg-teal-400' },
  orange: { text: 'text-orange-300', dot: 'bg-orange-400' },
  indigo: { text: 'text-indigo-300', dot: 'bg-indigo-400' },
  cyan: { text: 'text-cyan-300', dot: 'bg-cyan-400' },
};

export default function ModelOverview({ title, points, accent = 'brand' }) {
  const [open, setOpen] = useState(false);
  const a = ACCENTS[accent] ?? ACCENTS.brand;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="absolute left-1/2 top-4 z-30 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900/95 light:bg-white px-3 py-1.5 text-xs font-medium text-slate-300 backdrop-blur hover:border-slate-500"
      >
        <Info className={`h-3.5 w-3.5 ${a.text}`} /> What am I looking at?
      </button>
    );
  }

  return (
    <div className="absolute left-1/2 top-4 z-30 w-[min(92vw,460px)] -translate-x-1/2 rounded-2xl border border-slate-700 bg-slate-900/95 light:bg-white p-3.5 shadow-[0_18px_50px_-12px_rgba(0,0,0,0.85)] backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className={`grid h-7 w-7 place-items-center rounded-lg bg-slate-800 ${a.text}`}><Info className="h-4 w-4" /></span>
          <p className="text-sm font-bold text-slate-100">{title}</p>
        </div>
        <button onClick={() => setOpen(false)} className="shrink-0 text-slate-500 hover:text-slate-200"><X className="h-4 w-4" /></button>
      </div>
      <ul className="mt-2.5 space-y-1.5">
        {points.map((p, i) => (
          <li key={i} className="flex gap-2 text-[11px] leading-relaxed text-slate-300">
            <span className={`mt-1.5 h-1 w-1 shrink-0 rounded-full ${a.dot}`} />
            <span>{p}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2.5 text-[10px] text-slate-500">Close this to explore the model.</p>
    </div>
  );
}
