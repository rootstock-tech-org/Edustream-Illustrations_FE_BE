// Module A — generic CSV writer. Give it rows + which columns to output, and it
// writes an Excel-friendly CSV (UTF-8 BOM, proper quoting) into tool/output/.
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export type Column<T> = { key: keyof T; header: string };

function cell(v: any): string {
  if (v == null) return "";
  const s = Array.isArray(v) ? v.join("; ") : String(v);
  // Quote if the value contains a comma, quote, or newline.
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function toCSV<T extends Record<string, any>>(rows: T[], columns: Column<T>[]): string {
  const head = columns.map((c) => cell(c.header)).join(",");
  const body = rows.map((r) => columns.map((c) => cell(r[c.key])).join(",")).join("\n");
  return head + "\n" + body + "\n";
}

export const OUT_DIR = join(process.cwd(), "tool", "output");

// Write one CSV file into tool/output/ and return its full path.
export function writeCSV<T extends Record<string, any>>(
  filename: string,
  rows: T[],
  columns: Column<T>[]
): string {
  mkdirSync(OUT_DIR, { recursive: true });
  const path = join(OUT_DIR, filename);
  // Leading BOM so Excel reads accents (e.g. Ćiprijanović) correctly.
  writeFileSync(path, "\uFEFF" + toCSV(rows, columns), "utf8");
  return path;
}
