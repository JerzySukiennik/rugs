// Streams a bot script's event log live, services screenshot requests, saves the final log as JSON.
import { readFileSync, writeFileSync } from 'node:fs';
import { open, sleep, guard, OUT } from './h.mjs';
const [, , botFile, label = 'bot', maxSec = '900', outName = 'bot-log.json', query = 'test'] = process.argv;
guard((+maxSec + 120) * 1000);
const p = await open(label, { query, w: 1280, h: 720 });
await p.ev((c) => { (0, eval)(c); return true; }, readFileSync(botFile, 'utf8'));
const t0 = Date.now();
let seen = 0, last = {}, done = false;
while (Date.now() - t0 < +maxSec * 1000 && !done) {
  await sleep(1000);
  const r = await p.ev(() => { const L = RR.report(); const reqs = L.shotReq?.splice(0) ?? []; return { L: JSON.parse(JSON.stringify(L)), reqs }; }).catch((e) => ({ err: e.message }));
  if (r.err) { console.log('[runner] evaluate error', r.err); break; }
  last = r.L;
  for (const e of (r.L.ev ?? []).slice(seen)) console.log(e);
  seen = (r.L.ev ?? []).length;
  for (const name of r.reqs) { await p.page.screenshot({ path: OUT + name }); console.log('[shot]', name); }
  if (r.L.done) done = true;
}
writeFileSync(OUT + '../' + outName, JSON.stringify(last, null, 1));
console.log('RESULT', JSON.stringify(last.res ?? null));
console.log('done flag', !!last.done, 'elapsed', ((Date.now() - t0) / 1000).toFixed(0), 's');
p.flush();
await p.close();
