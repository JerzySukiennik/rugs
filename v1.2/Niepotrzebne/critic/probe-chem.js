(async () => {
  const w = (ms) => new Promise((r) => setTimeout(r, ms));
  const log = { exp: [] }; RR.report = () => log;
  const runExp = async (name, dirt, product, tool, dwellS, rinse, extra = {}) => {
    const c = RR.debug.rugFlat('cut', 'M', 0, -3.5, 0, true); await w(700);
    const st = RR.chem.state(c);
    const uv = { u: 0.5, v: 0.5 };
    const R = 0.22;
    const disc = (fn) => { let s = 0, n = 0; st.surface.forEachInRadius(uv.u, uv.v, R, (x, y) => { s += fn(y * st.W + x); n++; }); return n ? s / n : 0; };
    for (const [ch, amt] of Object.entries(dirt)) st.surface.forEachInRadius(uv.u, uv.v, R, (x, y, wgt) => { const i = y * st.W + x; st.f[ch][i] = Math.max(st.f[ch][i], amt * wgt); st.active[i] = 1; RR.chem.syncCell(st, i); });
    st.surface.markAllDirty();
    const snap = (tag) => { const o = {}; for (const k of Object.keys(dirt)) o[k] = +disc((i) => st.f[k][i]).toFixed(3); o.wet = +disc((i) => st.f.water[i]).toFixed(2); o.surf = +disc((i) => st.f.surf[i]).toFixed(3); o.gel = +disc((i) => st.f.gel[i]).toFixed(3); o.powder = +disc((i) => st.f.powder[i]).toFixed(3); o.foam = +disc((i) => st.f.foam[i]).toFixed(3); return { tag, t: +(performance.now() / 1000).toFixed(0), ...o }; };
    const res = [snap('stain')];
    const pt = c.uvToWorld(uv.u, uv.v).point;
    RR.debug.teleport(pt.x + 0.1, pt.z + 0.85, 0, -0.9); await w(250);
    RR.debug.hold(product); await w(300);
    RR.debug.look(pt.x, pt.y, pt.z); await w(100);
    RR.debug.lmb(true);
    const t0 = performance.now();
    while (performance.now() - t0 < (extra.applyS ?? 4) * 1000) { RR.debug.look(pt.x + Math.sin(performance.now() / 250) * 0.12, pt.y, pt.z); await w(16); }
    RR.debug.lmb(false); await w(200);
    res.push(snap('applied'));
    // dwell
    await w(dwellS * 1000);
    res.push(snap('dwell'));
    // rinse with hose (or squeegee / scrub per extra)
    if (extra.scrubTool) {
      RR.debug.hold(extra.scrubTool); await w(300);
      RR.debug.lmb(true);
      const t1 = performance.now();
      while (performance.now() - t1 < (extra.scrubS ?? 10) * 1000) { RR.debug.look(pt.x + Math.sin(performance.now() / 180) * 0.12, pt.y, pt.z + Math.cos(performance.now() / 260) * 0.08); await w(16); }
      RR.debug.lmb(false); await w(200);
      res.push(snap('scrubbed'));
    }
    if (rinse) {
      RR.debug.holdHose(); await w(400);
      RR.debug.look(pt.x, pt.y, pt.z); await w(100);
      RR.debug.lmb(true);
      const t2 = performance.now();
      while (performance.now() - t2 < rinse * 1000) { RR.debug.look(pt.x + Math.sin(performance.now() / 300) * 0.12, pt.y, pt.z); await w(16); }
      RR.debug.lmb(false); await w(300);
      res.push(snap('rinsed'));
    }
    log.exp.push({ name, res, eval: (() => { const e = RR.debug.eval(c); return { clean: +e.clean.toFixed(3), dirt: +e.dirt.toFixed(4), residue: +e.residue.toFixed(3), damage: +e.damage.toFixed(4), wet: +e.wet.toFixed(3), grade: e.grade }; })() });
    RR.removeCarpet ? RR.removeCarpet(c) : RR.game?.removeCarpet?.(c);
    RR.economy.money += 0;
  };
  // A: wine + spot oxygen mist, dwell 20 s, hose rinse 8 s
  await runExp('A wine+oxilo mist', { wine: 1.0 }, 'oxilo', null, 20, 8, { applyS: 6 });
  // B: coffee + tannin spotter (acidic) dwell 20 s, rinse
  await runExp('B coffee+tannex mist', { coffee: 1.0 }, 'tannex', null, 20, 8, { applyS: 6 });
  // C: grease + degreaser (gel, pour) + stiff brush 10 s, rinse 8 s
  await runExp('C grease+degrex pour+brush', { grease: 1.0 }, 'degrex', null, 10, 8, { applyS: 5, scrubTool: 'brushStiff', scrubS: 10 });
  // D: sticky (soda) + shampoo + stiff brush, rinse
  await runExp('D sticky+lathera+brush', { sticky: 1.0 }, 'lathera', null, 10, 8, { applyS: 5, scrubTool: 'brushStiff', scrubS: 10 });
  // E: wine + shampoo (lathera) + brush (wrong product, should be weak)
  await runExp('E wine+lathera+brush', { wine: 1.0 }, 'lathera', null, 10, 8, { applyS: 5, scrubTool: 'brushStiff', scrubS: 10 });
  log.done = true;
})();
