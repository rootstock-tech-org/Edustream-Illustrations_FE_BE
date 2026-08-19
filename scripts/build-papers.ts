// One-shot: fetch all papers and write data/papers.json.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildPapers } from "../lib/papers";

(async () => {
  const t0 = Date.now();
  console.log("Fetching papers from Crossref (title-match, classic + latest)...\n");
  const papers = await buildPapers((m) => console.log(m));
  const out = { generatedAt: new Date().toISOString(), count: papers.length, papers };
  writeFileSync(join(process.cwd(), "data", "papers.json"), JSON.stringify(out, null, 2), "utf8");
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  const classic = papers.filter((p) => p.kind === "classic").length;
  const withPdf = papers.filter((p) => p.pdf).length;
  console.log(`\nWrote ${papers.length} papers (${classic} classic, ${papers.length - classic} latest) to data/papers.json in ${secs}s`);
  console.log(`Open-access PDF available: ${withPdf}/${papers.length}`);
})();
