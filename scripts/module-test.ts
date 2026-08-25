// Test Gap 1: do real headlines land in the RIGHT module purely by meaning?
// Run: node node_modules/tsx/dist/cli.mjs scripts/module-test.ts
import { bestModuleByMeaning, getModuleVectors } from "../lib/moduleVectors";

async function main() {
  console.log("Building module vectors...");
  const mods = await getModuleVectors();
  console.log("modules embedded:", mods.length, "\n");

  const samples = [
    "Micron ramps high bandwidth memory stacks for AI GPUs",       // -> packaging
    "TSMC extreme ultraviolet lithography yields improve at 2nm",  // -> fabrication
    "New gate all around transistor cuts leakage",                  // -> advanced-devices
    "Startup builds error-corrected qubit processor",               // -> emerging
  ];

  for (const s of samples) {
    const r = await bestModuleByMeaning(s);
    console.log(`"${s}"\n   -> ${r ? r.name + "  (" + r.score.toFixed(3) + ")" : "no match (dropped)"}\n`);
  }
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
