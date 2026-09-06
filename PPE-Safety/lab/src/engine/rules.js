import { KINDS, ZONE_TYPES, pointInPolygon, standingPoint } from "./world.js";
import {
  DOOR_OPEN_SECONDS,
  DURATION_ESCALATE_AT,
  ITEM_GRANT,
  ITEM_KEEP,
  PERSON_SEEN,
  PERSON_SURE,
  STATION_EMPTY_SECONDS,
  STATION_PRESENCE_GRACE_SECONDS,
  STATION_RADIUS,
} from "./thresholds.js";

/**
 * The safety rules.
 *
 * A detection is a guess with a number on it. A rule is what the system is
 * willing to *say* on the strength of that number — and the gap between those
 * two things is where a safety product is won or lost.
 *
 * Every rule here can reach four answers, and the third is the one that makes
 * the system honest:
 *
 *   clear        nothing wrong, and the picture was good enough to be sure
 *   violation    something is wrong and the system will say so
 *   unverified   somebody is there and the system cannot judge them
 *   cannot-check the picture itself could not be read
 *
 * A system with only the first two has to guess when it does not know, and it
 * will guess "clear", because that is what an empty detection list looks like.
 * The whole of `legibility.js` and half of this file exist to make sure it
 * says "I cannot tell" instead.
 */

/** What a scene is required to have on it. Everything here is turnable. */
export const DEFAULT_SETTINGS = {
  /**
   * Which protective equipment is required.
   *
   * Helmet and vest by default, matching the real product's Safety Gear
   * module. Gloves are a separate module there and separate here, so a
   * learner can turn them on and watch the marginal case appear.
   */
  requires: ["helmet", "vest"],
  personSeen: PERSON_SEEN,
  personSure: PERSON_SURE,
  itemGrant: ITEM_GRANT,
  itemKeep: ITEM_KEEP,
  doorOpenSeconds: DOOR_OPEN_SECONDS,
  stationEmptySeconds: STATION_EMPTY_SECONDS,
  stationPresenceGrace: STATION_PRESENCE_GRACE_SECONDS,
};

/**
 * Judge one frame's detections.
 *
 * @param detections what the detector reported
 * @param world the scene, for its marked areas, doors and workstations
 * @param settings the bars in force
 * @param beliefs what was believed about each person's gear last frame — this
 *   is what makes the keep-bar possible, and the reason judgement is not a
 *   pure function of one frame
 * @param timers `{ doors, stations }` — the duration clocks doors and
 *   workstations carry from frame to frame, in exactly the way `beliefs`
 *   carries gear. See `judgeDoors`/`judgeWorkstations` for what each holds.
 * @param at this frame's time, in seconds — the clock the duration timers
 *   are measured against
 * @returns findings, plus the beliefs and timers to carry into the next frame
 */
