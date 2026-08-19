// Step 7: merge the SAME story coming from multiple sources into one entry.
// Two titles are "the same story" if their important words overlap >= 60%.
// The kept entry (rep) is the highest-tier / highest-score one; the rest become
// its `alsoFrom` sources so the UI can show a "covered by N sources" badge.
export type DedupItem = {
  title: string;
  source: string;
  tier: 1 | 2;
  score: number;
  // pass-through payload we don't inspect here (link, image, module, date, etc.)
  [key: string]: unknown;
};

export type Cluster<T extends DedupItem = DedupItem> = {
  rep: T; // the article we actually show
  sources: string[]; // every source that ran this story (rep first)
  count: number; // sources.length
};

const THRESHOLD = 0.6;

// Words too common to help tell two stories apart.
const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "for", "to", "of", "in", "on", "at", "by", "with",
  "from", "as", "is", "are", "be", "into", "its", "it", "this", "that", "new", "how",
  "why", "what", "will", "can", "could", "may", "vs", "amid", "over", "up", "down",
  "out", "off", "not", "no", "but", "than", "then", "now", "more", "less", "you",
  "your", "our", "we", "they", "their",
]);

function significantWords(title: string): Set<string> {
  const words = title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
  return new Set(words);
}

// overlap = shared words / size of the smaller title (handles short vs long titles).
function similarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  return shared / Math.min(a.size, b.size);
}

// rep wins by tier first (1 beats 2), then by score.
function isBetter(a: DedupItem, b: DedupItem): boolean {
  if (a.tier !== b.tier) return a.tier < b.tier;
  return a.score > b.score;
}

export function dedupeArticles<T extends DedupItem>(items: T[]): Cluster<T>[] {
  const clusters: { rep: T; words: Set<string>; sources: string[] }[] = [];

  for (const it of items) {
    const words = significantWords(it.title);
    let placed = false;
    for (const c of clusters) {
      if (similarity(words, c.words) >= THRESHOLD) {
        if (!c.sources.includes(it.source)) c.sources.push(it.source);
        if (isBetter(it, c.rep)) {
          c.rep = it;
          c.words = words;
        }
        placed = true;
        break;
      }
    }
    if (!placed) clusters.push({ rep: it, words, sources: [it.source] });
  }

  return clusters.map((c) => ({
    rep: c.rep,
    sources: [c.rep.source, ...c.sources.filter((s) => s !== c.rep.source)],
    count: c.sources.length,
  }));
}
