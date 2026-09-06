import { useCallback, useEffect, useState } from "react";
import {
  Clock,
  Download,
  FileText,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";

import Panel from "../components/common/Panel";
import StatisticsCard from "../components/common/StatisticsCard";
import { EmptyState, ErrorState, LoadingState } from "../components/common/States";
import Button from "../components/common/Button";
import { eventsApi } from "../services/eventsApi";

/**
 * Safety reporting.
 *
 * Four questions, in the order a manager asks them: how much happened, is any
 * of it outstanding, where is it happening, and is it getting better or worse.
 *
 * The fifth is the one that decides whether the rest is worth reading — how
 * often the system was right. It is computed only over events a human actually
 * judged, and says so, because counting unreviewed events as correct would
 * flatter the system for being ignored.
 *
 * Every figure comes from one aggregate on the server rather than from
 * counting a list in the browser, so the page stays fast as the history grows
 * and cannot quietly disagree with the export.
 */

//: Most bars the day-by-day chart will print a count above. See
//: DailyTrend for why a crowded chart drops them.
const LABELLED_BARS = 40;

// 365 is the API's own ceiling — the summary route refuses more rather
// than clamping. It is here for the same reason as on the events page:
// footage replayed from an archive carries the clock burned into it, so
// its events sit on the day they were recorded, which can be months back.
const PERIODS = [
  { value: 7, label: "7 days" },
  { value: 30, label: "30 days" },
  { value: 90, label: "90 days" },
  { value: 365, label: "1 year" },
];

export default function Reports() {
  const [days, setDays] = useState(7);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);

  // Loading is the difference between what has been asked for and what has
  // come back, rather than a flag to keep in step by hand.
  const asked = `${days}#${reloadToken}`;
  const [answered, setAnswered] = useState(null);
  const loading = answered !== asked;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const next = await eventsApi.summary(days);
        if (cancelled) return;

        setSummary(next);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err?.message || "Could not load the figures.");
      } finally {
        // A cancelled request answers a period nobody is looking at any more;
        // letting it land would put last month's figures under this week's
        // heading.
        if (!cancelled) setAnswered(asked);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [days, asked]);

  const refresh = useCallback(() => setReloadToken((token) => token + 1), []);

  const modules = summary?.modules ?? {};
  const empty = !loading && !error && summary?.total === 0;

  // The server's own export cap, travelling with the figures rather than
  // written down again here — so what this page promises about the file
  // and what the file contains cannot drift apart.
  const exportTruncates =
    Boolean(summary?.export_limit) && summary.total > summary.export_limit;

  return (
    <div className="p-4 sm:p-6 max-w-[1600px] mx-auto space-y-5 animate-fade-in">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-text tracking-tight">
            Reports
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Safety summaries you can share with management.
          </p>
        </div>

        {/* Wraps rather than squeezing: a fourth period button and the
            export control together are wider than a phone, and a button
            ellipsised down to "1 ye…" is not a control anybody can use. */}
        <div className="flex flex-col items-end gap-1">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div
            className="flex rounded-lg border border-border overflow-hidden"
            role="group"
            aria-label="Reporting period"
          >
            {PERIODS.map((period) => (
              <button
                key={period.value}
                type="button"
                onClick={() => setDays(period.value)}
                aria-pressed={days === period.value}
                className={`px-3 py-2 text-sm font-medium transition cursor-pointer
                  ${
                    days === period.value
                      ? "bg-primary text-white"
                      : "bg-surface text-text-secondary hover:bg-subtle"
                  }`}
              >
                {period.label}
              </button>
            ))}
          </div>

          <Button
            variant="secondary"
            icon={Download}
            disabled={empty}
            onClick={() => {
              window.location.href = eventsApi.exportXlsxUrl({ days });
            }}
          >
            Export for Excel
          </Button>
        </div>

        {exportTruncates && (
          <p className="text-xs text-text-muted text-right max-w-[16rem]">
            Exports the {summary.export_limit} most recent of {summary.total} —
            shorten the period for the rest.
          </p>
        )}
        </div>
      </header>

      {loading ? (
        <Panel>
          <LoadingState label="Adding it up…" rows={4} />
        </Panel>
      ) : error ? (
        <Panel>
          <ErrorState detail={error} onRetry={refresh} />
        </Panel>
      ) : empty ? (
        <Panel>
          <EmptyState
            icon={FileText}
            title="Nothing recorded in this period"
            description="Events are saved as they happen while a camera is being watched. Once there is a history, this page summarises it — by area, by severity, and over time."
          />
        </Panel>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <StatisticsCard
              label="Events"
              value={summary.total}
              icon={TriangleAlert}
              tone="neutral"
              hint={`In the last ${summary.days} days`}
            />
            <StatisticsCard
              label="Still to sign off"
              value={summary.unacknowledged}
              icon={FileText}
              tone={summary.unacknowledged > 0 ? "warning" : "success"}
              hint={
                summary.unacknowledged > 0
                  ? "Nobody has reviewed these yet"
                  : "Everything has been reviewed"
              }
            />
            <StatisticsCard
              label="High severity"
              value={summary.by_severity.high}
              icon={TriangleAlert}
              tone={summary.by_severity.high > 0 ? "danger" : "success"}
              hint={`${summary.by_severity.medium} medium, ${summary.by_severity.low} low`}
            />
            <StatisticsCard
              label="System was right"
              value={summary.accuracy === null ? "—" : summary.accuracy}
              unit={summary.accuracy === null ? undefined : "%"}
              icon={ShieldCheck}
              tone={
                summary.accuracy === null
                  ? "neutral"
                  : summary.accuracy >= 90
                    ? "success"
                    : summary.accuracy >= 70
                      ? "warning"
                      : "danger"
              }
              hint={
                summary.reviewed === 0
                  ? "Nothing reviewed yet"
                  : `Of ${summary.reviewed} reviewed · ${summary.false_alarms} false`
              }
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
            <Panel title="Where it is happening" icon={TriangleAlert}>
              <div className="px-5 pb-5">
                <BarList
                  rows={summary.by_module.map((row) => ({
                    key: row.module_id,
                    label: modules[row.module_id] || row.module_id,
                    value: row.total,
                    note:
                      row.open_count > 0
                        ? `${row.open_count} to sign off`
                        : "all reviewed",
                    alarming: row.high > 0,
                  }))}
                />
              </div>
            </Panel>

            <Panel title="Day by day" icon={Clock}>
              <div className="px-5 pb-5">
                <DailyTrend days={summary.by_day} />

                {summary.busiest_hour !== null && summary.busiest_hour_count >= 3 && (
                  <p className="text-xs text-text-muted mt-4 pt-3 border-t border-border">
                    {/* Counted from the events themselves — each is grouped by
                        the hour it happened and the fullest hour is named
                        here, shown in this screen's own time zone. Held back
                        under three events, because "busiest" measured on two
                        is noise wearing a pattern's clothes. */}
                    The busiest time of day is around{" "}
                    <span className="font-medium text-text">
                      {localHour(summary.busiest_hour)}
                    </span>{" "}
                    — {summary.busiest_hour_count} of the {summary.total} events
                    in this period happened in that hour. Worth checking what
                    changes on the floor then.
                  </p>
                )}
              </div>
            </Panel>
          </div>

          <Panel title="How often was the AI right?" icon={ShieldCheck}>
            <div className="px-5 pb-5 text-sm text-text-secondary space-y-2 max-w-3xl">
              <p>
                Every alert the AI raises is saved in{" "}
                <span className="font-medium text-text">Safety Events</span>.
                When somebody opens one and signs it off, they answer one
                question: was this a real problem, or a false alarm?
              </p>
              <p>
                This figure is simply the share of those human answers that
                said <span className="font-medium text-text">real</span>. So
                far, people have reviewed{" "}
                <span className="font-medium text-text">{summary.reviewed}</span>{" "}
                alert{summary.reviewed === 1 ? "" : "s"} here:{" "}
                {summary.confirmed} judged real, {summary.false_alarms} judged{" "}
                false alarm{summary.false_alarms === 1 ? "" : "s"}. It is not
                the AI marking its own work — it is your team's verdict on it.
              </p>
              {summary.reviewed === 0 && (
                <p>
                  <span className="font-medium text-text">
                    Seeing “0 real, 0 false alarms”?
                  </span>{" "}
                  It only means nobody has reviewed an alert yet — there is
                  nothing to score, so the figure shows a dash instead of a
                  made-up number. Review a few events in Safety Events and it
                  fills in by itself.
                </p>
              )}
              <p>
                Alerts nobody has reviewed are left out entirely — they are
                not assumed correct. A system nobody checks would otherwise
                score 100%, which is the opposite of what this number is for.
              </p>
              {summary.unacknowledged > 0 && (
                <p className="text-text">
                  {summary.unacknowledged} alert
                  {summary.unacknowledged === 1 ? " is" : "s are"} still
                  waiting for review in Safety Events — the more that get
                  reviewed, the more this figure means.
                </p>
              )}
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

/**
 * A UTC hour bucket, said in this screen's own time zone.
 *
 * The store groups events by the UTC hour they happened (timestamps are
 * stored in UTC so every deployment agrees on what they mean). Nobody on a
 * factory floor thinks in UTC, so the hour is converted here — including
 * half-hour zones like IST, where 4:00 UTC is properly 9:30 AM.
 */
function localHour(hour) {
  const date = new Date(Date.UTC(2000, 0, 1, Number(hour), 0, 0));
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/**
 * Ranked bars.
 *
 * Proportional to the largest row rather than the total: the question is
 * which area is worst, and a share-of-total scale flattens everything into
 * slivers as soon as there are more than a few areas.
 */
function BarList({ rows }) {
  if (!rows.length) {
    return <p className="text-sm text-text-muted py-6 text-center">Nothing yet.</p>;
  }

  const largest = Math.max(...rows.map((row) => row.value), 1);

  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={row.key} className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-medium text-text">{row.label}</span>
            <span className="text-sm font-semibold tabular-nums text-text">
              {row.value}
            </span>
          </div>

          <div
            className="h-2 rounded-full bg-subtle overflow-hidden"
            role="img"
            aria-label={`${row.label}: ${row.value} events`}
          >
            <div
              className={`h-full rounded-full ${row.alarming ? "bg-danger" : "bg-primary"}`}
              style={{ width: `${(row.value / largest) * 100}%` }}
            />
          </div>

          <p className="text-xs text-text-muted">{row.note}</p>
        </li>
      ))}
    </ul>
  );
}

