"use client";

// Client list for the /saved page: reads bookmarks from local storage and lets
// the reader open or remove each one. Gated on `mounted` so we don't flash the
// empty state (or mismatch) before local storage is read on the client.
import { useEffect, useState } from "react";
import { useBookmarks } from "../../lib/bookmarks";
import { ThumbImg } from "./ThumbImg";
import { faviconFor, timeAgo } from "../../lib/display";
import { viewFor } from "../../lib/categories";

export function SavedList() {
  const { saved, remove } = useBookmarks();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  if (saved.length === 0) {
    return (
      <div className="border border-dashed border-[var(--border-strong)] bg-[var(--panel)] p-12 text-center">
        <p className="text-sm font-semibold text-[var(--text-secondary)]">Your collection is empty</p>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Tap the bookmark on any story to add it to your collection.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {saved.map((s) => {
        const accent = viewFor(s.moduleId)?.accent ?? "#4f46e5";
        return (
          <div
            key={s.link}
            className="inst-panel inst-corners inst-interactive group flex flex-col overflow-hidden"
          >
            <a href={s.link} target="_blank" rel="noopener noreferrer" className="block">
              <div className="relative aspect-[16/10] w-full overflow-hidden" style={{ background: "var(--panel)" }}>
                <ThumbImg link={s.link} image={s.image} accent={accent} title={s.title} />
              </div>
            </a>
            <button
              type="button"
              aria-label="Remove from collection"
              title="Remove"
              onClick={() => remove(s.link)}
              className="absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-full bg-[var(--panel)]/85 text-[var(--text-secondary)] ring-1 ring-[var(--border-strong)] backdrop-blur transition hover:bg-[var(--panel)] hover:text-[var(--accent)]"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
            <div className="flex flex-1 flex-col gap-2 p-4">
              <div className="flex items-center gap-1.5 text-[11px] text-[var(--muted)]">
                {faviconFor(s.link) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={faviconFor(s.link)} alt="" width={14} height={14} className="rounded-sm" />
                ) : null}
                <span className="font-semibold text-[var(--text-secondary)]">{s.source}</span>
                {s.publishedAt ? <span className="opacity-80">· {timeAgo(s.publishedAt)}</span> : null}
              </div>
              <a href={s.link} target="_blank" rel="noopener noreferrer">
                <h3 className="line-clamp-3 text-[15px] font-semibold leading-snug text-[var(--text)] transition-colors hover:text-[var(--accent)]">
                  {s.title}
                </h3>
              </a>
              {s.module ? <span className="mt-auto pt-1 text-[11px] font-medium text-[var(--muted)]">{s.module}</span> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
