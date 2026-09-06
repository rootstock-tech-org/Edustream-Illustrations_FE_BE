import { DEFAULT_SETTINGS } from "./rules.js";

/**
 * "Why did this happen?"
 *
 * §7 of the brief asks for a numbered account, on demand, next to any
 * result: person detected, sufficiently visible, gear evaluated, condition
 * satisfied or not, confirmation passed, event generated. Its own example is
 * six lines because nothing in that example stopped early — every one of
 * those six things had to be true, in order, for a PPE violation to reach an
 * operator's screen.
 *
 * This module reads the same two things `story.js` reads — a frame and which
 * finding on it to explain — and produces that account, in that voice. It
 * does not share code with `story.js` because the two answer different
 * questions at different sizes: `story.js` is "walk me through the whole
 * pipeline, one stage at a time, with a picture", built for the animation.
 * This is "just tell me why, in a sentence per reason", built to sit inline
 * next to a badge without asking anyone to open anything. Both read the same
 * underlying facts — the frame's reading, its findings, its detections — so
 * neither can disagree with the other about what actually happened.
 *
 * §7's closing instruction is the one this whole lab follows: "do not provide
 * generic explanations when the actual state is known." Every number below
 * is read off the real finding, not templated in.
 *
 * The list is not padded to six when fewer are true. A picture too dark to
 * read stops the account at one line, because points two through six never
 * ran — and saying they did, even to mark them skipped, would misstate what
 * a short list is for. The full skip-by-skip account belongs to the
 * animation, which has the room to show it properly.
 */

