// Quick test for Module A product/player comparison.
// Run: node --env-file=.env node_modules/tsx/dist/cli.mjs tool/test-comparison.ts "quantum computing"
import { fetchComparison } from "./comparison";

async function main() {
  const kw = process.argv[2] || "quantum computing";
  const { players, error } = await fetchComparison(kw);
  if (error) {
    console.log(`NOTE: ${error}`);
  }
  console.log(`"${kw}" -> ${players.length} players\n`);
  for (const p of players) {
    console.log(`- ${p.name} (${p.type})`);
    console.log(`  focus: ${p.focus}`);
    console.log(`  strength: ${p.strength}`);
  }
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
