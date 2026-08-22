// The full news pipeline in one place: fetch every source -> extract -> tag ->
// score + junk-filter -> dedupe -> sort (best first). Scripts and the website
// both call buildNews() so the logic lives in exactly one file.
import { XMLParser } from "fast-xml-parser";
import { SOURCES, Source } from "../data/sources";
import { tagArticle } from "./tag";
import { scoreArticle } from "./score";
import { dedupeArticles, DedupItem } from "./dedup";

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

export type Article = {
  title: string;
  link: string;
  image: string | null;
  summary: string;
  source: string; // source we show it from (best of the cluster)
  sources: string[]; // every source that ran the story
  sourceCount: number;
  moduleId: string;
  module: string;
  score: number;
  rumor: boolean;
  publishedAt: string | null; // ISO string
};

function itemsOf(data: any): any[] {
  const rss = data?.rss?.channel?.item;
  if (rss) return Array.isArray(rss) ? rss : [rss];
  const rdf = data?.["rdf:RDF"]?.item;
  if (rdf) return Array.isArray(rdf) ? rdf : [rdf];
  const atom = data?.feed?.entry;
  if (atom) return Array.isArray(atom) ? atom : [atom];
  return [];
}

function text(v: any): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object") return v["#text"] || v["@_href"] || "";
  return String(v);
}

