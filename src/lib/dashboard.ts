// Build the final news list for the dashboard from the saved config:
// fetch the topic's news, keep only the chosen sources, remove duplicates, and
// put keyword-matching stories first, then newest.
import { fetchGoogleNews, type NewsItem } from "./googleNews";
import { regionOpts } from "./regions";
import type { AppConfig } from "./config";

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

export async function buildDashboardNews(cfg: AppConfig, limit = 40): Promise<NewsItem[]> {
  const items = await fetchGoogleNews(cfg.topic, regionOpts(cfg.region));

  // Keep only the sources the user selected (if they kept any).
  const bySource = cfg.sources.length ? items.filter((i) => cfg.sources.includes(i.source)) : items;

  // Remove duplicate headlines.
  const seen = new Set<string>();
  const deduped: NewsItem[] = [];
  for (const i of bySource) {
    const k = norm(i.headline);
    if (seen.has(k)) continue;
    seen.add(k);
    deduped.push(i);
  }

  // Keyword-matching stories first, then newest.
  const kws = cfg.keywords.map((k) => k.toLowerCase());
  const hasKw = (i: NewsItem) => kws.some((k) => i.headline.toLowerCase().includes(k));
  deduped.sort(
    (a, b) => Number(hasKw(b)) - Number(hasKw(a)) || (b.date || "").localeCompare(a.date || "")
  );

  return deduped.slice(0, limit);
}
