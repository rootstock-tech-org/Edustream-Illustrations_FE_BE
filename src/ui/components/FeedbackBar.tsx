'use client';
import { useEffect, useRef, useState } from 'react';

type Vote = 'up' | 'down' | null;
interface Stored {
  vote: Vote;
  note: string;
  at: number;
}

const keyFor = (id: string) => `edustream:feedback:${id}`;

/**
 * Per-illustration feedback control: a thumbs up / thumbs down vote plus a free
 * note box. Every input is persisted immediately to localStorage under a key
 * unique to this illustration `id`, so the exact input stays put across reloads.
 */
export function FeedbackBar({
  id,
  className = '',
  inline = false,
}: {
  id: string;
  className?: string;
  /** Single-row layout, for the bar pinned to the bottom of the bench. */
  inline?: boolean;
}) {
  const [vote, setVote] = useState<Vote>(null);
  const [note, setNote] = useState('');
  const [ready, setReady] = useState(false);
  const [savedAt, setSavedAt] = useState(0);
  // Mirror of the live values so a save always writes the latest vote AND note
  // together (avoids stale-closure overwrites when both change quickly).
  const data = useRef<{ vote: Vote; note: string }>({ vote: null, note: '' });

  // Load any previously stored feedback for this illustration (client-only).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(keyFor(id));
      if (raw) {
        const s = JSON.parse(raw) as Stored;
        data.current = { vote: s.vote ?? null, note: s.note ?? '' };
        setVote(data.current.vote);
        setNote(data.current.note);
      }
    } catch {
      /* ignore corrupt/unavailable storage */
    }
    setReady(true);
  }, [id]);

  const save = () => {
    const payload: Stored = { ...data.current, at: Date.now() };
    try {
      localStorage.setItem(keyFor(id), JSON.stringify(payload));
      setSavedAt(payload.at);
    } catch {
      /* storage full/blocked — keep UI state anyway */
    }
  };

  const chooseVote = (v: Vote) => {
    const next = vote === v ? null : v; // tapping the active vote clears it
    data.current.vote = next;
    setVote(next);
    save();
  };

  const onNote = (v: string) => {
    data.current.note = v;
    setNote(v);
    save();
  };

  const btn = (active: boolean, tone: 'up' | 'down') =>
    `grid h-8 w-8 place-items-center rounded-lg text-base ring-1 transition ${
      active
        ? tone === 'up'
          ? 'bg-emerald-500/15 text-emerald-500 ring-emerald-500/40'
          : 'bg-rose-500/15 text-rose-500 ring-rose-500/40'
        : 'bg-black/[0.04] text-ink-muted ring-black/10 hover:text-ink dark:bg-white/5 dark:ring-white/10'
    }`;

  const votes = (
    <>
      <span className="whitespace-nowrap text-[11px] font-medium text-ink-muted">Was this illustration helpful?</span>
      <button type="button" aria-pressed={vote === 'up'} aria-label="Thumbs up" title="Thumbs up" onClick={() => chooseVote('up')} className={btn(vote === 'up', 'up')}>
        👍
      </button>
      <button type="button" aria-pressed={vote === 'down'} aria-label="Thumbs down" title="Thumbs down" onClick={() => chooseVote('down')} className={btn(vote === 'down', 'down')}>
        👎
      </button>
    </>
  );

  const noteBox = (extra: string) => (
    <textarea
      value={note}
      onChange={(e) => onNote(e.target.value)}
      placeholder="Add a note…"
      rows={inline ? 1 : 2}
      className={`w-full rounded-lg border border-[color:var(--hairline)] bg-black/[0.02] px-2 py-1.5 text-[12px] text-ink outline-none ring-0 transition placeholder:text-ink-muted focus:border-[color:var(--accent)] dark:bg-white/[0.03] ${extra}`}
    />
  );

  // Inline: one row, the note box taking the slack — for the pinned bottom bar.
  if (inline) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        {votes}
        <div className="min-w-0 flex-1">{noteBox('resize-none')}</div>
        {ready && savedAt > 0 && <span className="shrink-0 text-[10px] text-emerald-500">Saved ✓</span>}
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-2 border-t border-[color:var(--hairline)] pt-2 ${className}`}>
      <div className="flex items-center gap-2">
        {votes}
        {ready && savedAt > 0 && <span className="ml-auto text-[10px] text-emerald-500">Saved ✓</span>}
      </div>
      {noteBox('resize-y')}
    </div>
  );
}
