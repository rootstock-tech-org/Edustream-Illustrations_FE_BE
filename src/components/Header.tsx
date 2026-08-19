import Link from "next/link";

// Minimal top bar: brand + search only. No module tabs (module names are not
// finalised), so there's no click-into-a-module navigation.
export function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--header)] backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
        <Link href="/" className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/rootstock-logo.jpeg" alt="Rootstock Technology" className="h-10 w-auto object-contain" />
          <span className="text-base font-bold tracking-tight text-[var(--text)]">AVSAR</span>
        </Link>

        <form action="/search" className="ml-auto w-full max-w-xs">
          <div className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5">
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
      </div>
    </header>
  );
}
