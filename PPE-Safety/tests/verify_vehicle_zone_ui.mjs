/**
 * The vehicle zone page, on the screen.
 *
 * Checked against the running product rather than the source, because the two
 * things this page must not do are both invisible in the source: painting a
 * green "Area is clear" for a camera nothing has read yet, and implying the
 * weights can see more than the one class they have.
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

const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(`${BASE}/monitoring/vehicle-zone`, { waitUntil: "networkidle" });
await page.waitForTimeout(2500);

const text = await page.locator("body").innerText();

check("the page loads and is the one it says it is",
  /vehicle in restricted zone/i.test(text), text.slice(0, 160).replace(/\n/g, " "));

check("it raises no page error", errors.length === 0, errors.slice(0, 2).join(" | "));

// ------------------------------------------------ nothing marked, nothing claimed

check("with no area marked it says nothing is being watched",
  /no area marked|nothing is watched|mark an area/i.test(text),
  text.slice(0, 300).replace(/\n/g, " "));

check("and does not paint an all-clear for an area that does not exist",
  !/area is clear|area clear/i.test(text),
  "the page claims the area is clear before one has been drawn");

// ------------------------------------------------------ what the weights can do

check("it names the one class these weights actually have",
  /forklift/i.test(text));

check("and says plainly that other vehicles are not seen",
  /pallet truck|tug|crane|van|not seen|only forklift/i.test(text),
  "nothing on the page limits the capability's name");

check("the confidence note travels to the screen, with its measurement",
  /0\.844|0\.85|false positive|forearm/i.test(text),
  text.slice(0, 400).replace(/\n/g, " "));

// ---------------------------------------------------------------- small screen

const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
await phone.goto(`${BASE}/monitoring/vehicle-zone`, { waitUntil: "networkidle" });
await phone.waitForTimeout(2000);

const room = await phone.evaluate(() => {
  const main = document.querySelector("main") ?? document.body;
  return {
    content: Math.round(main.getBoundingClientRect().width),
    overflows: document.documentElement.scrollWidth > window.innerWidth + 1,
  };
});

check("the page leaves usable room at 390px", room.content >= 300, `${room.content}px`);
check("and does not scroll sideways at 390px", !room.overflows);

await page.screenshot({ path: new URL("./_probe_shot_vehicle.png", import.meta.url).pathname });

await browser.close();
console.log(`\n${failures === 0 ? "All vehicle zone screen checks passed." : failures + " FAILED"}`);
process.exit(failures === 0 ? 0 : 1);