/** "a, b and c" */
function list(words) {
  if (words.length === 0) return "nothing";
  if (words.length === 1) return words[0];
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

function point(n, text, ok) {
  return { n, text, ok };
}

/**
 * Explain one finding's result, in as many numbered points as genuinely
 * applied — never more.
 *
 * @param frameResult a `pipeline.step()` result
 * @param findingKey `${kind}:${id}` — which finding to explain
 * @param eventInfo `{ events, fps }`, as `story.js` takes it — omit for "no
 *   event record was checked" rather than a fabricated "no event"
 * @param bars the settings this frame was actually judged against
 * @returns `{ points, verdict, stopped }` — `points` is `{n, text, ok}[]`,
 *   `ok` true/false/null (null for a statement that is not itself a pass or
 *   fail, only ever used for the opening "the picture could not be read"
 *   line); `stopped` is true when the account ends before reaching a safety
 *   event because something upstream already settled the answer.
 */
export function explain(frameResult, findingKey, eventInfo = null, bars = DEFAULT_SETTINGS) {
  if (!frameResult.readable) {
    return {
      verdict: "cannot-check",
      stopped: true,
      points: [
        point(
          1,
          `The picture could not be read: ${frameResult.reading.reason} ` +
            `Nothing below this was evaluated — not because it passed, but ` +
            `because it was never asked.`,
          null,
        ),
      ],
    };
  }

  const finding = frameResult.findings.find(
    (entry) => `${entry.kind}:${entry.id}` === findingKey,
  );

  if (!finding) {
    return {
      verdict: null,
      stopped: true,
      points: [point(1, "Nothing was being tracked at this position on this frame.", null)],
    };
  }

  if (finding.kind === "zone") return explainZone(finding, eventInfo);
  if (finding.kind === "door") return explainDoor(finding, bars, eventInfo);
  if (finding.kind === "workstation") return explainWorkstation(finding, bars, eventInfo);
  return explainPerson(finding, bars, eventInfo);
}

function explainPerson(finding, bars, eventInfo) {
  const points = [];
  const who = finding.name ?? "They";

  if (finding.settled === "lost") {
    points.push(
      point(
        1,
        `${who} scored ${finding.score.toFixed(2)}, under the ${bars.personSeen.toFixed(2)} ` +
          `bar for reporting a person at all — so ${who} was not detected. ` +
          `Nothing below this was evaluated: an undetected person is not a ` +
          `cleared one, only an unclaimed one.`,
        false,
      ),
    );
    return { verdict: "lost", stopped: true, points };
  }

  points.push(point(1, `${who} was detected — scored ${finding.score.toFixed(2)}.`, true));

  if (finding.settled === "unverified") {
    points.push(
      point(
        2,
        `${who} was not sufficiently visible for further analysis: ` +
          `${finding.score.toFixed(2)} clears the ${bars.personSeen.toFixed(2)} bar for being ` +
          `seen, but not the ${bars.personSure.toFixed(2)} bar for being judged. ` +
          `Nothing below this was evaluated — an unverified person is never accused.`,
        false,
      ),
    );
    return { verdict: "unverified", stopped: true, points };
  }

  points.push(
    point(2, `${who} was sufficiently visible for analysis — over the ${bars.personSure.toFixed(2)} bar for being judged.`, true),
  );

  const items = finding.items ?? [];
  points.push(
    point(
      3,
      `${list(bars.requires)} detection was evaluated, each against a ` +
        `${bars.itemGrant.toFixed(2)} bar: ` +
        items.map((entry) => `${entry.item} ${entry.score.toFixed(2)}`).join(", ") +
        ".",
      true,
    ),
  );

  const missing = finding.missing ?? [];
  points.push(
    missing.length > 0
      ? point(
          4,
          `The required PPE condition was NOT satisfied — no ${list(missing)} ` +
            `found on ${who === "They" ? "them" : who}.`,
          false,
        )
      : point(4, `The required PPE condition was satisfied — ${list(bars.requires)} all found.`, true),
  );

  if (finding.waiting) {
    points.push(
      point(
        5,
        `The result has NOT yet passed the configured confirmation logic: ` +
          `${finding.votes.accusing} of the ${finding.votes.needed} agreeing sightings it needs.`,
        false,
      ),
    );
    return { verdict: "watching", stopped: true, points };
  }

  // votes.accusing counts sightings *against* the person — evidence for a
  // violation, not for compliance. A clear result needs none of it: it is
  // reported the moment the frame shows everything required, which is a
  // different claim than "N agreeing sightings" and must not be phrased as
  // one — `finding.votes` is set on every settled finding, so checking it
  // for truthiness here would never reach the compliance wording at all.
  points.push(
    point(
      5,
      finding.settled === "violation"
        ? `The result passed the configured confirmation logic — ` +
          `${finding.votes.accusing} agreeing sighting${finding.votes.accusing === 1 ? "" : "s"}.`
        : `The result passed the configured confirmation logic — compliance ` +
          `needs no waiting, only an accusation does.`,
      true,
    ),
  );

  points.push(eventPoint(6, finding.settled === "violation", eventInfo));

  return { verdict: finding.settled, stopped: false, points };
}

function explainZone(finding, eventInfo) {
  const points = [];
  const inside = finding.inside ?? [];

  points.push(point(1, `${finding.name} was checked for what it watches: ${describe(finding)}`, true));

  points.push(
    inside.length > 0
      ? point(2, `${list(inside.map((entry) => entry.name ?? entry.id))} found inside it.`, false)
      : point(2, "Nothing it watches for was found inside it.", true),
  );

  points.push(
    inside.length > 0
      ? point(3, "The area condition was NOT satisfied — a marked area with something inside it is a breach the moment it is seen.", false)
      : point(3, "The area condition was satisfied — clear.", true),
  );

  points.push(eventPoint(4, finding.settled === "violation", eventInfo));

  return { verdict: finding.settled, stopped: false, points };
}

/**
 * A door's account.
 *
 * Not the same shape as a person's or an area's, and it should not be forced
 * into one: there is no detection score to report on the way to a verdict
 * here, because the door's open/closed state is ground truth in this
 * simulation rather than something inferred. What genuinely happened, in
 * order, is: the door was open, for how long, and whether that crossed the
 * allowance — three points, not six padded to look like the others.
 */
function explainDoor(finding, bars, eventInfo) {
  const who = finding.name ?? "The door";

  if (finding.verdict === "clear" && finding.openSeconds === 0) {
    return {
      verdict: finding.settled,
      stopped: false,
      points: [point(1, `${who} is closed. There is no duration to measure.`, true)],
    };
  }

  const points = [
    point(
      1,
      `${who} has been open for ${finding.openSeconds.toFixed(1)}s, against a ` +
        `${bars.doorOpenSeconds.toFixed(1)}s allowance.`,
      true,
    ),
  ];

  // Three states, not two: closed is not the same claim as "open, but not
  // yet past the allowance" — the first has nothing to satisfy, the second
  // has not failed anything yet either. Only the third is a genuine breach.
  points.push(
    finding.severity
      ? point(2, `The allowance was NOT satisfied — ${finding.severity} severity.`, false)
      : point(2, "Still within the allowance — nothing to report yet.", true),
  );

  points.push(eventPoint(3, finding.settled === "violation", eventInfo));

  return { verdict: finding.settled, stopped: false, points };
}

/** A workstation's account — the same shape as a door's, judging presence
 *  instead of a duration the operator has no allowance for. */
function explainWorkstation(finding, bars, eventInfo) {
  const nearby = finding.nearby ?? [];

  const present = nearby.length > 0;

  const points = [
    present
      ? point(1, `${list(nearby.map((entry) => entry.name ?? entry.id))} found close enough to ${finding.name ?? "the workstation"} to count as being at it.`, true)
      : point(
          1,
          `Nobody was found close enough to ${finding.name ?? "the workstation"} to count as being at it. ` +
            `Empty for ${finding.emptySeconds.toFixed(1)}s, against a ${bars.stationEmptySeconds.toFixed(1)}s allowance.`,
          false,
        ),
  ];

  // Three states: somebody there, nobody there but still within the
  // allowance, or nobody there and past it. Only "somebody there" is
  // genuinely satisfied — the middle state has not yet failed anything, but
  // it did not pass anything either, and must not read as though it did.
  points.push(
    present
      ? point(2, "The presence condition was satisfied.", true)
      : finding.severity
        ? point(2, `The presence condition was NOT satisfied — ${finding.severity} severity.`, false)
        : point(2, "Still within the allowance — nothing to report yet.", true),
  );

  points.push(eventPoint(3, finding.settled === "violation", eventInfo));

  return { verdict: finding.settled, stopped: false, points };
}

/** What a marked area watches for, in the words its own rule uses. */
function describe(finding) {
  const watches = {
    restricted: "people — alerts the moment somebody steps inside",
    lifting: "people under a load — alerts when somebody stands in it",
    vehicle: "forklifts — alerts while one is standing inside",
    walkway: "obstructions — alerts when something is left blocking it",
  };
  return watches[finding.zoneType] ?? "whatever it was drawn to watch";
}

/** The last point every explanation ends on, person or zone alike. */
function eventPoint(n, isViolation, eventInfo) {
  if (!isViolation) {
    return point(n, "No safety event was generated — the result was Clear.", true);
  }

  const events = eventInfo?.events ?? null;

  if (events === null) {
    return point(n, "A safety event would be generated, but no event record was checked for this view.", null);
  }

  if (events.length === 0) {
    return point(n, "A safety event was generated.", true);
  }

  return point(
    n,
    `A safety event was generated: ${list(events.map((event) => event.summary))} — ` +
      `${list([...new Set(events.map((event) => event.severity))])} severity.`,
    true,
  );
}
