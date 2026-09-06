import { describeDuration } from "./rules.js";
import { RESOLVE_AFTER_SECONDS, SEVERITIES, SEVERITY } from "./thresholds.js";

/**
 * Turning a settled decision into a record.
 *
 * Every verdict in `rules.js` is a fact about one frame. An event is a fact
 * about a *situation* — and the difference matters more than it looks. A door
 * left open for five minutes at ten frames a second is one event that
 * escalates, not three thousand rows, because "how many things went wrong
 * today" has to mean something a person can read.
 *
 * This mirrors the real event store's three rules exactly, at the scale a
 * five-second simulation can show them at:
 *
 * **The same problem, seen again, is the same event — never a new one.**
 * Identified by a `key`, not by a timestamp, so a helmet that scores 0.53 on
 * one frame and 0.51 on the next is one open event, not two.
 *
 * **An event may escalate. It never quietly de-escalates while open.**
 * Severity only ever rises for as long as the problem is present — read the
 * comment on `SEVERITY` in thresholds.js for the one case (a lifting area)
 * where the real product deliberately keeps a lower severity than the
 * situation looks like it deserves, because the fuller verdict cannot yet be
 * reached honestly.
 *
 * **An event does not close the instant its problem is missing for one
 * frame.** It closes after `RESOLVE_AFTER_SECONDS` of genuine absence — the
 * same anti-flicker idea `confirm.js` applies one layer up, so a worker who
 * turns away from the camera for a third of a second does not read as the
 * violation ending and restarting.
 *
 * One place this file is honest about being a simplification: the real store
 * keys a PPE problem by module and item only, because on a real deployment a
 * camera watches one general area rather than named individuals. The lab
 * tracks several named workers on one floor, so a key here also names *who*
 * — `worker-b:no-helmet`, not just `no-helmet` — otherwise two different
 * workers missing a helmet at the same time would collapse into one event
 * neither of them could account for. The severities, the escalation rule and
 * the resolve delay are the real product's; the identity scheme is the lab's
 * own, adapted for a floor with more than one person on it.
 */

/** A finding's settled violations, broken into one problem per event key. */
function problemsOf(finding) {
  if (finding.settled !== "violation") return [];

  if (finding.kind === "person") {
    return (finding.missing ?? []).map((item) => ({
      key: `${finding.id}:no-${item}`,
      severity: SEVERITY.ppe,
      summary: `${finding.name ?? "Someone"} — ${item} missing`,
      subject: finding.name ?? finding.id,
      item,
    }));
  }

  if (finding.kind === "zone") {
    const severity = SEVERITY[finding.zoneType] ?? "medium";
    const who = (finding.inside ?? []).map((entry) => entry.name ?? entry.id);
    return [
      {
        key: `zone:${finding.id}`,
        severity,
        summary:
          who.length > 0
            ? `${finding.name} — ${list(who)} inside`
            : `${finding.name} — breached`,
        subject: finding.name,
        item: null,
      },
    ];
  }

  // Doors and workstations are the two problem types whose severity is not a
  // fixed property of the type — it is computed frame by frame from how long
  // the problem has run, in `rules.js`, which is the one place that already
  // has the duration. Reading it straight off the finding rather than
  // looking it up here is what lets it climb low → medium → high as the
  // door stays open or the bench stays empty: the escalate-only-upward rule
  // below does the rest, exactly as it does for anyone else's severity.
  if (finding.kind === "door") {
    return [
      {
        key: `${finding.id}:open-too-long`,
        severity: finding.severity ?? "low",
        summary: `${finding.name ?? "The door"} left open for ${describeDuration(finding.openSeconds)}`,
        subject: finding.name,
        item: null,
      },
    ];
  }

  if (finding.kind === "workstation") {
    return [
      {
        key: `${finding.id}:empty`,
        severity: finding.severity ?? "low",
        summary: `${finding.name ?? "The workstation"} left unattended for ${describeDuration(finding.emptySeconds)}`,
        subject: finding.name,
        item: null,
      },
    ];
  }

  return [];
}

/** A fresh, empty record of open events. */
export function newEvents() {
  return {};
}

/**
 * Update the record with one frame's settled findings.
 *
 * @param events the record from a previous call, or `newEvents()`
 * @param findings this frame's settled findings, from `confirm.js`
 * @param at this frame's time, in seconds — the same clock `confirm.js` uses
 * @returns the next record, and `transitions`: what happened to each event
 *   this frame — "opened", "escalated", "continuing" or "resolved" — for
 *   whatever is narrating the run to read, rather than diffing the record
 *   itself
 */
export function observe(events, findings, at) {
  const next = { ...events };
  const transitions = [];
  const present = new Set();

  for (const finding of findings) {
    for (const problem of problemsOf(finding)) {
      present.add(problem.key);
      const open = next[problem.key];

      if (!open) {
        next[problem.key] = {
          key: problem.key,
          severity: problem.severity,
          summary: problem.summary,
          subject: problem.subject,
          item: problem.item,
          openedAt: at,
          lastSeenAt: at,
        };
        transitions.push({ key: problem.key, kind: "opened", event: next[problem.key] });
        continue;
      }

      const updated = { ...open, lastSeenAt: at, summary: problem.summary };

      if (SEVERITIES.indexOf(problem.severity) > SEVERITIES.indexOf(open.severity)) {
        updated.severity = problem.severity;
        next[problem.key] = updated;
        transitions.push({ key: problem.key, kind: "escalated", event: updated });
      } else {
        next[problem.key] = updated;
        transitions.push({ key: problem.key, kind: "continuing", event: updated });
      }
    }
  }

  for (const [key, open] of Object.entries(next)) {
    if (present.has(key)) continue;

    // A tolerance against float drift, not a design choice: `pipeline.js`
    // accumulates `at` by repeated addition, so what is conceptually exactly
    // 5.0s of absence sometimes arrives as 4.999999999999986. Without this,
    // the resolve the record promises at RESOLVE_AFTER_SECONDS would
    // actually land a frame late.
    if (at - open.lastSeenAt < RESOLVE_AFTER_SECONDS - 1e-9) continue;

    delete next[key];
    transitions.push({
      key,
      kind: "resolved",
      event: { ...open, endedAt: open.lastSeenAt + RESOLVE_AFTER_SECONDS },
    });
  }

  return { events: next, transitions };
}

/**
 * Replay a whole run and report the final record plus every transition.
 *
 * For anything that only has the run's results after the fact — an
 * experiment, which computes its whole timeline before a learner sees it —
 * rather than the frame-by-frame `observe()` a live simulation calls once per
 * tick.
 */
export function observeRun(results) {
  let events = newEvents();
  const timeline = [];

  for (const result of results) {
    const step = observe(events, result.findings, result.at);
    events = step.events;
    timeline.push({ at: result.at, frame: result.frame, transitions: step.transitions });
  }

  return { events, timeline };
}

/** The open event for one finding's first problem, or null. */
export function eventFor(events, finding) {
  const problems = problemsOf(finding);
  if (problems.length === 0) return null;
  return events[problems[0].key] ?? null;
}

/** Every open event touching one finding — a person can be missing >1 item. */
export function eventsFor(events, finding) {
  return problemsOf(finding)
    .map((problem) => events[problem.key])
    .filter(Boolean);
}

/** How many frames ago an event opened, given the current frame's time. */
export function ageFrames(event, at, fps) {
  return Math.max(0, Math.round((at - event.openedAt) * fps));
}

function list(words) {
  if (words.length === 0) return "nothing";
  if (words.length === 1) return words[0];
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}
