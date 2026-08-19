// Step 7 test: pool many sources, tag + score + keep, then dedupe.
// Reports how many kept articles collapsed into unique stories, and shows any
// story that was covered by 2+ sources. Run: npx tsx scripts/dedup-test.ts
import { XMLParser } from "fast-xml-parser";
import { SOURCES } from "../data/sources";
import { tagArticle } from "../lib/tag";
import { scoreArticle } from "../lib/score";
import { dedupeArticles, DedupItem } from "../lib/dedup";

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

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
const stripTags = (s: string) => s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const titleOf = (it: any) => stripTags(text(it.title));
function summaryOf(it: any): string {
  const raw = it.description ?? it["content:encoded"] ?? it.summary ?? it.content ?? "";
  return stripTags(text(raw)).slice(0, 400);
}
function linkOf(it: any): string {
  if (typeof it.link === "string") return it.link;
  if (Array.isArray(it.link)) return it.link[0]?.["@_href"] || text(it.link[0]);
  if (it.link && typeof it.link === "object") return it.link["@_href"] || "";
  return text(it.guid) || "";
}
function dateOf(it: any): Date | null {
  const raw = it.pubDate ?? it["dc:date"] ?? it.published ?? it.updated ?? null;
  if (!raw) return null;
  const d = new Date(text(raw));
  return isNaN(d.getTime()) ? null : d;
}

type Kept = DedupItem & { module: string };

async function main() {
  const kept: Kept[] = [];

  for (const src of SOURCES.filter((s) => s.on)) {
    let items: any[] = [];
    try {
      const res = await fetch(src.feed, {
        headers: { "User-Agent": "AvsarNewsBot/1.0" },
        signal: AbortSignal.timeout(15000),
      });
      items = itemsOf(parser.parse(await res.text()));
    } catch {
      continue;
    }
    for (const it of items.slice(0, 25)) {
      const title = titleOf(it);
      const summary = summaryOf(it);
      const tag = tagArticle(title, summary);
      if (!tag) continue;
      const r = scoreArticle({ title, summary, link: linkOf(it), publishedAt: dateOf(it), tier: src.tier, tag });
      if (!r.keep) continue;
      kept.push({ title, source: src.name, tier: src.tier, score: r.score, module: tag.moduleName });
    }
  }

  const clusters = dedupeArticles(kept);
  const dupes = clusters.filter((c) => c.count > 1).sort((a, b) => b.count - a.count);

  console.log(`\nKept articles (before dedup): ${kept.length}`);
  console.log(`Unique stories (after dedup): ${clusters.length}`);
  console.log(`Duplicate stories merged:     ${kept.length - clusters.length}`);

  console.log(`\nStories covered by 2+ sources (${dupes.length}):`);
  for (const c of dupes) {
    console.log(`\n  [${c.count} sources] ${c.rep.title.slice(0, 70)}`);
    console.log(`     shown from: ${c.rep.source} (T${c.rep.tier}, score ${c.rep.score})`);
    console.log(`     also: ${c.sources.slice(1).join(", ")}`);
  }
}

main().catch((e) => console.error("FATAL:", e));
