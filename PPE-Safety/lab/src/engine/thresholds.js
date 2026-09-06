/**
 * The numbers the system decides by.
 *
 * Every figure here is the real product's, copied from the module that uses
 * it, with the reason it has that value rather than another. That is the
 * point of the lab: a learner who changes one of these in the Experiment Lab
 * is changing the same number a real deployment is tuned with, and the
 * consequence they watch is the consequence a real operator gets.
 *
 * They are gathered in one file rather than scattered through the engine so
 * that the set of things a person is allowed to turn is visible and finite.
 * A tuneable number is a decision somebody made; hiding it inside the code
 * that uses it makes it look like a law of nature.
 */

/* ------------------------------------------------------------------ */
/* Confidence                                                          */
/* ------------------------------------------------------------------ */

/**
 * The score a *person* must reach to be reported at all.
 *
 * Deliberately low, and the reason is the most important idea in this file:
 * the two mistakes are not comparable. A noisy box that turns out to be a
 * coat rack costs an "unverified" on a screen. A person the system did not
 * see costs a human being.
 *
 * In the real product this bar is 0.20, and it was raised to that from a flat
 * 0.35 applied to everything after a measured failure: on the reference
 * photograph the bare-headed man in the left third scores 0.248, so at 0.35
 * he did not exist — and the system reported "Wearing the right gear" about
 * the one worker it could see.
 */
export const PERSON_SEEN = 0.2;

/**
 * The score above which the system is willing to *judge* a person, rather
 * than merely admit somebody is there.
 *
 * Between `PERSON_SEEN` and this, a person is reported as unverified and is
 * never accused of anything. That band is not a gap in the system, it is the
 * system being honest about somebody it is only half sure it can see.
 */
export const PERSON_SURE = 0.35;

/**
 * The score at which a piece of protective equipment is believed worn.
 *
 * Higher than the person bar, and the asymmetry is deliberate. A weakly
 * believed *person* raises a question, which gets a second look. A weakly
 * believed *vest* grants a green tick — and a green tick on an unprotected
 * worker is the failure this whole product exists to prevent. In the real
 * product a grey sweatshirt read as a vest once marked a man with no vest
 * compliant.
 *
 * It costs nothing on real gear: measured on the test footage, helmets score
 * 0.88 and vests 0.76.
 */
export const ITEM_GRANT = 0.55;

/**
 * The score a piece of gear *already believed worn* keeps being believed at.
 *
 * This bar can only ever keep a green tick that stronger evidence already
 * granted; it can never grant one. Without it, a vest at 0.54 on a man who
 * had plainly been wearing one for ten seconds simply stopped existing, and
 * he was accused of not wearing it.
 */
export const ITEM_KEEP = 0.4;

/* ------------------------------------------------------------------ */
/* Confirmation                                                        */
/* ------------------------------------------------------------------ */

/**
 * How many agreeing sightings an *accusation* needs before it is reported.
 *
 * Missing gear is inferred from the model not finding any — so every
 * momentary miss reads as a breach, and a helmet whose score wanders across
 * the bar accuses the same person on and off. Measured on the real model, a
 * helmet in a dim scene scores 0.56 where the bar is 0.55: not wrong, just
 * undecided, and reported as guilt.
 */
export const ACCUSE_MIN_VOTES = 3;

/**
 * How far the sightings must favour "missing" before it is reported.
 *
 * A bare majority is not enough to accuse somebody. Two to one is.
 */
export const ACCUSE_MAJORITY = 2.0;

/**
 * How recent a sighting has to be to still count, in seconds.
 *
 * Read together with the vote count this is not a window at all, it is a
 * minimum frame rate: three votes in 1.5s cannot happen below two answers a
 * second, however long the operator watches. That coupling is why the frame
 * rate matters, and why the real product widens this window when frames
 * arrive slowly instead of never answering.
 */
export const STEADY_WINDOW_SECONDS = 1.5;

/**
 * Compliance needs no waiting. Only the accusation does.
 *
 * Stated as a constant so it cannot be quietly changed: a worker who is
 * plainly wearing everything is cleared on the first frame that shows it,
 * because delaying good news costs nothing and delaying an alarm costs time
 * a supervisor could have used.
 */
export const CLEAR_NEEDS_VOTES = 1;

/* ------------------------------------------------------------------ */
/* Areas                                                               */
/* ------------------------------------------------------------------ */

/**
 * How much of a thing has to be inside a marked area to count as in it.
 *
 * The real product measures the share of the detection box that overlaps the
 * area, because a box around a forklift contains a good deal of floor and a
 * vehicle merely clipping the edge of frame is not one encroaching.
 *
 * The lab judges a single point — where the thing meets the floor — instead,
 * and that difference is worth knowing rather than hiding: the point rule is
 * the one an operator can predict by eye, and it agrees with the share rule
 * everywhere except right on the boundary.
 */
