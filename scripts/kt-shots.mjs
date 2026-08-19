// Captures the screenshots embedded in docs/kt/KNOWLEDGE-TRANSFER.md.
// Requires `npm run dev` in another terminal, then: node scripts/kt-shots.mjs
// If Next picked a different port (3000 taken), pass it:
//   KT_BASE_URL=http://localhost:3001 node scripts/kt-shots.mjs
//
// Uses playwright-core driven against the SYSTEM Google Chrome (executablePath),
// so there is no ~150 MB browser download. WebGL runs on SwiftShader in headless.
import { chromium } from 'playwright-core';
import { mkdirSync, existsSync } from 'fs';

const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
];
const executablePath = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!executablePath) throw new Error(`No Chrome found. Tried:\n  ${CHROME_CANDIDATES.join('\n  ')}`);

mkdirSync('docs/kt/screens', { recursive: true });

const b = await chromium.launch({
  executablePath,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
});
const errs = [];
const p = await b.newPage({ viewport: { width: 1500, height: 950 }, deviceScaleFactor: 1.4 });
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
p.on('pageerror', (e) => errs.push(String(e)));

const BASE_URL = process.env.KT_BASE_URL ?? 'http://localhost:3000';
await p.goto(BASE_URL, { waitUntil: 'networkidle' });
await p.waitForSelector('canvas', { timeout: 30000 });
await p.waitForTimeout(2800);

const full = (n) => p.screenshot({ path: `docs/kt/screens/${n}.png` });
const stage = () => p.locator('section.relative').first();
const stageShot = (n) => stage().screenshot({ path: `docs/kt/screens/${n}.png` });
const tab = async (name) => { await p.getByRole('tab', { name }).click(); await p.waitForTimeout(1500); };
const dev = async (name) => { await p.getByRole('tab', { name }).click(); await p.waitForTimeout(2200); };
const click = async (sel) => {
  try { await p.getByText(sel, { exact: true }).first().click(); await p.waitForTimeout(1200); } catch {}
};

// ---- NMOS (default landing) ----
await dev('NMOS');
await full('01-nmos-explore-full');
await stageShot('02-nmos-stage');
await tab('Analyze'); await full('03-nmos-analyze');
await tab('Learn');   await full('04-nmos-learn');

// cross-section
await tab('Explore');
await click('Cross-section'); await p.waitForTimeout(1400);
await stageShot('05-nmos-crosssection');
await click('Cross-section');

// ---- PMOS ----
await dev('PMOS');
await full('06-pmos-explore');
await stageShot('07-pmos-stage');

// ---- CMOS inverter ----
await dev('CMOS Inverter');
await full('08-inverter-explore');
await stageShot('09-inverter-stage');
await tab('Analyze');   await full('10-inverter-analyze-vtc');
await tab('Variation'); await full('11-inverter-variation-montecarlo');
await tab('Learn');     await full('12-inverter-learn');
await tab('Explore');

// ---- dark theme ----
const themeBtn = () => p.getByRole('button', { name: /Switch to (dark|light) mode/ });
await themeBtn().click();
await p.waitForTimeout(2200);
await full('13-dark-inverter-explore');
await tab('Analyze'); await full('14-dark-inverter-analyze');
await themeBtn().click();
await p.waitForTimeout(1500);
await tab('Explore');

// ---- fabrication walkthrough (§12) ----
await p.getByRole('button', { name: 'Fabrication' }).click();
await p.waitForSelector('canvas', { timeout: 30000 });
await p.waitForTimeout(3000);
await full('15-fabrication-intro');

// Jump into mid-flow modules so the wafer shows real built-up structure.
// NOTE: clicking a module jumps to that module's FIRST step, which is usually a
// prep/litho step — the module's namesake structure does not exist yet. Step on
// with `next()` if you want the finished result of a module.
const module = async (name) => {
  await p.getByRole('button', { name, exact: true }).click();
  await p.waitForTimeout(2600);
};
const next = async (n = 1) => {
  for (let k = 0; k < n; k++) await p.getByRole('button', { name: 'Next ›' }).click();
  await p.waitForTimeout(2600);
};
await module('Gate Oxidation & Poly');   // → step 29, wells only, no gate stack yet
await full('16-fabrication-wells');
await module('1st Interconnect');        // → step 54, devices complete, BPSG going down
await full('17-fabrication-interconnect');

// the reference-deck view
await p.getByRole('button', { name: 'Reference PDF' }).click();
await p.waitForTimeout(3000);
await full('18-fabrication-reference-pdf');

// back to the bench
await p.keyboard.press('Escape');
await p.waitForTimeout(1500);

await b.close();
console.log(errs.length ? `ERRORS (${errs.length}):\n${errs.join('\n')}` : 'No console errors.');
