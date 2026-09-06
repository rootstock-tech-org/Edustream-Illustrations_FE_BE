/**
 * Light or dark — the operator's own choice, remembered.
 *
 * Light is the default and stays the default. A control room is often a
 * bright room, the product was designed navy-on-white, and a plant that has
 * standardised on one look should not have it change under them because a
 * laptop was set to dark at some point. So the OS preference is deliberately
 * not consulted: the only thing that turns this dashboard dark is somebody
 * asking it to, from the header.
 *
 * Storage is defensive throughout. A kiosk browser with site data disabled,
 * a private window, a locked-down operator profile — any of them can make
 * `localStorage` throw on the very first read, and a dashboard that will not
 * paint because it could not remember a colour is a worse failure than a
 * forgotten preference.
 */

const KEY = "vikas.dashboard.theme.v1";

export const THEMES = ["light", "dark"];

/** "light" or "dark" — the stored choice, or "light" when there isn't one. */
export function loadTheme() {
  try {
    return localStorage.getItem(KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

/** Remember a choice. Silent on failure — a lost preference beats a broken page. */
export function saveTheme(theme) {
  try {
    localStorage.setItem(KEY, theme === "dark" ? "dark" : "light");
  } catch {
    /* Nothing to do, and nothing worth interrupting the operator over. */
  }
}

/** The other one. */
export function flipTheme(theme) {
  return theme === "dark" ? "light" : "dark";
}

/**
 * Put a theme on the document.
 *
 * Light is the absence of the attribute rather than `data-theme="light"`, so
 * the default costs nothing to express and the dark rules are the only ones
 * that need a selector to match.
 */
export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === "dark") root.dataset.theme = "dark";
  else delete root.dataset.theme;
}
