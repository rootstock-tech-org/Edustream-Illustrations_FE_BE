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
      aria-label="AVSAR by Rootstock Technology - VLSI news home"
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
          AVSAR
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
              placeholder="Search VLSI, CMOS, EUV…"
              className="w-full bg-transparent text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none"
            />
          </div>
        </form>

        <SavedLink />
      </div>
    </header>
  );
}
