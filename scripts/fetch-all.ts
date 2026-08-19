// Step 4: fetch EVERY source, report which feeds work and how many articles each gives.
// Run:  npx tsx scripts/fetch-all.ts
import { XMLParser } from "fast-xml-parser";
import { SOURCES } from "../data/sources";

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

// Feeds come as RSS 2.0 (rss.channel.item), RSS 1.0 / RDF (rdf:RDF.item) or Atom (feed.entry).
function itemsOf(data: any): any[] {
  const rss = data?.rss?.channel?.item;
  if (rss) return Array.isArray(rss) ? rss : [rss];
  const rdf = data?.["rdf:RDF"]?.item; // Nature and other RSS 1.0 feeds
  if (rdf) return Array.isArray(rdf) ? rdf : [rdf];
  const atom = data?.feed?.entry;
  if (atom) return Array.isArray(atom) ? atom : [atom];
  return [];
}

async function main() {
  const results: { name: string; tier: number; status: string; count: number }[] = [];
  let total = 0;

  for (const s of SOURCES) {
    if (!s.on) continue;
    try {
      const res = await fetch(s.feed, {
        headers: { "User-Agent": "AvsarNewsBot/1.0" },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        results.push({ name: s.name, tier: s.tier, status: `HTTP ${res.status}`, count: 0 });
        continue;
      }
      const xml = await res.text();
      const items = itemsOf(parser.parse(xml));
      total += items.length;
      results.push({ name: s.name, tier: s.tier, status: items.length ? "ok" : "empty", count: items.length });
    } catch (e: any) {
      const msg = e?.name === "TimeoutError" ? "timeout" : (e?.message || "error");
      results.push({ name: s.name, tier: s.tier, status: msg.slice(0, 22), count: 0 });
    }
  }

  console.log("");
  console.log("SOURCE".padEnd(34) + "TIER  " + "STATUS".padEnd(24) + "ARTICLES");
  console.log("-".repeat(74));
  for (const r of results) {
    const mark = r.status === "ok" ? "OK " : "!! ";
    console.log(mark + r.name.padEnd(31) + `T${r.tier}   ` + r.status.padEnd(24) + r.count);
  }
  const ok = results.filter((r) => r.status === "ok").length;
  console.log("-".repeat(74));
  console.log(`Working: ${ok}/${results.length} sources   |   Total articles fetched: ${total}`);
}

main().catch((e) => console.error("FATAL:", e));
