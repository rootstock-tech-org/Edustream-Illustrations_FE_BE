// Step 6: score a (already tagged) article out of 100 and decide keep/drop.
// Score = Relevance 45 + Source-trust 25 + Educational 20 + Freshness 10.
// Hard junk filter (blocked finance domain / stock-market words) drops before scoring.
// Rumour words don't drop the article, they subtract 8 and raise a `rumor` flag.
import { Tag } from "./tag";
import { BLOCKED_DOMAINS, NOISE_WORDS, RUMOR_WORDS } from "../data/sources";

export type ScoreInput = {
  title: string;
  summary: string;
  link: string;
  publishedAt: Date | null;
  tier: 1 | 2;
  tag: Tag; // article must already be tagged (non-null)
};

export type DropReason = "blocked-domain" | "noise-word" | "below-cutoff";

export type ScoreResult = {
  keep: boolean;
  score: number; // 0..100
  drop: DropReason | null;
  rumor: boolean;
  breakdown: { relevance: number; trust: number; educational: number; freshness: number; rumorPenalty: number };
};

const CUTOFF = 40;
const RUMOR_PENALTY = 8;
const INDUSTRY_MODULE = "industry"; // the one non-technical module -> lower educational value

function domainOf(link: string): string {
  try {
    return new URL(link).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function firstHit(text: string, words: string[]): string | null {
  const t = text.toLowerCase();
  for (const w of words) if (t.includes(w.toLowerCase())) return w;
  return null;
}

function countHits(text: string, words: string[]): number {
  const t = text.toLowerCase();
  let n = 0;
  for (const w of words) if (t.includes(w.toLowerCase())) n++;
  return n;
}

function freshnessScore(d: Date | null): number {
  if (!d) return 4; // unknown date -> neutral
  const days = (Date.now() - d.getTime()) / 86_400_000;
  if (days < 2) return 10;
  if (days < 7) return 7;
  if (days < 30) return 4;
  return 2;
}

export function scoreArticle(a: ScoreInput): ScoreResult {
  const text = `${a.title} ${a.summary}`;
  const zero = { relevance: 0, trust: 0, educational: 0, freshness: 0, rumorPenalty: 0 };
  const dom = domainOf(a.link);

  // Phase A: hard junk filter (drop regardless of topic).
  if (BLOCKED_DOMAINS.some((d) => dom === d || dom.endsWith("." + d))) {
    return { keep: false, score: 0, drop: "blocked-domain", rumor: false, breakdown: zero };
  }
  // A finance word in the TITLE is a strong signal (drop). In the summary alone we
  // require 2+ hits, so a real article that just mentions "earnings" once survives.
  if (firstHit(a.title, NOISE_WORDS) || countHits(a.summary, NOISE_WORDS) >= 2) {
    return { keep: false, score: 0, drop: "noise-word", rumor: false, breakdown: zero };
  }

  // Phase B: score the survivors.
  const relevance = Math.min(45, a.tag.score * 7.5); // ~6 keyword-hits (weighted) = full marks
  const trust = a.tier === 1 ? 25 : 17;
  const educational = a.tag.moduleId === INDUSTRY_MODULE ? 12 : 20;
  const freshness = freshnessScore(a.publishedAt);
  const rumor = firstHit(text, RUMOR_WORDS) !== null;
  const rumorPenalty = rumor ? RUMOR_PENALTY : 0;

  const score = Math.max(0, Math.round(relevance + trust + educational + freshness - rumorPenalty));
  const keep = score >= CUTOFF;

  return {
    keep,
    score,
    drop: keep ? null : "below-cutoff",
    rumor,
    breakdown: {
      relevance: Math.round(relevance),
      trust,
      educational,
      freshness,
      rumorPenalty,
    },
  };
}
