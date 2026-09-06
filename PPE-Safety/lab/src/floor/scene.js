import { KINDS, addZone, makeThing, resetIds } from "../engine/world.js";

/**
 * Factory Floor A, as it first appears.
 *
 * Composed here rather than in the engine's own `startingWorld()`, which
 * the node suite builds its scenes from and expects to be bare. Coordinates
 * are fractions of the floor (1000 × 620 units when drawn).
 *
 * The camera is wall-mounted in the top-left corner and looks across the
 * floor, so the far corner scores lower — that distance model is the
 * engine's own. Three workers, one forklift, one workstation, one door and
 * four crates; a restricted crane area in the middle of the floor and a
 * pedestrian walkway along the bottom. Worker 02 stands at Station 01
 * (0.055 from it, inside its 0.06 presence radius); Worker 03 arrives
 * without a helmet, so the first thing the system has to say is about them.
 */
export function presetWorld() {
  resetIds();

  let world = {
    things: [
      makeThing(KINDS.CAMERA, 0.09, 0.1, { label: "Camera 01" }),
      makeThing(KINDS.DOOR, 0.75, 0.05, { label: "Door 01", open: false }),
      makeThing(KINDS.WORKSTATION, 0.9, 0.73, { label: "Station 01" }),
      makeThing(KINDS.WORKER, 0.26, 0.5, { label: "Worker 01" }),
      makeThing(KINDS.WORKER, 0.9, 0.675, { label: "Worker 02" }),
      makeThing(KINDS.WORKER, 0.59, 0.86, { label: "Worker 03", wearing: ["vest", "gloves"] }),
      makeThing(KINDS.FORKLIFT, 0.5, 0.22, { label: "Forklift 01" }),
      makeThing(KINDS.OBJECT, 0.43, 0.47, { label: "Crate 01" }),
      makeThing(KINDS.OBJECT, 0.61, 0.68, { label: "Crate 02" }),
      makeThing(KINDS.OBJECT, 0.2, 0.24, { label: "Crate 03" }),
      makeThing(KINDS.OBJECT, 0.94, 0.42, { label: "Crate 04" }),
    ],
    zones: [],
  };

  world = addZone(world, "restricted", [[0.37, 0.4], [0.67, 0.4], [0.67, 0.74], [0.37, 0.74]], "Restricted Zone");
  world.zones[0].subtitle = "Crane Area";
  world = addZone(world, "walkway", [[0.06, 0.79], [0.98, 0.79], [0.98, 0.96], [0.06, 0.96]], "Walkway");

  return world;
}

/** Where a newly added worker lands: the first free spot on open floor. */
export const SPAWN_POINTS = [
  [0.3, 0.3], [0.62, 0.3], [0.2, 0.66], [0.78, 0.6], [0.33, 0.65], [0.86, 0.25],
];
