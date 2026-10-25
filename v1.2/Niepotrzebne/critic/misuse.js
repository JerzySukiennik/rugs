(async () => {
  const W = (ms) => new Promise((r) => setTimeout(r, ms));
  const L = { ev: [], res: [], shotReq: [] };
  RR.report = () => L;
  const T0 = performance.now();
  const ev = (s) => L.ev.push(`[${((performance.now() - T0) / 1000).toFixed(0)}s] ${s}`);
  const lerp = (a, b, t) => a + (b - a) * t;
  const sweep = async (ms, fn) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { fn((performance.now() - t0) / ms); await W(16); } };
  const yawOf = (fx, fz) => Math.atan2(-fx, -fz);
  const standFacing = (x, z, fx, fz, pitch = -1.0) => RR.debug.teleport(x, z, yawOf(fx, fz), pitch);
  const look = (v) => RR.debug.look(v.x, v.y, v.z);
  const P = (c, u, v) => c.uvToWorld(u, v).point;
  const aimBrief = (sec, c, uv, wob = 0.1) => {
    const pt = P(c, uv.u, uv.v);
    standFacing(pt.x, pt.z + 0.9, 0, -1); // stand 0.9 m away
    return sweep(sec * 1000, (t) => look({ x: pt.x + Math.sin(t * 15) * wob, y: pt.y, z: pt.z + Math.cos(t * 11) * wob * 0.6 }));
  };
  const hoseOver = async (c, sec) => {
    RR.debug.holdHose(); await W(350);
    RR.debug.lmb(true);
    const pt = P(c, 0.5, 0.5);
    await sweep(sec * 1000, (t) => look({ x: pt.x + Math.sin(t * 9) * 0.3, y: pt.y, z: pt.z + Math.cos(t * 7) * 0.3 }));
    RR.debug.lmb(false); await W(200); RR.grab.release();
  };
  const evalBrief = (tag, c) => {
    const e = RR.chem.evaluate(c);
    const row = { tag, type: c.type, clean: +e.clean.toFixed(3), damage: +e.damage.toFixed(4), peak: +e.damagePeak.toFixed(3), wet: +e.wet.toFixed(3), grade: e.grade, ruined: e.ruined, price: RR.chem.price(c, e) };
    L.res.push(row);
    ev(`RESULT ${JSON.stringify(row)}`);
    return row;
  };
  const rugAt = (type, size, x) => {
    const c = RR.debug.rugFlat(type, size, x, -3.5, 0, true);
    return c;
  };
  // 1: silk + bleach (klorin) pour
  let c = rugAt('silk', 'S', -3);
  await W(900);
  const u = { u: 0.5, v: 0.5 };
  RR.debug.hold('klorin'); await W(300); RR.debug.lmb(true); await aimBrief(4, c, u, 0.15); RR.debug.lmb(false); await W(300); RR.grab.release();
  evalBrief('silk + chlorine bleach 4 s (no rinse)', c);
  L.shotReq.push('misuse/01-silk-bleach.png');
  await W(1500);
  // 2: silk + water (hose) 6 s
  c = rugAt('silk', 'S', -3); await W(900);
  await hoseOver(c, 6); evalBrief('silk + hose 6 s', c);
  // 3: silk + wine treatment with oxygen spotter (pick any stain sized)
  c = rugAt('silk', 'S', -3); await W(900);
  RR.debug.hold('oxilo'); await W(300); RR.debug.lmb(true); await aimBrief(4, c, u, 0.1); RR.debug.lmb(false); await W(200); RR.grab.release();
  evalBrief('silk + oxygen spotter 4 s (dry)', c);
  // 4: persian (wool) + shampoo for synthetics (lathera) + hose
  c = rugAt('persian', 'M', 3); await W(900);
  RR.debug.hold('lathera'); await W(300); RR.debug.lmb(true); await aimBrief(5, c, u, 0.2); RR.debug.lmb(false); await W(200); RR.grab.release();
  await hoseOver(c, 6); evalBrief('persian + synthetic shampoo 5 s + hose 6 s', c);
  L.shotReq.push('misuse/02-persian-shampoo.png');
  // 5: persian + enzyme (enzora) dwell
  c = rugAt('persian', 'M', 3); await W(900);
  RR.debug.hold('enzora'); await W(300); RR.debug.lmb(true); await aimBrief(3, c, u, 0.1); RR.debug.lmb(false); await W(200); RR.grab.release();
  await W(15000); evalBrief('persian + enzyme 3 s, dwell 15 s', c);
  // 6: sisal + hose 6 s and wet-vac-less soak
  c = rugAt('sisal', 'M', -3); await W(900);
  await hoseOver(c, 6); evalBrief('sisal + hose 6 s', c);
  L.shotReq.push('misuse/03-sisal-wet.png');
  // 7: sisal + compound (siccara) then vacuum (correct) for comparison
  c = rugAt('sisal', 'M', -3); await W(900);
  RR.debug.hold('siccara'); await W(300); RR.debug.lmb(true); await aimBrief(3, c, u, 0.2); RR.debug.lmb(false); await W(200); RR.grab.release();
  RR.debug.hold('brushSoft'); await W(300); RR.debug.lmb(true); await aimBrief(8, c, u, 0.2); RR.debug.lmb(false); await W(200); RR.grab.release();
  evalBrief('sisal + dry compound 3 s + soft brush 8 s', c);
  // 8: loop + degreaser (alkali) 5 s + hose (should be fine on polypropylene)
  c = rugAt('loop', 'M', 3); await W(900);
  RR.debug.hold('degrex'); await W(300); RR.debug.lmb(true); await aimBrief(4, c, u, 0.15); RR.debug.lmb(false); await W(200); RR.grab.release();
  await hoseOver(c, 5); evalBrief('loop + heavy degreaser 4 s + hose 5 s', c);
  // 9: silk + iron at max heat (burn) vs low heat
  c = rugAt('silk', 'S', -3); await W(900);
  RR.debug.hold('iron'); await W(300);
  RR.input.simulateMouse(2, true); await W(60); RR.input.simulateMouse(2, false); await W(60);
  RR.input.simulateMouse(2, true); await W(60); RR.input.simulateMouse(2, false); await W(120);
  ev(`iron dots now ${RR.grab.held?.dots}`);
  RR.debug.lmb(true); await aimBrief(5, c, u, 0.1); RR.debug.lmb(false); await W(200); RR.grab.release();
  evalBrief('silk + iron max heat 5 s', c);
  L.shotReq.push('misuse/04-silk-iron.png');
  L.done = true;
})();
