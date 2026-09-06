import { confirm, newHistory } from "./confirm.js";
import { detect } from "./detect.js";
import { CLEAR_CONDITIONS, read } from "./legibility.js";
import { DEFAULT_SETTINGS, judge, worstOf } from "./rules.js";
import { FLOORS } from "./thresholds.js";

/**
 * One frame, from the camera to the verdict — and a record of how it got there.
 *
 * This is the file the rest of the lab is built on. It does no new thinking:
 * it calls the four modules in the order the real system calls them and writes
 * down what each one did, with the numbers it used.
 *
 * That record — the trace — is the reason this is a separate module rather
 * than four calls in a component. Two later parts of the lab need it:
 *
 *   * the pipeline animation, which walks a frame through the stages one at a
 *     time and needs to know what each stage actually saw;
 *   * the "Why?" explanation, which has to answer "why was nothing reported
 *     about that person" — and the only honest answer is the one recorded at
 *     the stage where they were dropped.
 *
 * Writing the trace here means those two features read a real record of a
 * real decision, instead of re-deriving the rules in prose and slowly
 * disagreeing with them.
 *
 * **The order is not arbitrary.** Legibility comes first and can stop
 * everything: a picture that cannot be read must not reach the detector,
 * because the detector will cheerfully find nobody in it and an empty
 * detection list is indistinguishable from a safe factory.
 */

/** A fresh run: no votes recorded, nothing believed yet, frame zero. */
export function newRun() {
  return {
    frame: 0, at: 0, history: newHistory(), beliefs: {},
    timers: { doors: {}, stations: {} },
  };
}

/**
 * Push one frame through the system.
 *
 * @param world the factory
 * @param options.conditions the camera's light, blur and compression
 * @param options.settings the bars in force
 * @param options.fps how often frames arrive — this sets the clock the
 *   confirmation window measures against, which is the whole coupling between
 *   frame rate and how long an alarm takes
 * @param run the state from `newRun()` or a previous frame
 */
