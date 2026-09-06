import { useCallback, useRef, useState } from "react";

import { KINDS, addThing, addZone, findThing, moveThing, removeThing, removeZone, toggleGear } from "../engine/world.js";
import { SPAWN_POINTS } from "../floor/scene.js";
import { FORKLIFT_ROUTE, SCENARIOS, getScenario, setOpen } from "../floor/scenarios.js";
import useSimulation from "../floor/useSimulation.js";
import ExperimentControls from "../factory/ExperimentControls.jsx";
import FactoryCanvas from "../factory/FactoryCanvas.jsx";
import { CameraCard, SimControls } from "../factory/Overlays.jsx";
import Pipeline from "../factory/Pipeline.jsx";
import RecentEvents from "../factory/RecentEvents.jsx";
import SelectedPanel from "../factory/SelectedPanel.jsx";
import TryThis from "../factory/TryThis.jsx";
import Tutor from "../factory/Tutor.jsx";

/**
 * The simulation page: Factory Floor A as Camera 01 sees it, the live
 * pipeline that judges every frame, the events that judging produced, the
 * thing the viewer has selected, and the controls to break things on
 * purpose.
 */

const STEPS = [
  {
    text: "Click on a worker to see what the AI detects. Then remove their helmet using the controls to trigger a violation.",
    action: "ppe",
  },
  {
    text: "Drag Worker 01 into the Restricted Zone and watch the zone check fail — after three agreeing sightings, not one.",
    action: "zone",
  },
  {
    text: "Click Door 01 to open it and leave it. After 3 seconds it is reported, and the alert escalates the longer it stays open.",
    action: "door",
  },
  {
    text: "Drive the forklift across the walkway to trip the walkway check — an obstruction rule, so a worker in it is fine and a forklift is not.",
    action: "walkway",
  },
  {
    text: "Cut the camera's lighting and watch the system refuse to judge — a picture it cannot read is never reported as a calm floor.",
    action: "dark",
  },
];

