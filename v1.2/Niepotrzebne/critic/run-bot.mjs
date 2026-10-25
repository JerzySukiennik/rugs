// Runs one of the scripted bots (bot-*.js) in a fresh ?test=1 page, waits for log.done, prints the log.
import { readFileSync } from 'node:fs';
import { open, sleep, guard } from './h.mjs';
const [, , botFile, label = 'bot', maxSec = '400', query = 'test'] = process.argv;
guard((+maxSec + 60) * 1000);
const p = await open(label, { query, w: 1280, h: 720 });
const code = readFileSync(botFile, 'utf8');
await p.ev((c) => { (0, eval)(c); return true; }, code);
const t0 = Date.now();
let last = null;
while (Date.now() - t0 < +maxSec * 1000) {
  await sleep(2000);
  const r = await p.ev(() => (RR.report()));
  last = r;
  if (r.done) break;
}
console.log(JSON.stringify(last, null, 0));
console.log('elapsed', ((Date.now() - t0) / 1000).toFixed(0), 's');
p.flush();
await p.close();
