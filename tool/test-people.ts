// Quick test for Module A people.
// Run: node node_modules/tsx/dist/cli.mjs tool/test-people.ts "quantum computing"
import { fetchPapers } from "./papers";
import { fetchPeople } from "./people";

async function main() {
  const kw = process.argv[2] || "quantum computing";
  const papers = await fetchPapers(kw);
  const people = await fetchPeople(papers);
  console.log(`"${kw}" -> ${people.length} people (from ${papers.length} papers' authors)\n`);
  for (const p of people) {
    console.log(`- ${p.name} (${p.papers} papers)`);
    console.log(`  ${p.affiliation || "affiliation not listed"}`);
  }
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
