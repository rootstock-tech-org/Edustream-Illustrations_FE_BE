import { explain } from "../engine/explain.js";
import {
  ACCUSE_MIN_VOTES,
  DOOR_OPEN_SECONDS,
  FLOORS,
  ITEM_GRANT,
  ITEM_KEEP,
  PERSON_SEEN,
  PERSON_SURE,
  RESOLVE_AFTER_SECONDS,
  STATION_EMPTY_SECONDS,
  STATION_PRESENCE_GRACE_SECONDS,
  STEADY_WINDOW_SECONDS,
} from "../engine/thresholds.js";
import { KINDS } from "../engine/world.js";

/**
 * The tutor — a guide that reads the live simulation and answers from it.
 *
 * It runs entirely in the page: its tips are built from the frame the
 * viewer is looking at, and its answers come from the engine's own
 * explanations (`explain()`) and constants, never from a canned script that
 * could disagree with the floor. It says so when a question is outside what
 * it can read.
 */

export function tips(ctx) {
  const { result, world, fps, readable, reading, openEvents } = ctx;
  const out = [];
  const findings = result?.findings ?? [];

  out.push(`You are observing Factory Floor A. Camera 01 is analysing ${fps} frames a second in real time.`);

  if (!readable) {
    out.push(`The picture cannot be read (${reading?.reason?.replace(/\.$/, "").toLowerCase() ?? "the camera cannot make it out"}). Nothing is being judged — that is not the same as all clear. Restore the lighting to continue.`);
    return out;
  }

  const violation = findings.find((finding) => finding.settled === "violation");
  const watching = findings.find((finding) => finding.settled === "watching");
  const lost = findings.find((finding) => finding.settled === "lost");

  if (violation) {
    out.push(`${violation.name ?? "Something"} ${describeViolation(violation)}. The system waited for ${ACCUSE_MIN_VOTES} agreeing sightings before raising it — one bad frame is never enough.`);
  }
  if (watching) {
    out.push(`${watching.name ?? "Something"} is being checked: ${watching.votes.accusing} of ${watching.votes.needed} sightings so far. Nothing is reported until the accusation is backed up.`);
  }
  if (lost) {
    out.push(`${lost.name} scored ${lost.score.toFixed(2)}, under the ${PERSON_SEEN.toFixed(2)} bar for being reported at all — the system is saying nothing about them, which is not the same as saying they are fine.`);
  }
  if (!violation && !watching) {
    const worker = world.things.find((thing) => thing.kind === KINDS.WORKER);
    out.push(`Try moving ${worker?.label ?? "a worker"} into the restricted zone to see how the system responds.`);
  }
  if (Object.keys(openEvents ?? {}).length > 0 && out.length < 3) {
    out.push(`An open event stays one row however many frames it lasts, and closes ${RESOLVE_AFTER_SECONDS} s after the problem was last seen.`);
  }
  return out.slice(0, 3);
}

function describeViolation(finding) {
  if (finding.kind === "person") return `is missing ${(finding.missing ?? []).join(" and ")}`;
  if (finding.kind === "zone") return `has ${(finding.inside ?? []).map((entry) => entry.name).join(", ")} inside it`;
  if (finding.kind === "door") return `has been open for ${finding.openSeconds.toFixed(0)} s`;
  if (finding.kind === "workstation") return `has been unattended for ${finding.emptySeconds.toFixed(0)} s`;
  return "has a confirmed violation";
}

