import Link from "next/link";
import type { Paper } from "../../lib/papers";

// Compact "Research papers" list blended under a module's news (sidebar widgets
// and center sections). Each row links to arXiv and is labelled "Related paper".
export function PaperMiniList({
  papers,
  limit = 3,
  twoCol = false,
}: {
  papers: Paper[];
  limit?: number;
  twoCol?: boolean;
}) {
  if (!papers.length) return null;
  return (
    <div className="mt-3 border-t border-[var(--border)] pt-3">
      <div className="mb-1.5 flex items-center justify-between px-1">
        <h4 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          </svg>
          Research papers
        </h4>
        <Link href="/papers" className="inst-label transition-colors hover:text-[var(--accent)]">
          See all
        </Link>
      </div>
      <ul className={twoCol ? "grid gap-x-6 gap-y-1 sm:grid-cols-2" : "space-y-1"}>
        {papers.slice(0, limit).map((p) => (
          <li key={p.id}>
            <a
              href={p.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group block px-1 py-1.5 transition-colors hover:bg-[var(--hover)]"
            >
              <div className="flex items-start gap-1.5">
                <span className="line-clamp-2 text-[12px] font-semibold leading-snug text-[var(--text)] group-hover:text-[var(--accent)]">
                  {p.title}
                </span>
              </div>
              <div className="mt-0.5 text-[10px] text-[var(--muted)]">
                Related paper{p.year ? ` · ${p.year}` : ""}
              </div>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
