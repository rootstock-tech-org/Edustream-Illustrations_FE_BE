// Step 5: tag an article to ONE curriculum module by keyword matching.
// Title matches count double (a heading is a stronger signal than body text).
// No module matched  ->  returns null  ->  article is off-topic and gets dropped.
import { MODULES } from "../data/curriculum";

export type Tag = {
  moduleId: string;
  moduleName: string;
  score: number; // weighted count of keyword hits
  matched: string[]; // which keywords hit (for transparency / debugging)
};

const TITLE_WEIGHT = 2;

function norm(s: string): string {
  return (s || "").toLowerCase();
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Whole-keyword match: the keyword must not sit inside a bigger *word*. Boundaries
// are letter-only (digits allowed) so "ATE" won't match "gate" but "DDR" still
// matches "DDR5". A trailing optional s/es lets "interconnect" match "interconnects".
function keywordRegex(kw: string): RegExp {
  return new RegExp(`(?<![a-z])${escapeRegex(kw.toLowerCase())}(?:e?s)?(?![a-z])`);
}

// Precompile every module's keyword regexes once (not per article).
const COMPILED = MODULES.map((m) => ({
  id: m.id,
  name: m.name,
  patterns: m.keywords.map((kw) => ({ kw, re: keywordRegex(kw) })),
}));

// Match one module's keywords against the (already lowercased) title and body.
function scoreModule(patterns: { kw: string; re: RegExp }[], title: string, body: string) {
  let score = 0;
  const matched: string[] = [];
  for (const { kw, re } of patterns) {
    const inTitle = re.test(title);
    const inBody = re.test(body);
    if (inTitle || inBody) {
      score += inTitle ? TITLE_WEIGHT : 1;
      matched.push(kw);
    }
  }
  return { score, matched };
}

// Returns the best-matching module, or null if nothing matched (off-topic -> drop).
export function tagArticle(title: string, summary = ""): Tag | null {
  const t = norm(title);
  const b = norm(summary);

  let best: Tag | null = null;
  for (const m of COMPILED) {
    const { score, matched } = scoreModule(m.patterns, t, b);
    if (score === 0) continue;
    if (!best || score > best.score) {
      best = { moduleId: m.id, moduleName: m.name, score, matched };
    }
  }
  return best;
}
