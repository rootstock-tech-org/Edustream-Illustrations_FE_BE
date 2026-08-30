// Module A — main runner. One command does everything for a keyword and writes
// ONE category-labeled CSV per run (mail: news_[keyword]_[date].csv).
//
// Run: node --env-file=.env node_modules/tsx/dist/cli.mjs tool/run.ts "quantum computing"
import { fetchGoogleNews, topHeadlines, latestNews } from "./googleNews";
import { fetchPapers } from "./papers";
import { fetchPeople } from "./people";
import { fetchComparison } from "./comparison";
import { writeCSV } from "./csv";
import { EXPORT_COLUMNS, newsRows, paperRows, peopleRows, comparisonRows, type ExportRow } from "./export";

// "Quantum Computing" -> "quantum_computing" for safe file names.
function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

async function main() {
  const keyword = process.argv[2];
  if (!keyword) {
    console.error('Usage: ... tool/run.ts "your keyword"');
    process.exit(1);
  }
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  console.log(`\nRunning Module A for "${keyword}" ...\n`);

  // Fetch everything in parallel; each source already fails safe (returns []).
  const news = await fetchGoogleNews(keyword, { when: "7d" });
  const [papers, comparison] = await Promise.all([fetchPapers(keyword), fetchComparison(keyword)]);
  const people = await fetchPeople(papers, keyword);

  if (comparison.error) console.log(`NOTE (comparison): ${comparison.error}`);

  const headlines = topHeadlines(news);
  const latest = latestNews(news);

  // One category-labeled row set for the whole run.
  const rows: ExportRow[] = [
    ...newsRows(headlines, "Top Headlines"),
    ...newsRows(latest, "Latest News"),
    ...paperRows(papers),
    ...peopleRows(people),
    ...comparisonRows(comparison.players),
  ];

  const path = writeCSV(`news_${slug(keyword)}_${date}.csv`, rows, EXPORT_COLUMNS);

  console.log("Rows:");
  console.log(`  Top Headlines : ${headlines.length}`);
  console.log(`  Latest News   : ${latest.length}`);
  console.log(`  Papers        : ${papers.length}`);
  console.log(`  People        : ${people.length}`);
  console.log(`  Comparison    : ${comparison.players.length}`);
  console.log(`  TOTAL rows    : ${rows.length}`);
  console.log(`\nCSV written: ${path}`);
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
