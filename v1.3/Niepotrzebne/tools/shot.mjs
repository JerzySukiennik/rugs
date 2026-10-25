// Headless Chrome (real GPU via ANGLE/Metal) screenshot + console harness for Rug Rush pages.
// node shot.mjs <url> <out.png> [setupJS] [waitMs] [width] [height]
import { createRequire } from 'node:module';
const require = createRequire('/Users/jurek/openclaw/node_modules/');
const { chromium } = require('playwright-core');

const [url, out = 'shot.png', setup = '', wait = '3000', w = '1280', h = '720'] = process.argv.slice(2);
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: +(process.env.DPR || 1) });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack || ''}`));
await page.goto(url, { waitUntil: 'load' });
try {
  await page.waitForFunction(() => window.RR?.ready, null, { timeout: 60000 });
} catch (e) {
  logs.push('[harness] RR.ready timeout');
}
if (setup) {
  try {
    const r = await page.evaluate(setup);
    if (r !== undefined) logs.push('[setup] ' + JSON.stringify(r));
  } catch (e) {
    logs.push('[setup error] ' + e.message);
  }
}
await page.waitForTimeout(+wait);
const info = await page.evaluate(() => ({
  fps: window.RR?.engine?.fps?.toFixed?.(1),
  frameMs: window.RR?.engine?.frameMs?.toFixed?.(2),
  calls: window.RR?.engine?.renderer.info.render.calls,
  tris: window.RR?.engine?.renderer.info.render.triangles,
  extra: window.RR?.report?.(),
}));
logs.push('[info] ' + JSON.stringify(info));
await page.screenshot({ path: out });
console.log(logs.slice(-80).join('\n'));
await browser.close();
