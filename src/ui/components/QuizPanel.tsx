'use client';
import { useState } from 'react';

/**
 * Check-your-understanding questions for the CMOS inverter, focused on how the
 * device parameters the user can vary on the bench — width W, length L, and the
 * relative pMOS/nMOS sizing — change drive strength, delay, power and the
 * switching threshold. Each item is a tap-to-answer MCQ that reveals whether the
 * choice was right plus the reasoning. Pure presentation + local state; no engine
 * coupling, so it stays correct regardless of the live operating point.
 */
interface Question {
  id: string;
  prompt: string;
  options: string[];
  answer: number; // index into options
  explain: string;
}

const QUESTIONS: ReadonlyArray<Question> = [
  {
    id: 'width',
    prompt: 'You double the width W of both transistors (keeping L fixed). What happens to the inverter?',
    options: [
      'It switches faster, but draws more dynamic power and takes more area',
      'It switches slower, because a wider channel adds resistance',
      'The switching threshold moves up toward VDD',
      'Nothing — width does not matter for a digital inverter',
    ],
    answer: 0,
    explain:
      'Drive current scales with W/L, so doubling W roughly doubles the current and shrinks the RC delay (faster). The cost: wider devices have larger gate/junction capacitance (more dynamic power, ≈C·V²·f) and consume more area. With both transistors scaled equally, the switching threshold stays put.',
  },
  {
    id: 'length',
    prompt: 'You increase the channel length L of both transistors. The main effect is:',
    options: [
      'Higher drive current and lower delay',
      'Lower drive current (slower switching), but less leakage and weaker short-channel effects',
      'The output levels change from 0 / VDD to something in between',
      'The inverter stops working entirely',
    ],
    answer: 1,
    explain:
      'Current scales with W/L, so a longer L means less current — the inverter gets slower. In return, longer channels suppress leakage and short-channel effects, improving robustness. This is the classic speed-vs-leakage trade-off you are tuning when you change L.',
  },
  {
    id: 'sizing',
    prompt: 'For equal rise and fall times (a switching threshold near VDD/2), how should the pMOS width compare to the nMOS width?',
    options: [
      'Equal — Wp = Wn',
      'Narrower — Wp < Wn',
      'Wider — Wp ≈ 2–3× Wn',
      'Width has no effect on symmetry',
    ],
    answer: 2,
    explain:
      'Hole mobility (pMOS) is roughly 2–3× lower than electron mobility (nMOS), so an equal-width pMOS is the weaker device. Making the pMOS ~2–3× wider matches the pull-up and pull-down drive strengths, centering the switching threshold near VDD/2 and equalizing rise/fall times.',
  },
];

export function QuizPanel() {
  const [picked, setPicked] = useState<Record<string, number>>({});

  return (
    <section aria-label="CMOS inverter questions" className="glass rounded-2xl p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="eyebrow text-[11px] text-accent">Check your understanding</p>
          <p className="mt-0.5 text-[11px] text-ink-muted">Varying W, L &amp; sizing — tap an answer.</p>
        </div>
        {Object.keys(picked).length > 0 && (
          <button
            onClick={() => setPicked({})}
            className="rounded-md bg-black/[0.04] px-2.5 py-1 text-[11px] text-ink-muted ring-1 ring-black/10 hover:text-ink dark:bg-white/5 dark:ring-white/10"
          >
            Reset
          </button>
        )}
      </div>

      <ol className="mt-3 flex flex-col gap-4">
        {QUESTIONS.map((q, qi) => {
          const sel = picked[q.id];
          const answered = sel != null;
          const correct = answered && sel === q.answer;
          return (
            <li key={q.id} className="border-t border-[color:var(--hairline)] pt-3 first:border-t-0 first:pt-0">
              <p className="text-sm text-ink">
                <span className="font-medium text-accent">Q{qi + 1}.</span> {q.prompt}
              </p>
              <div className="mt-2 flex flex-col gap-1.5">
                {q.options.map((opt, oi) => {
                  const isSel = sel === oi;
                  const isAnswer = oi === q.answer;
                  // Before answering: neutral. After: highlight the correct option green,
                  // and a wrong pick red; leave the rest muted.
                  let cls = 'border-black/10 bg-black/[0.02] text-ink-muted dark:border-white/10 dark:bg-white/[0.03]';
                  if (answered && isAnswer) cls = 'border-emerald-500/50 bg-emerald-500/10 text-ink';
                  else if (answered && isSel && !isAnswer) cls = 'border-red-500/50 bg-red-500/10 text-ink';
                  return (
                    <button
                      key={oi}
                      onClick={() => setPicked((p) => ({ ...p, [q.id]: oi }))}
                      className={`flex items-start gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs transition hover:text-ink ${cls}`}
                    >
                      <span className="mt-0.5 font-mono text-[10px] opacity-70">{String.fromCharCode(65 + oi)}</span>
                      <span className="flex-1">{opt}</span>
                      {answered && isAnswer && <span className="text-emerald-500">✓</span>}
                      {answered && isSel && !isAnswer && <span className="text-red-500">✗</span>}
                    </button>
                  );
                })}
              </div>
              {answered && (
                <p className="mt-2 rounded-lg bg-black/[0.03] px-3 py-2 text-[11px] leading-relaxed text-ink-muted dark:bg-white/[0.04]">
                  <span className={`font-medium ${correct ? 'text-emerald-500' : 'text-red-500'}`}>
                    {correct ? 'Correct. ' : 'Not quite. '}
                  </span>
                  {q.explain}
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