export const INSIDE_SHARE = 0.25;

/* ------------------------------------------------------------------ */
/* What the picture must be for any of this to mean anything           */
/* ------------------------------------------------------------------ */

/**
 * The levels below which people start being lost rather than misjudged.
 *
 * These are the real product's general floors, which are the strictest set it
 * has — an unnamed caller is never told a picture is fine that a named one
 * would refuse. Each was measured by degrading real frames until the person
 * detector started losing people, and set just above the loss rather than at
 * it: the point is to speak before the detector goes quiet, not at the same
 * moment.
 */
export const FLOORS = {
  /** Mean brightness, 0-255. The site frame lost its third worker between
   *  62.4 and 43.4. */
  brightness: 45.0,
  /** Standard deviation of brightness. Below this the picture is too flat to
   *  read; contrast was 20.4 at the first loss. */
  contrast: 21.0,
  /** Detail, as the variance of a contrast-normalised Laplacian. Blur k=9
   *  (26.7) still found everybody; k=11 (19.0) did not. */
  sharpness: 22.0,
  /** Edge energy on the JPEG grid against edge energy off it — a maximum,
   *  not a minimum. 1.21 untouched, 1.90 where people started being lost. */
  blockiness: 1.8,
};

/* ------------------------------------------------------------------ */
/* Events                                                              */
/* ------------------------------------------------------------------ */

/**
 * How long a problem must be absent before its event is treated as over.
 *
 * The real product's figure, and the same idea as the confirmation window
 * one layer up: detection is not perfect frame to frame — a worker turns and
 * their vest is briefly not seen — and closing an event the instant a
 * detection is missed would split one situation into a dozen. That is exactly
 * the noise that makes an operator stop reading the list.
 */
export const RESOLVE_AFTER_SECONDS = 5.0;

/**
 * How serious each kind of problem is judged, weakest first.
 *
 * Copied from the real modules rather than invented, including the one that
 * looks like it should be higher: a lifting area violation stays "medium"
 * rather than "high" on purpose. The real module can only detect that
 * somebody is standing in the marked area — not that a load is actually
 * suspended above them, which needs machinery it cannot yet see. "High" is
 * reserved for the day that verdict can be reached honestly, so a site that
 * has tuned its response to this alarm is never re-pointed by a change it
 * never saw.
 */
export const SEVERITY = {
  ppe: "medium",
  restricted: "high",
  vehicle: "high",
  walkway: "medium",
  lifting: "medium",
};

/** Weakest first — an open event may rise through this list, never fall. */
export const SEVERITIES = ["low", "medium", "high"];

/* ------------------------------------------------------------------ */
/* Doors and workstations                                              */
/* ------------------------------------------------------------------ */

/**
 * How long a door may stay open before it is reported, in seconds.
 *
 * The real module's default — configurable there because a loading bay and
 * a fire door do not deserve the same allowance, and kept here as the
 * starting figure for the same reason.
 */
export const DOOR_OPEN_SECONDS = 3.0;

/**
 * How long a workstation may be empty before it is reported, in seconds.
 *
 * The real module's default. Somebody reaching for a tool or turning to a
 * colleague has not abandoned their post, and a system that says so is one
 * an operator learns to ignore.
 */
export const STATION_EMPTY_SECONDS = 10.0;

/**
 * How long a workstation goes on counting as occupied after the last frame
 * somebody was actually seen there, in seconds.
 *
 * The real module's measured figure — on 375 frames of an ordinary desk with
 * somebody seated at it the whole time, judging presence frame by frame with
 * no grace at all said "empty" on 29% of them, for gaps up to 3.53 seconds
 * that were never the person actually leaving. This does not remove the
 * empty-desk alert; it delays when the allowance starts counting, so the
 * real time from somebody walking away to the alert is this plus
 * STATION_EMPTY_SECONDS.
 */
export const STATION_PRESENCE_GRACE_SECONDS = 4.0;

/**
 * Multiples of a duration allowance at which its severity escalates.
 *
 * The real modules' exact figures, shared between doors and workstations —
 * both compute severity the same way, just against a different allowance and
 * a different starting clock. `1.0` marks where a violation exists at all
 * (handled by the caller, since below it there is no finding to escalate)
 * and is never read directly; `4.0` and `10.0` are.
 */
export const DURATION_ESCALATE_AT = [1.0, 4.0, 10.0];

/**
 * How close a worker must stand to a workstation to count as being at it, as
 * a fraction of the floor.
 *
 * The lab's own figure, not the real product's — the real module tests
 * whether a detection *box* overlaps a marked region two different ways
 * (feet-point and scale-guarded body-centre), and this world has no boxes,
 * only a position, so a proximity radius is the natural point-world reading
 * of the same question. Sized to comfortably hold someone standing at the
 * bench in the starting scene without reaching the next station over.
 */
export const STATION_RADIUS = 0.06;
