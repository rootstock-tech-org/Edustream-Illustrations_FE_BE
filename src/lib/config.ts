// Read and write the app's config.yaml (topic, sources, keywords).
// The dashboard edits this file, so all steps share one source of truth.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { load, dump } from "js-yaml";

export type AppConfig = {
  topic: string;
  region: string;
  sources: string[];
  keywords: string[];
};

const CONFIG_PATH = join(process.cwd(), "config.yaml");

const EMPTY: AppConfig = { topic: "", region: "IN", sources: [], keywords: [] };

// Read config.yaml, filling in any missing fields with safe defaults.
export function readConfig(): AppConfig {
  if (!existsSync(CONFIG_PATH)) return { ...EMPTY };
  try {
    const raw = load(readFileSync(CONFIG_PATH, "utf8")) as Partial<AppConfig> | null;
    return {
      topic: typeof raw?.topic === "string" ? raw.topic : "",
      region: typeof raw?.region === "string" ? raw.region : "IN",
      sources: Array.isArray(raw?.sources) ? raw!.sources.filter((s) => typeof s === "string") : [],
      keywords: Array.isArray(raw?.keywords) ? raw!.keywords.filter((k) => typeof k === "string") : [],
    };
  } catch {
    return { ...EMPTY };
  }
}

// Write the config back to config.yaml.
export function writeConfig(cfg: AppConfig): void {
  const clean: AppConfig = {
    topic: cfg.topic ?? "",
    region: cfg.region ?? "IN",
    sources: cfg.sources ?? [],
    keywords: cfg.keywords ?? [],
  };
  writeFileSync(CONFIG_PATH, dump(clean), "utf8");
}
