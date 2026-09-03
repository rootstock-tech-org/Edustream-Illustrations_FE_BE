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
    // Serve PDFs from arXiv's export mirror: many ad blockers block the
    // arxiv.org/pdf/ path (ERR_BLOCKED_BY_CLIENT), export.arxiv.org slips through.
    const papers: Paper[] = (data.papers ?? []).map((p: Paper) =>
      p.pdf ? { ...p, pdf: p.pdf.replace("://arxiv.org/pdf", "://export.arxiv.org/pdf") } : p
    );
    return {
      generatedAt: data.generatedAt ?? null,
      count: data.count ?? papers.length ?? 0,
      papers,
    };
  } catch {
    return { generatedAt: null, count: 0, papers: [] };
  }
}