export function judge(
  detections, world, settings = DEFAULT_SETTINGS, beliefs = {},
  timers = { doors: {}, stations: {} }, at = 0,
) {
  const bars = { ...DEFAULT_SETTINGS, ...settings };
  const findings = [];
  const nextBeliefs = {};

  for (const detection of detections) {
    if (detection.label !== "person") continue;

    /*
     * Below the seeing bar the detector has not reported a person at all.
     * This is the failure that matters most and it is deliberately visible in
     * the output rather than an empty space: `lost` is a finding, not the
     * absence of one, because an empty findings list is exactly what a safe
     * factory looks like and the two must never render the same.
     */
    if (detection.score < bars.personSeen) {
      findings.push({
        kind: "person",
        id: detection.id,
        name: detection.name,
        verdict: "lost",
        score: detection.score,
        because:
          `Scored ${detection.score.toFixed(2)}, under the ${bars.personSeen.toFixed(2)} ` +
          `bar for reporting a person at all. Nothing is said about them — ` +
          `not that they are fine, not that they are not.`,
      });
      continue;
    }

    /*
     * Seen, but not well enough to be judged. Never accused of anything — the
     * honest state for somebody the detector is only half sure it can see.
     */
    if (detection.score < bars.personSure) {
      findings.push({
        kind: "person",
        id: detection.id,
        name: detection.name,
        verdict: "unverified",
        score: detection.score,
        because:
          `Scored ${detection.score.toFixed(2)} — over the ${bars.personSeen.toFixed(2)} ` +
          `bar for being reported, under the ${bars.personSure.toFixed(2)} bar for ` +
          `being judged. Somebody is there; what they are wearing is not readable.`,
      });
      continue;
    }

    const items = [];
    const believed = beliefs[detection.id] ?? {};
    const carried = {};

    for (const item of bars.requires) {
      const score = detection.items?.[item] ?? 0;

      // Above the grant bar, the evidence stands on its own.
      if (score >= bars.itemGrant) {
        items.push({ item, score, worn: true, kept: false });
        carried[item] = true;
        continue;
      }

      /*
       * Between the keep bar and the grant bar, a belief that already stands
       * survives — but one is never created here. This bar can only keep a
       * green tick that stronger evidence granted; a grey sweatshirt at 0.41
       * still makes nobody compliant, because nothing above the grant bar
       * ever said it was a vest.
       */
      if (score >= bars.itemKeep && believed[item]) {
        items.push({ item, score, worn: true, kept: true });
        carried[item] = true;
        continue;
      }

      items.push({ item, score, worn: false, kept: false });
      carried[item] = false;
    }

    nextBeliefs[detection.id] = carried;

    const missing = items.filter((entry) => !entry.worn);

    findings.push({
      kind: "person",
      id: detection.id,
      name: detection.name,
      verdict: missing.length > 0 ? "violation" : "clear",
      score: detection.score,
      items,
      missing: missing.map((entry) => entry.item),
      because:
        missing.length > 0
          ? `No ${list(missing.map((entry) => entry.item))} found on them. ` +
            missing
              .map(
                (entry) =>
                  `${entry.item} scored ${entry.score.toFixed(2)} against a ` +
                  `${bars.itemGrant.toFixed(2)} bar`,
              )
              .join("; ") +
            `.`
          : `Everything required was found: ` +
            items
              .map((entry) => `${entry.item} ${entry.score.toFixed(2)}`)
              .join(", ") +
            `.`,
    });
  }

  findings.push(...judgeAreas(detections, world, bars));

  const doors = judgeDoors(world, timers.doors, at, bars);
  findings.push(...doors.findings);

  const stations = judgeWorkstations(detections, world, bars, timers.stations, at);
  findings.push(...stations.findings);

  return {
    findings,
    beliefs: nextBeliefs,
    timers: { doors: doors.timers, stations: stations.timers },
  };
}

/**
 * Who is standing where they should not be.
 *
 * The bar for this is the *seeing* bar, not the judging one, and that is a
 * deliberate asymmetry rather than an oversight. Deciding "is somebody
 * standing in that area" needs far less of the picture than deciding "what
 * are they wearing" — a shape in the right place is enough for the first and
 * nowhere near enough for the second. Holding a zone alert to the higher bar
 * would mean the system watched somebody walk into a restricted area and said
 * nothing because it could not make out their helmet.
 */
function judgeAreas(detections, world, bars) {
  const findings = [];

  for (const zone of world.zones) {
    const type = ZONE_TYPES[zone.type];
    if (!type) continue;

    const watched = detections.filter((detection) => {
      if (detection.score < bars.personSeen) return false;
      return watches(zone.type, detection.label);
    });

    const inside = watched.filter((detection) =>
      pointInPolygon(standingPoint(detection), zone.points),
    );

    findings.push({
      kind: "zone",
      id: zone.id,
      name: zone.name,
      zoneType: zone.type,
      verdict: inside.length > 0 ? "violation" : "clear",
      inside: inside.map((detection) => ({
        id: detection.id,
        name: detection.name,
        score: detection.score,
      })),
      because:
        inside.length > 0
          ? `${list(inside.map((detection) => detection.name ?? "something"))} ` +
            `${inside.length === 1 ? "is" : "are"} inside it. ` +
            `${type.watches}`
          : `Nothing this area watches for is inside it. ${type.watches}`,
    });
  }

  return findings;
}

