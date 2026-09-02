// Discover which news sources actually cover a topic, by fetching it from
// Google News and counting the distinct sources that show up. The user then
// keeps or removes these on the Sources step.
import { fetchGoogleNews } from "./googleNews";
import { regionOpts } from "./regions";

export type DiscoveredSource = { name: string; count: number };

// Social / aggregator domains that are not real news sources.
export const NON_NEWS = new Set([
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

  // Show every real-news publisher that actually appeared for this topic,
  // strongest (most stories) first. Social/aggregator domains are already
  // filtered out above, so the list stays relevant while being much richer
  // than the old count>=2 cutoff. Capped so it stays manageable.
  return sorted.slice(0, 40);
}
