import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  Download,
  RefreshCw,
  TriangleAlert,
  X,
} from "lucide-react";

import Badge from "../components/common/Badge";
import Button from "../components/common/Button";
import Panel from "../components/common/Panel";
import { EmptyState, ErrorState, LoadingState } from "../components/common/States";
import { DISPOSITIONS, eventsApi, SEVERITIES } from "../services/eventsApi";
import { formatWhen, whenOptions } from "../utils/formatWhen";

/**
 * Safety event history.
 *
 * The list answers "what has happened", but the point of the page is the
 * column on the right: an operator looking at the evidence and saying whether
 * the system was right. Those judgements are what the accuracy figure on the
 * reports page is built from, so signing events off is not administration —
 * it is the measurement.
 *
 * Filters live in component state rather than the URL for now. Making them
 * shareable is worth doing when there is a second person to share them with.
 */

const PAGE_SIZE = 25;

const SEVERITY_TONE = {
  high: "danger",
  medium: "warning",
  low: "neutral",
};

// 365 is the API's own ceiling, not a round number: the history routes
// refuse anything larger outright rather than clamping. The widest window
// exists because an event can be older than the day it was recorded on —
// footage replayed from an archive is stamped with the clock burned into
// it, so a recording reviewed today can land months back and would
// otherwise be invisible from this page.
const PERIODS = [
  { value: 1, label: "Today" },
  { value: 7, label: "7 days" },
  { value: 30, label: "30 days" },
  { value: 90, label: "90 days" },
  { value: 365, label: "1 year" },
];

