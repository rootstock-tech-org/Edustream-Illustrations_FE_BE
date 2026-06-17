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

// Persistent handles visible in 3D view
await stage.screenshot({ path: `${OUT}/80-handles-3d.png` });

// Cross-section view
await page.getByRole('button', { name: 'Cross-section' }).click();
await page.waitForTimeout(2500); // camera eases
await stage.screenshot({ path: `${OUT}/81-cross-section.png` });

// Cross-section + anatomy
await page.getByRole('button', { name: 'Anatomy' }).click();
await page.waitForTimeout(1200);
await stage.screenshot({ path: `${OUT}/82-cross-anatomy.png` });

await browser.close();
console.log('handles + cross-section screenshots written');
