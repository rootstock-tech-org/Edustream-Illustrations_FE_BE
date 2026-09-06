import { useCallback, useEffect, useRef, useState } from "react";

import { newEvents, observe } from "../engine/events.js";
import { CLEAR_CONDITIONS, read } from "../engine/legibility.js";
import { newRun, step } from "../engine/pipeline.js";
import { DEFAULT_SETTINGS } from "../engine/rules.js";
import { zonesContaining } from "../engine/world.js";
import { presetWorld } from "./scene.js";

/**
 * The running simulation: the world, the camera's conditions, the clock,
 * and — one frame at a time — what the system made of it.
 *
 * The simulation's own state (vote history, beliefs, timers, open events)
 * lives in refs: every frame reads the previous frame's record and writes
 * the next one, and putting that in state would make each tick depend on a
 * render having happened. What the page renders — the latest frame's
 * result, the open-event record, the event log — is state, mirrored in the
 * same breath as the refs.
 *
 * `fps` is the engine's own clock: how many frames a second the system
 * analyses, which is what the confirmation window measures against.
 * `speed` is playback — how fast those frames are shown — and never touches
 * the engine's arithmetic, so the simulation time stays honest at 0.5× and
 * 2× alike.
 */
const MAX_LOG = 80;

export default function useSimulation({ fps = 10 } = {}) {
  const [world, setWorld] = useState(() => presetWorld());
  const [conditions, setConditions] = useState(CLEAR_CONDITIONS);
  const [speed, setSpeed] = useState(1);
  const [running, setRunning] = useState(true);

  const runRef = useRef(newRun());
  const eventsRef = useRef(newEvents());
  const zoneSinceRef = useRef({});
  const [result, setResult] = useState(null);
  const [run, setRun] = useState(() => newRun());
  const [openEvents, setOpenEvents] = useState(newEvents());
  const [log, setLog] = useState([]);
  const [zoneSince, setZoneSince] = useState({});

  const latest = useRef({ world, conditions });
  useEffect(() => {
    latest.current = { world, conditions };
  });

  const advance = useCallback(() => {
    const now = latest.current;
    const outcome = step(
      now.world,
      { conditions: now.conditions, settings: DEFAULT_SETTINGS, fps },
      runRef.current,
    );
    runRef.current = outcome.run;
    const observed = observe(eventsRef.current, outcome.frameResult.findings, outcome.frameResult.at);
    eventsRef.current = observed.events;

    // How long each thing has been in its current area, for the Movement
    // readout — kept from frame to frame the same way the engine keeps its
    // own clocks.
    const since = {};
    for (const thing of now.world.things) {
      const zoneId = zonesContaining(thing, now.world.zones)[0]?.id ?? null;
      const before = zoneSinceRef.current[thing.id];
      since[thing.id] = before && before.zoneId === zoneId ? before : { zoneId, since: outcome.frameResult.at };
    }
    zoneSinceRef.current = since;
    setZoneSince(since);

    const notable = observed.transitions.filter((transition) => transition.kind !== "continuing");
    if (notable.length > 0) {
      const wall = Date.now();
      setLog((current) =>
        [
          ...notable.map((transition) => ({
            id: `${transition.key}:${transition.kind}:${outcome.frameResult.frame}`,
            key: transition.key,
            kind: transition.kind,
            at: outcome.frameResult.at,
            wall,
            summary: transition.event.summary,
            severity: transition.event.severity,
          })),
          ...current,
        ].slice(0, MAX_LOG),
      );
    }

    setRun(outcome.run);
    setOpenEvents(observed.events);
    setResult(outcome.frameResult);
  }, [fps]);

  // One frame straight away, so the page is never blank before the first
  // tick — scheduled rather than run inside the effect body, so React's own
  // rule about synchronous state updates in effects holds.
  useEffect(() => {
    const first = setTimeout(advance, 0);
    return () => clearTimeout(first);
  }, [advance]);

  useEffect(() => {
    if (!running) return undefined;
    const timer = setInterval(advance, Math.max(1000 / fps / speed, 25));
    return () => clearInterval(timer);
  }, [running, fps, speed, advance]);

  const reset = useCallback(() => {
    setWorld(presetWorld());
    setConditions(CLEAR_CONDITIONS);
    runRef.current = newRun();
    eventsRef.current = newEvents();
    zoneSinceRef.current = {};
    setRun(newRun());
    setOpenEvents(newEvents());
    setLog([]);
    setZoneSince({});
    setResult(null);
  }, []);

  return {
    world, setWorld,
    conditions, setConditions,
    fps, speed, setSpeed,
    running, setRunning,
    result, run, openEvents, log, zoneSince,
    // Read live off the conditions rather than off the last frame the clock
    // advanced. `read()` is pure and needs no frame to have run, and a
    // paused floor must still admit the moment it can no longer see: a
    // camera that has stopped seeing people looks exactly like a floor
    // where everybody is behaving, and the whole point of this stage is
    // that it never reports the second when it means the first.
    reading: read(conditions),
    advance, reset,
    bars: DEFAULT_SETTINGS,
  };
}
