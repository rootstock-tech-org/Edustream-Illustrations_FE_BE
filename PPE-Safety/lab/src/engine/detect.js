import { GEAR, KINDS } from "./world.js";
import { CLEAR_CONDITIONS, read } from "./legibility.js";

/**
 * What the model finds, and how sure it is.
 *
 * A detector does not report facts. It reports guesses with a number attached,
 * and every decision the rest of the system makes is really a decision about
 * that number. This module produces those guesses for the simulated factory.
 *
 * Three properties matter, and each one is here because leaving it out would
 * teach something false:
 *
 * **It is deterministic.** The same scene always produces the same scores.
 * A learner who moves a worker one step and watches a verdict change has to
 * know the change came from the move. Randomness that reshuffles on every
 * render would make the whole lab unfalsifiable.
 *
 * **It wobbles anyway.** Scores drift frame to frame, seeded on the frame
 * number, because that is what real scores do — and that wobble is the entire
 * reason the confirmation window in `confirm.js` exists. A simulation with
 * perfectly steady scores would make confirmation look like pointless
 * bureaucracy instead of the thing standing between an operator and an alarm
 * that cries wolf.
 *
 * **Hi-vis is easier to see than plain clothes.** This is the least
 * comfortable fact in the real system and it is modelled deliberately. On the
 * reference photograph the worker in a hi-vis vest scores 0.795 and the
 * plainly-dressed man beside him scores 0.248 — in the same frame, the same
 * light, the same distance. Blur them both slightly and the hi-vis worker
 * holds 0.805 while the other falls under the bar and stops existing. No
 * threshold fixes that; it is a property of what the model was trained on.
 * A learner should meet it here rather than discover it on a factory floor.
 */

/* ------------------------------------------------------------------ */
/* A repeatable wobble                                                 */
/* ------------------------------------------------------------------ */

/** FNV-1a, so a thing's id and a frame number become a stable seed. */
function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** One number in [0,1) from a seed. Mulberry32 — small, and good enough. */
function noise(seed) {
  let t = (seed + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), 1 | t);
  t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** A wobble in [-spread, +spread], stable for this thing on this frame. */
function wobble(id, frame, channel, spread) {
  return (noise(hash(`${id}:${frame}:${channel}`)) - 0.5) * 2 * spread;
}

/* ------------------------------------------------------------------ */
/* What each thing scores                                              */
/* ------------------------------------------------------------------ */

/** What the detector would be asked to call each kind. */
export const DETECTED_AS = {
  [KINDS.WORKER]: "person",
  [KINDS.FORKLIFT]: "forklift",
  [KINDS.OBJECT]: "object",
  [KINDS.DOOR]: "door",
};

/** A clear, near, hi-vis person, in a perfect picture. */
const PERSON_BASE = 0.92;

/**
 * What plain clothes cost.
 *
 * Sized from the real gap: hi-vis 0.795 against plain 0.248 on the same
 * photograph. Applied to a worker with no vest, because the vest is what the
 * model finds easy.
 */
const PLAIN_CLOTHES_COST = 0.45;

/** What being far from the camera costs a person, at the far corner. */
const DISTANCE_COST = 0.3;

/** And what it costs a piece of gear, which is smaller and goes first. */
const GEAR_DISTANCE_COST = 0.3;

/**
 * What real gear scores when it is plainly there.
 *
 * Helmets and vests are the measured figures from the real test footage —
 * 0.88 and 0.76. Gloves are not: no sweep of the gloves weights was published
 * to copy, so 0.76 is a reasonable figure and not a measurement, and it is
 * said here rather than left looking established.
 *
 * They are ordered as they are for a reason that shows up immediately. In a
 * good picture all three sit comfortably above the 0.55 bar and the scene
 * reads clean. Dim it, and they come down together — vest first, because it
 * starts lowest — until scores are wandering across the bar from frame to
 * frame. That is where the keep-bar and the confirmation window stop being
 * bureaucracy and start being the thing holding the verdict steady.
 */
