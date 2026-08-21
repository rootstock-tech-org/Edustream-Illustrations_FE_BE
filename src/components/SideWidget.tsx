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
    <div className="avsar-corners avsar-shadow rounded-lg border border-slate-300 bg-white p-3">
      <div className="mb-1 flex items-center justify-between px-1">
        <h3 className="flex items-center gap-2 text-sm font-bold text-[#041b4c]">
          <span className="h-3.5 w-1 rounded-full" style={{ background: cat.accent }} />
          {cat.label}
        </h3>
        <Link href={`/topic/${cat.id}`} className="text-[11px] font-semibold text-slate-500 transition hover:text-[#c2410c]">
          See all
        </Link>
      </div>
      <div className="divide-y divide-slate-100">
        {items.slice(0, 5).map((it) => (
          <NewsCard key={it.link} item={it} accent={cat.accent} variant="compact" />
        ))}
      </div>

      <PaperMiniList papers={papers} limit={3} />
    </div>
  );
}
