"use client";

// Bookmark toggle shown on a news card. Lives inside the card's <a>, so it stops
// the click from opening the article when you just want to save it.
import { useBookmarks, SavedArticle } from "../../lib/bookmarks";

type SaveItem = Omit<SavedArticle, "savedAt">;

export function SaveButton({ item, onDark = false }: { item: SaveItem; onDark?: boolean }) {
  const { isSaved, toggle } = useBookmarks();
  const saved = isSaved(item.link);

  const base = onDark
    ? "bg-black/25 text-white hover:bg-black/40"
    : "bg-white/80 text-slate-600 hover:bg-white hover:text-slate-900 ring-1 ring-slate-200";

  return (
    <button
      type="button"
      aria-label={saved ? "Remove from collection" : "Add to collection"}
      aria-pressed={saved}
      title={saved ? "In your collection" : "Add to collection"}
      onClick={(e) => {
        e.preventDefault(); // don't open the article
        e.stopPropagation();
        toggle(item);
      }}
      className={`grid h-8 w-8 place-items-center rounded-full backdrop-blur transition ${base} ${saved ? "!text-indigo-600" : ""}`}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill={saved ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
      </svg>
    </button>
  );
}
