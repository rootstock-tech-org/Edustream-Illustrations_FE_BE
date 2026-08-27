// Module A — "news" category. Fetch news for a keyword from Google News RSS
// (free, aggregates all sources incl. Reuters/Bloomberg headlines), then drop
// finance/stock/market junk so results stay accurate to the keyword.
import { XMLParser } from "fast-xml-parser";
import { BLOCKED_DOMAINS, NOISE_WORDS } from "../data/sources";

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

export type NewsItem = {
  headline: string;
  source: string;
  date: string | null; // ISO
  summary: string;
  link: string;
};

function text(v: any): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object") return v["#text"] ?? "";
  return String(v);
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

const hasNoise = (s: string) => {
  const t = s.toLowerCase();
  return NOISE_WORDS.some((w) => t.includes(w.toLowerCase()));
};

export type NewsOpts = { when?: string; hl?: string; gl?: string };

// keyword -> clean, keyword-accurate news items (junk removed).
export async function fetchGoogleNews(keyword: string, opts: NewsOpts = {}): Promise<NewsItem[]> {
  const hl = opts.hl ?? "en-US";
  const gl = opts.gl ?? "US";
  const query = opts.when ? `${keyword} when:${opts.when}` : keyword;
  const url =
    `https://news.google.com/rss/search?q=${encodeURIComponent(query)}` +
    `&hl=${hl}&gl=${gl}&ceid=${gl}:${hl.split("-")[0]}`;

  let items: any[] = [];
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "RootstockNewsBot/1.0" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return [];
    const data = parser.parse(await res.text());
    const raw = data?.rss?.channel?.item;
    items = raw ? (Array.isArray(raw) ? raw : [raw]) : [];
  } catch {
    return [];
  }

  const out: NewsItem[] = [];
  for (const it of items) {
    const fullTitle = text(it.title);
    if (!fullTitle) continue;
    const source = text(it.source);
    const sourceDom = domainOf(it.source?.["@_url"] || "");
    // Google titles look like "Headline - Source" -> strip the trailing source.
    const headline =
      source && fullTitle.endsWith(` - ${source}`)
        ? fullTitle.slice(0, -(source.length + 3))
        : fullTitle;

    // Junk filter: finance/market domain, or stock/market words in the headline.
    if (BLOCKED_DOMAINS.some((d) => sourceDom === d || sourceDom.endsWith("." + d))) continue;
    if (hasNoise(headline)) continue;

    const d = it.pubDate ? new Date(text(it.pubDate)) : null;
    out.push({
      headline,
      source,
      date: d && !isNaN(d.getTime()) ? d.toISOString() : null,
      summary: "", // Google News description is a link list, not a clean summary
      link: text(it.link),
    });
  }
  return out;
}

// Preferred wire services shown first in Top Headlines (Reuters-first, as asked).
const PREFERRED = [
  "reuters",
  "bloomberg",
  "associated press",
  "ap news",
  "financial times",
  "the wall street journal",
  "cnbc",
];

const byDateDesc = (a: NewsItem, b: NewsItem) => (b.date || "").localeCompare(a.date || "");

// Category 1: Top Headlines — preferred sources first, then newest.
export function topHeadlines(items: NewsItem[], limit = 10): NewsItem[] {
  const rank = (it: NewsItem) => {
    const s = it.source.toLowerCase();
    const i = PREFERRED.findIndex((p) => s.includes(p));
    return i === -1 ? PREFERRED.length : i;
  };
  return [...items].sort((a, b) => rank(a) - rank(b) || byDateDesc(a, b)).slice(0, limit);
}

// Category 2: Latest News — newest first.
export function latestNews(items: NewsItem[], limit = 15): NewsItem[] {
  return [...items].sort(byDateDesc).slice(0, limit);
}
