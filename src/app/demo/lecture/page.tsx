import { DoYouKnowTicker } from "../../../components/DoYouKnowTicker";

// Demo of how the "Do You Know?" ticker sits under a lecture on the AVSAR side.
// Same-origin here, so apiBase is "" (calls /api/related on this server).
export const metadata = { title: "Do You Know? demo · AVSAR" };

export default function DemoLecturePage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <p className="text-xs font-semibold uppercase tracking-wide text-indigo-500">Module 11 · Semiconductor Packaging &amp; Final Test</p>
      <h1 className="mt-1 text-2xl font-bold text-slate-900">Ch11.9 — HBM, CoWoS &amp; Foveros</h1>
      <p className="mt-4 leading-relaxed text-slate-600">
        High Bandwidth Memory (HBM) stacks several DRAM dies vertically and connects them with
        through-silicon vias, sitting beside the processor on a silicon interposer. Advanced
        packaging flows such as TSMC&apos;s CoWoS and Intel&apos;s Foveros are what make today&apos;s
        AI accelerators possible.
      </p>
      <p className="mt-3 leading-relaxed text-slate-600">
        As you study this topic, the strip below shows the latest real-world news for this module —
        it rotates on its own. Close it if it distracts you; bring it back anytime.
      </p>

      {/* The feature: a rotating, dismissible news ticker scoped to this module. */}
      <div className="mt-8">
        <DoYouKnowTicker apiBase="" module="packaging" />
      </div>

      <p className="mt-8 text-sm text-slate-400">
        (Demo. On AVSAR this component receives the lesson&apos;s <code>topic</code> number and the
        deployed news-engine URL as <code>apiBase</code>.)
      </p>
    </div>
  );
}
