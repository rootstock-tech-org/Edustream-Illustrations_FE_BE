import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const OUT = 'C:/Users/saurav/AppData/Local/Temp/claude/edustream-run-shots';

const browser = await chromium.launch({
  channel: 'msedge',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1512, height: 950 } });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

console.log('GOTO', BASE);
await page.goto(BASE, { waitUntil: 'commit', timeout: 60000 });
// give the page time to first-compile + mount the 3D scene
await page.waitForTimeout(20000);

const title = await page.title();
const h1 = await page.locator('h1').first().textContent().catch(() => '(none)');
const canvas = await page.locator('canvas').count();
// Next.js error overlay indicators
const overlayText = await page.locator('text=/Runtime TypeError|Unhandled Runtime Error|is not a function/').first().textContent().catch(() => null);

console.log('TITLE:', title);
console.log('H1:', h1);
console.log('CANVAS COUNT:', canvas);
console.log('ERROR OVERLAY:', overlayText ? `PRESENT -> ${overlayText}` : 'none');
const ruseErr = errors.find((e) => /react_use_measure|is not a function/i.test(e));
console.log('react-use-measure error:', ruseErr ? `STILL PRESENT -> ${ruseErr}` : 'GONE');
console.log('ALL CONSOLE/PAGE ERRORS:', errors.length ? errors.slice(0, 8).join(' || ') : 'none');

await page.screenshot({ path: `${OUT}/verify.png`, fullPage: false });
await browser.close();
console.log('VERDICT:', !overlayText && !ruseErr && canvas > 0 ? 'PASS (scene mounted, no error)' : 'CHECK NEEDED');
