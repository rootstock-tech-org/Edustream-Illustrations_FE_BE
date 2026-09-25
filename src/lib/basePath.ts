/**
 * Where this app is mounted, in one place.
 *
 * The Probe Station used to be its own Vercel deployment on its own origin, so
 * every root-relative path it wrote was correct by construction. Served under
 * `/probe` on the AVSAR origin that stops being true, and the failures are
 * quiet rather than loud: AVSAR's SPA answers `200 index.html` for any unknown
 * path, so an escaped URL returns a page instead of a 404 and the browser only
 * complains about the content type.
 *
 * Next rewrites `basePath` into `next/link` hrefs, router navigations,
 * `next/image` sources and its own emitted assets. It does NOT rewrite
 * `fetch()` URLs, raw `<img src>`, `<form action>` or any string a component
 * builds by hand. Those go through `withBase()`.
 */
export const BASE_PATH = '/probe';

/** Prefix a root-relative path with the base path. Absolute URLs and fragments
 *  pass through untouched, so it is safe on a value that may already be
 *  external. */
export function withBase(p: string): string {
  return p.startsWith('/') && !p.startsWith('//') ? `${BASE_PATH}${p}` : p;
}

/**
 * A `localStorage` key, namespaced to this app.
 *
 * MEASURED COLLISION, not a precaution. This app stored the user's theme under
 * the bare key `theme`; so does AVSAR (`avsar_frontend/src/hooks/useTheme.ts`,
 * `STORAGE_KEY = "theme"`). On separate origins those were separate stores. On
 * one origin they are the same string in the same store, so toggling the Probe
 * Station to dark silently re-themed the whole of AVSAR — and back again on the
 * next AVSAR load, because both sides believe they own the key.
 */
export function storageKey(name: string): string {
  return `probe:${name}`;
}
