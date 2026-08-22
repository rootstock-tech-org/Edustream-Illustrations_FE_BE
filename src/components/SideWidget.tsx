import Link from "next/link";
import { CategoryView } from "../../lib/categories";
import type { Article } from "../../lib/pipeline";
import type { Paper } from "../../lib/papers";
import { NewsCard } from "./NewsCard";
import { PaperMiniList } from "./PaperMiniList";

// Right-rail widget: heading + "See all" + a few compact stories. Optionally
// blends in a couple of research papers below the news, each clearly tagged so
// a paper isn't mistaken for a news story.
export function SideWidget({
  cat,
  items,
  papers = [],
}: {
  cat: CategoryView;
  items: Article[];
  papers?: Paper[];
}) {
  if (!items.length && papers.length === 0) return null;
  return (
    <div className="inst-panel inst-corners p-3">
      <div className="mb-2 flex items-center justify-between gap-3 px-1">
        <h3 className="inst-eyebrow font-semibold text-[var(--text)]">
          {cat.label}
        </h3>
        <Link href={`/topic/${cat.id}`} className="inst-label shrink-0 transition-colors hover:text-[var(--accent)]">
          See all
        </Link>
      </div>
      <div className="divide-y divide-[var(--border)]">
        {items.slice(0, 5).map((it) => (
          <NewsCard key={it.link} item={it} accent={cat.accent} variant="compact" />
        ))}
      </div>

      <PaperMiniList papers={papers} limit={3} />
    </div>
  );
}
