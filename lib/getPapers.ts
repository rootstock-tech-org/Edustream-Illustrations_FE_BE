// Server-side reader for the papers store (data/papers.json), same pattern as
// getNews. Read fresh each call so a rebuild shows up without a redeploy.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Paper } from "./papers";

export type PapersStore = {
  generatedAt: string | null;
  count: number;
  papers: Paper[];
};

export function getPapers(): PapersStore {
  try {
    const raw = readFileSync(join(process.cwd(), "data", "papers.json"), "utf8");
    const data = JSON.parse(raw);
    return {
      generatedAt: data.generatedAt ?? null,
      count: data.count ?? data.papers?.length ?? 0,
      papers: data.papers ?? [],
    };
  } catch {
    return { generatedAt: null, count: 0, papers: [] };
  }
}
