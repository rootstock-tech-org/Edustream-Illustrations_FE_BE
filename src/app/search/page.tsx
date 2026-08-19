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
  const results = words.length
    ? articles.filter((a) => {
        const hay = `${a.title} ${a.summary} ${a.module} ${a.source}`.toLowerCase();
        return words.every((w) => hay.includes(w)); // all words must appear
      })
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
