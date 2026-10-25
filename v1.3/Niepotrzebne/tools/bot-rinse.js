(async () => {
  const w = (ms) => new Promise((r) => setTimeout(r, ms));
  const log = {}; RR.report = () => log;
  const c = RR.debug.rugFlat('cut', 'M', 0, -3.5, 0, true); await w(800);
  const st = RR.chem.state(c);
  for (let v = 0.3; v < 0.71; v += 0.04) for (let u = 0.3; u < 0.71; u += 0.04) RR.chem.deposit(c, { u, v }, 'gel', 'lathera', 0.004);
  const box = () => { let g = 0, s = 0, wa = 0, n = 0; for (let y = Math.floor(0.3 * st.H); y < 0.7 * st.H; y++) for (let x = Math.floor(0.3 * st.W); x < 0.7 * st.W; x++) { const i = y * st.W + x; g += st.f.gel[i]; s += st.f.surf[i]; wa += st.f.water[i]; n++; } return [+(g / n).toFixed(3), +(s / n).toFixed(3), +(wa / n).toFixed(3)]; };
  log.before = box();
  const p = c.uvToWorld(0.5, 0.5).point;
  RR.debug.teleport(p.x + 0.2, p.z + 1.7, 0, -0.6); await w(300);
  const dep = { n: 0, amt: 0, recv: 0 }; const od = RR.fluids.onDeposit; RR.fluids.onDeposit = (h) => { dep.n++; dep.amt += h.amount; if (h.receiver?.carpet) dep.recv++; od(h); };
  RR.debug.holdHose(); await w(400);
  RR.debug.lmb(true);
  const t0 = performance.now();
  while (performance.now() - t0 < 6000) { const t = (performance.now() - t0) / 1000; RR.debug.look(p.x + Math.sin(t * 2.2) * 0.45, p.y, p.z + Math.cos(t * 1.3) * 0.5); await w(16); }
  RR.debug.lmb(false); await w(500);
  log.after6s = box(); log.dep = dep; log.flowL = +(RR.fluids.report().totalLiters).toFixed(2); log.fps = RR.engine.fps.toFixed(0);
  log.done = true;
})();
1
