// Module A — "Product / Player Comparison" category.
// No single free API gives this, so we ask Groq (LLM) to list the main
// companies/products in the field with a short, comparable summary each.
// Needs GROQ_API_KEY in the environment or in a .env file at the repo root.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const GROQ_MODEL = "openai/gpt-oss-120b";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

export type Player = {
  name: string;
  type: string; // company / product / platform
  focus: string; // what they do, one short line
  strength: string; // key strength, one short line
};

// Read GROQ_API_KEY from the shell env, or fall back to a .env file.
function groqKey(): string {
  if (process.env.GROQ_API_KEY) return process.env.GROQ_API_KEY;
  try {
    const env = readFileSync(join(process.cwd(), ".env"), "utf8");
    const line = env.split(/\r?\n/).find((l) => l.startsWith("GROQ_API_KEY="));
    return line ? line.slice("GROQ_API_KEY=".length).trim().replace(/^["']|["']$/g, "") : "";
  } catch {
    return "";
  }
}

export type ComparisonResult = { players: Player[]; error?: string };

// keyword -> main players in that field with a short, comparable summary each.
export async function fetchComparison(keyword: string, limit = 8): Promise<ComparisonResult> {
  const key = groqKey();
  if (!key) {
    return { players: [], error: "No GROQ_API_KEY found (add it to a .env file to enable comparison)." };
  }

  const system =
    "You are a market analyst. List only real, well-known companies/products in the given field. " +
    "Return STRICT JSON only, no prose.";
  const user =
    `Field: "${keyword}". List up to ${limit} of the main companies or products in this field. ` +
    `Return JSON exactly like: {"players":[{"name":"","type":"company|product|platform",` +
    `"focus":"one short line on what they do","strength":"one short line on their key strength"}]}. ` +
    `Keep focus and strength under 12 words each.`;

  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.2,
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { players: [], error: `Groq API error ${res.status}: ${body.slice(0, 300)}` };
    }
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);
    const players: Player[] = Array.isArray(parsed?.players) ? parsed.players.slice(0, limit) : [];
    return { players };
  } catch (e: any) {
    return { players: [], error: `Comparison failed: ${e?.message || e}` };
  }
}
