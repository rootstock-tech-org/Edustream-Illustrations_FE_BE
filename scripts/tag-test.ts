// Step 5 test: fetch a few sources, tag every article, print article -> module.
// Shows how many articles got tagged vs dropped (off-topic).
// Run:  npx tsx scripts/tag-test.ts
import { XMLParser } from "fast-xml-parser";
import { SOURCES } from "../data/sources";
import { tagArticle } from "../lib/tag";

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

// Pull plain text out of a field that may be a string or an object like { "#text": ... }.
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

// Test on a small, varied mix so we can eyeball tagging quality.
const TEST_SOURCES = [
  "Semiconductor Engineering",
  "IEEE Spectrum – Semiconductors",
  "The Chip Letter",
  "Tom's Hardware",
  "DIGITIMES",
];

async function main() {
  let tagged = 0;
  let dropped = 0;
  const perModule: Record<string, number> = {};

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
      if (tag) {
        tagged++;
        perModule[tag.moduleName] = (perModule[tag.moduleName] || 0) + 1;
        console.log(
          `  [${String(tag.score).padStart(2)}] ${tag.moduleName.padEnd(22)} | ${title.slice(0, 60)}`
        );
        console.log(`       matched: ${tag.matched.slice(0, 5).join(", ")}`);
      } else {
        dropped++;
        console.log(`  [DROP] off-topic            | ${title.slice(0, 60)}`);
      }
    }
  }

  console.log("\n" + "-".repeat(60));
  console.log(`Tagged: ${tagged}   Dropped (off-topic): ${dropped}`);
  console.log("Per module:");
  for (const [m, c] of Object.entries(perModule).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${m.padEnd(24)} ${c}`);
  }
}

main().catch((e) => console.error("FATAL:", e));
