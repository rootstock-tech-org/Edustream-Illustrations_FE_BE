// Fetch news for any topic from Google News RSS (free, no key, any subject).
import { XMLParser } from "fast-xml-parser";

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

export type NewsItem = {
  headline: string;
  source: string;
  sourceUrl: string | null; // publisher domain, e.g. "theverge.com"
  date: string | null; // ISO
  link: string;
};

function text(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object") return (v as Record<string, string>)["#text"] ?? "";
  return String(v);
}

function hostOf(url?: string): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export type NewsOpts = { when?: string; hl?: string; gl?: string };

// Fetch + parse the RSS items, retrying once if the feed comes back empty or
// fails (Google News RSS occasionally returns an empty response).
async function fetchItems(url: string): Promise<Record<string, unknown>[]> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "NewsReportBuilder/1.0" },
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) {
        const data = parser.parse(await res.text());
        const raw = data?.rss?.channel?.item;
        const items = raw ? (Array.isArray(raw) ? raw : [raw]) : [];
        if (items.length) return items;
      }
    } catch {
      // fall through to retry
    }
    if (attempt === 0) await new Promise((r) => setTimeout(r, 600));
  }
  return [];
}

// topic -> news items straight from Google News (newest handling left to callers).
export async function fetchGoogleNews(topic: string, opts: NewsOpts = {}): Promise<NewsItem[]> {
  const hl = opts.hl ?? "en-US";
  const gl = opts.gl ?? "US";
  const query = opts.when ? `${topic} when:${opts.when}` : topic;
  const url =
    `https://news.google.com/rss/search?q=${encodeURIComponent(query)}` +
    `&hl=${hl}&gl=${gl}&ceid=${gl}:${hl.split("-")[0]}`;

  const items = await fetchItems(url);

  const out: NewsItem[] = [];
  for (const it of items) {
    const fullTitle = text(it.title);
    if (!fullTitle) continue;
    const source = text(it.source);
    const srcObj = it.source as { "@_url"?: string } | string | undefined;
    // Google titles look like "Headline - Source"; strip the trailing source.
    const headline = source && fullTitle.endsWith(` - ${source}`) ? fullTitle.slice(0, -(source.length + 3)) : fullTitle;
    const d = it.pubDate ? new Date(text(it.pubDate)) : null;
    out.push({
      headline,
      source,
      sourceUrl: typeof srcObj === "object" ? hostOf(srcObj?.["@_url"]) : null,
      date: d && !isNaN(d.getTime()) ? d.toISOString() : null,
      link: text(it.link),
    });
  }
  return out;
}

const alnum = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

// Resolve an arbitrary source NAME (e.g. "The Verge") to its domain by asking
// Google News for that name and reading the source url. Falls back to the most
// common source in the results, which handles abbreviations (e.g. WSJ).
export async function resolveSourceDomain(name: string, opts: NewsOpts = {}): Promise<string | null> {
  const items = await fetchGoogleNews(name, opts);
  if (!items.length) return null;
  const target = alnum(name);
  for (const it of items) {
    const sn = alnum(it.source);
    if (it.sourceUrl && sn && (sn === target || sn.includes(target) || target.includes(sn))) {
      return it.sourceUrl;
    }
  }
  const counts = new Map<string, number>();
  for (const it of items) if (it.sourceUrl) counts.set(it.sourceUrl, (counts.get(it.sourceUrl) ?? 0) + 1);
  let best: string | null = null;
  let bestN = 0;
  for (const [d, n] of counts) if (n > bestN) { best = d; bestN = n; }
  return best;
}
