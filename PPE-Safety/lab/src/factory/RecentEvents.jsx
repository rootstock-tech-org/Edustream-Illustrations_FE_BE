import { useState } from "react";

import { ACCUSE_MIN_VOTES } from "../engine/thresholds.js";

/**
 * Recent Events — what the supervisor has been told, newest first. Every row
 * is a real transition of the event record: a problem opening, escalating,
 * or resolving after the problem has been absent long enough.
 */
const VISIBLE = 6;

function pill(entry) {
  if (entry.kind === "resolved") return { label: "Resolved", cls: "border-line bg-panel text-ink-faint" };
  if (entry.severity === "high") return { label: "Violation", cls: "border-violation/60 bg-violation-dim text-violation" };
  return { label: "Warning", cls: "border-hazard/60 bg-hazard-dim text-hazard" };
}

function text(entry) {
  if (entry.kind === "escalated") return `${entry.summary} — escalated to ${entry.severity}`;
  if (entry.kind === "resolved") return `${entry.summary} — resolved`;
  return entry.summary;
}

export default function RecentEvents({ log }) {
  const [all, setAll] = useState(false);
  const rows = all ? log : log.slice(0, VISIBLE);

  return (
    <section className="panel min-w-0 flex min-h-0 flex-col p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">Recent Events</h2>
        {log.length > VISIBLE && (
          <button
            type="button"
            onClick={() => setAll((current) => !current)}
            className="text-xs font-medium text-vision hover:underline"
          >
            {all ? "Show fewer" : "View All"}
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="mt-3 text-xs leading-relaxed text-ink-faint">
          No events yet. A violation is only raised after {ACCUSE_MIN_VOTES} agreeing sightings.
        </p>
      ) : (
        <ul className={`mt-2.5 space-y-2 ${all ? "max-h-64 overflow-y-auto pr-1" : ""}`}>
          {rows.map((entry) => {
            const look = pill(entry);
            return (
              <li key={entry.id} className="flex items-start gap-2 text-xs">
                <span
                  aria-hidden="true"
                  className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                    entry.kind === "resolved" ? "bg-ink-faint" : entry.severity === "high" ? "bg-violation" : "bg-hazard"
                  }`}
                />
                <span className="machine shrink-0 text-[11px] text-ink-faint">
                  {new Date(entry.wall).toLocaleTimeString([], { hour12: false })}
                </span>
                <span className="min-w-0 flex-1 leading-snug text-ink">{text(entry)}</span>
                <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium ${look.cls}`}>
                  {look.label}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
