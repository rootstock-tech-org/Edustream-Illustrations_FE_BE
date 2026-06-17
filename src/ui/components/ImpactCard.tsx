'use client';
import { formatQuantity, type SiUnit } from '@/domain/units';
import { useImpact } from '@/ui/hooks/useImpact';
import type { ImpactLine } from '@/domain/education/impact';

/**
 * "What just happened" — the structured 5-part explanation of the last change.
 * Every number is a measured before/after delta; the prose is curated mechanism
 * keyed to the change that actually occurred (see domain/education).
 */
export function ImpactCard() {
  const impact = useImpact();
  if (!impact || impact.whatChanged.length === 0) return null;

  return (
    <section aria-label="Impact of last change" className="flex flex-col gap-3 glass rounded-2xl p-4">
      <h2 className="text-sm font-semibold text-ink">What changed</h2>

      <div className="flex flex-wrap gap-1.5">
        {impact.whatChanged.map((c) => (
          <span key={c.key} className="rounded-md bg-surface px-2 py-1 text-xs ring-1 ring-white/10">
            <span className="text-ink-muted">{c.label}: </span>
            <span className="font-mono text-ink">{c.from} → {c.to}</span>
            {c.percent !== null && <Pct value={c.percent} />}
          </span>
        ))}
      </div>

      {impact.physical && (
        <Row icon="⚛" label="Physical effect">
          <p className="text-ink-muted">{impact.physical}</p>
        </Row>
      )}

      {impact.deviceImpact.length > 0 && (
        <Row icon="▣" label="Device impact">
          <DeltaList lines={impact.deviceImpact} />
        </Row>
      )}

      <Row icon="⛓" label="Circuit impact">
        <DeltaList lines={impact.circuitImpact} />
      </Row>

      {impact.tradeoff && (
        <Row icon="⚖" label="Design tradeoff">
          <p className="text-ink-muted">{impact.tradeoff}</p>
        </Row>
      )}
    </section>
  );
}

function Row({ icon, label, children }: { icon: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2 text-xs">
      <span aria-hidden className="select-none text-ink-muted">{icon}</span>
      <div className="flex-1">
        <span className="font-medium text-ink">{label}</span>
        <div className="mt-0.5">{children}</div>
      </div>
    </div>
  );
}

function DeltaList({ lines }: { lines: readonly ImpactLine[] }) {
  return (
    <ul className="flex flex-col gap-1">
      {lines.map((l) => (
        <li key={l.label} className="flex items-baseline justify-between gap-3">
          <span className="text-ink-muted">{l.label}</span>
          <span className="flex items-baseline gap-1.5 font-mono">
            <span className="text-ink-muted">{fmt(l.delta.from, l.delta.unit)}</span>
            <span className="text-ink-muted">→</span>
            <span className="text-ink">{fmt(l.delta.to, l.delta.unit)}</span>
            <Pct value={l.delta.percent} />
          </span>
        </li>
      ))}
    </ul>
  );
}

function Pct({ value }: { value: number }) {
  // Neutral: arrow shows direction only — "good vs bad" depends on the metric,
  // which is exactly the tradeoff the student should reason about.
  const up = value >= 0;
  return (
    <span className="ml-1 font-mono text-[10px] text-accent">
      {up ? '▲' : '▼'} {Math.abs(value).toFixed(0)}%
    </span>
  );
}

const fmt = (v: number, unit: SiUnit) => formatQuantity({ value: v, unit });
