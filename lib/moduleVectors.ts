// Gap 1 helper: turn each curriculum module into ONE description vector, so an
// article can be tagged by MEANING (embedding) when keywords miss a synonym.
// Description = module name + its keywords, joined. Vectors are built once and
// cached in-process (first build embeds ~18 modules, then reused every cycle).
import { MODULES } from "../data/curriculum";
import { embed, cosine } from "./embed";

export type ModuleVector = { id: string; name: string; vector: number[] };

let cache: ModuleVector[] | null = null;

// Build (or reuse) one vector per module from its name + keywords.
export async function getModuleVectors(): Promise<ModuleVector[]> {
  if (cache) return cache;
  const built: ModuleVector[] = [];
  for (const m of MODULES) {
    const text = `${m.name}: ${m.keywords.join(", ")}`;
    built.push({ id: m.id, name: m.name, vector: await embed(text) });
  }
  cache = built;
  return built;
}

// Best module for an article by meaning. Returns null if even the best is weak.
export async function bestModuleByMeaning(
  text: string,
  minScore = 0.25
): Promise<{ id: string; name: string; score: number } | null> {
  const mods = await getModuleVectors();
  const v = await embed(text);
  let best: { id: string; name: string; score: number } | null = null;
  for (const m of mods) {
    const score = cosine(v, m.vector);
    if (!best || score > best.score) best = { id: m.id, name: m.name, score };
  }
  return best && best.score >= minScore ? best : null;
}
