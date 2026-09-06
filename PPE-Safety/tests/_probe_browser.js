/**
 * The two Phase 0 claims that are only true if a browser says they are.
 *
 * Both are about what an operator reads on screen, and both were previously
 * "fixed" in code that looked right: the navbar's pills were wired to
 * defaults nobody passed, and the Doors page collapsed "no model" and "not
 * marked" into one message. Reading the source cannot tell either of those
 * apart from working software, so this drives the real built dashboard in
 * headless Chromium.
 *
 *   navbar    the page is loaded from a live backend, then every backend
 *             call is aborted at the network layer. The page itself stays
 *             up — which is exactly the outage an operator sees — and the
 *             navbar must stop claiming the system is fine.
 *
 *   doors     a fresh install: the model is loaded, nothing is marked. The
 *             page must offer to be set up, and the words "not installed"
 *             must not be anywhere on it.
 *
 * Prints one JSON object on stdout. The suite decides pass or fail; this
 * only reports what was on the screen.
 */

const { chromium } = require("./_pw");

const BASE = process.env.PHASE0_BASE || "http://127.0.0.1:8012";

// Everything the dashboard calls. The system and camera routers are mounted
// without an /api prefix (DASH-10), so blocking "**/api/**" alone leaves the
// backend half-reachable and the navbar half-right.
const BACKEND = new RegExp(
  "^" + BASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "/(api|system|camera)(/|$)",
);

const out = { base: BASE };

(async () => {
  const browser = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    args: ["--no-sandbox"],
  });

  try {
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 1080 },
    });

    // ------------------------------------------------------------------
    // 1 · the navbar under a full backend outage
    // ------------------------------------------------------------------
    {
      const page = await ctx.newPage();
      await page.goto(BASE + "/dashboard", { waitUntil: "networkidle" });
      await page.waitForTimeout(1500);

      const header = page.locator("header").first();
      out.navbar_backend_up = (await header.textContent()) || "";

      await page.route(BACKEND, (route) => route.abort("connectionrefused"));

      // Long enough for several poll cycles to be attempted and fail.
      await page.waitForTimeout(12000);

      out.navbar_backend_down = (await header.textContent()) || "";
      out.body_backend_down = (
        (await page.locator("body").innerText()) || ""
      ).slice(0, 1200);

      await page.screenshot({
        path: __dirname + "/shot_navbar_outage.png",
        fullPage: false,
      });
      await page.close();
    }

    // ------------------------------------------------------------------
    // 2 · the Doors page on a fresh install
    // ------------------------------------------------------------------
    {
      const page = await ctx.newPage();
      await page.goto(BASE + "/monitoring/door", { waitUntil: "networkidle" });
      await page.waitForTimeout(3000);

      out.doors_text = (await page.locator("body").innerText()) || "";
      out.doors_status = await page.evaluate(async (base) => {
        const r = await fetch(base + "/api/door/status");
        return (await r.json()).data;
      }, BASE);
      out.doors_config = await page.evaluate(async (base) => {
        const r = await fetch(base + "/api/door/config");
        return (await r.json()).data;
      }, BASE);

      await page.screenshot({
        path: __dirname + "/shot_doors_fresh.png",
        fullPage: true,
      });
      await page.close();
    }
  } catch (err) {
    out.error = String(err && err.stack ? err.stack : err);
  } finally {
    await browser.close();
  }

  process.stdout.write(JSON.stringify(out));
})();
