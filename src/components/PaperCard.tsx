import type { Paper } from "../../lib/papers";

// A single research-paper card: title links to the arXiv abstract page, with a
// separate PDF button. Server component (just links, no interactivity).
export function PaperCard({ paper, accent }: { paper: Paper; accent: string }) {
  const authors =
    paper.authors.length === 0
      ? ""
      : paper.authors.slice(0, 3).join(", ") + (paper.authors.length > 3 ? " et al." : "");

  return (
    <div className="avsar-corners avsar-shadow flex h-full flex-col rounded-2xl border border-slate-200/70 bg-white p-4 transition hover:-translate-y-0.5 hover:shadow-lg">
      {paper.kind !== "top" || paper.year ? (
        <div className="mb-2 flex items-center gap-2">
          {paper.kind !== "top" ? (
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
              style={{ background: accent }}
            >
              Latest
            </span>
          ) : null}
          {paper.year ? <span className="text-[11px] font-medium text-slate-400">{paper.year}</span> : null}
        </div>
      ) : null}

      <a
        href={paper.url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[15px] font-semibold leading-snug text-[#041b4c] transition-colors hover:text-[#c2410c]"
      >
        {paper.title}
      </a>

      {authors ? <p className="mt-1.5 line-clamp-1 text-xs text-slate-500">{authors}</p> : null}

      <div className="mt-auto flex items-center justify-end pt-3">
        {paper.pdf ? (
          <a
            href={paper.pdf}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-200"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <path d="M7 10l5 5 5-5M12 15V3" />
            </svg>
            PDF
          </a>
        ) : null}
      </div>
    </div>
  );
}
