import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:3137';
const OUT = 'screenshots';
mkdirSync(OUT, { recursive: true });

// Set a labelled range/select input the React way (native setter + events).
async function setControl(page, label, value) {
  await page.evaluate(
    ({ label, value }) => {
      const el = [...document.querySelectorAll('label')]
        .find((l) => l.textContent?.includes(label));
      const input = el && document.getElementById(el.getAttribute('for') ?? '');
      if (!input) throw new Error(`control not found: ${label}`);
      const proto = input.tagName === 'SELECT' ? HTMLSelectElement : HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(proto.prototype, 'value').set;
      setter.call(input, String(value));
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    },
    { label, value },
  );
  await page.waitForTimeout(700); // debounce + worker + a few animation frames
}

async function stage(page) {
  return page.locator('[role="img"]').first();
}

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1512, height: 950 }, deviceScaleFactor: 2 });
page.on('console', (m) => m.type() === 'error' && console.log('PAGE ERROR:', m.text()));

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForSelector('canvas', { timeout: 20000 });
await page.waitForTimeout(2500); // let the scene settle / auto-rotate frames render

await page.screenshot({ path: `${OUT}/01-overview-default.png`, fullPage: false });
await (await stage(page)).screenshot({ path: `${OUT}/02-stage-default.png` });

// Wide + hot: bigger transistor body + thermal tint
await setControl(page, 'Gate Width (W)', 4.5e-6);
await setControl(page, 'Temperature (T)', 410);
await (await stage(page)).screenshot({ path: `${OUT}/03-stage-wide-hot.png` });

// Input low → output high (PMOS pulls up, OUT node bright)
await setControl(page, 'Temperature (T)', 300);
await setControl(page, 'Gate Width (W)', 1e-6);
await setControl(page, 'Input Voltage (Vin)', 0.1);
await (await stage(page)).screenshot({ path: `${OUT}/04-stage-vin-low.png` });

// Input high → output low (NMOS pulls down)
await setControl(page, 'Input Voltage (Vin)', 1.7);
await (await stage(page)).screenshot({ path: `${OUT}/05-stage-vin-high.png` });

// Long channel: gate stretches
await setControl(page, 'Input Voltage (Vin)', 0.9);
await setControl(page, 'Gate Length (L)', 9e-7);
await (await stage(page)).screenshot({ path: `${OUT}/06-stage-long-channel.png` });

// Full overview at a telling operating point
await page.screenshot({ path: `${OUT}/07-overview-linked.png`, fullPage: false });

// NAND device
await page.getByRole('tab', { name: 'NAND Gate' }).click();
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/08-overview-nand.png`, fullPage: false });

await browser.close();
console.log('screenshots written to', OUT);
