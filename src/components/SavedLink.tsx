"use client";

// Header "Saved" link with a live count badge. Client component because the count
// comes from local storage (via the bookmarks hook).
import Link from "next/link";
import { useBookmarks } from "../../lib/bookmarks";

export function SavedLink() {
  const { count } = useBookmarks();
  return (
    <Link
      href="/saved"
      aria-label="My Collection"
      className="relative flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 text-sm font-medium text-[var(--text)] transition-colors hover:bg-[var(--hover)]"
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
      </svg>
      <span className="hidden sm:inline">Collection</span>
      {count > 0 ? (
        <span className="grid h-4 min-w-4 place-items-center rounded-full bg-indigo-600 px-1 text-[10px] font-bold text-white">
          {count}
        </span>
      ) : null}
    </Link>
  );
}
