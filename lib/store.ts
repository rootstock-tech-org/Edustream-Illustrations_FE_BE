// Builds the news and writes it to data/news.json. Shared by the one-shot
// build script and the refresh loop so the write logic lives in one place.
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { buildNews } from "./pipeline";

export type SaveSummary = {
  count: number;
  file: string;
  secs: string;
  withImage: number;
  top: number;
  low: number;
};

export async function saveNews(): Promise<SaveSummary> {
  const started = Date.now();
  const articles = await buildNews();

  const store = { generatedAt: new Date().toISOString(), count: articles.length, articles };
  const dir = join(process.cwd(), "data");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "news.json");
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
