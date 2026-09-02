// Store for the user's saved topic searches (topic + region + chosen sources
// and keywords), so they can revisit any of them. Kept in data/ (gitignored),
// separate from the single active config.yaml.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

export type SavedTopic = {
  id: string;
  topic: string;
  region: string;
  sources: string[];
  keywords: string[];
  savedAt: number;
};

const PATH = join(process.cwd(), "data", "saved-topics.json");

const idOf = (topic: string, region: string) => `${topic.trim().toLowerCase()}__${region}`;
const byNewest = (a: SavedTopic, b: SavedTopic) => b.savedAt - a.savedAt;

function read(): SavedTopic[] {
  if (!existsSync(PATH)) return [];
  try {
    return JSON.parse(readFileSync(PATH, "utf8")) as SavedTopic[];
  } catch {
    return [];
  }
}

function write(list: SavedTopic[]): void {
  mkdirSync(dirname(PATH), { recursive: true });
  writeFileSync(PATH, JSON.stringify(list, null, 2), "utf8");
}

export function listTopics(): SavedTopic[] {
  return read().sort(byNewest);
}

// Save (or update, keyed by topic+region) a topic and return the fresh list.
export function saveTopic(t: Omit<SavedTopic, "id" | "savedAt">): SavedTopic[] {
  const id = idOf(t.topic, t.region);
  const entry: SavedTopic = { id, ...t, savedAt: Date.now() };
  const next = [entry, ...read().filter((x) => x.id !== id)];
  write(next);
  return next.sort(byNewest);
}

export function deleteTopic(id: string): SavedTopic[] {
  const next = read().filter((x) => x.id !== id);
  write(next);
  return next.sort(byNewest);
}