/**
 * How serious a duration this long is, once it is already a problem.
 *
 * The real modules' exact formula, shared by doors and workstations: a
 * violation exists at all once the duration reaches the allowance, and from
 * there its severity rises at the same two multiples for both — four times
 * the allowance, then ten times it. A door held to its default three seconds
 * is "low" at 3s, "medium" at 12s, "high" at 30s; a workstation held to its
 * default ten is "low" at 10s, "medium" at 40s, "high" at 100s.
 */
function durationSeverity(seconds, allowance) {
  // The same float-drift tolerance events.js uses for its resolve delay:
  // `pipeline.js` accumulates `at` by repeated addition, so what is
  // conceptually exactly the allowance sometimes arrives a shade under it —
  // without this, a threshold stated as "10 seconds" would sometimes not
  // fire until the frame after 10 seconds had genuinely passed.
  const EPS = 1e-9;
  if (seconds < allowance - EPS) return null;
  if (seconds >= allowance * DURATION_ESCALATE_AT[2] - EPS) return "high";
  if (seconds >= allowance * DURATION_ESCALATE_AT[1] - EPS) return "medium";
  return "low";
}

/**
 * Doors left open too long.
 *
 * Unlike a person or an area, whether a door is open is not something this
 * lab infers from a wobbling score — it is what the learner set it to, the
 * same ground truth `wearing` is for a worker's gear. So there is no
 * detection-confidence gate here the way there is for a person or a zone;
 * what a door needs is a clock, because the real defect this rule exists to
 * catch is not "is the door open" but "how long has it been", and that
 * question has no answer inside a single frame.
 *
 * The real module also needs time to become sure a door's state is genuinely
 * open rather than a misread frame — its own confirmation, separate from and
 * faster than this — before its timer even starts. That problem is a vision
 * one this lab does not simulate for doors: there is nothing to misread, the
 * open/closed switch is exact. The general confirmation window in
 * `confirm.js` still applies to the violation this rule reports, the same as
 * it does to everyone else's, which is delay enough to matter without
 * inventing a second kind of uncertainty a ground-truth door does not have.
 *
 * @param timers `{ [doorId]: firstOpenAt }` — when each currently-open door
 *   was first seen open, so a duration can be measured across frames
 */
function judgeDoors(world, timers, at, bars) {
  const findings = [];
  const nextTimers = {};

  for (const door of world.things ?? []) {
    if (door.kind !== KINDS.DOOR) continue;

    if (!door.open) {
      findings.push({
        kind: "door",
        id: door.id,
        name: door.label,
        verdict: "clear",
        severity: null,
        openSeconds: 0,
        because: `${door.label ?? "The door"} is closed.`,
      });
      continue;
    }

    const since = timers[door.id] ?? at;
    nextTimers[door.id] = since;

    const openSeconds = Math.max(0, at - since);
    const allowance = bars.doorOpenSeconds;
    const severity = durationSeverity(openSeconds, allowance);

    findings.push({
      kind: "door",
      id: door.id,
      name: door.label,
      verdict: severity ? "violation" : "clear",
      severity,
      openSeconds,
      because: severity
        ? `${door.label ?? "The door"} has been open for ${describeDuration(openSeconds)}, ` +
          `past the ${describeDuration(allowance)} allowance.`
        : `${door.label ?? "The door"} has been open for ${describeDuration(openSeconds)}, ` +
          `within the ${describeDuration(allowance)} allowance.`,
    });
  }

  return { findings, timers: nextTimers };
}

/**
 * Workstations nobody is at.
 *
 * The real module tests whether a detection *box* overlaps a marked region,
 * two different ways depending on whether the person looks seated or
 * standing. This world has no boxes — a worker is a position — so presence
 * is a proximity test instead: is anyone the detector actually saw standing
 * close enough to count. The confidence gate is the same one a restricted
 * zone uses, for the same reason: a weak detection *keeping* a workstation
 * occupied would be the failure that matters here, since it silences an
 * alert rather than raising one.
 *
 * Two clocks, stacked, exactly as the real module runs them: presence is
 * still believed for a grace period after the last frame somebody was
 * actually seen, and only once that belief lapses does the empty allowance
 * start counting. A worker who steps out of frame for a moment is not
 * reported as having abandoned their post.
 *
 * @param timers `{ [stationId]: { seenAt, emptySince } }` per workstation
 */
