// Module A — "Latest Research Papers" category. Fetch papers for a keyword from
// two free sources (arXiv + Semantic Scholar), merge them, and drop duplicates.
import { XMLParser } from "fast-xml-parser";

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

export type Paper = {
  title: string;
  authors: string[];
  year: number | null;
  source: "arXiv" | "Semantic Scholar";
  url: string;
  abstract: string;
  summary: string; // one-line version of the abstract (short & scannable)
};

function text(v: any): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object") return v["#text"] ?? "";
  return String(v);
}

function clean(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

// First sentence of the abstract (or a trimmed slice) as a one-line summary.
function oneLine(abstract: string, max = 180): string {
  const a = clean(abstract);
  if (!a) return "";
  const end = a.search(/[.!?]\s/);
  if (end > 0 && end + 1 <= max) return a.slice(0, end + 1);
  return a.length <= max ? a : a.slice(0, max).replace(/\s+\S*$/, "") + "\u2026";
}

// arXiv Atom API — phrase-matched for relevance, then newest first.
async function fetchArxiv(keyword: string, limit: number): Promise<Paper[]> {
  // Quote the keyword so arXiv matches the actual phrase, not any loose word.
  const q = `all:"${keyword}"`;
  const url =
    `http://export.arxiv.org/api/query?search_query=${encodeURIComponent(q)}` +
    `&start=0&max_results=${limit}&sortBy=submittedDate&sortOrder=descending`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return [];
    const feed = parser.parse(await res.text())?.feed;
    const raw = feed?.entry;
    const entries = raw ? (Array.isArray(raw) ? raw : [raw]) : [];
    return entries.map((e: any): Paper => {
      const a = e.author ? (Array.isArray(e.author) ? e.author : [e.author]) : [];
      const published = text(e.published);
      const abstract = clean(text(e.summary));
      return {
        title: clean(text(e.title)),
        authors: a.map((x: any) => clean(text(x.name))).filter(Boolean),
        year: published ? new Date(published).getFullYear() : null,
        source: "arXiv",
        url: text(e.id),
        abstract,
        summary: oneLine(abstract),
      };
    });
  } catch {
    return [];
  }
}

// Semantic Scholar graph API — free, no key.
async function fetchSemanticScholar(keyword: string, limit: number): Promise<Paper[]> {
  const url =
    `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(keyword)}` +
    `&limit=${limit}&fields=title,year,authors,url,abstract`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return [];
    const data = await res.json();
    const rows = Array.isArray(data?.data) ? data.data : [];
    return rows.map((p: any): Paper => {
      const abstract = clean(p.abstract || "");
      return {
        title: clean(p.title || ""),
        authors: (p.authors || []).map((a: any) => clean(a.name || "")).filter(Boolean),
        year: typeof p.year === "number" ? p.year : null,
        source: "Semantic Scholar",
        url: p.url || "",
        abstract,
        summary: oneLine(abstract),
      };
    });
  } catch {
    return [];
  }
}

const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// keyword -> merged, de-duplicated papers from both sources (newest first).
export async function fetchPapers(keyword: string, limit = 10): Promise<Paper[]> {
  const [arxiv, ss] = await Promise.all([
    fetchArxiv(keyword, limit),
    fetchSemanticScholar(keyword, limit),
  ]);

  const seen = new Set<string>();
  const out: Paper[] = [];
  for (const p of [...arxiv, ...ss]) {
    if (!p.title) continue;
    const key = norm(p.title);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out.sort((a, b) => (b.year || 0) - (a.year || 0)).slice(0, limit * 2);
}
