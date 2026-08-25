// Realistic proof: does a full headline land in the RIGHT module by MEANING?
// Mirrors how tagging will actually work: article text vs module descriptions.
// Run: node node_modules/tsx/dist/cli.mjs scripts/embed-test2.ts
import { pipeline } from "@xenova/transformers";

async function main() {
  console.log("Loading model...");
  const extract = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");

  async function vec(text: string): Promise<number[]> {
    const out = await extract(text, { pooling: "mean", normalize: true });
    return Array.from(out.data as Float32Array);
  }
  const cos = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);

  // Two module "descriptions" (name + a few keywords), like we'll build for real.
  const modPackaging = await vec(
    "Packaging and Test: advanced packaging, chiplet, HBM, high bandwidth memory, hybrid bonding, interposer, CoWoS, 3D IC"
  );
  const modPhysics = await vec(
    "Semiconductor Physics: band gap, pn junction, carrier mobility, doping, drift current, GaN, silicon carbide"
  );

  // A real-style headline that uses the SYNONYM, never the acronym "HBM".
  const article = await vec(
    "Micron ramps high bandwidth memory stacks for next-gen AI GPUs using hybrid bonding"
  );

  const sPack = cos(article, modPackaging);
  const sPhys = cos(article, modPhysics);

  console.log("\n--- which module does the article match best? ---");
  console.log("article vs Packaging module :", sPack.toFixed(3));
  console.log("article vs Physics module   :", sPhys.toFixed(3));
  console.log("\nWinner:", sPack > sPhys ? "Packaging  (CORRECT)" : "Physics  (WRONG)");
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
