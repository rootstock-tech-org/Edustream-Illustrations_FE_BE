// Build the final news list for the dashboard from the saved config:
// fetch the topic's news, keep only the chosen sources, remove duplicates, and
// put keyword-matching stories first, then newest.
import { fetchGoogleNews, resolveSourceDomain, type NewsItem } from "./googleNews";
import { regionOpts } from "./regions";
import { getTopicMemory } from "./memory";
import { NON_NEWS } from "./sources";
import type { AppConfig } from "./config";

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

// Something that looks like a domain (e.g. "huggingface.co") is used directly;
// a plain name (e.g. "The Verge") is resolved to its domain first.
const looksLikeDomain = (s: string) =>
  /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(s.trim()) && !/\s/.test(s.trim());
const cleanHost = (s: string) =>
  s.trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0];

export async function buildDashboardNews(cfg: AppConfig, limit = 40): Promise<NewsItem[]> {
  const opts = regionOpts(cfg.region);
  const items = await fetchGoogleNews(cfg.topic, opts);

  // Honour the same curation as the Sources screen: never show sources the user
  // removed there. With a saved selection we filter to it; without one, we mirror
  // the curated list (real-news sources that were not removed) instead of showing
  // everything.
  const removed = new Set(getTopicMemory(cfg.topic).removedSources.map((s) => norm(s)));
  const selectedSet = new Set(cfg.sources.map((s) => norm(s)));
  let pool = cfg.sources.length
    ? items.filter((i) => selectedSet.has(norm(i.source)))
    : items.filter((i) => !removed.has(norm(i.source)) && !NON_NEWS.has(i.source.toLowerCase()));

  // Any selected source that did not show up in the main results is pulled in
  // directly: a domain (e.g. huggingface.co) is queried via Google News `site:`,
  // and a plain name (e.g. The Verge) is first resolved to its domain. This lets
  // any added source contribute its stories on this topic.
  if (cfg.sources.length) {
    const present = new Set(items.map((i) => norm(i.source)));
    const missing = cfg.sources.filter((s) => !present.has(norm(s))).slice(0, 5);
    if (missing.length) {
      const extra = await Promise.all(
        missing.map(async (s) => {
          const domain = looksLikeDomain(s) ? cleanHost(s) : await resolveSourceDomain(s, opts);
          if (!domain) return [] as NewsItem[];
          return fetchGoogleNews(`${cfg.topic} site:${domain}`, opts)
            .then((list) => list.slice(0, 10))
            .catch(() => [] as NewsItem[]);
        })
      );
      pool = pool.concat(...extra);
    }
  }

  // A source removed on the Sources screen must never appear in the news.
  pool = pool.filter((i) => !removed.has(norm(i.source)));

  // Remove duplicate headlines.
  const seen = new Set<string>();
  const deduped: NewsItem[] = [];
  for (const i of pool) {
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
