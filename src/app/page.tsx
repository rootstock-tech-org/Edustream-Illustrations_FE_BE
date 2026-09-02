"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import GradientWaves from "@/components/GradientWaves";
import SearchBox from "@/components/SearchBox";
import { REGIONS, DEFAULT_REGION } from "@/lib/regions";

const EXAMPLES = ["Sports", "Elections", "AI chips", "Bollywood", "Stock market", "Climate"];

type SavedTopic = { id: string; topic: string; region: string; sources: string[]; keywords: string[]; savedAt: number };

export default function Home() {
  const [topic, setTopic] = useState("");
  const [region, setRegion] = useState(DEFAULT_REGION);
  const [idx, setIdx] = useState(0);
  const router = useRouter();

  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % EXAMPLES.length), 2200);
    return () => clearInterval(t);
  }, []);

  const [saved, setSaved] = useState<SavedTopic[]>([]);
  useEffect(() => {
    fetch("/api/topics").then((r) => r.json()).then((d) => setSaved(d.topics || [])).catch(() => {});
  }, []);

  async function loadTopic(t: SavedTopic) {
    await fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic: t.topic, region: t.region, sources: t.sources, keywords: t.keywords }),
    });
    router.push("/dashboard");
  }

  async function removeTopic(id: string) {
    const r = await fetch(`/api/topics?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    const d = await r.json();
    setSaved(d.topics || []);
  }

  const regionLabel = (code: string) => REGIONS.find((r) => r.code === code)?.label || code;

  function go(t: string) {
    const q = t.trim();
    if (!q) return;
    router.push(`/sources?topic=${encodeURIComponent(q)}&region=${region}`);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    go(topic);
  }

  return (
    <main className="relative min-h-screen flex items-center justify-center overflow-hidden px-4">
      {/* animated WebGL gradient waves background */}
      <div aria-hidden className="absolute inset-0">
        <GradientWaves
          horizonColor="#5227FF"
          waveColor="#FF9FFC"
          crestColor="#FFFFFF"
          speed={0.4}
          amplitude={2.5}
          waveScale={0.6}
          waveRatio={0.9}
          swell={35}
          turbulence={20}
          tilt={1.11}
          zoom={1}
          height={5.5}
          fogDepth={15}
          detail="medium"
          brightness={1}
          opacity={1}
          mouseInteraction
          parallaxStrength={0.5}
          grain
          grainIntensity={0.05}
        />
      </div>

      <div className="relative z-10 flex w-full max-w-xl flex-col gap-4">
        <div className="w-full rounded-2xl border border-white/40 bg-white/70 p-8 shadow-xl backdrop-blur-md">
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-sm font-medium tracking-wide text-slate-600">STEP 1 OF 4</p>
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white/90 px-3 py-1.5 text-sm text-slate-700 outline-none focus:border-slate-900"
            aria-label="Region"
          >
            {REGIONS.map((r) => (
              <option key={r.code} value={r.code}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        <h1 className="text-3xl sm:text-4xl font-semibold text-slate-900 mb-3">
          What would you like to search?
        </h1>
        <p className="mb-6 text-slate-600">
          Try:{" "}
          <span key={idx} className="rotating-word font-semibold text-indigo-600">
            {EXAMPLES[idx]}
          </span>
        </p>

        <form onSubmit={onSubmit} className="flex flex-col gap-2 sm:flex-row">
          <SearchBox value={topic} onChange={setTopic} onSubmit={go} />
          <button
            type="submit"
            className="rounded-lg bg-slate-900 px-5 py-3 font-medium text-white hover:bg-slate-700"
          >
            Search
          </button>
        </form>
        </div>

        {saved.length > 0 && (
          <div className="w-full rounded-2xl border border-white/40 bg-white/60 p-4 shadow-lg backdrop-blur-md">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Saved topics</p>
            <div className="flex flex-wrap gap-2">
              {saved.map((t) => (
                <span
                  key={t.id}
                  className="inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/80 px-3 py-1.5 text-sm text-slate-800 shadow-sm"
                >
                  <button onClick={() => loadTopic(t)} className="font-medium capitalize hover:text-indigo-600">
                    {t.topic}
                  </button>
                  <span className="text-xs text-slate-400">{regionLabel(t.region)}</span>
                  <button
                    onClick={() => removeTopic(t.id)}
                    aria-label={`Delete ${t.topic}`}
                    className="text-slate-400 hover:text-red-600"
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes wordIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .rotating-word { display: inline-block; animation: wordIn 0.4s ease; }
      `}</style>
    </main>
  );
}
