import { KINDS } from "../engine/world.js";

/**
 * The invisible target the pointer actually hits, per kind — a circle in
 * floor units centred on the thing's origin, a little larger than the art so
 * a finger can grab it.
 */
export const HIT_AREA = {
  [KINDS.WORKER]: { r: 30, cy: 2 },
  [KINDS.FORKLIFT]: { r: 50, cy: 0 },
  [KINDS.CAMERA]: { r: 26, cy: 0 },
  [KINDS.DOOR]: { r: 40, cy: 0 },
  [KINDS.WORKSTATION]: { r: 44, cy: 0 },
  [KINDS.OBJECT]: { r: 26, cy: 0 },
};

export const DEFAULT_HIT = { r: 30, cy: 0 };

/**
 * The detection box drawn around a thing — fitted to what that kind actually
 * draws, the way a real detector's box would be. `w`/`h` are the full box
 * size, `cy` its centre relative to the thing's origin.
 */
export const DETECTION_BOX = {
  [KINDS.WORKER]: { w: 48, h: 62, cy: 0 },
  [KINDS.FORKLIFT]: { w: 108, h: 54, cy: 0 },
  [KINDS.CAMERA]: { w: 56, h: 40, cy: 0 },
  [KINDS.DOOR]: { w: 100, h: 40, cy: 0 },
  // A workstation's box is its presence radius (0.06 of the floor each
  // way), not its bench — standing anywhere inside it counts as being at it.
  [KINDS.WORKSTATION]: { w: 120, h: 74, cy: 0 },
  [KINDS.OBJECT]: { w: 50, h: 50, cy: 0 },
};

export const DEFAULT_DETECTION_BOX = { w: 56, h: 56, cy: 0 };
