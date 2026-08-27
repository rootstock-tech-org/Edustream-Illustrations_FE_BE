// Gap 3: semantic search. Rank articles by how close their MEANING is to the
// query, so "chip cooling" also surfaces "thermal management for processors".
// Article vectors are cached per link, so only the first search after a build
// pays the embedding cost; later searches reuse the vectors.
import { embed, cosine } from "./embed";

const vecCache = new Map<string, number[]>();

async function articleVec(link: string, text: string): Promise<number[]> {
  const hit = vecCache.get(link);
  if (hit) return hit;
  const v = await embed(text);
  vecCache.set(link, v);
  return v;
}

export async function semanticRank<T extends { link: string; title: string; summary?: string }>(
  query: string,
  articles: T[],
  minScore = 0.4
): Promise<{ item: T; score: number }[]> {
  if (!query.trim() || articles.length === 0) return [];
  const q = await embed(query);
  const scored = await Promise.all(
    articles.map(async (a) => ({
      item: a,
      score: cosine(q, await articleVec(a.link, `${a.title}. ${a.summary ?? ""}`)),
    }))
  );
  return scored.filter((s) => s.score >= minScore).sort((x, y) => y.score - x.score);
}
