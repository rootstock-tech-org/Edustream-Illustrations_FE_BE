import { Suspense } from "react";
import { Header } from "../../components/Header";
import { topHeadlines, latestNews } from "../../../tool/googleNews";
import { getNews, getPapersAndPeople, getComparison } from "../../lib/exploreData";

const csvHref = (query: string, type: string) => `/api/export?q=${encodeURIComponent(query)}&type=${type}`;

export const dynamic = "force-dynamic";

// Live keyword explorer (Module A): type any topic -> fresh news, research
// papers, people working in the field, and a product/player comparison.
// Each block streams in on its own (Suspense) so one slow source never blocks
// the whole page.
export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const query = q.trim();

  return (
    <>
      <Header />
      <div className="mx-auto max-w-6xl px-4 pb-16">
        <div className="mb-6 mt-8">
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text)]">Explore any topic</h1>
          <p className="text-sm text-[var(--muted)]">
            Type a keyword to get news, research papers, people and a comparison.
          </p>
        </div>

        <form action="/explore" className="mb-10 max-w-lg">
          <div className="inst-panel flex items-center gap-2 px-3 py-2 focus-within:border-[var(--signal)]">
            <input
              name="q"
              defaultValue={query}
              suppressHydrationWarning
              placeholder="e.g. quantum computing, semiconductor, EV batteries"
              className="w-full bg-transparent text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none"
            />
            <button type="submit" className="shrink-0 text-sm font-semibold text-[var(--signal)]">
              Search
            </button>
          </div>
        </form>

        {!query ? (
          <EmptyState />
        ) : (
          <div className="space-y-12">
            <Suspense key={`news-${query}`} fallback={<Loading title="Top Headlines" />}>
              <NewsBlock query={query} />
            </Suspense>
            <Suspense key={`papers-${query}`} fallback={<Loading title="Latest Research Papers" />}>
              <PapersAndPeopleBlock query={query} />
            </Suspense>
            <Suspense key={`cmp-${query}`} fallback={<Loading title="Product / Player Comparison" />}>
              <ComparisonBlock query={query} />
            </Suspense>
          </div>
        )}
      </div>
    </>
  );
}

const POPULAR = [
  "Quantum Computing",
  "Semiconductor",
  "EV Batteries",
  "AI Chips",
  "Photonics",
  "5G",
  "Robotics",
  "Chiplets",
];

const WHAT_YOU_GET = [
  { title: "Stay updated", desc: "Latest industry news so you can talk about your field with confidence." },
  { title: "Papers to read", desc: "Recent research for your assignments, projects and seminars." },
  { title: "Find experts & labs", desc: "People and institutions you can learn from or reach out to." },
  { title: "Know the top companies", desc: "Where you could intern, apply or build a career." },
  { title: "All in one place", desc: "Everything about a topic together, so you save hours of searching." },
];

function EmptyState() {
  return (
    <div className="space-y-10">
      <div>
        <p className="mb-3 text-sm font-semibold text-[var(--text)]">Popular topics</p>
        <div className="flex flex-wrap gap-2">
          {POPULAR.map((t) => (
            <a
              key={t}
              href={`/explore?q=${encodeURIComponent(t)}`}
              className="rounded-full border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 text-sm text-[var(--text)] transition-colors hover:bg-[var(--hover)] hover:border-[var(--signal)]"
            >
              {t}
            </a>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-3 text-sm font-semibold text-[var(--text)]">How this helps you</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {WHAT_YOU_GET.map((w, i) => (
            <div key={w.title} className="inst-panel p-4">
              <p className="font-medium text-[var(--text)]">
                <span className="mr-2 text-[var(--signal)]">{i + 1}.</span>
                {w.title}
              </p>
              <p className="mt-1 text-xs text-[var(--muted)]">{w.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

async function NewsBlock({ query }: { query: string }) {
  const news = await getNews(query);
  const headlines = topHeadlines(news);
  const latest = latestNews(news);
  return (
    <>
      <Section title="Top Headlines" count={headlines.length} download={csvHref(query, "headlines")}>
        <NewsList items={headlines} />
      </Section>
      <Section title="Latest News" count={latest.length} download={csvHref(query, "latest")}>
        <NewsList items={latest} />
      </Section>
    </>
  );
}

async function PapersAndPeopleBlock({ query }: { query: string }) {
  const { papers, people } = await getPapersAndPeople(query);
  return (
    <>
      <Section title="Latest Research Papers" count={papers.length} download={csvHref(query, "papers")}>
        <ul className="space-y-3">
          {papers.map((p) => (
            <li key={p.url} className="inst-panel p-4">
              <a href={p.url} target="_blank" rel="noopener noreferrer" className="font-medium text-[var(--text)] hover:text-[var(--signal)]">
                {p.title}
              </a>
              <p className="mt-1 text-xs text-[var(--muted)]">
                {p.authors.slice(0, 3).join(", ")}
                {p.authors.length > 3 ? " et al." : ""}
                {p.year ? ` · ${p.year}` : ""} · {p.source}
              </p>
            </li>
          ))}
        </ul>
      </Section>
      <Section title="People Working in This Area" count={people.length} download={csvHref(query, "people")}>
        <ul className="grid gap-3 sm:grid-cols-2">
          {people.map((p) => (
            <li key={p.name} className="inst-panel p-4">
              <p className="font-medium text-[var(--text)]">{p.name}</p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                {p.affiliation || "Affiliation not listed"} · {p.papers} paper{p.papers > 1 ? "s" : ""}
              </p>
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}

async function ComparisonBlock({ query }: { query: string }) {
  const comparison = await getComparison(query);
  return (
    <Section title="Product / Player Comparison" count={comparison.players.length} download={csvHref(query, "comparison")}>
      {comparison.error ? (
        <p className="text-sm text-[var(--muted)]">Comparison unavailable right now.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {comparison.players.map((pl) => (
            <div key={pl.name} className="inst-panel p-4">
              <p className="font-medium text-[var(--text)]">
                {pl.name} <span className="text-xs font-normal text-[var(--muted)]">({pl.type})</span>
              </p>
              <p className="mt-1 text-sm text-[var(--text)]">{pl.focus}</p>
              <p className="mt-1 text-xs text-[var(--muted)]">Strength: {pl.strength}</p>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

function NewsList({ items }: { items: { headline: string; source: string; date: string | null; link: string }[] }) {
  return (
    <ul className="space-y-3">
      {items.map((h) => (
        <li key={h.link} className="inst-panel p-4">
          <a href={h.link} target="_blank" rel="noopener noreferrer" className="font-medium text-[var(--text)] hover:text-[var(--signal)]">
            {h.headline}
          </a>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {h.source}
            {h.date ? ` · ${h.date.slice(0, 10)}` : ""}
          </p>
        </li>
      ))}
    </ul>
  );
}

function Section({
  title,
  count,
  download,
  children,
}: {
  title: string;
  count: number;
  download?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-[var(--text)]">
          {title} <span className="text-sm font-normal text-[var(--muted)]">({count})</span>
        </h2>
        {download && count > 0 ? (
          <a href={download} className="shrink-0 text-xs font-semibold text-[var(--signal)] hover:underline">
            Download CSV
          </a>
        ) : null}
      </div>
      {count === 0 ? <p className="text-sm text-[var(--muted)]">Nothing found.</p> : children}
    </section>
  );
}

function Loading({ title }: { title: string }) {
  return (
    <section>
      <h2 className="mb-3 text-lg font-bold text-[var(--text)]">{title}</h2>
      <p className="text-sm text-[var(--muted)]">Loading…</p>
    </section>
  );
}
