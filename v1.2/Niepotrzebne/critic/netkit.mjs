// Rug Rush net test kit: launches separate headless Chrome instances (real GPU via ANGLE/Metal) as host and clients and exposes small helpers.
import { createRequire } from 'node:module';
const require = createRequire('/Users/jurek/openclaw/node_modules/');
const { chromium } = require('playwright-core');

export const BASE = process.env.RR_URL ?? 'http://localhost:8961/';
export const SHOTS = decodeURIComponent(new URL('./shots/net/', import.meta.url).pathname);

export async function launch(name, { w = 960, h = 540, query = 'test' } = {}) {
  const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--disable-features=WebRtcHideLocalIpsWithMdns'],
  });
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const logs = [];
  page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error' || m.type() === 'warning' || t.startsWith('[net]') || t.startsWith('[T]')) logs.push(`[${name}:${m.type()}] ${t}`);
  });
  page.on('pageerror', (e) => logs.push(`[${name}:pageerror] ${e.message}\n${e.stack || ''}`));
  await page.goto(BASE + '?' + query, { waitUntil: 'load' });
  const p = { name, browser, page, logs, ev: (fn, arg) => page.evaluate(fn, arg) };
  browsers.push(p);
  await page.waitForFunction(() => window.RR?.ready, null, { timeout: 90000 });
  return p;
}

export function flush(p) {
  if (p.logs.length) console.log(p.logs.splice(0).join('\n'));
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browsers = [];
export function guard(ms) {
  setTimeout(async () => {
    console.log(`[T] GUARD TIMEOUT after ${ms} ms`);
    for (const p of browsers) for (const l of p.logs.splice(0)) console.log(l);
    for (const p of browsers) await p.browser.close().catch(() => {});
    process.exit(2);
  }, ms).unref();
}

export async function closeAll() {
  for (const p of browsers) await p.browser.close().catch(() => {});
}

export async function waitFor(p, fn, arg, timeout = 30000, label = '') {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const v = await p.page.evaluate(fn, arg).catch((e) => ({ __err: e.message }));
    if (v && !v.__err) return v;
    await sleep(250);
  }
  throw new Error(`timeout waiting for ${label || fn.toString().slice(0, 80)} on ${p.name}`);
}

export async function shot(p, file) {
  await p.page.screenshot({ path: SHOTS + file });
  console.log(`[shot] ${file}`);
}

export async function installEventLog(p) {
  await p.page.evaluate(() => {
    const n = window.RR.net;
    window.netEvents = [];
    for (const e of ['peer-join', 'peer-leave', 'host-left', 'left', 'error', 'snapshot']) n.on(e, (d) => {
      window.netEvents.push({ e, d: JSON.parse(JSON.stringify(d ?? null, (k, v) => (v instanceof Error ? v.message : v))) });
      console.log(`[T] event ${e} ${JSON.stringify(d ?? null, (k, v) => (v instanceof Error ? v.message : v)).slice(0, 160)}`);
    });
  });
}
