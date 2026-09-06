/**
 * Draw a door and a workstation by hand, in a real browser.
 *
 * Everything Phase 1 verified about marking went through HTTP or in-process
 * calls. Nobody had actually dragged a rectangle on the canvas and watched
 * what came back — which is exactly where the canvas-versus-server
 * disagreement lived, and exactly the kind of gap a green suite hides.
 */

import { createRequire } from "node:module";
import { execSync } from "node:child_process";

/**
 * Playwright, wherever this machine keeps it.
 *
 * A bare import resolves upward from this file, and there is no node_modules
 * above `tests/` — the browser driver is installed globally here and in
 * `frontend/` on a developer's machine. Rather than hardcode one of those and
 * work on exactly one setup, ask node where its global modules are and try
 * each in turn.
 */
async function loadPlaywright() {
  const require = createRequire(import.meta.url);
  const roots = [];

  try {
    roots.push(execSync("npm root -g", { encoding: "utf8" }).trim());
  } catch { /* npm not on PATH; the other candidates may still work */ }

  roots.push(new URL("../frontend/node_modules", import.meta.url).pathname);

  for (const spec of ["playwright", ...roots.map((r) => `${r}/playwright`)]) {
    try {
      const loaded = await import(require.resolve(spec));
      // Playwright is CommonJS, so an ESM dynamic import may hand back the
      // whole module under `default` rather than as named exports.
      return loaded.chromium ? loaded : loaded.default;
    } catch { /* try the next one */ }
  }

  throw new Error(
    "Could not find playwright. Install it globally (npm i -g playwright) " +
    "or in frontend/, then run this again.",
  );
}

const { chromium } = await loadPlaywright();

const BASE = process.env.BASE ?? "http://127.0.0.1:8012";
const SHOTS = new URL(".", import.meta.url).pathname;

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log((ok ? "PASS  " : "FAIL  ") + name + (!ok && detail ? `  [${detail}]` : ""));
  if (!ok) failures++;
};

const api = async (page, path, init) =>
  page.evaluate(
    async ([p, i]) => {
      const r = await fetch(p, i);
      let body = null;
      try { body = await r.json(); } catch { /* not json */ }
      return { status: r.status, body };
    },
    [path, init ?? null],
  );

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
});

const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  permissions: ["camera"],
});
const page = await context.newPage();
page.on("pageerror", (e) => check("no uncaught page error", false, e.message));

// --- what the modules say their own limits are --------------------------

await page.goto(BASE, { waitUntil: "networkidle" });

const doorCfg = await api(page, "/api/door/config");
const wsCfg = await api(page, "/api/workstation/config");

check("the door module publishes the floor it enforces",
  doorCfg.body?.data?.min_area === 0.005 && doorCfg.body?.data?.min_side === 0.02,
  JSON.stringify(doorCfg.body?.data && {
    min_side: doorCfg.body.data.min_side, min_area: doorCfg.body.data.min_area }));

check("the workstation module publishes no area floor, because it has none",
  wsCfg.body?.data?.min_area === null && wsCfg.body?.data?.min_side === 0.02,
  JSON.stringify(wsCfg.body?.data && {
    min_side: wsCfg.body.data.min_side, min_area: wsCfg.body.data.min_area }));

// --- drawing on the real canvas -----------------------------------------

/** Drag a rectangle across a fraction of the canvas. */
async function drag(box, frac) {
  const [x1, y1, x2, y2] = frac;
  await page.mouse.move(box.x + box.width * x1, box.y + box.height * y1);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * (x1 + (x2 - x1) / 2),
                        box.y + box.height * (y1 + (y2 - y1) / 2), { steps: 8 });
  await page.mouse.move(box.x + box.width * x2, box.y + box.height * y2, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(900);
}

