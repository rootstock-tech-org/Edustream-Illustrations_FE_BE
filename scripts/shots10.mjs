import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:3137';
const OUT = 'screenshots';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 950 }, deviceScaleFactor: 1.5 });
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForSelector('canvas', { timeout: 20000 });
await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.move(675, 350, { steps: 5 }); await page.mouse.up();
await page.waitForTimeout(2500);

const stage = page.locator('section.relative').first();
await stage.screenshot({ path: `${OUT}/90-ref-3d.png` });

await page.getByRole('button', { name: 'Anatomy' }).click();
await page.waitForTimeout(2200);
await stage.screenshot({ path: `${OUT}/91-ref-anatomy.png` });

await browser.close();
console.log('reference-style screenshots written');
