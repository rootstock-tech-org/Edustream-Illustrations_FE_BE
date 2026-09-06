import { Activity } from "lucide-react";

import Panel from "../common/Panel";
import { colors } from "../../theme/colors";

/**
 * Presence over time, drawn.
 *
 * Two graphs from one record. The lanes show *when* each workstation was
 * manned, empty, or simply not watched — one strip per station on a shared
 * clock, newest at the right edge. The bars below show *how much*: manned
 * against idle as shares of the time the camera could actually judge, with
 * the difference between them printed beside each station.
 *
 * The colours are the product's own status tones, and colour is never the
 * only channel: empty time wears a diagonal hatch, unwatched time a dotted
 * weave, every segment carries its own tooltip, and the totals are printed
 * as text. Unwatched time is deliberately recessive — near the surface
 * colour, like a grid — because it is the absence of measurement, not a
 * measurement; it is excluded from the manned-against-idle ratio for the
 * same reason, and said in words instead.
 */

const LANE_HEIGHT = 20;

const STATE = {
  manned: { label: "Somebody there", fill: colors.success },
  empty: { label: "Nobody there", fill: colors.danger },
  unwatched: { label: "Not watched", fill: colors.border },
};

/** "1h 04m", "12m 08s", "42s" — durations as an operator says them. */
function span(seconds) {
  const s = Math.max(0, Math.round(seconds));
  if (s >= 3600) {
    const m = Math.round((s % 3600) / 60);
    return `${Math.floor(s / 3600)}h ${String(m).padStart(2, "0")}m`;
  }
  if (s >= 60) {
    return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
  }
  return `${s}s`;
}

/** "9m 30s ago", or "now" at the newest edge. */
function ago(seconds) {
  return seconds < 1 ? "now" : `${span(seconds)} ago`;
}

function Swatch({ state }) {
  const paint = STATE[state];
  return (
    <svg width="14" height="14" className="shrink-0" aria-hidden="true">
      <rect
        x="0.5"
        y="0.5"
        width="13"
        height="13"
        rx="3"
        fill={
          state === "empty"
            ? "url(#presence-hatch)"
            : state === "unwatched"
              ? "url(#presence-dots)"
              : paint.fill
        }
        stroke={state === "unwatched" ? colors.borderStrong ?? paint.fill : paint.fill}
        strokeWidth="1"
      />
    </svg>
  );
}

