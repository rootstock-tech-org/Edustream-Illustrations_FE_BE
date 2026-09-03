// Fetch curated academic papers per curriculum module from arXiv (free, no key,
// official Atom API). For each module we pull TOP (relevance-ranked) and LATEST
// (newest) papers matching that module's topic phrases, keep only those whose
// title/abstract actually contains a phrase (precision), score, dedupe and cap.
// Written to data/papers.json. arXiv has no citation counts, so we rank "top" by
// relevance + a small hardware-category/recency boost (never a fake "most-cited").
import { XMLParser } from "fast-xml-parser";
import { PAPER_TOPICS } from "../data/paperTopics";

const ARXIV = "https://export.arxiv.org/api/query";
const TOP_PER_MODULE = 10;
const LATEST_PER_MODULE = 10;

// arXiv subject classes that are relevant to robotics / HRC -> small boost.
const HW_CATEGORIES = new Set([
  "cs.RO", "cs.HC", "cs.AI", "cs.CV", "cs.LG", "eess.SY", "cs.MA", "cs.SY",
]);

export type Paper = {
  id: string;
  title: string;
  authors: string[];
  published: string | null; // ISO date
  year: number | null;
  categories: string[];
  venue: string; // "arXiv" + primary category
  url: string; // abstract page
  pdf: string | null; // PDF link
  moduleId: string;
  kind: "top" | "latest";
  score: number;
};

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function arr<T>(v: T | T[] | undefined): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

type ArxivEntry = {
  id?: string;
  title?: string;
  summary?: string;
  published?: string;
  author?: { name?: string } | { name?: string }[];
  link?: { "@_href"?: string; "@_rel"?: string; "@_title"?: string; "@_type"?: string }[];
  category?: { "@_term"?: string } | { "@_term"?: string }[];
  "arxiv:primary_category"?: { "@_term"?: string };
};

function toPaper(e: ArxivEntry, moduleId: string, kind: "top" | "latest"): Paper {
  const title = (e.title || "").replace(/\s+/g, " ").trim();
  const authors = arr(e.author).map((a) => a?.name || "").filter(Boolean).slice(0, 4);
  const links = arr(e.link);
  const pdf = links.find((l) => l["@_title"] === "pdf")?.["@_href"] || null;
  const absUrl = links.find((l) => l["@_rel"] === "alternate")?.["@_href"] || e.id || "";
  const categories = arr(e.category).map((c) => c["@_term"] || "").filter(Boolean);
  const primary = e["arxiv:primary_category"]?.["@_term"] || categories[0] || "";
  const published = e.published || null;
  const year = published ? Number(published.slice(0, 4)) || null : null;
  return {
    id: (e.id || absUrl).trim(),
    title,
    authors,
    published,
    year,
    categories,
    venue: primary ? `arXiv · ${primary}` : "arXiv",
    url: absUrl,
    pdf,
    moduleId,
    kind,
    score: 0,
  };
}

// A module's phrases -> arXiv Atom results (relevance-ranked), parsed to Paper[].
// We do ONE relevance query and derive both "top" and "latest" from it, so every
// shown paper is a genuine phrase match (a separate date-sorted query pulled in
// off-topic papers that merely share a generic phrase).
async function fetchModule(
  phrases: string[],
  moduleId: string,
  log: (m: string) => void,
): Promise<Paper[]> {
  const clause = phrases.map((p) => `ti:"${p}" OR abs:"${p}"`).join(" OR ");
  const search = `(${clause})`;
  const url = `${ARXIV}?search_query=${encodeURIComponent(search)}&start=0&max_results=50&sortBy=relevance`;

  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "user-agent": "AVSAR-VLSI-Papers/1.0 (research paper index for learners)" },
        signal: AbortSignal.timeout(25000),
      });
      if (res.status === 429 || res.status >= 500) {
        await sleep(2000 * (attempt + 1));
        continue;
      }
      if (!res.ok) {
        log(`  ! ${moduleId} -> HTTP ${res.status}`);
        return [];
      }
      const xml = await res.text();
      const data = parser.parse(xml);
      const entries = arr<ArxivEntry>(data?.feed?.entry);
      // Precision: keep only entries whose title or abstract contains a phrase.
      const nphrases = phrases.map(norm);
      return entries
        .map((e) => ({ p: toPaper(e, moduleId, "top"), text: norm(`${e.title || ""} ${e.summary || ""}`) }))
        .filter(({ text }) => nphrases.some((ph) => ph && text.includes(ph)))
        .map(({ p }) => p);
    } catch {
      await sleep(1500 * (attempt + 1));
    }
  }
  log(`  ! ${moduleId} -> failed after retries`);
  return [];
}

function scorePaper(p: Paper, nphrases: string[]): number {
  const t = norm(p.title);
  let s = 0;
  for (const ph of nphrases) if (ph && t.includes(ph)) s += 3;
  if (p.categories.some((c) => HW_CATEGORIES.has(c))) s += 2;
  const yr = p.year || 0;
  if (yr >= 2024) s += 2;
  else if (yr >= 2020) s += 1;
  return s;
}

function dedupe(papers: Paper[]): Paper[] {
  const seen = new Set<string>();
  const out: Paper[] = [];
  for (const p of papers) {
    const key = norm(p.title) || p.id;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

export async function buildPapers(log: (m: string) => void = () => {}): Promise<Paper[]> {
  const all: Paper[] = [];
  for (const group of PAPER_TOPICS) {
    const nphrases = group.phrases.map(norm);
    const pool = dedupe(await fetchModule(group.phrases, group.moduleId, log));
    await sleep(3000); // arXiv asks for ~3s between requests
    for (const p of pool) p.score = scorePaper(p, nphrases);

    // Top = best relevance/score; Latest = most recent AMONG the same matches.
    const top = [...pool].sort((a, b) => b.score - a.score).slice(0, TOP_PER_MODULE)
      .map((p) => ({ ...p, kind: "top" as const }));
    const topKeys = new Set(top.map((p) => norm(p.title)));
    const latest = [...pool]
      .sort((a, b) => (b.published || "").localeCompare(a.published || ""))
      .filter((p) => !topKeys.has(norm(p.title)))
      .slice(0, LATEST_PER_MODULE)
      .map((p) => ({ ...p, kind: "latest" as const }));

    log(`  ${group.moduleId}: ${top.length} top, ${latest.length} latest`);
    all.push(...top, ...latest);
  }

  // Global de-dup: the same paper can match two modules' phrases; keep only the
  // single best-scoring copy so it never appears twice across the page.
  const byId = new Map<string, Paper>();
  for (const p of all) {
    const prev = byId.get(p.id);
    if (!prev || p.score > prev.score) byId.set(p.id, p);
  }
  return [...byId.values()];
}
