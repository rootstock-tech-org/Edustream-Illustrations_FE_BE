import Link from "next/link";
import { CategoryView } from "../../lib/categories";
import { faviconFor, timeAgo } from "../../lib/display";
import type { Article } from "../../lib/pipeline";
import type { Paper } from "../../lib/papers";
import { NewsCard } from "./NewsCard";
import { PaperCard } from "./PaperCard";
import { SaveButton } from "./SaveButton";

export type SectionLayout = "grid" | "list" | "spotlight" | "headlines";

/**
 * The section identity, in the platform's telemetry idiom: an uppercase mono
 * eyebrow with a leading registration dash, tinted to the category accent.
 * Ported from avsar_frontend/src/components/brand/instrument.tsx <Eyebrow>.
 */
function Heading({ cat }: { cat: CategoryView }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-4">
      <h2 className="inst-eyebrow font-semibold text-[var(--text)]">
        {cat.label}
      </h2>
      <Link
        href={`/topic/${cat.id}`}
        className="inst-label shrink-0 transition-colors hover:text-[var(--accent)]"
      >
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
  papers = [],
}: {
  cat: CategoryView;
  items: Article[];
  layout?: SectionLayout;
  papers?: Paper[];
}) {
  if (!items.length) return null;
  const [lead, ...rest] = items;

  return (
    <section className="border-t border-[var(--border)] py-7">
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
                  className="group flex gap-3 px-2 py-2.5 transition-colors hover:bg-[var(--hover)]"
                >
                  <span className="mt-0.5 font-mono text-base font-bold tabular-nums" style={{ color: cat.accent }}>
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-[var(--text)] group-hover:text-[var(--accent)]">
                      {it.title}
                    </h3>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[var(--muted)]">
                      {fav ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={fav} alt="" width={13} height={13} />
                      ) : null}
                      <span className="font-semibold text-[var(--text-secondary)]">{it.source}</span>
                      {it.publishedAt ? <span>· {timeAgo(it.publishedAt)}</span> : null}
                    </div>
                  </div>
                  <span className="shrink-0 self-start">
                    <SaveButton
                      item={{
                        link: it.link,
                        title: it.title,
                        source: it.source,
                        image: it.image,
                        moduleId: it.moduleId,
                        module: it.module,
                        publishedAt: it.publishedAt,
                      }}
                    />
                  </span>
                </a>
              </li>
            );
          })}
        </ol>
      ) : null}

      {papers.length > 0 ? (
        <div className="mt-6 border-t border-[var(--border)] pt-5">
          <div className="mb-3 flex items-center gap-3">
            <h3 className="inst-label">Research papers</h3>
            <Link href="/papers" className="inst-label ml-auto transition-colors hover:text-[var(--accent)]">
              See all &rarr;
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {papers.slice(0, 3).map((p) => (
              <PaperCard key={p.id} paper={p} accent={cat.accent} />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
