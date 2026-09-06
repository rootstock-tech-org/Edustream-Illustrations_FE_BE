import { useSyncExternalStore } from "react";

/**
 * Is the viewport narrow enough that the sidebar has to be a drawer?
 *
 * The breakpoint itself is CSS's job — the sidebar leaves the flow, the menu
 * button appears, and the page takes the whole width without any of it asking
 * JavaScript. This hook exists for the two things CSS cannot express: which
 * control the sidebar's header button *is* (a collapse chevron on a desk, a
 * close X in a drawer), and whether Escape and focus belong to it at all.
 *
 * `useSyncExternalStore` rather than an effect and a piece of state: a media
 * query is exactly the external store it is for, and reading it during render
 * means the first paint is already right rather than correcting itself.
 */

/** Tailwind's own `md`, kept in step with the `max-md:` classes on the aside. */
export const DRAWER_QUERY = "(max-width: 767px)";

const query = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(DRAWER_QUERY)
    : null;

function subscribe(onChange) {
  const media = query();
  if (!media) return () => {};

  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function getSnapshot() {
  return Boolean(query()?.matches);
}

export function useDrawerWidth() {
  // A browser without matchMedia keeps the sidebar exactly as it is today,
  // which is the safe direction to fail in: a column that is too wide is
  // still a column the operator can use.
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
