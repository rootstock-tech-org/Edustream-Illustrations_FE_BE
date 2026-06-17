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

await page.getByRole('button', { name: 'Anatomy' }).click();
await page.waitForTimeout(1000);
await stage.screenshot({ path: `${OUT}/70-anatomy-leaders.png` });

await page.getByRole('button', { name: 'Learning' }).click();
await page.waitForTimeout(600);
await stage.screenshot({ path: `${OUT}/71-learning-prompt.png` });

await page.getByRole('button', { name: /Start tour/ }).click();
await page.waitForTimeout(700);
await stage.screenshot({ path: `${OUT}/72-learning-gate.png` });

await page.getByRole('button', { name: /Next/ }).click();
await page.getByRole('button', { name: /Next/ }).click();
await page.waitForTimeout(700);
await stage.screenshot({ path: `${OUT}/73-learning-source.png` });

await browser.close();
console.log('anatomy/learning screenshots written');
