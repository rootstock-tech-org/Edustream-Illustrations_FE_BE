import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:3137';
const OUT = 'screenshots';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1512, height: 1100 }, deviceScaleFactor: 2 });
page.on('console', (m) => m.type() === 'error' && console.log('PAGE ERR:', m.text()));
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForSelector('canvas', { timeout: 20000 });
// Force a WebGL composite by interacting, then settle.
await page.mouse.move(700, 380);
await page.mouse.down();
await page.mouse.move(740, 360, { steps: 6 });
await page.mouse.up();
await page.waitForTimeout(3000);
await page.screenshot({ path: `${OUT}/50-lab-overview.png` });

// Anatomy mode
await page.getByRole('button', { name: 'Anatomy' }).click();
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/51-anatomy.png` });

// Learning mode (in addition)
await page.getByRole('button', { name: 'Learning' }).click();
await page.waitForTimeout(1000);
await page.screenshot({ path: `${OUT}/52-learning.png` });

// Crop just the hero stage for detail
const stage = page.locator('section.relative').first();
await stage.screenshot({ path: `${OUT}/53-stage-detail.png` });

await browser.close();
console.log('interactive lab screenshots written');
