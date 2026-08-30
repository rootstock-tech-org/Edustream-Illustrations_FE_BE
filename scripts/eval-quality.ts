// Quality evaluation: which approach gives BETTER results, not just MORE.
// We compare two ways of answering a query on the SAME fetched articles:
//   A) keyword-only  (plain word match, the old way)
//   B) semantic      (meaning-based ranking, the embedding work)
// An LLM judge (Groq) marks each returned article relevant / not for the query,
// and we compute Precision@K = relevant returned / total returned.
// The judge's verdicts are also written to a CSV so our 5-7 VLSI experts can
// cross-check the LLM (fill the "expert_relevant" column and compare).
//
// Run: node --env-file=.env node_modules/tsx/dist/cli.mjs scripts/eval-quality.ts
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fetchAllFeeds, buildFromFeeds, Article } from "../lib/pipeline";
import { semanticRank } from "../lib/semanticSearch";

const K = 10; // how many top results each approach returns per query
const GROQ_MODEL = "openai/gpt-oss-120b";

// A balanced mix so the comparison is fair, not rigged:
//   - plain-word queries where keyword search DOES return results (head-to-head
//     precision: same query, both approaches answer, compare quality)
//   - meaning-based queries phrased in the user's words, not the article's
//     (tests whether semantic can answer what keyword cannot at all)
const TEST_QUERIES = [
  // plain-word (keyword should also return something)
  "semiconductor",
  "GPU",
  "chip manufacturing",
  "AI chip",
  // meaning-based (keyword likely misses)
  "making transistors smaller",
  "stacking chips in 3D",
  "chip supply shortage",
  "energy efficient chips",
];

