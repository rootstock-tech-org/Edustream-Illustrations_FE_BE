// Step 9: keep data/news.json fresh. Builds once now, then every 10 minutes.
// Leave it running in a terminal. Stop with Ctrl+C. Run: npx tsx scripts/refresh-loop.ts
import { saveNews } from "../lib/store";

const EVERY_MIN = 10;

async function refresh() {
  const time = new Date().toLocaleTimeString();
  try {
    const s = await saveNews();
    if (s.skipped) {
      console.log(`[${time}] fetch returned 0 - kept last good store (${s.count} articles)`);
    } else {
      console.log(`[${time}] wrote ${s.count} articles (${s.withImage} with image) in ${s.secs}s`);
    }
  } catch (e: any) {
    console.error(`[${time}] refresh failed: ${e?.message || e}`);
  }
}

async function main() {
  console.log(`News refresh loop started. Rebuilding every ${EVERY_MIN} min. Ctrl+C to stop.\n`);
  await refresh(); // build immediately on start
  setInterval(refresh, EVERY_MIN * 60 * 1000);
}

main();
