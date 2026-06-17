import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--ignore-gpu-blocklist','--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1400, height: 950 }, deviceScaleFactor: 1.5 });
await p.goto('http://localhost:3137', { waitUntil: 'networkidle' });
await p.waitForSelector('canvas', { timeout: 20000 });
await p.mouse.move(640,360); await p.mouse.down(); await p.mouse.move(675,350,{steps:5}); await p.mouse.up();
await p.waitForTimeout(3000);
await p.locator('section.relative').first().screenshot({ path: 'screenshots/96-coupled.png' });
await b.close(); console.log('captured ok');