const GEAR_BASE = { helmet: 0.88, vest: 0.76, gloves: 0.76 };

/**
 * What the model scores on gear that is not being worn.
 *
 * Not zero. A detector always finds *something*, and the honest ceiling for
 * it is the highest score the real model was measured to give a thing that
 * was not there at all: 0.144, on a crop of sky and steelwork.
 */
const ABSENT_CEILING = 0.14;

/** How far a thing is from the camera, as a fraction of the longest span. */
function distanceFromCamera(thing, camera) {
  if (!camera) return 0.4;
  const dx = thing.x - camera.x;
  const dy = thing.y - camera.y;
  return Math.min(1, Math.hypot(dx, dy) / Math.SQRT2);
}

/**
 * How much a bad picture drags a score down.
 *
 * Interpolating toward a floor rather than multiplying to zero: at half
 * daylight the real hi-vis worker still scored 0.795, so a picture that is
 * merely dim must not erase everybody in it. What it does is squeeze the
 * whole range downward, which pushes whoever was already marginal — the
 * distant one, the one in plain clothes — under the bar first. That is
 * exactly how the real failure arrives.
 */
function qualityFactor(detectability) {
  return 0.55 + 0.45 * detectability;
}

/**
 * Run the detector over a scene.
 *
 * @param world the factory
 * @param conditions the camera's light, blur and compression
 * @param frame which frame this is — the wobble is seeded on it
 * @returns detections, each with a score and, for people, a score per item of
 *   protective equipment. Nothing here decides anything: a detection below
 *   every bar is still returned, labelled with what it scored, because "the
 *   model found it at 0.31" and "the model found nothing" are different
 *   problems with different answers.
 */
export function detect(world, conditions = CLEAR_CONDITIONS, frame = 0) {
  const reading = read(conditions);
  const quality = qualityFactor(reading.detectability);
  const camera = world.things.find((thing) => thing.kind === KINDS.CAMERA);

  const detections = [];

  for (const thing of world.things) {
    const label = DETECTED_AS[thing.kind];
    if (!label) continue; // A camera and a workbench are not looked for.

    const far = distanceFromCamera(thing, camera);

    if (thing.kind === KINDS.WORKER) {
      const hiVis = thing.wearing.includes("vest");

      let score = PERSON_BASE - DISTANCE_COST * far;
      if (!hiVis) score -= PLAIN_CLOTHES_COST;
      score = clamp01(score * quality + wobble(thing.id, frame, "person", 0.03));

      const items = {};
      for (const item of GEAR) {
        items[item] = gearScore(thing, item, far, quality, frame);
      }

      detections.push({
        id: thing.id,
        thingId: thing.id,
        label,
        name: thing.label,
        score,
        x: thing.x,
        y: thing.y,
        far,
        hiVis,
        items,
      });
      continue;
    }

    const score = clamp01(
      (0.88 - 0.22 * far) * quality + wobble(thing.id, frame, "thing", 0.03),
    );

    detections.push({
      id: thing.id,
      thingId: thing.id,
      label,
      name: thing.label,
      score,
      x: thing.x,
      y: thing.y,
      far,
      items: null,
    });
  }

  return { reading, quality, detections };
}

function gearScore(worker, item, far, quality, frame) {
  const worn = worker.wearing.includes(item);

  if (!worn) {
    // Whatever the model makes of an empty head. Never enough to grant a
    // green tick, and stable enough that absence does not flicker into
    // presence.
    return clamp01(
      ABSENT_CEILING * 0.6 +
        Math.abs(wobble(worker.id, frame, `absent:${item}`, ABSENT_CEILING * 0.4)),
    );
  }

  const base = GEAR_BASE[item] ?? 0.7;

  // Gear wobbles harder than a person does. A whole body is a large, obvious
  // shape; a helmet is a few dozen pixels, and its score wanders across the
  // bar from frame to frame. That wandering is what the confirmation window
  // is for.
  return clamp01(
    (base - GEAR_DISTANCE_COST * far) * quality +
      wobble(worker.id, frame, `gear:${item}`, 0.06),
  );
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