export default function Events() {
  const [filters, setFilters] = useState({
    days: 7,
    module: "",
    severity: "",
    acknowledged: "",
  });

  const [page, setPage] = useState(null);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);

  // Bumped to ask for the same query again, after a failure or a manual
  // refresh. A counter rather than a flag, so two refreshes in a row are two
  // requests rather than one.
  const [reloadToken, setReloadToken] = useState(0);

  const query = useMemo(
    () => ({
      ...filters,
      acknowledged:
        filters.acknowledged === "" ? undefined : filters.acknowledged === "yes",
      limit: PAGE_SIZE,
      offset,
    }),
    [filters, offset],
  );

  // What has actually been fetched. Loading is the difference between this and
  // what is being asked for, rather than a flag that has to be set true in one
  // place and false in three.
  const asked = `${JSON.stringify(query)}#${reloadToken}`;
  const [answered, setAnswered] = useState(null);
  const loading = answered !== asked;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const next = await eventsApi.list(query);
        if (cancelled) return;

        setPage(next);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err?.message || "Could not load the history.");
      } finally {
        // Cancelled means the filters moved on while this was in flight. Its
        // answer describes a question nobody is asking any more, and letting
        // it land would put the previous filter's events on screen under the
        // new filter's heading.
        if (!cancelled) setAnswered(asked);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [query, asked]);

  const refresh = useCallback(() => setReloadToken((token) => token + 1), []);

  const setFilter = (key, value) => {
    setOffset(0);
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const onSignedOff = (updated) => {
    // Patched in place rather than refetching: the operator is working down a
    // list, and having it reorder under them after every sign-off is how a
    // row gets missed.
    setPage((current) =>
      current
        ? {
            ...current,
            events: current.events.map((event) =>
              event.id === updated.id ? updated : event,
            ),
          }
        : current,
    );
    setSelected(updated);
  };

  const events = page?.events ?? [];
  const modules = page?.modules ?? {};
  const total = page?.total ?? 0;

  // What an export of this same filter would leave out. The cap is the
  // server's own number, served beside the total rather than copied here,
  // so the sentence beneath the button cannot promise something the file
  // does not do. Absent — an older backend — nothing is claimed at all.
  const exportLimit = page?.export_limit;
  const exportTruncates = Boolean(exportLimit) && total > exportLimit;

  return (
    <div className="p-4 sm:p-6 max-w-[1600px] mx-auto space-y-5 animate-fade-in">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-text tracking-tight">
            Safety events
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Everything the system has spotted, with the picture that proves it.
          </p>
        </div>

        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              icon={Download}
              onClick={() => {
                window.location.href = eventsApi.exportXlsxUrl({
                  days: filters.days,
                  module: filters.module,
                  severity: filters.severity,
                  acknowledged:
                    filters.acknowledged === ""
                      ? undefined
                      : filters.acknowledged === "yes",
                });
              }}
            >
              Export for Excel
            </Button>
            <Button variant="ghost" icon={RefreshCw} onClick={refresh} aria-label="Refresh" />
          </div>

          {exportTruncates && (
            <p className="text-xs text-text-muted text-right max-w-[16rem]">
              Exports the {exportLimit} most recent of {total} — narrow the
              filters for the rest.
            </p>
          )}
        </div>
      </header>

      <Panel className="px-5 py-4" as="div">
        <div className="flex flex-wrap items-end gap-4">
          <Filter label="Period">
            <Select
              value={filters.days}
              onChange={(value) => setFilter("days", Number(value))}
              options={PERIODS.map((p) => ({ value: p.value, label: p.label }))}
            />
          </Filter>

          <Filter label="What">
            <Select
              value={filters.module}
              onChange={(value) => setFilter("module", value)}
              options={[
                { value: "", label: "Everything" },
                ...Object.entries(modules).map(([value, label]) => ({
                  value,
                  label,
                })),
              ]}
            />
          </Filter>

          <Filter label="Severity">
            <Select
              value={filters.severity}
              onChange={(value) => setFilter("severity", value)}
              options={[{ value: "", label: "Any" }, ...SEVERITIES]}
            />
          </Filter>

          <Filter label="Signed off">
            <Select
              value={filters.acknowledged}
              onChange={(value) => setFilter("acknowledged", value)}
              options={[
                { value: "", label: "Any" },
                { value: "no", label: "Not yet" },
                { value: "yes", label: "Done" },
              ]}
            />
          </Filter>

          <p className="text-xs text-text-muted ml-auto pb-2">
            {total === 0
              ? "Nothing matches"
              : `${total} event${total === 1 ? "" : "s"}`}
          </p>
        </div>
      </Panel>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_400px] gap-5 items-start">
        <Panel noPadding>
          {loading ? (
            <LoadingState label="Loading the history…" rows={5} className="p-5" />
          ) : error ? (
            <ErrorState detail={error} onRetry={refresh} />
          ) : events.length === 0 ? (
            <EmptyState
              icon={TriangleAlert}
              title="Nothing recorded in this period"
              description="Events are saved as they happen while a camera is being watched. Widen the period, or start watching a camera."
            />
          ) : (
            <>
              <ul className="divide-y divide-border">
                {events.map((event) => (
                  <EventRow
                    key={event.id}
                    event={event}
                    moduleName={modules[event.module_id] || event.module_id}
                    selected={selected?.id === event.id}
                    onSelect={() => setSelected(event)}
                  />
                ))}
              </ul>

              {total > PAGE_SIZE && (
                <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-border">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={offset === 0}
                    onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                  >
                    Newer
                  </Button>
                  <span className="text-xs text-text-muted">
                    {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={offset + PAGE_SIZE >= total}
                    onClick={() => setOffset(offset + PAGE_SIZE)}
                  >
                    Older
                  </Button>
                </div>
              )}
            </>
          )}
        </Panel>

        {/* Keyed on the event, so opening another one mounts a fresh panel
            rather than carrying the previous note across to it. */}
        <EventDetail
          key={selected?.id ?? "none"}
          event={selected}
          moduleName={selected ? modules[selected.module_id] : null}
          onSignedOff={onSignedOff}
          onClose={() => setSelected(null)}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function EventRow({ event, moduleName, selected, onSelect }) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? "true" : undefined}
        className={`w-full text-left px-5 py-3.5 flex items-start gap-4
                    transition hover:bg-subtle cursor-pointer
                    focus-visible:outline-2 focus-visible:-outline-offset-2
                    focus-visible:outline-primary
                    ${selected ? "bg-primary-soft/40" : ""}`}
      >
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={SEVERITY_TONE[event.severity] || "neutral"} dot={false}>
              {moduleName}
            </Badge>
            {!event.acknowledged && (
              <Badge variant="warning">Needs sign-off</Badge>
            )}
            {event.disposition === "false_alarm" && (
              <Badge variant="neutral" dot={false}>
                False alarm
              </Badge>
            )}
          </div>

          <p className="text-sm font-medium text-text truncate max-sm:whitespace-normal">
            {event.summary}
          </p>

          <p className="text-xs text-text-muted">
            {formatWhen(event.occurred_at, whenOptions(event))}
            {event.ended_at ? ` · lasted ${duration(event)}` : " · still open"}
          </p>
        </div>

        {event.snapshot && (
          <img
            src={eventsApi.snapshotUrl(event.id)}
            alt=""
            loading="lazy"
            className="w-24 h-16 object-cover rounded-lg border border-border shrink-0 bg-subtle"
          />
        )}
      </button>
    </li>
  );
}

