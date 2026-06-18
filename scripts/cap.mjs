import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--ignore-gpu-blocklist','--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1400, height: 850 }, deviceScaleFactor: 1.2 });
await p.goto('http://localhost:3000', { waitUntil: 'networkidle' });
const cv = await p.waitForSelector('canvas', { timeout: 30000 });
await p.waitForTimeout(2500);
const box = await cv.boundingBox(); const cx = box.x+box.width/2, cy = box.y+box.height/2;
await p.mouse.move(cx,cy); await p.mouse.down();
for (let i=1;i<=12;i++){ await p.mouse.move(cx - i*7, cy - i*2); await p.waitForTimeout(14); }
await p.mouse.up(); await p.waitForTimeout(1000);
await p.locator('section.relative').first().screenshot({ path: 'screenshots/G0-zfix.png' });
await b.close(); console.log('ok');
