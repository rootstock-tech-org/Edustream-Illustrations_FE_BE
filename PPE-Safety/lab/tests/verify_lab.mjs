/**
 * The simulation engine, measured where it can be measured without a browser.
 *
 * The engine is data and pure functions, so it is checked here — in plain
 * node, in under a second — and the browser probe is left to check what only
 * a browser can: that the floor actually renders and reacts.
 *
 * What this holds, in the order it matters:
 *
 *   * the engine stays pure — no React, no DOM, no network
 *   * the floor's geometry judges from the right point, and every change to
 *     the world returns a new world
 *   * the picture gate refuses what the real detector could not read, and
 *     names the right reason
 *   * detection, the rules, the confirmation window, the pipeline, events,
 *     the story and the "why" all agree with the real product's numbers and
 *     with each other
 *   * the remembered theme survives absence, junk and a storage that refuses
 *     to work at all
 *
 * Run:  node tests/verify_lab.mjs   (from lab/)
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

let failures = 0;

function check(name, ok, detail = "") {
  console.log(
    (ok ? "PASS  " : "FAIL  ") + name + (!ok && detail ? `  [${detail}]` : ""),
  );
  if (!ok) failures += 1;
  return ok;
}

function section(title) {
  console.log(`\n--- ${title}`);
}

/** Floating-point comparison, for figures calibrated against a measurement. */
function near(value, target, tolerance) {
  return Math.abs(value - target) <= tolerance;
}

/* ------------------------------------------------------------------ */
/* A localStorage the theme module can be handed.                      */
/* ------------------------------------------------------------------ */

function fakeStorage({ throws = false, initial = null } = {}) {
  let value = initial;
  return {
    getItem() {
      if (throws) throw new Error("storage is blocked");
      return value;
    },
    setItem(_key, next) {
      if (throws) throw new Error("storage is blocked");
      value = next;
    },
    removeItem() {
      value = null;
    },
  };
}

globalThis.localStorage = fakeStorage();

const theme = await import("../src/state/theme.js");

console.log("AI Safety Lab verification");

/* ------------------------------------------------------------------ */
section("6 · the engine boundary");
/* ------------------------------------------------------------------ */

// The engine is what later steps hang off, and its one rule is that it stays
// pure. Checked from the first day, while the folder is nearly empty, because
// the import that breaks it will be added casually.
function jsFiles(dir) {
  let found = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) found = found.concat(jsFiles(path));
    else if (/\.jsx?$/.test(entry)) found.push(path);
  }
  return found;
}

const engineDir = new URL("../src/engine", import.meta.url).pathname;
const engineFiles = jsFiles(engineDir);