const stripTags = (s: string) => decodeEntities(s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
const titleOf = (it: any) => stripTags(text(it.title));

// RSS titles/links often carry HTML entities (&#8217; &amp; &#038;). Decode them
// so the UI shows real punctuation and links aren't double-encoded.
function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function rawSummaryHtml(it: any): string {
  return text(it.description ?? it["content:encoded"] ?? it.summary ?? it.content ?? "");
}
const summaryOf = (it: any) => stripTags(rawSummaryHtml(it)).slice(0, 400);

function linkOf(it: any): string {
  let link = "";
  if (typeof it.link === "string") link = it.link;
  else if (Array.isArray(it.link)) link = it.link[0]?.["@_href"] || text(it.link[0]);
  else if (it.link && typeof it.link === "object") link = it.link["@_href"] || "";
  else link = text(it.guid) || "";
  return decodeEntities(link);
}

function dateOf(it: any): Date | null {
  const raw = it.pubDate ?? it["dc:date"] ?? it.published ?? it.updated ?? null;
  if (!raw) return null;
  const d = new Date(text(raw));
  if (isNaN(d.getTime())) return null;
  // Reject future-dated entries (e.g. upcoming-webinar items). Otherwise they show
  // "just now" forever and grab the max freshness boost, hogging the hero.
  if (d.getTime() > Date.now() + 24 * 3_600_000) return null;
  return d;
}

// Try the common RSS/Atom image spots, then fall back to the first <img> in the body.
function imageOf(it: any): string | null {
  const first = (v: any): any => (Array.isArray(v) ? v[0] : v);
  const enc = first(it.enclosure);
  if (enc?.["@_url"] && String(enc["@_type"] || "").startsWith("image")) return enc["@_url"];
  if (enc?.["@_url"] && !it.enclosure?.["@_type"]) {
    if (/\.(jpg|jpeg|png|webp|gif)/i.test(enc["@_url"])) return enc["@_url"];
  }
  const media = first(it["media:content"]);
  if (media?.["@_url"]) return media["@_url"];
  const thumb = first(it["media:thumbnail"]);
  if (thumb?.["@_url"]) return thumb["@_url"];
  const m = rawSummaryHtml(it).match(/<img[^>]+src=["']([^"']+)["']/i);
  return m ? m[1] : null;
}

async function fetchSource(src: Source): Promise<any[]> {
  try {
    const res = await fetch(src.feed, {
      headers: { "User-Agent": "AvsarNewsBot/1.0" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return [];
    return itemsOf(parser.parse(await res.text()));
  } catch {
    return [];
  }
}

// --- og:image enrichment ---------------------------------------------------
// Articles whose RSS entry carried no image are enriched by fetching the
// article page and reading its <meta property="og:image"> (the same picture a
// link preview shows). Caches persist for the life of the refresh-loop process
// so each article page is fetched at most once (later cycles reuse the result).
const ogCache = new Map<string, string>(); // link -> found image URL
const ogTried = new Set<string>(); // links already attempted (found or not)

function parseOgImage(html: string): string | null {
  const metas = [
    /<meta[^>]+property=["']og:image(?::url)?["'][^>]*>/i,
    /<meta[^>]+name=["']og:image["'][^>]*>/i,
    /<meta[^>]+name=["']twitter:image["'][^>]*>/i,
    /<meta[^>]+property=["']twitter:image["'][^>]*>/i,
  ];
  for (const re of metas) {
    const tag = html.match(re);
    if (!tag) continue;
    const c = tag[0].match(/content=["']([^"']+)["']/i);
    if (c?.[1]) return c[1].trim();
  }
  return null;
}

async function fetchOgImage(link: string): Promise<string | null> {
  try {
    const res = await fetch(link, {
      headers: { "User-Agent": "AvsarNewsBot/1.0" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    if (!(res.headers.get("content-type") || "").includes("html")) return null;
    const html = (await res.text()).slice(0, 200_000); // og tags live in <head>
    const img = parseOgImage(html);
    if (!img) return null;
    return new URL(img, link).href; // resolve any relative URL against the page
  } catch {
    return null;
  }
}

// Fill image === null articles with their page's og:image, capped concurrency.
async function enrichImages(articles: Article[]): Promise<void> {
  const need: Article[] = [];
  for (const a of articles) {
    if (a.image || !a.link) continue;
    if (ogCache.has(a.link)) {
      a.image = ogCache.get(a.link)!; // reuse result from an earlier cycle
      continue;
    }
    if (ogTried.has(a.link)) continue; // tried before, none found -> stay text-only
    need.push(a);
  }
  if (need.length === 0) return;

  let idx = 0;
  const worker = async () => {
    while (idx < need.length) {
      const a = need[idx++];
      ogTried.add(a.link);
      const img = await fetchOgImage(a.link);
      if (img) {
        ogCache.set(a.link, img);
        a.image = img;
      }
    }
  };
  const LIMIT = 8;
  await Promise.all(Array.from({ length: Math.min(LIMIT, need.length) }, worker));
}

type Kept = DedupItem & Omit<Article, "sources" | "sourceCount">;

export async function buildNews(): Promise<Article[]> {
  const on = SOURCES.filter((s) => s.on);
  const feeds = await Promise.all(on.map((s) => fetchSource(s)));

  const kept: Kept[] = [];
  on.forEach((src, i) => {
    for (const it of feeds[i]) {
      const title = titleOf(it);
      if (!title) continue;
      const summary = summaryOf(it);
      const tag = tagArticle(title, summary);
      if (!tag) continue;
      const link = linkOf(it);
      const published = dateOf(it);
      const r = scoreArticle({ title, summary, link, publishedAt: published, tier: src.tier, tag });
      if (!r.keep) continue;
      kept.push({
        title,
        link,
        image: imageOf(it),
        summary,
        source: src.name,
        tier: src.tier,
        moduleId: tag.moduleId,
        module: tag.moduleName,
        score: r.score,
        rumor: r.rumor,
        publishedAt: published ? published.toISOString() : null,
      });
    }
  });

  const clusters = dedupeArticles(kept);

  const articles: Article[] = clusters.map((c) => ({
    title: c.rep.title,
    link: c.rep.link,
    image: c.rep.image,
    summary: c.rep.summary,
    source: c.rep.source,
    sources: c.sources,
    sourceCount: c.count,
    moduleId: c.rep.moduleId,
    module: c.rep.module,
    score: c.rep.score,
    rumor: c.rep.rumor,
    publishedAt: c.rep.publishedAt,
  }));

  // Hybrid ranking: relevance score + a freshness boost that decays with age,
  // so today's stories lead (attractive/recent) while junk is still filtered out
  // and among fresh items the more relevant one wins.
  articles.sort((a, b) => {
    const ra = a.score + freshnessBoost(a.publishedAt);
    const rb = b.score + freshnessBoost(b.publishedAt);
    if (rb !== ra) return rb - ra;
    return (b.publishedAt || "").localeCompare(a.publishedAt || "");
  });

  // Pull an og:image for articles the feed gave no picture for, before the
  // dedupe pass below so a fetched image can't repeat one already in use.
  await enrichImages(articles);

  // Show each image only once: the top-ranked article with a given image keeps
  // it; later articles that reuse the same image render text-only (no repeats).
  const seenImages = new Set<string>();
  for (const a of articles) {
    if (!a.image) continue;
    if (seenImages.has(a.image)) a.image = null;
    else seenImages.add(a.image);
  }

  return articles;
}

function freshnessBoost(iso: string | null): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  if (isNaN(t)) return 0;
  const hrs = (Date.now() - t) / 3_600_000;
  if (hrs < 6) return 40;
  if (hrs < 24) return 30;
  if (hrs < 72) return 18; // 3 days
  if (hrs < 168) return 8; // 7 days
  if (hrs < 720) return 2; // 30 days
  return 0;
}
