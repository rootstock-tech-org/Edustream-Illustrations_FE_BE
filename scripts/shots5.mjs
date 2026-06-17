import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:3137';
const OUT = 'screenshots';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1512, height: 982 }, deviceScaleFactor: 2 });
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForSelector('canvas', { timeout: 20000 });
// Nudge the canvas (hover/drag) to force a composite, then settle.
await page.mouse.move(620, 280);
await page.mouse.down();
await page.mouse.move(660, 300, { steps: 6 });
await page.mouse.up();
await page.waitForTimeout(3500);
await page.screenshot({ path: `${OUT}/40-obsidian-overview.png` });

await page.getByRole('button', { name: 'Presets' }).click();
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/41-obsidian-presets.png` });
await page.keyboard.press('Escape');

await page.getByRole('tab', { name: 'Variation' }).click();
await page.waitForTimeout(400);
await page.getByRole('button', { name: 'Run' }).click();
await page.getByRole('button', { name: 'Run' }).waitFor({ state: 'visible', timeout: 15000 });
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/42-obsidian-variation.png` });

await browser.close();
console.log('obsidian screenshots written');
