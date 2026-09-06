/**
 * How drawn shapes follow what the server reports.
 *
 * Two problems, both about time. An answer arrives a few times a second, so
 * drawing it as it lands makes shapes jump over a person moving continuously.
 * And it describes the scene as it was when the frame was taken, which on a
 * distant server is most of a second ago — long enough for a walking person to
 * leave their own outline behind them.
 *
 * The first is solved by easing towards the latest position; the second by
 * carrying that position forward at the speed the subject was last seen
 * moving, by exactly the age of the answer.
 *
 * Kept apart from the drawing because it is the part with a right answer:
 * plain functions over plain numbers, with no canvas and no React, so the
 * behaviour that matters can be checked directly.
 *
 * Every coordinate is a fraction of the picture, so nothing here depends on a
 * resolution or a display size.
 */

//: How quickly a shape closes the gap to where it is aiming.
//:
//: Time based rather than per frame, so the motion looks the same on a display
//: running at 30Hz as at 120Hz. About 95% of the gap is closed in three times
//: this, so 60ms settles in under a fifth of a second — slow enough to smooth
//: the step, fast enough that the shape is not noticeably further behind the
//: person than the network already makes it.
export const EASING_MS = 60;

//: Below this, a shape is treated as having arrived and the loop can stop.
//: A fraction of the picture, so roughly a pixel on a 1000px-wide view.
export const SETTLED = 0.001;

//: How far a shape may have moved between answers and still be recognised as
//: the same one, as a fraction of the picture.
//:
//: Generous, because at four answers a second someone walking briskly covers
//: real ground between them. Too tight and a moving person is treated as a
//: new detection every answer, which is exactly the jumping this avoids.
export const MATCH_DISTANCE = 0.18;

//: Furthest ahead of the last answer a shape is drawn, in milliseconds.
//:
//: Capped so that a session whose answers stop — a dropped connection, a
//: stalled model — leaves the shapes where they were rather than sailing them
//: off the edge of the picture at the last known speed.
export const MAX_LEAD_MS = 600;

//: Ceiling on how far carrying-forward may move a shape, in multiples of the
//: shape's own width and height.
//:
//: Speed is estimated from two positions a few hundred milliseconds apart, so
//: one bad detection produces one wild estimate. This bounds what that can do
//: to the picture: a shape may be wrong by its own size, never by half the
//: screen.
export const MAX_LEAD_TRAVEL = 1.0;

//: How quickly the speed estimate follows a change, 0-1 per answer.
export const VELOCITY_SMOOTHING = 0.4;

//: Longest gap between answers that still says something about speed.
//:
//: Beyond this the subject may have left and come back, or the connection may
//: have stalled. Either way the distance covered says nothing about how fast
//: they are moving now, so the estimate starts again.
export const MAX_VELOCITY_GAP_MS = 1000;

/** Centre-to-centre distance between two boxes, in picture fractions. */
export function centreDistance(a, b) {
  const ax = (a[0] + a[2]) / 2;
  const ay = (a[1] + a[3]) / 2;
  const bx = (b[0] + b[2]) / 2;
  const by = (b[1] + b[3]) / 2;

  return Math.hypot(ax - bx, ay - by);
}

/**
 * Carry the eased positions and speeds across to the newest answer.
 *
 * Regions arrive as a bare list with nothing identifying them, and the order
 * is not stable — safety gear sorts by size, so two people swapping distance
 * from the camera swaps their places in the list. Matching by position
 * instead means a shape follows the person it belongs to rather than
 * whichever entry happens to land at the same index.
 */
export function retarget(tracks, regions, capturedAt) {
  const claimed = new Set();

  return regions.map((region) => {
    let best = -1;
    let bestDistance = MATCH_DISTANCE;

    tracks.forEach((track, index) => {
      if (claimed.has(index)) return;

      const distance = centreDistance(track.target.box, region.box);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    });

    if (best < 0) {
      // Nothing to carry over, so it appears where it is rather than sliding
      // in from wherever the nearest shape happened to be. No speed yet
      // either: one position says nothing about movement.
      return {
        box: [...region.box],
        target: region,
        targetAt: capturedAt,
        velocity: [0, 0, 0, 0],
      };
    }

    claimed.add(best);

    const previous = tracks[best];
    const gap = capturedAt - previous.targetAt;

    // Every corner separately, so someone walking towards the camera is
    // carried forward growing rather than sliding.
    const velocity =
      gap > 0 && gap < MAX_VELOCITY_GAP_MS
        ? previous.velocity.map((was, i) => {
            const measured =
              ((region.box[i] - previous.target.box[i]) * 1000) / gap;
            return was + (measured - was) * VELOCITY_SMOOTHING;
          })
        : [0, 0, 0, 0];

    // Keeps its eased position and starts moving towards the new one.
    return {
      box: previous.box,
      target: region,
      targetAt: capturedAt,
      velocity,
    };
  });
}

/**
 * Where the subject probably is now, rather than where the camera saw them.
 *
 * The gap between the two is the time the frame spent getting to the server
 * and the answer getting back.
 */
export function leadAhead(track, now) {
  const lead = Math.min(Math.max(now - track.targetAt, 0), MAX_LEAD_MS) / 1000;

  if (lead <= 0) return track.target.box;

  const box = track.target.box;
  const width = box[2] - box[0];
  const height = box[3] - box[1];
  const limits = [
    width * MAX_LEAD_TRAVEL,
    height * MAX_LEAD_TRAVEL,
    width * MAX_LEAD_TRAVEL,
    height * MAX_LEAD_TRAVEL,
  ];

  return box.map((edge, i) => {
    const moved = track.velocity[i] * lead;
    return edge + Math.max(-limits[i], Math.min(limits[i], moved));
  });
}

/**
 * Fraction of the remaining gap to close, given how long the frame took.
 *
 * Derived from elapsed time rather than counted in frames, so a slow frame
 * catches up instead of leaving the motion to run at whatever rate the
 * display manages.
 */
export function easingStep(elapsedMs) {
  return 1 - Math.exp(-elapsedMs / EASING_MS);
}

/**
 * Put a point from one box's frame of reference into another's.
 *
 * Outlines cannot be eased point by point — the model returns a different
 * number of points each time, so there is nothing to pair up. Instead the
 * shape from the latest answer is drawn inside the eased box, which moves it
 * with the person while keeping its exact form.
 */
export function reframe(point, from, to) {
  const fromWidth = from[2] - from[0];
  const fromHeight = from[3] - from[1];

  if (fromWidth <= 0 || fromHeight <= 0) return point;

  return [
    to[0] + ((point[0] - from[0]) / fromWidth) * (to[2] - to[0]),
    to[1] + ((point[1] - from[1]) / fromHeight) * (to[3] - to[1]),
  ];
}
