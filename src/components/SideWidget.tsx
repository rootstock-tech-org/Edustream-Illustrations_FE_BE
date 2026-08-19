import Link from "next/link";
import { CategoryView } from "../../lib/categories";
import type { Article } from "../../lib/pipeline";
import { NewsCard } from "./NewsCard";

// Right-rail widget: heading + "See all" + a few compact stories.
export function SideWidget({ cat, items }: { cat: CategoryView; items: Article[] }) {
  if (!items.length) return null;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-1 flex items-center justify-between px-1">
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <span className="h-3.5 w-1 rounded-full" style={{ background: cat.accent }} />
          {cat.label}
        </h3>
        <Link href={`/topic/${cat.id}`} className="text-[11px] font-semibold text-slate-500 transition hover:text-indigo-600">
          See all
        </Link>
      </div>
      <div className="divide-y divide-slate-100">
        {items.slice(0, 5).map((it) => (
          <NewsCard key={it.link} item={it} accent={cat.accent} variant="compact" />
        ))}
      </div>
    </div>
  );
}
