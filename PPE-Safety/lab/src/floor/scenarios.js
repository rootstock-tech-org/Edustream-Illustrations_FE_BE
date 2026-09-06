import { KINDS, findThing, toggleGear } from "../engine/world.js";
import { DOOR_OPEN_SECONDS, STATION_EMPTY_SECONDS, STATION_PRESENCE_GRACE_SECONDS } from "../engine/thresholds.js";

/**
 * The experiments the controls offer — each a real fault a viewer can inject
 * into the floor and take back again.
 *
 * `apply(world, conditions)` returns what should change: `world` (a
 * function of the current world), `moves` (things to walk somewhere, which
 * the page animates), `conditions` (the camera's picture), and `focus` (what
 * to select so the viewer is looking at the right thing). `restore` returns
 * the same shape, undoing it. Nothing here touches the engine's rules; the
 * scenario only changes the world the rules are judging.
 */

const byLabel = (world, label) => world.things.find((thing) => thing.label === label) ?? null;
const helmetedWorker = (world) =>
  byLabel(world, "Worker 02")?.wearing.includes("helmet")
    ? byLabel(world, "Worker 02")
    : world.things.find((thing) => thing.kind === KINDS.WORKER && thing.wearing.includes("helmet")) ?? null;

export const SCENARIOS = [
  {
    id: "ppe",
    label: "PPE Violation",
    description: "Remove a worker's helmet and observe the AI response.",
    inject: "Remove helmet",
    restoreLabel: "Put helmet back on",
    apply(world) {
      const worker = helmetedWorker(world);
      if (!worker) return null;
      return { world: (current) => toggleGear(current, worker.id, "helmet"), focus: worker.id, subject: worker.id };
    },
    restore(world, subject) {
      const worker = findThing(world, subject);
      if (!worker || worker.wearing.includes("helmet")) return null;
      return { world: (current) => toggleGear(current, subject, "helmet"), focus: subject };
    },
  },
  {
    id: "zone",
    label: "Restricted Zone Entry",
    description: "Walk a worker into the restricted crane area and watch the zone check fail.",
    inject: "Walk worker in",
    restoreLabel: "Walk worker back out",
    apply(world) {
      const worker = byLabel(world, "Worker 01") ?? world.things.find((thing) => thing.kind === KINDS.WORKER);
      if (!worker) return null;
      return { moves: [{ id: worker.id, x: 0.52, y: 0.58 }], focus: worker.id, subject: worker.id, from: [worker.x, worker.y] };
    },
    restore(world, subject, from) {
      if (!findThing(world, subject)) return null;
      return { moves: [{ id: subject, x: from?.[0] ?? 0.26, y: from?.[1] ?? 0.5 }], focus: subject };
    },
  },
  {
    id: "walkway",
    label: "Forklift in Walkway",
    description: "Drive the forklift into the pedestrian walkway — an obstruction, not a person, trips this rule.",
    inject: "Drive forklift in",
    restoreLabel: "Drive forklift out",
    apply(world) {
      const truck = world.things.find((thing) => thing.kind === KINDS.FORKLIFT);
      if (!truck) return null;
      return { moves: [{ id: truck.id, x: 0.42, y: 0.875 }], focus: truck.id, subject: truck.id, from: [truck.x, truck.y] };
    },
    restore(world, subject, from) {
      if (!findThing(world, subject)) return null;
      return { moves: [{ id: subject, x: from?.[0] ?? 0.5, y: from?.[1] ?? 0.22 }], focus: subject };
    },
  },
  {
    id: "door",
    label: "Door Left Open",
    description: `Open Door 01 and leave it — after ${DOOR_OPEN_SECONDS} s it is reported, and the alert escalates the longer it stays open.`,
    inject: "Open the door",
    restoreLabel: "Close the door",
    apply(world) {
      const door = world.things.find((thing) => thing.kind === KINDS.DOOR);
      if (!door || door.open) return null;
      return { world: (current) => setOpen(current, door.id, true), focus: door.id, subject: door.id };
    },
    restore(world, subject) {
      const door = findThing(world, subject);
      if (!door || !door.open) return null;
      return { world: (current) => setOpen(current, subject, false), focus: subject };
    },
  },
  {
    id: "station",
    label: "Workstation Unattended",
    description: `Send the worker at Station 01 away — ${STATION_PRESENCE_GRACE_SECONDS} s of grace, then a ${STATION_EMPTY_SECONDS} s allowance, then an alert.`,
    inject: "Send worker away",
    restoreLabel: "Send worker back",
    apply(world) {
      const station = world.things.find((thing) => thing.kind === KINDS.WORKSTATION);
      if (!station) return null;
      const near = world.things.find(
        (thing) => thing.kind === KINDS.WORKER && Math.hypot(thing.x - station.x, thing.y - station.y) <= 0.06,
      );
      if (!near) return null;
      return { moves: [{ id: near.id, x: 0.76, y: 0.52 }], focus: station.id, subject: near.id, from: [near.x, near.y] };
    },
    restore(world, subject, from) {
      if (!findThing(world, subject)) return null;
      const station = world.things.find((thing) => thing.kind === KINDS.WORKSTATION);
      return { moves: [{ id: subject, x: from?.[0] ?? station?.x ?? 0.85, y: from?.[1] ?? station?.y ?? 0.68 }], focus: station?.id ?? subject };
    },
  },
  {
    id: "dark",
    label: "Camera Low Light",
    description: "Cut the lighting to 30% — the system must refuse to judge, never report a calm floor it cannot see.",
    inject: "Cut the lights",
    restoreLabel: "Lights back on",
    apply(world, conditions) {
      if ((conditions?.light ?? 1) <= 0.3) return null;
      return { conditions: { ...conditions, light: 0.3 }, focus: null, subject: "camera" };
    },
    restore(world, subject, from, conditions) {
      return { conditions: { ...conditions, light: 1 }, focus: null };
    },
  },
];

export function setOpen(world, id, open) {
  return {
    ...world,
    things: world.things.map((thing) => (thing.id === id ? { ...thing, open } : thing)),
  };
}

export function getScenario(id) {
  return SCENARIOS.find((scenario) => scenario.id === id) ?? SCENARIOS[0];
}

/** Where the forklift drives to, in order, each time "Move Forklift" is pressed. */
export const FORKLIFT_ROUTE = [
  [0.3, 0.34],
  [0.42, 0.875],
  [0.72, 0.6],
  [0.5, 0.22],
];
