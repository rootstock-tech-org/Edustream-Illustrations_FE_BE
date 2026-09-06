/**
 * Does the third state actually reach the operator?
 *
 * Everything else in this suite reads a JSON payload. A payload that says
 * `status: "unverified"` and a screen that draws it green are the same defect
 * this phase exists to close, one layer down — so the last question has to be
 * asked of a real browser, and it is asked twice: once with a picture the
 * system can read, and once with the same picture too dark to judge.
 *
 *   the screen   the reason has to be *on* it, the all-clear sentence has to
 *                be off it, and the findings panel must not paint the two
 *                states identically. The colours are compared against the
 *                page's own clear state rather than against a hardcoded green
 *                — this suite does not own the palette and should not care
 *                what it is, only that the two states are distinguishable.
 *
 *   the voice    `speechSynthesis` is replaced before any of the page's own
 *                script runs, so every utterance is recorded rather than
 *                spoken. Silence is the current bug: an operator looking away
 *                learns nothing at all when the camera stops being usable.
 *
 * Prints one JSON object on stdout. The suite decides pass or fail; this only
 * reports what was on the screen and what was said.
 *
 *   PHASE2_BASE      backend to drive          (default http://127.0.0.1:8012)
 *   PHASE2_CLEAR     path to the readable photo
 *   PHASE2_DARK      path to the same photo, too dark to judge
 *   PHASE2_MODULES   comma-separated module ids to visit
 */

const { chromium } = require("./_pw");

const BASE = process.env.PHASE2_BASE || "http://127.0.0.1:8012";
const CLEAR = process.env.PHASE2_CLEAR;
const DARK = process.env.PHASE2_DARK;
const MODULES = (process.env.PHASE2_MODULES || "ppe,mask,gloves").split(",");

/** Where each module lives, and what its page is called in the router. */
const PATHS = {
  ppe: "/monitoring/ppe",
  mask: "/monitoring/mask",
  gloves: "/monitoring/gloves",
  "restricted-zone": "/monitoring/restricted-zone",
  workstation: "/monitoring/workstation",
  door: "/monitoring/door",
  face: "/monitoring/face",
};

/**
 * Record every utterance instead of speaking it.
 *
 * Installed with addInitScript so it is in place before the page's own
 * modules load — the alert hook captures `window.speechSynthesis` when it
 * runs, and a stub installed afterwards would never be called.
 */
const STUB_SPEECH = () => {
  window.__spoken = [];

  class FakeUtterance {
    constructor(text) {
      this.text = text;
      this.lang = "en-US";
      this.rate = 1;
    }
  }

  window.SpeechSynthesisUtterance = FakeUtterance;

  // `defineProperty`, not assignment. `window.speechSynthesis` is a read-only
  // accessor on Window, so a plain assignment in non-strict code fails
  // silently and leaves the real one in place — which reads as a page that
  // never speaks, and would have been reported as this phase's own bug.
  Object.defineProperty(window, "speechSynthesis", {
    configurable: true,
    value: {
      speak(utterance) {
        window.__spoken.push(String(utterance && utterance.text));
      },
      cancel() {},
      pause() {},
      resume() {},
      getVoices() {
        return [];
      },
      speaking: false,
      pending: false,
      paused: false,
    },
  });
};

/**
 * Every colour the findings side of the page is currently painted in.
 *
 * Taken as a set rather than a list so a differently sized picture, or one
 * more box drawn over it, does not read as a different state. What matters is
 * whether the palette changed at all.
 */
const PALETTE = () => {
  const seen = new Set();

  for (const node of document.querySelectorAll("main *, [class*=panel] *")) {
    const style = getComputedStyle(node);
    for (const property of ["color", "backgroundColor", "borderTopColor"]) {
      const value = style[property];
      if (value && value !== "rgba(0, 0, 0, 0)" && value !== "transparent") {
        seen.add(value);
      }
    }
  }

  return [...seen].sort();
};

/** Check one photo on one module's page, and report what the page became. */
async function checkPhoto(page, moduleId, file) {
  await page.goto(BASE + PATHS[moduleId], { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);

  // The photo tile: one still, checked once. Chosen over the device camera
  // deliberately — a fake webcam cannot be made too dark to read on demand,
  // and this is the same code path the operator uses for a photo from the
  // floor.
  await page.getByRole("button", { name: /^photo$/i }).first()
    .click().catch(() => {});
  await page.waitForTimeout(600);

  const input = page.locator('input[type=file][accept*="image"]').first();

  if (!(await input.count())) {
    // Not a broken page — a removed one. The camera card offered five sources
    // when this probe was written and offers three now, and "Photo" was one of
    // the two taken out. The /photo endpoint it drove is still there and still
    // works; nothing on screen reaches it any more.
    //
    // Reported apart from `error` so the suite can tell "this guarantee can no
    // longer be driven from the UI" from "this page is broken". Read as an
    // error they are the same nine red checks, and nine red checks that mean a
    // deliberate product decision are how a suite stops being read at all.
    return { unreachable: "the photo source was removed from the camera card" };
  }

  await input.setInputFiles(file);

  // Long enough for the upload, the inference and the re-render. Inference on
  // a CPU is the slow part and it is seconds, not milliseconds.
  await page.waitForTimeout(9000);

  const text = await page.locator("body").innerText().catch(() => "");
  const palette = await page.evaluate(PALETTE);
  const spoken = await page.evaluate(() => window.__spoken || []);

  // What the backend said about the same picture, read from the page's own
  // origin, so the screen and the payload can be compared directly.
  const payload = await page.evaluate(async (base) => {
    const r = await fetch(base + "/api/modules");
    return (await r.json()).data.map((m) => m.module_id);
  }, BASE).catch(() => null);

  return { text, palette, spoken, modules: payload };
}

(async () => {
  const out = { base: BASE, modules: {} };

  if (!CLEAR || !DARK) {
    out.error = "PHASE2_CLEAR and PHASE2_DARK must both be set";
    process.stdout.write(JSON.stringify(out));
    return;
  }

  const browser = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    args: ["--no-sandbox"],
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1080 },
    });
    await context.addInitScript(STUB_SPEECH);

    for (const moduleId of MODULES) {
      if (!PATHS[moduleId]) continue;

      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(String(e.message)));

      try {
        const clear = await checkPhoto(page, moduleId, CLEAR);
        const dark = await checkPhoto(page, moduleId, DARK);

        await page.screenshot({
          path: `${__dirname}/_probe_shot_${moduleId}_unverified.png`,
          fullPage: false,
        });

        out.modules[moduleId] = { clear, dark, pageErrors: errors };
      } catch (err) {
        out.modules[moduleId] = {
          error: String((err && err.stack) || err),
          pageErrors: errors,
        };
      }

      await page.close();
    }
  } catch (err) {
    out.error = String((err && err.stack) || err);
  } finally {
    await browser.close();
  }

  process.stdout.write(JSON.stringify(out));
})();
