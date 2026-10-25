// Like run-bot.mjs but with viewport and device-pixel-ratio from env (W, H, DPR) and optional shot requests.
import { readFileSync, writeFileSync } from 'node:fs';
import { open, sleep, guard, OUT } from './h.mjs';
const [, , botFile, label = 'bot', maxSec = '400', query = 'test', outName = ''] = process.argv;
guard((+maxSec + 60) * 1000);
const W = +(process.env.W ?? 1280), H = +(process.env.H ?? 720), DPR = +(process.env.DPR ?? 1);
const p = await open(label, { query, w: W, h: H, dpr: DPR });
await p.ev((c) => { (0, eval)(c); return true; }, readFileSync(botFile, 'utf8'));
const t0 = Date.now();
let last = null;
while (Date.now() - t0 < +maxSec * 1000) {
  await sleep(1500);
  const r = await p.ev(() => { const L = RR.report(); const reqs = L.shotReq?.splice(0) ?? []; return { L: JSON.parse(JSON.stringify(L)), reqs }; }).catch((e) => ({ err: e.message }));
  if (r.err) break;
  last = r.L;
  for (const name of r.reqs ?? []) { await p.page.screenshot({ path: OUT + name }); console.log('[shot]', name); }
  if (r.L.done) break;
}
if (outName) writeFileSync(outName, JSON.stringify(last, null, 1));
console.log(JSON.stringify(last));
console.log('elapsed', ((Date.now() - t0) / 1000).toFixed(0));
p.flush();
await p.close();
