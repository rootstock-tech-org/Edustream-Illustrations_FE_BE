"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import CountUp from "@/components/CountUp";
import { REGIONS } from "@/lib/regions";
import nlp from "compromise";

type NewsItem = { headline: string; source: string; date: string | null; link: string };

const RANGES: { value: string; label: string }[] = [
  { value: "", label: "Any time" },
  { value: "1d", label: "24 hours" },
  { value: "7d", label: "Past week" },
  { value: "1m", label: "Past month" },
];

type Trends = {
  hasHistory: boolean;
  rising: { word: string }[];
  falling: { word: string }[];
  fresh: string[];
  current: { word: string; count: number }[];
};

// Tiny lexicon sentiment for a headline tag.
const POS = new Set([
  "win", "wins", "won", "surge", "surges", "boost", "record", "best", "success", "growth", "rise",
  "rises", "gain", "gains", "breakthrough", "launch", "launches", "approve", "approved", "strong",
  "beat", "beats", "rally", "soar", "soars", "profit", "award", "awards", "milestone", "upgrade", "hit",
]);
const NEG = new Set([
  "loss", "losses", "crash", "crashes", "ban", "banned", "dead", "death", "deaths", "killed", "fall",
  "falls", "drop", "drops", "cut", "cuts", "layoff", "layoffs", "fraud", "scam", "hack", "hacked",
  "breach", "decline", "declines", "fear", "fears", "crisis", "warning", "warn", "warns", "lawsuit",
  "sue", "sued", "delay", "delays", "recall", "outage", "slump", "plunge", "plunges", "weak", "fail",
  "fails", "failure", "attack", "attacks", "war", "dies", "probe",
]);

