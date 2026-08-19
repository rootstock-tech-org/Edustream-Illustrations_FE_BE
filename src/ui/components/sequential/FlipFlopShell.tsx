'use client';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

/** Shared shell for a flip-flop card: title, live Q/Q̄ badges, a diagram
 *  slot, input controls + clock/reset buttons, and a truth table. */
export function FlipFlopShell({
  title,
  subtitle,
  q,
  vdd,
  onPulse,
  inputs,
  diagram,
  truthTable,
}: {
  title: string;
  subtitle: string;
  q: number;
  vdd: number;
  onPulse: () => void;
  inputs: ReactNode;
  diagram: ReactNode;
  truthTable: ReactNode;
}) {
  const qHigh = q > vdd / 2;
  return (
    <div className="glass flex flex-col gap-3 rounded-2xl p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-bold text-ink">{title}</h3>
          <p className="text-[11px] text-ink-muted">{subtitle}</p>
        </div>
        <div className="flex gap-1.5">
          <QBadge label="Q" high={qHigh} />
          <QBadge label="Q̄" high={!qHigh} />
        </div>
      </div>

      <div className="rounded-xl bg-[var(--surface-elevated)] p-2 ring-1 ring-black/10 dark:ring-white/10">{diagram}</div>

      <div className="flex flex-wrap items-center gap-2">
        {inputs}
        <button
          onClick={onPulse}
          className="ml-auto rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white shadow-[0_0_18px_var(--accent-glow)] transition hover:opacity-90"
        >
          Clock ↑ Pulse
        </button>
      </div>

      <div className="overflow-x-auto">{truthTable}</div>
    </div>
  );
}

function QBadge({ label, high }: { label: string; high: boolean }) {
  const prev = useRef(high);
  const [popping, setPopping] = useState(false);
  useEffect(() => {
    if (prev.current !== high) {
      prev.current = high;
      setPopping(true);
      const id = setTimeout(() => setPopping(false), 420);
      return () => clearTimeout(id);
    }
  }, [high]);
  return (
    <span
      className={`grid h-9 min-w-9 place-items-center rounded-lg px-1.5 font-mono text-sm font-bold transition-colors duration-300 ${
        popping ? 'node-pop' : ''
      } ${
        high
          ? 'bg-accent text-white shadow-[0_0_14px_var(--accent-glow)]'
          : 'bg-black/[0.06] text-ink-muted ring-1 ring-black/10 dark:bg-white/5 dark:ring-white/10'
      }`}
    >
      {label}={high ? 1 : 0}
    </span>
  );
}

/** A labelled toggle button for a boolean input (S, R, D, J, K, T…). */
export function ToggleButton({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 font-mono text-sm font-semibold transition ${
        on
          ? 'bg-accent text-white shadow-[0_0_14px_var(--accent-glow)]'
          : 'bg-black/[0.04] text-ink-muted ring-1 ring-black/10 hover:text-ink dark:bg-white/5 dark:ring-white/10'
      }`}
    >
      {label}={on ? 1 : 0}
    </button>
  );
}

/** Simple static reference truth table. */
export function TruthTable({ headers, rows }: { headers: readonly string[]; rows: ReadonlyArray<readonly string[]> }) {
  return (
    <table className="w-full min-w-[220px] border-collapse text-center text-[11px]">
      <thead>
        <tr>
          {headers.map((h) => (
            <th key={h} className="border-b border-[color:var(--hairline)] px-2 py-1 font-mono text-ink-muted">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            {row.map((cell, j) => (
              <td key={j} className="px-2 py-1 font-mono text-ink">
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
