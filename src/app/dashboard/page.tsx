"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ThumbImage from "@/components/ThumbImage";
import CountUp from "@/components/CountUp";
import { REGIONS } from "@/lib/regions";

type NewsItem = { headline: string; source: string; date: string | null; link: string };

// A search term for the card's photo: the topic plus the longest word from the
// headline (usually a name/place), for a relevant but varied image.
function imgTerm(headline: string, topic: string): string {
  const words = (headline.match(/[A-Za-z]{4,}/g) || []).sort((a, b) => b.length - a.length);
  return `${topic} ${words[0] || ""}`.trim();
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

export default function DashboardPage() {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [region, setRegion] = useState("IN");
  const [sources, setSources] = useState<string[]>([]);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [building, setBuilding] = useState(false);

  useEffect(() => {
    fetch("/api/news")
      .then((r) => r.json())
      .then((d) => {
        setTopic(d.topic || "");
        setRegion(d.region || "IN");
        setSources(d.sources || []);
        setKeywords(d.keywords || []);
        setItems(d.items || []);
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  // Build a clean PDF report of the current news (selectable text + links).
  async function downloadReport() {
    if (!items.length) return;
    setBuilding(true);
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const W = doc.internal.pageSize.getWidth();
      const H = doc.internal.pageSize.getHeight();
      const M = 40;
      let y = M;
      const regionLabel = REGIONS.find((r) => r.code === region)?.label || region;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(22);
      doc.setTextColor(20);
      doc.text(topic || "News Report", M, y);
      y += 24;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(120);
      doc.text(`${regionLabel}  \u00b7  ${new Date().toLocaleDateString()}  \u00b7  ${items.length} stories`, M, y);
      y += 20;

      const wrap = (label: string) => {
        doc.setTextColor(60);
        doc.setFontSize(9);
        const lines = doc.splitTextToSize(label, W - 2 * M) as string[];
        doc.text(lines, M, y);
        y += lines.length * 12 + 4;
      };
      if (sources.length) wrap("Sources: " + sources.join(", "));
      if (keywords.length) wrap("Keywords: " + keywords.join(", "));

      y += 6;
      doc.setDrawColor(220);
      doc.line(M, y, W - M, y);
      y += 18;

      items.forEach((it, i) => {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        const hl = doc.splitTextToSize(`${i + 1}. ${it.headline}`, W - 2 * M) as string[];
        if (y + hl.length * 14 + 26 > H - M) {
          doc.addPage();
          y = M;
        }
        doc.setTextColor(20);
        doc.text(hl, M, y);
        y += hl.length * 14 + 2;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(120);
        doc.text(`${it.source || "Unknown"}${it.date ? "  \u00b7  " + new Date(it.date).toLocaleDateString() : ""}`, M, y);
        y += 12;

        doc.setTextColor(30, 80, 200);
        const linkText = it.link.length > 95 ? it.link.slice(0, 95) + "..." : it.link;
        doc.textWithLink(linkText, M, y, { url: it.link });
        y += 20;
      });

      const slug = (topic || "report").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
      doc.save(`news_${slug}_${new Date().toISOString().slice(0, 10)}.pdf`);
    } finally {
      setBuilding(false);
    }
  }

  const featured = items[0];
  const rest = items.slice(1);

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-slate-900 text-sm font-bold text-white">N</span>
            <span className="font-semibold text-slate-900">News Report Builder</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/")}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Back to dashboard
            </button>
            <button
              onClick={downloadReport}
              disabled={building || items.length === 0}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {building ? "Creating report..." : "Download report (PDF)"}
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-8">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Step 4 of 4 · Dashboard</p>
        <h1 className="mt-1 text-3xl font-bold capitalize text-slate-900">{topic || "News"}</h1>
        {(sources.length > 0 || keywords.length > 0) && (
          <p className="mt-1 text-sm text-slate-500">
            <CountUp value={sources.length} /> sources · <CountUp value={keywords.length} /> keywords ·{" "}
            <CountUp value={items.length} /> stories
          </p>
        )}

        {loading ? (
          <p className="mt-10 text-slate-500">Fetching the latest news...</p>
        ) : items.length === 0 ? (
          <p className="mt-10 text-slate-500">No news found. Go back and adjust your sources or keywords.</p>
        ) : (
          <div className="mt-6 space-y-8">
            {featured && (
              <a
                href={featured.link}
                target="_blank"
                rel="noopener noreferrer"
                className="group grid overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md md:grid-cols-2"
              >
                <ThumbImage q={imgTerm(featured.headline, topic)} seed={featured.source} label={featured.source} className="h-56 w-full md:h-full" />
                <div className="flex flex-col justify-center p-6">
                  <span className="mb-2 w-fit rounded-full bg-slate-900 px-2.5 py-0.5 text-xs font-medium text-white">
                    Top story
                  </span>
                  <h2 className="text-xl font-semibold leading-snug text-slate-900 group-hover:underline">
                    {featured.headline}
                  </h2>
                  <div className="mt-3 flex items-center gap-2 text-sm text-slate-500">
                    <span className="font-medium text-slate-700">{featured.source || "Unknown"}</span>
                    {featured.date && <span>· {timeAgo(featured.date)}</span>}
                  </div>
                </div>
              </a>
            )}

            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {rest.map((it, i) => (
                <a
                  key={it.link + i}
                  href={it.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ animationDelay: `${Math.min(i, 12) * 45}ms` }}
                  className="card-in group flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md"
                >
                  <ThumbImage q={imgTerm(it.headline, topic)} seed={it.source} label={it.source} className="h-36 w-full" />
                  <div className="flex flex-1 flex-col p-4">
                    <h3 className="font-medium leading-snug text-slate-900 group-hover:underline">
                      {it.headline}
                    </h3>
                    <div className="mt-auto flex items-center gap-2 pt-3 text-xs text-slate-500">
                      <span className="font-medium text-slate-700">{it.source || "Unknown"}</span>
                      {it.date && <span>· {timeAgo(it.date)}</span>}
                    </div>
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}

        <div className="mt-10">
          <button
            onClick={() => router.push(`/keywords?topic=${encodeURIComponent(topic)}`)}
            className="rounded-lg border border-slate-300 px-5 py-2.5 font-medium text-slate-700 hover:bg-slate-100"
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
