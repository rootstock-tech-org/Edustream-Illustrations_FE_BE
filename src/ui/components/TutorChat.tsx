'use client';
import { useState } from 'react';
import { useTutorStore } from '@/state/tutor.store';

const SUGGESTIONS = [
  'Why is the output where it is?',
  'What does the switching threshold mean?',
  'How does raising temperature affect leakage?',
];

/** Grounded AI tutor panel. Talks only to the server route — no keys client-side. */
export function TutorChat() {
  const messages = useTutorStore((s) => s.messages);
  const streaming = useTutorStore((s) => s.streaming);
  const ask = useTutorStore((s) => s.ask);
  const [input, setInput] = useState('');

  const send = (q: string) => {
    const question = q.trim();
    if (!question || streaming) return;
    setInput('');
    void ask(question);
  };

  return (
    <section aria-label="AI tutor" className="flex flex-col gap-3 glass rounded-2xl p-4">
      <h2 className="text-sm font-semibold text-ink">AI Tutor</h2>

      <div className="flex max-h-64 flex-col gap-2 overflow-y-auto" aria-live="polite">
        {messages.length === 0 && (
          <p className="text-xs text-ink-muted">
            Ask about the current device. Answers are grounded in the live simulation.
          </p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`rounded-lg p-2 text-sm ${
              m.role === 'user' ? 'bg-accent/15 text-ink' : 'bg-black/20 text-ink-muted'
            }`}
          >
            <span className="mr-1 text-[10px] uppercase tracking-wide text-ink-muted">
              {m.role === 'user' ? 'You' : 'Tutor'}
            </span>
            <p className="whitespace-pre-wrap">{m.content || (streaming ? '…' : '')}</p>
          </div>
        ))}
      </div>

      {messages.length === 0 && (
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => send(s)}
              className="rounded-full bg-surface px-2 py-1 text-[11px] text-ink-muted ring-1 ring-white/10 hover:text-ink"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex gap-2"
      >
        <label htmlFor="tutor-input" className="sr-only">Ask the tutor</label>
        <input
          id="tutor-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question…"
          className="min-w-0 flex-1 rounded-md bg-surface px-2 py-1.5 text-sm text-ink ring-1 ring-white/10"
        />
        <button
          type="submit"
          disabled={streaming}
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-surface disabled:opacity-50"
        >
          {streaming ? '…' : 'Send'}
        </button>
      </form>
    </section>
  );
}
