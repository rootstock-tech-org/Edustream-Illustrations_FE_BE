import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const BASE = 'http://localhost:8012';
const S = '/tmp/claude-0/-home-user-vikasgroup-visual-analytics-fullstack-beta/34a9e001-1e22-5fc0-a6b4-dd924c10c2cc/scratchpad';
let failures = 0;
const check = (name, ok, detail = '') => {
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (!ok && detail ? `  [${detail}]` : ''));
  if (!ok) failures += 1;
};

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: [
    '--no-sandbox',
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
  ],
});

// One persistent context, so the fake device's id survives the "restart".
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
const page = await ctx.newPage();

// ---- first start: the popup appears -----------------------------------
await page.goto(BASE + '/monitoring/restricted-zone', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
await page.getByRole('button', { name: /start watching/i }).click();

const dialog = page.getByRole('dialog', { name: /new camera detected/i });
let appeared = true;
try {
  await dialog.waitFor({ state: 'visible', timeout: 15000 });
} catch {
  appeared = false;
}
check('starting an unknown camera shows the registration popup', appeared);

if (appeared) {
  // Mandatory fields: the button stays disabled until both are filled.
  const registerButton = page.getByRole('button', { name: /register camera/i });
  check('Register is disabled while the fields are empty',
        await registerButton.isDisabled());

  await page.getByPlaceholder('Weldbay-1').fill('Weldbay-1');
  await page.getByPlaceholder('Laser Area').fill('Laser Area');
  await registerButton.click();

  await page.getByText('Camera registered successfully').waitFor({ timeout: 8000 })
    .then(() => check('the success tick is shown', true))
    .catch(() => check('the success tick is shown', false));

  await dialog.waitFor({ state: 'hidden', timeout: 8000 })
    .then(() => check('the dialog closes and the camera starts', true))
    .catch(() => check('the dialog closes and the camera starts', false));

  await page.waitForTimeout(2500);
  const identity = await page.getByText(/Weldbay-1/).first().isVisible().catch(() => false);
  check('the page shows the registered identity', identity);
  await page.screenshot({ path: `${S}/e2e_registered.png` });
}

// The register agrees, server-side.
const listed = await page.evaluate(async (base) => {
  const r = await fetch(base + '/api/cameras');
  return (await r.json()).data.cameras;
}, BASE);
check('the backend register holds Weldbay-1 / Laser Area',
      listed.length === 1 && listed[0].camera_name === 'Weldbay-1'
      && listed[0].location === 'Laser Area' && listed[0].status === 'active',
      JSON.stringify(listed));

// ---- restart: same camera, no popup -----------------------------------
await page.goto(BASE + '/monitoring/restricted-zone', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);
await page.getByRole('button', { name: /start watching/i }).click();

let reappeared = false;
try {
  await page.getByRole('dialog', { name: /new camera detected/i })
    .waitFor({ state: 'visible', timeout: 7000 });
  reappeared = true;
} catch {}
check('after a restart the same camera is NOT asked again', !reappeared);

await page.waitForTimeout(2500);
const identityAgain = await page.getByText(/Weldbay-1/).first().isVisible().catch(() => false);
check('its registered identity is applied automatically', identityAgain);
await page.screenshot({ path: `${S}/e2e_restart.png` });

// ---- the management page ----------------------------------------------
await page.goto(BASE + '/cameras', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
const row = await page.getByText('Weldbay-1').first().isVisible().catch(() => false);
const place = await page.getByText('Laser Area').first().isVisible().catch(() => false);
check('the Cameras page lists it with its location', row && place);
await page.screenshot({ path: `${S}/e2e_cameras_page.png` });

await browser.close();
console.log(failures === 0 ? '\nAll E2E camera checks passed.' : `\n${failures} FAILED`);
process.exit(failures ? 1 : 0);
