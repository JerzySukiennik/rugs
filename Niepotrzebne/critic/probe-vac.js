(async () => {
  const w = (ms) => new Promise((r) => setTimeout(r, ms));
  const log = { notes: [] }; RR.report = () => log;
  const c = RR.debug.rugFlat('cut', 'M', 0, -3.5, 0, true); await w(800);
  const st = RR.chem.state(c);
  // uniform dust 0.5 on the whole rug
  for (let i = 0; i < st.N; i++) { st.f.dust[i] = 0.5; st.active[i] = 1; RR.chem.syncCell(st, i); }
  st.surface.markAllDirty();
  const cover = new Uint8Array(st.N);
  const orig = RR.chem.vacuum.bind(RR.chem);
  let calls = 0;
  RR.chem.vacuum = (carpet, uv, rad, tool, du, dv) => { calls++; st.surface.forEachInRadius(uv.u, uv.v, rad, (x, y) => { cover[y * st.W + x] = 1; }); return orig(carpet, uv, rad, tool, du, dv); };
  const mean = (a) => { let s = 0; for (let i = 0; i < st.N; i++) s += a[i]; return s / st.N; };
  const d0 = mean(st.f.dust);
  // stationary probe: 1 second of vacuum held in place over the rug centre
  const p = c.uvToWorld(0.5, 0.5).point;
  RR.debug.teleport(p.x, p.z + 1.2, 0, -0.75); await w(300);
  RR.debug.hold('vacuum'); await w(300);
  const hz = RR.grab.held?.label;
  RR.debug.lmb(true); await w(1000); RR.debug.lmb(false); await w(200);
  log.notes.push({ held: hz, calls, dustBefore: +d0.toFixed(3), dustAfterStationary1s: +mean(st.f.dust).toFixed(3), touchedCellsStationary: cover.reduce((a, b) => a + b, 0) });
  // sweep path across whole rug like a human: 4 passes (length of rug), with yaw looking forward
  cover.fill(0); calls = 0;
  for (let i = 0; i < st.N; i++) { st.f.dust[i] = 0.5; RR.chem.syncCell(st, i); }
  const sweepPass = async (z0, z1, ms) => {
    const t0 = performance.now();
    while (performance.now() - t0 < ms) {
      const t = (performance.now() - t0) / ms;
      RR.debug.teleport(0, z0 + (z1 - z0) * t, 0, -1.0);
      await w(16);
    }
  };
  RR.debug.lmb(true);
  await sweepPass(-1.4, -4.6, 3000); // teleporting in straight line
  RR.debug.lmb(false); await w(200);
  let touched = cover.reduce((a, b) => a + b, 0);
  log.notes.push({ sweepCalls: calls, sweepDustAfter: +mean(st.f.dust).toFixed(3), touchedFrac: +(touched / st.N).toFixed(3), rugCells: st.N });
  // where is the aim point? sample aim while standing still
  RR.debug.teleport(0, -2.5, 0, -1.0); await w(200);
  const ap = RR.grab.surfaceAim(2.5);
  log.notes.push({ aimAtStandingHere: ap ? { owner: ap.owner?.kind, pt: ap.point && [ap.point.x, ap.point.y, ap.point.z].map((v) => +v.toFixed(2)) } : null, eyeY: RR.player.eye.y.toFixed(2), eye: [RR.player.eye.x, RR.player.eye.y, RR.player.eye.z].map((v) => +v.toFixed(2)) });
  log.done = true;
})();
