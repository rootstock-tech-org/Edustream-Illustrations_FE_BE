// Quick test for Module A research papers.
// Run: node node_modules/tsx/dist/cli.mjs tool/test-papers.ts "quantum computing"
import { fetchPapers } from "./papers";

async function main() {
  const kw = process.argv[2] || "quantum computing";
  const papers = await fetchPapers(kw);
  const ax = papers.filter((p) => p.source === "arXiv").length;
  const ss = papers.filter((p) => p.source === "Semantic Scholar").length;
  console.log(`"${kw}" -> ${papers.length} papers (arXiv: ${ax}, Semantic Scholar: ${ss}, de-duped)\n`);
  for (const p of papers) {
    console.log(`- ${p.title}`);
    console.log(
      `  ${p.authors.slice(0, 3).join(", ")}${p.authors.length > 3 ? " et al." : ""} | ${p.year ?? "?"} | ${p.source}`
    );
    console.log(`  ${p.url}`);
  }
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
