(async () => {
  const w = (ms) => new Promise((r) => setTimeout(r, ms));
  const log = { t: [] }; RR.report = () => log;
  const c = RR.debug.rugFlat('cut', 'M', 0, -3.5, 0);
  await w(800);
  const st = RR.chem.state(c);
  const snap = (tag) => { const e = RR.debug.eval(c); const avg = (k) => +(st.f[k].reduce((a, b) => a + b, 0) / st.N).toFixed(3); log.t.push([tag, Math.round(performance.now() / 1000), +e.clean.toFixed(3), +e.residue.toFixed(3), +e.wet.toFixed(3), avg('foam'), avg('gel'), avg('powder'), Object.entries(e.per).filter(([k, v]) => v > 0.004).map(([k, v]) => k + ':' + v.toFixed(3)).join(' ')]); };
  snap('start');
  const sweep = async (ms, z0, z1) => {
    const t0 = performance.now();
    while (performance.now() - t0 < ms) {
      const t = (performance.now() - t0) / ms;
      const x = -1.3 + 2.6 * (0.5 + 0.5 * Math.sin(t * Math.PI * 6));
      RR.debug.teleport(x, z0 + (z1 - z0) * t, 0, -1.05);
      RR.player.yaw = Math.sin(performance.now() / 300) * 0.35;
      await w(16);
    }
  };
  RR.debug.hold('vacuum'); await w(300); RR.debug.lmb(true);
  await sweep(20000, -1.4, -4.6); RR.debug.lmb(false); await w(200); snap('vacuumed');
  RR.debug.hold('bubblon'); await w(300); RR.debug.lmb(true); await sweep(8000, -1.4, -4.6); RR.debug.lmb(false); await w(200); snap('soap');
  RR.debug.hold('foamer'); await w(300); RR.debug.lmb(true); await sweep(8000, -1.4, -4.6); RR.debug.lmb(false); await w(200); snap('foam');
  RR.debug.holdHose(); await w(400); RR.debug.lmb(true); await sweep(8000, -1.4, -4.6); RR.debug.lmb(false); await w(200); snap('wet');
  RR.debug.hold('brushStiff'); await w(300); RR.debug.lmb(true); await sweep(15000, -1.4, -4.6); RR.debug.lmb(false); await w(200); snap('scrubbed');
  RR.debug.holdHose(); await w(400); RR.debug.lmb(true); await sweep(15000, -1.4, -4.6); RR.debug.lmb(false); await w(300); snap('rinsed');
  RR.debug.hold('squeegee'); await w(300); RR.debug.lmb(true); await sweep(10000, -1.4, -4.6); RR.debug.lmb(false); await w(200); snap('squeegeed');
  log.fps = RR.engine.fps.toFixed(0); log.fl = RR.fluids.report().totalLiters;
  log.done = true;
})();
1
