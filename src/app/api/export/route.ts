// CSV export for the Explore page. GET /api/export?q=<keyword> returns ONE
// category-labeled CSV for the whole run (mail: one file per run,
// news_[keyword]_[date].csv). Reuses the cached data the page shows and the
// shared ExportRow model, so the web download matches the CLI output.
import { toCSV } from "../../../../tool/csv";
import { topHeadlines, latestNews } from "../../../../tool/googleNews";
import { EXPORT_COLUMNS, newsRows, paperRows, peopleRows, comparisonRows, type ExportRow } from "../../../../tool/export";
import { getNews, getPapersAndPeople, getComparison } from "../../../lib/exploreData";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  if (!q) return new Response("Missing keyword (q)", { status: 400 });

  const [news, pp, cmp] = await Promise.all([getNews(q), getPapersAndPeople(q), getComparison(q)]);

  const rows: ExportRow[] = [
    ...newsRows(topHeadlines(news), "Top Headlines"),
    ...newsRows(latestNews(news), "Latest News"),
    ...paperRows(pp.papers),
    ...peopleRows(pp.people),
    ...comparisonRows(cmp.players),
  ];

  const slug = q.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const date = new Date().toISOString().slice(0, 10);
  const filename = `news_${slug}_${date}.csv`;

  return new Response("\uFEFF" + toCSV(rows, EXPORT_COLUMNS), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
