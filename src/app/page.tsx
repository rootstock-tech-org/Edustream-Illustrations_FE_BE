import { getNews } from "../../lib/getNews";
import { getPapers } from "../../lib/getPapers";
import { CENTER_IDS, SIDE_IDS, viewFor } from "../../lib/categories";
import Link from "next/link";
import { Header } from "../components/Header";
import { Section, SectionLayout } from "../components/Section";
import { SideWidget } from "../components/SideWidget";
import { NewsCard } from "../components/NewsCard";

// Read the store fresh on every request so refresh-loop updates appear at once.
export const dynamic = "force-dynamic";

const BRAND = "#4f46e5";
const LAYOUTS: SectionLayout[] = ["spotlight", "list", "grid", "headlines", "list", "grid"];

export default function Home() {
  const { articles } = getNews();
  // Store is already sorted best-first (score).
  const hero = articles.slice(0, 5);
  const heroLinks = new Set(hero.map((a) => a.link));
  const rest = articles.filter((a) => !heroLinks.has(a.link));
  const [lead, ...heroRest] = hero;

  const bucket = (id: string) => rest.filter((a) => a.moduleId === id);
  const centerSecs = CENTER_IDS.map((id) => ({ cat: viewFor(id)!, items: bucket(id) })).filter(
    (s) => s.cat && s.items.length >= 3
  );
  // Blend a few research papers under each module's news (papers.json is
  // prebuilt, so this is a pure UI blend). Store lists a module's top papers first.
  const allPapers = getPapers().papers;
  const papersFor = (id: string) => allPapers.filter((p) => p.moduleId === id);

  const sideSecs = SIDE_IDS.map((id) => ({ cat: viewFor(id)!, items: bucket(id) })).filter(
    (s) => s.cat && (s.items.length || papersFor(s.cat.id).length)
  );

  const shown = new Set([...centerSecs, ...sideSecs].flatMap((s) => s.items.map((i) => i.link)));
  const more = rest.filter((a) => !shown.has(a.link));

  return (
    <>
      <Header />
      <div className="mx-auto flex max-w-6xl gap-8 px-4 pb-16">
        <main className="min-w-0 flex-1">
          {lead ? (
            <section className="avsar-corners avsar-shadow mt-6 rounded-lg border border-slate-200 bg-white p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-red-600 ring-1 ring-red-100">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
                  Top
                </span>
                <span className="text-sm font-semibold text-slate-500">
                  The latest from across the semiconductor world
                </span>
              </div>
              <div className="grid gap-5 lg:grid-cols-2">
                <NewsCard item={lead} accent={viewFor(lead.moduleId)?.accent ?? BRAND} variant="featured" />
                <div className="flex flex-col gap-1">
                  {heroRest.map((it) => (
                    <NewsCard key={it.link} item={it} accent={viewFor(it.moduleId)?.accent ?? BRAND} variant="compact" />
                  ))}
                </div>
              </div>
            </section>
          ) : (
            <p className="mt-10 text-center text-sm text-slate-500">No news yet.</p>
          )}

          {centerSecs.map((s, i) => (
            <Section
              key={s.cat.id}
              cat={s.cat}
              items={s.items}
              layout={LAYOUTS[i % LAYOUTS.length]}
              papers={papersFor(s.cat.id).slice(0, 4)}
            />
          ))}

          {more.length > 0 && (
            <section className="border-t border-slate-200 py-7">
              <h2 className="mb-4 flex items-center gap-2.5 text-lg font-bold tracking-tight text-slate-900">
                <span className="h-5 w-1.5 rounded-full bg-gradient-to-b from-indigo-500 to-blue-600" />
                More stories
              </h2>
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {more.map((it) => (
                  <NewsCard key={it.link} item={it} accent={viewFor(it.moduleId)?.accent ?? BRAND} variant="default" />
                ))}
              </div>
            </section>
          )}

          <div className="mt-10 border-t border-slate-200 pt-8 text-center">
            <Link
              href="/all"
              className="inline-flex items-center gap-2 rounded-full bg-[#041b4c] px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-[#0a2a6b]"
            >
              Know more
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </Link>
          </div>
        </main>

        <aside className="hidden w-80 shrink-0 lg:block">
          <div className="no-scrollbar sticky top-20 max-h-[calc(100vh-6rem)] space-y-5 overflow-y-auto pt-6">
            {sideSecs.map((s) => (
              <SideWidget
                key={s.cat.id}
                cat={s.cat}
                items={s.items}
                papers={papersFor(s.cat.id).slice(0, 3)}
              />
            ))}
          </div>
        </aside>
      </div>
    </>
  );
}