/**
 * Events per day, with the high-severity share shown inside each column.
 *
 * A count alone can look flat while the mix gets worse, so the darker portion
 * carries the severity — the shape of the week and how bad it was in one read.
 */
function DailyTrend({ days }) {
  if (!days.length) {
    return <p className="text-sm text-text-muted py-6 text-center">Nothing yet.</p>;
  }

  const tallest = Math.max(...days.map((day) => day.total), 1);

  // Past this many bars the counts above them overlap into a smear — the
  // columns share the panel's width, so each one is a few pixels — and a
  // number nobody can read is worse than no number: the bar height, the
  // hover and the axis still say everything. Measured on the panel's own
  // width, not guessed: forty bars is where the 11px counts start to
  // touch at 1440px.
  const crowded = days.length > LABELLED_BARS;

  const busiest = days.reduce((most, day) => (day.total > most.total ? day : most));

  return (
    <>
      {/* The label keeps its "Events per day" opening whatever the
          density: it is how the page's own chart is identified. What
          changes is the tail — reading three hundred and sixty-five
          day/count pairs aloud is not access, it is an obstacle — so a
          crowded chart is described instead of enumerated. */}
      <div className="flex items-end gap-1.5 h-40" role="img"
           aria-label={
             crowded
               ? `Events per day: ${days.length} days from ${days[0].day} to `
                 + `${days[days.length - 1].day}, busiest ${busiest.day} with `
                 + `${busiest.total}`
               : `Events per day: ${days.map((d) => `${d.day}, ${d.total}`).join("; ")}`
           }>
        {days.map((day) => {
          const height = Math.max((day.total / tallest) * 100, 3);
          const highShare = day.total ? (day.high / day.total) * 100 : 0;

          return (
            /* `h-full` is what makes the bars exist. The row is `items-end`,
               so a column left to itself is sized to its contents — and a bar
               asking for a percentage of a parent with no definite height
               gets zero, which is what this chart drew for as long as it had
               real numbers to draw. Stretching the column to the row's own
               h-40 gives the percentage something to be a percentage of. */
            <div
              key={day.day}
              className="flex-1 min-w-0 h-full flex flex-col justify-end items-center gap-1.5"
              title={`${day.day}: ${day.total} event${day.total === 1 ? "" : "s"}, ${day.high} high`}
            >
              {!crowded && (
                <span className="text-[11px] tabular-nums text-text-muted shrink-0">
                  {day.total}
                </span>
              )}

              {/* The track the bar is measured against: whatever height is
                  left once the count above it has been placed. Definite,
                  because the flex layout resolves it — so the bar's
                  percentage resolves too, and a full-height column is the
                  top of the track rather than the top of the panel. */}
              <div className="w-full flex-1 min-h-0 flex flex-col justify-end">
                <div
                  className="w-full rounded-t-md bg-primary/55 overflow-hidden flex flex-col justify-end"
                  style={{ height: `${height}%` }}
                >
                  <div
                    className="w-full bg-danger"
                    style={{ height: `${highShare}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-4 mt-3 text-xs text-text-muted">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-danger" aria-hidden="true" />
          High severity
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-primary/55" aria-hidden="true" />
          Everything else
        </span>
        <span className="ml-auto">
          {days[0].day} – {days[days.length - 1].day}
        </span>
      </div>
    </>
  );
}
