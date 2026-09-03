// One-off proof test: does local embedding capture MEANING (not just words)?
// Run: node node_modules/tsx/dist/cli.mjs scripts/embed-test.ts
import { pipeline } from "@xenova/transformers";

async function main() {
  console.log("Loading model (first run downloads ~23MB)...");
  const extract = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");

  async function vec(text: string): Promise<number[]> {
    const out = await extract(text, { pooling: "mean", normalize: true });
    return Array.from(out.data as Float32Array);
  }
  // vectors are normalized, so cosine similarity = dot product
  const cos = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);

  const hbm = await vec("HBM");
  const full = await vec("high bandwidth memory");
  const banana = await vec("banana");
  const tsmc1 = await vec("TSMC raises wafer prices");
  const tsmc2 = await vec("TSMC hikes chip manufacturing costs");

  console.log("\n--- results (1.0 = identical meaning, 0 = unrelated) ---");
  console.log("HBM  vs  high bandwidth memory :", cos(hbm, full).toFixed(3), "  (expect HIGH)");
  console.log("HBM  vs  banana                :", cos(hbm, banana).toFixed(3), "  (expect LOW)");
  console.log("TSMC raises prices vs hikes costs:", cos(tsmc1, tsmc2).toFixed(3), "  (expect HIGH)");
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
