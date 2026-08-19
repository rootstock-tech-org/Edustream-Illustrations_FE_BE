"use client";

// "Save for later" storage + hook. All reads/writes go through readStore/writeStore
// so moving from localStorage to a per-user backend (AVSAR/Supabase) later only
// touches those two functions - the button, the page and the hook stay the same.
import { useCallback, useEffect, useState } from "react";

export type SavedArticle = {
  link: string; // unique id of the article
  title: string;
  source: string;
  image: string | null;
  moduleId: string;
  module: string;
  publishedAt: string | null;
  savedAt: string; // ISO time the user saved it
};

const STORAGE_KEY = "avsar:saved:v1";

// ---- storage layer (swap this for Supabase in phase 2) ----
function readStore(): SavedArticle[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeStore(list: SavedArticle[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

// ---- in-memory cache + tiny pub/sub so every button/page stays in sync ----
let cache: SavedArticle[] | null = null;
const listeners = new Set<() => void>();

function getSaved(): SavedArticle[] {
  if (cache === null) cache = readStore();
  return cache;
}

function setSaved(list: SavedArticle[]): void {
  cache = list;
  writeStore(list);
  listeners.forEach((fn) => fn());
}

// Another browser tab saved something -> refresh our cache and re-render.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY) {
      cache = readStore();
      listeners.forEach((fn) => fn());
    }
  });
}

// ---- the React hook components use ----
export function useBookmarks() {
  // Start empty so server and first client render match (no hydration mismatch),
  // then load the real list right after mount.
  const [saved, setSavedState] = useState<SavedArticle[]>([]);

  useEffect(() => {
    setSavedState(getSaved());
    const sync = () => setSavedState([...getSaved()]);
    listeners.add(sync);
    return () => {
      listeners.delete(sync);
    };
  }, []);

  const isSaved = useCallback((link: string) => saved.some((s) => s.link === link), [saved]);

  const toggle = useCallback((a: Omit<SavedArticle, "savedAt">) => {
    const list = getSaved();
    const exists = list.some((s) => s.link === a.link);
    setSaved(exists ? list.filter((s) => s.link !== a.link) : [{ ...a, savedAt: new Date().toISOString() }, ...list]);
  }, []);

  const remove = useCallback((link: string) => {
    setSaved(getSaved().filter((s) => s.link !== link));
  }, []);

  return { saved, isSaved, toggle, remove, count: saved.length };
}
