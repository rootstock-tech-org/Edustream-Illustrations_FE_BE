import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:3137';
const OUT = 'screenshots';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1512, height: 1100 }, deviceScaleFactor: 2 });
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForSelector('canvas', { timeout: 20000 });
await page.waitForTimeout(1200);

await page.getByRole('tab', { name: 'Variation' }).click();
await page.waitForTimeout(500);
const panel = page.locator('[aria-label="Process variation"]');
await panel.screenshot({ path: `${OUT}/30-mc-empty.png` });

await page.getByRole('button', { name: 'Run' }).click();
await page.waitForTimeout(700); // mid-run: histograms filling
await panel.screenshot({ path: `${OUT}/31-mc-running.png` });

// Wait for completion (Run button returns) then capture final distributions.
await page.getByRole('button', { name: 'Run' }).waitFor({ state: 'visible', timeout: 15000 });
await page.waitForTimeout(400);
await panel.screenshot({ path: `${OUT}/32-mc-complete.png` });
await page.screenshot({ path: `${OUT}/33-mc-overview.png`, fullPage: false });

await browser.close();
console.log('monte carlo screenshots written');
