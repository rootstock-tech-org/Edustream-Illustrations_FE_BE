// Server-side reader for the news store. Reads data/news.json fresh on each call
// so new articles from the refresh loop show up without a rebuild.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Article } from "./pipeline";

export type NewsStore = {
  generatedAt: string | null;
  count: number;
  articles: Article[];
};

export function getNews(): NewsStore {
  try {
    const file = join(process.cwd(), "data", "news.json");
    const raw = readFileSync(file, "utf8");
    const data = JSON.parse(raw);
    return {
      generatedAt: data.generatedAt ?? null,
      count: data.count ?? data.articles?.length ?? 0,
      articles: data.articles ?? [],
    };
  } catch {
    // No store yet (build-news / refresh-loop never run) -> empty, page shows a notice.
    return { generatedAt: null, count: 0, articles: [] };
  }
}
