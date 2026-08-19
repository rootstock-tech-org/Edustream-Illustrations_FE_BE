// Step 3: read ONE source's RSS feed and print its articles.
// Run:  node scripts/fetch-one.mjs
import { XMLParser } from "fast-xml-parser";

// The one source we test first.
const SOURCE = { name: "Semiconductor Engineering", feed: "https://semiengineering.com/feed/" };

// Pull an image URL out of a feed item (feeds put it in different places).
function findImage(item) {
  if (item.enclosure?.["@_url"]) return item.enclosure["@_url"];
  if (item["media:content"]?.["@_url"]) return item["media:content"]["@_url"];
  if (item["media:thumbnail"]?.["@_url"]) return item["media:thumbnail"]["@_url"];
  const html = String(item["content:encoded"] || item.description || "");
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return m ? m[1] : null;
}

async function main() {
  console.log(`Fetching: ${SOURCE.name}\n${SOURCE.feed}\n`);

  const res = await fetch(SOURCE.feed, { headers: { "User-Agent": "AvsarNewsBot/1.0" } });
  console.log(`HTTP status: ${res.status}\n`);
  const xml = await res.text();

  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
  const data = parser.parse(xml);

  const raw = data?.rss?.channel?.item ?? [];
  const items = Array.isArray(raw) ? raw : [raw];
  console.log(`Total articles in feed: ${items.length}\n`);

  // Print the first 8 so it's easy to eyeball.
  items.slice(0, 8).forEach((it, i) => {
    const img = findImage(it);
    console.log(`${i + 1}. ${String(it.title || "").trim()}`);
    console.log(`   date : ${it.pubDate || "-"}`);
    console.log(`   link : ${it.link || "-"}`);
    console.log(`   image: ${img ? img : "(none)"}`);
    console.log("");
  });
}

main().catch((e) => console.error("ERROR:", e.message));
