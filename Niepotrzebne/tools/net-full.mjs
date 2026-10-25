// Rug Rush full co-op test: host plus clients against real Firebase signaling, every replicated mechanic, rejoin, host leave, bandwidth and host cost.
import { launch, flush, sleep, waitFor, shot, installEventLog, guard, closeAll } from './netkit.mjs';

guard(15 * 60 * 1000);
const T = (...a) => console.log('[T]', ...a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))));
const flushAll = (...ps) => ps.forEach(flush);

async function goTo(p, x, z, lx, ly, lz) {
  await p.ev(([x, z]) => window.RR.debug.teleport(x, z), [x, z]);
  await sleep(120);
  await p.ev(([lx, ly, lz]) => window.RR.debug.look(lx, ly, lz), [lx, ly, lz]);
  await sleep(120);
}

async function grabLance(p) {
  return p.ev(async () => {
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
}

async function tally(p) {
  return p.ev(() => Object.fromEntries([...window.RR.net.session.peers.values()].flatMap((e) => [...e.peer.tally.entries()]).reduce((m, [k, v]) => m.set(k, (m.get(k) ?? 0) + v), new Map())));
}

async function tap(p, code, hold = 80) {
  await p.ev((c) => window.RR.debug.key(c, true), code);
  await sleep(hold);
  await p.ev((c) => window.RR.debug.key(c, false), code);
  await sleep(60);
}

const host = await launch('host', { w: 960, h: 540 });
await installEventLog(host);
const room = await host.ev(() => window.RR.net.host({ name: 'Rug Rush test bay', look: { name: 'Hosty', suit: '#d0462f' } }));
T('hosted', room);

const c1 = await launch('c1', { w: 800, h: 450 });
await installEventLog(c1);
const listed = await c1.ev((id) => new Promise((resolve) => {
  const off = window.RR.net.listRooms((rooms) => {
    const r = rooms.find((x) => x.id === id);
    if (r) { off(); resolve(rooms); }
  });
  setTimeout(() => resolve(null), 20000);
}), room.roomId);
T('1. room list on c1', listed);
const j1 = await c1.ev((id) => window.RR.net.join(id, { look: { name: 'Clienta', suit: '#2f9a57' } }).catch((e) => ({ error: e.message })), room.roomId);
T('2. c1 joined', j1);
await sleep(1500);
flushAll(host, c1);

T('3. movement: both see each other');
await goTo(host, -2, 6, 3, 1.2, 6);
await goTo(c1, 3, 6, -2, 1.2, 6);
for (let i = 0; i < 8; i++) {
  await host.ev((i) => window.RR.debug.teleport(-2, 6 + Math.sin(i) * 0.6), i);
  await c1.ev((i) => window.RR.debug.teleport(3, 6 + Math.cos(i) * 0.6), i);
  await sleep(150);
}
await sleep(400);
const seen = {
  hostSeesC1: await host.ev(() => { const e = [...window.RR.net.session.peers.values()][0]; return e?.player?.feet.toArray().map((v) => +v.toFixed(2)); }),
  c1Truth: await c1.ev(() => window.RR.player.p1.toArray().map((v) => +v.toFixed(2))),
  c1SeesHost: await c1.ev(() => window.RR.net.session.remotes.get(0)?.feet.toArray().map((v) => +v.toFixed(2))),
  hostTruth: await host.ev(() => window.RR.player.p1.toArray().map((v) => +v.toFixed(2))),
};
T('movement positions', seen);
await shot(c1, '02-c1-sees-host-avatar.png');
await shot(host, '02-host-sees-c1-avatar.png');

T('4. c1 picks up and throws a bottle (host physics)');
const bottle = await host.ev(() => {
  const it = window.RR.items.find((i) => i.productId === 'oxilo');
  it.body.setTranslation({ x: 2, y: 0.4, z: 3 }, true);
  it.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  window.RR.physics.teleportBinding(it.body);
  return it.id;
});
await sleep(1500);
const bpos = await c1.ev((id) => window.RR.entities.get(id).body.translation(), bottle);
await goTo(c1, 2, 4.3, bpos.x, bpos.y, bpos.z);
await tap(c1, 'KeyE');
await sleep(600);
const held = {
  host: await host.ev((id) => [...window.RR.net.session.peers.values()][0].player.grab.held?.item?.id === id, bottle),
  c1: await c1.ev((id) => window.RR.grab.held?.item?.id === id, bottle),
};
T('bottle held', held);
await c1.ev(() => window.RR.debug.look(2, 2.2, -4));
await sleep(300);
await shot(c1, '03-c1-holds-bottle.png');
await tap(c1, 'KeyF', 40);
const flight = [];
for (let i = 0; i < 6; i++) {
  await sleep(100);
  flight.push({
    host: await host.ev((id) => { const b = window.RR.entities.get(id).body; const t = b.translation(), v = b.linvel(); return [+t.x.toFixed(2), +t.y.toFixed(2), +t.z.toFixed(2), +Math.hypot(v.x, v.y, v.z).toFixed(1), b.isDynamic()]; }, bottle),
    c1: await c1.ev((id) => { const t = window.RR.entities.get(id).body.translation(); return [+t.x.toFixed(2), +t.y.toFixed(2), +t.z.toFixed(2)]; }, bottle),
  });
  if (i === 1) await shot(c1, '04-c1-sees-bottle-fly.png');
}
T('bottle flight host [x,y,z,speed,dynamic] vs c1', flight);
flushAll(host, c1);

T('5. rug: host spawns a rolled rug, c1 unrolls it with R');
const rugId = await host.ev(() => window.RR.debug.rugRolled('cut', 'M', 0, -3.5, Math.PI / 2).id);
await sleep(1500);
const rugOnC1 = await c1.ev((id) => { const c = window.RR.entities.get(id); return c ? { state: c.state, body: !!c.body, kinematic: c.body?.isKinematic() } : null; }, rugId);
T('rug on c1 before unroll', rugOnC1);
const rp = await c1.ev((id) => window.RR.entities.get(id).body.translation(), rugId);
await goTo(c1, rp.x + 1.6, rp.z, rp.x, rp.y, rp.z);
await tap(c1, 'KeyR');
await sleep(3500);
const unrolled = {
  host: await host.ev((id) => { const c = window.RR.entities.get(id); return { state: c.state, rolled: +c.rolledFraction.toFixed(2) }; }, rugId),
  c1: await c1.ev((id) => { const c = window.RR.entities.get(id); return { state: c.state, rolled: +c.rolledFraction.toFixed(2), active: c.cloth.active.reduce((a, b) => a + b, 0) }; }, rugId),
};
T('after R', unrolled);
const mid = await host.ev((id) => window.RR.entities.get(id).uvToWorld(0.5, 0.5).point, rugId);
await goTo(c1, mid.x + 2.2, mid.z + 0.6, mid.x, mid.y, mid.z);
await shot(c1, '05-c1-rug-unrolled.png');
flushAll(host, c1);

T('6. c1 sprays foam and scrubs; chemistry only on host');
const foamer = await host.ev(() => {
  const it = window.RR.items.find((i) => i.productId === 'foamer');
  it.body.setTranslation({ x: 2.3, y: 0.4, z: -1.0 }, true);
  window.RR.physics.teleportBinding(it.body);
  const br = window.RR.items.find((i) => i.toolId === 'brushStiff');
  br.body.setTranslation({ x: 2.8, y: 0.3, z: -1.0 }, true);
  window.RR.physics.teleportBinding(br.body);
  return { foamer: it.id, brush: br.id };
});
await sleep(1500);
let fp = await c1.ev((id) => window.RR.entities.get(id).body.translation(), foamer.foamer);
await goTo(c1, fp.x, fp.z + 1.0, fp.x, fp.y, fp.z);
await tap(c1, 'KeyE');
await sleep(500);
const beforeChem = await host.ev((id) => window.RR.chem.evaluate(window.RR.entities.get(id)), rugId);
await goTo(c1, mid.x + 1.4, mid.z + 0.3, mid.x + 0.2, mid.y, mid.z);
await c1.ev(() => window.RR.debug.lmb(true));
for (let i = 0; i < 20; i++) {
  await c1.ev(([x, y, z, i]) => window.RR.debug.look(x + Math.sin(i * 0.5) * 0.4, y, z + Math.cos(i * 0.4) * 0.5), [mid.x, mid.y, mid.z, i]);
  await sleep(100);
  if (i === 8) await shot(c1, '06-c1-spraying-foam.png');
}
await c1.ev(() => window.RR.debug.lmb(false));
await sleep(400);
await tap(c1, 'KeyQ');
await sleep(500);
const bp = await c1.ev((id) => window.RR.entities.get(id).body.translation(), foamer.brush);
await goTo(c1, bp.x, bp.z + 1.0, bp.x, bp.y, bp.z);
await tap(c1, 'KeyE');
await sleep(500);
const brushHeld = await c1.ev((id) => window.RR.grab.held?.item?.id === id, foamer.brush);
await goTo(c1, mid.x + 1.4, mid.z + 0.3, mid.x + 0.2, mid.y, mid.z);
await c1.ev(() => window.RR.debug.lmb(true));
for (let i = 0; i < 40; i++) {
  await c1.ev(([x, y, z, i]) => window.RR.debug.look(x + Math.sin(i * 0.9) * 0.35, y, z + Math.sin(i * 0.37) * 0.4), [mid.x, mid.y, mid.z, i]);
  await sleep(60);
}
await c1.ev(() => window.RR.debug.lmb(false));
await sleep(1500);
const afterChem = await host.ev((id) => window.RR.chem.evaluate(window.RR.entities.get(id)), rugId);
const sync = {
  host: await host.ev((id) => {
    const c = window.RR.entities.get(id);
    const sh = window.RR.net.session.shadows.get(c);
    const cov = (n, ch) => { const a = c.surface.data[n]; let s = 0; for (let i = ch; i < a.length; i += 4) s += a[i]; return +(s / (a.length / 4) / 255).toFixed(4); };
    return { foam: cov('layer', 3), water: cov('layer', 0), shadowFoam: (() => { const a = sh.data.layer; let s = 0; for (let i = 3; i < a.length; i += 4) s += a[i]; return +(s / (a.length / 4) / 255).toFixed(4); })() };
  }, rugId),
  c1: await c1.ev((id) => {
    const c = window.RR.entities.get(id);
    const cov = (n, ch) => { const a = c.surface.data[n]; let s = 0; for (let i = ch; i < a.length; i += 4) s += a[i]; return +(s / (a.length / 4) / 255).toFixed(4); };
    return { foam: cov('layer', 3), water: cov('layer', 0), surfMsgs: window.RR.net.session.stats.surf, surfKB: +(window.RR.net.session.stats.surfBytes / 1024).toFixed(1), chemTicksOff: window.RR.chem.fixedUpdate.toString().length < 12 };
  }, rugId),
};
T('brush held', brushHeld, 'chem before', { foam: beforeChem.residue, wet: beforeChem.wet }, 'after', { residue: afterChem.residue, wet: afterChem.wet, clean: afterChem.clean });
T('surface sync host vs c1', sync);
await tap(c1, 'KeyQ');
await goTo(c1, mid.x + 1.8, mid.z + 1.2, mid.x, mid.y, mid.z);
await sleep(600);
await shot(c1, '07-c1-sees-foam-on-rug.png');
await goTo(host, mid.x - 1.8, mid.z + 1.6, mid.x, mid.y, mid.z);
await sleep(300);
await shot(host, '07-host-sees-foam-on-rug.png');
flushAll(host, c1);

T('7. hose water on both');
const lance = await c1.ev(() => { const t = window.RR.hose.lance.body.translation(); return { x: t.x, y: t.y, z: t.z }; });
await goTo(c1, lance.x + 0.9, lance.z + 0.4, lance.x, lance.y - 0.1, lance.z);
await grabLance(c1);
await sleep(700);
const lanceHeld = await c1.ev(() => window.RR.grab.held?.item === window.RR.hose.lance);
await c1.ev(([x, z]) => { window.RR.debug.look(x, -0.03, z); }, [lance.x - 0.5, lance.z - 2.2]);
await c1.ev(() => window.RR.debug.lmb(true));
await sleep(1200);
await shot(c1, '08-c1-hose-spraying.png');
await goTo(host, lance.x - 2.5, lance.z + 1.5, lance.x, 0.6, lance.z - 1.5);
await sleep(1200);
await shot(host, '08-host-sees-c1-hosing.png');
await c1.ev(() => window.RR.debug.lmb(false));
await sleep(600);
const water = {
  host: await host.ev(() => ({ liters: +window.RR.fluids.totalLiters().toFixed(2), flowing: window.RR.hose.flowing })),
  c1: await c1.ev(() => ({ liters: +window.RR.fluids.totalLiters().toFixed(2), particles: window.RR.fluids.particles.count })),
};
T('lance held', lanceHeld, 'water', water);
await tap(c1, 'KeyQ');
flushAll(host, c1);

T('8. trucks on both');
const trucks = {
  host: await host.ev(() => window.RR.trucks.map((t) => [t.role, t.state, +t.pos.x.toFixed(2), +t.pos.z.toFixed(2)])),
  c1: await c1.ev(() => window.RR.trucks.map((t) => [t.role, t.state, +t.pos.x.toFixed(2), +t.pos.z.toFixed(2)])),
  hostRugs: await host.ev(() => window.RR.carpets.list.map((c) => c.id)),
  c1Rugs: await c1.ev(() => window.RR.carpets.list.map((c) => c.id)),
};
T('trucks', trucks);
await goTo(c1, 12, -6, 20, 1.2, -8);
await sleep(500);
await shot(c1, '09-c1-sees-inbound-truck.png');

T('9. roller wraps a rug on both; c1 presses the button');
const flat = await host.ev(() => window.RR.debug.rugFlat('cut', 'S', 9, 4.2, 0, true).id);
await sleep(2500);
await goTo(c1, 5.75, 4.3, 5.75, 1.0, 5.4);
const aimBtn = await c1.ev(() => window.RR.grab.aim?.owner?.label ?? null);
await tap(c1, 'KeyE');
await sleep(800);
T('aim', aimBtn, 'roller after press', await host.ev(() => [window.RR.roller.state, window.RR.roller.message]), await c1.ev(() => [window.RR.roller.state, window.RR.roller.message]));
await goTo(c1, 11.5, 2.5, 9, 0.4, 4.6);
await sleep(3000);
await shot(c1, '10-c1-roller-rolling.png');
await waitFor(host, (id) => window.RR.entities.get(id)?.wrapped, flat, 30000, 'host wrapped');
await sleep(1500);
const wrap = {
  host: await host.ev((id) => { const c = window.RR.entities.get(id); return { wrapped: c.wrapped, grade: c.finalEval?.grade, price: c.finalPrice }; }, flat),
  c1: await c1.ev((id) => { const c = window.RR.entities.get(id); return { wrapped: c.wrapped, grade: c.finalEval?.grade, price: c.finalPrice, state: c.state }; }, flat),
};
T('wrap', wrap);
const wp = await c1.ev((id) => window.RR.entities.get(id).body.translation(), flat);
await goTo(c1, wp.x + 1.5, wp.z + 1.2, wp.x, wp.y, wp.z);
await sleep(500);
await shot(c1, '11-c1-wrapped-rug.png');
flushAll(host, c1);

T('10. money: c1 orders from the shop');
const m0 = { host: await host.ev(() => window.RR.economy.money), c1: await c1.ev(() => window.RR.economy.money) };
await c1.ev(() => { const it = window.RR.shop.catalog().find((x) => x.id === 'sodalux'); window.RR.shop.buy(it); });
await sleep(1200);
const m1 = { host: await host.ev(() => window.RR.economy.money), c1: await c1.ev(() => window.RR.economy.money) };
T('money before', m0, 'after order', m1);
flushAll(host, c1);

T('11. two more clients, leave and rejoin');
const c2 = await launch('c2', { w: 640, h: 360, query: 'test&lowres' });
await installEventLog(c2);
const j2 = await c2.ev((id) => window.RR.net.join(id, { look: { name: 'Bob', suit: '#7a49c9' } }).catch((e) => ({ error: e.message })), room.roomId);
const c3 = await launch('c3', { w: 640, h: 360, query: 'test&lowres' });
await installEventLog(c3);
const j3 = await c3.ev((id) => window.RR.net.join(id, { look: { name: 'Cleo', suit: '#e0a024' } }).catch((e) => ({ error: e.message })), room.roomId);
T('c2', j2, 'c3', j3, 'host peers', await host.ev(() => window.RR.net.peers.map((p) => [p.slot, p.name, p.ping])));
await sleep(2000);
await c2.ev(() => window.RR.net.leave());
await sleep(1500);
T('host peers after c2 leave', await host.ev(() => window.RR.net.peers.map((p) => [p.slot, p.name])));
await c2.page.reload({ waitUntil: 'load' });
await c2.page.waitForFunction(() => window.RR?.ready, null, { timeout: 90000 });
await installEventLog(c2);
const tj = Date.now();
const j2b = await c2.ev((id) => window.RR.net.join(id, { look: { name: 'Bob', suit: '#7a49c9' } }).catch((e) => ({ error: e.message })), room.roomId);
T('c2 rejoined', j2b, `${Date.now() - tj} ms`);
await sleep(2500);
const fullState = {
  host: await host.ev(() => ({
    ents: [...window.RR.entities.map.values()].filter((e) => e.kind !== 'player').length,
    rugs: window.RR.carpets.list.map((c) => [c.id, c.state, c.wrapped, +c.rolledFraction.toFixed(2)]),
    money: window.RR.economy.money,
    hashes: window.RR.carpets.list.map((c) => window.RR.net.session.shadows.get(c)?.checksum()),
  })),
  c2: await c2.ev(async () => {
    const { surfaceHash } = await import('./src/net/surfaceSync.js');
    return {
      ents: [...window.RR.entities.map.values()].filter((e) => e.kind !== 'player').length,
      rugs: window.RR.carpets.list.map((c) => [c.id, c.state, c.wrapped, +c.rolledFraction.toFixed(2)]),
      money: window.RR.economy.money,
      hashes: window.RR.carpets.list.map((c) => surfaceHash(c.surface)),
    };
  }),
};
T('full state after rejoin host vs c2', fullState);
await goTo(c2, mid.x + 1.8, mid.z + 1.2, mid.x, mid.y, mid.z);
await sleep(800);
await shot(c2, '12-c2-after-rejoin-sees-foam-rug.png');
flushAll(host, c1, c2, c3);

T('12. bandwidth and host cost with 3 clients, during hose + cloth activity');
await goTo(c1, lance.x + 0.9, lance.z + 0.4, lance.x, lance.y - 0.1, lance.z);
T('c1 regrab lance frame', await grabLance(c1));
await sleep(700);
await c1.ev(([x, y, z]) => window.RR.debug.look(x, y, z), [mid.x + 0.4, mid.y, mid.z + 0.5]);
await c1.ev(() => window.RR.debug.lmb(true));
const rugP = await c3.ev((id) => window.RR.entities.get(id).uvToWorld(0.5, 0.05).point, rugId);
await goTo(c3, rugP.x + 0.9, rugP.z + 0.3, rugP.x, rugP.y, rugP.z);
await tap(c3, 'KeyE');
await sleep(500);
T('c3 holds', await c3.ev(() => window.RR.grab.held?.kind ?? null));
const tally0 = await tally(host);
for (let k = 0; k < 4; k++) await host.ev(() => window.RR.net.report());
await c2.ev(() => window.RR.net.report());
const samples = [];
for (let s = 0; s < 6; s++) {
  await c3.ev((k) => window.RR.debug.teleport(window.RR.player.p1.x + (k % 2 ? 0.9 : -0.9), window.RR.player.p1.z + (k % 2 ? 0.4 : -0.4)), s);
  await sleep(1000);
  samples.push({
    host: await host.ev(() => ({ fps: +window.RR.engine.fps.toFixed(1), frameMs: +window.RR.engine.frameMs.toFixed(2), net: window.RR.net.report() })),
    c1: await c1.ev(() => window.RR.net.report()),
    c2: await c2.ev(() => window.RR.net.report()),
    c3: await c3.ev(() => window.RR.net.report()),
  });
}
await c1.ev(() => window.RR.debug.lmb(false));
const tally1 = await tally(host);
const per = {};
for (const k of Object.keys(tally1)) per[k] = +(((tally1[k] - (tally0[k] ?? 0)) / 1024 / 3 / 6.5)).toFixed(2);
T('KB/s per client by message type during activity', per);
for (const s of samples) T('sample', { hostFps: s.host.fps, hostFrameMs: s.host.frameMs, hostNetMsPerSec: s.host.net.netMsPerSec, stateBytes: s.host.net.stateBytes, perPeerUpKBs: s.host.net.peers.map((p) => +(p.upKBs ?? 0).toFixed(1)), c1Down: s.c1.downKBs, c2Down: s.c2.downKBs, c3Down: s.c3.downKBs, c3Up: s.c3.upKBs });
await shot(host, '13-host-with-3-clients.png');
await shot(c2, '13-c2-sees-others.png');
flushAll(host, c1, c2, c3);

T('13. host leaves');
await host.ev(() => window.RR.net.leave());
await sleep(2500);
for (const c of [c1, c2, c3]) T(c.name, 'events', await c.ev(() => window.netEvents.filter((e) => e.e === 'host-left' || e.e === 'left').map((e) => e.e)), 'connected', await c.ev(() => window.RR.net.connected));
const after = await c1.ev(() => new Promise((resolve) => {
  const off = window.RR.net.listRooms((rooms) => { off(); resolve(rooms.map((r) => r.id)); });
  setTimeout(() => resolve('timeout'), 8000);
}));
T('room list after host left', after, 'contains room', Array.isArray(after) && after.includes(room.roomId));
flushAll(host, c1, c2, c3);
await closeAll();
T('done');