function sentimentOf(headline: string): "positive" | "negative" | "neutral" {
  let s = 0;
  for (const w of headline.toLowerCase().match(/[a-z']+/g) || []) {
    if (POS.has(w)) s++;
    else if (NEG.has(w)) s--;
  }
  return s > 0 ? "positive" : s < 0 ? "negative" : "neutral";
}

// Named entities (people / orgs / places) from a headline, top 3.
function entitiesOf(headline: string): string[] {
  const doc = nlp(headline);
  const raw = [
    ...(doc.match("#Person+").out("array") as string[]),
    ...(doc.match("#Organization+").out("array") as string[]),
    ...(doc.match("#Place+").out("array") as string[]),
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of raw) {
    const t = e.trim().replace(/[^\w\s&.-]/g, "");
    const k = t.toLowerCase();
    if (t.length < 2 || seen.has(k)) continue;
    seen.add(k);
    out.push(t.replace(/\b\w/g, (c) => c.toUpperCase()));
    if (out.length >= 3) break;
  }
  return out;
}

// Deterministic accent color per source, so each publisher looks consistent.
const PALETTE = ["#4f46e5", "#db2777", "#0ea5e9", "#7c3aed", "#0f766e", "#b91c1c", "#1d4ed8", "#059669"];
function sourceColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

function SourceAvatar({ source, size = 28 }: { source: string; size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-md font-bold text-white"
      style={{ background: sourceColor(source || "?"), width: size, height: size, fontSize: size * 0.45 }}
    >
      {(source || "?").charAt(0).toUpperCase()}
    </span>
  );
}

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3.6e6);
  if (h < 1) return "just now";
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

// Group headlines that describe the same story (they share several significant
// words) so one card can show "N sources covering this".
const CLUSTER_STOP = new Set([
  "the", "a", "an", "and", "or", "for", "of", "to", "in", "on", "at", "by", "with", "from", "as",
  "is", "are", "was", "were", "be", "been", "this", "that", "these", "those", "new", "says", "said",
  "will", "how", "what", "after", "over", "into", "amid", "its", "his", "her", "their", "they",
  "you", "your",
]);

function keyTokens(headline: string): Set<string> {
  const words = headline.toLowerCase().match(/[a-z][a-z'-]{3,}/g) || [];
  return new Set(words.filter((w) => !CLUSTER_STOP.has(w)));
}

function sameStory(a: Set<string>, b: Set<string>): boolean {
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  const denom = Math.min(a.size, b.size) || 1;
  return shared >= 3 || (shared >= 2 && shared / denom >= 0.6);
}

type Cluster = { lead: NewsItem; members: NewsItem[]; sources: { name: string; link: string; headline: string }[] };

function clusterStories(items: NewsItem[], group: boolean): Cluster[] {
  if (!group) {
    return items.map((it) => ({ lead: it, members: [it], sources: [{ name: it.source || "Unknown", link: it.link, headline: it.headline }] }));
  }
  const groups: { tokens: Set<string>; members: NewsItem[] }[] = [];
  for (const it of items) {
    const toks = keyTokens(it.headline);
    const hit = groups.find((g) => sameStory(toks, g.tokens));
    if (hit) hit.members.push(it);
    else groups.push({ tokens: toks, members: [it] });
  }
  return groups.map((g) => {
    const seen = new Set<string>();
    const sources: { name: string; link: string; headline: string }[] = [];
    for (const m of g.members) {
      const key = (m.source || "Unknown").toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      sources.push({ name: m.source || "Unknown", link: m.link, headline: m.headline });
    }
    return { lead: g.members[0], members: g.members, sources };
  });
}

// One grid card. Shows a "+N sources" pill that expands to reveal the other
// publishers covering the same story.
function StoryCard({ cluster, index }: { cluster: Cluster; index: number }) {
  const [open, setOpen] = useState(false);
  const it = cluster.lead;
  const extra = cluster.sources.slice(1);
  const sentiment = useMemo(() => sentimentOf(it.headline), [it.headline]);
  const entities = useMemo(() => entitiesOf(it.headline), [it.headline]);
  return (
    <div
      style={{ animationDelay: `${Math.min(index, 12) * 45}ms`, borderTopColor: sourceColor(it.source), borderTopWidth: 3 }}
      className="card-in flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="mb-3 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
        <SourceAvatar source={it.source} size={22} />
        <span className="font-medium text-slate-700 dark:text-slate-300">{it.source || "Unknown"}</span>
        {it.date && <span>· {timeAgo(it.date)}</span>}
      </div>
      <a href={it.link} target="_blank" rel="noopener noreferrer" className="group">
        <h3 className="font-medium leading-snug text-slate-900 group-hover:underline dark:text-slate-100">{it.headline}</h3>
      </a>
      {(sentiment !== "neutral" || entities.length > 0) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {sentiment !== "neutral" && (
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${sentiment === "positive" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" : "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"}`}>
              {sentiment}
            </span>
          )}
          {entities.map((e) => (
            <span key={e} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">{e}</span>
          ))}
        </div>
      )}
      {extra.length > 0 && (
        <div className="mt-3">
          <button
            onClick={() => setOpen((o) => !o)}
            className="inline-flex w-fit items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            +{extra.length} {extra.length === 1 ? "source" : "sources"}
            <span className={`transition-transform ${open ? "rotate-180" : ""}`}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
            </span>
          </button>
          {open && (
            <div className="mt-2 flex flex-col gap-1.5">
              {extra.map((s) => (
                <a
                  key={s.name + s.link}
                  href={s.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs leading-snug hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
                >
                  <span className="font-medium text-slate-700 dark:text-slate-300">{s.name}</span>
                  <span className="text-slate-500 dark:text-slate-400"> — {s.headline}</span>
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [region, setRegion] = useState("IN");
  const [sources, setSources] = useState<string[]>([]);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [building, setBuilding] = useState(false);
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<"relevant" | "newest">("relevant");
  const [activeSources, setActiveSources] = useState<Set<string>>(new Set());
  const [groupSimilar, setGroupSimilar] = useState(true);
  const [range, setRange] = useState("");
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [topicSaved, setTopicSaved] = useState(false);
  const [trends, setTrends] = useState<Trends | null>(null);
  const [exportOpen, setExportOpen] = useState(false);

  const loadNews = useCallback(
    (silent = false) => {
      if (silent) setRefreshing(true);
      else setLoading(true);
      fetch(`/api/news${range ? `?when=${range}` : ""}`)
        .then((r) => r.json())
        .then((d) => {
          setTopic(d.topic || "");
          setRegion(d.region || "IN");
          setSources(d.sources || []);
          setKeywords(d.keywords || []);
          setItems(d.items || []);
          setLastUpdated(Date.now());
        })
        .catch(() => {
          if (!silent) setItems([]);
        })
        .finally(() => {
          setLoading(false);
          setRefreshing(false);
        });
    },
    [range]
  );

  useEffect(() => {
    loadNews();
  }, [loadNews]);

  // Auto-refresh the news every 2 minutes (silent, no full-page spinner).
  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => loadNews(true), 120000);
    return () => clearInterval(id);
  }, [autoRefresh, loadNews]);

  useEffect(() => {
    if (!topic) return;
    fetch(`/api/trends?topic=${encodeURIComponent(topic)}`).then((r) => r.json()).then(setTrends).catch(() => {});
  }, [topic, lastUpdated]);

  // Build a polished PDF report (cover header, sections, links, page numbers).
  async function downloadReport() {
    if (!view.length) return;
    setBuilding(true);
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const W = doc.internal.pageSize.getWidth();
      const H = doc.internal.pageSize.getHeight();
      const M = 48;
      const CW = W - 2 * M;
      const dot = "  \u00b7  ";
      const regionLabel = REGIONS.find((r) => r.code === region)?.label || region;
      const rangeLabel = RANGES.find((r) => r.value === range)?.label || "Any time";
      const stories = clusters.map((c) => c.lead);

      // Header band with the topic as the title.
      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, W, 100, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(148, 163, 184);
      doc.text("NEWS REPORT", M, 40);
      doc.setFontSize(24);
      doc.setTextColor(255, 255, 255);
      const title = (topic || "News Report").replace(/\b\w/g, (ch) => ch.toUpperCase());
      doc.text((doc.splitTextToSize(title, CW) as string[])[0], M, 68);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(148, 163, 184);
      doc.text(`${regionLabel}${dot}${rangeLabel}${dot}${new Date().toLocaleDateString()}${dot}${stories.length} stories`, M, 88);

      let y = 134;

      const metaBlock = (label: string, value: string) => {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(79, 70, 229);
        doc.text(label.toUpperCase(), M, y);
        y += 14;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9.5);
        doc.setTextColor(30, 41, 59);
        const lines = doc.splitTextToSize(value, CW) as string[];
        doc.text(lines, M, y);
        y += lines.length * 12 + 14;
      };
      if (sources.length) metaBlock(`Sources (${sources.length})`, sources.join("   \u00b7   "));
      if (keywords.length) metaBlock(`Keywords (${keywords.length})`, keywords.join("   \u00b7   "));

      doc.setDrawColor(226, 232, 240);
      doc.line(M, y, W - M, y);
      y += 22;

      stories.forEach((it, i) => {
        const cov = clusters[i].sources.length;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11.5);
        const hl = doc.splitTextToSize(`${i + 1}.  ${it.headline}`, CW) as string[];
        if (y + hl.length * 15 + 42 > H - 56) {
          doc.addPage();
          y = 56;
        }
        doc.setTextColor(15, 23, 42);
        doc.text(hl, M, y);
        y += hl.length * 15 + 3;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(100, 116, 139);
        const date = it.date ? new Date(it.date).toLocaleDateString() : "";
        const covTxt = cov > 1 ? `   \u00b7   +${cov - 1} more source${cov - 1 > 1 ? "s" : ""}` : "";
        doc.text(`${it.source || "Unknown"}${date ? dot + date : ""}${covTxt}`, M, y);
        y += 14;

        doc.setTextColor(79, 70, 229);
        doc.setFontSize(8.5);
        const linkText = it.link.length > 100 ? it.link.slice(0, 100) + "..." : it.link;
        doc.textWithLink(linkText, M, y, { url: it.link });
        y += 15;

        doc.setDrawColor(238, 242, 247);
        doc.line(M, y, W - M, y);
        y += 16;
      });

      // Footer page numbers on every page.
      const pages = doc.getNumberOfPages();
      for (let p = 1; p <= pages; p++) {
        doc.setPage(p);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);
        doc.text("Generated by News Report Builder", M, H - 24);
        doc.text(`Page ${p} of ${pages}`, W - M, H - 24, { align: "right" });
      }

      const slug = (topic || "report").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
      doc.save(`news_${slug}_${new Date().toISOString().slice(0, 10)}.pdf`);
    } finally {
      setBuilding(false);
    }
  }

  function downloadText(content: string, ext: string, mime: string) {
    const slug = (topic || "report").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    const blob = new Blob([content], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `news_${slug}_${new Date().toISOString().slice(0, 10)}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadMarkdown() {
    if (!view.length) return;
    const regionLabel = REGIONS.find((r) => r.code === region)?.label || region;
    const lines = [`# ${topic || "News Report"}`, "", `${regionLabel} · ${new Date().toLocaleDateString()} · ${clusters.length} stories`, ""];
    if (sources.length) lines.push(`**Sources:** ${sources.join(", ")}`, "");
    if (keywords.length) lines.push(`**Keywords:** ${keywords.join(", ")}`, "");
    clusters.forEach((c, i) => {
      const it = c.lead;
      const date = it.date ? new Date(it.date).toLocaleDateString() : "";
      const cov = c.sources.length > 1 ? ` (+${c.sources.length - 1} more sources)` : "";
      lines.push(`${i + 1}. [${it.headline}](${it.link})`, `   ${it.source || "Unknown"}${date ? " · " + date : ""}${cov}`, "");
    });
    downloadText(lines.join("\n"), "md", "text/markdown");
  }

  function downloadCSV() {
    if (!view.length) return;
    const esc = (s: string) => `"${(s || "").replace(/"/g, '""')}"`;
    const rows = [["#", "Headline", "Source", "Date", "Sources covering", "Link"].map(esc).join(",")];
    clusters.forEach((c, i) => {
      const it = c.lead;
      const date = it.date ? new Date(it.date).toISOString().slice(0, 10) : "";
      rows.push([String(i + 1), it.headline, it.source || "Unknown", date, String(c.sources.length), it.link].map(esc).join(","));
    });
    downloadText(rows.join("\r\n"), "csv", "text/csv");
  }

  async function saveThisTopic() {
    if (!topic) return;
    await fetch("/api/topics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic, region, sources, keywords }),
    }).catch(() => {});
    setTopicSaved(true);
    setTimeout(() => setTopicSaved(false), 2000);
  }

  const allSources = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of items) {
      const s = it.source || "Unknown";
      m.set(s, (m.get(s) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [items]);

  const view = useMemo(() => {
    const q = query.trim().toLowerCase();
    const kws = keywords.map((k) => k.toLowerCase());
    const hasKw = (it: NewsItem) => kws.some((k) => it.headline.toLowerCase().includes(k));
    const list = items.filter((it) => {
      const src = it.source || "Unknown";
      if (activeSources.size && !activeSources.has(src)) return false;
      if (q && !it.headline.toLowerCase().includes(q) && !src.toLowerCase().includes(q)) return false;
      return true;
    });
    return [...list].sort((a, b) =>
      sortBy === "newest"
        ? (b.date || "").localeCompare(a.date || "")
        : Number(hasKw(b)) - Number(hasKw(a)) || (b.date || "").localeCompare(a.date || "")
    );
  }, [items, query, sortBy, activeSources, keywords]);

  const clusters = useMemo(() => clusterStories(view, groupSimilar), [view, groupSimilar]);
  const featured = clusters[0];
  const rest = clusters.slice(1);
  const featuredMeta = useMemo(
    () => (featured ? { sentiment: sentimentOf(featured.lead.headline), entities: entitiesOf(featured.lead.headline) } : null),
    [featured]
  );

  function toggleSource(name: string) {
    setActiveSources((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-900/80">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-slate-900 text-sm font-bold text-white dark:bg-slate-100 dark:text-slate-900">N</span>
            <span className="font-semibold text-slate-900 dark:text-slate-100">News Report Builder</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/")}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              New search
            </button>
            <button
              onClick={saveThisTopic}
              disabled={!topic}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {topicSaved ? "Saved" : "Save topic"}
            </button>
            <div className="relative">
              <button
                onClick={(e) => { e.stopPropagation(); setExportOpen((o) => !o); }}
                disabled={building || items.length === 0}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white dark:disabled:bg-slate-700"
              >
                {building ? (
                  "Creating report..."
                ) : (
                  <span className="inline-flex items-center gap-1.5">
                    Download report
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
                  </span>
                )}
              </button>
              {exportOpen && (
                <>
                  <button className="fixed inset-0 z-10 cursor-default" onClick={() => setExportOpen(false)} aria-hidden tabIndex={-1} />
                  <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800">
                    <button onClick={() => { setExportOpen(false); downloadReport(); }} className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700">PDF report</button>
                    <button onClick={() => { setExportOpen(false); downloadMarkdown(); }} className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700">Markdown (.md)</button>
                    <button onClick={() => { setExportOpen(false); downloadCSV(); }} className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700">CSV (.csv)</button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-8">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Step 4 of 4 · Dashboard</p>
        <h1 className="mt-1 text-3xl font-bold capitalize text-slate-900 dark:text-slate-100">{topic || "News"}</h1>
        {(sources.length > 0 || keywords.length > 0) && (
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            <CountUp value={sources.length} /> sources · <CountUp value={keywords.length} /> keywords ·{" "}
            <CountUp value={items.length} /> stories
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Time</span>
          {RANGES.map((r) => (
            <button
              key={r.value}
              onClick={() => setRange(r.value)}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                range === r.value
                  ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                  : "border-slate-300 bg-white text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
          {lastUpdated && (
            <span>Updated {new Date(lastUpdated).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
          )}
          <button
            onClick={() => loadNews(true)}
            disabled={refreshing || loading}
            className="font-medium text-slate-700 hover:underline disabled:opacity-50 dark:text-slate-300"
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
          <label className="flex cursor-pointer items-center gap-1.5">
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
            Auto-refresh
          </label>
        </div>

        {trends && trends.hasHistory && (trends.rising.length > 0 || trends.falling.length > 0 || trends.fresh.length > 0) && (
          <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Trending keywords</p>
            <div className="flex flex-wrap gap-2">
              {trends.rising.map((t) => (
                <button key={"r" + t.word} onClick={() => setQuery(t.word)} className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300 dark:hover:bg-emerald-500/25">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
                  {t.word}
                </button>
              ))}
              {trends.fresh.map((w) => (
                <button key={"f" + w} onClick={() => setQuery(w)} className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-500/15 dark:text-indigo-300 dark:hover:bg-indigo-500/25">
                  <span className="text-[9px] font-bold uppercase">new</span>
                  {w}
                </button>
              ))}
              {trends.falling.map((t) => (
                <button key={"d" + t.word} onClick={() => setQuery(t.word)} className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-medium text-rose-600 hover:bg-rose-100 dark:bg-rose-500/15 dark:text-rose-300 dark:hover:bg-rose-500/25">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12l7 7 7-7" /></svg>
                  {t.word}
                </button>
              ))}
            </div>
          </div>
        )}

        {loading ? (
          <p className="mt-10 text-slate-500 dark:text-slate-400">Fetching the latest news...</p>
        ) : items.length === 0 ? (
          <p className="mt-10 text-slate-500 dark:text-slate-400">No news found. Go back and adjust your sources or keywords.</p>
        ) : (
          <>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search these stories..."
                className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-slate-400"
              />
              <div className="inline-flex overflow-hidden rounded-lg border border-slate-300 dark:border-slate-700">
                {(["relevant", "newest"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setSortBy(s)}
                    className={`px-4 py-2.5 text-sm font-medium ${
                      sortBy === s ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "bg-white text-slate-700 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                    }`}
                  >
                    {s === "relevant" ? "Most relevant" : "Newest"}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setGroupSimilar((g) => !g)}
                className={`rounded-lg border px-4 py-2.5 text-sm font-medium ${
                  groupSimilar ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                }`}
              >
                Group similar
              </button>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() => setActiveSources(new Set())}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                  activeSources.size === 0
                    ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                    : "border-slate-300 bg-white text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                }`}
              >
                All sources
              </button>
              {allSources.map(([name]) => (
                <button
                  key={name}
                  onClick={() => toggleSource(name)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium ${
                    activeSources.has(name)
                      ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>

            <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
              Showing {clusters.length} of {items.length} stories
              {groupSimilar && clusters.length < view.length ? ` · merged ${view.length - clusters.length} duplicates` : ""}
            </p>

            {view.length === 0 ? (
              <p className="mt-8 text-slate-500 dark:text-slate-400">No stories match your search or filter.</p>
            ) : (
              <div className="mt-4 space-y-8">
                {featured && (
                  <div
                    style={{ borderLeftColor: sourceColor(featured.lead.source), borderLeftWidth: 4 }}
                    className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-8 dark:border-slate-800 dark:bg-slate-900"
                  >
                    <span className="mb-3 inline-block rounded-full bg-slate-900 px-2.5 py-0.5 text-xs font-medium text-white dark:bg-slate-700">
                      Top story{featured.sources.length > 1 ? ` · ${featured.sources.length} sources` : ""}
                    </span>
                    <a href={featured.lead.link} target="_blank" rel="noopener noreferrer" className="group block">
                      <h2 className="text-2xl font-semibold leading-snug text-slate-900 group-hover:underline md:text-3xl dark:text-slate-100">
                        {featured.lead.headline}
                      </h2>
                    </a>
                    <div className="mt-4 flex items-center gap-2.5 text-sm text-slate-500 dark:text-slate-400">
                      <SourceAvatar source={featured.lead.source} />
                      <span className="font-medium text-slate-700 dark:text-slate-300">{featured.lead.source || "Unknown"}</span>
                      {featured.lead.date && <span>· {timeAgo(featured.lead.date)}</span>}
                    </div>
                    {featuredMeta && (featuredMeta.sentiment !== "neutral" || featuredMeta.entities.length > 0) && (
                      <div className="mt-3 flex flex-wrap items-center gap-1.5">
                        {featuredMeta.sentiment !== "neutral" && (
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${featuredMeta.sentiment === "positive" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" : "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"}`}>
                            {featuredMeta.sentiment}
                          </span>
                        )}
                        {featuredMeta.entities.map((e) => (
                          <span key={e} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">{e}</span>
                        ))}
                      </div>
                    )}
                    {featured.sources.length > 1 && (
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className="text-xs font-medium text-slate-400">Also covered by</span>
                        {featured.sources.slice(1, 7).map((s) => (
                          <a
                            key={s.name + s.link}
                            href={s.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={s.headline}
                            className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                          >
                            {s.name}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {rest.map((c, i) => (
                    <StoryCard key={c.lead.link + i} cluster={c} index={i} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        <div className="mt-10">
          <button
            onClick={() => router.push(`/keywords?topic=${encodeURIComponent(topic)}&region=${region}`)}
            className="rounded-lg border border-slate-300 px-5 py-2.5 font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Back
          </button>
        </div>
      </div>

      <style>{`
        @keyframes cardIn {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .card-in { opacity: 0; animation: cardIn 0.45s ease forwards; }
      `}</style>
    </main>
  );
}
