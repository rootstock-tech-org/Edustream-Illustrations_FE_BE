/**
 * One decision, told as a sequence.
 *
 * `pipeline.js` already records a trace of the whole frame — every person,
 * every area, all at once, which is right for "how this frame was decided"
 * on the Factory floor. An animation needs a different shape: one person, or
 * one area, followed from the camera to whatever it became, because that is
 * how a beginner actually follows an argument — a single thread, not
 * everyone's story interleaved.
 *
 * This module builds that thread as data. Nothing here draws anything or
 * measures a millisecond; a component reads the array in order and decides
 * how fast to reveal it. That split is what makes the claim "this stage
 * shows X" a thing the suite can check in node, rather than something only a
 * screenshot could confirm.
 *
 * The stage list mirrors §6 of the spec almost exactly — Camera, Frame, AI
 * Model, Detection, Safety Rule, Confirmation, Decision, Event, Evidence,
 * Alert — with one addition the spec's own principles require: Legibility,
 * between Frame and AI Model. A pipeline that skips straight to the model
 * teaches that a camera always has something to say, and the whole of
 * `legibility.js` exists to say it does not.
 */

import { DEFAULT_SETTINGS } from "./rules.js";

const STATUS = { ok: "ok", stop: "stop", skip: "skip", none: "none" };

/**
 * Build the story of one finding's decision.
 *
 * @param frameResult a `pipeline.step()` result — the frame this story is
 *   told about
 * @param findingKey `${kind}:${id}` — which finding to follow. A frame can
 *   hold many; this picks one thread out of it.
 * @param eventInfo `{ events: eventsFor(...), fps }` — the open events
 *   touching this finding, if any, and the frame rate they were derived at
 *   (Evidence and Alert read from this; omit it and the story simply never
 *   reaches those stages, which is correct for a caller with no event
 *   record rather than a caller that has checked and found none open)
 * @param bars the settings this frame was actually judged against — a
 *   finding records whether an item was worn, not the bar it cleared to earn
 *   that, so without this the Safety Rule stage could only say a score beat
 *   "the bar" and never say what the bar *was*. Defaults to the product's own
 *   settings, which is right unless the caller ran an experiment that moved
 *   one.
 * @returns an ordered array of stages, each `{ id, title, status, headline,
 *   facts, detail }`. `status` is "ok" (this happened), "stop" (the frame
 *   could not proceed past here), "skip" (this stage was not reached because
 *   an earlier one stopped it) or "none" (reached, and nothing to report —
 *   a clear frame reaching Event).
 */
