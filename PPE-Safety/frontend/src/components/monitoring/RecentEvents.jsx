import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { TriangleAlert } from "lucide-react";

import { EmptyState } from "../common/States";
import { eventsApi } from "../../services/eventsApi";
import { formatWhen, whenOptions } from "../../utils/formatWhen";

/**
 * The last few things recorded, for the panel on a monitoring page.
 *
 * A monitoring page answers "what is happening now". This answers the question
 * an operator asks straight afterwards — has this been happening all morning,
 * or is it the first time today? Without it they would have to leave the
 * camera to find out.
 *
 * Deliberately short and read-only. Signing events off, filtering and
 * exporting all live on the Safety events page; duplicating them here would
 * be two places to keep in step and two places to look.
 *
 * @param {string} moduleId which capability's history to show
 * @param {number} limit how many to show
 * @param {number} refreshToken change this to pull the list again — pages pass
 *   something that moves when an alert clears, so a new event appears without
 *   the operator reloading
 */
export default function RecentEvents({ moduleId, limit = 5, refreshToken = 0 }) {
  const [page, setPage] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const next = await eventsApi.list({ module: moduleId, days: 7, limit });
        if (!cancelled) setPage(next);
      } catch {
        // A history that will not load is worth saying plainly, but it must
        // not take the live monitoring panel down with it.
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [moduleId, limit, refreshToken]);

  if (failed) {
    return (
      <EmptyState
        icon={TriangleAlert}
        title="Could not load the history"
        description="The monitoring above is unaffected. Try the Safety events page."
      />
    );
  }

  const events = page?.events;

  if (!page) {
    return <p className="text-sm text-text-muted px-5 py-6 text-center">Loading…</p>;
  }

  if (events.length === 0) {
    return (
      <EmptyState
        icon={TriangleAlert}
        title="Nothing in the last 7 days"
        description="Anything spotted while a camera is being watched is recorded here, with the picture that proves it."
      />
    );
  }

  return (
    <div className="px-5 pb-4">
      <ul className="divide-y divide-border -mx-5">
        {events.map((event) => (
          <li key={event.id} className="flex items-center gap-3 px-5 py-2.5">
            {event.snapshot ? (
              <img
                src={eventsApi.snapshotUrl(event.id)}
                alt=""
                loading="lazy"
                className="w-14 h-10 object-cover rounded-md border border-border bg-subtle shrink-0"
              />
            ) : (
              <span className="w-14 h-10 rounded-md bg-subtle border border-border shrink-0" />
            )}

            <div className="min-w-0 flex-1">
              {/* Wraps on a phone rather than being cut: "2 people working
                  without mas…" is the half of the sentence that matters. */}
              <p className="text-sm text-text truncate max-sm:whitespace-normal">
                {event.summary}
              </p>
              <p className="text-xs text-text-muted">
                {/* Named only when the list spans capabilities. On a module's
                    own page every row would say the same thing. */}
                {!moduleId && page.modules?.[event.module_id]
                  ? `${page.modules[event.module_id]} · `
                  : ""}
                {formatWhen(event.occurred_at, whenOptions(event))}
                {event.acknowledged ? " · signed off" : ""}
              </p>
            </div>
          </li>
        ))}
      </ul>

      <Link
        to="/events"
        className="block text-xs font-medium text-primary hover:underline pt-3"
      >
        See all safety events
      </Link>
    </div>
  );
}

