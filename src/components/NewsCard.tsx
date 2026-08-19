import type { Article } from "../../lib/pipeline";
import { faviconFor, timeAgo } from "../../lib/display";
import { ThumbImg } from "./ThumbImg";

type Variant = "featured" | "default" | "compact";

function SourceRow({ item, onDark = false }: { item: Article; onDark?: boolean }) {
  const fav = faviconFor(item.link);
  return (
    <div className={`flex items-center gap-1.5 text-[11px] ${onDark ? "text-white/85" : "text-slate-500"}`}>
      {fav ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={fav} alt="" width={14} height={14} className="rounded-sm" />
      ) : null}
      <span className={`font-semibold ${onDark ? "text-white" : "text-slate-700"}`}>{item.source}</span>
      {item.publishedAt ? <span className="opacity-80">· {timeAgo(item.publishedAt)}</span> : null}
    </div>
  );
}

function Badges({ item }: { item: Article }) {
  if (item.sourceCount <= 1 && !item.rumor) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {item.sourceCount > 1 ? (
        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-100">
          {item.sourceCount} sources
        </span>
      ) : null}
      {item.rumor ? (
        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-100">
          ⚠ Rumor
        </span>
      ) : null}
    </div>
  );
}

function Thumb({ item, accent, className = "" }: { item: Article; accent: string; className?: string }) {
  return (
    <div className={`relative overflow-hidden ${className}`} style={{ background: "var(--panel)" }}>
      <ThumbImg link={item.link} image={item.image} accent={accent} title={item.title} />
    </div>
  );
}

export function NewsCard({
  item,
  accent,
  variant = "default",
}: {
  item: Article;
  accent: string;
  label?: string;
  variant?: Variant;
}) {
  if (variant === "compact") {
    return (
      <a
        href={item.link}
        target="_blank"
        rel="noopener noreferrer"
        className="group flex items-start gap-3 rounded-xl p-2 transition-colors hover:bg-slate-100/70"
      >
        <Thumb item={item} accent={accent} className="h-[70px] w-[104px] shrink-0 rounded-lg ring-1 ring-slate-200/70" />
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-[13.5px] font-semibold leading-snug text-slate-800 transition-colors group-hover:text-indigo-600">
            {item.title}
          </h3>
          <div className="mt-1.5">
            <SourceRow item={item} />
          </div>
        </div>
      </a>
    );
  }

  if (variant === "featured") {
    return (
      <a
        href={item.link}
        target="_blank"
        rel="noopener noreferrer"
        className="group relative block overflow-hidden rounded-2xl border border-slate-200/70 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-slate-300/50"
      >
        <Thumb item={item} accent={accent} className="aspect-[16/10] w-full" />
        <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
        <div className="absolute right-3 top-3">
          <Badges item={item} />
        </div>
        <div className="absolute inset-x-0 bottom-0 p-4">
          <h2 className="line-clamp-3 text-lg font-bold leading-snug text-white drop-shadow-sm">{item.title}</h2>
          <div className="mt-2">
            <SourceRow item={item} onDark />
          </div>
        </div>
      </a>
    );
  }

  return (
    <a
      href={item.link}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-300/50"
    >
      <Thumb item={item} accent={accent} className="aspect-[16/10] w-full" />
      <div className="flex flex-1 flex-col gap-2 p-4">
        <SourceRow item={item} />
        <h3 className="line-clamp-3 text-[15px] font-semibold leading-snug text-slate-800 transition-colors group-hover:text-indigo-600">
          {item.title}
        </h3>
        <div className="mt-auto pt-1">
          <Badges item={item} />
        </div>
      </div>
    </a>
  );
}
