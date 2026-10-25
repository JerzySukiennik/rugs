(async () => {
  const W = (ms) => new Promise((r) => setTimeout(r, ms));
  const L = { ev: [], shotReq: [] }; RR.report = () => L;
  const yawOf = (fx, fz) => Math.atan2(-fx, -fz);
  const P = (c, u, v) => c.uvToWorld(u, v).point;
  const c = RR.debug.rugFlat('shag', 'M', 0, -3.5, 0, false); await W(900);
  const st = RR.chem.state(c);
  // a wine stain and a coffee stain as they arrive
  const pt0 = P(c, 0.5, 0.5);
  const cam = (x, y, z, tx, ty, tz) => { RR.player.teleport?.(); };
  RR.debug.teleport(0, -1.0, yawOf(0, -1), -0.9); await W(300);
  L.shotReq.push('visual/00-arrived-stains.png');
  // foam + soap on the rug
  RR.debug.hold('foamer'); await W(300);
  RR.debug.look(pt0.x, pt0.y, pt0.z); RR.debug.lmb(true); await W(3500); RR.debug.lmb(false); await W(300); RR.grab.release();
  RR.debug.hold('bubblon'); await W(300); RR.debug.look(pt0.x, pt0.y, pt0.z); RR.debug.lmb(true); await W(2000); RR.debug.lmb(false); await W(300); RR.grab.release();
  await W(1200);
  L.shotReq.push('visual/01-foam-soap.png');
  // hose a patch: standing water and runoff
  RR.debug.holdHose(); await W(400); RR.debug.look(pt0.x, pt0.y, pt0.z); RR.debug.lmb(true); await W(2500); RR.debug.lmb(false); await W(400); RR.grab.release();
  await W(600);
  L.shotReq.push('visual/02-hosed-wet.png');
  // close up from above
  RR.debug.teleport(0, -2.2, yawOf(0, -1), -1.25); await W(400);
  L.shotReq.push('visual/03-closeup-wet.png');
  L.ev.push(`state: water max ${Math.max(...st.f.water).toFixed(2)} foam max ${Math.max(...st.f.foam).toFixed(2)} gel max ${Math.max(...st.f.gel).toFixed(2)} powder max ${Math.max(...st.f.powder).toFixed(2)}`);
  L.done = true;
})();
