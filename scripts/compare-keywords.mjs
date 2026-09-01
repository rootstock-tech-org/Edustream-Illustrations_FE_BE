// Cross-check: does the compromise noun filter actually remove irrelevant
// (non-noun) keywords, across many topics? Prints, per topic, the plain
// frequency list vs the noun-only list, and which words got filtered out.
// Run: node scripts/compare-keywords.mjs
import { XMLParser } from "fast-xml-parser";
import nlp from "compromise";

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

// Minimal stopwords in BOTH methods, so any extra removal is due to the noun
// filter alone (a fair comparison).
const STOP = new Set("the a an and or to of in on for with at by is are was were from as that this be it its".split(" "));

async function headlines(topic) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(topic)}&hl=en-US&gl=US&ceid=US:en`;
  const res = await fetch(url, { headers: { "User-Agent": "cmp/1.0" } });
  const data = parser.parse(await res.text());
  const raw = data?.rss?.channel?.item ?? [];
  const items = Array.isArray(raw) ? raw : [raw];
  return items.map((it) => {
    const t = typeof it.title === "string" ? it.title : it.title?.["#text"] ?? "";
    const src = typeof it.source === "string" ? it.source : it.source?.["#text"] ?? "";
    return src && t.endsWith(` - ${src}`) ? t.slice(0, -(src.length + 3)) : t;
  });
}

function topWords(tokens, topicWords, limit = 15) {
  const c = new Map();
  for (const w of tokens) {
    if (STOP.has(w) || topicWords.has(w)) continue;
    c.set(w, (c.get(w) ?? 0) + 1);
  }
  return [...c.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([w]) => w);
}

async function run(topic) {
  const hs = await headlines(topic);
  const topicWords = new Set(topic.toLowerCase().split(/\s+/));

  const allTokens = [];
  const nounTokens = [];
  for (const h of hs) {
    for (const w of h.toLowerCase().match(/[a-z][a-z'-]{2,}/g) || []) allTokens.push(w);
    const spans = nlp(h).match("#Noun").not("#Pronoun").out("array");
    for (const span of spans) for (const w of span.toLowerCase().match(/[a-z][a-z'-]{2,}/g) || []) nounTokens.push(w);
  }

  const allTop = topWords(allTokens, topicWords);
  const nounTop = topWords(nounTokens, topicWords);
  const removed = allTop.filter((w) => !nounTop.includes(w));

  console.log(`\n=== ${topic} (${hs.length} headlines) ===`);
  console.log(`  plain frequency : ${allTop.join(", ")}`);
  console.log(`  noun-only (new) : ${nounTop.join(", ")}`);
  console.log(`  filtered out    : ${removed.length ? removed.join(", ") : "(none)"}`);
}

const topics = ["Sports", "cricket", "politics", "artificial intelligence", "stock market", "elections"];
for (const t of topics) {
  await run(t);
  await new Promise((r) => setTimeout(r, 800));
}
