/**
 * `?bench=<id>` — the one way in from outside this app.
 *
 * WHY IT DID NOT EXIST. Every bench in the Probe Station was local React state:
 * four booleans in `Explorer.tsx` for the full-screen sections and
 * `useDeviceStore.setDevice()` for the eight devices. All of it reachable by
 * clicking, none of it by linking. So AVSAR's tutor could say "go and look at
 * the CMOS inverter" and then only hand the learner the front door, on whatever
 * bench the app happened to open on. Per-device routing is the whole point of
 * bringing this app onto the AVSAR box, and this module is the piece that was
 * missing.
 *
 * ALLOW-LISTED, NOT PARSED. The id is checked against the device registry and
 * the section list before anything is opened. An unknown id opens the default
 * bench rather than erroring: a stale link in an old chat message should land
 * the learner somewhere sensible, not on a crash.
 *
 * THE PARAM IS AN INSTRUCTION, NOT STATE. It is consumed once on mount and
 * removed from the URL with `replaceState`, which is the same rule
 * `Workspace.tsx` applies to `?material=` in the AVSAR SPA. Left in place, a
 * reload would drag the learner back to the bench they had navigated away from.
 *
 * IDS ARE SHARED WITH THE BACKEND. `app/services/tool_catalogue.py` mints
 * `[[probe:<id>]]` from the same strings; `deepLink.test.ts` pins this list
 * against that one, because two hand-maintained copies of one vocabulary is two
 * chances to drift and the failure is silent — a chip that opens the default
 * bench looks like it worked.
 */
import { listAllDevices } from '@/domain/devices/registry';

/** The full-screen sections, by the id used in a link. Not devices: each one
 *  replaces the whole bench rather than changing what sits on it. */
export const SECTION_IDS = ['fabrication', 'sequential', 'combinational', 'logic-gates'] as const;

export type SectionId = (typeof SECTION_IDS)[number];

export type Bench =
  | { kind: 'section'; id: SectionId }
  | { kind: 'device'; id: string };

/** Every id a link may name, sections first. Exported for the drift test. */
export function benchIds(): string[] {
  return [...SECTION_IDS, ...listAllDevices().map((d) => d.id)];
}

/**
 * The bench a query string asks for, or null.
 *
 * Takes the search string rather than reading `location` so it is a pure
 * function: testable without a DOM, and safe to call during SSR.
 */
export function benchFromSearch(search: string): Bench | null {
  let id: string | null = null;
  try {
    id = new URLSearchParams(search).get('bench');
  } catch {
    return null;
  }
  if (!id) return null;
  const wanted = id.trim().toLowerCase();
  if ((SECTION_IDS as readonly string[]).includes(wanted)) {
    return { kind: 'section', id: wanted as SectionId };
  }
  if (listAllDevices().some((d) => d.id === wanted)) {
    return { kind: 'device', id: wanted };
  }
  return null;
}

/** Drop `bench` from the address bar without adding a history entry. */
export function clearBenchParam(): void {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('bench')) return;
    url.searchParams.delete('bench');
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  } catch {
    /* A browser that refuses replaceState is not a reason to fail the mount. */
  }
}
