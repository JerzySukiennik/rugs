// Rug Rush net perf test: host with ?prof plus three small clients; one hoses the floor, one drags a rug, one walks; samples host per-system cost, fps and per-client bandwidth.
import { launch, sleep, guard, closeAll, flush } from './netkit.mjs';

guard(10 * 60 * 1000);
const T = (...a) => console.log('[T]', ...a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))));
const SOLO = process.argv.includes('--solo');
const host = await launch('host', { w: 960, h: 540, query: 'test&prof' });

async function goTo(p, x, z, lx, ly, lz) {
  await p.ev(([x, z]) => window.RR.debug.teleport(x, z), [x, z]);
  await sleep(150);
  await p.ev(([lx, ly, lz]) => window.RR.debug.look(lx, ly, lz), [lx, ly, lz]);
  await sleep(150);
}

async function profile(label) {
  await host.ev(() => { for (const k in window.RR.engine.prof) delete window.RR.engine.prof[k]; });
  await sleep(4000);
  const r = await host.ev(() => {
    const p = window.RR.engine.prof;
    const top = Object.entries(p).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${k}=${v.toFixed(2)}`);
    return { fps: +window.RR.engine.fps.toFixed(1), frameMs: +window.RR.engine.frameMs.toFixed(2), net: window.RR.net.report(), top };
  });
  T(label, r);
  return r;
}

const rugId = await host.ev(() => window.RR.debug.rugFlat('persian', 'M', 0, -3.5, Math.PI / 2).id);
await sleep(1500);
if (SOLO) {
  await profile('solo idle');
  await host.ev(() => window.RR.debug.holdHose());
  await sleep(300);
  await host.ev(() => window.RR.debug.look(-1, -0.03, -2.5));
  await host.ev(() => window.RR.debug.lmb(true));
  await profile('solo hosing');
  await host.ev(() => window.RR.debug.lmb(false));
  await closeAll();
  process.exit(0);
}
const room = await host.ev(() => window.RR.net.host({ name: 'Perf bay', look: { name: 'Hosty' } }));
const cs = [];
for (let i = 1; i <= 3; i++) {
  const c = await launch(`c${i}`, { w: 480, h: 270, query: 'test&lowres' });
  const j = await c.ev(([id, i]) => window.RR.net.join(id, { look: { name: `P${i}` } }).catch((e) => ({ error: e.message })), [room.roomId, i]);
  T('join', i, j);
  cs.push(c);
}
await sleep(2000);
await profile('3 clients idle');
const [c1, c2, c3] = cs;
const L = await c1.ev(() => window.RR.hose.lance.body.translation());
await goTo(c1, L.x + 0.9, L.z + 0.5, L.x, L.y, L.z);
const f = await c1.ev(async () => {
  const R = window.RR;
  const lm = R.hose.lanceMesh;
  for (let f = 0; f < 120; f++) {
    await new Promise((res) => requestAnimationFrame(res));
    lm.updateMatrixWorld();
    const q = lm.localToWorld(lm.worldToLocal(lm.position.clone()).set(0, 0.012, -0.2));
    R.debug.look(q.x, q.y, q.z);
    await new Promise((res) => requestAnimationFrame(res));
    if (R.grab.aim?.owner?.kind === 'hoseLance') {
      R.debug.key('KeyE', true);
      await new Promise((res) => setTimeout(res, 60));
      R.debug.key('KeyE', false);
      return f;
    }
  }
  return -1;
});
await sleep(800);
await c1.ev(() => window.RR.debug.look(-1, -0.03, -1.5));
await c1.ev(() => window.RR.debug.lmb(true));
T('c1 lance', f, await c1.ev(() => window.RR.grab.held?.kind ?? null));
await profile('3 clients, c1 hosing');
const rp = await c3.ev((id) => window.RR.entities.get(id).uvToWorld(0.5, 0.04).point, rugId);
await goTo(c3, rp.x + 0.2, rp.z + 1.0, rp.x, rp.y, rp.z);
await c3.ev(() => { window.RR.debug.key('KeyE', true); });
await sleep(80);
await c3.ev(() => { window.RR.debug.key('KeyE', false); });
await sleep(500);
T('c3 holds', await c3.ev(() => window.RR.grab.held?.kind ?? null));
const walker = (async () => {
  for (let s = 0; s < 14; s++) {
    await c3.ev((k) => window.RR.debug.teleport(window.RR.player.p1.x + (k % 2 ? 0.5 : -0.5), window.RR.player.p1.z + (k % 2 ? 0.3 : -0.3)), s);
    await c2.ev((k) => window.RR.debug.teleport(4 + Math.sin(k), 6 + Math.cos(k)), s);
    await sleep(350);
  }
})();
const r = await profile('3 clients, c1 hosing, c3 dragging rug, c2 walking');
await walker;
const rates = [];
for (const c of cs) rates.push(await c.ev(() => window.RR.net.report()));
await sleep(1000);
for (const c of cs) { const x = await c.ev(() => window.RR.net.report()); T(c.name, { downKBs: x.downKBs, upKBs: x.upKBs, rtt: x.rtt }); }
await c1.ev(() => window.RR.debug.lmb(false));
for (const p of [host, ...cs]) flush(p);
await closeAll();