/* ------------------------------------------------------------------ */

function EventDetail({ event, moduleName, onSignedOff, onClose }) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(null);
  const [failed, setFailed] = useState(null);

  if (!event) {
    return (
      <Panel title="Event detail">
        <EmptyState
          icon={TriangleAlert}
          title="Nothing selected"
          description="Choose an event to see the picture and sign it off."
        />
      </Panel>
    );
  }

  const signOff = async (disposition) => {
    setSaving(disposition);
    setFailed(null);

    try {
      onSignedOff(await eventsApi.acknowledge(event.id, disposition, note));
    } catch (err) {
      setFailed(err?.message || "Could not save that.");
    } finally {
      setSaving(null);
    }
  };

  return (
    <Panel
      title={moduleName || "Event"}
      action={
        <Button variant="ghost" size="sm" icon={X} onClick={onClose} aria-label="Close" />
      }
    >
      <div className="px-5 pb-5 space-y-4">
        {event.snapshot ? (
          <img
            src={eventsApi.snapshotUrl(event.id)}
            alt={`The scene when this was recorded: ${event.summary}`}
            className="w-full rounded-lg border border-border bg-slate-900"
          />
        ) : (
          <p className="text-xs text-text-muted border border-border rounded-lg px-3 py-6 text-center">
            No picture was saved for this event.
          </p>
        )}

        <div className="space-y-1">
          <p className="text-sm font-medium text-text">{event.summary}</p>
          <p className="text-xs text-text-secondary">
            {formatWhen(event.occurred_at, whenOptions(event))} ·{" "}
            {event.ended_at ? `lasted ${duration(event)}` : "still open"} ·{" "}
            {event.severity} severity
          </p>
          <ClockLine details={event.details} />
        </div>

        {clockFiltered(event.details).length > 0 && (
          <dl className="text-xs border border-border rounded-lg divide-y divide-border">
            {clockFiltered(event.details).map(([key, value]) => (
              <div key={key} className="flex justify-between gap-3 px-3 py-2">
                <dt className="text-text-secondary">{humanise(key)}</dt>
                <dd className="text-text font-medium text-right">
                  {formatDetail(value)}
                </dd>
              </div>
            ))}
          </dl>
        )}

        {event.acknowledged ? (
          <div className="rounded-lg bg-subtle border border-border px-3 py-3 space-y-1">
            <p className="text-xs font-medium text-text flex items-center gap-1.5">
              <Check size={13} aria-hidden="true" />
              Signed off as{" "}
              {DISPOSITIONS.find((d) => d.value === event.disposition)?.label ||
                event.disposition}
            </p>
            {event.note && (
              <p className="text-xs text-text-secondary">{event.note}</p>
            )}
            <p className="text-[11px] text-text-muted">
              {formatWhen(event.acknowledged_at)}
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            <label className="block">
              <span className="text-xs font-medium text-text-secondary">
                Note (optional)
              </span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                maxLength={1000}
                placeholder="What was done about it?"
                className="mt-1 w-full text-sm rounded-lg border border-border bg-surface
                           px-3 py-2 resize-none
                           focus-visible:outline-2 focus-visible:outline-primary"
              />
            </label>

            <div className="space-y-1.5">
              {DISPOSITIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => signOff(option.value)}
                  disabled={Boolean(saving)}
                  className="w-full text-left px-3 py-2 rounded-lg border border-border
                             hover:border-primary hover:bg-primary-soft/40 transition
                             disabled:opacity-60 cursor-pointer
                             focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <span className="block text-sm font-medium text-text">
                    {saving === option.value ? "Saving…" : option.label}
                  </span>
                  <span className="block text-xs text-text-muted">
                    {option.description}
                  </span>
                </button>
              ))}
            </div>

            <p className="text-[11px] text-text-muted leading-relaxed">
              Marking false alarms is what makes the accuracy figure on the
              reports page mean anything.
            </p>
          </div>
        )}

        {failed && (
          <p className="text-xs text-danger" role="alert">
            {failed}
          </p>
        )}
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */

