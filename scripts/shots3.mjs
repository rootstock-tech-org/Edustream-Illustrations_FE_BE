import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:3137';
const OUT = 'screenshots';
mkdirSync(OUT, { recursive: true });

async function setControl(page, label, value) {
  await page.evaluate(
    ({ label, value }) => {
      const el = [...document.querySelectorAll('label')].find((l) => l.textContent?.includes(label));
      const input = el && document.getElementById(el.getAttribute('for') ?? '');
      const proto = input.tagName === 'SELECT' ? HTMLSelectElement : HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(proto.prototype, 'value').set;
      setter.call(input, String(value));
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    },
    { label, value },
  );
  await page.waitForTimeout(700);
}

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1512, height: 950 }, deviceScaleFactor: 2 });
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForSelector('canvas', { timeout: 20000 });
await page.waitForTimeout(1500);

// Trigger a structured impact: shorten the gate (faster, leakier).
await setControl(page, 'Gate Length (L)', 90e-9);
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/20-impact-card.png` });

// Open a derivation to show KaTeX-rendered math.
await page.getByRole('button', { name: /Propagation Delay/ }).first().click();
await page.waitForTimeout(900); // katex chunk loads on demand
await page.screenshot({ path: `${OUT}/21-katex-derivation.png` });

// Crop the right rail for a clean look at impact + math.
const rail = page.locator('aside').last();
await rail.screenshot({ path: `${OUT}/22-rail-detail.png` });

await browser.close();
console.log('phase 7+8 screenshots written');
