import { FLOORS } from "./thresholds.js";

/**
 * Can this picture be judged at all?
 *
 * The question the real product asks before any other, and the reason it asks
 * it is worth stating plainly, because it is the least obvious failure in the
 * whole system:
 *
 * **A camera that has stopped seeing people looks exactly like a factory
 * where everybody is behaving.** Dim the room and people are not misjudged,
 * they are lost — and a scene with nobody in it renders as calm, green,
 * everything-is-fine. In the real measurement the cliff is one percentage
 * point wide: at 17% of daylight the system reported "1 without a helmet",
 * and at 16% it reported "Wearing the right gear".
 *
 * So the picture is measured first, and outside the range where detection was
 * measured to work the honest answer is "I cannot check this", never "all
 * clear".
 *
 * This module models that measurement from three things a learner can turn —
 * how bright the scene is, how far out of focus, and how hard the stream is
 * being compressed. The four numbers it produces are the four the real module
 * computes from actual pixels, and they are calibrated to its published
 * readings so the floors fire in the same places.
 */

/** The measured baseline: the site photograph, untouched. */
const BASELINE = {
  brightness: 125.3,
  contrast: 58.4,
  sharpness: 249.2,
  blockiness: 1.208,
};

/** Conditions with nothing wrong: full light, sharp lens, clean stream. */
export const CLEAR_CONDITIONS = { light: 1, blur: 0, compression: 0 };

/**
 * Measure a picture described by its conditions.
 *
 * @param conditions {light, blur, compression}, each 0..1 — 1 light is full
 *   daylight, 0 blur is a sharp lens, 0 compression is an untouched stream.
 * @returns a reading: the four measures, whether the picture can be judged,
 *   and, when it cannot, the reason in the words an operator would be shown.
 */
export function read(conditions = CLEAR_CONDITIONS) {
  const light = clamp01(conditions.light ?? 1);
  const blur = clamp01(conditions.blur ?? 0);
  const squeeze = clamp01(conditions.compression ?? 0);

  const brightness = BASELINE.brightness * light;
  const contrast = BASELINE.contrast * light;

  /*
   * Two things the real measurement settled that would have been guessed
   * wrong, and they are the reason this simulation needs four numbers rather
   * than one:
   *
   * **Detail does not fall when the light does.** Raw Laplacian variance
   * scales with signal amplitude, so the same photograph reads 249 at full
   * light and 11.5 at a fifth of it without a trace of blur — and the first
   * version of the real module reported dim pictures as "Too blurred to
   * check", sending an operator to the lens when the answer was the light
   * switch. Normalised for contrast first, the same sweep reads flat. So
   * `light` does not appear in this line at all, and that absence is load
   * bearing.
   *
   * **Compression makes a picture measure *sharper*.** Blocking artefacts are
   * edges: the real sweep reads 249 untouched, 302 at JPEG quality 10 and 400
   * at quality 5. A gate built on sharpness alone would call the most damaged
   * frame it had ever seen the sharpest.
   */
  const sharpness =
    BASELINE.sharpness * Math.pow(1 - blur, 3) + 160 * squeeze * squeeze;

  /*
   * Which is why compression damage is measured separately — and this one
   * moves the *other* way under blur (1.21 untouched, 1.03 blurred), so the
   * two measures cannot double-count a single fault.
   */
  const blockiness =
    (BASELINE.blockiness + 2.6 * squeeze * squeeze) * (1 - 0.18 * blur);

  // Ordered by how badly each one misleads. Darkness first: it is the failure
  // that produced a false "wearing the right gear" one percentage point of
  // brightness away from a correct alert.
  let reason = null;
  let failed = null;

  if (brightness < FLOORS.brightness) {
    reason = "Too dark to check.";
    failed = "brightness";
  } else if (contrast < FLOORS.contrast) {
    reason = "Too flat to check — almost no detail in the picture.";
    failed = "contrast";
  } else if (sharpness < FLOORS.sharpness) {
    reason = "Too blurred to check.";
    failed = "sharpness";
  } else if (blockiness > FLOORS.blockiness) {
    reason = "Picture quality too low to check.";
    failed = "blockiness";
  }

  return {
    brightness,
    contrast,
    sharpness,
    blockiness,
    readable: reason === null,
    reason,
    failed,
    detectability: detectability(brightness, sharpness, blockiness),
  };
}

/**
 * How well the detector can be expected to do on a picture that passed.
 *
 * Passing the gate is not the same as being easy to read: a frame at half
 * daylight is judgeable and still costs the detector confidence on everybody
 * in it. This is the multiplier the detection model applies, and it is the
 * *worst* of the three rather than an average — a picture that is bright and
 * clean but hopelessly soft is a soft picture, and averaging would hide that.
 */
function detectability(brightness, sharpness, blockiness) {
  const lit = clamp01((brightness - 20) / 80);
  const detailed = clamp01((sharpness - 10) / 110);
  const clean = clamp01((2.6 - blockiness) / 1.0);
  return Math.min(lit, detailed, clean);
}

/**
 * What the reading means for the operator, in one line.
 *
 * Kept beside the measurement rather than in a component because the same
 * sentence belongs on the floor, in the trace and in the "Why?" panel, and
 * three copies of it would eventually disagree.
 */
export function verdictOf(reading) {
  if (reading.readable) return "The picture can be judged.";
  return reading.reason;
}

/** Which measure is nearest to failing, for a meter that shows the margin. */
export function margins(reading) {
  return [
    {
      id: "brightness",
      label: "Brightness",
      value: reading.brightness,
      floor: FLOORS.brightness,
      direction: "min",
      ok: reading.brightness >= FLOORS.brightness,
    },
    {
      id: "contrast",
      label: "Contrast",
      value: reading.contrast,
      floor: FLOORS.contrast,
      direction: "min",
      ok: reading.contrast >= FLOORS.contrast,
    },
    {
      id: "sharpness",
      label: "Detail",
      value: reading.sharpness,
      floor: FLOORS.sharpness,
      direction: "min",
      ok: reading.sharpness >= FLOORS.sharpness,
    },
    {
      id: "blockiness",
      label: "Compression damage",
      value: reading.blockiness,
      floor: FLOORS.blockiness,
      direction: "max",
      ok: reading.blockiness <= FLOORS.blockiness,
    },
  ];
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