function Filter({ label, children }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-text-secondary mb-1">
        {label}
      </span>
      {children}
    </label>
  );
}

function Select({ value, onChange, options }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="text-sm rounded-lg border border-border bg-surface px-3 py-2
                 min-w-[9rem] cursor-pointer
                 focus-visible:outline-2 focus-visible:outline-primary"
    >
      {options.map((option) => (
        <option key={String(option.value)} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

/* ------------------------------------------------------------------ */

/** How each clock verdict reads on an event, and whether it warns. */
const EVENT_CLOCK = {
  valid: { label: "Valid", warn: false },
  checking: { label: "Checking", warn: false },
  unavailable: { label: "Unavailable", warn: true },
  invalid: { label: "Invalid", warn: true },
  unknown: { label: "Unknown", warn: false },
};

/**
 * Which clock stamped this event, and how the camera's own clock stood —
 * two separate facts, said side by side so a system stamp can never read
 * as the camera clock being fine. Absent on rows recorded before either
 * fact existed: an old event's clocks are not invented for it.
 */
function ClockLine({ details }) {
  const source = details?.timestamp_source;
  const clock = details?.camera_clock_status;
  if (!source && !clock) return null;

  const verdict = EVENT_CLOCK[clock] ?? (clock ? { label: clock } : null);

  return (
    <p className="text-xs text-text-secondary">
      {source && (
        <>
          Timestamp source:{" "}
          <span className="font-medium text-text">
            {source === "cctv" ? "CCTV" : "System"}
          </span>
        </>
      )}
      {source && verdict && " · "}
      {verdict && (
        <>
          Camera clock:{" "}
          <span
            className={
              verdict.warn ? "font-medium text-warning" : "font-medium text-text"
            }
          >
            {verdict.warn ? "⚠ " : ""}
            {verdict.label}
          </span>
        </>
      )}
    </p>
  );
}

/**
 * The generic detail rows, minus the two facts the clock line above says
 * properly — one fact, said once.
 */
function clockFiltered(details) {
  return Object.entries(details || {}).filter(
    ([key]) => key !== "timestamp_source" && key !== "camera_clock_status",
  );
}

function duration(event) {
  const from = new Date(event.occurred_at);
  const to = new Date(event.ended_at);

  const seconds = Math.max(0, Math.round((to - from) / 1000));

  if (seconds < 60) return `${seconds} sec`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  return `${Math.round((seconds / 3600) * 10) / 10} hr`;
}

function humanise(key) {
  const words = key.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function formatDetail(value) {
  if (value === null || value === undefined) return "—";
  if (Array.isArray(value)) return value.map((v) => Math.round(v * 100) / 100).join(", ");
  if (typeof value === "number") return Math.round(value * 100) / 100;
  return String(value);
}
