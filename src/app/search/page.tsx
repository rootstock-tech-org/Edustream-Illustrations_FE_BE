import { getNews } from "../../../lib/getNews";
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
  // Match real content (title/summary/module) but NOT the source name - else
  // "semicon" matched every "Semiconductor Digest" story. Results are ranked
  // title-first so the strongest matches lead and summary-only ones sink.
  const results = words.length
    ? articles
        .map((a) => {
          const title = a.title.toLowerCase();
          const mod = (a.module ?? "").toLowerCase();
          const summary = (a.summary ?? "").toLowerCase();
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

  return (
    <>
      <Header />
      <div className="mx-auto max-w-6xl px-4 pb-16">
        <div className="mb-6 mt-8">
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text)]">
            {query ? <>Results for &ldquo;{query}&rdquo;</> : "Search"}
          </h1>
          <p className="text-sm text-[var(--muted)]">
            {query ? `${results.length} stories` : "Type in the search box above to find VLSI news."}
          </p>
        </div>

        {query && results.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--panel)] p-10 text-center text-[var(--muted)]">
            No stories matched &ldquo;{query}&rdquo;. Try a broader term like EUV, HBM or chiplet.
          </p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {results.map((it) => (
              <NewsCard key={it.link} item={it} accent={BRAND} variant="default" />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
