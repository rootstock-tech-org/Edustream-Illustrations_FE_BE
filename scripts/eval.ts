// Evaluation: measure each embedding feature ON vs OFF on the SAME fetched data,
// so we get real numbers (not opinions) on whether a feature helps.
// Run: node node_modules/tsx/dist/cli.mjs scripts/eval.ts
import { fetchAllFeeds, buildFromFeeds } from "../lib/pipeline";
import { semanticRank } from "../lib/semanticSearch";

// Queries phrased the way a user would, but NOT using the articles' exact words,
// so keyword search struggles and semantic search should help.
const TEST_QUERIES = [
  "chip cooling",
  "making transistors smaller",
  "energy efficient chips",
  "stacking chips in 3D",
  "chip supply shortage",
  "AI accelerator hardware",
];

// Same word-match rule the /search page uses.
function keywordMatches<T extends { title: string; summary?: string; module?: string }>(articles: T[], query: string): T[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return articles.filter((a) => {
    const hay = `${a.title} ${a.module ?? ""} ${a.summary ?? ""}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

async function main() {
  console.log("Fetching feeds once (same input for every comparison)...\n");
  const { on, feeds } = await fetchAllFeeds();

  // --- Feature 1: meaning-based rescue (dedup + enrich off to isolate it) ---
  const off = await buildFromFeeds(on, feeds, { rescue: false, meaningDedup: false, enrich: false });
  const onR = await buildFromFeeds(on, feeds, { rescue: true, meaningDedup: false, enrich: false });

  const offLinks = new Set(off.map((a) => a.link));
  const rescued = onR.filter((a) => !offLinks.has(a.link));

  console.log("=== FEATURE 1: Meaning-based rescue ===");
  console.log(`  Rescue OFF : ${off.length} articles`);
  console.log(`  Rescue ON  : ${onR.length} articles  (+${rescued.length} recovered)`);
  console.log(`  Meaning: ${rescued.length} good articles that keyword tagging dropped were recovered.\n`);
  console.log("  Sample of recovered articles:");
  for (const a of rescued.slice(0, 12)) {
    console.log(`    - [${a.module}] ${a.title.slice(0, 72)}`);
  }

  // --- Feature 2: meaning-based dedup (rescue OFF on both sides to isolate it,
  // so the rescue budget/cache can't drift the counts between runs) ---
  const dedupOn = await buildFromFeeds(on, feeds, { rescue: false, meaningDedup: true, enrich: false });
  const removed = off.length - dedupOn.length;

  console.log("\n=== FEATURE 2: Meaning-based dedup ===");
  console.log(`  Word-dedup only      : ${off.length} articles`);
  console.log(`  Word + meaning dedup : ${dedupOn.length} articles  (-${removed} merged)`);
  console.log(`  Meaning: ${removed} same-story duplicate(s) written in different words were merged into one.`);

  // --- Feature 3: semantic search (keyword-only vs keyword + meaning) ---
  const articles = await buildFromFeeds(on, feeds, { enrich: false }); // realistic feed
  console.log("\n=== FEATURE 3: Semantic search ===");
  let totalKw = 0;
  let totalAdded = 0;
  for (const q of TEST_QUERIES) {
    const kw = keywordMatches(articles, q);
    const kwLinks = new Set(kw.map((a) => a.link));
    const added = (await semanticRank(q, articles, 0.4)).filter((s) => !kwLinks.has(s.item.link));
    totalKw += kw.length;
    totalAdded += added.length;
    console.log(`  "${q}": keyword ${kw.length}  ->  semantic +${added.length} more relevant`);
  }
  console.log(
    `  Total across ${TEST_QUERIES.length} queries: keyword found ${totalKw}, semantic added ${totalAdded} extra relevant results the keyword search missed.`
  );
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