const TOPICS = [
  {
    match: /restricted|crane|zone|\barea\b|\benter/i,
    answer: () =>
      `A restricted zone is judged from where a person's feet are, the moment they are inside it — but only for someone the model reported at all (over ${PERSON_SEEN.toFixed(2)}). Like every accusation it needs ${ACCUSE_MIN_VOTES} agreeing sightings inside ${STEADY_WINDOW_SECONDS} s before it is raised, and it opens one high-severity event for the area, not one per person.`,
  },
  {
    match: /walkway|block|obstruct|forklift|vehicle|truck/i,
    answer: () =>
      `A walkway watches for obstructions — crates and forklifts, not people. Something left inside it is a medium-severity event once confirmed. The forklift itself has no rule of its own; a marked area is what judges it.`,
  },
  {
    match: /helmet|vest|glove|mask|\bppe\b|\bgear\b|wearing/i,
    answer: () =>
      `Helmet and vest are required. A piece of gear is believed worn when the model scores it at ${ITEM_GRANT.toFixed(2)} or more, and once believed it keeps being believed down to ${ITEM_KEEP.toFixed(2)} so a dipping score does not accuse somebody who has plainly been wearing it. Gloves and masks are not required on this floor, so they are scored but never judged. Missing gear is a medium-severity event.`,
  },
  {
    match: /confiden|score|number|0\.\d|percent|\bsure\b/i,
    answer: () =>
      `Every number is the model's confidence, 0 to 1 — a guess with a number on it, not a fact. A person is reported at ${PERSON_SEEN.toFixed(2)}, judged at ${PERSON_SURE.toFixed(2)}, and gear is believed at ${ITEM_GRANT.toFixed(2)}. The bars differ because the mistakes differ: missing a person costs more than a false "someone might be there", while wrongly believing a vest puts a green tick on an unprotected worker. Things far from the camera, and people without hi-vis, score lower.`,
  },
  {
    match: /\bthree\b|3 |sighting|confirm|\bwait|delay|flicker|checking/i,
    answer: (question, ctx) =>
      `Scores wobble from frame to frame, so one frame proves nothing. An accusation is raised only after ${ACCUSE_MIN_VOTES} agreeing sightings within ${STEADY_WINDOW_SECONDS} s, outnumbering disagreeing ones two to one — at ${ctx.fps} frames a second that is ${(((ACCUSE_MIN_VOTES - 1) / ctx.fps)).toFixed(1)} s. Compliance is reported on the first frame: delaying good news costs nothing, delaying an alarm costs a supervisor seconds.`,
  },
  {
    match: /dark|\blight|blur|focus|camera|\bsee\b|picture|\bread\b|\bfeed\b/i,
    answer: () =>
      `Before anything else the picture is checked: brightness must be ≥ ${FLOORS.brightness}, contrast ≥ ${FLOORS.contrast}, detail ≥ ${FLOORS.sharpness} and compression damage ≤ ${FLOORS.blockiness.toFixed(2)}. If any fails, nothing further is judged and the answer is "cannot check" — never "all clear". A camera that has stopped seeing people looks exactly like a floor where everyone is behaving, which is why this check comes first.`,
  },
  {
    match: /door|\bopen/i,
    answer: () =>
      `A door may stay open ${DOOR_OPEN_SECONDS} s. Past that it is reported at low severity, rising to medium at ${DOOR_OPEN_SECONDS * 4} s and high at ${DOOR_OPEN_SECONDS * 10} s — and severity never quietly falls while the door stays open.`,
  },
  {
    match: /station|workstation|bench|unattended|attend/i,
    answer: () =>
      `Somebody is counted as at a workstation while a reported person stands within its radius. When they leave, presence is still believed for ${STATION_PRESENCE_GRACE_SECONDS} s of grace; only then does the ${STATION_EMPTY_SECONDS} s empty allowance start. Past it the station is reported unattended, escalating at ${STATION_EMPTY_SECONDS * 4} s and ${STATION_EMPTY_SECONDS * 10} s.`,
  },
  {
    match: /event|alert|\blog\b|history|resolve|escalat|severity|warning/i,
    answer: () =>
      `A confirmed problem opens one event. Seen again on later frames it is the same event, never a new row. Severity can rise while it stays open and never falls; it closes ${RESOLVE_AFTER_SECONDS} s after the problem was last seen. Restricted and vehicle zones are high severity; missing gear, walkways and lifting areas are medium; doors and workstations start low and escalate.`,
  },
  {
    match: /what (is|does) this|how (does|do) (this|it) work|start|help|explain/i,
    answer: () =>
      `This is a simulated factory floor watched by a simulated camera, judged with the real system's rules and numbers. Every frame: can the picture be read → what did the model find and how sure is it → what do the rules say → has it been seen enough times → what is the supervisor told. Ask about any worker by name, or about zones, gear, confidence, confirmation, the camera, doors, workstations or events.`,
  },
];

export function answer(question, ctx) {
  const trimmed = question.trim();
  if (!trimmed) return "Ask me about anything on the floor — a worker by name, the restricted zone, the scores, or why the system waits for three sightings.";

  // A question about a particular thing on the floor is answered from that
  // thing's own account, whatever else it mentions.
  const lower = trimmed.toLowerCase();
  const named =
    ctx.world.things.some((thing) => thing.label && lower.includes(thing.label.toLowerCase())) ||
    ctx.world.zones.some((zone) => lower.includes(zone.name.toLowerCase()));
  if (named || /flag|accus|wrong with/.test(lower)) return whyAnswer(trimmed, ctx);

  for (const topic of TOPICS) {
    if (topic.match.test(trimmed)) return topic.answer(trimmed, ctx);
  }
  if (/why|reason/.test(lower)) return whyAnswer(trimmed, ctx);
  return (
    `I can only answer from what is happening on this floor. Try "why is ${ctx.world.things.find((thing) => thing.kind === KINDS.WORKER)?.label ?? "Worker 01"} flagged?", ` +
    `"what does the restricted zone do?", "what do the scores mean?", "why does it wait for 3 sightings?", or "what happens when the camera is dark?".`
  );
}

function whyAnswer(question, ctx) {
  const { result, world, openEvents, fps, bars, reading } = ctx;
  if (!result) return "The first frame has not arrived yet.";
  // The live reading, not the frame's — a paused floor whose light has just
  // been cut is not being judged either, and saying otherwise would be the
  // one lie this whole page exists to argue against.
  if (reading ? !reading.readable : result.readable === false) {
    const why = reading?.reason ?? result.reading?.reason ?? "";
    return `Nothing is flagged because nothing is being judged: ${why} Every stage after the picture check was skipped on purpose.`;
  }

  const named = world.things.find((thing) => thing.label && question.toLowerCase().includes(thing.label.toLowerCase()));
  const target = named
    ? result.findings.find((finding) => finding.id === named.id) ?? null
    : result.findings.find((finding) => finding.settled === "violation")
      ?? result.findings.find((finding) => finding.settled === "watching")
      ?? null;

  if (!target) {
    if (named) {
      const zone = world.zones.find((entry) => entry.id === named.id);
      if (zone) {
        const zoneFinding = result.findings.find((finding) => finding.id === zone.id);
        return zoneFinding ? points(zoneFinding, result, openEvents, fps, bars) : `${zone.name} has not been judged this frame.`;
      }
      return `${named.label} has no rule of its own — the model scores it, and a marked area judges whether it is somewhere it should not be.`;
    }
    return "Nothing is flagged right now. Every judged thing is clear, and the picture was good enough to mean it.";
  }
  return points(target, result, openEvents, fps, bars);
}

function points(finding, result, openEvents, fps, bars) {
  const key = `${finding.kind}:${finding.id}`;
  const events = Object.values(openEvents ?? {}).filter((event) =>
    finding.kind === "zone" ? event.key === `zone:${finding.id}` : event.key.startsWith(`${finding.id}:`),
  );
  const out = explain(result, key, { events, fps }, bars);
  return out.points.map((point) => `${point.n}. ${point.text}`).join("\n");
}
