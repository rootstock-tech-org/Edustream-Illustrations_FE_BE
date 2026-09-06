/**
 * The third state: *we could not look*.
 *
 * Every monitoring screen used to have two faces — something is wrong, or
 * everything is fine — and the debug report showed that four capabilities
 * fail by losing the person rather than by misjudging them. Dim the room one
 * percentage point and "1 without a helmet" becomes "Wearing the right gear".
 * Silence read as safety.
 *
 * The backend now says whether it could judge the picture at all
 * (PHASE2_CONTRACT §2): `readable`, `unreadable_reason`, `people_unverified`,
 * and `"unverified"` as a value of `status`. This module is the one place the
 * frontend reads them, so every page tells the same story in the same words.
 *
 * ## A missing field is not a false one
 *
 * An older backend sends none of these. That must not put every page
 * permanently into the third state, and it must not silently upgrade an
 * unmeasured screen into a confident all-clear either. So absence changes
 * nothing: `unreadable` is false only when the backend actually said so, and
 * every page keeps exactly the behaviour it has today when the fields are not
 * there. `readable: false` alone is enough — a backend that sets it without
 * moving `status` is still understood.
 *
 * ## `status: "unverified"` does not mean the picture was unreadable
 *
 * The shipped modules use that status for *either* fact: a picture nothing
 * could be judged from, and a readable picture with somebody in it who could
 * not be judged. Safety Gear returns `status: "unverified"` with
 * `readable: true` and `people_unverified: 1` on the reference photograph.
 * Those are different states and they are drawn differently — one hatches the
 * picture over, one does not — so `readable` decides, and the status is only
 * consulted when `readable` is absent.
 */

/** What the state is called, everywhere it appears. Never only a colour. */
export const UNVERIFIED_LABEL = "Cannot check";

/** Used when the backend says unreadable but gives no words for it. */
export const UNVERIFIED_FALLBACK = "The picture cannot be checked.";

/**
 * The sentence that has to be on the screen, because it is the whole point
 * of this phase: an unreadable picture is not an all-clear.
 */
export const NOT_AN_ALL_CLEAR =
  "This is not an all-clear — the AI cannot see well enough to judge, " +
  "so nothing on this page means the area is safe.";

/**
 * Read a module's result for legibility.
 *
 * @param {object|null} results whatever the module last reported
 * @returns {{unreadable: boolean, reason: string|null, unverified: number, stated: boolean}}
 *   `unreadable` — the picture could not be judged at all.
 *   `reason` — the operator's words for why, only when unreadable.
 *   `unverified` — people seen but not judged. Never folded into a compliant
 *   or a violating count.
 *   `stated` — whether the backend expressed an opinion at all. False against
 *   an older backend, which is why nothing keys off it except diagnostics.
 */
export function readLegibility(results) {
  const said =
    Boolean(results) &&
    (typeof results.readable === "boolean" ||
      results.status === "unverified" ||
      typeof results.unreadable_reason === "string" ||
      Number.isFinite(results.people_unverified));

  // `readable` is the authority. The status is a fallback for a backend that
  // has not landed the boolean yet — never an override for one that has.
  const unreadable =
    Boolean(results) &&
    (results.readable === false ||
      (results.readable !== true && results.status === "unverified"));

  const words =
    typeof results?.unreadable_reason === "string"
      ? results.unreadable_reason.trim()
      : "";

  const seen = Number(results?.people_unverified);

  return {
    unreadable,
    reason: unreadable ? words || UNVERIFIED_FALLBACK : null,
    unverified: Number.isFinite(seen) && seen > 0 ? Math.round(seen) : 0,
    stated: said,
  };
}

/**
 * The description under an unverified status card.
 *
 * @param {string} paused what has stopped being checked, as a sentence —
 *   "Helmets and vests are not being checked."
 */
export function unverifiedDescription(paused) {
  return `${paused} ${NOT_AN_ALL_CLEAR}`;
}

/**
 * Green is a claim. Only make it when the picture was judged *and* nobody was
 * left unjudged — a card that goes green while somebody could not be looked at
 * is the same lie in miniature.
 */
export function successTone(good, { unreadable, unverified }) {
  return good && !unreadable && !unverified ? "success" : "neutral";
}

/**
 * A count that was never actually measured is a dash, not a zero.
 *
 * Follows the dashboard's existing convention for "People in view", which
 * already shows "—" rather than 0 when nothing is counting. A zero from a
 * picture nobody could read is precisely the false all-clear this phase
 * exists to remove, so it never renders as a number.
 */
export function measuredCount(value, unreadable) {
  if (unreadable && !value) return "—";
  return value ?? 0;
}

/** "1 person" / "3 people" — wherever an unjudged headcount is written out. */
export function peopleCount(n) {
  return `${n} ${n === 1 ? "person" : "people"}`;
}

/**
 * Title for a picture that could be read, in which some people still could
 * not be judged. Not a violation, not an all-clear, and — the point — not
 * folded into either count.
 */
export function partlyUnverifiedTitle(n) {
  return `${peopleCount(n)} could not be checked`;
}

/**
 * What the alarm says when a camera stops being usable.
 *
 * Deliberately not the "Alert! … Needs attention." template: this is not a
 * violation and must not sound like one, but it must not be silent either —
 * silence is the bug.
 */
export function unverifiedSpeech(capability, reason) {
  const why = String(reason || UNVERIFIED_FALLBACK)
    .trim()
    .replace(/[.!\s]+$/, "");

  return `Cannot check ${capability}. ${why}.`;
}

/** And what it says when the picture comes back, so silence means the same thing again. */
export function resumedSpeech(capability) {
  return `${capability} can be checked again.`;
}