export function storyOf(frameResult, findingKey, eventInfo = null, bars = DEFAULT_SETTINGS) {
  const finding = frameResult.findings.find(
    (entry) => `${entry.kind}:${entry.id}` === findingKey,
  );
  const detection = frameResult.detections.find(
    (entry) => `${entry.label === "person" ? "person" : entry.label}:${entry.id}` === findingKey,
  ) ?? frameResult.detections.find((entry) => entry.id === findingKey.split(":")[1]);

  const captureStage = frameResult.trace[0];
  const legibilityStage = frameResult.trace[1];

  const stages = [
    {
      id: "camera",
      title: "CAMERA",
      status: STATUS.ok,
      headline: "A sensor, watching.",
      facts: [],
      detail: "Measures light. Hands over a grid of numbers. Forgets it.",
    },
    {
      id: "frame",
      title: "FRAME",
      status: STATUS.ok,
      headline: `Frame ${frameResult.frame}, ${captureStage?.facts?.find((f) => f.label === "Rate")?.value ?? ""}`,
      facts: captureStage?.facts ?? [],
      detail: captureStage?.detail ?? "",
    },
  ];

  const readable = frameResult.readable;

  stages.push({
    id: "legibility",
    title: "CAN THIS BE JUDGED?",
    status: readable ? STATUS.ok : STATUS.stop,
    headline: readable
      ? "Yes — inside the range detection was measured to work."
      : (legibilityStage?.detail ?? "No."),
    facts: legibilityStage?.facts ?? [],
    detail: readable
      ? "Everything after this stage depends on this being true."
      : "Nothing past this point is claimed. Not a violation — and not all clear either.",
  });

  const skippedBecause = "Skipped. The picture could not be read, so nothing below was asked.";

  // AI MODEL — what the detector reported. Four different questions get
  // asked here depending on what is being explained, and forcing them
  // through one shape would mean showing a number that does not mean what
  // the label beside it claims. `modelStage` decides which question this
  // finding actually is.
  const model = modelStage(finding, detection);
  stages.push({
    id: "model",
    title: "AI MODEL",
    status: !readable ? STATUS.skip : model.status,
    headline: !readable ? skippedBecause : model.headline,
    facts: !readable ? [] : model.facts,
    detail: !readable ? "" : model.detail,
  });

  // SAFETY RULE — what the rules made of that score.
  stages.push({
    id: "rule",
    title: "SAFETY RULE",
    status: !readable ? STATUS.skip : finding ? STATUS.ok : STATUS.stop,
    headline: !readable ? skippedBecause : (finding?.because ?? ""),
    facts: !readable || !finding ? [] : ruleFacts(finding, bars),
    detail: finding ? `Raw verdict this frame: ${finding.verdict}.` : "",
  });

  // CONFIRMATION — has it been seen enough times to say out loud.
  stages.push({
    id: "confirmation",
    title: "CONFIRMATION",
    status: !readable ? STATUS.skip : finding ? STATUS.ok : STATUS.skip,
    headline: !readable
      ? skippedBecause
      : finding?.waiting
        ? `Waiting — ${finding.votes.accusing}/${finding.votes.needed} agreeing sightings.`
        : finding
          ? "Settled."
          : "",
    facts: finding?.votes
      ? [
          { label: "agreeing", value: String(finding.votes.accusing) },
          { label: "needed", value: String(finding.votes.needed) },
        ]
      : [],
    detail: finding?.waiting
      ? "Compliance never waits. Only an accusation does — a score that wanders across a bar must not accuse the same person on and off several times a second."
      : "",
  });

  // DECISION — the settled verdict.
  stages.push({
    id: "decision",
    title: "DECISION",
    status: !readable ? STATUS.skip : finding ? STATUS.ok : STATUS.skip,
    headline: !readable
      ? skippedBecause
      : finding
        ? finding.settled.toUpperCase()
        : "Nothing was being tracked at this position.",
    facts: [],
    detail: finding ? finding.because : "",
  });

  const isViolation = readable && finding?.settled === "violation";
  const events = eventInfo?.events ?? [];

  // EVENT — only a violation opens or continues one.
  stages.push({
    id: "event",
    title: "EVENT",
    status: !readable
      ? STATUS.skip
      : !finding
        ? STATUS.skip
        : isViolation
          ? STATUS.ok
          : STATUS.none,
    headline: !readable
      ? skippedBecause
      : isViolation
        ? events.length > 0
          ? list(events.map((event) => event.summary))
          : "A violation, but no event record was supplied for this view."
        : "No event. This did not settle as a violation.",
    facts: events.map((event) => ({
      label: event.item ?? event.key,
      value: event.severity,
    })),
    detail: isViolation
      ? "A situation is one event, not one per frame — the same problem seen again is the same event continuing, never a new row."
      : "",
  });

  // EVIDENCE — the picture, and how long the event has stood.
  stages.push({
    id: "evidence",
    title: "EVIDENCE",
    status: isViolation && events.length > 0 ? STATUS.ok : STATUS.skip,
    headline:
      isViolation && events.length > 0
        ? "The floor, as it looks in this frame."
        : "No event, nothing to attach a picture to.",
    facts: events.map((event) => ({
      label: event.item ?? event.key,
      value:
        eventInfo?.fps && event.openedAt !== undefined
          ? `open ${Math.max(0, Math.round((frameResult.at - event.openedAt) * eventInfo.fps))} frames`
          : "just opened",
    })),
    detail:
      "The real product saves a snapshot the moment an event opens — the moment it started, not whatever the camera happened to see later.",
  });

  // ALERT — the operator-facing signal.
  stages.push({
    id: "alert",
    title: "ALERT",
    status: isViolation && events.length > 0 ? STATUS.ok : STATUS.skip,
    headline:
      isViolation && events.length > 0
        ? `${events.some((event) => event.severity === "high") ? "High" : "Medium"} severity, raised.`
        : "Nothing raised.",
    facts: [],
    detail: isViolation
      ? "This is what a supervisor sees — the same event, escalated in place if it gets worse, never duplicated while it stays open."
      : "",
  });

  return stages;
}

/**
 * What the AI MODEL stage asks, per kind of finding.
 *
 * A person's model stage asks "how sure is the detector about this one
 * thing". A zone's asks "what did the detector find standing inside an area
 * that was never itself a detection target". A door's asks neither — its
 * open/closed state is not inferred from a score at all in this simulation,
 * so this stage says that plainly rather than showing a number that would
 * look like it drove the verdict when nothing here did. A workstation's asks
 * a version of the zone question: who, if anyone, was found close enough to
 * count.
 */
