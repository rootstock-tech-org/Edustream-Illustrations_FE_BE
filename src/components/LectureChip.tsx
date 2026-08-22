"use client";

// Small "Related lesson" pill on a news card. Links the article's module to the
// matching AVSAR course lessons. Lives inside the card's <a>, so it stops the
// click from opening the article and opens the lesson in a new tab instead.
import { lectureForModule } from "../../data/lectures";

export function LectureChip({ moduleId, onDark = false }: { moduleId?: string; onDark?: boolean }) {
  const lesson = lectureForModule(moduleId);
  if (!lesson) return null;

  const base = onDark
    ? "bg-[var(--panel)]/15 text-white hover:bg-[var(--panel)]/25 ring-1 ring-white/20"
    : "bg-[var(--surface)] text-[var(--indigo)] hover:bg-[var(--hover)] ring-1 ring-[var(--border-strong)]";

  return (
    <button
      type="button"
      title={`Open in AVSAR: ${lesson.avsarModuleName}`}
      aria-label={`Learn this concept in AVSAR: ${lesson.avsarModuleName}`}
      onClick={(e) => {
        e.preventDefault(); // don't open the article
        e.stopPropagation();
        window.open(lesson.url, "_blank", "noopener,noreferrer");
      }}
      className={`inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${base}`}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </svg>
      <span className="truncate">Learn this concept</span>
    </button>
  );
}
