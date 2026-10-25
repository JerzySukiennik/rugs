// Rug Rush fluids perf harness: uncapped-framerate headless Chrome run that reports avg/p95 frame time and RR.report().
import { createRequire } from 'node:module';
const require = createRequire('/Users/jurek/openclaw/node_modules/');
const { chromium } = require('playwright-core');
const [url, setup = '', warm = '3000', w = '1280', h = '720', out = ''] = process.argv.slice(2);
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit'],
});
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
const logs = [];
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => window.RR?.ready, null, { timeout: 60000 });
if (setup) await page.evaluate(setup);
await page.waitForTimeout(+warm);
const res = await page.evaluate(() => new Promise((resolve) => {
  const t = [];
  let last = performance.now();
  const end = last + 3000;
  const f = (now) => {
    t.push(now - last);
    last = now;
    if (now < end) requestAnimationFrame(f);
    else {
      t.sort((a, b) => a - b);
      const avg = t.reduce((a, b) => a + b, 0) / t.length;
      resolve({ frames: t.length, avgMs: +avg.toFixed(2), fps: +(1000 / avg).toFixed(1), p95Ms: +t[Math.floor(t.length * 0.95)].toFixed(2), report: window.RR.report?.() });
    }
  };
  requestAnimationFrame(f);
}));
if (out) await page.screenshot({ path: out });
console.log(JSON.stringify(res));
console.log(logs.join('\n'));
await browser.close();