function judgeWorkstations(detections, world, bars, timers, at) {
  const findings = [];
  const nextTimers = {};

  for (const station of world.things ?? []) {
    if (station.kind !== KINDS.WORKSTATION) continue;

    const nearby = detections.filter((detection) => {
      if (detection.label !== "person") return false;
      if (detection.score < bars.personSeen) return false;
      const dx = detection.x - station.x;
      const dy = detection.y - station.y;
      return Math.hypot(dx, dy) <= STATION_RADIUS;
    });
    const present = nearby.length > 0;

    const state = timers[station.id] ?? { seenAt: null, emptySince: at };
    let { seenAt, emptySince } = state;

    if (present) {
      seenAt = at;
      emptySince = null;
    } else if (seenAt !== null && at - seenAt < bars.stationPresenceGrace) {
      // Still believed occupied — the grace period covers this frame.
    } else if (emptySince === null) {
      emptySince = at;
    }

    nextTimers[station.id] = { seenAt, emptySince };

    const occupied = seenAt !== null && at - seenAt < bars.stationPresenceGrace;
    const emptySeconds = occupied || emptySince === null ? 0 : at - emptySince;
    const allowance = bars.stationEmptySeconds;
    const severity = occupied ? null : durationSeverity(emptySeconds, allowance);

    findings.push({
      kind: "workstation",
      id: station.id,
      name: station.label,
      verdict: severity ? "violation" : "clear",
      severity,
      emptySeconds,
      nearby: nearby.map((detection) => ({
        id: detection.id, name: detection.name, score: detection.score,
      })),
      because: occupied
        ? `Somebody is at ${station.label ?? "the workstation"}.`
        : severity
          ? `${station.label ?? "The workstation"} has been empty for ` +
            `${describeDuration(emptySeconds)}, past the ` +
            `${describeDuration(allowance)} allowance.`
          : `${station.label ?? "The workstation"} has been empty for ` +
            `${describeDuration(emptySeconds)}, within the ` +
            `${describeDuration(allowance)} allowance.`,
    });
  }

  return { findings, timers: nextTimers };
}

/** "3 seconds", "1 min 30 sec", "1 hr 4 min" — the real modules' own scale. */
export function describeDuration(seconds) {
  const whole = Math.floor(seconds);
  if (whole < 60) return `${whole} second${whole === 1 ? "" : "s"}`;
  if (whole < 3600) {
    const minutes = Math.floor(whole / 60);
    const secs = whole % 60;
    return `${minutes} min ${secs} sec`;
  }
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  return `${hours} hr ${minutes} min`;
}

/** Which detection label each kind of area is watching for. */
function watches(zoneType, label) {
  switch (zoneType) {
    case "restricted":
    case "lifting":
      return label === "person";
    case "vehicle":
      return label === "forklift";
    case "walkway":
      return label === "object" || label === "forklift";
    default:
      return false;
  }
}

/**
 * The worst thing standing in the findings.
 *
 * Ordered by how much it should worry somebody, which is not the same as how
 * loud it is: a person the detector lost outranks a confirmed violation,
 * because a violation is a thing the system knows about and a lost person is
 * a thing it does not.
 */
export function worstOf(findings) {
  if (findings.some((finding) => finding.verdict === "lost")) return "lost";
  if (findings.some((finding) => finding.verdict === "violation")) return "violation";
  if (findings.some((finding) => finding.verdict === "unverified")) return "unverified";
  return "clear";
}

/** "a, b and c" */
function list(words) {
  if (words.length === 0) return "nothing";
  if (words.length === 1) return words[0];
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

/** The kinds of thing a rule can be about, for a legend. */
export const VERDICTS = {
  clear: { id: "clear", label: "Clear", tone: "clear" },
  violation: { id: "violation", label: "Violation", tone: "violation" },
  unverified: { id: "unverified", label: "Unverified", tone: "unknown" },
  lost: { id: "lost", label: "Not seen", tone: "hazard" },
  "cannot-check": { id: "cannot-check", label: "Cannot check", tone: "hazard" },
};

/** A thing the rules never look at, so the floor can grey it out honestly. */
export const IGNORED_KINDS = [KINDS.CAMERA];
