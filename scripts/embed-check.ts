// Sanity check for lib/embed.ts helper.
// Run: node node_modules/tsx/dist/cli.mjs scripts/embed-check.ts
import { embed, cosine } from "../lib/embed";

async function main() {
  const a = await embed("silicon photonics optical interconnect");
  const b = await embed("silicon photonics optical interconnect");
  const c = await embed("quarterly earnings and stock price");

  console.log("vector length:", a.length, "(expect 384)");
  console.log("same text cosine:", cosine(a, b).toFixed(3), "(expect ~1.0)");
  console.log("different text cosine:", cosine(a, c).toFixed(3), "(expect low)");
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
