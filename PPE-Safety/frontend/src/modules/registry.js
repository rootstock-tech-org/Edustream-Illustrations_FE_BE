import {
  DoorOpen,
  Footprints,
  Forklift,
  HardHat,
  Hand,
  MapPinned,
  ScanFace,
  ScanLine,
  Container,
  VenetianMask,
} from "lucide-react";

import Doors from "../pages/monitoring/Doors";
import FaceRecognition from "../pages/monitoring/FaceRecognition";
import Masks from "../pages/monitoring/Masks";
import Gloves from "../pages/monitoring/Gloves";
import PPE from "../pages/monitoring/PPE";
import RestrictedZone from "../pages/monitoring/RestrictedZone";
import SuspendedLoad from "../pages/monitoring/SuspendedLoad";
import VehicleZone from "../pages/monitoring/VehicleZone";
import Walkways from "../pages/monitoring/Walkways";
import Workstations from "../pages/monitoring/Workstations";

/**
 * Monitoring module registry.
 *
 * The one place a capability is declared. The sidebar, the routes, and the
 * module index are all generated from this list, so adding a module means
 * adding an entry here and its page — no routing, navigation, or layout code
 * to touch.
 *
 * `id` must match the backend's module_id: it is how a page addresses
 * /api/<id> and how availability is matched against the backend's module
 * catalog.
 *
 * Entries without a `page` are shown in the navigation but route to a
 * placeholder, so the product's full shape is visible while modules are still
 * being built.
 */

export const MODULES = [
  {
    id: "restricted-zone",
    label: "Restricted Zone",
    description: "Alerts when someone enters an area marked as off limits.",
    icon: ScanLine,
    path: "/monitoring/restricted-zone",
    page: RestrictedZone,
  },
  {
    // Next to the restricted zone because it is the same job on a different
    // subject, and the two areas are separate shapes — marking one does not
    // move the other. The description says "forklift" rather than "vehicle"
    // on purpose: the weights have exactly one class, and the capability's
    // name is the only thing here that suggests otherwise.
    id: "vehicle-zone",
    label: "Vehicle in Restricted Zone",
    description: "Alerts while a forklift is standing in an area marked off limits.",
    icon: Forklift,
    path: "/monitoring/vehicle-zone",
    page: VehicleZone,
  },
  {
    // Beside the two zone modules because it is the same job with the
    // question inverted: those mark floor something must stay off, this marks
    // floor that has to stay clear. It carries no object model — it learns
    // what the marked lane's own floor looks like and reports what is not it —
    // so unlike its neighbours there is no class list to caveat.
    id: "walkways",
    label: "Object Blocking Walkways",
    description: "Alerts when something is left blocking a marked walkway.",
    icon: Footprints,
    path: "/monitoring/walkways",
    page: Walkways,
  },
  {
    id: "ppe",
    label: "Safety Gear",
    description: "Checks that helmets and safety vests are being worn.",
    icon: HardHat,
    path: "/monitoring/ppe",
    page: PPE,
  },
  {
    id: "gloves",
    label: "Gloves",
    description: "Checks that gloves are being worn where they are required.",
    icon: Hand,
    path: "/monitoring/gloves",
    page: Gloves,
  },
  {
    id: "mask",
    label: "Face Masks",
    description: "Checks that face masks are being worn.",
    icon: VenetianMask,
    path: "/monitoring/mask",
    page: Masks,
  },
  {
    id: "face",
    label: "Face Recognition",
    description: "Recognises registered people the moment they appear on camera.",
    icon: ScanFace,
    path: "/monitoring/face",
    page: FaceRecognition,
  },
  {
    id: "workstation",
    label: "Workstation Absence",
    description: "Alerts when a marked workstation is left with nobody at it.",
    icon: MapPinned,
    path: "/monitoring/workstation",
    page: Workstations,
  },
  {
    // Its own section rather than an extension of either zone module. The
    // floor a lifting machine swings over is frequently the exact strip
    // people are kept off, so the areas must not share a shape — and the
    // question is different in kind: those two ask whether something is in
    // a place, this one is on its way to asking whether something is
    // hanging above someone. The label says "detection" because that is
    // what is being built; the page says plainly which half of it exists.
    id: "suspended-load",
    label: "Suspended load detection",
    description: "Alerts when somebody is in the area a lifting machine works over.",
    icon: Container,
    path: "/monitoring/suspended-load",
    page: SuspendedLoad,
  },
  {
    id: "door",
    label: "Doors",
    description: "Watches whether doors are left open.",
    icon: DoorOpen,
    path: "/monitoring/door",
    page: Doors,
  },
];

/** Look up a module by its id. */
export function getModule(id) {
  return MODULES.find((m) => m.id === id);
}

/** Look up a module by its route. */
export function getModuleByPath(path) {
  return MODULES.find((m) => m.path === path);
}

/** Modules with a page built. */
export function builtModules() {
  return MODULES.filter((m) => m.page);
}
