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
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 2 });
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForSelector('canvas', { timeout: 20000 });
await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.move(680, 350, { steps: 5 }); await page.mouse.up();
await page.waitForTimeout(2500);

// Open the precise-controls drawer so setControl can find the sliders.
await page.getByText('Precise controls').click();
await page.waitForTimeout(400);

const stage = page.locator('section.relative').first();

await stage.screenshot({ path: `${OUT}/60-wiring-default.png` });

await setControl(page, 'Input Voltage (Vin)', 0.1); // PMOS conducts → top path
await stage.screenshot({ path: `${OUT}/61-vin-low.png` });

await setControl(page, 'Input Voltage (Vin)', 1.7); // NMOS conducts → bottom path
await stage.screenshot({ path: `${OUT}/62-vin-high.png` });

await setControl(page, 'Input Voltage (Vin)', 0.9);
await page.getByRole('button', { name: 'Anatomy' }).click();
await page.waitForTimeout(1000);
await stage.screenshot({ path: `${OUT}/63-anatomy.png` });

await browser.close();
console.log('wiring screenshots written');
