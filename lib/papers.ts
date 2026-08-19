// Fetch curated academic papers per curriculum module from Crossref (free, no key).
// For each topic phrase we pull CLASSIC (most-cited) and LATEST (2024+) journal
// articles, keep only those whose TITLE contains the phrase (precision), then
// dedupe by DOI/title and cap per module. Written to data/papers.json.
import { PAPER_TOPICS } from "../data/paperTopics";

const CROSSREF = "https://api.crossref.org/works";
const MAILTO = "anjaneyatiwarii@gmail.com"; // Crossref "polite pool" contact

const CLASSIC_PER_MODULE = 12;
const LATEST_PER_MODULE = 12;

export type Paper = {
  id: string;
  title: string;
  authors: string[];
  year: number | null;
  citations: number;
  venue: string;
  doi: string | null;
  url: string; // landing page to open the paper
  pdf: string | null; // open-access PDF if available
  moduleId: string;
  kind: "classic" | "latest";
  topic: string;
};

type CrossrefItem = {
  DOI?: string;
  title?: string[];
  author?: { given?: string; family?: string; name?: string }[];
  "container-title"?: string[];
  "is-referenced-by-count"?: number;
  issued?: { "date-parts"?: number[][] };
  URL?: string;
  link?: { URL?: string; "content-type"?: string }[];
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Crossref titles carry raw HTML entities (&amp; &lt; &#x2019; ...) - decode them.
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#3[49];|&#x27;|&apos;/g, "'")
    .replace(/&#x2019;|&#8217;/g, "\u2019")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x2013;|&#8211;/g, "\u2013")
    .replace(/&#?\w+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toPaper(it: CrossrefItem, moduleId: string, kind: "classic" | "latest", topic: string): Paper {
  const authors = (it.author || [])
    .map((a) => a.name || [a.given, a.family].filter(Boolean).join(" "))
    .filter(Boolean)
    .slice(0, 4);
  const doi = it.DOI ? `https://doi.org/${it.DOI}` : null;
  const url = it.URL || doi || "";
  const pdf = it.link?.find((l) => l["content-type"] === "application/pdf")?.URL || null;
  return {
    id: it.DOI || url,
    title: decodeEntities((it.title?.[0] || "").trim()),
    authors,
    year: it.issued?.["date-parts"]?.[0]?.[0] ?? null,
    citations: it["is-referenced-by-count"] ?? 0,
    venue: it["container-title"]?.[0] || "",
    doi,
    url,
    pdf,
    moduleId,
    kind,
    topic,
  };
}

// One phrase -> Paper[]: Crossref title search, journal articles only, then keep
// only papers whose TITLE actually contains the phrase (precision).
async function fetchPhrase(
  phrase: string,
  mode: "classic" | "latest",
  moduleId: string,
  log: (m: string) => void,
): Promise<Paper[]> {
  // No API sort: Crossref's sort overrides title relevance and floods results
  // with globally most-cited unrelated papers. We take relevance-ranked matches
  // and rank them ourselves (by citations / year) in buildPapers.
  const params = new URLSearchParams({
    "query.title": phrase,
    rows: "25",
    select: "DOI,title,author,container-title,is-referenced-by-count,issued,URL,link",
    mailto: MAILTO,
  });
  params.set("filter", mode === "latest" ? "type:journal-article,from-pub-date:2024-01-01" : "type:journal-article");
  const url = `${CROSSREF}?${params}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "user-agent": `AVSAR-VLSI-News/1.0 (mailto:${MAILTO})` },
        signal: AbortSignal.timeout(25000),
      });
      if (res.status === 429 || res.status >= 500) {
        await sleep(1500 * (attempt + 1));
        continue;
      }
      if (!res.ok) {
        log(`  ! ${mode} "${phrase}" -> HTTP ${res.status}`);
        return [];
      }
      const json = await res.json();
      const items = (json.message?.items || []) as CrossrefItem[];
      const np = norm(phrase);
      return items
        .filter((it) => norm(it.title?.[0] || "").includes(np))
        .map((it) => toPaper(it, moduleId, mode, phrase));
    } catch {
      await sleep(1000 * (attempt + 1));
    }
  }
  log(`  ! ${mode} "${phrase}" -> failed after retries`);
  return [];
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Dedupe by DOI (or normalized title), keeping the first (already sorted) copy.
function dedupe(papers: Paper[]): Paper[] {
  const seen = new Set<string>();
  const out: Paper[] = [];
  for (const p of papers) {
    const key = (p.doi ? p.doi.toLowerCase() : norm(p.title)) || p.id;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

export async function buildPapers(log: (m: string) => void = () => {}): Promise<Paper[]> {
  const all: Paper[] = [];
  for (const group of PAPER_TOPICS) {
    const classic: Paper[] = [];
    const latest: Paper[] = [];
    for (const phrase of group.phrases) {
      classic.push(...(await fetchPhrase(phrase, "classic", group.moduleId, log)));
      await sleep(300); // pace requests (Crossref is lenient, but be polite)
      latest.push(...(await fetchPhrase(phrase, "latest", group.moduleId, log)));
      await sleep(300);
    }
    // Classic: most-cited first. Latest: newest first, minus any already in classic.
    const c = dedupe(classic.sort((a, b) => b.citations - a.citations)).slice(0, CLASSIC_PER_MODULE);
    const cKeys = new Set(c.map((p) => p.doi || norm(p.title)));
    const l = dedupe(latest.sort((a, b) => (b.year ?? 0) - (a.year ?? 0)))
      .filter((p) => !cKeys.has(p.doi || norm(p.title)))
      .slice(0, LATEST_PER_MODULE);
    log(`  ${group.moduleId}: ${c.length} classic, ${l.length} latest`);
    all.push(...c, ...l);
  }
  return all;
}
