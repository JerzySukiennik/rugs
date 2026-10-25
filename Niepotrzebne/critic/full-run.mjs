// Full scripted shift: runs full.js in a fresh solo page, services screenshot requests, writes the log to JSON.
import { readFileSync, writeFileSync } from 'node:fs';
import { open, sleep, guard, OUT } from './h.mjs';
const [, , label = 'full', maxSec = '900'] = process.argv;
guard((+maxSec + 120) * 1000);
const p = await open(label, { query: 'test', w: 1280, h: 720 });
await p.ev((c) => { (0, eval)(c); return true; }, readFileSync(new URL('./full.js', import.meta.url), 'utf8'));
const t0 = Date.now();
let last = {};
let done = false;
while (Date.now() - t0 < +maxSec * 1000 && !done) {
  await sleep(1500);
  const r = await p.ev(() => {
    const L = RR.report();
    const reqs = L.shotReq?.splice(0) ?? [];
    return { L: { ev: L.ev, snaps: L.snaps, done: L.done, res: L.res }, reqs };
  });
  last = r.L;
  for (const name of r.reqs) { await p.page.screenshot({ path: OUT + name }); console.log('[shot]', name); }
  if (r.L.done) done = true;
  if (r.L.ev?.length && !globalThis.printed) globalThis.printed = 0;
}
writeFileSync(OUT + '../full-log.json', JSON.stringify(last, null, 1));
console.log((last.ev ?? []).join('\n'));
console.log('RESULT', JSON.stringify(last.res ?? null));
console.log('elapsed', ((Date.now() - t0) / 1000).toFixed(0), 's');
p.flush();
await p.close();