async function openMarking(path, button) {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  // The canvas only exists once something is being watched — there is
  // nothing to draw a doorway on until there is a picture.
  await page.getByRole("button", { name: "This device", exact: true })
    .click().catch(() => {});
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: /^start watching$/i })
    .click().catch(() => {});
  await page.waitForTimeout(6000);

  await page.getByRole("button", { name: button }).first()
    .click().catch(() => {});
  await page.waitForTimeout(1200);

  const canvas = page.locator("canvas").first();
  if (!(await canvas.count())) return null;
  return await canvas.boundingBox();
}

// --- doors ---------------------------------------------------------------

const doorCanvas = await openMarking("/monitoring/door", /mark doors?/i);
check("the door page offers a canvas to draw on", doorCanvas !== null);

if (doorCanvas) {
  // 5% x 5% = 0.25% of the picture: clears the per-side floor, sits under
  // the area floor. Before this was published, the canvas drew it happily
  // and the server refused it.
  await drag(doorCanvas, [0.30, 0.30, 0.35, 0.35]);
  let after = await api(page, "/api/door/config");
  check("a box too small for the AI to rely on is refused by the canvas itself",
    (after.body?.data?.doors ?? []).length === 0,
    `${(after.body?.data?.doors ?? []).length} door(s) marked`);

  const text = await page.locator("body").innerText();
  check("and the operator is not shown a server error for it",
    !/internal server error|could not save/i.test(text));

  // A doorway-sized rectangle.
  await drag(doorCanvas, [0.42, 0.20, 0.60, 0.85]);
  after = await api(page, "/api/door/config");
  const doors = after.body?.data?.doors ?? [];
  check("an ordinary doorway is accepted", doors.length === 1,
    `${doors.length} door(s) · ${JSON.stringify(doors[0]?.box)}`);

  await page.screenshot({ path: `${SHOTS}/door_marked.png` });

  if (doors.length === 1) {
    const id = doors[0].id;

    // The blocking defect, through the UI this time: a second door must not
    // disturb the first.
    await drag(doorCanvas, [0.08, 0.25, 0.24, 0.80]);
    const both = (await api(page, "/api/door/config")).body?.data?.doors ?? [];
    check("marking a second doorway leaves the first one alone",
      both.length === 2 && both.some((d) => d.id === id),
      `${both.length} door(s), ids ${both.map((d) => d.id)}`);

    const over = await api(page, "/api/door/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ door: { update: { id, open_seconds: 9999 } } }),
    });
    check("an absurd per-door allowance is refused through the page's own API",
      over.status === 400, `status ${over.status}`);
  }

  await api(page, "/api/door/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ door: { clear: true } }),
  });
}

// --- workstations --------------------------------------------------------

const wsCanvas = await openMarking("/monitoring/workstation", /mark workstations?/i);
check("the workstation page offers a canvas to draw on", wsCanvas !== null);

if (wsCanvas) {
  await drag(wsCanvas, [0.25, 0.30, 0.55, 0.75]);
  const marked = (await api(page, "/api/workstation/config")).body?.data?.workstations ?? [];
  check("a workstation can be marked out", marked.length === 1,
    `${marked.length} marked`);

  await page.screenshot({ path: `${SHOTS}/workstation_marked.png` });

  // No area floor here, so a small bench is legitimate and must be kept.
  await drag(wsCanvas, [0.70, 0.60, 0.76, 0.70]);
  const small = (await api(page, "/api/workstation/config")).body?.data?.workstations ?? [];
  check("a small bench is still allowed, because this module has no area floor",
    small.length === 2, `${small.length} marked`);

  await api(page, "/api/workstation/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workstation: { clear: true } }),
  });
}

// --- nothing left behind -------------------------------------------------

const leftDoors = (await api(page, "/api/door/config")).body?.data?.doors ?? [];
const leftWs = (await api(page, "/api/workstation/config")).body?.data?.workstations ?? [];
check("no doors were left marked by this pass", leftDoors.length === 0);
check("no workstations were left marked by this pass", leftWs.length === 0);

await browser.close();

console.log(`\n${failures === 0 ? "All marking-UI checks passed." : failures + " FAILED"}`);
process.exit(failures === 0 ? 0 : 1);
