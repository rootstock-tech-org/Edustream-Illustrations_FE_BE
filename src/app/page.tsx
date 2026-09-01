"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import GradientWaves from "@/components/GradientWaves";
import SearchBox from "@/components/SearchBox";
import { REGIONS, DEFAULT_REGION } from "@/lib/regions";

const EXAMPLES = ["Sports", "Elections", "AI chips", "Bollywood", "Stock market", "Climate"];

export default function Home() {
  const [topic, setTopic] = useState("");
  const [region, setRegion] = useState(DEFAULT_REGION);
  const [idx, setIdx] = useState(0);
  const router = useRouter();

  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % EXAMPLES.length), 2200);
    return () => clearInterval(t);
  }, []);

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

      <div className="relative z-10 w-full max-w-xl rounded-2xl border border-white/40 bg-white/70 p-8 shadow-xl backdrop-blur-md">
        <p className="text-sm font-medium tracking-wide text-slate-600 mb-2">STEP 1 OF 4</p>
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
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white/90 px-3 py-3 text-slate-900 outline-none focus:border-slate-900"
            aria-label="Region"
          >
            {REGIONS.map((r) => (
              <option key={r.code} value={r.code}>
                {r.label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-lg bg-slate-900 px-5 py-3 font-medium text-white hover:bg-slate-700"
          >
            Search
          </button>
        </form>
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
