import { notFound } from "next/navigation";
import Link from "next/link";
import { getNews } from "../../../../lib/getNews";
import { getPapers } from "../../../../lib/getPapers";
import { viewFor } from "../../../../lib/categories";
import { articleId } from "../../../../lib/display";
import { Header } from "../../../components/Header";
import { NewsCard } from "../../../components/NewsCard";
import { PaperCard } from "../../../components/PaperCard";
import { FocusScroller } from "../../../components/FocusScroller";

export const dynamic = "force-dynamic";

export default async function TopicPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cat = viewFor(id);
  if (!cat) notFound();

  const { articles } = getNews();
  const items = articles.filter((a) => a.moduleId === id);
  const papers = getPapers().papers.filter((p) => p.moduleId === id).slice(0, 6);

  return (
    <>
      <Header />
      <div className="mx-auto max-w-6xl px-4 pb-16">
        <div className="mb-6 mt-8 flex items-center gap-3">
          <span className="h-7 w-1.5 rounded-full" style={{ background: cat.accent }} />
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{cat.label}</h1>
            <p className="text-sm text-slate-500">{items.length} stories</p>
          </div>
        </div>

        {items.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
            No stories in this topic right now. Check back soon.
          </p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((it) => (
              <div key={it.link} id={`a-${articleId(it.link)}`} className="scroll-mt-24">
                <NewsCard item={it} accent={cat.accent} variant="default" />
              </div>
            ))}
          </div>
        )}

        {papers.length > 0 && (
          <section className="mt-10 border-t border-slate-200 pt-7">
            <div className="mb-4 flex items-center gap-3">
              <span className="h-6 w-1.5 rounded-full" style={{ background: cat.accent }} />
              <h2 className="text-lg font-bold tracking-tight text-slate-900">Research papers</h2>
              <Link href="/papers" className="ml-auto text-xs font-semibold text-slate-500 transition hover:text-indigo-600">
                See all →
              </Link>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {papers.map((p) => (
                <PaperCard key={p.id} paper={p} accent={cat.accent} />
              ))}
            </div>
          </section>
        )}
      </div>
      <FocusScroller />
    </>
  );
}
