import Link from "next/link";
import { getNews } from "../../../lib/getNews";
import { semanticRank } from "../../../lib/semanticSearch";
import { Header } from "../../components/Header";
import { NewsCard } from "../../components/NewsCard";

export const dynamic = "force-dynamic";

const BRAND = "#4f46e5";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const query = q.trim();
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);

  const { articles } = getNews();
  // Match real content (title/summary/module) but NOT the source name. The source
  // often appears both as the source field AND as boilerplate inside the summary,
  // so we strip the source name from the summary before matching - else "digest"
  // or "semicon" match every "Semiconductor Digest" story. Ranked title-first.
  const results = words.length
    ? articles
        .map((a) => {
          const title = a.title.toLowerCase();
          const mod = (a.module ?? "").toLowerCase();
          const src = (a.source ?? "").toLowerCase();
          let summary = (a.summary ?? "").toLowerCase();
          if (src) summary = summary.split(src).join(" "); // drop source-name boilerplate
          const hay = `${title} ${mod} ${summary}`;
          if (!words.every((w) => hay.includes(w))) return null;
          let score = 0;
          for (const w of words) {
            if (title.includes(w)) score += 5;
            if (mod.includes(w)) score += 2;
            if (summary.includes(w)) score += 1;
          }
          if (title.includes(query.toLowerCase())) score += 5; // full phrase in title
          return { a, score };
        })
        .filter((r): r is { a: (typeof articles)[number]; score: number } => r !== null)
        .sort((x, y) => y.score - x.score)
        .map((r) => r.a)
    : [];

  // Gap 3: meaning-based matches the word search missed (different wording, same
  // idea). Shown as a separate "Related by meaning" section below exact matches.
  const keywordLinks = new Set(results.map((a) => a.link));
  const related = query
    ? (await semanticRank(query, articles, 0.4))
        .filter((s) => !keywordLinks.has(s.item.link))
        .slice(0, 6)
        .map((s) => s.item)
    : [];

  return (
    <>
      <Header />
      <div className="mx-auto max-w-6xl px-4 pb-16">
        <Link href="/" className="inst-label mt-8 inline-flex items-center transition-colors hover:text-[var(--accent)]">
          &larr; Back to latest news
        </Link>
        <div className="mb-6 mt-4">
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text)]">
            {query ? <>Results for &ldquo;{query}&rdquo;</> : "Search"}
          </h1>
          <p className="text-sm text-[var(--muted)]">
            {query ? `${results.length} stories` : "Type in the search box above to find robotics news."}
          </p>
        </div>

        {query && results.length === 0 && related.length === 0 ? (
          <p className="border border-dashed border-[var(--border-strong)] bg-[var(--panel)] p-10 text-center text-[var(--muted)]">
            No stories matched &ldquo;{query}&rdquo;. Try a broader term like cobot, humanoid or SLAM.
          </p>
        ) : (
          <>
            {results.length > 0 && (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {results.map((it) => (
                  <NewsCard key={it.link} item={it} accent={BRAND} variant="default" />
                ))}
              </div>
            )}

            {related.length > 0 && (
              <section className="mt-10">
                <h2 className="text-lg font-bold text-[var(--text)]">Related by meaning</h2>
                <p className="mb-4 text-sm text-[var(--muted)]">
                  Stories close in meaning to &ldquo;{query}&rdquo;, even without the exact words.
                </p>
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {related.map((it) => (
                    <NewsCard key={it.link} item={it} accent={BRAND} variant="default" />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </>
  );
}
