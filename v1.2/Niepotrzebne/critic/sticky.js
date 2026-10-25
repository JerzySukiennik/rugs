(async () => {
  const w = (ms) => new Promise((r) => setTimeout(r, ms));
  const log = { rows: [] }; RR.report = () => log;
  const yawOf = (fx, fz) => Math.atan2(-fx, -fz);
  const run = async (label, secs, tool) => {
    const c = RR.debug.rugFlat('cut', 'M', 0, -3.5, 0, true); await w(700);
    const st = RR.chem.state(c);
    const R = 0.22, uv = { u: 0.5, v: 0.5 };
    st.surface.forEachInRadius(uv.u, uv.v, R, (x, y, wgt) => { const i = y * st.W + x; st.f.sticky[i] = Math.max(st.f.sticky[i], 1.0 * wgt); st.active[i] = 1; RR.chem.syncCell(st, i); });
    const disc = (k) => { let s = 0, n = 0; st.surface.forEachInRadius(uv.u, uv.v, R, (x, y) => { s += st.f[k][y * st.W + x]; n++; }); return +(s / n).toFixed(3); };
    const s0 = disc('sticky');
    const pt = c.uvToWorld(0.5, 0.5).point;
    RR.debug.teleport(pt.x + 0.1, pt.z + 0.85, 0, -0.9); await w(250);
    RR.debug.hold('lathera'); await w(300);
    RR.debug.look(pt.x, pt.y, pt.z); await w(100);
    RR.debug.lmb(true); const t0 = performance.now(); while (performance.now() - t0 < 2500) { RR.debug.look(pt.x + Math.sin(performance.now() / 250) * 0.12, pt.y, pt.z); await w(16); } RR.debug.lmb(false); await w(200);
    RR.grab.release();
    RR.debug.hold('brushStiff'); await w(300);
    RR.debug.lmb(true);
    const t1 = performance.now();
    const marks = {};
    while (performance.now() - t1 < secs * 1000) {
      const t = (performance.now() - t1) / 1000;
      RR.debug.teleport(pt.x + 0.1 + Math.sin(performance.now() / 300) * 0.05, pt.z + 0.85, 0, -0.9);
      RR.debug.look(pt.x + Math.sin(performance.now() / 180) * 0.12, pt.y, pt.z + Math.cos(performance.now() / 260) * 0.08);
      for (const m of [5, 10, 20, 30]) if (t >= m && !marks[m]) marks[m] = disc('sticky');
      await w(16);
    }
    RR.debug.lmb(false); await w(200);
    const s1 = disc('sticky'); const g1 = disc('gel'); const su = disc('surf');
    log.rows.push({ label, s0, sAfter: s1, removedPct: +(100 * (1 - s1 / s0)).toFixed(1), marks, gelLeft: g1, surfLeft: su });
    RR.grab.release();
    RR.removeCarpet(c);
  };
  await run('scrub 5 s', 5); await run('scrub 10 s', 10); await run('scrub 20 s', 20); await run('scrub 40 s', 40);
  log.done = true;
})();
