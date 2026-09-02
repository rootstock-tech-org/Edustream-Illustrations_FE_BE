// Track keyword frequency snapshots per topic over time, so we can show which
// keywords are rising / falling / newly appearing. Snapshots are written when
// news is fetched (throttled) and stored in data/trends/ (gitignored).
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

type Snapshot = { at: number; counts: Record<string, number> };
export type TrendWord = { word: string; now: number; prev: number; delta: number };
export type Trends = {
  hasHistory: boolean;
  rising: TrendWord[];
  falling: TrendWord[];
  fresh: string[];
  current: { word: string; count: number }[];
  from?: number;
  to?: number;
};

const DIR = join(process.cwd(), "data", "trends");
const slug = (t: string) => t.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "topic";
const fileOf = (topic: string) => join(DIR, `${slug(topic)}.json`);

const STOP = new Set([
  "the", "and", "for", "with", "from", "that", "this", "will", "have", "has", "are", "was", "were",
  "new", "says", "said", "after", "over", "into", "amid", "your", "you", "how", "what", "why", "when",
  "more", "most", "than", "then", "its", "his", "her", "their", "they", "not", "but", "out", "off",
  "about", "against", "back", "here", "there", "now", "top", "best", "first", "last", "day", "days",
  "week", "year", "years", "news", "report", "update", "latest",
]);

function read(topic: string): Snapshot[] {
  const f = fileOf(topic);
  if (!existsSync(f)) return [];
  try {
    return JSON.parse(readFileSync(f, "utf8")) as Snapshot[];
  } catch {
    return [];
  }
}

function write(topic: string, snaps: Snapshot[]): void {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(fileOf(topic), JSON.stringify(snaps, null, 2), "utf8");
}

// Document frequency of significant words across the given headlines.
export function countKeywords(headlines: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const h of headlines) {
    const seen = new Set<string>();
    for (const w of h.toLowerCase().match(/[a-z][a-z'-]{3,}/g) || []) {
      if (STOP.has(w) || seen.has(w)) continue;
      seen.add(w);
      counts[w] = (counts[w] || 0) + 1;
    }
  }
  return counts;
}

// Append a snapshot, at most once every 45 minutes, keeping the last 50.
export function recordSnapshot(topic: string, counts: Record<string, number>): void {
  if (!topic || Object.keys(counts).length === 0) return;
  const snaps = read(topic);
  const last = snaps[snaps.length - 1];
  if (last && Date.now() - last.at < 45 * 60 * 1000) return;
  snaps.push({ at: Date.now(), counts });
  write(topic, snaps.slice(-50));
}

// Compare the newest snapshot against the oldest in the window.
export function getTrends(topic: string, limit = 8): Trends {
  const snaps = read(topic);
  const cur = snaps[snaps.length - 1];
  const current = cur
    ? Object.entries(cur.counts).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([word, count]) => ({ word, count }))
    : [];
  if (snaps.length < 2 || !cur) return { hasHistory: false, rising: [], falling: [], fresh: [], current };

  const prev = snaps[0];
  const words = new Set([...Object.keys(cur.counts), ...Object.keys(prev.counts)]);
  const rows: TrendWord[] = [];
  const fresh: string[] = [];
  for (const w of words) {
    const now = cur.counts[w] || 0;
    const p = prev.counts[w] || 0;
    if (p === 0 && now >= 2) fresh.push(w);
    rows.push({ word: w, now, prev: p, delta: now - p });
  }
  const rising = rows.filter((r) => r.delta > 0 && r.prev > 0).sort((a, b) => b.delta - a.delta).slice(0, limit);
  const falling = rows.filter((r) => r.delta < 0 && r.now > 0).sort((a, b) => a.delta - b.delta).slice(0, limit);
  return { hasHistory: true, rising, falling, fresh: fresh.slice(0, limit), current, from: prev.at, to: cur.at };
}
