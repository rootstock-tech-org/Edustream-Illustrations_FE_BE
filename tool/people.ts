// Module A — "People Working in This Area" category.
// Primary source: the papers we already fetch (arXiv + Semantic Scholar) — their
// authors, counted by how often they appear. OpenAlex is tried best-effort to add
// an affiliation (where they work), but it rate-limits, so we never depend on it.
import type { Paper } from "./papers";

export type Person = {
  name: string;
  affiliation: string;
  papers: number; // how many of the sampled papers this author appears on
  relevance: string; // short reason: topic papers (+ overall citations if known)
  profileUrl: string; // OpenAlex author page, or "" if not found
};

const normName = (n: string) => n.toLowerCase().replace(/\s+/g, " ").trim();

// Count authors across the given papers, most-active first.
export function peopleFromPapers(papers: Paper[], limit = 10): Person[] {
  const map = new Map<string, Person>();
  for (const p of papers) {
    for (const name of p.authors) {
      const key = normName(name);
      if (!key) continue;
      const prev = map.get(key);
      if (prev) prev.papers += 1;
      else map.set(key, { name, affiliation: "", papers: 1, relevance: "", profileUrl: "" });
    }
  }
  return [...map.values()].sort((a, b) => b.papers - a.papers).slice(0, limit);
}

function shortCount(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, "") + "k";
  return String(n);
}

// Broad science/tech fields — used to reject same-name mismatches (e.g. a
// physicist's name matching a hospital doctor) when enriching from OpenAlex.
const SCIENCE_TECH = new Set([
  "physics",
  "computer science",
  "materials science",
  "chemistry",
  "mathematics",
  "engineering",
  "electrical engineering",
  "computer engineering",
  "nanotechnology",
  "optics",
  "artificial intelligence",
  "quantum mechanics",
  "condensed matter physics",
  "electronics",
  "nuclear physics",
  "telecommunications",
]);

// Is this OpenAlex author plausibly the right person for the query? True if any
// of their top research concepts is a hard-science/tech field or shares a word
// with the keyword. Skipped (always true) when no keyword is given.
function isRelated(concepts: string[], keyword: string): boolean {
  if (!keyword) return true;
  const kw = keyword.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  return concepts.some((c) => SCIENCE_TECH.has(c) || kw.some((w) => c.includes(w)));
}

// Best-effort OpenAlex lookup: affiliation, profile URL, and total citations.
// Only accepted when the author's field matches the topic, so common names don't
// attach the wrong person. Returns blanks on failure/rate-limit/mismatch.
async function authorInfo(
  name: string,
  keyword: string
): Promise<{ affiliation: string; profileUrl: string; citedBy: number }> {
  const blank = { affiliation: "", profileUrl: "", citedBy: 0 };
  try {
    const url = `https://api.openalex.org/authors?search=${encodeURIComponent(name)}&per_page=1`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return blank;
    const a = (await res.json())?.results?.[0];
    if (!a) return blank;
    const concepts = (a.x_concepts || []).slice(0, 5).map((c: any) => (c.display_name || "").toLowerCase());
    if (!isRelated(concepts, keyword)) return blank; // likely a same-name mismatch
    return {
      affiliation: a.last_known_institutions?.[0]?.display_name || "",
      profileUrl: a.id || "",
      citedBy: a.cited_by_count || 0,
    };
  } catch {
    return blank;
  }
}

// keyword's people, with affiliation, relevance and profile link filled where possible.
export async function fetchPeople(papers: Paper[], keyword = "", limit = 10): Promise<Person[]> {
  const people = peopleFromPapers(papers, limit);
  await Promise.all(
    people.map(async (p) => {
      const info = await authorInfo(p.name, keyword);
      p.affiliation = info.affiliation;
      p.profileUrl = info.profileUrl;
      p.relevance =
        `${p.papers} paper${p.papers > 1 ? "s" : ""} on this topic` +
        (info.citedBy ? ` \u00b7 ${shortCount(info.citedBy)} citations` : "");
    })
  );
  return people;
}
