import { useState } from "react";
import { AlertTriangle, Check, ChevronDown, Forklift, Pentagon, RotateCcw, Square, UserPlus, X } from "lucide-react";

import { ZONE_TYPES } from "../engine/world.js";
import { ZONE_PALETTE } from "../floor/floorLook.js";
import { SCENARIOS } from "../floor/scenarios.js";

/**
 * Experiment Controls — inject a real fault into the floor and take it
 * back, add a worker, drive the forklift, or mark a new area.
 */
export default function ExperimentControls({
  scenarioId, onScenario, applied, onInject, onRestore,
  onAddWorker, onMoveForklift,
  drawing, draftCount, onStartZone, onFinishZone, onCancelZone,
  busy,
}) {
  const [zoneMenu, setZoneMenu] = useState(false);
  const scenario = SCENARIOS.find((entry) => entry.id === scenarioId) ?? SCENARIOS[0];

  if (drawing) {
    return (
      <section className="panel p-4">
        <h2 className="text-sm font-semibold text-ink">Create Zone</h2>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-2 text-sm text-ink">
            <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ background: ZONE_PALETTE[drawing] }} />
            Marking a {ZONE_TYPES[drawing]?.name.toLowerCase()}
          </span>
          <span className="text-xs text-ink-dim">
            Click the corners on the floor · <span className="machine text-vision">{draftCount}</span> placed — at least 3 make an area.
          </span>
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={onFinishZone}
              disabled={draftCount < 3}
              className="inline-flex items-center gap-1.5 rounded-lg bg-vision px-3.5 py-2 text-xs font-medium text-white disabled:opacity-35"
            >
              <Check size={13} />
              Done
            </button>
            <button type="button" onClick={onCancelZone} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3.5 py-2 text-xs text-ink-dim hover:text-ink">
              <X size={13} />
              Cancel
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="panel p-4">
      <h2 className="text-sm font-semibold text-ink">Experiment Controls</h2>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-ink-dim">
          Scenario
          <span className="relative">
            <select
              value={scenarioId}
              onChange={(event) => onScenario(event.target.value)}
              aria-label="Scenario"
              className="appearance-none rounded-lg border border-line bg-inset py-1.5 pl-3 pr-8 text-xs text-ink focus:border-vision focus:outline-none"
            >
              {SCENARIOS.map((entry) => (
                <option key={entry.id} value={entry.id}>{entry.label}</option>
              ))}
            </select>
            <ChevronDown size={13} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-ink-faint" />
          </span>
        </label>
        <p className="min-w-0 flex-1 text-xs leading-relaxed text-ink-dim">{scenario.description}</p>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {applied?.scenarioId === scenario.id ? (
          <Button onClick={onRestore} tone="clear" disabled={busy}>
            <RotateCcw size={14} />
            {scenario.restoreLabel}
          </Button>
        ) : (
          <Button onClick={onInject} tone="hazard" disabled={busy}>
            <AlertTriangle size={14} />
            Inject Fault
          </Button>
        )}
        <Button onClick={onAddWorker} disabled={busy}>
          <UserPlus size={14} />
          Add Worker
        </Button>
        <Button onClick={onMoveForklift} disabled={busy}>
          <Forklift size={14} />
          Move Forklift
        </Button>
        <span className="relative">
          <Button onClick={() => setZoneMenu((current) => !current)} full>
            <Square size={14} />
            Create Zone
          </Button>
          {zoneMenu && (
            <ul className="panel-raised absolute bottom-full left-0 z-20 mb-1 w-52 p-1">
              {Object.values(ZONE_TYPES).map((type) => (
                <li key={type.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setZoneMenu(false);
                      onStartZone(type.id);
                    }}
                    title={type.watches}
                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs text-ink hover:bg-panel"
                  >
                    <Pentagon size={12} style={{ color: ZONE_PALETTE[type.id] }} />
                    {type.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </span>
      </div>
    </section>
  );
}

function Button({ children, onClick, tone, disabled, full }) {
  const cls =
    tone === "hazard"
      ? "border-hazard/60 bg-hazard-dim text-hazard hover:border-hazard"
      : tone === "clear"
        ? "border-clear/50 bg-clear-dim text-clear hover:border-clear"
        : "border-line bg-panel text-ink hover:border-line-strong";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-xs font-medium transition-colors disabled:opacity-40 ${cls} ${full ? "w-full" : ""}`}
    >
      {children}
    </button>
  );
}
