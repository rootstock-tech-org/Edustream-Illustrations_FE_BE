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
await page.waitForTimeout(2000);

// Preset gallery
await page.getByRole('button', { name: 'Presets' }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/10-preset-gallery.png` });

// Apply a preset
await page.getByText('Performance-Optimized').click();
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/11-preset-applied.png` });

// Guided mode → challenge list
await page.getByRole('tab', { name: 'Guided' }).click();
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/12-guided-list.png` });

// Start a challenge (baseline captured)
await page.getByText('Speed it up').click();
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/13-challenge-start.png` });

// Tune toward the goal: shrink L, widen W → faster
await setControl(page, 'Gate Length (L)', 60e-9);
await setControl(page, 'Gate Width (W)', 2.2e-6);
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/14-challenge-progress.png` });

await browser.close();
console.log('guided/preset screenshots written');
