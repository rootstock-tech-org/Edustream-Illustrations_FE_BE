/**
 * How big a picture to send the AI.
 *
 * Every analysed frame is a JPEG pushed up the operator's *upload* link,
 * which on a home or plant connection is the narrow one. The rate the AI
 * can answer at is that link divided by the size of a picture, so on a slow
 * connection the size of the picture — not the speed of the model — is what
 * sets the frame rate. A 640px frame of a busy scene measured ~30 KB, which
 * on a 1 Mbit upload is three answers a second however fast the GPU is.
 *
 * The decision is kept here, apart from the capture loop, because it is the
 * one part worth testing on its own: the interesting cases are combinations
 * of link and machine that are tedious to stage in a browser and trivial to
 * state as numbers.
 */

//: Picture sizes the capture may use, biggest first.
//:
//: The ladder stops where the *verdicts* start changing, which is a stricter
//: line than where the pictures start looking worse. Run over this project's
//: own site footage, the safety numbers an operator acts on held steady down
//: to 512px/0.5 — the same missing helmets, the same missing vests, the same
//: people checked, and a registered face still matched at 0.91 against a bar
//: of 0.50. One step further down they did not: at 448px and 384px the gear
//: model reported fewer missing vests and the mask model checked fewer
//: people, which is a violation quietly going unreported rather than a
//: slightly softer picture.
//:
//: So 512px is the floor, and the frame rate below it is not for sale.
//:
//: `cost` is the measured size of a frame at that step relative to 512px,
//: used to work out whether the link could carry the next step up before
//: trying it.
export const SIZE_STEPS = [
  { width: 640, quality: 0.6, cost: 1.57 },
  { width: 576, quality: 0.55, cost: 1.25 },
  { width: 512, quality: 0.5, cost: 1.0 },
];

//: Where capture starts: the largest size measured to cost nothing in what
//: the models find. A fast link climbs above it within seconds.
export const DEFAULT_STEP = 2;

//: The answer rate worth protecting, in frames a second.
//:
//: Not the ceiling — the floor. Verdicts are settled over 1.5 seconds, so
//: five answers a second is several votes per verdict and an alert within a
//: fifth of a second of the event. Chasing the 10fps ceiling instead would
//: shrink the picture until the models started missing people, buying frame
//: rate with the very accuracy the frames are for.
export const RATE_FLOOR = 5;

//: How often the picture size may change, in ms. Long enough that a single
//: slow second does not resize the world.
export const ADAPT_EVERY_MS = 2000;

//: How far the link must outweigh the model before the picture is shrunk.
//:
//: Not simply "network costs more than analysis". Frames are pipelined, so
//: an answer's round trip includes waiting behind the frames ahead of it —
//: which means that on a *fast* link with a busy server the two costs come
//: out roughly equal, and a bare comparison flips on noise. The picture
//: would then shrink for a bottleneck that is not the link, giving up
//: accuracy and gaining nothing. Shrinking is for when the link is clearly
//: the problem; when the model is, only a faster machine helps.
export const NETWORK_DOMINANCE = 1.5;

//: How long after shrinking before growing is considered again, in ms.
//:
//: Without it the two rules can take turns — grow because there is room,
//: shrink because the bigger picture used it — and the operator watches the
//: picture breathe. A link that has just proved too slow is given a while
//: to prove otherwise.
export const SETTLE_AFTER_SHRINK_MS = 10000;

/**
 * The step capture should use next.
 *
 * Two rules, in this order:
 *
 *   shrink  when answers have fallen below the rate worth protecting *and*
 *           the link is clearly what is costing the time.
 *   grow    when the link could carry the next size up at that same rate.
 *           Quality is taken back as soon as it can be afforded.
 *
 * @param {object} state
 * @param {number} state.step current index into SIZE_STEPS
 * @param {number} state.fps answers a second, measured
 * @param {number} state.analysisMs what the server reported for itself
 * @param {number} state.networkMs the rest of the round trip
 * @param {number} state.bytes size of a sent frame, smoothed
 * @param {number} state.sinceShrinkMs since the last shrink
 * @returns {number} the step to use — the same one when nothing should change
 */
export function nextStep({
  step,
  fps,
  analysisMs,
  networkMs,
  bytes,
  sinceShrinkMs,
}) {
  if (!bytes || !fps) return step;

  if (fps < RATE_FLOOR && networkMs > analysisMs * NETWORK_DOMINANCE) {
    return Math.min(SIZE_STEPS.length - 1, step + 1);
  }

  if (step > 0 && sinceShrinkMs > SETTLE_AFTER_SHRINK_MS) {
    // Whether the link could carry the next size up. Which question to ask
    // depends on what is currently costing the time.
    //
    // When the model is the slower part, the link is by definition not full
    // and the answer is yes — measured throughput would say no only because
    // nothing is asking much of the link, which is the trap that leaves a
    // fast connection stuck at the small picture. When the link is the
    // slower part, throughput is a real measurement of it, and the next size
    // must fit inside what it has already been shown to carry.
    const wouldCost = (bytes * SIZE_STEPS[step - 1].cost) / SIZE_STEPS[step].cost;

    const linkHasRoom =
      analysisMs >= networkMs ||
      // A tenth in hand, so a step up does not immediately undo itself.
      bytes * fps >= wouldCost * RATE_FLOOR * 1.1;

    if (linkHasRoom) return step - 1;
  }

  return step;
}

export default nextStep;
