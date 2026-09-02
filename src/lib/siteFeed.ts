// Fetch a site's own blog posts from its RSS/Atom feed. Google News only carries
// news-registered publishers, so this is how added sources like company blogs
// (OpenAI, Hugging Face, most WordPress/Ghost/Substack sites) contribute their
// posts. Sites that expose no feed simply return nothing.
import { XMLParser } from "fast-xml-parser";
import type { NewsItem } from "./googleNews";

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)";

type Parsed = { item: NewsItem; hay: string };
const cache = new Map<string, { at: number; parsed: Parsed[] }>();
const TTL = 15 * 60 * 1000;

const COMMON_PATHS = [
  "/feed", "/rss", "/rss.xml", "/feed.xml", "/atom.xml", "/index.xml",
  "/blog/rss.xml", "/blog/feed.xml", "/blog/feed", "/news/rss.xml", "/feed/",
];

function text(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object") return (v as Record<string, string>)["#text"] ?? "";
  return String(v);
}

const arr = (v: unknown): Record<string, unknown>[] =>
  v == null ? [] : Array.isArray(v) ? (v as Record<string, unknown>[]) : [v as Record<string, unknown>];

async function tryFetch(url: string): Promise<Response | null> {
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow", signal: AbortSignal.timeout(9000) });
    return r.ok ? r : null;
  } catch {
    return null;
  }
}

function feedLinksFromHtml(html: string, base: string): string[] {
  const out: string[] = [];
  for (const tag of html.match(/<link[^>]+type=["']application\/(?:rss|atom)\+xml["'][^>]*>/gi) || []) {
    const href = tag.match(/href=["']([^"']+)["']/i)?.[1];
    if (href) {
      try { out.push(new URL(href, base).href); } catch { /* ignore bad href */ }
    }
  }
  return out;
}

async function discoverFeedUrl(domain: string): Promise<string | null> {
  const origin = `https://${domain}`;
  // 1. <link rel=alternate> on the homepage / blog / news pages.
  const pages = await Promise.all(["/", "/blog", "/news"].map((p) => tryFetch(origin + p)));
  for (const res of pages) {
    if (!res) continue;
    const links = feedLinksFromHtml(await res.text(), res.url);
    if (links.length) return links[0];
  }
  // 2. Well-known feed paths.
  const probes = await Promise.all(
    COMMON_PATHS.map(async (p) => {
      const res = await tryFetch(origin + p);
      if (!res) return null;
      const ct = res.headers.get("content-type") || "";
      const body = (await res.text()).slice(0, 300);
      return /xml|rss|atom/i.test(ct) || /<rss|<feed|<\?xml/i.test(body) ? origin + p : null;
    })
  );
  return probes.find((u): u is string => !!u) ?? null;
}

function parseFeed(xml: string, domain: string): Parsed[] {
  let d: Record<string, unknown>;
  try { d = parser.parse(xml) as Record<string, unknown>; } catch { return []; }
  const out: Parsed[] = [];

  const rss = (d.rss as Record<string, unknown>)?.channel as Record<string, unknown> | undefined;
  if (rss) {
    const feedTitle = text(rss.title) || domain;
    for (const it of arr(rss.item)) {
      const title = text(it.title);
      if (!title) continue;
      const link = typeof it.link === "string" ? it.link : text(it.link);
      const dt = it.pubDate ? new Date(text(it.pubDate)) : null;
      out.push({
        item: { headline: title, source: feedTitle, sourceUrl: domain, date: dt && !isNaN(dt.getTime()) ? dt.toISOString() : null, link },
        hay: (title + " " + text(it.description)).toLowerCase(),
      });
    }
    return out;
  }

  const atom = d.feed as Record<string, unknown> | undefined;
  if (atom) {
    const feedTitle = text(atom.title) || domain;
    for (const it of arr(atom.entry)) {
      const title = text(it.title);
      if (!title) continue;
      let link = "";
      const l = it.link;
      if (Array.isArray(l)) {
        const alt = l.find((x) => (x as Record<string, string>)["@_rel"] === "alternate") as Record<string, string> | undefined;
        link = alt?.["@_href"] || (l[0] as Record<string, string>)?.["@_href"] || "";
      } else if (l && typeof l === "object") {
        link = (l as Record<string, string>)["@_href"] || "";
      } else {
        link = text(l);
      }
      const raw = it.updated || it.published;
      const dt = raw ? new Date(text(raw)) : null;
      out.push({
        item: { headline: title, source: feedTitle, sourceUrl: domain, date: dt && !isNaN(dt.getTime()) ? dt.toISOString() : null, link },
        hay: (title + " " + (text(it.summary) || text(it.content))).toLowerCase(),
      });
    }
  }
  return out;
}

// domain -> that site's recent blog posts, topic-relevant first. Cached per domain.
export async function fetchSiteFeed(domain: string, topic: string, limit = 6): Promise<NewsItem[]> {
  const key = domain.toLowerCase();
  const cached = cache.get(key);
  let parsed: Parsed[];
  if (cached && Date.now() - cached.at < TTL) {
    parsed = cached.parsed;
  } else {
    const url = await discoverFeedUrl(domain);
    const res = url ? await tryFetch(url) : null;
    parsed = res ? parseFeed(await res.text(), domain) : [];
    cache.set(key, { at: Date.now(), parsed });
  }
  if (!parsed.length) return [];

  const tokens = topic.toLowerCase().split(/\s+/).filter((w) => w.length >= 3);
  const matches = (hay: string) => tokens.length === 0 || tokens.some((t) => hay.includes(t));
  return [...parsed]
    .sort((a, b) => {
      const d = (matches(b.hay) ? 1 : 0) - (matches(a.hay) ? 1 : 0);
      return d || (b.item.date || "").localeCompare(a.item.date || "");
    })
    .slice(0, limit)
    .map((x) => x.item);
}
