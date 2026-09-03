// Gap 2: merge clusters whose representative titles MEAN the same thing (same
// story reworded by a different outlet), even when they share few exact words.
// Runs after the word-overlap dedup, so it only tightens what's left.
import { embed, cosine } from "./embed";
import type { Cluster, DedupItem } from "./dedup";

// Title vectors are cached per link across refresh cycles (embed each once).
const titleVecCache = new Map<string, number[]>();

async function titleVec(key: string, title: string): Promise<number[]> {
  const hit = titleVecCache.get(key);
  if (hit) return hit;
  const v = await embed(title);
  titleVecCache.set(key, v);
  return v;
}

function isBetter(a: DedupItem, b: DedupItem): boolean {
  if (a.tier !== b.tier) return a.tier < b.tier; // tier 1 beats tier 2
  return a.score > b.score;
}

// Temporary debug: set to true to log every meaning-merge while tuning.
const DEBUG_MERGE = process.env.DEBUG_MERGE === "1";

export async function mergeByMeaning<T extends DedupItem>(
  clusters: Cluster<T>[],
  threshold = 0.82
): Promise<Cluster<T>[]> {
  const vecs = await Promise.all(
    clusters.map((c) => titleVec(String((c.rep as { link?: string }).link ?? c.rep.title), c.rep.title))
  );

  const used = new Array(clusters.length).fill(false);
  const out: Cluster<T>[] = [];

  for (let i = 0; i < clusters.length; i++) {
    if (used[i]) continue;
    let group = clusters[i];
    for (let j = i + 1; j < clusters.length; j++) {
      if (used[j]) continue;
      const sim = cosine(vecs[i], vecs[j]);
      if (sim >= threshold) {
        used[j] = true;
        if (DEBUG_MERGE) {
          console.log(`  [merge ${sim.toFixed(2)}] "${group.rep.title.slice(0, 60)}" <> "${clusters[j].rep.title.slice(0, 60)}"`);
        }
        const better = isBetter(clusters[j].rep, group.rep) ? clusters[j] : group;
        const other = better === group ? clusters[j] : group;
        const sources = Array.from(new Set([...better.sources, ...other.sources]));
        group = { rep: better.rep, sources, count: sources.length } as Cluster<T>;
      }
    }
    out.push(group);
  }
  return out;
}
