import { notFound } from "next/navigation";
import { getNews } from "../../../../lib/getNews";
import { viewFor } from "../../../../lib/categories";
import { articleId } from "../../../../lib/display";
import { Header } from "../../../components/Header";
import { NewsCard } from "../../../components/NewsCard";
import { FocusScroller } from "../../../components/FocusScroller";

export const dynamic = "force-dynamic";

export default async function TopicPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cat = viewFor(id);
  if (!cat) notFound();

  const { articles } = getNews();
  const items = articles.filter((a) => a.moduleId === id);

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
      </div>
      <FocusScroller />
    </>
  );
}
