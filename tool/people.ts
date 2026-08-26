// Module A — "People Working in This Area" category.
// Primary source: the papers we already fetch (arXiv + Semantic Scholar) — their
// authors, counted by how often they appear. OpenAlex is tried best-effort to add
// an affiliation (where they work), but it rate-limits, so we never depend on it.
import type { Paper } from "./papers";

export type Person = {
  name: string;
  affiliation: string;
  papers: number; // how many of the sampled papers this author appears on
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
      else map.set(key, { name, affiliation: "", papers: 1 });
    }
  }
  return [...map.values()].sort((a, b) => b.papers - a.papers).slice(0, limit);
}

// Best-effort: ask OpenAlex where a person works. Returns "" on any failure/limit.
async function affiliationOf(name: string): Promise<string> {
  try {
    const url = `https://api.openalex.org/authors?search=${encodeURIComponent(name)}&per_page=1`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return "";
    const data = await res.json();
    return data?.results?.[0]?.last_known_institutions?.[0]?.display_name || "";
  } catch {
    return "";
  }
}

// keyword's people, from the given papers, with affiliations filled where possible.
export async function fetchPeople(papers: Paper[], limit = 10): Promise<Person[]> {
  const people = peopleFromPapers(papers, limit);
  await Promise.all(
    people.map(async (p) => {
      p.affiliation = await affiliationOf(p.name);
    })
  );
  return people;
}
