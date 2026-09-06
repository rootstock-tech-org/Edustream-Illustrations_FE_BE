/**
 * The factory floor, as data.
 *
 * Pure JavaScript — no React, no DOM, no network. Everything the learner can
 * place, move or draw lives here as plain values, and every screen that draws
 * the floor reads this and nothing else.
 *
 * Two decisions shape the whole file:
 *
 * **Coordinates are fractions of the floor, never pixels.** A worker at
 * {x: 0.5, y: 0.5} is in the middle whether the floor is drawn at 900px on a
 * desk or 340px on a phone. This is the same choice the real product makes for
 * its detection geometry.
 *
 * **Nothing here decides anything.** This module holds what is *there*; the
 * rules that judge it — is somebody inside a zone, is their helmet missing,
 * can the picture be read at all — arrive in the next step as their own files
 * with their own checks. Keeping state and judgement apart is what makes the
 * judgement testable.
 */

/** What can stand on the floor. */
export const KINDS = {
  WORKER: "worker",
  FORKLIFT: "forklift",
  CAMERA: "camera",
  DOOR: "door",
  WORKSTATION: "workstation",
  OBJECT: "object",
};

/** Protective equipment a worker may or may not be wearing. */
export const GEAR = ["helmet", "vest", "gloves"];

/**
 * The kinds of area an operator can mark, and what each one means.
 *
 * These mirror the real product's capabilities exactly — restricted zones for
 * people, vehicle zones for forklifts, walkways that must stay clear, lifting
 * areas around a hoist. Nothing here exists that the real system cannot do,
 * because a lab that teaches an invented capability teaches a lie.
 */
export const ZONE_TYPES = {
  restricted: {
    id: "restricted",
    name: "Restricted zone",
    watches: "People — alerts the moment somebody steps inside.",
    colour: "hazard",
  },
  vehicle: {
    id: "vehicle",
    name: "Vehicle zone",
    watches: "Forklifts — alerts while one is standing inside.",
    colour: "violation",
  },
  walkway: {
    id: "walkway",
    name: "Walkway",
    watches: "Obstructions — alerts when something is left blocking it.",
    colour: "clear",
  },
  lifting: {
    id: "lifting",
    name: "Lifting area",
    watches: "People under a load — alerts when somebody stands in it.",
    colour: "progress",
  },
};

/** A fraction clamped to the floor, so nothing can be dragged off the world. */
export function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

let nextId = 1;

/** Ids are unique within a session and never reused, so a stale id is a miss. */
export function freshId(prefix) {
  nextId += 1;
  return `${prefix}-${nextId}`;
}

/** Reset the id counter. For the suite, so its expectations are stable. */
export function resetIds() {
  nextId = 1;
}

/**
 * One thing on the floor.
 *
 * `wearing` is only meaningful for a worker, and is a set of the gear they
 * have on — the absence of an item is what a PPE rule will look for. A
 * forklift, a door or a crate carries an empty one and is never asked.
 */
export function makeThing(kind, x, y, extra = {}) {
  return {
    id: freshId(kind),
    kind,
    x: clamp01(x),
    y: clamp01(y),
    label: extra.label ?? null,
    wearing: kind === KINDS.WORKER ? (extra.wearing ?? [...GEAR]) : [],
    ...extra,
  };
}

/**
 * A marked area.
 *
 * Stored as a list of corners rather than a rectangle: the real product lets
 * an operator click the corners of any shape, and a lab that only offered
 * rectangles would teach a simpler system than the one it is about.
 */
export function makeZone(type, points, name) {
  return {
    id: freshId("zone"),
    type,
    name: name ?? ZONE_TYPES[type].name,
    points: points.map(([x, y]) => [clamp01(x), clamp01(y)]),
  };
}

/**
 * Is a point inside a polygon?
 *
 * Ray casting, the same test the real product's zone check reduces to. It
 * lives here rather than in a component because the answer to "is this worker
 * in that zone" is a fact about the world, not about how it is drawn.
 */
export function pointInPolygon([x, y], points) {
  let inside = false;

  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];

    const straddles = yi > y !== yj > y;
    if (!straddles) continue;

    const crossesAt = ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (x < crossesAt) inside = !inside;
  }

  return inside;
}

/**
 * Where a person is judged to be standing.
 *
 * Their feet, not their middle. This matters and is not a detail: the real
 * product measures the lower band of a detection against the floor area,
 * because somebody leaning over a barrier has their head inside a zone and
 * their feet safely outside, and it is the feet that say where they are. A
 * lab that judged by the centre would teach the wrong intuition about every
 * zone alert the learner sees afterwards.
 */
export function standingPoint(thing) {
  return [thing.x, thing.y];
}

/** Which zones this thing is standing in. */
export function zonesContaining(thing, zones) {
  const foot = standingPoint(thing);
  return zones.filter((zone) => pointInPolygon(foot, zone.points));
}

/**
 * The floor as it first appears.
 *
 * A small scene rather than an empty grid: a learner opening the factory for
 * the first time should have something to click before they have understood
 * enough to place anything. One camera, two workers — one fully equipped, one
 * missing a helmet, so the difference is visible before anything is explained
 * — a forklift, a door, a workstation and a crate.
 */
export function startingWorld() {
  resetIds();

  return {
    things: [
      makeThing(KINDS.CAMERA, 0.5, 0.06, { label: "Camera 1" }),
      makeThing(KINDS.WORKER, 0.24, 0.55, { label: "Worker A" }),
      makeThing(KINDS.WORKER, 0.42, 0.72, {
        label: "Worker B",
        wearing: ["vest", "gloves"],
      }),
      makeThing(KINDS.FORKLIFT, 0.74, 0.42, { label: "Forklift" }),
      makeThing(KINDS.WORKSTATION, 0.16, 0.28, { label: "Station 1" }),
      makeThing(KINDS.DOOR, 0.91, 0.72, { label: "Bay door", open: false }),
      makeThing(KINDS.OBJECT, 0.62, 0.86, { label: "Crate" }),
    ],
    zones: [],
  };
}

/* ------------------------------------------------------------------ */
/* Changes to the world. Each returns a new world; none mutates.       */
/* ------------------------------------------------------------------ */

export function moveThing(world, id, x, y) {
  return {
    ...world,
    things: world.things.map((thing) =>
      thing.id === id ? { ...thing, x: clamp01(x), y: clamp01(y) } : thing,
    ),
  };
}

export function addThing(world, kind, x, y, extra) {
  return { ...world, things: [...world.things, makeThing(kind, x, y, extra)] };
}

export function removeThing(world, id) {
  return { ...world, things: world.things.filter((thing) => thing.id !== id) };
}

/** Put a piece of gear on, or take it off. Workers only. */
export function toggleGear(world, id, item) {
  return {
    ...world,
    things: world.things.map((thing) => {
      if (thing.id !== id || thing.kind !== KINDS.WORKER) return thing;
      const wearing = thing.wearing.includes(item)
        ? thing.wearing.filter((worn) => worn !== item)
        : [...thing.wearing, item];
      return { ...thing, wearing };
    }),
  };
}

export function addZone(world, type, points, name) {
  return { ...world, zones: [...world.zones, makeZone(type, points, name)] };
}

export function removeZone(world, id) {
  return { ...world, zones: world.zones.filter((zone) => zone.id !== id) };
}

/** A thing by id, or undefined. */
export function findThing(world, id) {
  return world.things.find((thing) => thing.id === id);
}
