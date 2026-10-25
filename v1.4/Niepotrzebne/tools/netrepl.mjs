// Rug Rush net REPL: keeps host and client browsers open and evaluates command files written to a folder, for step-by-step debugging.
import fs from 'node:fs';
import { launch, sleep, installEventLog, shot, guard } from './netkit.mjs';

const DIR = process.argv[2] ?? '/tmp/rr-repl';
const N = +(process.argv[3] ?? 1);
fs.mkdirSync(DIR, { recursive: true });
for (const f of fs.readdirSync(DIR)) fs.unlinkSync(`${DIR}/${f}`);
guard(40 * 60 * 1000);
const pages = {};
pages.host = await launch('host', { w: 960, h: 540 });
await installEventLog(pages.host);
const room = await pages.host.ev(() => window.RR.net.host({ name: 'REPL bay', look: { name: 'Hosty', suit: '#d0462f' } }));
for (let i = 1; i <= N; i++) {
  const c = await launch(`c${i}`, { w: 800, h: 450, query: i > 1 ? 'test&lowres' : 'test' });
  await installEventLog(c);
  const j = await c.ev(([id, i]) => window.RR.net.join(id, { look: { name: `Client${i}` } }).catch((e) => ({ error: e.message })), [room.roomId, i]);
  pages[`c${i}`] = c;
  console.log('joined', i, JSON.stringify(j));
}
pages.host.roomId = room.roomId;
fs.writeFileSync(`${DIR}/ready`, room.roomId);
console.log('ready', room.roomId);
let n = 0;
for (;;) {
  const f = `${DIR}/cmd-${n}.mjs`;
  if (!fs.existsSync(f)) { await sleep(150); continue; }
  await sleep(50);
  let out;
  try {
    const mod = await import(f + '?t=' + Date.now());
    out = await mod.default({ ...pages, sleep, shot });
  } catch (e) {
    out = { error: e.message, stack: e.stack };
  }
  const logs = Object.values(pages).flatMap((p) => p.logs.splice(0));
  fs.writeFileSync(`${DIR}/out-${n}.json`, JSON.stringify({ out, logs: logs.slice(-60) }, null, 1));
  n++;
  if (out === 'quit') break;
}
for (const p of Object.values(pages)) await p.browser.close().catch(() => {});
process.exit(0);