export function step(world, options = {}, run = newRun()) {
  const conditions = options.conditions ?? CLEAR_CONDITIONS;
  const settings = { ...DEFAULT_SETTINGS, ...(options.settings ?? {}) };
  const fps = options.fps ?? 10;

  const at = run.at + 1 / Math.max(fps, 0.1);
  const frame = run.frame + 1;
  const trace = [];

  /* --- 1. a picture arrives ------------------------------------- */

  trace.push({
    id: "capture",
    title: "A frame arrives",
    ok: true,
    detail:
      `Frame ${frame}, at ${fps} a second. The camera is a sensor: it hands ` +
      `over a grid of numbers and forgets it.`,
    facts: [
      { label: "Frame", value: String(frame) },
      { label: "Rate", value: `${fps}/s` },
      { label: "Gap between looks", value: `${Math.round(1000 / fps)}ms` },
    ],
  });

  /* --- 2. can it be read at all? -------------------------------- */

  const reading = read(conditions);

  trace.push({
    id: "legibility",
    title: "Can this picture be judged?",
    ok: reading.readable,
    detail: reading.readable
      ? "Inside the range where detection was measured to work."
      : reading.reason,
    facts: [
      {
        label: "Brightness", value: reading.brightness.toFixed(1), ok: reading.failed !== "brightness",
        meter: { value: reading.brightness, threshold: FLOORS.brightness },
      },
      {
        label: "Contrast", value: reading.contrast.toFixed(1), ok: reading.failed !== "contrast",
        meter: { value: reading.contrast, threshold: FLOORS.contrast },
      },
      {
        label: "Detail", value: reading.sharpness.toFixed(0), ok: reading.failed !== "sharpness",
        meter: { value: reading.sharpness, threshold: FLOORS.sharpness },
      },
      {
        label: "Compression damage", value: reading.blockiness.toFixed(2), ok: reading.failed !== "blockiness",
        meter: { value: reading.blockiness, threshold: FLOORS.blockiness },
      },
    ],
  });

  if (!reading.readable) {
    /*
     * Stop. This is the branch the whole module exists for. Everything below
     * would run perfectly happily on an unreadable picture and report a calm,
     * green, empty factory — which is the single most dangerous thing this
     * system could do.
     */
    trace.push({
      id: "stopped",
      title: "Nothing further is claimed",
      ok: false,
      detail:
        "The remaining stages are skipped on purpose. Run them on a picture " +
        "this bad and they will find nobody — and a scene with nobody in it " +
        "looks exactly like a factory where everyone is behaving.",
      facts: [],
    });

    return {
      run: { frame, at, history: run.history, beliefs: run.beliefs, timers: run.timers },
      frameResult: {
        frame,
        at,
        reading,
        detections: [],
        findings: [],
        worst: "cannot-check",
        readable: false,
        trace,
      },
    };
  }

  /* --- 3. what is in it? ---------------------------------------- */

  const { detections, quality } = detect(world, conditions, frame);

  trace.push({
    id: "detect",
    title: "What did the model find?",
    ok: detections.length > 0,
    detail:
      detections.length > 0
        ? `${detections.length} thing${detections.length === 1 ? "" : "s"} found, each with a score. ` +
          `Nothing is a fact yet — every one of these is a guess with a number on it.`
        : "Nothing at all. On a readable picture that means an empty scene.",
    facts: detections.map((detection) => ({
      label: detection.name ?? detection.label,
      value: detection.score.toFixed(2),
      ok: detection.score >= settings.personSure,
    })),
  });

  /* --- 4. what do the rules say? -------------------------------- */

  const judged = judge(detections, world, settings, run.beliefs, run.timers, at);

  trace.push({
    id: "rules",
    title: "What are the rules willing to say?",
    ok: true,
    detail:
      `Each score is measured against a bar. A person is reported at ` +
      `${settings.personSeen.toFixed(2)}, judged at ${settings.personSure.toFixed(2)}, ` +
      `and a piece of gear is believed at ${settings.itemGrant.toFixed(2)}. ` +
      `The bars differ because the mistakes differ.`,
    facts: judged.findings.map((finding) => ({
      label: finding.name ?? finding.id,
      value: finding.verdict,
      ok: finding.verdict === "clear",
    })),
  });

  /* --- 5. is it steady enough to say out loud? ------------------- */

  const confirmed = confirm(run.history, judged.findings, at, {
    window: options.window,
    minVotes: options.minVotes,
    majority: options.majority,
  });

  const waiting = confirmed.findings.filter((finding) => finding.waiting);

  trace.push({
    id: "confirm",
    title: "Has it been seen enough times?",
    ok: waiting.length === 0,
    detail:
      waiting.length === 0
        ? "Every verdict this frame is settled."
        : `${waiting.length} accusation${waiting.length === 1 ? "" : "s"} still ` +
          `waiting for agreement. Compliance never waits; only an accusation does.`,
    facts: confirmed.findings
      .filter((finding) => finding.votes && finding.verdict === "violation")
      .map((finding) => ({
        label: finding.name ?? finding.id,
        // While it waits, the count against what it needs. Once it is settled
        // the count keeps climbing, and "9/3" reads like a broken fraction
        // rather than a confirmed alarm.
        value: finding.waiting
          ? `${finding.votes.accusing}/${finding.votes.needed}`
          : "confirmed",
        ok: !finding.waiting,
        // A tally, not a score — a caller drawing this as segments rather
        // than reading the fraction stops once it is `finding.waiting`
        // itself, the same reason `value` above stops climbing in words.
        votes: finding.waiting
          ? { accusing: finding.votes.accusing, needed: finding.votes.needed }
          : null,
      })),
  });

  /* --- 6. the verdict ------------------------------------------- */

  const worst = worstOf(
    confirmed.findings.map((finding) => ({ verdict: finding.settled })),
  );

  trace.push({
    id: "verdict",
    title: "What the operator is told",
    ok: worst === "clear",
    detail: summarise(confirmed.findings, worst),
    facts: [],
  });

  return {
    run: {
      frame, at, history: confirmed.history, beliefs: judged.beliefs,
      timers: judged.timers,
    },
    frameResult: {
      frame,
      at,
      reading,
      quality,
      detections,
      findings: confirmed.findings,
      worst,
      readable: true,
      trace,
    },
  };
}

/**
 * Run several frames in a row.
 *
 * The only way to see confirmation work, since by design it cannot reach a
 * settled accusation inside one frame.
 */
export function run(world, options = {}, frames = 5, from = newRun()) {
  let state = from;
  const results = [];

  for (let i = 0; i < frames; i += 1) {
    const outcome = step(world, options, state);
    state = outcome.run;
    results.push(outcome.frameResult);
  }

  return { run: state, results };
}

function summarise(findings, worst) {
  const lost = findings.filter((finding) => finding.settled === "lost");
  const violations = findings.filter((finding) => finding.settled === "violation");
  const watching = findings.filter((finding) => finding.settled === "watching");
  const unverified = findings.filter((finding) => finding.settled === "unverified");

  const parts = [];
  if (lost.length > 0) {
    parts.push(
      `${lost.length} scored too low to be reported at all — the system is ` +
        `saying nothing about them, which is not the same as saying they are fine`,
    );
  }
  if (violations.length > 0) {
    parts.push(`${violations.length} confirmed violation${violations.length === 1 ? "" : "s"}`);
  }
  if (watching.length > 0) {
    parts.push(`${watching.length} being watched, not yet reported`);
  }
  if (unverified.length > 0) {
    parts.push(`${unverified.length} seen but not judgeable`);
  }

  if (parts.length === 0) return "All clear, and the picture was good enough to mean it.";
  return `${parts.join("; ")}.${worst === "clear" ? "" : ""}`;
}
