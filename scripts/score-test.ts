// Step 6 test: fetch a few sources, tag + junk-filter + score each article.
// Shows the /100 score, breakdown, keep/drop and reason. Run: npx tsx scripts/score-test.ts
import { XMLParser } from "fast-xml-parser";
import { SOURCES } from "../data/sources";
import { tagArticle } from "../lib/tag";
import { scoreArticle } from "../lib/score";

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

function stripTags(s: string): string {
  return s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function titleOf(it: any): string {
  return stripTags(text(it.title));
}

function summaryOf(it: any): string {
  const raw = it.description ?? it["content:encoded"] ?? it.summary ?? it.content ?? "";
  return stripTags(text(raw)).slice(0, 400);
}

// Atom <link href="..."> is an object (or array); RSS <link> is a plain string.
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

const TEST_SOURCES = [
  "Semiconductor Engineering",
  "IEEE Spectrum – Semiconductors",
  "The Chip Letter",
  "Tom's Hardware",
  "DIGITIMES",
];

async function main() {
  let kept = 0;
  let dropped = 0;
  const dropReasons: Record<string, number> = {};

  for (const name of TEST_SOURCES) {
    const src = SOURCES.find((s) => s.name === name);
    if (!src) continue;
    let items: any[] = [];
    try {
      const res = await fetch(src.feed, {
        headers: { "User-Agent": "AvsarNewsBot/1.0" },
        signal: AbortSignal.timeout(15000),
      });
      items = itemsOf(parser.parse(await res.text()));
    } catch {
      console.log(`(skip ${name}: fetch error)`);
      continue;
    }

    console.log("\n=== " + name + " ===");
    for (const it of items.slice(0, 8)) {
      const title = titleOf(it);
      const tag = tagArticle(title, summaryOf(it));
      if (!tag) {
        dropped++;
        dropReasons["off-topic (no tag)"] = (dropReasons["off-topic (no tag)"] || 0) + 1;
        console.log(`  DROP  --  off-topic (no tag)         | ${title.slice(0, 52)}`);
        continue;
      }
      const r = scoreArticle({
        title,
        summary: summaryOf(it),
        link: linkOf(it),
        publishedAt: dateOf(it),
        tier: src.tier,
        tag,
      });
      const b = r.breakdown;
      const line = `R${b.relevance} T${b.trust} E${b.educational} F${b.freshness}${r.rumor ? " -8rumor" : ""}`;
      if (r.keep) {
        kept++;
        console.log(
          `  KEEP ${String(r.score).padStart(3)} ${tag.moduleName.slice(0, 16).padEnd(16)} ${line.padEnd(22)}| ${title.slice(0, 46)}`
        );
      } else {
        dropped++;
        dropReasons[r.drop!] = (dropReasons[r.drop!] || 0) + 1;
        console.log(
          `  DROP ${String(r.score).padStart(3)} ${r.drop!.padEnd(16)} ${line.padEnd(22)}| ${title.slice(0, 46)}`
        );
      }
    }
  }

  console.log("\n" + "-".repeat(60));
  console.log(`Kept: ${kept}   Dropped: ${dropped}`);
  console.log("Drop reasons:");
  for (const [k, v] of Object.entries(dropReasons).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(24)} ${v}`);
  }
}

main().catch((e) => console.error("FATAL:", e));
