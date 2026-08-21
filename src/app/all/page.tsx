import Link from "next/link";
import { getNews } from "../../../lib/getNews";
import { viewFor } from "../../../lib/categories";
import { Header } from "../../components/Header";
import { NewsCard } from "../../components/NewsCard";

// Full archive: every story in the store, most-relevant first (older ones included).
export const dynamic = "force-dynamic";

const BRAND = "#4f46e5";

export default function AllNews() {
  const { articles } = getNews();

  return (
    <>
      <Header />
      <div className="mx-auto max-w-6xl px-4 pb-16">
        <div className="mt-6 mb-6 flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-5">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#041b4c]">All VLSI &amp; Semiconductor News</h1>
            <p className="mt-1 text-sm text-slate-500">{articles.length} stories, most relevant first &middot; older stories included</p>
          </div>
          <Link href="/" className="text-sm font-semibold text-slate-500 transition hover:text-[#c2410c]">
            &larr; Back to top stories
          </Link>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {articles.map((it) => (
            <NewsCard key={it.link} item={it} accent={viewFor(it.moduleId)?.accent ?? BRAND} variant="default" />
          ))}
        </div>
      </div>
    </>
  );
}