function modelStage(finding, detection) {
  if (!finding || finding.kind === "person") {
    return {
      status: detection ? STATUS.ok : STATUS.stop,
      headline: detection
        ? `${detection.name ?? detection.label} — scored ${detection.score.toFixed(2)}`
        : "Nothing was found at this position.",
      facts: detection
        ? [
            { label: detection.name ?? "score", value: detection.score.toFixed(2) },
            ...Object.entries(detection.items ?? {}).map(([item, score]) => ({
              label: item,
              value: score.toFixed(2),
            })),
          ]
        : [],
      detail: detection ? "A guess, with a number attached. Nothing here is a fact yet." : "",
    };
  }

  if (finding.kind === "zone") {
    const inside = finding.inside ?? [];
    return {
      status: inside.length > 0 ? STATUS.ok : STATUS.none,
      headline:
        inside.length > 0
          ? list(inside.map((entry) => `${entry.name ?? entry.id} (${entry.score.toFixed(2)})`))
          : "Nothing this area watches for was detected inside it.",
      facts: inside.map((entry) => ({ label: entry.name ?? entry.id, value: entry.score.toFixed(2) })),
      detail: "An area is not detected — it is drawn. What is judged is whatever the model found standing inside it.",
    };
  }

  if (finding.kind === "workstation") {
    const nearby = finding.nearby ?? [];
    return {
      status: nearby.length > 0 ? STATUS.ok : STATUS.none,
      headline:
        nearby.length > 0
          ? list(nearby.map((entry) => `${entry.name ?? entry.id} (${entry.score.toFixed(2)})`))
          : "Nobody was found close enough to count as being at it.",
      facts: nearby.map((entry) => ({ label: entry.name ?? entry.id, value: entry.score.toFixed(2) })),
      detail: "A workstation is not detected either — presence is judged by whether a detected person is close enough to it.",
    };
  }

  if (finding.kind === "door") {
    return {
      status: STATUS.none,
      headline: "Not applicable — this door's state is set directly, not inferred from a score.",
      facts: [],
      detail:
        "Unlike a person or an area, whether a door is open is ground truth in this " +
        "simulation, the same way what someone is wearing is. What is judged next is " +
        "how long it has stayed that way, not how sure the model is.",
    };
  }

  return { status: STATUS.none, headline: "", facts: [], detail: "" };
}

/**
 * What the SAFETY RULE stage's fact row shows, per kind of finding.
 *
 * `value` is the finished sentence fragment a fact has always shown — read
 * by a person, unaffected by anything below. `meter`, where a fact has a
 * real threshold in scope, is additive: raw `{value, threshold}` numbers in
 * whatever unit that fact's own `value` string already names (a 0-1 score,
 * seconds of an allowance), for a caller that wants to draw a bar instead
 * of — or alongside — reading the sentence. A fact with no natural
 * threshold (how many things a zone found inside it, say) simply has no
 * `meter`, and nothing downstream needs to know why.
 */
function ruleFacts(finding, bars) {
  if (finding.kind === "person") {
    return (finding.items ?? []).map((entry) => ({
      label: entry.item,
      value: `${entry.score.toFixed(2)} ${entry.worn ? "≥" : "<"} ${bars.itemGrant.toFixed(2)}`,
      ok: entry.worn,
      meter: { value: entry.score, threshold: bars.itemGrant },
    }));
  }

  if (finding.kind === "zone") {
    return [{ label: "inside", value: String((finding.inside ?? []).length) }];
  }

  if (finding.kind === "door") {
    return [
      {
        label: "open for",
        value: `${finding.openSeconds.toFixed(1)}s / ${bars.doorOpenSeconds.toFixed(1)}s`,
        ok: finding.verdict !== "violation",
        meter: { value: finding.openSeconds, threshold: bars.doorOpenSeconds },
      },
    ];
  }

  if (finding.kind === "workstation") {
    return [
      {
        label: "empty for",
        value: `${finding.emptySeconds.toFixed(1)}s / ${bars.stationEmptySeconds.toFixed(1)}s`,
        ok: finding.verdict !== "violation",
        meter: { value: finding.emptySeconds, threshold: bars.stationEmptySeconds },
      },
    ];
  }

  return [];
}

function list(words) {
  if (words.length === 0) return "nothing";
  if (words.length === 1) return words[0];
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}
