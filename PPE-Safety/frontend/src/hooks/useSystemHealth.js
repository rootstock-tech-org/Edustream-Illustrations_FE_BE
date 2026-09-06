import { createContext, useContext } from "react";

/**
 * Is the system reachable, and is a camera feeding it?
 *
 * Two facts every screen needs, measured in one place. The navbar states both
 * on every page; before this existed it simply asserted them — "System
 * working, Camera not" — and was right only by coincidence, including through
 * a total outage, two inches above a banner saying the AI system could not be
 * reached.
 *
 * Three states, not two. Until the first answer comes back nothing has been
 * measured, and "not measured yet" is not "working" — assuming the healthy one
 * is exactly the defect this replaces, so it is a state in its own right.
 *
 * The provider that fills this in lives in context/SystemHealth.jsx; this file
 * holds only the vocabulary and the way to read it.
 */

/** Not measured yet, or no longer measurable. Never shown as healthy. */
export const UNKNOWN = "unknown";
/** Measured, and working. */
export const WORKING = "working";
/** Measured, and not working. */
export const NOT_WORKING = "not-working";

/**
 * What a component sees when nothing is providing health.
 *
 * Unknown rather than healthy: anything rendered outside the provider must not
 * claim a state nobody has measured.
 */
const UNMEASURED = {
  checked: false,
  reachable: false,
  cameras: 0,
  system: UNKNOWN,
  camera: UNKNOWN,
  status: null,
};

export const SystemHealthContext = createContext(null);

/** The measured state of the system, wherever you are in the app. */
export function useSystemHealth() {
  return useContext(SystemHealthContext) ?? UNMEASURED;
}
