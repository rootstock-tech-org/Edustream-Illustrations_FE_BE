// CSV export for the Explore page. GET /api/export?q=<keyword>&type=<category>
// returns a downloadable CSV for that one category. Reuses the same cached data
// the page shows, and the shared CSV writer, so files match the categories 1:1.
import { toCSV, type Column } from "../../../../tool/csv";
import { topHeadlines, latestNews, type NewsItem } from "../../../../tool/googleNews";
import type { Paper } from "../../../../tool/papers";
import type { Person } from "../../../../tool/people";
import type { Player } from "../../../../tool/comparison";
import { getNews, getPapersAndPeople, getComparison } from "../../../lib/exploreData";

export const dynamic = "force-dynamic";

const NEWS_COLS: Column<NewsItem>[] = [
  { key: "headline", header: "Headline" },
  { key: "source", header: "Source" },
  { key: "date", header: "Date" },
  { key: "link", header: "Link" },
];
const PAPER_COLS: Column<Paper>[] = [
  { key: "title", header: "Title" },
  { key: "authors", header: "Authors" },
  { key: "year", header: "Year" },
  { key: "source", header: "Source" },
  { key: "url", header: "Link" },
];
const PEOPLE_COLS: Column<Person>[] = [
  { key: "name", header: "Name" },
  { key: "affiliation", header: "Affiliation" },
  { key: "papers", header: "Papers" },
];
const PLAYER_COLS: Column<Player>[] = [
  { key: "name", header: "Name" },
  { key: "type", header: "Type" },
  { key: "focus", header: "Focus" },
  { key: "strength", header: "Strength" },
];

async function buildCsv(q: string, type: string): Promise<string | null> {
  switch (type) {
    case "headlines":
      return toCSV(topHeadlines(await getNews(q)), NEWS_COLS);
    case "latest":
      return toCSV(latestNews(await getNews(q)), NEWS_COLS);
    case "papers":
      return toCSV((await getPapersAndPeople(q)).papers, PAPER_COLS);
    case "people":
      return toCSV((await getPapersAndPeople(q)).people, PEOPLE_COLS);
    case "comparison":
      return toCSV((await getComparison(q)).players, PLAYER_COLS);
    default:
      return null;
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  const type = searchParams.get("type") || "headlines";
  if (!q) return new Response("Missing keyword (q)", { status: 400 });

  const csv = await buildCsv(q, type);
  if (csv == null) return new Response("Unknown type", { status: 400 });

  const slug = q.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const date = new Date().toISOString().slice(0, 10);
  const filename = `news_${slug}_${date}_${type}.csv`;

  return new Response("\uFEFF" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
