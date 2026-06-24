import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('docs/kt/screens', { recursive: true });

const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--ignore-gpu-blocklist','--enable-unsafe-swiftshader'] });
const errs = [];
const p = await b.newPage({ viewport: { width: 1500, height: 950 }, deviceScaleFactor: 1.4 });
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
p.on('pageerror', (e) => errs.push(String(e)));
await p.goto('http://localhost:3000', { waitUntil: 'networkidle' });
await p.waitForSelector('canvas', { timeout: 30000 });
await p.waitForTimeout(2800);

const full = (n) => p.screenshot({ path: `docs/kt/screens/${n}.png` });
const stage = () => p.locator('section.relative').first();
const stageShot = (n) => stage().screenshot({ path: `docs/kt/screens/${n}.png` });
const tab = async (name) => { await p.getByRole('tab', { name }).click(); await p.waitForTimeout(1500); };
const dev = async (name) => { await p.getByText(name, { exact: true }).first().click(); await p.waitForTimeout(2200); };
const click = async (sel) => { try { await p.getByText(sel, { exact: true }).first().click(); await p.waitForTimeout(1200); } catch {} };

// ---- NMOS (default landing) ----
await dev('NMOS');
await full('01-nmos-explore-full');
await stageShot('02-nmos-stage');
await tab('Analyze'); await full('03-nmos-analyze');
await tab('Learn'); await full('04-nmos-learn');
await tab('Explore');
// cross-section
await click('Cross-section'); await p.waitForTimeout(1400); await stageShot('05-nmos-crosssection');
await click('Cross-section');

// ---- PMOS ----
await dev('PMOS');
await full('06-pmos-explore');
await stageShot('07-pmos-stage');

// ---- CMOS Inverter ----
await dev('CMOS Inverter');
await full('08-inverter-explore');
await stageShot('09-inverter-stage');
await tab('Analyze'); await full('10-inverter-analyze-vtc');
await tab('Variation'); await full('11-inverter-variation-montecarlo');
await tab('Learn'); await full('12-inverter-learn');
await tab('Explore');

// ---- Dark theme ----
await p.getByRole('button', { name: /Switch to dark mode/ }).click();
await p.waitForTimeout(2200);
await full('13-dark-inverter-explore');
await tab('Analyze'); await full('14-dark-inverter-analyze');
await tab('Explore');
await p.getByRole('button', { name: /Switch to light mode/ }).click();
await p.waitForTimeout(1500);

await b.close();
console.log('ERRORS:', errs.length ? errs.join('\n') : 'none');
