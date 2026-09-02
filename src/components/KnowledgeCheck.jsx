/**
 * KnowledgeCheck.jsx
 * ------------------
 * A friendly "Ready for the knowledge check?" intro that reveals the module's
 * questions on demand, tracks the score and can be retaken. Shared by every tool.
 */
import { useState } from 'react';
import { GraduationCap, RotateCcw, CheckCircle2, ArrowRight } from 'lucide-react';

const ACCENTS = {
  brand: { text: 'text-brand-300', btn: 'from-brand-500 to-sky-500', chip: 'bg-brand-500/15 text-brand-300' },
  emerald: { text: 'text-emerald-300', btn: 'from-emerald-500 to-teal-500', chip: 'bg-emerald-500/15 text-emerald-300' },
  amber: { text: 'text-amber-300', btn: 'from-amber-500 to-orange-500', chip: 'bg-amber-500/15 text-amber-300' },
  rose: { text: 'text-rose-300', btn: 'from-rose-500 to-pink-500', chip: 'bg-rose-500/15 text-rose-300' },
  teal: { text: 'text-teal-300', btn: 'from-teal-500 to-emerald-500', chip: 'bg-teal-500/15 text-teal-300' },
  orange: { text: 'text-orange-300', btn: 'from-orange-500 to-amber-500', chip: 'bg-orange-500/15 text-orange-300' },
  indigo: { text: 'text-indigo-300', btn: 'from-indigo-500 to-violet-500', chip: 'bg-indigo-500/15 text-indigo-300' },
  cyan: { text: 'text-cyan-300', btn: 'from-cyan-500 to-sky-500', chip: 'bg-cyan-500/15 text-cyan-300' },
};

export default function KnowledgeCheck({ questions, accent = 'brand' }) {
  const a = ACCENTS[accent] ?? ACCENTS.brand;
  const [started, setStarted] = useState(false);
  const [answers, setAnswers] = useState({});
  const answered = Object.keys(answers).length;
  const correct = questions.filter((q) => answers[q.id] === q.answerId).length;
  const done = answered === questions.length;

  if (!started) {
    return (
      <div className="flex flex-col items-center rounded-2xl border border-white/10 bg-gradient-to-br from-slate-800/70 to-slate-950/85 p-5 text-center shadow-[0_10px_30px_-12px_rgba(0,0,0,0.8)] ring-1 ring-white/5">
        <span className={`grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br ${a.btn} text-slate-950 shadow-lg`}>
          <GraduationCap className="h-6 w-6" />
        </span>
        <p className="mt-3 text-sm font-bold text-slate-100">Ready for the knowledge check?</p>
        <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{questions.length} quick questions to lock in what you just explored.</p>
        <button
          onClick={() => setStarted(true)}
          className={`mt-4 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r ${a.btn} px-5 py-1.5 text-xs font-semibold text-slate-950 shadow-lg transition-transform hover:-translate-y-0.5`}
        >
          Start check <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Knowledge check</p>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${a.chip}`}>{correct}/{questions.length}</span>
      </div>
      {questions.map((q, qi) => {
        const chosen = answers[q.id];
        return (
          <div key={q.id} className="rounded-xl border border-white/10 bg-gradient-to-br from-slate-800/60 to-slate-950/70 p-2.5 shadow-[0_4px_14px_-6px_rgba(0,0,0,0.7)]">
            <p className="text-[11px] font-medium text-slate-100">{qi + 1}. {q.prompt}</p>
            <div className="mt-2 space-y-1">
              {q.options.map((opt) => {
                const isAnswered = Boolean(chosen);
                const isCorrect = opt.id === q.answerId;
                const isChosen = chosen === opt.id;
                return (
                  <button
                    key={opt.id}
                    disabled={isAnswered}
                    onClick={() => setAnswers((p) => (p[q.id] ? p : { ...p, [q.id]: opt.id }))}
                    className={`block w-full rounded-md border px-2 py-1 text-left text-[11px] transition-colors ${
                      !isAnswered
                        ? 'border-slate-700 bg-slate-800/40 hover:border-slate-600'
                        : isCorrect
                        ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-200'
                        : isChosen
                        ? 'border-rose-500/50 bg-rose-500/10 text-rose-200 light:text-rose-700'
                        : 'border-slate-800 text-slate-500'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            {chosen && <p className="mt-1.5 text-[10px] text-slate-400">{q.explanation}</p>}
          </div>
        );
      })}
      {done && (
        <div className="flex items-center justify-between rounded-xl border border-white/10 bg-gradient-to-br from-slate-800/60 to-slate-950/70 p-2.5">
          <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-200">
            <CheckCircle2 className={`h-4 w-4 ${a.text}`} /> You scored {correct}/{questions.length}
          </p>
          <button
            onClick={() => { setAnswers({}); setStarted(false); }}
            className="inline-flex items-center gap-1 rounded-full border border-slate-700 px-2.5 py-1 text-[10px] font-semibold text-slate-300 hover:border-slate-500"
          >
            <RotateCcw className="h-3 w-3" /> Retake
          </button>
        </div>
      )}
    </div>
  );
}