export default function PresenceTimeline({ stations }) {
  const recorded = (stations ?? []).filter(
    (station) => station.presence && station.presence.span_seconds >= 5,
  );

  if (recorded.length === 0) return null;

  // One clock for every lane, or the lanes cannot be read against each
  // other: the axis is the longest record on the page.
  const axis = Math.max(...recorded.map((s) => s.presence.span_seconds));

  return (
    <Panel
      title="Presence over time"
      icon={Activity}
      subtitle={`The last ${span(axis)}, newest at the right`}
    >
      {/* Shared paint: the hatch that marks empty time and the dots that
          mark unwatched time, defined once for every strip on the page. */}
      <svg width="0" height="0" className="absolute" aria-hidden="true">
        <defs>
          <pattern
            id="presence-hatch"
            width="6"
            height="6"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="6" height="6" fill={colors.dangerSoft} />
            <line x1="0" y1="0" x2="0" y2="6" stroke={colors.danger} strokeWidth="2.5" />
          </pattern>
          <pattern
            id="presence-dots"
            width="6"
            height="6"
            patternUnits="userSpaceOnUse"
          >
            <rect width="6" height="6" fill={colors.surface} />
            <circle cx="3" cy="3" r="1.1" fill={colors.border} />
          </pattern>
        </defs>
      </svg>

      <div className="space-y-4">
        {/* Legend — three states, named, never colour alone. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {Object.entries(STATE).map(([key, value]) => (
            <span key={key} className="flex items-center gap-1.5 text-xs text-text-secondary">
              <Swatch state={key} />
              {value.label}
            </span>
          ))}
        </div>

        {/* The lanes: when. */}
        <div className="space-y-2">
          {recorded.map((station) => {
            const name = station.name || `Workstation ${station.id}`;
            return (
              <div key={station.id} className="flex items-center gap-3">
                <span
                  className="w-28 shrink-0 text-xs font-medium text-text truncate"
                  title={name}
                >
                  {name}
                </span>
                <svg
                  className="flex-1 block"
                  height={LANE_HEIGHT}
                  preserveAspectRatio="none"
                  viewBox={`0 0 1000 ${LANE_HEIGHT}`}
                  role="img"
                  aria-label={`${name}: manned ${span(station.presence.manned_seconds)}, empty ${span(station.presence.empty_seconds)}, not watched ${span(station.presence.unwatched_seconds)}`}
                >
                  <rect
                    x="0"
                    y="0"
                    width="1000"
                    height={LANE_HEIGHT}
                    rx="4"
                    fill={colors.subtle ?? "#F4F6F9"}
                  />
                  {station.presence.timeline.map((segment, index) => {
                    const left = ((axis - segment.start) / axis) * 1000;
                    const right = ((axis - segment.end) / axis) * 1000;
                    const paint = STATE[segment.state] ?? STATE.unwatched;
                    return (
                      <rect
                        key={index}
                        x={left}
                        y="0"
                        width={Math.max(right - left, 1)}
                        height={LANE_HEIGHT}
                        fill={
                          segment.state === "empty"
                            ? "url(#presence-hatch)"
                            : segment.state === "unwatched"
                              ? "url(#presence-dots)"
                              : paint.fill
                        }
                      >
                        <title>
                          {`${paint.label} · ${ago(segment.start)} → ${ago(segment.end)} · ${span(segment.start - segment.end)}`}
                        </title>
                      </rect>
                    );
                  })}
                </svg>
              </div>
            );
          })}

          {/* One axis for every lane. */}
          <div className="flex items-center gap-3">
            <span className="w-28 shrink-0" />
            <div className="flex-1 flex justify-between text-[10px] text-text-muted tabular-nums">
              <span>{ago(axis)}</span>
              <span>{ago(axis / 2)}</span>
              <span>now</span>
            </div>
          </div>
        </div>

        {/* The bars: how much, and the difference. */}
        <div className="space-y-3 pt-3 border-t border-border">
          <p className="text-xs font-medium text-text-secondary uppercase tracking-wide">
            Manned against idle
          </p>

          {recorded.map((station) => {
            const { manned_seconds, empty_seconds, unwatched_seconds } =
              station.presence;
            const judged = manned_seconds + empty_seconds;
            const name = station.name || `Workstation ${station.id}`;

            if (judged < 1) {
              return (
                <div key={station.id} className="flex items-center gap-3">
                  <span className="w-28 shrink-0 text-xs font-medium text-text truncate">
                    {name}
                  </span>
                  <span className="text-xs text-text-muted">
                    Nothing judged yet — not watched for {span(unwatched_seconds)}.
                  </span>
                </div>
              );
            }

            const mannedShare = manned_seconds / judged;
            const delta = manned_seconds - empty_seconds;

            return (
              <div key={station.id} className="space-y-1">
                <div className="flex items-center gap-3">
                  <span
                    className="w-28 shrink-0 text-xs font-medium text-text truncate"
                    title={name}
                  >
                    {name}
                  </span>
                  <svg
                    className="flex-1 block"
                    height="12"
                    preserveAspectRatio="none"
                    viewBox="0 0 1000 12"
                    role="img"
                    aria-label={`${name}: manned ${Math.round(mannedShare * 100)}% of judged time`}
                  >
                    <rect
                      x="0"
                      y="0"
                      width={Math.max(mannedShare * 1000 - 1, 0)}
                      height="12"
                      rx="4"
                      fill={colors.success}
                    >
                      <title>{`Manned · ${span(manned_seconds)} (${Math.round(mannedShare * 100)}%)`}</title>
                    </rect>
                    <rect
                      x={mannedShare * 1000 + 1}
                      y="0"
                      width={Math.max((1 - mannedShare) * 1000 - 1, 0)}
                      height="12"
                      rx="4"
                      fill="url(#presence-hatch)"
                    >
                      <title>{`Idle · ${span(empty_seconds)} (${Math.round((1 - mannedShare) * 100)}%)`}</title>
                    </rect>
                  </svg>
                </div>
                <p className="pl-[7.75rem] text-xs text-text-secondary tabular-nums">
                  Manned {span(manned_seconds)} · Idle {span(empty_seconds)} ·
                  Δ {delta >= 0 ? "+" : "−"}{span(Math.abs(delta))}{" "}
                  {delta >= 0 ? "more manned" : "more idle"}
                  {unwatched_seconds >= 1 && (
                    <span className="text-text-muted">
                      {" "}· not watched {span(unwatched_seconds)}
                    </span>
                  )}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </Panel>
  );
}
