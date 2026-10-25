// Rug Rush REPL command: three clients hose, drag a large rug and walk while the host reports cost and bandwidth.
export default async ({ host, c1, c2, c3, sleep, shot }) => {
  const rugId = await host.ev(() => (window.RR.carpets.list.find((c) => c.type === 'persian') ?? window.RR.debug.rugFlat('persian', 'L', 0, -3.5, Math.PI / 2)).id);
  await c3.ev(() => { window.RR.debug.key('KeyQ', true); });
  await sleep(80);
  await c3.ev(() => { window.RR.debug.key('KeyQ', false); });
  await sleep(1500);
  const L = await c1.ev(() => window.RR.hose.lance.body.translation());
  await c1.ev(([x, z]) => window.RR.debug.teleport(x, z), [L.x + 0.9, L.z + 0.5]);
  await sleep(300);
  const f = await c1.ev(async () => {
    const R = window.RR, lm = R.hose.lanceMesh;
    if (R.grab.held) { R.debug.key('KeyQ', true); await new Promise((r) => setTimeout(r, 60)); R.debug.key('KeyQ', false); await new Promise((r) => setTimeout(r, 400)); }
    for (let f = 0; f < 120; f++) {
      await new Promise((res) => requestAnimationFrame(res));
      lm.updateMatrixWorld();
      const q = lm.localToWorld(lm.worldToLocal(lm.position.clone()).set(0, 0.012, -0.2));
      R.debug.look(q.x, q.y, q.z);
      await new Promise((res) => requestAnimationFrame(res));
      if (R.grab.aim?.owner?.kind === 'hoseLance') { R.debug.key('KeyE', true); await new Promise((r) => setTimeout(r, 60)); R.debug.key('KeyE', false); return f; }
    }
    return -1;
  });
  await sleep(800);
  await c1.ev(() => window.RR.debug.look(0.3, 0.05, -2.6));
  await c1.ev(() => window.RR.debug.lmb(true));
  const rp = await c3.ev((id) => window.RR.entities.get(id).uvToWorld(0.5, 0.03).point, rugId);
  await c3.ev(([x, z]) => window.RR.debug.teleport(x, z), [rp.x + 0.3, rp.z + 1.0]);
  await sleep(200);
  await c3.ev(([x, y, z]) => window.RR.debug.look(x, y, z), [rp.x, rp.y, rp.z]);
  await sleep(200);
  await c3.ev(() => window.RR.debug.key('KeyE', true)); await sleep(80); await c3.ev(() => window.RR.debug.key('KeyE', false));
  await sleep(600);
  const c3held = await c3.ev(() => window.RR.grab.held?.kind ?? null);
  const tally = () => host.ev(() => Object.fromEntries([...window.RR.net.session.peers.values()].flatMap((e) => [...e.peer.tally.entries()]).reduce((m, [k, v]) => m.set(k, (m.get(k) ?? 0) + v), new Map())));
  await host.ev(() => { for (const k in window.RR.engine.prof ?? {}) delete window.RR.engine.prof[k]; });
  const t0 = await tally();
  const samples = [];
  for (let s = 0; s < 8; s++) {
    await c3.ev((k) => window.RR.debug.teleport(window.RR.player.p1.x + (k % 2 ? 0.8 : -0.8), window.RR.player.p1.z + (k % 2 ? 0.35 : -0.35)), s);
    await c2.ev((k) => window.RR.debug.teleport(4 + Math.sin(k), 6 + Math.cos(k)), s);
    await sleep(1000);
    samples.push(await host.ev(() => ({ fps: +window.RR.engine.fps.toFixed(1), frameMs: +window.RR.engine.frameMs.toFixed(2), net: window.RR.net.report() })));
  }
  const t1 = await tally();
  const per = {};
  for (const k of Object.keys(t1)) { const v = (t1[k] - (t0[k] ?? 0)) / 1024 / 3 / 8; if (v > 0.01) per[k] = +v.toFixed(2); }
  await shot(c2, '15-c2-watches-hose-and-drag.png');
  await shot(host, '15-host-hose-and-drag.png');
  const down = [];
  for (const c of [c1, c2, c3]) { await c.ev(() => window.RR.net.report()); }
  await sleep(2000);
  for (const c of [c1, c2, c3]) down.push(await c.ev(() => window.RR.net.report().downKBs));
  await c1.ev(() => window.RR.debug.lmb(false));
  await c3.ev(() => { window.RR.debug.key('KeyQ', true); });
  await sleep(80);
  await c3.ev(() => { window.RR.debug.key('KeyQ', false); });
  return { lanceFrame: f, c3held, perClientKBsByType: per, clientDownKBs: down, samples: samples.map((s) => ({ fps: s.fps, frameMs: s.frameMs, netMsPerSec: s.net.netMsPerSec, split: s.net.netSplit, upKBs: s.net.peers.map((p) => +(p.upKBs ?? 0).toFixed(1)) })) };
};
