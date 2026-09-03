// Step 8: run the pipeline once and write data/news.json. Run: npx tsx scripts/build-news.ts
import { saveNews } from "../lib/store";

async function main() {
  console.log("Building news (fetch -> tag -> score -> dedupe)...");
  const s = await saveNews();
  console.log(`\nWrote ${s.count} articles to data/news.json in ${s.secs}s`);
  console.log(`With image: ${s.withImage}/${s.count}`);
  console.log(`Top score: ${s.top}   Lowest kept: ${s.low}`);
}

main().catch((e) => console.error("FATAL:", e));
