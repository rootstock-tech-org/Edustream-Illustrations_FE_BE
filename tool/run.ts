// Module A — main runner. One command does everything for a keyword:
// fetch news (top headlines + latest), papers, people, and a comparison, then
// write a SEPARATE Excel-friendly CSV per category into tool/output/.
//
// Run: node --env-file=.env node_modules/tsx/dist/cli.mjs tool/run.ts "quantum computing"
import { fetchGoogleNews, topHeadlines, latestNews } from "./googleNews";
import { fetchPapers } from "./papers";
import { fetchPeople } from "./people";
import { fetchComparison } from "./comparison";
import { writeCSV } from "./csv";

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
  const base = `news_${slug(keyword)}_${date}`;
  console.log(`\nRunning Module A for "${keyword}" ...\n`);

  // Fetch everything in parallel; each source already fails safe (returns []).
  const news = await fetchGoogleNews(keyword, { when: "7d" });
  const [papers, comparison] = await Promise.all([
    fetchPapers(keyword),
    fetchComparison(keyword),
  ]);
  const people = await fetchPeople(papers);

  if (comparison.error) console.log(`NOTE (comparison): ${comparison.error}`);

  const written: string[] = [];

  written.push(
    writeCSV(`${base}_headlines.csv`, topHeadlines(news), [
      { key: "headline", header: "Headline" },
      { key: "source", header: "Source" },
      { key: "date", header: "Date" },
      { key: "link", header: "Link" },
    ])
  );

  written.push(
    writeCSV(`${base}_latest.csv`, latestNews(news), [
      { key: "headline", header: "Headline" },
      { key: "source", header: "Source" },
      { key: "date", header: "Date" },
      { key: "link", header: "Link" },
    ])
  );

  written.push(
    writeCSV(`${base}_papers.csv`, papers, [
      { key: "title", header: "Title" },
      { key: "authors", header: "Authors" },
      { key: "year", header: "Year" },
      { key: "source", header: "Source" },
      { key: "url", header: "Link" },
    ])
  );

  written.push(
    writeCSV(`${base}_people.csv`, people, [
      { key: "name", header: "Name" },
      { key: "affiliation", header: "Affiliation" },
      { key: "papers", header: "Papers" },
    ])
  );

  written.push(
    writeCSV(`${base}_comparison.csv`, comparison.players, [
      { key: "name", header: "Name" },
      { key: "type", header: "Type" },
      { key: "focus", header: "Focus" },
      { key: "strength", header: "Strength" },
    ])
  );

  console.log("Rows:");
  console.log(`  headlines : ${topHeadlines(news).length}`);
  console.log(`  latest    : ${latestNews(news).length}`);
  console.log(`  papers    : ${papers.length}`);
  console.log(`  people    : ${people.length}`);
  console.log(`  comparison: ${comparison.players.length}`);
  console.log("\nCSV files written:");
  for (const p of written) console.log(`  ${p}`);
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
