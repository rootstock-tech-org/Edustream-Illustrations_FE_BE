import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:3137';
const OUT = 'screenshots';
mkdirSync(OUT, { recursive: true });

async function setControl(page, label, value) {
  await page.evaluate(({ label, value }) => {
    const el = [...document.querySelectorAll('label')].find((l) => l.textContent?.includes(label));
    const input = el && document.getElementById(el.getAttribute('for') ?? '');
    if (!input) return;
    const proto = input.tagName === 'SELECT' ? HTMLSelectElement : HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(proto.prototype, 'value').set;
    setter.call(input, String(value));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, { label, value });
  await page.waitForTimeout(700);
}

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 950 }, deviceScaleFactor: 1.5 });
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForSelector('canvas', { timeout: 20000 });
await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.move(675, 350, { steps: 5 }); await page.mouse.up();
await page.waitForTimeout(2200);
await page.getByText('Advanced settings').click();
await page.waitForTimeout(400);

const stage = page.locator('section.relative').first();
await setControl(page, 'Input Voltage (Vin)', 1.7); // NMOS conducts → bottom-path arrows
await page.waitForTimeout(800);
await stage.screenshot({ path: `${OUT}/95-arrows.png` });

await browser.close();
console.log('arrow screenshot written');
