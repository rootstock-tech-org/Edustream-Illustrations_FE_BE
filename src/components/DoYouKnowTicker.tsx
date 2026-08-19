"use client";

// Portable "Do You Know?" ticker for an AVSAR lecture page. Drop it under a topic
// and it shows that module's latest VLSI news as a rotating, Aaj-Tak-style strip:
// one headline at a time, auto-rotating, dismissible with a cross, and re-openable
// via "Show latest updates". Clicking a headline opens it on the AVSAR-news site.
//
// It has NO project-internal imports, so it can be copied into the AVSAR app as-is.
// Requires Tailwind (AVSAR already uses it). Pass either `module` or `topic`.
import { useCallback, useEffect, useRef, useState } from "react";

type TickerItem = {
  id: string;
  title: string;
  link: string;
  source: string;
  sourceCount: number;
  image: string | null;
  publishedAt: string | null;
};

export function DoYouKnowTicker({
  apiBase,
  siteBase,
  module,
  topic,
  intervalMs = 5000,
  heading = "Do You Know?",
}: {
  /** Origin of the news engine, e.g. "https://vlsi-news.example.com". */
  apiBase: string;
  /** Where a headline opens; defaults to apiBase (the news site). */
  siteBase?: string;
  /** Curriculum module id, e.g. "cmos". Use this or `topic`. */
  module?: string;
  /** AVSAR global topic number 1-171. Resolved to a module server-side. */
  topic?: number;
  intervalMs?: number;
  heading?: string;
}) {
  const [items, setItems] = useState<TickerItem[]>([]);
  const [idx, setIdx] = useState(0);
  const [open, setOpen] = useState(true);
  const [paused, setPaused] = useState(false);
  const site = siteBase || apiBase;

  const load = useCallback(async () => {
    const q = module ? `module=${encodeURIComponent(module)}` : topic != null ? `topic=${topic}` : "";
    if (!q) return;
    try {
      const res = await fetch(`${apiBase}/api/related?${q}&limit=8`);
      if (!res.ok) return;
      const data = await res.json();
      setItems(Array.isArray(data.items) ? data.items : []);
      setIdx(0);
    } catch {
      /* offline / blocked -> ticker just stays empty */
    }
  }, [apiBase, module, topic]);

  useEffect(() => {
    load();
  }, [load]);

  // Auto-rotate to the next headline, unless paused (hover) or closed.
  useEffect(() => {
    if (!open || paused || items.length <= 1) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % items.length), intervalMs);
    return () => clearInterval(t);
  }, [open, paused, items.length, intervalMs]);

  if (items.length === 0) return null;

  // Collapsed: the student closed it -> offer to bring it back.
  if (!open) {
    return (
      <div className="flex justify-center py-2">
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            load();
          }}
          className="inline-flex items-center gap-1.5 rounded-full bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-700"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12a9 9 0 1 1-3-6.7" />
            <path d="M21 3v5h-5" />
          </svg>
          Show latest updates
        </button>
      </div>
    );
  }

  const item = items[idx];
  const linkHref = module || item
    ? `${site}/topic/${module ?? ""}?focus=${item.id}`
    : item.link;

  return (
    <div
      className="relative flex items-stretch overflow-hidden rounded-xl border border-indigo-100 bg-white shadow-sm"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Left label chip (the "channel" tag) */}
      <div className="flex shrink-0 items-center gap-1.5 bg-gradient-to-r from-indigo-600 to-blue-600 px-3 py-2 text-white">
        <span className="grid h-4 w-4 place-items-center">
          <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
        </span>
        <span className="whitespace-nowrap text-[11px] font-bold uppercase tracking-wide">{heading}</span>
      </div>

      {/* Rotating headline */}
      <a
        href={linkHref}
        target="_blank"
        rel="noopener noreferrer"
        className="group flex min-w-0 flex-1 items-center gap-2 px-3 py-2"
      >
        <span key={item.id} className="dyk-fade min-w-0 truncate text-[13px] font-semibold text-slate-800 group-hover:text-indigo-600">
          {item.title}
        </span>
        <span className="ml-auto hidden shrink-0 items-center gap-1 whitespace-nowrap text-[10px] text-slate-400 sm:flex">
          {item.source}
          {item.sourceCount > 1 ? ` · ${item.sourceCount} sources` : ""}
        </span>
      </a>

      {/* Dots + close */}
      <div className="flex shrink-0 items-center gap-2 px-2">
        <div className="hidden items-center gap-1 sm:flex">
          {items.slice(0, 8).map((it, i) => (
            <span
              key={it.id}
              className={`h-1.5 w-1.5 rounded-full transition ${i === idx ? "bg-indigo-600" : "bg-slate-300"}`}
            />
          ))}
        </div>
        <button
          type="button"
          aria-label="Hide updates"
          title="Hide updates"
          onClick={() => setOpen(false)}
          className="grid h-6 w-6 place-items-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <style>{`
        @keyframes dykFade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
        .dyk-fade { animation: dykFade 400ms ease; }
      `}</style>
    </div>
  );
}
