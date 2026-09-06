import { ZONE_TYPES } from "../engine/world.js";

/** The floor's coordinate space — every fraction in the world is scaled into this. */
export const VIEW = { width: 1000, height: 620 };

/** How each kind of marked area is drawn at rest. */
export const ZONE_LOOK = {
  restricted: { colour: "#EF4444", fill: 0.26, dash: "12 7", sub: "Crane Area" },
  walkway: { colour: "#FACC15", fill: 0.05, dash: null, sub: null },
  vehicle: { colour: "#F97316", fill: 0.14, dash: "12 7", sub: null },
  lifting: { colour: "#A78BFA", fill: 0.14, dash: "12 7", sub: null },
};

/** Every zone type the toolbar can draw, with its colour. */
export const ZONE_PALETTE = Object.fromEntries(
  Object.values(ZONE_TYPES).map((type) => [type.id, ZONE_LOOK[type.id]?.colour ?? "#FACC15"]),
);
