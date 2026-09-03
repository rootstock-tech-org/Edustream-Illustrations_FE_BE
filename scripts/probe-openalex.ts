// STEP 1 probe: does OpenAlex return relevant VLSI papers per topic?
// For each test topic, print Classic (most-cited) + Latest (2024+), so we can
// eyeball accuracy before building anything. Free API, no key.
// Pass phrases as CLI args to test your own, e.g.:
//   npx tsx scripts/probe-openalex.ts "EUV lithography" "clock tree synthesis"
const ARG_TOPICS = process.argv.slice(2);
const TOPICS = ARG_TOPICS.length ? ARG_TOPICS : ["static timing analysis", "FinFET", "clock domain crossing"];

type Work = {
  display_name: string;
  publication_year: number;
  cited_by_count: number;
  doi: string | null;
  primary_location?: { source?: { display_name?: string } | null } | null;
  open_access?: { is_oa?: boolean; oa_url?: string | null } | null;
};

async function query(topic: string, mode: "classic" | "latest"): Promise<Work[]> {
  const base = "https://api.openalex.org/works";
  // Precision levers: require the phrase in title+abstract AND constrain to
  // hardware-relevant fields (Engineering / CS / Materials / Physics).
  const FIELDS = "fields/22|fields/17|fields/25|fields/31"; // Eng | CompSci | Materials | Physics
  // Match the phrase in the TITLE only: a paper ABOUT a topic names it in the
  // title, whereas papers that merely USE the tech only mention it in the abstract.
  let filter = `title.search:"${topic}",primary_topic.field.id:${FIELDS}`;
  // Latest is date-sorted, so require a real journal/conference (kills Zenodo/
  // preprint self-published spam that floods a pure date sort).
  if (mode === "latest") filter += ",from_publication_date:2024-01-01,type:article,primary_location.source.type:journal|conference";
  const params = new URLSearchParams({
    filter,
    per_page: "5",
    sort: mode === "classic" ? "cited_by_count:desc" : "publication_date:desc",
    select: "display_name,publication_year,cited_by_count,doi,primary_location,open_access",
    mailto: "anjaneyatiwarii@gmail.com",
  });
  const res = await fetch(`${base}?${params}`, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.results as Work[];
}

function show(w: Work) {
  const venue = w.primary_location?.source?.display_name || "—";
  const oa = w.open_access?.oa_url ? "PDF" : "no-oa";
  console.log(`  [${w.publication_year}] cites=${w.cited_by_count} ${oa} <${venue}>`);
  console.log(`     ${w.display_name?.slice(0, 95)}`);
}

(async () => {
  for (const topic of TOPICS) {
    console.log(`\n================ TOPIC: ${topic} ================`);
    try {
      console.log("--- CLASSIC (most cited) ---");
      (await query(topic, "classic")).forEach(show);
      console.log("--- LATEST (2024+) ---");
      (await query(topic, "latest")).forEach(show);
    } catch (e) {
      console.log("  ERROR: " + (e as Error).message);
    }
  }
})();
