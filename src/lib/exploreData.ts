// Shared, cached data access for the Explore page and the CSV export route.
// A tiny in-process TTL cache so the same keyword isn't re-fetched on every
// load (or when the page and the download button both need the same data).
import { fetchGoogleNews } from "../../tool/googleNews";
import { fetchPapers, type Paper } from "../../tool/papers";
import { fetchPeople, type Person } from "../../tool/people";
import { fetchComparison, type ComparisonResult } from "../../tool/comparison";

const TEN_MIN = 10 * 60 * 1000;
const HALF_HOUR = 30 * 60 * 1000;

const store = new Map<string, { at: number; data: unknown }>();

async function cached<T>(key: string, ttl: number, fn: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.data as T;
  const data = await fn();
  store.set(key, { at: Date.now(), data });
  return data;
}

const norm = (q: string) => q.trim().toLowerCase();

export function getNews(q: string) {
  return cached(`news:${norm(q)}`, TEN_MIN, () => fetchGoogleNews(q, { when: "7d" }));
}

export function getPapersAndPeople(q: string): Promise<{ papers: Paper[]; people: Person[] }> {
  return cached(`pp:${norm(q)}`, TEN_MIN, async () => {
    const papers = await fetchPapers(q);
    const people = await fetchPeople(papers, q);
    return { papers, people };
  });
}

export function getComparison(q: string): Promise<ComparisonResult> {
  return cached(`cmp:${norm(q)}`, HALF_HOUR, () => fetchComparison(q));
}
