// Step 4 quality check for data/papers.json: per-module counts, sample titles,
// duplicate check, and any papers missing a title/year. Read-only.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PAPER_TOPICS } from "../data/paperTopics";

type Paper = {
  title: string; year: number | null; citations: number; venue: string;
  doi: string | null; url: string; pdf: string | null; moduleId: string;
  kind: "classic" | "latest"; topic: string;
};

const data = JSON.parse(readFileSync(join(process.cwd(), "data", "papers.json"), "utf8"));
const papers: Paper[] = data.papers;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Duplicate check across the whole file (by DOI or normalized title).
const seen = new Map<string, number>();
let dups = 0;
for (const p of papers) {
  const key = (p.doi || norm(p.title));
  seen.set(key, (seen.get(key) || 0) + 1);
}
for (const [, n] of seen) if (n > 1) dups += n - 1;

const noTitle = papers.filter((p) => !p.title).length;
const noYear = papers.filter((p) => p.year == null).length;

console.log(`TOTAL ${papers.length} | classic ${papers.filter(p=>p.kind==="classic").length} | latest ${papers.filter(p=>p.kind==="latest").length}`);
console.log(`with PDF ${papers.filter(p=>p.pdf).length} | duplicate rows ${dups} | missing title ${noTitle} | missing year ${noYear}\n`);

for (const g of PAPER_TOPICS) {
  const c = papers.filter((p) => p.moduleId === g.moduleId && p.kind === "classic");
  const l = papers.filter((p) => p.moduleId === g.moduleId && p.kind === "latest");
  const topC = [...c].sort((a, b) => b.citations - a.citations)[0];
  const topL = [...l].sort((a, b) => (b.year ?? 0) - (a.year ?? 0))[0];
  console.log(`${g.moduleId}: ${c.length} classic, ${l.length} latest`);
  if (topC) console.log(`   classic e.g. [${topC.year}] c=${topC.citations}  ${topC.title.slice(0, 80)}`);
  if (topL) console.log(`   latest  e.g. [${topL.year}] c=${topL.citations}  ${topL.title.slice(0, 80)}`);
}
