import { KINDS } from "../engine/world.js";

/**
 * What the label on a detection box says, and what colour the box wears —
 * the one translation from the engine's findings into the overlay a CCTV
 * operator would see. Pure, so the node suite can check it.
 *
 * Tones:
 *   ok        green   — judged and compliant
 *   checking  yellow  — an accusation gathering its three sightings
 *   violation red     — confirmed
 *   unverified grey   — seen, not well enough to judge
 *   lost      grey, dotted — the detector did not report it at all
 *   vehicle   orange  — a forklift with nothing wrong
 *   object    none    — a crate on open floor
 *   station   cyan    — a workstation
 */
export const TONES = {
  ok: { colour: "#22C55E", text: "#052E16" },
  checking: { colour: "#FACC15", text: "#3B2F00" },
  violation: { colour: "#EF4444", text: "#FFFFFF" },
  unverified: { colour: "#94A3B8", text: "#0F172A" },
  lost: { colour: "#94A3B8", text: "#0F172A", dash: "3 3" },
  vehicle: { colour: "#F97316", text: "#2A1204" },
  station: { colour: "#22D3EE", text: "#042F2E", dash: "8 6" },
  object: null,
};

function list(words) {
  if (words.length === 0) return "nothing";
  if (words.length === 1) return words[0];
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

const seconds = (value, digits = 1) => `${value.toFixed(digits)}s`;

/**
 * How far an accusation has got. Three agreeing sightings is the floor, but
 * an accusation must also outnumber the disagreeing sightings still inside
 * the window two to one — so after a long clear spell the count can pass
 * three and still be waiting. Said as "confirming" rather than shown as a
 * fraction climbing past its own denominator.
 */
export function checkingText(votes) {
  if (!votes) return "checking";
  return votes.accusing < votes.needed
    ? `checking ${votes.accusing}/${votes.needed}`
    : "confirming";
}

/**
 * The zones this frame judged a thing to be inside, worst first.
 */
export function zonesJudging(thingId, zoneFindings) {
  const inside = zoneFindings.filter((zone) => (zone.inside ?? []).some((entry) => entry.id === thingId));
  return inside.sort((a, b) => rank(b.settled) - rank(a.settled));
}

function rank(settled) {
  return settled === "violation" ? 2 : settled === "watching" ? 1 : 0;
}

/**
 * @returns `{ tone, label, status }` — `label` is the name; `status` a short
 *   state phrase for the second line of the chip (null when there is
 *   nothing to say beyond the name); `tone` a key into TONES, or null for no
 *   box at all.
 */
export function labelFor({ thing, finding = null, zoneFindings = [], readable = true, bars }) {
  const name = thing.label ?? thing.kind;

  if (thing.kind === KINDS.CAMERA) return { tone: null, label: name, status: null };

  if (!readable) {
    if (thing.kind === KINDS.WORKSTATION) return { tone: "station", label: name, status: null };
    return { tone: null, label: name, status: null };
  }

  const judging = zonesJudging(thing.id, zoneFindings);
  const zoneWorst = judging[0] ?? null;
  const zonePhrase = (zone) =>
    zone.settled === "violation"
      ? `in ${zone.name}`
      : `entering ${zone.name} · ${checkingText(zone.votes)}`;

  if (thing.kind === KINDS.WORKER) {
    if (!finding) return { tone: null, label: name, status: null };
    if (finding.settled === "lost") return { tone: "lost", label: name, status: "not detected" };
    if (finding.settled === "unverified") return { tone: "unverified", label: name, status: "unverified" };

    if (zoneWorst?.settled === "violation") {
      return { tone: "violation", label: name, status: zonePhrase(zoneWorst) };
    }
    if (finding.settled === "violation") {
      return { tone: "violation", label: name, status: `no ${list(finding.missing ?? [])}` };
    }
    if (zoneWorst?.settled === "watching") {
      return { tone: "checking", label: name, status: zonePhrase(zoneWorst) };
    }
    if (finding.settled === "watching") {
      return { tone: "checking", label: name, status: checkingText(finding.votes) };
    }
    return { tone: "ok", label: name, status: "compliant" };
  }

  if (thing.kind === KINDS.FORKLIFT) {
    if (zoneWorst?.settled === "violation") return { tone: "violation", label: name, status: zonePhrase(zoneWorst) };
    if (zoneWorst?.settled === "watching") return { tone: "checking", label: name, status: zonePhrase(zoneWorst) };
    return { tone: "vehicle", label: name, status: null };
  }

  if (thing.kind === KINDS.OBJECT) {
    if (zoneWorst?.settled === "violation") return { tone: "violation", label: name, status: `blocking ${zoneWorst.name}` };
    if (zoneWorst?.settled === "watching") return { tone: "checking", label: name, status: zonePhrase(zoneWorst) };
    return { tone: null, label: name, status: null };
  }

  if (thing.kind === KINDS.DOOR) {
    if (!finding) return { tone: null, label: name, status: thing.open ? "open" : "closed" };
    if (finding.settled === "violation") {
      return { tone: "violation", label: name, status: `open ${seconds(finding.openSeconds)} · ${finding.severity}` };
    }
    if (finding.settled === "watching") {
      return { tone: "checking", label: name, status: `open ${seconds(finding.openSeconds)} · ${checkingText(finding.votes)}` };
    }
    if (thing.open) {
      return { tone: "checking", label: name, status: `open ${seconds(finding.openSeconds)} / ${seconds(bars.doorOpenSeconds, 0)}` };
    }
    return { tone: null, label: name, status: "closed" };
  }

  if (thing.kind === KINDS.WORKSTATION) {
    if (!finding) return { tone: "station", label: name, status: null };
    const nearby = finding.nearby ?? [];
    if (nearby.length > 0) {
      return { tone: "station", label: name, status: `attended · ${list(nearby.map((entry) => entry.name ?? entry.id))}` };
    }
    if (finding.settled === "violation") {
      return { tone: "violation", label: name, status: `unattended ${seconds(finding.emptySeconds, 0)} · ${finding.severity}` };
    }
    if (finding.settled === "watching") {
      return { tone: "checking", label: name, status: `unattended ${seconds(finding.emptySeconds, 0)} · ${checkingText(finding.votes)}` };
    }
    if (finding.emptySeconds > 0) {
      return { tone: "station", label: name, status: `empty ${seconds(finding.emptySeconds, 0)} / ${seconds(bars.stationEmptySeconds, 0)}` };
    }
    return { tone: "station", label: name, status: "nobody seen · grace period" };
  }

  return { tone: null, label: name, status: null };
}

/** A floor position as a grid reference — rows A–F down the side, columns 1–10 across. */
export function gridRef(x, y) {
  const col = Math.min(10, Math.max(1, Math.floor(x * 10) + 1));
  const row = "ABCDEF"[Math.min(5, Math.max(0, Math.floor(y * 6)))];
  return `${row}${col}`;
}

/** Elapsed simulation seconds as HH:MM:SS. */
export function clock(seconds) {
  const whole = Math.max(0, Math.floor(seconds));
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}
