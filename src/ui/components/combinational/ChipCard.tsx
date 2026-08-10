'use client';
import type { ReactNode } from 'react';
import { FeedbackBar } from '../FeedbackBar';

/**
 * Shared shell for a combinational-logic card: coloured eyebrow + title,
 * description, a "many→one" style badge, the chip diagram slot, and a truth
 * table slot — mirrors FlipFlopShell's layout so the two sections feel like
 * one coherent app.
 */
export function ChipCard({
  eyebrow,
  eyebrowColor,
  description,
  badge,
  diagram,
  controls,
  truthTable,
}: {
  eyebrow: string;
  eyebrowColor: string;
  description: string;
  badge: string;
  diagram: ReactNode;
  controls?: ReactNode;
  truthTable: ReactNode;
}) {
  return (
    <div className="glass flex flex-col gap-3 rounded-2xl p-4">
      <div>
        <h3 className="eyebrow text-sm" style={{ color: eyebrowColor }}>
          {eyebrow}
        </h3>
        <p className="mt-1 text-[11px] text-ink-muted">{description}</p>
        <span
          className="mt-2 inline-block rounded-md px-2 py-1 font-mono text-[10px] font-semibold ring-1"
          style={{ color: eyebrowColor, borderColor: eyebrowColor, boxShadow: `inset 0 0 0 1px ${eyebrowColor}55` }}
        >
          {badge}
        </span>
      </div>

      <div className="rounded-xl bg-[var(--surface-elevated)] p-2 ring-1 ring-black/10 dark:ring-white/10">{diagram}</div>

      {controls && <div className="flex flex-wrap gap-2">{controls}</div>}

      <div className="overflow-x-auto">{truthTable}</div>

      <FeedbackBar id={`combinational-${eyebrow}`} />
    </div>
  );
}
