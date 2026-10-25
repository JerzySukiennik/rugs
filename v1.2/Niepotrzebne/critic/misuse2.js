(async () => {
  const W = (ms) => new Promise((r) => setTimeout(r, ms));
  const L = { ev: [], shotReq: [] }; RR.report = () => L;
  const T0 = performance.now();
  const ev = (s) => L.ev.push(`[${((performance.now() - T0) / 1000).toFixed(1)}s] ${s}`);
  const sum = (st, k) => { let s = 0; for (let i = 0; i < st.N; i++) s += st.f[k][i]; return +(s / st.N).toFixed(4); };
  const maxv = (st, k) => { let m = 0; for (let i = 0; i < st.N; i++) if (st.f[k][i] > m) m = st.f[k][i]; return +m.toFixed(3); };
  const yawOf = (fx, fz) => Math.atan2(-fx, -fz);
  const P = (c, u, v) => c.uvToWorld(u, v).point;
  const aim = async (c, sec, wob = 0.12) => { const pt = P(c, 0.5, 0.5); RR.debug.teleport(pt.x, pt.z + 0.9, yawOf(0, -1), -1.0); await W(200); RR.debug.look(pt.x, pt.y, pt.z); RR.debug.lmb(true); const t0 = performance.now(); while (performance.now() - t0 < sec * 1000) { const t = (performance.now() - t0) / 1000; RR.debug.look(pt.x + Math.sin(t * 9) * wob, pt.y, pt.z + Math.cos(t * 7) * wob * 0.5); await W(16); } RR.debug.lmb(false); await W(200); };
  const rugS = (type, size, x) => RR.debug.rugFlat(type, size, x, -3.5, 0, true);
  try {
    // A: silk + bleach pour 4 s
    let c = rugS('silk', 'S', -3); await W(800); let st = RR.chem.state(c);
    ev(`A start: chlor=${sum(st, 'chlor')} gel=${sum(st, 'gel')} bleach=${sum(st, 'bleach')}`);
    RR.debug.hold('klorin'); await W(300); const it = RR.grab.held?.item; ev(`A held=${it?.label} fill=${it?.fill} mode=${it?.mode} tilt=${it?.tilt?.toFixed?.(2)}`);
    await aim(c, 4);
    ev(`A after 4 s pour: klorin fill=${it?.fill?.toFixed?.(3)} tilt=${it?.tilt?.toFixed?.(2)} chlor sum=${sum(st, 'chlor')} max=${maxv(st, 'chlor')} gel sum=${sum(st, 'gel')} bleach sum=${sum(st, 'bleach')} max bleach=${maxv(st, 'bleach')}`);
    L.shotReq.push('misuse/01-silk-bleach.png');
    await W(2000); ev(`A +2 s: bleach sum=${sum(st, 'bleach')} max=${maxv(st, 'bleach')} damage eval=${RR.chem.evaluate(c).damage.toFixed(4)} grade=${RR.chem.evaluate(c).grade}`);
    RR.grab.release();
    // B: silk + iron, check RMB heat change and burn deposit
    c = rugS('silk', 'S', -3); await W(800); st = RR.chem.state(c);
    RR.debug.hold('iron'); await W(300);
    const iron = RR.grab.held?.item; const d0 = iron?.dots;
    RR.input.simulateMouse(2, true); await W(80); RR.input.simulateMouse(2, false); await W(80); RR.input.simulateMouse(2, true); await W(80); RR.input.simulateMouse(2, false); await W(150);
    ev(`B iron dots ${d0} -> ${iron?.dots}`);
    const pt = P(c, 0.5, 0.5); RR.debug.teleport(pt.x, pt.z + 0.9, yawOf(0, -1), -1.0); await W(200); RR.debug.look(pt.x, pt.y, pt.z); await W(100);
    RR.debug.lmb(true); await W(4000); RR.debug.lmb(false); await W(200);
    ev(`B after iron 4 s: burn sum=${sum(st, 'burn')} max=${maxv(st, 'burn')} eval damage=${RR.chem.evaluate(c).damage.toFixed(4)} grade=${RR.chem.evaluate(c).grade}`);
    L.shotReq.push('misuse/04-silk-iron.png');
    RR.grab.release();
    // C: sisal + hose, check water deposit
    c = rugS('sisal', 'M', -3); await W(800); st = RR.chem.state(c);
    RR.debug.holdHose(); await W(400); const pc = P(c, 0.5, 0.5); RR.debug.look(pc.x, pc.y, pc.z); await W(150); RR.debug.lmb(true); await W(3000); RR.debug.lmb(false); await W(300);
    ev(`C sisal after 3 s hose: water sum=${sum(st, 'water')} max=${maxv(st, 'water')} shrink max=${maxv(st, 'shrink')} eval damage=${RR.chem.evaluate(c).damage.toFixed(4)}`);
    L.shotReq.push('misuse/03-sisal-wet.png');
    RR.grab.release();
    // D: persian + hose: water and shrink/bleed
    c = rugS('persian', 'M', 3); await W(800); st = RR.chem.state(c);
    RR.debug.holdHose(); await W(400); const pd = P(c, 0.5, 0.5); RR.debug.look(pd.x, pd.y, pd.z); await W(150); RR.debug.lmb(true); await W(3000); RR.debug.lmb(false); await W(300);
    ev(`D persian after 3 s hose: water sum=${sum(st, 'water')} bleed max=${maxv(st, 'bleed')} eval damage=${RR.chem.evaluate(c).damage.toFixed(4)} grade=${RR.chem.evaluate(c).grade}`);
    RR.grab.release();
  } catch (e) { ev(`ERROR ${e.message}`); }
  L.done = true;
})();
