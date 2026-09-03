// Shared export model (mail: "consistent data model across both modules so one
// CSV export function can serve both"). Every category maps to this one row
// shape, so Module A and Module B both write the same columns.
import type { Column } from "./csv";
import type { NewsItem } from "./googleNews";
import type { Paper } from "./papers";
import type { Person } from "./people";
import type { Player } from "./comparison";

export type ExportRow = {
  category: string;
  title: string;
  source: string;
  date: string;
  summary: string;
  link: string;
};

export const EXPORT_COLUMNS: Column<ExportRow>[] = [
  { key: "category", header: "Category" },
  { key: "title", header: "Title" },
  { key: "source", header: "Source" },
  { key: "date", header: "Date" },
  { key: "summary", header: "Summary" },
  { key: "link", header: "Link" },
];

const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "");

export const newsRows = (items: NewsItem[], category: string): ExportRow[] =>
  items.map((n) => ({
    category,
    title: n.headline,
    source: n.source,
    date: day(n.date),
    summary: "", // a news headline is already its own one-line summary
    link: n.link,
  }));

export const paperRows = (papers: Paper[]): ExportRow[] =>
  papers.map((p) => ({
    category: "Research Paper",
    title: p.title,
    source: `${p.authors.slice(0, 3).join(", ")}${p.authors.length > 3 ? " et al." : ""} (${p.source})`,
    date: p.year ? String(p.year) : "",
    summary: p.summary,
    link: p.url,
  }));

export const peopleRows = (people: Person[]): ExportRow[] =>
  people.map((p) => ({
    category: "Person",
    title: p.name,
    source: p.affiliation,
    date: "",
    summary: p.relevance,
    link: p.profileUrl,
  }));

export const comparisonRows = (players: Player[]): ExportRow[] =>
  players.map((pl) => ({
    category: "Comparison",
    title: pl.name,
    source: pl.type,
    date: "",
    summary: `${pl.focus} — Strength: ${pl.strength}`,
    link: "",
  }));
