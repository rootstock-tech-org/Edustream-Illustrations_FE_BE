// Builds the news and writes it to data/news.json. Shared by the one-shot
// build script and the refresh loop so the write logic lives in one place.
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { buildNews } from "./pipeline";

export type SaveSummary = {
  count: number;
  file: string;
  secs: string;
  withImage: number;
  top: number;
  low: number;
  skipped?: boolean;
};

export async function saveNews(): Promise<SaveSummary> {
  const started = Date.now();
  const articles = await buildNews();

  const dir = join(process.cwd(), "data");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "news.json");

  // Don't clobber a good store with an empty result: a transient fetch failure
  // (all sources down for one cycle) must not wipe the last good news.
  if (articles.length === 0) {
    let existing = 0;
    try {
      existing = JSON.parse(readFileSync(file, "utf8"))?.count ?? 0;
    } catch {
      existing = 0;
    }
    if (existing > 0) {
      return {
        count: existing,
        file,
        secs: ((Date.now() - started) / 1000).toFixed(1),
        withImage: 0,
        top: 0,
        low: 0,
        skipped: true,
      };
    }
  }

  const store = { generatedAt: new Date().toISOString(), count: articles.length, articles };
  writeFileSync(file, JSON.stringify(store, null, 2), "utf8");

  return {
    count: articles.length,
    file,
    secs: ((Date.now() - started) / 1000).toFixed(1),
    withImage: articles.filter((a) => a.image).length,
    top: articles[0]?.score ?? 0,
    low: articles[articles.length - 1]?.score ?? 0,
  };
}
