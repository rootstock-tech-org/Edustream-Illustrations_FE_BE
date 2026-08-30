// Quick test for Module A people.
// Run: node node_modules/tsx/dist/cli.mjs tool/test-people.ts "quantum computing"
import { fetchPapers } from "./papers";
import { fetchPeople } from "./people";

async function main() {
  const kw = process.argv[2] || "quantum computing";
  const papers = await fetchPapers(kw);
  const people = await fetchPeople(papers, kw);
  console.log(`"${kw}" -> ${people.length} people (from ${papers.length} papers' authors)\n`);
  for (const p of people) {
    console.log(`- ${p.name}`);
    console.log(`  affiliation: ${p.affiliation || "not listed"}`);
    console.log(`  relevance: ${p.relevance}`);
    console.log(`  profile: ${p.profileUrl || "not found"}`);
  }
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
