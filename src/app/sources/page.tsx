"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type DiscoveredSource = { name: string; count: number };

function SourcesInner() {
  const params = useSearchParams();
  const router = useRouter();
  const topic = (params.get("topic") || "").trim();
  const region = params.get("region") || "IN";

  const [all, setAll] = useState<DiscoveredSource[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [custom, setCustom] = useState("");
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState<number | null>(null);

  useEffect(() => {
    if (!topic) return;
    setLoading(true);
    fetch(`/api/sources?topic=${encodeURIComponent(topic)}&region=${region}`)
      .then((r) => r.json())
      .then((d) => {
        const list: DiscoveredSource[] = d.sources || [];
        setAll(list);
        setSelected(list.map((s) => s.name)); // start with all selected
      })
      .catch(() => setAll([]))
      .finally(() => setLoading(false));
  }, [topic]);

  function remove(name: string) {
    setSelected((s) => s.filter((n) => n !== name));
    setSaved(null);
  }

  function addCustom() {
    const name = custom
      .trim()
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./i, "")
      .replace(/\/+$/, "");
    if (!name || selected.some((s) => s.toLowerCase() === name.toLowerCase())) return;
    setSelected((s) => [...s, name]);
    setCustom("");
    setSaved(null);
  }

  async function saveAndContinue() {
    const shown = all.map((s) => s.name);
    await fetch("/api/memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic, kind: "sources", shown, selected }),
    });
    await fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic, region, sources: selected }),
    });
    router.push(`/keywords?topic=${encodeURIComponent(topic)}&region=${region}`);
  }

  if (!topic) {
    return <p className="text-slate-600 dark:text-slate-400">No topic. Go back and enter one.</p>;
  }

  return (
    <div className="w-full max-w-2xl">
      <p className="text-sm font-medium tracking-wide text-slate-500 mb-2 dark:text-slate-400">STEP 2 OF 4</p>
      <h1 className="text-3xl font-semibold text-slate-900 mb-1 dark:text-slate-100">Sources</h1>
      <p className="text-slate-600 mb-6 dark:text-slate-400">
        These sources cover <span className="font-semibold text-slate-900 dark:text-slate-100">{topic}</span>. Remove the ones
        you do not want, or add your own.
      </p>

      {loading ? (
        <p className="text-slate-500 dark:text-slate-400">Finding sources...</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 mb-6">
            {selected.length === 0 && <p className="text-slate-500 dark:text-slate-400">No sources selected.</p>}
            {selected.map((name) => (
              <span
                key={name}
                className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                {name}
                <button
                  onClick={() => remove(name)}
                  className="ml-1 rounded-full text-slate-400 hover:text-red-600"
                  aria-label={`Remove ${name}`}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                </button>
              </span>
            ))}
          </div>

          <div className="flex gap-2 mb-2">
            <input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addCustom()}
              placeholder="Add any source, e.g. The Verge or huggingface.co"
              className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-slate-900 outline-none focus:border-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-slate-400"
            />
            <button
              onClick={addCustom}
              className="rounded-lg border border-slate-300 px-4 py-2.5 font-medium text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              + Add
            </button>
          </div>
          <p className="mb-8 text-xs text-slate-500 dark:text-slate-400">
            Add any source by name (e.g. <span className="font-medium">The Verge</span>) or a site
            (e.g. <span className="font-medium">huggingface.co</span>) and its stories on this topic
            will be pulled in.
          </p>

          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push("/")}
              className="rounded-lg border border-slate-300 px-5 py-2.5 font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Back
            </button>
            <button
              onClick={saveAndContinue}
              className="rounded-lg bg-slate-900 px-5 py-2.5 font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
            >
              Save &amp; continue
            </button>
            {saved !== null && (
              <span className="text-sm text-green-700">Saved {saved} sources to config.yaml.</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function SourcesPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-12 dark:bg-slate-950">
      <Suspense fallback={<p className="text-slate-500 dark:text-slate-400">Loading...</p>}>
        <SourcesInner />
      </Suspense>
    </main>
  );
}
