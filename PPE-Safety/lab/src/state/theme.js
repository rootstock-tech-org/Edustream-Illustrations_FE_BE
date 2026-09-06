/**
 * Light or dark — the viewer's own choice, remembered.
 *
 * Light is the default, and it is the dashboard's: the lab is a page of that
 * product, so it opens the same colour as every page beside it rather than
 * announcing itself as a different application. The floor inside it keeps
 * its own surface tokens either way — concrete is pale in a lit bay and
 * near-black on a night camera, and both are the same concrete — so the
 * picture stays a picture in both themes. Dark is a designed second theme a
 * viewer opts into from the header, never guessed from the OS.
 *
 * Storage is defensive: a private window, cleared site data or storage that
 * flatly refuses must still render the page, never throw before the first
 * paint.
 */

const KEY = "ai-safety-lab.theme.v1";

/** "light" or "dark" — the stored choice, or "light" when there isn't one. */
export function loadTheme() {
  try {
    return localStorage.getItem(KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

/** Remember a choice. Silent on failure — a lost preference is a smaller loss than a broken page. */
export function saveTheme(theme) {
  try {
    localStorage.setItem(KEY, theme === "light" ? "light" : "dark");
  } catch {
    // Storage is full or blocked. The choice still applies for this tab.
  }
}

/** The other one. */
export function flip(theme) {
  return theme === "light" ? "dark" : "light";
}
