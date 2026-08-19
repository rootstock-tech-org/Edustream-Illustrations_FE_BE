// Diagnostic: re-tag every stored article and print module + matched keywords,
// so we can eyeball keyword mismatches. Read-only, not part of the pipeline.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { tagArticle } from "../lib/tag";

type Stored = { title: string; summary: string; moduleId: string; module: string };

const news = JSON.parse(readFileSync(join(process.cwd(), "data", "news.json"), "utf8"));
const articles: Stored[] = news.articles;

const byModule: Record<string, { title: string; matched: string[] }[]> = {};
for (const a of articles) {
  const tag = tagArticle(a.title, a.summary || "");
  const key = a.moduleId;
  (byModule[key] ||= []).push({ title: a.title, matched: tag ? tag.matched : [] });
}

const order = Object.keys(byModule).sort((x, y) => byModule[y].length - byModule[x].length);
for (const m of order) {
  console.log(`\n===== ${m}  (${byModule[m].length}) =====`);
  for (const r of byModule[m]) {
    console.log(`  [${r.matched.join(", ")}]`);
    console.log(`     ${r.title.slice(0, 100)}`);
  }
}
