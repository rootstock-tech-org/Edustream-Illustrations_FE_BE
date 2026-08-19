import Link from "next/link";
import { CategoryView } from "../../lib/categories";
import { faviconFor, timeAgo } from "../../lib/display";
import type { Article } from "../../lib/pipeline";
import { NewsCard } from "./NewsCard";

export type SectionLayout = "grid" | "list" | "spotlight" | "headlines";

function Heading({ cat }: { cat: CategoryView }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <h2 className="flex items-center gap-2.5 text-lg font-bold tracking-tight text-slate-900">
        <span className="h-5 w-1.5 rounded-full" style={{ background: cat.accent }} />
        {cat.label}
      </h2>
      <Link href={`/topic/${cat.id}`} className="text-xs font-semibold text-slate-500 transition hover:text-indigo-600">
        See all →
      </Link>
    </div>
  );
}

// A magazine section. The layout varies per section so the feed isn't repetitive.
export function Section({
  cat,
  items,
  layout = "list",
}: {
  cat: CategoryView;
  items: Article[];
  layout?: SectionLayout;
}) {
  if (!items.length) return null;
  const [lead, ...rest] = items;

  return (
    <section className="border-t border-slate-200 py-7">
      <Heading cat={cat} />

      {layout === "grid" ? (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {items.slice(0, 3).map((it) => (
            <NewsCard key={it.link} item={it} accent={cat.accent} variant="default" />
          ))}
        </div>
      ) : null}

      {layout === "spotlight" ? (
        <div className="space-y-5">
          <NewsCard item={lead} accent={cat.accent} variant="featured" />
          <div className="grid gap-5 sm:grid-cols-3">
            {rest.slice(0, 3).map((it) => (
              <NewsCard key={it.link} item={it} accent={cat.accent} variant="default" />
            ))}
          </div>
        </div>
      ) : null}

      {layout === "list" ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <NewsCard item={lead} accent={cat.accent} variant="featured" />
          <div className="flex flex-col gap-1">
            {rest.slice(0, 4).map((it) => (
              <NewsCard key={it.link} item={it} accent={cat.accent} variant="compact" />
            ))}
          </div>
        </div>
      ) : null}

      {layout === "headlines" ? (
        <ol className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
          {items.slice(0, 6).map((it, i) => {
            const fav = faviconFor(it.link);
            return (
              <li key={it.link}>
                <a
                  href={it.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex gap-3 rounded-xl px-2 py-2.5 transition hover:bg-slate-100/70"
                >
                  <span className="mt-0.5 text-lg font-bold tabular-nums" style={{ color: cat.accent }}>
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-slate-800 group-hover:text-indigo-600">
                      {it.title}
                    </h3>
                    <div className="mt-1 flex items-center gap-x-2 text-[11px] text-slate-500">
                      {fav ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={fav} alt="" width={13} height={13} className="rounded-sm" />
                      ) : null}
                      <span className="font-semibold text-slate-700">{it.source}</span>
                      {it.publishedAt ? <span>· {timeAgo(it.publishedAt)}</span> : null}
                    </div>
                  </div>
                </a>
              </li>
            );
          })}
        </ol>
      ) : null}
    </section>
  );
}