// Same word-match rule the /search page uses (approach A).
function keywordMatches(articles: Article[], query: string): Article[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return articles.filter((a) => {
    const hay = `${a.title} ${a.module ?? ""} ${a.summary ?? ""}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

type Verdict = { relevant: boolean; reason: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// POST to Groq, retrying politely when the free-tier rate limit (429) is hit.
async function groqChat(body: unknown, key: string): Promise<any> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
    });
    if (res.ok) return res.json();
    const txt = await res.text();
    if (res.status === 429 && attempt < 4) {
      const m = txt.match(/try again in ([\d.]+)s/);
      const waitMs = Math.ceil((m ? parseFloat(m[1]) : 8) * 1000) + 500;
      console.log(`   (rate limited, waiting ${(waitMs / 1000).toFixed(1)}s...)`);
      await sleep(waitMs);
      continue;
    }
    throw new Error(`Groq ${res.status}: ${txt}`);
  }
  throw new Error("Groq: exhausted retries");
}

// Ask the LLM judge whether each candidate article is relevant to the query.
// One call per query judges the whole candidate list; the verdicts are then
// reused for BOTH approaches so the comparison is fair (same judge, same result
// judged once).
async function judge(query: string, items: Article[]): Promise<Map<string, Verdict>> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY missing. Run with: node --env-file=.env ...");
  if (items.length === 0) return new Map();

  const list = items
    .map((a, i) => `${i}. TITLE: ${a.title}\n   SUMMARY: ${(a.summary || "").slice(0, 220)}`)
    .join("\n");

  const prompt =
    `You are a semiconductor / VLSI domain expert judging a news search engine.\n` +
    `User query: "${query}"\n\n` +
    `For each article below, decide if it is GENUINELY relevant to what the user is asking about ` +
    `(same topic and intent, not just a shared common word).\n\n` +
    `Articles:\n${list}\n\n` +
    `Return ONLY JSON of this exact shape:\n` +
    `{"results":[{"i":0,"relevant":true,"reason":"short reason"}, ...]}\n` +
    `Include one entry for every article index. Keep each reason under 15 words.`;

  const data = await groqChat(
    {
      model: GROQ_MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
    },
    key
  );
  const raw = data?.choices?.[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw) as { results?: { i: number; relevant: boolean; reason?: string }[] };

  const out = new Map<string, Verdict>();
  for (const r of parsed.results ?? []) {
    const a = items[r.i];
    if (a) out.set(a.link, { relevant: !!r.relevant, reason: r.reason ?? "" });
  }
  // Any article the judge skipped is treated as not-relevant (conservative).
  for (const a of items) if (!out.has(a.link)) out.set(a.link, { relevant: false, reason: "(no verdict)" });
  return out;
}

function csvCell(v: string): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function main() {
  console.log("Fetching feeds once (same input for both approaches)...\n");
  const { on, feeds } = await fetchAllFeeds();
  const articles = await buildFromFeeds(on, feeds, { enrich: false });
  console.log(`Built ${articles.length} articles. Judging model: ${GROQ_MODEL}\n`);

  const rows: string[][] = [
    ["query", "approach", "rank", "title", "source", "llm_relevant", "llm_reason", "expert_relevant", "link"],
  ];

  let sumPa = 0;
  let sumPb = 0;
  let answeredA = 0; // queries where keyword returned >=1 result
  let answeredB = 0;

  const pct = (n: number) => `${(n * 100).toFixed(0)}%`;

  for (const q of TEST_QUERIES) {
    const a = keywordMatches(articles, q).slice(0, K); // approach A: keyword
    const b = (await semanticRank(q, articles, 0.4)).slice(0, K).map((s) => s.item); // approach B: semantic

    // Judge the union once, reuse verdicts for both approaches.
    const union = [...new Map([...a, ...b].map((x) => [x.link, x])).values()];
    const verdicts = await judge(q, union);

    const relOf = (item: Article) => verdicts.get(item.link)?.relevant ?? false;
    const relA = a.filter(relOf).length;
    const relB = b.filter(relOf).length;
    // Precision is only defined when an approach actually returned something.
    if (a.length) { sumPa += relA / a.length; answeredA++; }
    if (b.length) { sumPb += relB / b.length; answeredB++; }

    const pAtxt = a.length ? pct(relA / a.length) : "n/a (no results)";
    const pBtxt = b.length ? pct(relB / b.length) : "n/a (no results)";
    console.log(`"${q}"`);
    console.log(`   keyword : ${a.length} returned, ${relA} relevant  ->  Precision@${K} = ${pAtxt}`);
    console.log(`   semantic: ${b.length} returned, ${relB} relevant  ->  Precision@${K} = ${pBtxt}`);

    for (const [label, list] of [["keyword", a], ["semantic", b]] as const) {
      list.forEach((item, i) => {
        const v = verdicts.get(item.link);
        rows.push([
          q,
          label,
          String(i + 1),
          item.title,
          item.source,
          v?.relevant ? "yes" : "no",
          v?.reason ?? "",
          "", // expert fills this
          item.link,
        ]);
      });
    }

    await sleep(2000); // pace requests to stay under the free-tier rate limit
  }

  const total = TEST_QUERIES.length;
  const avgA = answeredA ? sumPa / answeredA : 0;
  const avgB = answeredB ? sumPb / answeredB : 0;
  console.log("\n=== SUMMARY ===");
  console.log("Two things decide which approach is better:");
  console.log(`  1) Precision@${K} (quality of results it returns, higher = better):`);
  console.log(`       keyword  = ${(avgA * 100).toFixed(1)}%   (avg over the ${answeredA} queries it answered)`);
  console.log(`       semantic = ${(avgB * 100).toFixed(1)}%   (avg over the ${answeredB} queries it answered)`);
  console.log(`  2) Coverage (how many of ${total} queries it could answer at all, higher = better):`);
  console.log(`       keyword  = ${answeredA}/${total}`);
  console.log(`       semantic = ${answeredB}/${total}`);

  const dir = join(process.cwd(), "scripts", "output");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `eval_quality_${new Date().toISOString().slice(0, 10)}.csv`);
  writeFileSync(file, "\uFEFF" + rows.map((r) => r.map(csvCell).join(",")).join("\n"), "utf8");
  console.log(`\nExpert cross-check sheet: ${file}`);
  console.log('   -> experts fill the "expert_relevant" column (yes/no) to validate the LLM judge.');
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