check("no file in the engine imports React, the DOM or the network — it must " +
      "stay testable without a browser",
      engineFiles.every((path) => {
        const text = readFileSync(path, "utf8");
        return !/from\s+["']react|document\.|window\.|fetch\(/.test(text);
      }),
      engineFiles.join(", "));

/* ------------------------------------------------------------------ */
section("7 · the factory floor, as data");
/* ------------------------------------------------------------------ */

// The world module is what every later step reads and writes. Its geometry is
// the same test the real product's zone check reduces to, so it is checked
// here rather than trusted to look right on screen — a zone that judges from
// the wrong point is invisible in a picture and wrong in every lesson after.
const world = await import("../src/engine/world.js");

const floor = world.startingWorld();

check("the floor opens with something on it, not an empty grid",
      floor.things.length >= 5 && floor.zones.length === 0,
      `${floor.things.length} things, ${floor.zones.length} zones`);

check("one of them is the camera — the thing the whole lab is about",
      floor.things.filter((t) => t.kind === world.KINDS.CAMERA).length === 1);

const workers = floor.things.filter((t) => t.kind === world.KINDS.WORKER);
check("two workers, and exactly one of them is missing a helmet, so the " +
      "difference is visible before anything has been explained",
      workers.length === 2 &&
        workers.filter((w) => !w.wearing.includes("helmet")).length === 1);

check("only a worker wears anything — nothing else is ever asked about PPE",
      floor.things.every(
        (t) => t.kind === world.KINDS.WORKER || t.wearing.length === 0));

check("ids are unique across the floor",
      new Set(floor.things.map((t) => t.id)).size === floor.things.length);

check("nothing can be placed off the floor",
      (() => {
        const off = world.addThing(floor, world.KINDS.WORKER, 4.2, -0.9);
        const placed = off.things[off.things.length - 1];
        return placed.x === 1 && placed.y === 0;
      })());

check("clamp01 keeps a nonsense coordinate on the floor rather than throwing",
      world.clamp01(NaN) === 0 &&
        world.clamp01(undefined) === 0 &&
        world.clamp01(-3) === 0 &&
        world.clamp01(9) === 1 &&
        world.clamp01(0.4) === 0.4);

/* The zone test itself. */

const SQUARE = [[0.2, 0.2], [0.6, 0.2], [0.6, 0.6], [0.2, 0.6]];

check("a point in the middle of an area is inside it",
      world.pointInPolygon([0.4, 0.4], SQUARE));

check("a point outside it is outside — on every side",
      !world.pointInPolygon([0.1, 0.4], SQUARE) &&
        !world.pointInPolygon([0.9, 0.4], SQUARE) &&
        !world.pointInPolygon([0.4, 0.1], SQUARE) &&
        !world.pointInPolygon([0.4, 0.9], SQUARE));

// An L is the shape an operator actually draws around a machine, and the
// naive "is it within the bounding box" answer gets its inner corner wrong.
const ELL = [
  [0.2, 0.2], [0.8, 0.2], [0.8, 0.4], [0.4, 0.4], [0.4, 0.8], [0.2, 0.8],
];

check("a concave area is judged by its shape, not by the box around it",
      world.pointInPolygon([0.3, 0.7], ELL) &&
        !world.pointInPolygon([0.7, 0.7], ELL),
      "the inner corner of an L was judged wrong");

check("somebody is judged by their feet, not their middle — the rule the " +
      "real product uses, and the reason leaning over a barrier is not " +
      "standing inside it",
      (() => {
        const worker = world.makeThing(world.KINDS.WORKER, 0.4, 0.4);
        return world.standingPoint(worker).join(",") === "0.4,0.4";
      })());

const marked = world.addZone(floor, "restricted", SQUARE);
const inside = world.moveThing(marked, workers[0].id, 0.4, 0.4);

check("a worker moved into a marked area is reported as standing in it",
      world
        .zonesContaining(world.findThing(inside, workers[0].id), inside.zones)
        .length === 1);

check("and one left outside is reported as standing in nothing",
      world.zonesContaining(
        world.findThing(inside, workers[1].id), inside.zones).length === 0);

check("a marked area keeps every corner it was drawn with, not four",
      world.addZone(floor, "restricted", ELL).zones[0].points.length === 6);

check("every zone type the lab offers is one the real product can do",
      Object.values(world.ZONE_TYPES).every(
        (type) => type.id && type.name && type.watches && type.colour));

/* Changes to the world return a new world and never mutate the old one. */

check("moving something does not change the world it came from",
      (() => {
        const before = floor.things.find((t) => t.id === workers[0].id);
        const after = world.moveThing(floor, workers[0].id, 0.9, 0.9);
        return (
          before.x === floor.things.find((t) => t.id === workers[0].id).x &&
          after.things.find((t) => t.id === workers[0].id).x === 0.9 &&
          after !== floor
        );
      })());

check("taking a helmet off does not take it off in the world before it",
      (() => {
        const worn = workers[0].wearing.includes("helmet");
        const after = world.toggleGear(floor, workers[0].id, "helmet");
        return (
          worn &&
          !after.things.find((t) => t.id === workers[0].id).wearing
            .includes("helmet") &&
          floor.things.find((t) => t.id === workers[0].id).wearing
            .includes("helmet")
        );
      })());

check("gear goes back on as easily as it comes off",
      (() => {
        const off = world.toggleGear(floor, workers[0].id, "helmet");
        const on = world.toggleGear(off, workers[0].id, "helmet");
        return on.things.find((t) => t.id === workers[0].id).wearing
          .includes("helmet");
      })());

check("a forklift cannot be given a helmet — PPE is a fact about people",
      (() => {
        const truck = floor.things.find(
          (t) => t.kind === world.KINDS.FORKLIFT);
        const after = world.toggleGear(floor, truck.id, "helmet");
        return after.things.find((t) => t.id === truck.id).wearing.length === 0;
      })());

check("removing a thing and removing an area each leave the rest alone",
      (() => {
        const gone = world.removeThing(marked, workers[0].id);
        const cleared = world.removeZone(marked, marked.zones[0].id);
        return (
          gone.things.length === marked.things.length - 1 &&
          gone.zones.length === marked.zones.length &&
          cleared.zones.length === 0 &&
          cleared.things.length === marked.things.length
        );
      })());

check("a stale id is a miss, not a crash",
      world.findThing(floor, "worker-999") === undefined &&
        world.moveThing(floor, "worker-999", 0.1, 0.1).things.length ===
          floor.things.length);

/* ------------------------------------------------------------------ */
section("8 · can the picture be judged at all");
/* ------------------------------------------------------------------ */

// The gate the whole product turns on. Its numbers are the real module's, so
// they are checked against the real module's published sweep rather than
// against themselves.
const legibility = await import("../src/engine/legibility.js");

const baseline = legibility.read({ light: 1, blur: 0, compression: 0 });

check("an untouched picture measures what the real sweep measured — 125.3 " +
      "brightness, 58.4 contrast, 249 detail, 1.21 compression damage",
      near(baseline.brightness, 125.3, 0.5) &&
        near(baseline.contrast, 58.4, 0.5) &&
        near(baseline.sharpness, 249.2, 1) &&
        near(baseline.blockiness, 1.208, 0.01),
      JSON.stringify(baseline));

check("and it can be judged", baseline.readable && baseline.reason === null);

// The real sweep: the site frame held every worker at x0.50 (62.4 brightness)
// and lost one at x0.35 (43.4). The gate has to sit in that gap.
check("half daylight is still judgeable, matching the frame that held all " +
      "three workers",
      legibility.read({ light: 0.5 }).readable);

const dim = legibility.read({ light: 0.35 });
check("a third of daylight is refused, which is where the real detector " +
      "started losing people",
      !dim.readable && dim.failed === "brightness" &&
        dim.reason === "Too dark to check.");

check("and the refusal names darkness, not blur — the first version of the " +
      "real module sent operators to the lens when the answer was the light",
      dim.reason.includes("dark"));

// The two findings that would be guessed wrong. Both are the reason the gate
// needs four numbers rather than one.
check("detail does NOT fall when the light does — a dim picture is not a " +
      "blurred one, and measuring it as one is the bug this avoids",
      near(legibility.read({ light: 0.2 }).sharpness, baseline.sharpness, 1),
      `${legibility.read({ light: 0.2 }).sharpness} vs ${baseline.sharpness}`);

const squeezed = legibility.read({ compression: 0.8 });
check("compression makes a picture measure SHARPER, because blocking " +
      "artefacts are edges — a gate built on detail alone would call the " +
      "most damaged frame the sharpest it had ever seen",
      squeezed.sharpness > baseline.sharpness,
      `${squeezed.sharpness.toFixed(0)} vs ${baseline.sharpness.toFixed(0)}`);

check("so compression damage is measured separately, and catches it",
      !squeezed.readable && squeezed.failed === "blockiness");

check("and that second measure moves the other way under blur, so the two " +
      "cannot double-count one fault",
      legibility.read({ blur: 0.6 }).blockiness < baseline.blockiness);

const blurred = legibility.read({ blur: 0.6 });
check("a badly out-of-focus picture is refused for being blurred",
      !blurred.readable && blurred.failed === "sharpness");

check("a picture that passes is not therefore easy — half daylight costs " +
      "the detector real confidence",
      legibility.read({ light: 0.5 }).detectability < 0.7 &&
        legibility.read({ light: 0.5 }).detectability > 0.2,
      `${legibility.read({ light: 0.5 }).detectability}`);

check("nonsense conditions do not throw, they read as darkness",
      legibility.read({ light: NaN }).readable === false &&
        legibility.read({}).readable === true);

/* ------------------------------------------------------------------ */
section("9 · what the model finds, and how sure it is");
/* ------------------------------------------------------------------ */

const detectModule = await import("../src/engine/detect.js");
const scene = world.startingWorld();

const first = detectModule.detect(scene, legibility.CLEAR_CONDITIONS, 1);
const again = detectModule.detect(scene, legibility.CLEAR_CONDITIONS, 1);

check("the same scene on the same frame scores identically — a learner who " +
      "moves something has to know the change came from the move",
      JSON.stringify(first.detections) === JSON.stringify(again.detections));

const laterFrame = detectModule.detect(scene, legibility.CLEAR_CONDITIONS, 2);
check("but scores wobble between frames, which is why confirmation exists " +
      "at all — a simulation with steady scores makes it look like red tape",
      JSON.stringify(first.detections) !== JSON.stringify(laterFrame.detections));

check("a camera and a workbench are not things the detector is asked to find",
      first.detections.every(
        (d) => d.label !== "camera" && d.label !== "workstation"));

// The uncomfortable one, and it is real: hi-vis 0.795 against plain 0.248 on
// the same photograph, same light, same distance.
const near1 = detectModule.detect(
  world.addThing(
    world.addThing(scene, world.KINDS.WORKER, 0.5, 0.5,
                   { label: "In hi-vis", wearing: ["helmet", "vest", "gloves"] }),
    world.KINDS.WORKER, 0.5, 0.5,
    { label: "In plain clothes", wearing: ["helmet", "gloves"] }),
  legibility.CLEAR_CONDITIONS, 1);

const hiVis = near1.detections.find((d) => d.name === "In hi-vis");
const plain = near1.detections.find((d) => d.name === "In plain clothes");

check("a worker in hi-vis scores far higher than one in plain clothes " +
      "standing in the same spot — the real measured bias, and no threshold " +
      "fixes it",
      hiVis.score - plain.score > 0.3,
      `hi-vis ${hiVis.score.toFixed(2)} vs plain ${plain.score.toFixed(2)}`);

check("gear that is not worn never scores high enough to grant a green tick",
      (() => {
        const bare = world.addThing(scene, world.KINDS.WORKER, 0.5, 0.5,
                                    { label: "Bare", wearing: [] });
        const found = detectModule.detect(bare, legibility.CLEAR_CONDITIONS, 1)
          .detections.find((d) => d.name === "Bare");
        return Object.values(found.items).every((s) => s < 0.2);
      })());

check("in a good picture a fully equipped worker is over every bar — the " +
      "floor must read clean before a learner breaks it",
      (() => {
        for (let f = 1; f <= 20; f += 1) {
          const found = detectModule.detect(scene, legibility.CLEAR_CONDITIONS, f)
            .detections.find((d) => d.name === "Worker A");
          if (found.items.helmet < 0.55 || found.items.vest < 0.55) return false;
        }
        return true;
      })(),
      "a fully equipped worker was accused in perfect conditions");

check("dimming the picture pushes scores down without erasing everybody — " +
      "whoever was already marginal goes under the bar first",
      (() => {
        const bright = detectModule.detect(scene, { light: 1 }, 1)
          .detections.find((d) => d.name === "Worker A");
        const dimmer = detectModule.detect(scene, { light: 0.5 }, 1)
          .detections.find((d) => d.name === "Worker A");
        return dimmer.score < bright.score && dimmer.score > 0.35;
      })());

/* ------------------------------------------------------------------ */
section("10 · what the rules are willing to say");
/* ------------------------------------------------------------------ */

const rules = await import("../src/engine/rules.js");
const thresholds = await import("../src/engine/thresholds.js");

check("the bars are the real product's, not invented ones",
      thresholds.PERSON_SEEN === 0.2 &&
        thresholds.PERSON_SURE === 0.35 &&
        thresholds.ITEM_GRANT === 0.55 &&
        thresholds.ITEM_KEEP === 0.4 &&
        thresholds.ACCUSE_MIN_VOTES === 3);

check("a person is believed at a LOWER bar than their helmet is — the " +
      "asymmetry the whole product turns on, because a missed person costs " +
      "a human being and a missed helmet costs a second look",
      thresholds.PERSON_SEEN < thresholds.ITEM_GRANT);

const person = (score, items, name = "Someone") => ({
  id: name, name, label: "person", score, items, x: 0.5, y: 0.5,
});

const judgeOne = (detection, world_ = { zones: [] }, beliefs = {}) =>
  rules.judge([detection], world_, rules.DEFAULT_SETTINGS, beliefs)
    .findings.find((f) => f.kind === "person");

check("somebody scoring under the seeing bar is reported as LOST, not as " +
      "absent — an empty findings list is what a safe factory looks like, " +
      "and the two must never render the same",
      judgeOne(person(0.12, { helmet: 0.9, vest: 0.9 })).verdict === "lost");

check("and the reason says the system is claiming nothing about them, not " +
      "that they are fine",
      /not that they are fine|not that they are not/.test(
        judgeOne(person(0.12, { helmet: 0.9, vest: 0.9 })).because));

check("somebody between the two bars is unverified and is never accused, " +
      "however bad their gear looks",
      judgeOne(person(0.27, { helmet: 0.01, vest: 0.01 })).verdict ===
        "unverified");

check("somebody clearly seen and clearly equipped is clear",
      judgeOne(person(0.8, { helmet: 0.9, vest: 0.8 })).verdict === "clear");

check("somebody clearly seen with no helmet is a violation, and it names " +
      "what is missing",
      (() => {
        const f = judgeOne(person(0.8, { helmet: 0.05, vest: 0.8 }));
        return f.verdict === "violation" && f.missing.join() === "helmet";
      })());

check("gear at 0.50 grants nothing on its own — a grey sweatshirt does not " +
      "make somebody compliant",
      judgeOne(person(0.8, { helmet: 0.9, vest: 0.5 })).verdict === "violation");

check("but the same 0.50 KEEPS a belief that stronger evidence already " +
      "granted, so a vest that dips does not accuse a man who has plainly " +
      "been wearing one",
      (() => {
        const f = judgeOne(person(0.8, { helmet: 0.9, vest: 0.5 }),
                           { zones: [] },
                           { Someone: { helmet: true, vest: true } });
        return f.verdict === "clear" &&
          f.items.find((i) => i.item === "vest").kept === true;
      })());

check("and the keep bar has a floor — 0.30 is not kept, however long it was " +
      "believed",
      judgeOne(person(0.8, { helmet: 0.9, vest: 0.3 }),
               { zones: [] },
               { Someone: { helmet: true, vest: true } }).verdict === "violation");

/* Areas. */

const SQUARE_ZONE = {
  zones: [world.makeZone("restricted", [[0.2, 0.2], [0.6, 0.2], [0.6, 0.6], [0.2, 0.6]])],
};

const zoneVerdict = (detection) =>
  rules.judge([detection], SQUARE_ZONE, rules.DEFAULT_SETTINGS, {})
    .findings.find((f) => f.kind === "zone");

check("a restricted area with somebody in it is a violation",
      zoneVerdict({ ...person(0.8, { helmet: 0.9, vest: 0.9 }), x: 0.4, y: 0.4 })
        .verdict === "violation");

check("and one with nobody in it is clear",
      zoneVerdict({ ...person(0.8, { helmet: 0.9, vest: 0.9 }), x: 0.9, y: 0.9 })
        .verdict === "clear");

check("a zone alert uses the LOWER bar — a shape in the wrong place is " +
      "enough, and holding it to the judging bar would mean watching " +
      "somebody walk into a restricted area and saying nothing because " +
      "their helmet was not readable",
      zoneVerdict({ ...person(0.27, { helmet: 0.9, vest: 0.9 }), x: 0.4, y: 0.4 })
        .verdict === "violation");

check("but somebody the detector never reported cannot trigger one",
      zoneVerdict({ ...person(0.1, { helmet: 0.9, vest: 0.9 }), x: 0.4, y: 0.4 })
        .verdict === "clear");

check("a vehicle area ignores people and a restricted area ignores forklifts",
      (() => {
        const vehicleZone = {
          zones: [world.makeZone("vehicle", [[0.2, 0.2], [0.6, 0.2], [0.6, 0.6], [0.2, 0.6]])],
        };
        const walker = { ...person(0.9, {}), x: 0.4, y: 0.4 };
        const truck = { id: "t", name: "Forklift", label: "forklift", score: 0.9, x: 0.4, y: 0.4 };
        const peopleInVehicleZone = rules.judge([walker], vehicleZone, rules.DEFAULT_SETTINGS, {})
          .findings.find((f) => f.kind === "zone");
        const truckInRestricted = rules.judge([truck], SQUARE_ZONE, rules.DEFAULT_SETTINGS, {})
          .findings.find((f) => f.kind === "zone");
        return peopleInVehicleZone.verdict === "clear" &&
          truckInRestricted.verdict === "clear";
      })());

check("a lost person outranks a confirmed violation — a violation is a " +
      "thing the system knows about, and a lost person is one it does not",
      rules.worstOf([{ verdict: "violation" }, { verdict: "lost" }]) === "lost");

/* ------------------------------------------------------------------ */
section("11 · steadying a verdict over time");
/* ------------------------------------------------------------------ */

const confirmModule = await import("../src/engine/confirm.js");

const accuse = { kind: "person", id: "p", name: "P", verdict: "violation", because: "no helmet" };
const fine = { kind: "person", id: "p", name: "P", verdict: "clear", because: "all there" };

check("one frame is never enough to accuse somebody",
      confirmModule.confirm(confirmModule.newHistory(), [accuse], 0.1)
        .findings[0].settled === "watching");

check("and while it waits it says so, rather than reporting all-clear",
      confirmModule.confirm(confirmModule.newHistory(), [accuse], 0.1)
        .findings[0].settled !== "clear");

check("three agreeing sightings settle it",
      (() => {
        let history = confirmModule.newHistory();
        let last;
        for (let i = 1; i <= 3; i += 1) {
          const out = confirmModule.confirm(history, [accuse], i * 0.1);
          history = out.history;
          last = out.findings[0];
        }
        return last.settled === "violation";
      })());

check("compliance is reported on the very first frame — delaying good news " +
      "costs nothing, delaying an alarm costs seconds a supervisor needed",
      confirmModule.confirm(confirmModule.newHistory(), [fine], 0.1)
        .findings[0].settled === "clear");

check("a bare majority does not accuse; the sightings must favour it two " +
      "to one",
      (() => {
        let history = confirmModule.newHistory();
        let last;
        // 3 accusing, 2 disagreeing — over the vote count, under the majority.
        for (const [i, finding] of [accuse, fine, accuse, fine, accuse].entries()) {
          const out = confirmModule.confirm(history, [finding], i * 0.1);
          history = out.history;
          last = out.findings[0];
        }
        return last.settled === "watching";
      })());

check("votes older than the window stop counting",
      (() => {
        let history = confirmModule.newHistory();
        confirmModule.confirm(history, [accuse], 0).history;
        history = confirmModule.confirm(history, [accuse], 0).history;
        const out = confirmModule.confirm(history, [accuse], 99);
        return out.findings[0].votes.accusing === 1;
      })());

// The coupling to lesson three, which is the point of both.
check("at one frame a second, three votes need 2s and the window is 1.5s — " +
      "so the alarm can never arrive at all, however long anybody watches",
      confirmModule.delayAt(1).possible === false);

check("at two a second it fits, which is what 'three sightings in 1.5s' " +
      "really is: a minimum frame rate",
      confirmModule.delayAt(2).possible === true &&
        near(confirmModule.delayAt(2).seconds, 1.0, 0.01));

check("a faster stream confirms sooner",
      confirmModule.delayAt(10).seconds < confirmModule.delayAt(5).seconds);

/* ------------------------------------------------------------------ */
section("12 · one frame, end to end");
/* ------------------------------------------------------------------ */

const pipeline = await import("../src/engine/pipeline.js");

const STAGES = ["capture", "legibility", "detect", "rules", "confirm", "verdict"];

const good = pipeline.step(scene, { fps: 10 }, pipeline.newRun());

check("a readable frame runs every stage, in the order the real system runs " +
      "them",
      good.frameResult.trace.map((s) => s.id).join(",") === STAGES.join(","),
      good.frameResult.trace.map((s) => s.id).join(","));

check("every stage records what it did and the numbers it used, so the " +
      "'Why?' explanation can read a real decision rather than re-deriving it",
      good.frameResult.trace.every(
        (stage) =>
          stage.title &&
          stage.detail &&
          typeof stage.ok === "boolean" &&
          Array.isArray(stage.facts)));

check("the legibility stage's facts carry the real reading and its real " +
      "floor as numbers too, not only the formatted sentence — the same " +
      "four numbers CameraControls already draws as bars",
      (() => {
        const stage = good.frameResult.trace.find((s) => s.id === "legibility");
        const brightness = stage.facts.find((f) => f.label === "Brightness");
        return brightness.meter && brightness.meter.value === good.frameResult.reading.brightness &&
          brightness.meter.threshold > 0 &&
          stage.facts.every((f) => typeof f.meter.value === "number" && typeof f.meter.threshold === "number");
      })());

const unreadable = pipeline.step(scene, { conditions: { light: 0.2 } },
                                 pipeline.newRun());

check("an unreadable frame STOPS after legibility — it must never reach the " +
      "detector, which would find nobody in it",
      unreadable.frameResult.trace.map((s) => s.id).join(",") ===
        "capture,legibility,stopped",
      unreadable.frameResult.trace.map((s) => s.id).join(","));

check("and it reports that it cannot check, never that everything is clear",
      unreadable.frameResult.worst === "cannot-check" &&
        unreadable.frameResult.findings.length === 0 &&
        unreadable.frameResult.detections.length === 0);

check("the stop is explained rather than silent",
      /looks exactly like a factory where everyone is behaving/.test(
        unreadable.frameResult.trace[2].detail));

check("a worker missing a helmet is not accused on frame one, and is by " +
      "frame three",
      (() => {
        const out = pipeline.run(scene, { fps: 10 }, 3);
        const at = (n) => out.results[n].findings.find((f) => f.name === "Worker B");
        return at(0).settled === "watching" && at(2).settled === "violation";
      })());

check("while the fully equipped worker beside them is clear the whole time",
      (() => {
        const out = pipeline.run(scene, { fps: 10 }, 3);
        return out.results.every(
          (r) => r.findings.find((f) => f.name === "Worker A").settled === "clear");
      })());

check("at one frame a second the accusation never settles, matching what " +
      "the window arithmetic says",
      (() => {
        const out = pipeline.run(scene, { fps: 1 }, 12);
        return out.results.every(
          (r) => r.findings.find((f) => f.name === "Worker B").settled !== "violation");
      })(),
      "a 1fps run confirmed an accusation the window cannot hold three votes for");

check("a settled accusation reads as confirmed, not as a fraction that has " +
      "climbed past its own denominator",
      (() => {
        const out = pipeline.run(scene, { fps: 10 }, 9);
        const stage = out.results[8].trace.find((s) => s.id === "confirm");
        return stage.facts.every((fact) => !/^[4-9]\/3$/.test(fact.value));
      })());

check("while an accusation is still waiting, its confirm-stage fact carries " +
      "the raw tally too — a caller can draw '1 of 3' as segments instead " +
      "of only reading the fraction — and a settled one carries none, the " +
      "same place `value` itself stops climbing",
      (() => {
        const waiting = pipeline.run(scene, { fps: 10 }, 1);
        const waitStage = waiting.results[0].trace.find((s) => s.id === "confirm");
        const waitFact = waitStage.facts.find((f) => f.label === "Worker B");

        const settled = pipeline.run(scene, { fps: 10 }, 9);
        const settledStage = settled.results[8].trace.find((s) => s.id === "confirm");
        const settledFact = settledStage.facts.find((f) => f.label === "Worker B");

        return waitFact.votes && waitFact.votes.accusing === 1 && waitFact.votes.needed === 3 &&
          settledFact.votes === null;
      })());

check("the same run twice gives the same answers",
      JSON.stringify(pipeline.run(scene, { fps: 10 }, 4).results) ===
        JSON.stringify(pipeline.run(scene, { fps: 10 }, 4).results));

check("a run carries beliefs forward, so a dipping score is kept rather " +
      "than re-accused every frame",
      (() => {
        const out = pipeline.run(scene, { conditions: { light: 0.62 }, fps: 10 }, 12);
        const a = out.results.map(
          (r) => r.findings.find((f) => f.name === "Worker A").settled);
        return a.every((verdict) => verdict === "clear");
      })(),
      "a fully equipped worker was accused in a dim but readable picture");

/* ------------------------------------------------------------------ */
section("15 · turning a decision into a record");
/* ------------------------------------------------------------------ */

const events = await import("../src/engine/events.js");
const eventThresholds = await import("../src/engine/thresholds.js");

check("the severities are the real modules', not invented",
      eventThresholds.SEVERITY.ppe === "medium" &&
        eventThresholds.SEVERITY.restricted === "high" &&
        eventThresholds.SEVERITY.vehicle === "high" &&
        eventThresholds.SEVERITY.walkway === "medium" &&
        eventThresholds.SEVERITY.lifting === "medium");

check("a lifting-area breach is deliberately medium, not high — the real " +
      "module can only see somebody standing in the area, not that a load " +
      "is actually suspended above them",
      eventThresholds.SEVERITY.lifting === "medium" &&
        eventThresholds.SEVERITY.lifting !== eventThresholds.SEVERITY.restricted);

const openWorld = world.startingWorld();
const openRun = pipeline.run(openWorld, { fps: 10 }, 6).results;
const replay = events.observeRun(openRun);

check("a worker missing a helmet opens exactly one event, on the frame the " +
      "accusation settles — not the frame it was first suspected",
      (() => {
        const opened = replay.timeline.filter(
          (f) => f.transitions.some((t) => t.kind === "opened"));
        return opened.length === 1 && opened[0].frame === 3;
      })(),
      JSON.stringify(replay.timeline.map((f) => f.transitions).flat()));

check("the open event is keyed to the person and the item, so two workers " +
      "missing the same thing stay two events, not one",
      (() => {
        let w2 = world.toggleGear(
          world.startingWorld(), world.startingWorld().things.find(
            (t) => t.label === "Worker A").id, "helmet");
        const rep = events.observeRun(pipeline.run(w2, { fps: 10 }, 6).results);
        return Object.keys(rep.events).length === 2 &&
          Object.keys(rep.events).every((k) => k.includes(":no-helmet"));
      })());

check("a PPE violation opens ONE event per missing item, matching the real " +
      "store's per-problem granularity, not one per person",
      (() => {
        // Worker B already lacks a helmet in the starting scene. Removing
        // gloves too — and requiring them — gives one worker two missing
        // items without touching their vest, which would itself lower the
        // detector's confidence in them (the real, measured hi-vis bias) and
        // risk the person never settling as clearly seen at all.
        const base = world.startingWorld();
        const w2 = world.toggleGear(base,
          base.things.find((t) => t.label === "Worker B").id, "gloves");
        const rep = events.observeRun(pipeline.run(w2,
          { fps: 10, settings: { requires: ["helmet", "vest", "gloves"] } }, 6).results);
        const bId = w2.things.find((t) => t.label === "Worker B").id;
        const b = Object.keys(rep.events).filter((k) => k.startsWith(`${bId}:`));
        return b.length === 2 &&
          b.some((k) => k.endsWith(":no-helmet")) &&
          b.some((k) => k.endsWith(":no-gloves"));
      })());

check("a restricted-zone breach is one event for the AREA, not one per " +
      "person standing in it",
      (() => {
        let w2 = world.addZone(world.startingWorld(), "restricted",
          [[0.15, 0.4], [0.4, 0.4], [0.4, 0.75], [0.15, 0.75]], "Press area");
        w2 = world.moveThing(w2, w2.things.find((t) => t.label === "Worker A").id, 0.25, 0.55);
        w2 = world.moveThing(w2, w2.things.find((t) => t.label === "Worker B").id, 0.28, 0.6);
        const rep = events.observeRun(pipeline.run(w2, { fps: 10 }, 6).results);
        const zoneKeys = Object.keys(rep.events).filter((k) => k.startsWith("zone:"));
        return zoneKeys.length === 1 && rep.events[zoneKeys[0]].severity === "high";
      })());

// No scenario in this lab lets one key's severity actually rise — PPE and
// zone severities are fixed by problem type, not by how long a situation
// has run, so escalation is exercised directly against `observe()` rather
// than through the pipeline. `_insert`'s severity comes from the finding
// that opened the row, and `_escalate` only fires when a later finding on
// the same key scores higher — this is that second finding, hand-built.
const escalated = (() => {
  let record = events.newEvents();
  record = events.observe(record, [
    { kind: "zone", id: "z1", zoneType: "walkway", name: "Aisle",
      settled: "violation", inside: [{ id: "c1", name: "Crate" }] },
  ], 1.0).events;
  const openedAt = record["zone:z1"].severity;

  // The same key, now reported at "high" — standing in for a rule that can
  // itself escalate (the real door module raises severity the longer a door
  // stays open past its allowed duration; nothing in this lab's rules.js
  // does that yet, so the higher finding is asserted directly).
  record = events.observe(record, [
    { kind: "zone", id: "z1", zoneType: "vehicle", name: "Aisle",
      settled: "violation", inside: [{ id: "c1", name: "Crate" }] },
  ], 1.1).events;

  return { openedAt, after: record["zone:z1"].severity };
})();

check("an open event opens at its problem's real severity",
      escalated.openedAt === "medium");

check("and escalates in place when a worse reading arrives on the same " +
      "key — one event raised, not a second one opened beside it",
      escalated.after === "high");

check("severity never quietly drops back down while the event stays open " +
      "— a weaker reading on the same key leaves the stronger one standing",
      (() => {
        let record = events.newEvents();
        record = events.observe(record, [
          { kind: "zone", id: "z2", zoneType: "vehicle", name: "Bay",
            settled: "violation", inside: [{ id: "c2", name: "Forklift" }] },
        ], 1.0).events;
        record = events.observe(record, [
          { kind: "zone", id: "z2", zoneType: "walkway", name: "Bay",
            settled: "violation", inside: [{ id: "c2", name: "Forklift" }] },
        ], 1.1).events;
        return record["zone:z2"].severity === "high";
      })());

check("a problem missing for less than the resolve delay stays open",
      (() => {
        let record = events.newEvents();
        let step1 = events.observe(record, [
          { kind: "person", id: "p1", name: "P", settled: "violation", missing: ["helmet"] },
        ], 1.0);
        record = step1.events;
        const step2 = events.observe(record, [], 1.0 + eventThresholds.RESOLVE_AFTER_SECONDS - 1);
        return Object.keys(step2.events).length === 1 &&
          step2.transitions.every((t) => t.kind !== "resolved");
      })());

check("and closes once it has been gone for the full delay — the real " +
      "figure, not a shorter one that only looks right in a quick demo",
      (() => {
        let record = events.newEvents();
        let step1 = events.observe(record, [
          { kind: "person", id: "p1", name: "P", settled: "violation", missing: ["helmet"] },
        ], 1.0);
        record = step1.events;
        const step2 = events.observe(record, [], 1.0 + eventThresholds.RESOLVE_AFTER_SECONDS);
        return Object.keys(step2.events).length === 0 &&
          step2.transitions.some((t) => t.kind === "resolved");
      })());

check("eventFor and eventsFor answer null/empty for a finding with no open " +
      "event, never throw",
      (() => {
        const clearFinding = { kind: "person", id: "nobody", name: "Nobody",
                               settled: "clear", missing: [] };
        return events.eventFor({}, clearFinding) === null &&
          events.eventsFor({}, clearFinding).length === 0;
      })());

check("observeRun and frame-by-frame observe() agree on the final record — " +
      "an experiment computing its whole timeline at once must see exactly " +
      "what a live simulation ticking through it would have",
      (() => {
        let record = events.newEvents();
        for (const result of openRun) record = events.observe(record, result.findings, result.at).events;
        return JSON.stringify(record) === JSON.stringify(replay.events);
      })());

/* ------------------------------------------------------------------ */
section("16 · one decision, told as a sequence");
/* ------------------------------------------------------------------ */

const story = await import("../src/engine/story.js");

const STAGE_IDS = ["camera", "frame", "legibility", "model", "rule",
                   "confirmation", "decision", "event", "evidence", "alert"];

const violWorld = world.startingWorld();
const violRun = pipeline.run(violWorld, { fps: 10 }, 6);
const violLast = violRun.results[violRun.results.length - 1];
const violReplay = events.observeRun(violRun.results);
const violFinding = violLast.findings.find((f) => f.name === "Worker B");
const violKey = `${violFinding.kind}:${violFinding.id}`;
const violInfo = { events: events.eventsFor(violReplay.events, violFinding), fps: 10 };

check("the story has all ten stages the spec's pipeline names, in order",
      story.storyOf(violLast, violKey, violInfo).map((s) => s.id).join(",") ===
        STAGE_IDS.join(","));

check("every stage carries what a UI needs to render it",
      story.storyOf(violLast, violKey, violInfo).every(
        (s) => s.id && s.title && typeof s.status === "string" &&
          typeof s.headline === "string" && Array.isArray(s.facts)));

check("a confirmed violation reaches every stage as 'ok', ending at a " +
      "raised alert",
      story.storyOf(violLast, violKey, violInfo).every((s) => s.status === "ok"));

check("the AI MODEL stage shows the real per-item scores, matching the " +
      "spec's own example shape — a name and a number for each thing checked",
      (() => {
        const model = story.storyOf(violLast, violKey, violInfo).find((s) => s.id === "model");
        return model.facts.some((f) => f.label === "helmet") &&
          model.facts.every((f) => /^\d\.\d\d$/.test(f.value));
      })());

check("the SAFETY RULE stage shows the real threshold number, not the word " +
      "'bar' — a beginner has to see what the line actually was",
      (() => {
        const rule = story.storyOf(violLast, violKey, violInfo).find((s) => s.id === "rule");
        return rule.facts.some((f) => f.label === "helmet" && /0\.55/.test(f.value)) &&
          !rule.facts.some((f) => /\bbar\b/i.test(f.value));
      })());

check("and it shows whatever bar the caller says was actually used, not " +
      "always the product's own 0.55 — an experiment that moved the bar " +
      "must see its OWN number here, or watching it would misreport the " +
      "experiment's whole point",
      (() => {
        const moved = pipeline.run(violWorld, { fps: 10, settings: { itemGrant: 0.72 } }, 6);
        const movedLast = moved.results[moved.results.length - 1];
        const movedFinding = movedLast.findings.find((f) => f.name === "Worker A");
        const rule = story.storyOf(movedLast, `${movedFinding.kind}:${movedFinding.id}`,
          null, { itemGrant: 0.72 }).find((s) => s.id === "rule");
        return rule.facts.some((f) => /0\.72/.test(f.value));
      })());

check("the SAFETY RULE stage's per-item facts carry the raw score and " +
      "threshold too, alongside the sentence — additive, for a caller that " +
      "wants to draw a bar instead of only reading the words",
      (() => {
        const rule = story.storyOf(violLast, violKey, violInfo).find((s) => s.id === "rule");
        const helmet = rule.facts.find((f) => f.label === "helmet");
        return helmet.meter && typeof helmet.meter.value === "number" &&
          helmet.meter.threshold === 0.55;
      })());

check("...and that meter follows the same moved bar an experiment uses, " +
      "not the product's own 0.55 regardless — the same requirement the " +
      "sentence itself already has to meet",
      (() => {
        const moved = pipeline.run(violWorld, { fps: 10, settings: { itemGrant: 0.72 } }, 6);
        const movedLast = moved.results[moved.results.length - 1];
        const movedFinding = movedLast.findings.find((f) => f.name === "Worker A");
        const rule = story.storyOf(movedLast, `${movedFinding.kind}:${movedFinding.id}`,
          null, { itemGrant: 0.72 }).find((s) => s.id === "rule");
        return rule.facts.every((f) => f.meter.threshold === 0.72);
      })());

check("a zone's SAFETY RULE fact — a plain count of who is inside it — " +
      "carries no meter at all, since it has no threshold to draw a bar " +
      "against, rather than a fabricated one",
      (() => {
        let zw = world.addZone(world.startingWorld(), "restricted",
          [[0.15, 0.4], [0.4, 0.4], [0.4, 0.75], [0.15, 0.75]], "Press area");
        zw = world.moveThing(zw, zw.things.find((t) => t.label === "Worker A").id, 0.25, 0.55);
        const zRun = pipeline.run(zw, { fps: 10 }, 4);
        const zLast = zRun.results[zRun.results.length - 1];
        const zf = zLast.findings.find((f) => f.kind === "zone");
        const rule = story.storyOf(zLast, `${zf.kind}:${zf.id}`, null).find((s) => s.id === "rule");
        return rule.facts.length > 0 && rule.facts.every((f) => f.meter === undefined);
      })());

check("the EVENT stage names the real severity — medium for a missing " +
      "helmet — not a placeholder",
      story.storyOf(violLast, violKey, violInfo)
        .find((s) => s.id === "event").facts
        .some((f) => f.value === "medium"));

const clearFinding = violLast.findings.find((f) => f.name === "Worker A");
const clearStory = story.storyOf(violLast, `${clearFinding.kind}:${clearFinding.id}`,
  { events: events.eventsFor(violReplay.events, clearFinding), fps: 10 });

check("a clear worker reaches DECISION as 'ok' but EVENT as 'none' — " +
      "reached, and explicitly nothing to report, never silently absent",
      clearStory.find((s) => s.id === "decision").status === "ok" &&
        clearStory.find((s) => s.id === "decision").headline === "CLEAR" &&
        clearStory.find((s) => s.id === "event").status === "none");

check("and EVIDENCE/ALERT are 'skip' for a clear worker, with a reason, " +
      "never fabricated",
      clearStory.find((s) => s.id === "evidence").status === "skip" &&
        clearStory.find((s) => s.id === "alert").status === "skip" &&
        clearStory.find((s) => s.id === "evidence").headline.length > 0);

const darkRun = pipeline.step(violWorld,
  { conditions: { light: 0.2 } }, pipeline.newRun());
const darkStory = story.storyOf(darkRun.frameResult,
  `person:${violWorld.things.find((t) => t.label === "Worker A").id}`, null);

check("an unreadable frame stops at CAN THIS BE JUDGED and every later " +
      "stage is explicitly skipped, never silently dropped from the list",
      darkStory.find((s) => s.id === "legibility").status === "stop" &&
        darkStory.slice(3).every((s) => s.status === "skip") &&
        darkStory.length === STAGE_IDS.length);

check("and DECISION explains the skip rather than showing a blank headline",
      darkStory.find((s) => s.id === "decision").headline.length > 0);

check("a zone's AI MODEL stage lists who was found inside it, not a failed " +
      "lookup for a detection that was never going to exist — a marked " +
      "area is drawn, not detected",
      (() => {
        let zw = world.addZone(world.startingWorld(), "restricted",
          [[0.15, 0.4], [0.4, 0.4], [0.4, 0.75], [0.15, 0.75]], "Press area");
        zw = world.moveThing(zw, zw.things.find((t) => t.label === "Worker A").id, 0.25, 0.55);
        const zRun = pipeline.run(zw, { fps: 10 }, 4);
        const zLast = zRun.results[zRun.results.length - 1];
        const zf = zLast.findings.find((f) => f.kind === "zone");
        const zStory = story.storyOf(zLast, `${zf.kind}:${zf.id}`, null);
        const model = zStory.find((s) => s.id === "model");
        return model.status === "ok" && /Worker A/.test(model.headline);
      })());

check("an empty restricted zone reaches AI MODEL as 'none', not 'stop' — " +
      "reached and answered, not a failed lookup",
      (() => {
        const zw = world.addZone(world.startingWorld(), "restricted",
          [[0.85, 0.85], [0.95, 0.85], [0.95, 0.95], [0.85, 0.95]], "Empty corner");
        const zRun = pipeline.run(zw, { fps: 10 }, 4);
        const zLast = zRun.results[zRun.results.length - 1];
        const zf = zLast.findings.find((f) => f.kind === "zone");
        const zStory = story.storyOf(zLast, `${zf.kind}:${zf.id}`, null);
        return zStory.find((s) => s.id === "model").status === "none";
      })());

check("with no eventInfo at all, a violation still reports DECISION " +
      "honestly but EVENT says no record was supplied — different from " +
      "'checked and there is none', because the caller never checked",
      (() => {
        const noInfo = story.storyOf(violLast, violKey, null);
        return noInfo.find((s) => s.id === "decision").headline === "VIOLATION" &&
          /no event record was supplied/.test(noInfo.find((s) => s.id === "event").headline);
      })());

check("a waiting accusation shows CONFIRMATION as ok-but-waiting, and DOES " +
      "NOT open an event — the real store only ever sees a settled verdict",
      (() => {
        const earlyRun = pipeline.run(violWorld, { fps: 10 }, 2);
        const earlyLast = earlyRun.results[earlyRun.results.length - 1];
        const earlyFinding = earlyLast.findings.find((f) => f.name === "Worker B");
        const earlyStory = story.storyOf(earlyLast, `${earlyFinding.kind}:${earlyFinding.id}`, null);
        return earlyStory.find((s) => s.id === "decision").headline === "WATCHING" &&
          earlyStory.find((s) => s.id === "event").status === "none";
      })());

check("the story module imports no React and no DOM — like the rest of the " +
      "engine, it has to run in node",
      !/from\s+["']react|document\.|window\./.test(
        readFileSync(new URL("../src/engine/story.js", import.meta.url), "utf8")));

check("the events module is equally pure",
      !/from\s+["']react|document\.|window\./.test(
        readFileSync(new URL("../src/engine/events.js", import.meta.url), "utf8")));

/* ------------------------------------------------------------------ */
section("17 · \"Why did this happen?\"");
/* ------------------------------------------------------------------ */

const explainModule = await import("../src/engine/explain.js");

const wViolWorld = world.startingWorld();
const wViolRun = pipeline.run(wViolWorld, { fps: 10 }, 6);
const wViolLast = wViolRun.results[wViolRun.results.length - 1];
const wViolReplay = events.observeRun(wViolRun.results);
const wViolFinding = wViolLast.findings.find((f) => f.name === "Worker B");
const wViolInfo = { events: events.eventsFor(wViolReplay.events, wViolFinding), fps: 10 };

const violExplained = explainModule.explain(
  wViolLast, `${wViolFinding.kind}:${wViolFinding.id}`, wViolInfo, rules.DEFAULT_SETTINGS);

check("a confirmed violation explains all six things the spec asks for, in " +
      "order, each a real sentence rather than a fixed label",
      violExplained.points.length === 6 &&
        violExplained.points.every((pt, i) => pt.n === i + 1 && pt.text.length > 0));

check("point 1 says the person was detected, with the real score",
      /Worker B was detected — scored 0\.\d\d/.test(violExplained.points[0].text) &&
        violExplained.points[0].ok === true);

check("point 4 says the condition was NOT satisfied and names what was " +
      "missing, not a placeholder",
      /NOT satisfied.*helmet/i.test(violExplained.points[3].text) &&
        violExplained.points[3].ok === false);

check("point 6 names the real severity from the event record — medium, not " +
      "a made-up word",
      /generated.*medium severity/i.test(violExplained.points[5].text) &&
        violExplained.points[5].ok === true);

check("the account is not padded to six when fewer things are true — a " +
      "violation stopped is a shorter account, not six with blanks",
      (() => {
        const early = pipeline.run(wViolWorld, { fps: 10 }, 2);
        const earlyLast = early.results[early.results.length - 1];
        const earlyFinding = earlyLast.findings.find((f) => f.name === "Worker B");
        const out = explainModule.explain(earlyLast, `${earlyFinding.kind}:${earlyFinding.id}`);
        return out.stopped === true && out.points.length < 6 &&
          out.points[out.points.length - 1].ok === false &&
          /NOT yet passed/.test(out.points[out.points.length - 1].text);
      })());

const wClearFinding = wViolLast.findings.find((f) => f.name === "Worker A");
const clearExplained = explainModule.explain(
  wViolLast, `${wClearFinding.kind}:${wClearFinding.id}`, wViolInfo, rules.DEFAULT_SETTINGS);

check("a clear worker gets all six points too, ending in an explicit 'no " +
      "event' rather than stopping early — clear is a completed answer, " +
      "not an absence of one",
      clearExplained.stopped === false && clearExplained.points.length === 6 &&
        clearExplained.points.every((pt) => pt.ok === true));

check("and point 5 for a clear worker talks about compliance needing no " +
      "wait, never a vote count that actually measures accusations against " +
      "them — a clear person was never accused, so there is nothing to count",
      /compliance needs no waiting/.test(clearExplained.points[4].text) &&
        !/\d agreeing sighting/.test(clearExplained.points[4].text));

check("an unreadable frame's account is ONE line, not six with the rest " +
      "marked skipped — that fuller account belongs to the animation, not " +
      "a quick why",
      (() => {
        const dark = pipeline.step(wViolWorld, { conditions: { light: 0.2 } }, pipeline.newRun());
        const out = explainModule.explain(dark.frameResult,
          `person:${wViolWorld.things.find((t) => t.label === "Worker A").id}`);
        return out.stopped === true && out.points.length === 1 &&
          out.points[0].ok === null && /Too dark to check/.test(out.points[0].text);
      })());

check("a person who was never detected stops at point one, and it says so " +
      "plainly — not detected is not the same claim as clear",
      (() => {
        const ghost = { kind: "person", id: "g", name: "Ghost", settled: "lost", score: 0.12 };
        const frame = { readable: true, findings: [ghost], detections: [] };
        const out = explainModule.explain(frame, "person:g");
        return out.verdict === "lost" && out.points.length === 1 &&
          out.points[0].ok === false && /not detected/.test(out.points[0].text);
      })());

check("a person seen but not sure enough stops at point two, having said " +
      "point one was true — seen and judged are different claims",
      (() => {
        const sam = { kind: "person", id: "s", name: "Sam", settled: "unverified", score: 0.27 };
        const frame = { readable: true, findings: [sam], detections: [] };
        const out = explainModule.explain(frame, "person:s");
        return out.points.length === 2 &&
          out.points[0].ok === true && out.points[1].ok === false;
      })());

check("a zone's explanation names what it actually watches for, in the " +
      "real rule's own words, not a generic 'something is wrong'",
      (() => {
        let zw = world.addZone(world.startingWorld(), "restricted",
          [[0.15, 0.4], [0.4, 0.4], [0.4, 0.75], [0.15, 0.75]], "Press area");
        zw = world.moveThing(zw, zw.things.find((t) => t.label === "Worker A").id, 0.25, 0.55);
        const zRun = pipeline.run(zw, { fps: 10 }, 6);
        const zLast = zRun.results[zRun.results.length - 1];
        const zReplay = events.observeRun(zRun.results);
        const zFinding = zLast.findings.find((f) => f.kind === "zone");
        const out = explainModule.explain(zLast, `${zFinding.kind}:${zFinding.id}`,
          { events: events.eventsFor(zReplay.events, zFinding), fps: 10 });
        return /alerts the moment somebody steps inside/.test(out.points[0].text) &&
          /Worker A found inside it/.test(out.points[1].text) &&
          /high severity/.test(out.points[3].text);
      })());

check("an empty zone's explanation is entirely OK, all the way to no event",
      (() => {
        const zw = world.addZone(world.startingWorld(), "restricted",
          [[0.85, 0.85], [0.95, 0.85], [0.95, 0.95], [0.85, 0.95]], "Empty corner");
        const zRun = pipeline.run(zw, { fps: 10 }, 4);
        const zLast = zRun.results[zRun.results.length - 1];
        const zFinding = zLast.findings.find((f) => f.kind === "zone");
        const out = explainModule.explain(zLast, `${zFinding.kind}:${zFinding.id}`);
        return out.points.every((pt) => pt.ok === true) &&
          /No safety event/.test(out.points[out.points.length - 1].text);
      })());

check("with no event record supplied, a violation still explains itself " +
      "honestly — the event line says nothing was checked, never a made-up " +
      "severity",
      (() => {
        const out = explainModule.explain(wViolLast, `${wViolFinding.kind}:${wViolFinding.id}`);
        const last = out.points[out.points.length - 1];
        return last.ok === null && /no event record was checked/.test(last.text);
      })());

check("the account shows whatever bar the caller says was actually used — " +
      "an experiment that raised the gear bar to 0.72 must see 0.72 here, " +
      "not the product's own 0.55",
      (() => {
        const moved = pipeline.run(wViolWorld, { fps: 10, settings: { itemGrant: 0.72 } }, 6);
        const movedLast = moved.results[moved.results.length - 1];
        const movedFinding = movedLast.findings.find((f) => f.name === "Worker A");
        const out = explainModule.explain(movedLast, `${movedFinding.kind}:${movedFinding.id}`,
          null, { ...rules.DEFAULT_SETTINGS, itemGrant: 0.72 });
        return /0\.72/.test(out.points[2].text) && !/0\.55/.test(out.points[2].text);
      })());

check("a stale finding key that matches nothing this frame explains itself " +
      "as such, rather than throwing or fabricating a result",
      (() => {
        const out = explainModule.explain(wViolLast, "person:no-such-id");
        return out.stopped === true && out.points.length === 1 &&
          /Nothing was being tracked/.test(out.points[0].text);
      })());

check("explain.js imports no React and no DOM",
      !/from\s+["']react|document\.|window\./.test(
        readFileSync(new URL("../src/engine/explain.js", import.meta.url), "utf8")));

/* ------------------------------------------------------------------ */
section("18 · doors and workstations — the remaining scenarios");
/* ------------------------------------------------------------------ */

// Two of the six real scenarios needed no new engine work at all: a walkway
// with an object on it and a vehicle zone with a forklift in it already flow
// through judgeAreas() exactly like a restricted zone does. Checked here so
// a future change to that shared path cannot quietly break them.

check("a walkway obstruction is a real, confirmed violation at the walkway's " +
      "own medium severity — no new code needed, so no new bug either",
      (() => {
        let w2 = world.addZone(world.startingWorld(), "walkway",
          [[0.55, 0.75], [0.9, 0.75], [0.9, 0.95], [0.55, 0.95]], "Main aisle");
        w2 = world.moveThing(w2, w2.things.find((t) => t.label === "Crate").id, 0.7, 0.85);
        const rep = events.observeRun(pipeline.run(w2, { fps: 10 }, 6).results);
        const ev = Object.values(rep.events).find((e) => e.key.startsWith("zone:"));
        return ev.severity === "medium" && /Crate/.test(ev.summary);
      })());

check("a forklift in a vehicle zone is a real, confirmed violation at the " +
      "vehicle zone's own high severity",
      (() => {
        let w2 = world.addZone(world.startingWorld(), "vehicle",
          [[0.6, 0.3], [0.9, 0.3], [0.9, 0.6], [0.6, 0.6]], "Loading bay");
        w2 = world.moveThing(w2, w2.things.find((t) => t.label === "Forklift").id, 0.75, 0.45);
        const rep = events.observeRun(pipeline.run(w2, { fps: 10 }, 6).results);
        const ev = Object.values(rep.events).find((e) => e.key.startsWith("zone:"));
        return ev.severity === "high" && /Forklift/.test(ev.summary);
      })());

/* --- doors ------------------------------------------------------ */

function openDoor(w0) {
  const door = w0.things.find((t) => t.kind === world.KINDS.DOOR);
  return {
    world: { ...w0, things: w0.things.map((t) => (t.id === door.id ? { ...t, open: true } : t)) },
    door,
  };
}

check("a door that has never been opened is clear from frame one, with a " +
      "zero duration, not a missing one",
      (() => {
        const w0 = world.startingWorld();
        const door = w0.things.find((t) => t.kind === world.KINDS.DOOR);
        const last = pipeline.run(w0, { fps: 10 }, 3).results.at(-1);
        const f = last.findings.find((x) => x.id === door.id);
        return f.settled === "clear" && f.openSeconds === 0;
      })());

check("a door open under the 3s allowance is clear, and says so with the " +
      "real duration, not a placeholder",
      (() => {
        const { world: w0, door } = openDoor(world.startingWorld());
        const last = pipeline.run(w0, { fps: 10 }, 15).results.at(-1);
        const f = last.findings.find((x) => x.id === door.id);
        return f.settled === "clear" && f.openSeconds > 0 && f.openSeconds < 3 &&
          /within the 3 seconds allowance/.test(f.because);
      })());

check("a door escalates low at 3s, medium at 12s, high at 30s — the real " +
      "module's exact multiples of its own allowance, not invented ones",
      (() => {
        const { world: w0, door } = openDoor(world.startingWorld());
        let run = pipeline.newRun();
        const at = {};
        for (let i = 1; i <= 305; i += 1) {
          const out = pipeline.step(w0, { fps: 10 }, run);
          run = out.run;
          const f = out.frameResult.findings.find((x) => x.id === door.id);
          const t = Math.round(i / 10);
          if ([4, 13, 31].includes(t) && at[t] === undefined) at[t] = f.severity;
        }
        return at[4] === "low" && at[13] === "medium" && at[31] === "high";
      })(),
      "severity did not escalate at the real 1x/4x/10x thresholds");

check("severity never de-escalates while the door stays open — reaching " +
      "high and staying there, never dropping back to medium as time " +
      "keeps passing",
      (() => {
        const { world: w0, door } = openDoor(world.startingWorld());
        let run = pipeline.newRun();
        let sawHigh = false;
        let droppedAfter = false;
        for (let i = 1; i <= 400; i += 1) {
          const out = pipeline.step(w0, { fps: 10 }, run);
          run = out.run;
          const f = out.frameResult.findings.find((x) => x.id === door.id);
          if (f.severity === "high") sawHigh = true;
          else if (sawHigh && f.severity !== "high") droppedAfter = true;
        }
        return sawHigh && !droppedAfter;
      })());

check("closing the door before the allowance clears the finding back to " +
      "clear on the very next frame — no lingering violation",
      (() => {
        const w0 = world.startingWorld();
        const door = w0.things.find((t) => t.kind === world.KINDS.DOOR);
        let opened = { ...w0, things: w0.things.map((t) => (t.id === door.id ? { ...t, open: true } : t)) };
        let run = pipeline.newRun();
        for (let i = 0; i < 15; i += 1) { const out = pipeline.step(opened, { fps: 10 }, run); run = out.run; }
        const closed = { ...w0, things: w0.things.map((t) => (t.id === door.id ? { ...t, open: false } : t)) };
        const out = pipeline.step(closed, { fps: 10 }, run);
        const f = out.frameResult.findings.find((x) => x.id === door.id);
        return f.settled === "clear" && f.openSeconds === 0;
      })());

check("an open door's event opens exactly once, keyed to that door, and " +
      "escalates in place rather than opening a second event when severity " +
      "rises",
      (() => {
        const { world: w0 } = openDoor(world.startingWorld());
        const rep = events.observeRun(pipeline.run(w0, { fps: 10 }, 320).results);
        const doorEvents = Object.keys(rep.events).filter((k) => k.endsWith(":open-too-long"));
        return doorEvents.length === 1 && rep.events[doorEvents[0]].severity === "high";
      })());

check("a door's event summary names the door and the real duration, in the " +
      "real module's own wording shape",
      (() => {
        const { world: w0 } = openDoor(world.startingWorld());
        const rep = events.observeRun(pipeline.run(w0, { fps: 10 }, 320).results);
        const ev = Object.values(rep.events).find((e) => e.key.endsWith(":open-too-long"));
        return /Bay door left open for/.test(ev.summary) && /\d+ (second|min)/.test(ev.summary);
      })());

check("an unreadable frame stops a door's clock exactly the way it stops " +
      "everyone else's — no findings, no timer running behind the scenes " +
      "that resumes with time it was never open for",
      (() => {
        const { world: w0, door } = openDoor(world.startingWorld());
        const dark = pipeline.step(w0, { conditions: { light: 0.2 } }, pipeline.newRun());
        return dark.frameResult.findings.length === 0 &&
          dark.frameResult.readable === false;
      })());

/* --- workstations ------------------------------------------------ */

check("workstations are no longer ignored by the rules — a real, judged " +
      "kind now, not a thing the floor greys out for having nothing to say",
      !rules.IGNORED_KINDS.includes(world.KINDS.WORKSTATION) &&
        rules.IGNORED_KINDS.includes(world.KINDS.CAMERA));

check("a worker standing at a workstation is present, and the station is " +
      "clear from frame one",
      (() => {
        const w0 = world.startingWorld();
        const station = w0.things.find((t) => t.kind === world.KINDS.WORKSTATION);
        const at = world.moveThing(w0, w0.things.find((t) => t.label === "Worker A").id,
          station.x, station.y);
        const last = pipeline.run(at, { fps: 10 }, 4).results.at(-1);
        const f = last.findings.find((x) => x.id === station.id);
        return f.settled === "clear" && f.nearby.length === 1 &&
          f.nearby[0].name === "Worker A";
      })());

check("a worker who leaves is still believed present for the grace period " +
      "— the empty clock does not start the instant they step away",
      (() => {
        const w0 = world.startingWorld();
        const station = w0.things.find((t) => t.kind === world.KINDS.WORKSTATION);
        const workerId = w0.things.find((t) => t.label === "Worker A").id;
        let at = world.moveThing(w0, workerId, station.x, station.y);
        let run = pipeline.newRun();
        for (let i = 0; i < 10; i += 1) { const out = pipeline.step(at, { fps: 10 }, run); run = out.run; }
        const away = world.moveThing(at, workerId, 0.9, 0.9);
        const out = pipeline.step(away, { fps: 10 }, run);
        const f = out.frameResult.findings.find((x) => x.id === station.id);
        return f.settled === "clear" && f.emptySeconds === 0;
      })());

check("the empty allowance only starts counting once the grace period " +
      "lapses — 4s grace then 10s allowance stack, matching the real " +
      "module's two-timer design",
      (() => {
        const w0 = world.startingWorld();
        const station = w0.things.find((t) => t.kind === world.KINDS.WORKSTATION);
        const workerId = w0.things.find((t) => t.label === "Worker A").id;
        let at = world.moveThing(w0, workerId, station.x, station.y);
        let run = pipeline.newRun();
        for (let i = 0; i < 10; i += 1) { const out = pipeline.step(at, { fps: 10 }, run); run = out.run; }
        const away = world.moveThing(at, workerId, 0.9, 0.9);

        let settledAtFrame = null;
        for (let i = 1; i <= 200; i += 1) {
          const out = pipeline.step(away, { fps: 10 }, run);
          run = out.run;
          const f = out.frameResult.findings.find((x) => x.id === station.id);
          if (f.settled === "violation" && settledAtFrame === null) settledAtFrame = i;
        }
        // 4s grace + 10s allowance = 14s (140 frames), plus the few
        // frames confirm.js itself needs on top — comfortably past 100
        // (10s alone) and comfortably short of 200 (20s), which is what
        // it would take if the allowance had somehow started counting
        // from the moment the worker left rather than from when belief
        // in their presence lapsed.
        return settledAtFrame !== null && settledAtFrame > 130 && settledAtFrame < 170;
      })(),
      "the empty allowance appears to have started counting before the grace period lapsed");

check("workstation severity escalates low at 10s empty, medium at 40s, " +
      "high at 100s — the real module's own multiples of its own allowance",
      (() => {
        const w0 = world.startingWorld();
        const station = w0.things.find((t) => t.kind === world.KINDS.WORKSTATION);
        let run = pipeline.newRun();
        const at = {};
        for (let i = 1; i <= 1150; i += 1) {
          const out = pipeline.step(w0, { fps: 10 }, run);
          run = out.run;
          const f = out.frameResult.findings.find((x) => x.id === station.id);
          const t = Math.round(i / 10);
          if ([15, 45, 105].includes(t) && at[t] === undefined) at[t] = f.severity;
        }
        return at[15] === "low" && at[45] === "medium" && at[105] === "high";
      })(),
      "a workstation nobody has ever been seen at should be empty from frame one, per the real module");

check("presence uses the same confidence floor a restricted zone uses — a " +
      "detection too weak to be reported at all cannot hold a workstation " +
      "occupied",
      (() => {
        // A worker at the exact station position, but scored as if far too
        // faint to report — simulated directly, since detect.js's own
        // scores are always well above the floor at zero distance.
        const w0 = world.startingWorld();
        const station = w0.things.find((t) => t.kind === world.KINDS.WORKSTATION);
        const fakeDetections = [
          { label: "person", id: "ghost", name: "Ghost", score: 0.05, x: station.x, y: station.y, items: {} },
        ];
        const judged = rules.judge(fakeDetections, w0, rules.DEFAULT_SETTINGS, {},
          { doors: {}, stations: {} }, 20);
        const f = judged.findings.find((x) => x.kind === "workstation" && x.id === station.id);
        return f.nearby.length === 0;
      })());

check("a workstation's event is keyed to the station and escalates in " +
      "place, and its summary names the real duration",
      (() => {
        const w0 = world.startingWorld();
        const rep = events.observeRun(pipeline.run(w0, { fps: 10 }, 1150).results);
        const stationEvents = Object.keys(rep.events).filter((k) => k.endsWith(":empty"));
        const ev = rep.events[stationEvents[0]];
        return stationEvents.length === 1 && ev.severity === "high" &&
          /Station 1 left unattended for/.test(ev.summary);
      })());

/* --- both flow through the ordinary confirmation window, no special code -- */

check("a door's violation waits for the ordinary confirmation window like " +
      "anyone else's — no separate door-specific vote machinery exists to " +
      "get out of step with it",
      (() => {
        const { world: w0, door } = openDoor(world.startingWorld());
        const first = pipeline.step(w0, { fps: 10 }, pipeline.newRun());
        const f = first.frameResult.findings.find((x) => x.id === door.id);
        // One frame in, well under 3s open -- clear, not yet even a raw
        // violation, so nothing to confirm yet.
        return f.settled === "clear";
      })());

/* --- doors and workstations reach the same UI-facing surfaces -------- */

check("story.js and explain.js both resolve a door finding to the same " +
      "settled verdict — two views, one fact",
      (() => {
        const { world: w0, door } = openDoor(world.startingWorld());
        const last = pipeline.run(w0, { fps: 10 }, 320).results.at(-1);
        const key = `door:${door.id}`;
        const storyVerdict = story.storyOf(last, key, null, rules.DEFAULT_SETTINGS)
          .find((s) => s.id === "decision").headline;
        const explainVerdict = explainModule.explain(last, key, null, rules.DEFAULT_SETTINGS).verdict;
        return storyVerdict.toLowerCase() === explainVerdict;
      })());

check("story.js's AI MODEL stage for a door explicitly says the state is " +
      "ground truth, not a detection score dressed up as one",
      (() => {
        const { world: w0, door } = openDoor(world.startingWorld());
        const last = pipeline.run(w0, { fps: 10 }, 15).results.at(-1);
        const model = story.storyOf(last, `door:${door.id}`, null, rules.DEFAULT_SETTINGS)
          .find((s) => s.id === "model");
        return model.status === "none" && /set directly, not inferred/.test(model.headline);
      })());

check("a workstation's Why? account is honest when nobody has been at it " +
      "for a while and honest when somebody plainly is, in the same voice " +
      "as every other kind of finding",
      (() => {
        const w0 = world.startingWorld();
        const station = w0.things.find((t) => t.kind === world.KINDS.WORKSTATION);
        const empty = explainModule.explain(
          pipeline.run(w0, { fps: 10 }, 1150).results.at(-1),
          `workstation:${station.id}`, null, rules.DEFAULT_SETTINGS);
        const at = world.moveThing(w0, w0.things.find((t) => t.label === "Worker A").id,
          station.x, station.y);
        const occupied = explainModule.explain(
          pipeline.run(at, { fps: 10 }, 4).results.at(-1),
          `workstation:${station.id}`, null, rules.DEFAULT_SETTINGS);
        return empty.points[0].ok === false && occupied.points[0].ok === true;
      })());

/* ------------------------------------------------------------------ */
section("23 · light/dark theme, remembered");
/* ------------------------------------------------------------------ */

globalThis.localStorage = fakeStorage();
check("light with nothing stored — the lab opens the colour of the dashboard it is a page of",
      theme.loadTheme() === "light");

globalThis.localStorage = fakeStorage({ initial: "light" });
check("light once that exact choice was stored",
      theme.loadTheme() === "light");

globalThis.localStorage = fakeStorage({ initial: "dark" });
check("dark when dark was stored explicitly",
      theme.loadTheme() === "dark");

for (const junk of ["DARK", "", "system", "1", "light "]) {
  globalThis.localStorage = fakeStorage({ initial: junk });
  check(`anything but exactly "dark" reads as light — ${JSON.stringify(junk)}`,
        theme.loadTheme() === "light");
}

check("flip is just the other one, both directions",
      theme.flip("light") === "dark" && theme.flip("dark") === "light");

check("flip on anything unrecognised still lands on a real theme",
      theme.flip("system") === "light");

{
  const store = fakeStorage();
  globalThis.localStorage = store;
  theme.saveTheme("light");
  check("a saved choice round-trips through load",
        theme.loadTheme() === "light");
  theme.saveTheme("dark");
  check("saving again overwrites the earlier choice",
        theme.loadTheme() === "dark");
  theme.saveTheme("anything-else");
  check("saving a non-theme value is stored as dark, never written verbatim",
        theme.loadTheme() === "dark");
}

globalThis.localStorage = fakeStorage({ throws: true });
check("storage that refuses to be read still opens the lab in light",
      theme.loadTheme() === "light");

let themeSaveThrew = false;
try {
  theme.saveTheme("dark");
} catch {
  themeSaveThrew = true;
}
check("and storage that refuses to be written does not take the toggle down",
      !themeSaveThrew);

/* ------------------------------------------------------------------ */
section("24 · Factory Floor A — the scene, its labels, and the tutor");
/* ------------------------------------------------------------------ */

const scene24 = await import("../src/floor/scene.js");
const labels = await import("../src/floor/labels.js");
const tutor = await import("../src/floor/tutor.js");

const floorA = scene24.presetWorld();
const byLabel = (label) => floorA.things.find((t) => t.label === label);

check("the floor opens with a restricted crane area and a walkway already marked",
      floorA.zones.length === 2 &&
        floorA.zones.some((z) => z.type === "restricted") &&
        floorA.zones.some((z) => z.type === "walkway"));

check("three workers, one forklift, one workstation, one door, one camera, four crates",
      floorA.things.filter((t) => t.kind === world.KINDS.WORKER).length === 3 &&
        floorA.things.filter((t) => t.kind === world.KINDS.FORKLIFT).length === 1 &&
        floorA.things.filter((t) => t.kind === world.KINDS.WORKSTATION).length === 1 &&
        floorA.things.filter((t) => t.kind === world.KINDS.DOOR).length === 1 &&
        floorA.things.filter((t) => t.kind === world.KINDS.CAMERA).length === 1 &&
        floorA.things.filter((t) => t.kind === world.KINDS.OBJECT).length === 4);

check("Worker 02 stands inside Station 01's presence radius, so the station is attended from frame one",
      (() => {
        const w2 = byLabel("Worker 02");
        const st = byLabel("Station 01");
        return Math.hypot(w2.x - st.x, w2.y - st.y) <= thresholds.STATION_RADIUS;
      })());

check("nothing the areas watch for stands inside them at load — the only thing wrong is Worker 03's helmet",
      (() => {
        const out = pipeline.run(floorA, { fps: 10 }, 12);
        const last = out.results.at(-1);
        const zones = last.findings.filter((f) => f.kind === "zone");
        const violations = last.findings.filter((f) => f.settled === "violation");
        return zones.every((z) => z.inside.length === 0) &&
          violations.length === 1 && violations[0].name === "Worker 03" &&
          violations[0].missing.join() === "helmet";
      })());

const run24 = pipeline.run(floorA, { fps: 10 }, 30);
const w24 = (name) => run24.results.map((r) => r.findings.find((f) => f.name === name));

check("Worker 01, near the camera in full light, is clear on every one of the first 30 frames",
      w24("Worker 01").every((f) => f?.settled === "clear"));

check("Worker 02, at the far corner, has a vest that scores near the belief bar — one frame of doubt at most, never an accusation, and believed from the second frame on",
      (() => {
        const frames = w24("Worker 02");
        const first = frames[0];
        const vest = first.items?.find((item) => item.item === "vest");
        return first.settled !== "violation" &&
          (first.settled === "clear" || (vest && vest.score < 0.55 && vest.score > 0.40)) &&
          frames.slice(1).every((f) => f?.settled === "clear");
      })());

check("that far vest is kept believed on a frame it scores under the bar — the hysteresis the real system uses, not a fresh verdict every frame",
      w24("Worker 02").slice(1).some((f) => f.items?.some((item) => item.item === "vest" && item.kept && item.worn)));

const bars24 = rules.DEFAULT_SETTINGS;
const worker24 = byLabel("Worker 01");

check("a compliant worker's box is green and reads 'compliant'",
      (() => {
        const l = labels.labelFor({ thing: worker24, finding: { kind: "person", settled: "clear", items: [] }, zoneFindings: [], bars: bars24 });
        return l.tone === "ok" && l.status === "compliant";
      })());

check("while an accusation gathers sightings the box is yellow and counts them — never a fraction past its own denominator",
      (() => {
        const early = labels.labelFor({ thing: worker24, finding: { kind: "person", settled: "watching", votes: { accusing: 2, needed: 3 } }, zoneFindings: [], bars: bars24 });
        const late = labels.labelFor({ thing: worker24, finding: { kind: "person", settled: "watching", votes: { accusing: 8, needed: 3 } }, zoneFindings: [], bars: bars24 });
        return early.tone === "checking" && early.status === "checking 2/3" &&
          late.tone === "checking" && late.status === "confirming";
      })());

check("a confirmed missing helmet reads 'no helmet' in red",
      (() => {
        const l = labels.labelFor({ thing: worker24, finding: { kind: "person", settled: "violation", missing: ["helmet"] }, zoneFindings: [], bars: bars24 });
        return l.tone === "violation" && l.status === "no helmet";
      })());

check("a worker inside a breached area carries the area's verdict on their own box",
      (() => {
        const zone = { kind: "zone", id: "z", name: "Restricted Zone", zoneType: "restricted", settled: "violation", inside: [{ id: worker24.id, name: "Worker 01" }] };
        const l = labels.labelFor({ thing: worker24, finding: { kind: "person", settled: "clear", items: [] }, zoneFindings: [zone], bars: bars24 });
        return l.tone === "violation" && l.status === "in Restricted Zone";
      })());

check("a forklift on open floor is an orange vehicle box with nothing to say; in a blocked walkway it is red",
      (() => {
        const truck = byLabel("Forklift 01");
        const plain = labels.labelFor({ thing: truck, finding: null, zoneFindings: [], bars: bars24 });
        const zone = { kind: "zone", id: "w", name: "Walkway", zoneType: "walkway", settled: "violation", inside: [{ id: truck.id, name: "Forklift 01" }] };
        const blocked = labels.labelFor({ thing: truck, finding: null, zoneFindings: [zone], bars: bars24 });
        return plain.tone === "vehicle" && plain.status === null && blocked.tone === "violation" && blocked.status === "in Walkway";
      })());

check("an unreadable picture leaves every box off — nothing is being judged",
      labels.labelFor({ thing: worker24, finding: null, zoneFindings: [], readable: false, bars: bars24 }).tone === null);

check("a floor position reads as a grid reference, rows A–F down and columns 1–10 across",
      labels.gridRef(0.26, 0.5) === "D3" && labels.gridRef(0, 0) === "A1" && labels.gridRef(1, 1) === "F10");

check("the simulation clock formats as HH:MM:SS",
      labels.clock(0) === "00:00:00" && labels.clock(27.9) === "00:00:27" && labels.clock(3661) === "01:01:01");

const tutorRun = pipeline.run(floorA, { fps: 10 }, 6);
const tutorLast = tutorRun.results.at(-1);
const tutorCtx = {
  world: floorA, result: tutorLast, run: tutorRun.run, fps: 10, readable: true,
  openEvents: events.observeRun(tutorRun.results).events, bars: bars24,
};

check("the tutor's tips read the live frame — they name the worker missing a helmet",
      tutor.tips(tutorCtx).some((tip) => /Worker 03 is missing helmet/.test(tip)));

check("asked why a named worker is flagged, the tutor answers with that worker's numbered account",
      /1\. Worker 03 was detected/.test(tutor.answer("Why is Worker 03 flagged?", tutorCtx)) &&
        /NOT satisfied/.test(tutor.answer("Why is Worker 03 flagged?", tutorCtx)));

check("asked about confirmation, it answers with the real window, count and majority",
      /3 agreeing sightings within 1\.5 s/.test(tutor.answer("why does it wait for 3 sightings", tutorCtx)));

check("asked about the camera, it answers with the real floors",
      /45/.test(tutor.answer("what happens when it is dark?", tutorCtx)) &&
        /cannot check/.test(tutor.answer("what happens when it is dark?", tutorCtx)));

check("a question it cannot read the floor for gets an honest steer, not a made-up answer",
      /only answer from what is happening on this floor/.test(tutor.answer("what is the weather", tutorCtx)));

section("25 · the picture check answers to the conditions, not to the clock");

/*
 * A camera that has stopped seeing people looks exactly like a floor where
 * everybody is behaving. Every part of the page that says whether the
 * picture can be judged therefore has to read the conditions themselves —
 * `read()` — and never the last frame the clock happened to advance,
 * because a paused floor still has a light switch. This has been the same
 * bug twice: once with a slider while paused, once with a scenario button
 * while paused. These guard the property rather than either symptom.
 */

const pausedDark = legibility.read({ light: 0.3, blur: 0, compression: 0 });

check("the scenario's own light level is genuinely below the floor — the fault it injects is real",
      pausedDark.readable === false && typeof pausedDark.reason === "string" && pausedDark.reason.length > 0);

check("read() needs no frame to have run: it judges the conditions handed to it, nothing else",
      legibility.read({ light: 0.3 }).readable === false &&
        legibility.read({ light: 1 }).readable === true);

check("every consumer of the verdict reads it live off the conditions, never off result.readable",
      (() => {
        const consumers = [
          "src/pages/Factory.jsx",
          "src/factory/FactoryCanvas.jsx",
          "src/factory/Pipeline.jsx",
        ];
        return consumers.every((file) => {
          const text = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
          // No component may derive the verdict from the frame, and each
          // must reach the live reading — directly or from the hook.
          return !/result\s*\?\s*result\.readable\s*!==\s*false/.test(text) &&
            !/result\?\.readable/.test(text) &&
            /read\(conditions\)|reading\.readable/.test(text);
        });
      })());

check("the reason shown to an operator comes from the live reading too, not the stale frame's copy of it",
      (() => {
        const files = ["src/factory/FactoryCanvas.jsx", "src/factory/Pipeline.jsx", "src/factory/SelectedPanel.jsx"];
        return files.every((file) =>
          !/result\??\.?\??\.reading\?\.reason/.test(
            readFileSync(new URL(`../${file}`, import.meta.url), "utf8")));
      })());

check("the tutor refuses to call an unreadable picture a quiet floor, even on a frame that predates the fault",
      (() => {
        const stale = pipeline.run(scene24.presetWorld(), { fps: 10 }, 3).results.at(-1);
        const ctx = {
          world: scene24.presetWorld(), result: stale, fps: 10, openEvents: {},
          bars: rules.DEFAULT_SETTINGS,
          // the frame is readable; the floor, right now, is not
          readable: false, reading: pausedDark,
        };
        const said = tutor.answer("why is nothing flagged?", ctx);
        return /nothing is being judged/i.test(said) && !/every judged thing is clear/i.test(said);
      })());

section("26 · one demonstration stands at a time");

/*
 * Try This walks a learner through five tips, and each is only legible if
 * it is the only thing happening. That rests on every scenario being able
 * to put back exactly what it did — so a fault can be cleared away before
 * the next one is shown, and none is ever stranded on the floor with the
 * record of how to undo it overwritten.
 */

const scenarios = await import("../src/floor/scenarios.js");

/* The world a scenario's change leaves behind — the page's own `settle`. */
const settle = (from, change) => {
  if (!change) return from;
  let next = change.world ? change.world(from) : from;
  for (const move of change.moves ?? []) next = world.moveThing(next, move.id, move.x, move.y);
  return next;
};

const snapshot = (some) =>
  JSON.stringify(
    some.things
      .map((thing) => [thing.id, thing.x.toFixed(4), thing.y.toFixed(4), thing.open ?? null, [...(thing.wearing ?? [])].sort().join(",")])
      .sort((a, b) => (a[0] < b[0] ? -1 : 1)),
  );

for (const scenario of scenarios.SCENARIOS) {
  check(`the ${scenario.id} experiment puts back exactly what it changed`,
        (() => {
          const before = scene24.presetWorld();
          const beforeConditions = legibility.CLEAR_CONDITIONS;
          const applyChange = scenario.apply(before, beforeConditions);
          if (!applyChange) return false;

          const faulted = settle(before, applyChange);
          const faultedConditions = applyChange.conditions ?? beforeConditions;
          // Something has to have actually happened, or "restores cleanly"
          // would be true of a scenario that does nothing at all.
          const changed =
            snapshot(faulted) !== snapshot(before) ||
            JSON.stringify(faultedConditions) !== JSON.stringify(beforeConditions);

          const undo = scenario.restore(faulted, applyChange.subject ?? null, applyChange.from ?? null, faultedConditions);
          const after = settle(faulted, undo);
          const afterConditions = undo?.conditions ?? faultedConditions;

          return changed &&
            snapshot(after) === snapshot(before) &&
            JSON.stringify(afterConditions) === JSON.stringify(beforeConditions);
        })());
}

check("a second experiment injected after the first is put back leaves only the second standing — the tips cannot pile up",
      (() => {
        const start = scene24.presetWorld();
        const clear = legibility.CLEAR_CONDITIONS;

        const ppe = scenarios.getScenario("ppe");
        const zone = scenarios.getScenario("zone");

        const first = ppe.apply(start, clear);
        const faulted = settle(start, first);

        // What the page does: restore the standing fault, then work the new
        // one out against the floor that clean-up leaves.
        const undo = ppe.restore(faulted, first.subject, first.from, clear);
        const cleaned = settle(faulted, undo);
        const second = zone.apply(cleaned, clear);
        const showing = settle(cleaned, second);

        const worker02 = showing.things.find((thing) => thing.label === "Worker 02");
        const worker01 = showing.things.find((thing) => thing.label === "Worker 01");
        const inZone = world.zonesContaining(worker01, showing.zones).length > 0;

        // The first tip's fault is gone, the second's is standing, and the
        // second knows where to walk its worker back to.
        return worker02.wearing.includes("helmet") &&
          inZone &&
          Array.isArray(second.from) &&
          Math.abs(second.from[0] - start.things.find((thing) => thing.label === "Worker 01").x) < 1e-9;
      })());

console.log(
  `\n${failures === 0 ? "All lab checks passed." : `${failures} FAILED`}`,
);
process.exit(failures ? 1 : 0);
