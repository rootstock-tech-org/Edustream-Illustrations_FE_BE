// Quick test for Module A news fetch.
// Run: node node_modules/tsx/dist/cli.mjs tool/test-news.ts "quantum computing"
import { fetchGoogleNews, topHeadlines, latestNews } from "./googleNews";

async function main() {
  const kw = process.argv[2] || "quantum computing";
  const items = await fetchGoogleNews(kw, { when: "7d" });
  console.log(`"${kw}" -> ${items.length} clean items (finance/stock junk dropped)\n`);

  console.log("=== 1. TOP HEADLINES (Reuters/Bloomberg first) ===");
  for (const it of topHeadlines(items)) {
    console.log(`- ${it.headline}`);
    console.log(`  ${it.source || "?"} | ${it.date ? it.date.slice(0, 10) : "no date"}`);
  }

  console.log("\n=== 2. LATEST NEWS (newest first) ===");
  for (const it of latestNews(items)) {
    console.log(`- ${it.headline}`);
    console.log(`  ${it.source || "?"} | ${it.date ? it.date.slice(0, 10) : "no date"}`);
  }
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