export default function Factory() {
  const sim = useSimulation({ fps: 10 });
  const { world, setWorld, conditions, setConditions, result, run, openEvents, log, bars, fps, zoneSince, reading } = sim;

  const [selectedId, setSelectedId] = useState(null);
  const [drawing, setDrawing] = useState(null);
  const [draft, setDraft] = useState([]);
  const [scenarioId, setScenarioId] = useState(SCENARIOS[0].id);
  const [applied, setApplied] = useState(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [pulseId, setPulseId] = useState(null);
  const [busy, setBusy] = useState(false);
  const animations = useRef(new Map());
  const routeIndex = useRef(0);

  const readable = reading.readable;

  const stopAnimating = useCallback((id) => {
    if (animations.current.has(id)) cancelAnimationFrame(animations.current.get(id));
    animations.current.delete(id);
  }, []);

  /* Walk a thing somewhere over a few hundred milliseconds. */
  const animateMove = useCallback((id, toX, toY, ms = 700) => {
    const thing = findThing(world, id);
    if (!thing) return;
    const fromX = thing.x;
    const fromY = thing.y;
    const started = performance.now();
    if (animations.current.has(id)) cancelAnimationFrame(animations.current.get(id));
    const tick = (now) => {
      const t = Math.min(1, (now - started) / ms);
      const ease = 1 - Math.pow(1 - t, 3);
      setWorld((current) => moveThing(current, id, fromX + (toX - fromX) * ease, fromY + (toY - fromY) * ease));
      if (t < 1) animations.current.set(id, requestAnimationFrame(tick));
      else animations.current.delete(id);
    };
    animations.current.set(id, requestAnimationFrame(tick));
  }, [world, setWorld]);

  const pulse = useCallback((id) => {
    setPulseId(id);
    window.setTimeout(() => setPulseId((current) => (current === id ? null : current)), 3000);
  }, []);

  /*
   * Apply what a scenario returns — a world change, moves, conditions.
   *
   * `quiet` puts a change through without animating it or moving the
   * selection: it is how a standing demonstration is cleared away before
   * the next one is shown, where the learner's attention belongs on what
   * is arriving rather than on watching the last one walk home.
   */
  const enact = useCallback((change, { quiet = false } = {}) => {
    if (!change) return;
    if (change.world) setWorld(change.world);
    for (const move of change.moves ?? []) {
      if (quiet) {
        stopAnimating(move.id);
        setWorld((current) => moveThing(current, move.id, move.x, move.y));
      } else {
        animateMove(move.id, move.x, move.y);
      }
    }
    if (change.conditions) setConditions(change.conditions);
    if (!quiet && change.focus !== undefined && change.focus !== null) {
      setSelectedId(change.focus);
      pulse(change.focus);
    }
  }, [animateMove, pulse, setConditions, setWorld, stopAnimating]);

  /* The world a change leaves behind, without waiting for any animation. */
  const settle = (from, change) => {
    if (!change) return from;
    let next = change.world ? change.world(from) : from;
    for (const move of change.moves ?? []) next = moveThing(next, move.id, move.x, move.y);
    return next;
  };

  /*
   * Inject a fault — after putting back whatever fault is already standing.
   *
   * `applied` is a single slot: it holds the one record of how to undo what
   * was done to the floor. Injecting a second fault on top of it used to
   * overwrite that record, which stranded the first — the floor kept a
   * change nothing could reverse any more. It also piled the tips up, so a
   * learner reading "3/5" was watching the first three at once, which is
   * the very confusion Try This exists to clear up. One stands at a time.
   */
  const inject = useCallback((id = scenarioId) => {
    const scenario = getScenario(id);

    const standing =
      applied && applied.scenarioId !== id
        ? getScenario(applied.scenarioId).restore(world, applied.subject, applied.from, conditions)
        : null;

    // The new fault is worked out against the floor the clean-up leaves,
    // not the one still carrying the old fault, so what it records as
    // "where this came from" is somewhere it can actually be put back to.
    const change = scenario.apply(settle(world, standing), standing?.conditions ?? conditions);

    if (standing) enact({ ...standing, focus: null }, { quiet: true });
    if (!change) {
      if (standing) setApplied(null);
      return false;
    }
    enact(change);
    setApplied({ scenarioId: scenario.id, subject: change.subject ?? null, from: change.from ?? null });
    return true;
  }, [applied, conditions, enact, scenarioId, world]);

  const restore = useCallback(() => {
    if (!applied) return;
    const scenario = getScenario(applied.scenarioId);
    const change = scenario.restore(world, applied.subject, applied.from, conditions);
    enact(change);
    setApplied(null);
  }, [applied, conditions, enact, world]);

  // Picking a different experiment does not touch the floor, and must not
  // forget what is standing on it either: the fault stays undoable, and
  // injecting the newly picked one puts it back first.
  const chooseScenario = (id) => setScenarioId(id);

  /*
   * Try This — do the tip on the real floor.
   *
   * The button is a toggle: it shows this tip's fault, and once that fault
   * is standing it puts it back, so the same tip can be watched again from
   * a clean floor. Injecting clears any other tip still standing, which is
   * what keeps "3/5" meaning the third tip rather than the first three.
   */
  const stepShowing = applied?.scenarioId === STEPS[stepIndex].action;
  const stepClears =
    applied && !stepShowing ? getScenario(applied.scenarioId).label : null;

  const showMe = () => {
    const step = STEPS[stepIndex];
    if (stepShowing) {
      restore();
      return;
    }
    setBusy(true);
    setScenarioId(step.action);
    if (step.action === "ppe") {
      const worker = world.things.find((thing) => thing.label === "Worker 02") ?? world.things.find((thing) => thing.kind === KINDS.WORKER);
      if (worker) {
        setSelectedId(worker.id);
        pulse(worker.id);
        window.setTimeout(() => {
          inject("ppe");
          setBusy(false);
        }, 900);
        return;
      }
    }
    if (step.action === "door") {
      const door = world.things.find((thing) => thing.kind === KINDS.DOOR);
      if (door) {
        setSelectedId(door.id);
        pulse(door.id);
      }
    }
    inject(step.action);
    window.setTimeout(() => setBusy(false), 900);
  };

  /* Direct actions on the floor. */
  const onActivate = (id) => {
    const thing = findThing(world, id);
    if (thing?.kind === KINDS.DOOR) setWorld((current) => setOpen(current, id, !thing.open));
  };

  const onToggleGear = (id, item) => setWorld((current) => toggleGear(current, id, item));
  const onToggleDoor = (id) => {
    const door = findThing(world, id);
    if (door) setWorld((current) => setOpen(current, id, !door.open));
  };
  const onRemove = (id) => {
    setWorld((current) => removeThing(current, id));
    setSelectedId(null);
  };
  const onRemoveZone = (id) => {
    setWorld((current) => removeZone(current, id));
    setSelectedId(null);
  };

  const addWorker = () => {
    const count = world.things.filter((thing) => thing.kind === KINDS.WORKER).length;
    const taken = (x, y) => world.things.some((thing) => Math.hypot(thing.x - x, thing.y - y) < 0.06);
    const spot = SPAWN_POINTS.find(([x, y]) => !taken(x, y)) ?? [0.5 + (Math.random() - 0.5) * 0.2, 0.5];
    setWorld((current) => {
      const next = addThing(current, KINDS.WORKER, spot[0], spot[1], { label: `Worker ${String(count + 1).padStart(2, "0")}` });
      const added = next.things[next.things.length - 1];
      window.setTimeout(() => {
        setSelectedId(added.id);
        pulse(added.id);
      }, 0);
      return next;
    });
  };

  const moveForklift = () => {
    const truck = world.things.find((thing) => thing.kind === KINDS.FORKLIFT);
    if (!truck) return;
    const [x, y] = FORKLIFT_ROUTE[routeIndex.current % FORKLIFT_ROUTE.length];
    routeIndex.current += 1;
    setSelectedId(truck.id);
    animateMove(truck.id, x, y, 900);
  };

  const startZone = (type) => {
    setDrawing(type);
    setDraft([]);
    setSelectedId(null);
  };
  const finishZone = () => {
    if (draft.length >= 3) {
      setWorld((current) => addZone(current, drawing, draft));
    }
    setDrawing(null);
    setDraft([]);
  };
  const cancelZone = () => {
    setDrawing(null);
    setDraft([]);
  };

  const resetAll = () => {
    for (const handle of animations.current.values()) cancelAnimationFrame(handle);
    animations.current.clear();
    sim.reset();
    setSelectedId(null);
    setApplied(null);
    cancelZone();
    routeIndex.current = 0;
  };

  const camera = world.things.find((thing) => thing.kind === KINDS.CAMERA);

  const ctx = { world, result, run, openEvents, log, bars, fps, conditions, readable, reading, selectedId, zoneSince };

  return (
    <div className="mx-auto max-w-[1560px] space-y-4 p-4">
      {/*
        `items-start` so the detail panel is as tall as what it has to say.
        Stretched to match the floor, the pipeline and the events list beside
        it, a panel describing one crate was a column of empty surface — and
        an empty panel reads as something failing to load rather than as
        something with nothing to add.
      */}
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_312px]">
        <div className="min-w-0 space-y-4">
          <div className="relative overflow-hidden rounded-xl border border-line shadow-[0_8px_30px_rgb(0_0_0/0.35)]">
            <FactoryCanvas
              world={world}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onMove={(id, x, y) => setWorld((current) => moveThing(current, id, x, y))}
              onActivate={onActivate}
              drawing={drawing}
              draftPoints={draft}
              onDraftPoint={(point) => setDraft((current) => [...current, point])}
              result={result}
              conditions={conditions}
              bars={bars}
              pulseId={pulseId}
            />
            <CameraCard name={camera?.label ?? "Camera 01"} floor="Factory Floor A" readable={readable} />
            <SimControls
              at={result?.at ?? 0}
              running={sim.running}
              onToggle={() => sim.setRunning((current) => !current)}
              onReset={resetAll}
              speed={sim.speed}
              onSpeed={sim.setSpeed}
            />
          </div>

          {/*
            The pipeline keeps the full width, and the events list sits under
            it rather than beside it.

            Sharing the row was what crushed the five stages: whatever was
            left after a 300px column had to hold five cards and four arrows,
            and at ordinary laptop widths that put "Object Detection" into
            about ninety pixels — rendered "O..", which explains nothing. The
            pipeline is the explanation of everything above it and reads
            across, so it gets the width; the events are a list and read
            down, so they lose nothing by going full width underneath.
          */}
          <div className="grid gap-4">
            <Pipeline world={world} result={result} conditions={conditions} bars={bars} selectedId={selectedId} />
            <RecentEvents log={log} />
          </div>
        </div>

        <SelectedPanel
          ctx={ctx}
          onClose={() => setSelectedId(null)}
          onToggleGear={onToggleGear}
          onToggleDoor={onToggleDoor}
          onRemove={onRemove}
          onRemoveZone={onRemoveZone}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <ExperimentControls
          scenarioId={scenarioId}
          onScenario={chooseScenario}
          applied={applied}
          onInject={() => inject()}
          onRestore={restore}
          onAddWorker={addWorker}
          onMoveForklift={moveForklift}
          drawing={drawing}
          draftCount={draft.length}
          onStartZone={startZone}
          onFinishZone={finishZone}
          onCancelZone={cancelZone}
          busy={busy}
        />
        <TryThis
          steps={STEPS}
          index={stepIndex}
          onPrev={() => setStepIndex((current) => (current - 1 + STEPS.length) % STEPS.length)}
          onNext={() => setStepIndex((current) => (current + 1) % STEPS.length)}
          onShowMe={showMe}
          showing={stepShowing}
          clears={stepClears}
          busy={busy}
        />
      </div>

      {/* Fixed to the corner of the window, so it is reachable from anywhere
          on a page this tall without scrolling back to find it. */}
      <Tutor ctx={ctx} />
    </div>
  );
}
