// Shared, per-topic learning memory. When a user removes or adds a source or
// keyword, we remember it so the next user searching the same topic sees the
// refined list. Fresh news is still fetched every time; these edits are layered
// on top. Conflicts resolve latest-wins.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

export type TopicMemory = {
  removedSources: string[];
  addedSources: string[];
  removedKeywords: string[];
  addedKeywords: string[];
};

type Memory = Record<string, TopicMemory>;

const MEM_PATH = join(process.cwd(), "data", "memory.json");

const low = (s: string) => s.trim().toLowerCase();
const normTopic = (t: string) => t.trim().toLowerCase();

function emptyTopic(): TopicMemory {
  return { removedSources: [], addedSources: [], removedKeywords: [], addedKeywords: [] };
}

function readMemory(): Memory {
  if (!existsSync(MEM_PATH)) return {};
  try {
    return JSON.parse(readFileSync(MEM_PATH, "utf8")) as Memory;
  } catch {
    return {};
  }
}

function writeMemory(m: Memory): void {
  mkdirSync(dirname(MEM_PATH), { recursive: true });
  writeFileSync(MEM_PATH, JSON.stringify(m, null, 2), "utf8");
}

export function getTopicMemory(topic: string): TopicMemory {
  const m = readMemory();
  return { ...emptyTopic(), ...m[normTopic(topic)] };
}

// Layer the learned edits over a freshly discovered list of names:
// drop removed ones, then append added ones that are not already present.
export function applyLearned(discovered: string[], removed: string[], added: string[]): string[] {
  const removedSet = new Set(removed.map(low));
  const base = discovered.filter((d) => !removedSet.has(low(d)));
  const baseSet = new Set(base.map(low));
  const extras = added.filter((a) => !baseSet.has(low(a)));
  return [...base, ...extras];
}

// Merge one user's edit (what they were shown vs what they kept) into the
// learned sets, latest-wins.
function mergeEdit(removed: string[], added: string[], shown: string[], selected: string[]) {
  const selSet = new Set(selected.map(low));
  const shownSet = new Set(shown.map(low));
  const removedThis = shown.filter((s) => !selSet.has(low(s)));
  const addedThis = selected.filter((s) => !shownSet.has(low(s)));

  const removedThisSet = new Set(removedThis.map(low));
  const addedThisSet = new Set(addedThis.map(low));

  // start from existing, drop anything the user reversed this time
  const nextRemoved = removed.filter((r) => !addedThisSet.has(low(r)));
  const nextAdded = added.filter((a) => !removedThisSet.has(low(a)));

  // add this round's edits (dedupe case-insensitively)
  const pushUnique = (arr: string[], items: string[]) => {
    const seen = new Set(arr.map(low));
    for (const it of items) if (!seen.has(low(it))) { arr.push(it); seen.add(low(it)); }
    return arr;
  };
  return {
    removed: pushUnique(nextRemoved, removedThis),
    added: pushUnique(nextAdded, addedThis),
  };
}

// Update a topic's memory after a user saves the sources or keywords step.
export function updateMemory(
  topic: string,
  kind: "sources" | "keywords",
  shown: string[],
  selected: string[]
): void {
  const m = readMemory();
  const key = normTopic(topic);
  const t = { ...emptyTopic(), ...m[key] };

  if (kind === "sources") {
    const r = mergeEdit(t.removedSources, t.addedSources, shown, selected);
    t.removedSources = r.removed;
    t.addedSources = r.added;
  } else {
    const r = mergeEdit(t.removedKeywords, t.addedKeywords, shown, selected);
    t.removedKeywords = r.removed;
    t.addedKeywords = r.added;
  }

  m[key] = t;
  writeMemory(m);
}
