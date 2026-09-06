import { Eye, Pause, Play, RotateCcw } from "lucide-react";

import { clock } from "../floor/labels.js";

/** The camera's own card, top-left of the floor. */
export function CameraCard({ name, floor, readable }) {
  return (
    <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2.5 rounded-lg border border-line bg-ground/85 px-3 py-2 backdrop-blur">
      <Eye size={15} className="text-ink-dim" />
      <div>
        <div className="flex items-center gap-1.5 text-sm font-semibold text-ink">
          <span aria-hidden="true" className={`h-2 w-2 rounded-full ${readable ? "bg-clear" : "bg-hazard"}`} />
          {name}
        </div>
        <div className={`text-[11px] ${readable ? "text-clear" : "text-hazard"}`}>{readable ? "Active" : "Feed unreadable"}</div>
        <div className="text-[11px] text-ink-faint">{floor}</div>
      </div>
    </div>
  );
}

/** Simulation time, transport and playback speed, bottom-left of the floor. */
export function SimControls({ at, running, onToggle, onReset, speed, onSpeed }) {
  return (
    <div className="absolute bottom-3 left-3 rounded-lg border border-line bg-ground/85 p-2.5 backdrop-blur">
      <div className="eyebrow">Simulation Time</div>
      <div className="machine text-lg font-semibold text-ink">{clock(at)}</div>
      <div className="mt-1.5 flex gap-1.5">
        <button
          type="button"
          onClick={onToggle}
          className="inline-flex items-center gap-1.5 rounded-md border border-line bg-panel px-2.5 py-1 text-xs text-ink hover:border-line-strong"
        >
          {running ? <Pause size={12} /> : <Play size={12} />}
          {running ? "Pause" : "Run"}
        </button>
        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center gap-1.5 rounded-md border border-line bg-panel px-2.5 py-1 text-xs text-ink hover:border-line-strong"
        >
          <RotateCcw size={12} />
          Reset
        </button>
      </div>
      <div className="mt-2 eyebrow">Simulation Speed</div>
      <div className="mt-1 flex gap-1">
        {[0.5, 1, 2].map((rate) => (
          <button
            key={rate}
            type="button"
            aria-pressed={speed === rate}
            onClick={() => onSpeed(rate)}
            className={`machine rounded-md border px-2 py-0.5 text-xs ${
              speed === rate ? "border-vision bg-vision-dim text-vision" : "border-line bg-panel text-ink-dim hover:border-line-strong"
            }`}
          >
            {rate}x
          </button>
        ))}
      </div>
    </div>
  );
}
