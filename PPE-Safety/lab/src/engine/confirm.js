import {
  ACCUSE_MAJORITY,
  ACCUSE_MIN_VOTES,
  CLEAR_NEEDS_VOTES,
  STEADY_WINDOW_SECONDS,
} from "./thresholds.js";

/**
 * Steadying a verdict over time.
 *
 * A score wanders. In `detect.js` it wanders because that is what real scores
 * do, and the consequence is that a single frame is not evidence of anything:
 * a helmet scoring 0.56 against a 0.55 bar is not a helmet the model doubts,
 * it is a helmet the model has not decided about, and reporting that frame as
 * guilt accuses the same person on and off several times a second.
 *
 * So an accusation waits for agreement. Three sightings, inside a window of
 * recent frames, favouring "missing" by two to one.
 *
 * **Compliance does not wait.** That asymmetry is the whole design and it is
 * worth being explicit about: delaying good news costs nothing, and delaying
 * an alarm costs a supervisor the seconds they would have used. So a worker
 * plainly wearing everything is cleared on the first frame that shows it,
 * while the frame that would accuse them has to be backed up.
 *
 * One thing this does not do is lower any bar. It is a flicker filter, not a
 * second opinion: a hundred consecutive frames that all think an arm is a
 * forklift will still raise the alarm. The confidence bars in `thresholds.js`
 * are doing the real work; this stops the last frame from doing it alone.
 */

/** A fresh, empty memory of what has been seen. */
export function newHistory() {
  return { votes: {} };
}

/**
 * Record this frame's verdicts and report what is settled.
 *
 * @param history the memory returned by a previous call, or `newHistory()`
 * @param findings this frame's raw findings, from `rules.judge`
 * @param at the time of this frame, in seconds
 * @returns the next history, and the findings with a settled verdict on each
 */
export function confirm(history, findings, at, options = {}) {
  const windowSeconds = options.window ?? STEADY_WINDOW_SECONDS;
  const minVotes = options.minVotes ?? ACCUSE_MIN_VOTES;
  const majority = options.majority ?? ACCUSE_MAJORITY;

  const votes = {};

  for (const finding of findings) {
    const key = `${finding.kind}:${finding.id}`;
    const kept = (history.votes[key] ?? []).filter(
      (vote) => at - vote.at <= windowSeconds,
    );

    kept.push({ at, verdict: finding.verdict });
    votes[key] = kept;
  }

  const settled = findings.map((finding) => {
    const key = `${finding.kind}:${finding.id}`;
    const recent = votes[key];

    const accusing = recent.filter(
      (vote) => vote.verdict === "violation",
    ).length;
    const otherwise = recent.length - accusing;

    /*
     * Good news needs one frame. This is not a shortcut around the evidence —
     * a "clear" only happens when every required item was found above its
     * bar, which is a positive sighting rather than the absence of one.
     */
    if (finding.verdict !== "violation") {
      return {
        ...finding,
        settled: finding.verdict,
        votes: { accusing, otherwise, needed: CLEAR_NEEDS_VOTES },
        waiting: false,
      };
    }

    const enough = accusing >= minVotes;
    const decisive = otherwise === 0 || accusing >= otherwise * majority;

    if (enough && decisive) {
      return {
        ...finding,
        settled: "violation",
        votes: { accusing, otherwise, needed: minVotes },
        waiting: false,
      };
    }

    /*
     * The frame says violation and the window does not back it up yet. The
     * honest report is neither "violation" nor "clear" — it is that the
     * system is watching, which is what an operator needs to see so a delayed
     * alarm does not look like a broken one.
     */
    return {
      ...finding,
      settled: "watching",
      votes: { accusing, otherwise, needed: minVotes },
      waiting: true,
      because:
        `${finding.because} Waiting: ${accusing} of ${minVotes} agreeing ` +
        `sightings in the last ${recent.length} ` +
        `frame${recent.length === 1 ? "" : "s"}` +
        `${otherwise > 0 ? `, and ${otherwise} that disagreed` : ""}.`,
    };
  });

  return { history: { votes }, findings: settled };
}

/**
 * How long an accusation will take at a given frame rate, in seconds.
 *
 * The number that couples this window to the frame rate: three votes at two
 * frames a second is a second of delay, and at one frame a second the window
 * is too narrow to ever hold three votes, so the alarm never arrives at all.
 * That is not a bug — it is what "three sightings in 1.5 seconds" means when
 * read as the minimum frame rate it really is.
 */
export function delayAt(framesPerSecond, options = {}) {
  const window = options.window ?? STEADY_WINDOW_SECONDS;
  const minVotes = options.minVotes ?? ACCUSE_MIN_VOTES;

  if (framesPerSecond <= 0) return { seconds: null, possible: false };

  const span = (minVotes - 1) / framesPerSecond;
  return { seconds: span, possible: span <= window };
}
