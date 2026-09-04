import Link from "next/link";
import { SavedLink } from "./SavedLink";

/**
 * The AVSAR brand block, matching the platform's rail header
 * (avsar_frontend/src/components/nav/SidebarNav.tsx): the Rootstock
 * circuit-tree mark, the wordmark, and a mono "powered by" sub-line.
 *
 * Two lines by design over there and here: "Powered by Rootstock Technology"
 * measures wider than the slot in this mono face at any tracking we'd want, so
 * it is allowed to break after "Rootstock" rather than being squeezed.
 */
function BrandBlock() {
  return (
    <Link
      href="/"
      aria-label="Collab Robotics by Rootstock Technology - robotics news home"
      className="flex min-w-0 items-center gap-2.5"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center p-0.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/rootstock-mark.png"
          alt="Rootstock"
          draggable={false}
          className="h-full w-full object-contain"
        />
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-base font-bold tracking-tight text-[var(--text)]">
          Collab Robotics
        </span>
        <span className="inst-label block leading-[1.2] tracking-[0.08em] text-[8px]">
          Powered by Rootstock Technology
        </span>
      </span>
    </Link>
  );
}

// Top bar: brand + search + saved. No module tabs (module names are not
// finalised), so there's no click-into-a-module navigation.
export function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--header)] backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-2.5">
        <BrandBlock />

        <form action="/search" className="ml-auto w-full max-w-xs">
          <div className="inst-panel flex items-center gap-2 px-3 py-1.5 focus-within:border-[var(--signal)]">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="text-[var(--muted)]">
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              name="q"
              suppressHydrationWarning
              placeholder="Search cobots, humanoids, SLAM…"
              className="w-full bg-transparent text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none"
            />
          </div>
        </form>

        <Link
          href="/explore"
          aria-label="Explore any topic"
          className="relative flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 text-sm font-medium text-[var(--text)] transition-colors hover:bg-[var(--hover)]"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
          </svg>
          <span className="hidden sm:inline">Explore</span>
        </Link>
        <SavedLink />
      </div>
    </header>
  );
}
