/**
 * Phase 5, on the screen.
 *
 * The agent that made these changes was cut off by a session limit part-way
 * through checking its own work, so every one of them was committed unproved.
 * This asserts them against the running product.
 *
 * The chart check is the one that matters most, and it is deliberately made on
 * the *computed* height rather than the inline style. The defect was that
 * React set `height: 45.7%` correctly and the browser resolved it to 0px,
 * because the column had no definite height to take a percentage of — so a
 * test that reads the inline style passes on the broken build.
 */

import { createRequire } from "node:module";
import { execSync } from "node:child_process";

async function loadPlaywright() {
  const require = createRequire(import.meta.url);
  const roots = [];
  try {
    roots.push(execSync("npm root -g", { encoding: "utf8" }).trim());
  } catch { /* npm not on PATH */ }
  roots.push(new URL("../frontend/node_modules", import.meta.url).pathname);

  for (const spec of ["playwright", ...roots.map((r) => `${r}/playwright`)]) {
    try {
      const loaded = await import(require.resolve(spec));
      return loaded.chromium ? loaded : loaded.default;
    } catch { /* try the next */ }
  }
  throw new Error("Could not find playwright.");
}

const { chromium } = await loadPlaywright();

const BASE = process.env.BASE ?? "http://127.0.0.1:8012";

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log((ok ? "PASS  " : "FAIL  ") + name + (!ok && detail ? `  [${detail}]` : ""));
  if (!ok) failures++;
};

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});

// ---------------------------------------------------------------- DASH-03

const wide = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await wide.goto(`${BASE}/reports`, { waitUntil: "networkidle" });
await wide.waitForTimeout(2500);

/**
 * Every chart bar's rendered height, in real pixels.
 *
 * Two things this got wrong before it got them right, both worth keeping.
 * Asking the whole document for anything with a percentage height caught
 * unrelated layout elements and failed on a page whose bars were all fine. And
 * a bar legitimately asking for `0%` — the severity sub-bar of a day with none
 * of that severity — is *correct* at zero pixels, so "every bar is taller than
 * nothing" fails on a working chart. What DASH-03 is about is a bar that asks
 * for a real percentage and gets nothing, so that is what is asserted.
 */
const barHeights = async (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll("[style]")]
      .filter((el) => /^\d+(\.\d+)?%$/.test(el.style.height))
      .map((el) => ({
        asked: parseFloat(el.style.height),
        got: el.getBoundingClientRect().height,
      })),
  );

const wideBars = await barHeights(wide);

check("the reports page has bars that ask for a percentage height",
  wideBars.length > 0, `${wideBars.length} found`);

const asked = wideBars.filter((b) => b.asked > 0);

check("every bar asking for a real height gets real pixels, not zero",
  asked.length > 0 && asked.every((b) => b.got > 0),
  JSON.stringify(asked.filter((b) => b.got <= 0).slice(0, 4)));

check("the tallest bar is meaningfully tall",
  asked.length > 0 && Math.max(...asked.map((b) => b.got)) > 20,
  `tallest ${Math.max(0, ...asked.map((b) => b.got)).toFixed(1)}px`);

await wide.screenshot({ path: new URL("./_probe_shot_reports.png", import.meta.url).pathname });

// ---------------------------------------------------------------- DASH-06

const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });

for (const [name, path] of [["dashboard", "/"], ["events", "/events"], ["doors", "/monitoring/door"]]) {
  await phone.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  await phone.waitForTimeout(1800);

  const room = await phone.evaluate(() => {
    const main = document.querySelector("main") ?? document.body;
    return {
      content: Math.round(main.getBoundingClientRect().width),
      overflows: document.documentElement.scrollWidth > window.innerWidth + 1,
    };
  });

  check(`${name} leaves the content usable room at 390px`,
    room.content >= 300, `${room.content}px wide`);

  check(`${name} does not scroll sideways`, !room.overflows);
}

await phone.screenshot({ path: new URL("./_probe_shot_phone.png", import.meta.url).pathname });

// ------------------------------------------------- the invisible things

// The unreliable and crowded door states are asserted by tests/verify_phase4.py,
// which drives the real module. Mocking `/api/door/results` here proved
// useless: the page only polls it while a camera is watching, so the intercept
// never fired and the check measured an empty page rather than the states it
// named.

// ------------------------------------------------- workstation + face

const ws = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await ws.goto(`${BASE}/monitoring/workstation`, { waitUntil: "networkidle" });
await ws.waitForTimeout(2000);
const wsText = await ws.locator("body").innerText();

check("the workstation page states the real latency, not just the allowance",
  /confirm|grace|about \d|after \d/i.test(wsText),
  wsText.slice(0, 200).replace(/\n/g, " "));

const face = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await face.goto(`${BASE}/monitoring/face`, { waitUntil: "networkidle" });
await face.waitForTimeout(2000);
const faceText = await face.locator("body").innerText();

check("the face page says the watchlist covers every camera",
  /every camera|all cameras|everywhere/i.test(faceText),
  faceText.slice(0, 200).replace(/\n/g, " "));

await browser.close();

console.log(`\n${failures === 0 ? "All Phase 5 screen checks passed." : failures + " FAILED"}`);
process.exit(failures === 0 ? 0 : 1);
