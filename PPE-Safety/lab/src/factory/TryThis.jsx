import { ChevronLeft, ChevronRight, Lightbulb, Play, Undo2 } from "lucide-react";

/**
 * Try This — one thing to try at a time, with a button that does it for you
 * on the real floor so the effect can be watched rather than imagined.
 *
 * One tip's demonstration stands at a time, and the button says which way
 * it is about to go: it shows this tip's fault, then puts that same fault
 * back. When another tip is still standing it says so, because the floor
 * changing in two places at once is exactly what makes a demonstration
 * impossible to read.
 */
export default function TryThis({ steps, index, onPrev, onNext, onShowMe, showing = false, clears = null, busy }) {
  const step = steps[index];
  return (
    <section className="panel flex flex-col p-4">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-hazard-dim text-hazard">
          <Lightbulb size={15} />
        </span>
        <h2 className="text-sm font-semibold text-ink">Try This</h2>
        <span className="machine ml-auto text-[11px] text-ink-faint">{index + 1}/{steps.length}</span>
      </div>
      <p className="mt-3 flex-1 text-sm leading-relaxed text-ink">{step.text}</p>
      {clears && (
        <p className="mt-2 text-[11px] leading-snug text-ink-faint">
          {clears} is still on the floor — Show Me puts it back first, so this tip is the only thing happening.
        </p>
      )}
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={onShowMe}
          disabled={busy}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-40 ${
            showing ? "border border-line text-ink" : "bg-vision text-white"
          }`}
        >
          {showing ? <Undo2 size={14} /> : <Play size={14} />}
          {showing ? "Put it back" : "Show Me"}
        </button>
        <div className="ml-auto flex gap-1">
          <button type="button" onClick={onPrev} aria-label="Previous tip" className="rounded-lg border border-line p-1.5 text-ink-faint hover:text-ink">
            <ChevronLeft size={14} />
          </button>
          <button type="button" onClick={onNext} aria-label="Next tip" className="rounded-lg border border-line p-1.5 text-ink-faint hover:text-ink">
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </section>
  );
}
