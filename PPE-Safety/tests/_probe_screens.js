/**
 * Photograph the product's screens, twice, so they can be compared pixel for
 * pixel.
 *
 * Phase 5 rebuilds the layout of every page — a responsive sidebar is a change
 * to the container every screen sits in. The contract's answer to that is the
 * one Phase 2 used: a screen that worked before must look *exactly* as it
 * looked before, and "exactly" is measured rather than eyeballed. This takes
 * the photographs; `verify_phase5.py` counts the pixels that differ.
 *
 * Three things on these pages move by themselves and would read as a change
 * when nothing has changed, so each is pinned rather than tolerated:
 *
 *   the clock      the navbar prints the wall clock to the second. Only its
 *                  *formatting* is frozen — `toLocaleTimeString` and friends —
 *                  rather than `Date` itself, because the pages measure
 *                  durations with real time and a frozen `Date.now()` would
 *                  change what they render, which is the opposite of what a
 *                  regression photograph is for.
 *
 *   the history    the "recent events" panel prints relative times against a
 *                  shared database another agent is writing to. Answered with
 *                  a fixed empty page, so the panel draws its empty state and
 *                  draws it identically in both runs.
 *
 *   animation      transitions and pulses are stopped, so a photograph cannot
 *                  catch one mid-way.
 *
 * What is *not* pinned is anything the product decides: the marked doorways,
 * the module catalog, whether the camera is connected. Those are the screen.
 * Their fingerprint is written beside the photographs so a comparison against
 * a reference taken in a different world is refused rather than believed.
 *
 *   P5_BASE     backend to photograph   (default http://127.0.0.1:8013)
 *   P5_OUT      directory for the PNGs  (required)
 *   P5_WIDTH    viewport width          (default 1440)
 *   P5_HEIGHT   viewport height         (default 1080)
 *   P5_PATHS    comma-separated routes  (default the seven module pages)
 *   P5_TAMPER   shift the page one pixel before photographing, to prove the
 *               comparison can see a change at all. A photograph instrument
 *               that reports zero differences because it is blind reads
 *               exactly like one reporting zero because nothing moved.
 *
 * Prints one JSON object on stdout: what it photographed, each page's full
 * scroll height, and the fingerprint of the state it was photographed in.
 */

const fs = require("fs");
const path = require("path");

const { chromium } = require("./_pw");

const BASE = process.env.P5_BASE || "http://127.0.0.1:8013";
const OUT = process.env.P5_OUT;
const WIDTH = Number(process.env.P5_WIDTH || 1440);
const HEIGHT = Number(process.env.P5_HEIGHT || 1080);

const DEFAULT_PATHS = [
  "/monitoring/restricted-zone",
  "/monitoring/ppe",
  "/monitoring/gloves",
  "/monitoring/mask",
  "/monitoring/face",
  "/monitoring/workstation",
  "/monitoring/door",
];

const PATHS = (process.env.P5_PATHS || DEFAULT_PATHS.join(",")).split(",");

/** Freeze what the clock *prints*, not what the clock *is*. */
const FREEZE_CLOCK = () => {
  const date = "11/08/2026";
  const time = "00:00:00";

  Date.prototype.toLocaleTimeString = function () { return time; };
  Date.prototype.toLocaleDateString = function () { return date; };
  Date.prototype.toLocaleString = function () { return `${date}, ${time}`; };
  Date.prototype.toTimeString = function () { return `${time} GMT+0000`; };
};

/** Stop every transition and animation, so nothing is caught mid-way. */
const STILL = `
  *, *::before, *::after {
    transition: none !important;
    animation: none !important;
    caret-color: transparent !important;
  }
`;

/** An empty history, so a shared database cannot move the picture. */
const NO_HISTORY = {
  success: true,
  data: { events: [], total: 0, days: 7, modules: {} },
};

async function settle(page) {
  // The pages poll on a timer — a second is long enough for the first answer
  // to have arrived and been drawn, and every poll after it draws the same
  // thing while nothing is watching.
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(1800);
}

(async () => {
  const out = { base: BASE, width: WIDTH, height: HEIGHT, pages: {} };

  if (!OUT) {
    out.error = "P5_OUT must be set";
    process.stdout.write(JSON.stringify(out));
    return;
  }

  fs.mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    args: ["--no-sandbox", "--force-device-scale-factor=1"],
  });

  try {
    const context = await browser.newContext({
      viewport: { width: WIDTH, height: HEIGHT },
      deviceScaleFactor: 1,
      reducedMotion: "reduce",
    });

    await context.addInitScript(FREEZE_CLOCK);

    await context.route("**/api/events**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(NO_HISTORY),
      }),
    );

    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e.message)));

    // The state the photographs were taken in. Compared before the pixels
    // are: a doorway marked between the two runs changes the Doors page
    // legitimately, and that must read as "no comparison" rather than as a
    // regression.
    const fingerprint = {};

    for (const endpoint of [
      "/api/modules",
      "/api/door/config",
      "/api/workstation/config",
      "/api/restricted-zone/config",
      "/api/face/config",
    ]) {
      try {
        const response = await context.request.get(BASE + endpoint);
        fingerprint[endpoint] = JSON.stringify(await response.json());
      } catch (err) {
        fingerprint[endpoint] = `error: ${err}`;
      }
    }

    out.fingerprint = fingerprint;

    for (const route of PATHS) {
      const name = route.replace(/^\//, "").replace(/\//g, "_") || "root";
      const file = path.join(OUT, `${name}_${WIDTH}.png`);

      try {
        await page.goto(BASE + route, { waitUntil: "domcontentloaded" });
        await settle(page);
        await page.addStyleTag({ content: STILL });

        if (process.env.P5_TAMPER) {
          await page.addStyleTag({ content: "body { padding-left: 1px; }" });
        }

        await page.waitForTimeout(250);

        const scrollHeight = await page.evaluate(
          () => document.documentElement.scrollHeight,
        );
        const scrollWidth = await page.evaluate(
          () => document.documentElement.scrollWidth,
        );

        await page.screenshot({ path: file, fullPage: false });

        out.pages[route] = { file, scrollHeight, scrollWidth };
      } catch (err) {
        out.pages[route] = { error: String((err && err.stack) || err) };
      }
    }

    out.pageErrors = errors;
  } catch (err) {
    out.error = String((err && err.stack) || err);
  } finally {
    await browser.close();
  }

  process.stdout.write(JSON.stringify(out));
})();
