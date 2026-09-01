// Discover which news sources actually cover a topic, by fetching it from
// Google News and counting the distinct sources that show up. The user then
// keeps or removes these on the Sources step.
import { fetchGoogleNews } from "./googleNews";
import { regionOpts } from "./regions";

export type DiscoveredSource = { name: string; count: number };

// Social / aggregator domains that are not real news sources.
const NON_NEWS = new Set([
  "facebook.com", "twitter.com", "x.com", "youtube.com", "reddit.com",
  "instagram.com", "tiktok.com", "linkedin.com", "pinterest.com",
]);

// topic -> distinct sources that cover it, most frequent first.
export async function discoverSources(topic: string, region?: string): Promise<DiscoveredSource[]> {
  const items = await fetchGoogleNews(topic, regionOpts(region));
  const counts = new Map<string, number>();
  for (const it of items) {
    const name = it.source.trim();
    if (!name || NON_NEWS.has(name.toLowerCase())) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const sorted = [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  // Sources that really cover a topic show up more than once. Drop the long
  // tail of one-off, tangential sources. If too few remain (a niche topic),
  // fall back to the top sources by count so the list is not empty.
  const strong = sorted.filter((s) => s.count >= 2);
  return strong.length >= 6 ? strong : sorted.slice(0, 12);
}
