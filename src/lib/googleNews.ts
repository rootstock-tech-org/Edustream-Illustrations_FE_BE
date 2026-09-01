// Fetch news for any topic from Google News RSS (free, no key, any subject).
import { XMLParser } from "fast-xml-parser";

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

export type NewsItem = {
  headline: string;
  source: string;
  date: string | null; // ISO
  link: string;
};

function text(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object") return (v as Record<string, string>)["#text"] ?? "";
  return String(v);
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
    // Google titles look like "Headline - Source"; strip the trailing source.
    const headline = source && fullTitle.endsWith(` - ${source}`) ? fullTitle.slice(0, -(source.length + 3)) : fullTitle;
    const d = it.pubDate ? new Date(text(it.pubDate)) : null;
    out.push({
      headline,
      source,
      date: d && !isNaN(d.getTime()) ? d.toISOString() : null,
      link: text(it.link),
    });
  }
  return out;
}
