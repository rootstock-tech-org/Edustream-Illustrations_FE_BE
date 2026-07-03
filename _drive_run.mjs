import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:3001';
const OUT = 'C:/Users/saurav/AppData/Local/Temp/claude/edustream-run-shots';

const browser = await chromium.launch({
  channel: 'msedge',
  args: ['--no-sandbox', '--no-first-run', '--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1512, height: 950 } });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

console.log('GOTO', BASE);
await page.goto(BASE, { waitUntil: 'commit', timeout: 90000 });
await page.waitForTimeout(8000); // first compile + React hydrate + 3D scene mount

console.log('TITLE:', await page.title());
console.log('H1:', await page.locator('h1').first().textContent().catch(() => '(none)'));
console.log('CANVAS COUNT:', await page.locator('canvas').count());
await page.screenshot({ path: `${OUT}/app-01-explore.png` });

const sliders = page.locator('input[type="range"]');
const n = await sliders.count();
console.log('RANGE INPUTS:', n);
if (n > 0) {
  const s = sliders.first();
  const before = await s.inputValue();
  await s.focus();
  for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(1000);
  const after = await s.inputValue();
  console.log('SLIDER:', before, '->', after, before !== after ? '(CHANGED)' : '(no change)');
}

const status = await page.locator('text=/Vout|Region/').first().textContent().catch(() => null);
console.log('STATUS CHIP:', status);

await page.getByRole('tab', { name: 'Analyze' }).click().catch((e) => console.log('Analyze click err', e.message));
await page.waitForTimeout(2000);
await page.screenshot({ path: `${OUT}/app-02-analyze.png` });

await page.getByRole('tab', { name: 'Learn' }).click().catch((e) => console.log('Learn click err', e.message));
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/app-03-learn.png` });

console.log('PAGE ERRORS:', errors.length ? errors.join(' | ') : 'none');
await browser.close();
console.log('DONE');
