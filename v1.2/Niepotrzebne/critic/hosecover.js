(async () => {
  const W = (ms) => new Promise((r) => setTimeout(r, ms));
  const L = { res: [] }; RR.report = () => L;
  let n = 0, liters = 0; const od = RR.chem.deposit.bind(RR.chem);
  RR.chem.deposit = (c, uv, kind, pid, amt, rad) => { if (kind === 'water') { n++; liters += amt || 0; } return od(c, uv, kind, pid, amt, rad); };
  for (const x of [-3, 0, 3]) {
    const c = RR.debug.rugFlat('cut', 'M', x, -3.5, 0, true); await W(600);
    const pt = c.uvToWorld(0.5, 0.5).point;
    // stand 1.0 m out in +z, look at the rug centre; hose held
    RR.debug.teleport(x, -2.4, 0, -0.5); await W(250);
    RR.debug.holdHose(); await W(400);
    RR.debug.look(pt.x, pt.y, pt.z); await W(150);
    n = 0; liters = 0;
    RR.debug.lmb(true); await W(3000); RR.debug.lmb(false); await W(300);
    const lance = RR.grab.held?.item;
    L.res.push({ x, deposits: n, liters: +liters.toFixed(3), lanceRelease: !RR.grab.held, lanceTip: lance ? [lance.body.translation().x, lance.body.translation().y, lance.body.translation().z].map((v) => +v.toFixed(2)) : null });
    RR.grab.release(); RR.removeCarpet(c); await W(200);
  }
  L.done = true;
})();
