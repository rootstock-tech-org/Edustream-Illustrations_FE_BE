// Local, free sentence embeddings (no API, no network after first download).
// Shared by tagging (Gap 1), dedup (Gap 2) and search (Gap 3).
import { pipeline } from "@xenova/transformers";

// Load the model once per process and reuse it (first call downloads ~23MB).
let extractorPromise: Promise<any> | null = null;
function getExtractor() {
  if (!extractorPromise) {
    extractorPromise = pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
  }
  return extractorPromise;
}

// One text -> a 384-number vector (mean-pooled + normalized, so cosine = dot).
export async function embed(text: string): Promise<number[]> {
  const extract = await getExtractor();
  const out = await extract(text || " ", { pooling: "mean", normalize: true });
  return Array.from(out.data as Float32Array);
}

// Many texts -> many vectors (sequential to keep memory low; fine at our scale).
export async function embedMany(texts: string[]): Promise<number[][]> {
  const res: number[][] = [];
  for (const t of texts) res.push(await embed(t));
  return res;
}

// Vectors are normalized, so cosine similarity is just the dot product.
export function cosine(a: number[], b: number[]): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}
