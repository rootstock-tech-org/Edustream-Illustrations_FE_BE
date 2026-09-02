"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type SuggestedKeyword = { word: string; count: number };

function KeywordsInner() {
  const params = useSearchParams();
  const router = useRouter();
  const topic = (params.get("topic") || "").trim();
  const region = params.get("region") || "IN";

  const [all, setAll] = useState<SuggestedKeyword[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [custom, setCustom] = useState("");
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState<number | null>(null);

  useEffect(() => {
    if (!topic) return;
    setLoading(true);
    fetch(`/api/keywords?topic=${encodeURIComponent(topic)}&region=${region}`)
      .then((r) => r.json())
      .then((d) => {
        const list: SuggestedKeyword[] = d.keywords || [];
        setAll(list);
        setSelected(list.map((k) => k.word));
      })
      .catch(() => setAll([]))
      .finally(() => setLoading(false));
  }, [topic]);

  function remove(word: string) {
    setSelected((s) => s.filter((w) => w !== word));
    setSaved(null);
  }

  function addCustom() {
    const word = custom.trim().toLowerCase();
    if (!word || selected.includes(word)) return;
    setSelected((s) => [...s, word]);
    setCustom("");
    setSaved(null);
  }

  async function saveAndContinue() {
    const shown = all.map((k) => k.word);
    await fetch("/api/memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic, kind: "keywords", shown, selected }),
    });
    await fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic, region, keywords: selected }),
    });
    router.push("/dashboard");
  }

  if (!topic) return <p className="text-slate-600">No topic. Go back and enter one.</p>;

  return (
    <div className="w-full max-w-2xl">
      <p className="text-sm font-medium tracking-wide text-slate-500 mb-2">STEP 3 OF 4</p>
      <h1 className="text-3xl font-semibold text-slate-900 mb-1">Keywords</h1>
      <p className="text-slate-600 mb-6">
        Suggested keywords for <span className="font-semibold text-slate-900">{topic}</span>. Remove any you
        do not want, or add your own.
      </p>

      {loading ? (
        <p className="text-slate-500">Suggesting keywords...</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 mb-6">
            {selected.length === 0 && <p className="text-slate-500">No keywords selected.</p>}
            {selected.map((word) => (
              <span
                key={word}
                className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800"
              >
                {word}
                <button
                  onClick={() => remove(word)}
                  className="ml-1 rounded-full text-slate-400 hover:text-red-600"
                  aria-label={`Remove ${word}`}
                >
                  ✕
                </button>
              </span>
            ))}
          </div>

          <div className="flex gap-2 mb-8">
            <input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addCustom()}
              placeholder="Add a keyword, e.g. transfers"
              className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-slate-900 outline-none focus:border-slate-900"
            />
            <button
              onClick={addCustom}
              className="rounded-lg border border-slate-300 px-4 py-2.5 font-medium text-slate-800 hover:bg-slate-100"
            >
              + Add
            </button>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push(`/sources?topic=${encodeURIComponent(topic)}&region=${region}`)}
              className="rounded-lg border border-slate-300 px-5 py-2.5 font-medium text-slate-700 hover:bg-slate-100"
            >
              Back
            </button>
            <button
              onClick={saveAndContinue}
              className="rounded-lg bg-slate-900 px-5 py-2.5 font-medium text-white hover:bg-slate-700"
            >
              Save &amp; continue
            </button>
            {saved !== null && (
              <span className="text-sm text-green-700">Saved {saved} keywords to config.yaml.</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function KeywordsPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-12">
      <Suspense fallback={<p className="text-slate-500">Loading...</p>}>
        <KeywordsInner />
      </Suspense>
    </main>
  );
}
