// Critic harness: one headless Chrome (real GPU via ANGLE/Metal) with console, page errors, failed requests and helpers.
import { createRequire } from 'node:module';
const require = createRequire('/Users/jurek/openclaw/node_modules/');
const { chromium } = require('playwright-core');

export const BASE = process.env.RR_URL ?? 'http://127.0.0.1:8963/';
export const OUT = '/Users/jurek/Downloads/Claude/Projects/Rug Rush/Niepotrzebne/critic/shots/';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function open(name, { query = 'test', w = 1280, h = 720, dpr = 1, quiet = false } = {}) {
  const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--disable-features=WebRtcHideLocalIpsWithMdns'],
  });
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
  const page = await ctx.newPage();
  const logs = [];
  const failed = [];
  page.on('console', (m) => { const t = m.text(); logs.push(`[${m.type()}] ${t}`); });
  page.on('pageerror', (e) => logs.push(`[PAGEERROR] ${e.message}\n${(e.stack || '').split('\n').slice(0, 4).join('\n')}`));
  page.on('requestfailed', (r) => failed.push(`${r.method()} ${r.url()} ${r.failure()?.errorText}`));
  page.on('response', (r) => { if (r.status() >= 400) failed.push(`HTTP ${r.status()} ${r.url()}`); });
  await page.goto(BASE + (query ? '?' + query : ''), { waitUntil: 'load' });
  await page.waitForFunction(() => window.RR?.ready, null, { timeout: 90000 });
  const p = {
    name, browser, page, logs, failed,
    ev: (fn, arg) => page.evaluate(fn, arg),
    shot: async (file) => { await page.screenshot({ path: OUT + file }); if (!quiet) console.log('[shot]', file); },
    flush: () => { if (logs.length) console.log(logs.splice(0).join('\n')); if (failed.length) console.log('[failed]', failed.splice(0).join('\n')); },
    close: () => browser.close().catch(() => {}),
  };
  return p;
}

export function guard(ms) {
  setTimeout(() => { console.log('[GUARD] timeout'); process.exit(2); }, ms).unref();
}
