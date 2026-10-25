(async () => {
  const W = (ms) => new Promise((r) => setTimeout(r, ms));
  const T0 = performance.now();
  const L = { ev: [], snaps: [], shotReq: [], res: {}, fails: [] };
  RR.report = () => L;
  const T = () => ((performance.now() - T0) / 1000).toFixed(0);
  const ev = (s) => L.ev.push(`[${T()}s] ${s}`);
  const shot = (name) => L.shotReq.push(name);
  const press = async (code, ms = 90) => { RR.debug.key(code, true); await W(ms); RR.debug.key(code, false); await W(160); };
  const lerp = (a, b, t) => a + (b - a) * t;
  const sweep = async (ms, fn) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { fn((performance.now() - t0) / ms); await W(16); } };
  const yawOf = (fx, fz) => Math.atan2(-fx, -fz);
  const standFacing = (x, z, fx, fz, pitch = -1.0) => RR.debug.teleport(x, z, yawOf(fx, fz), pitch);
  const look = (v) => RR.debug.look(v.x, v.y, v.z);
  const snap = (tag, c) => {
    const e = RR.chem.evaluate(c);
    const s = { tag, t: +T(), clean: +e.clean.toFixed(3), wet: +e.wet.toFixed(3), res: +e.residue.toFixed(3), dmg: +e.damage.toFixed(4), grade: e.grade, dryEnough: e.dryEnough, per: Object.fromEntries(Object.entries(e.per).filter(([k, v]) => v > 0.003).map(([k, v]) => [k, +v.toFixed(3)])) };
    L.snaps.push(s);
    ev(`SNAP ${tag}: clean ${s.clean} wet ${s.wet} residue ${s.res} dmg ${s.dmg} grade ${s.grade} dry ${s.dryEnough} per ${JSON.stringify(s.per)}`);
    return s;
  };
  // rug-local helpers: P(u,v) on the rug surface (flat), horizontal axes
  const P = (c, u, v) => c.uvToWorld(u, v).point;
  const grid = async (c, vs, secPerStroke, u0 = 0.08, u1 = 0.92) => {
    let dir = 1;
    for (const v of vs) {
      const A = P(c, dir > 0 ? u0 : u1, v), B = P(c, dir > 0 ? u1 : u0, v);
      const dx = B.x - A.x, dz = B.z - A.z, len = Math.hypot(dx, dz) || 1;
      const fx = -dz / len, fz = dx / len; // forward = perpendicular to the stroke, player stands on the -f side
      await sweep(secPerStroke * 1000, (t) => { const q = { x: lerp(A.x, B.x, t) - 0.9 * fx, z: lerp(A.z, B.z, t) - 0.9 * fz }; standFacing(q.x, q.z, fx, fz); });
      dir = -dir;
    }
  };
  const stainPoint = (c, name, thr = 0.05) => {
    const st = RR.chem.state(c);
    let su = 0, sv = 0, sw = 0;
    for (let y = 0; y < st.H; y++) for (let x = 0; x < st.W; x++) { const val = st.f[name][y * st.W + x]; if (val > thr) { su += ((x + 0.5) / st.W) * val; sv += ((y + 0.5) / st.H) * val; sw += val; } }
    if (!sw) return null;
    return { u: su / sw, v: sv / sw, mass: sw / st.N };
  };
  const mass = (c, name) => { const st = RR.chem.state(c); let s = 0; for (let i = 0; i < st.N; i++) s += st.f[name][i]; return +(s / st.N).toFixed(4); };
  // spot treatment: stand 0.9 m away, aim at the stain centre and wobble for `sec`
  const spot = async (c, uv, sec, wobble = 0.12, yawOff = 0) => {
    const pt = P(c, uv.u, uv.v);
    standFacing(pt.x, pt.z + 0.9, 0, -1);
    await W(120);
    look(pt);
    await sweep(sec * 1000, (t) => look({ x: pt.x + Math.sin(t * 18) * wobble, y: pt.y, z: pt.z + Math.cos(t * 13) * wobble * 0.6 }));
  };
  const cleanupRugsOut = () => {};
  const timeIt = async (label, fn) => { const t0 = performance.now(); const r = await fn(); L.res[label] = +((performance.now() - t0) / 1000).toFixed(1); return r; };

  // ---------- Phase 0: inbound truck
  const tin = RR.trucks.find((t) => t.role === 'in'), tout = RR.trucks.find((t) => t.role === 'out');
  ev('waiting for inbound truck to open');
  while (tin.state !== 'open') await W(200);
  const inside = tin.carpetsInside();
  ev(`inbound open: ${inside.length} rolls: ${inside.map((c) => `${c.type} ${c.sizeName} @(${c.body.translation().x.toFixed(1)},${c.body.translation().z.toFixed(1)})`).join(' | ')}`);
  L.job = inside.map((c) => `${c.job?.id} (${c.job?.client})`);
  shot('full/01-truck-open.png');
  const rug = inside[0];
  const rp = rug.body.translation();
  const dockX = Math.sign(rp.x) || 1;
  ev(`player walks to the roll, rug at ${rp.x.toFixed(2)},${rp.z.toFixed(2)}`);
  // stand inside the hall beside the roll and aim at it
  standFacing(rp.x - 1.1, rp.z, 1, 0);
  await W(300);
  look(rp);
  await W(150);
  ev(`aim owner: ${RR.grab.aim?.owner?.kind} part=${RR.grab.aim?.carpetHit?.part} dist=${RR.grab.aim?.distance?.toFixed?.(2)}`);
  await press('KeyE');
  ev(`E pressed: held=${RR.grab.held?.kind ?? 'none'}`);
  if (!RR.grab.held) { L.fails.push('could not grab the inbound roll with E'); }
  shot('full/02-grabbed-roll.png');
  // drag the roll to the bay centre (0,-3.5), walking there
  const tgt = { x: 0.5, z: -3.5 };
  await sweep(7000, (t) => { const x = lerp(rp.x - 1.1, tgt.x + 1.5, t), z = lerp(rp.z, tgt.z, t); standFacing(x, z, tgt.x - x, tgt.z - z, -0.4); });
  ev(`after drag held=${RR.grab.held?.kind ?? 'none'} rug@${JSON.stringify(rug.body.translation()).slice(0, 80)}`);
  await press('KeyE');
  ev(`released: held=${RR.grab.held?.kind ?? 'none'}, state=${rug.state}`);
  await W(800);
  shot('full/03-dropped-roll.png');
  // unroll with R from the side
  const rc = rug.body.translation();
  standFacing(rc.x - 1.6, rc.z, 1, 0);
  await W(250);
  look(rc);
  await W(150);
  await press('KeyR');
  const tU = performance.now();
  while (rug.state === 'rolled' && performance.now() - tU < 8000) await W(200);
  ev(`unroll R: state=${rug.state} took ${((performance.now() - tU) / 1000).toFixed(1)}s`);
  await W(3000);
  ev(`after unroll settle: state=${rug.state}`);
  shot('full/04-unrolled.png');
  const st = RR.chem.state(rug);
  snap('start', rug);
  const soils = ['dust', 'hair', 'mud', 'sticky', 'wine', 'coffee', 'grease', 'urine', 'gum', 'wax', 'paint', 'mold'].map((k) => [k, mass(rug, k)]).filter(([, v]) => v > 0);
  ev(`soils on arrival: ${JSON.stringify(soils)}`);
  // label
  const lp = P(rug, 0.08, 0.97);
  standFacing(lp.x, lp.z + 1.0, 0, -1);
  await W(200);
  look({ x: lp.x, y: lp.y + 0.01, z: lp.z });
  await W(200);
  await press('KeyE');
  ev(`label open=${RR.hud.labelOpen} aim part=${RR.grab.aim?.carpetHit?.part}`);
  await W(600);
  shot('full/05-care-label.png');
  await press('KeyE');
  ev(`label closed=${!RR.hud.labelOpen}`);

  // ---------- Phase 1: dry vacuum on whole rug (2 passes)
  await timeIt('vacuum', async () => {
    RR.debug.hold('vacuum'); await W(300);
    RR.debug.lmb(true);
    await grid(rug, [0.06, 0.2, 0.34, 0.48, 0.62, 0.76, 0.9], 1.4);
    await grid(rug, [0.13, 0.27, 0.41, 0.55, 0.69, 0.83], 1.2);
    RR.debug.lmb(false); await W(300);
    RR.grab.release();
  });
  snap('after vacuum', rug);
  shot('full/06-vacuumed.png');

  // ---------- Phase 2: gum freeze & scrape, wax iron
  if (mass(rug, 'gum') > 0.01) {
    const g = stainPoint(rug, 'gum', 0.1) ?? stainPoint(rug, 'gum', 0.02);
    await timeIt('freeze+scrape gum', async () => {
      RR.debug.hold('frostik'); await W(300);
      await spot(rug, g, 5, 0.1);
      RR.grab.release();
      await W(3000);
      RR.debug.hold('scraper'); await W(300);
      RR.debug.lmb(true);
      await spot(rug, g, 8, 0.2);
      RR.debug.lmb(false); await W(200);
      RR.grab.release();
    });
    snap('after gum', rug);
  }
  if (mass(rug, 'wax') > 0.01) {
    const wx = stainPoint(rug, 'wax', 0.1) ?? stainPoint(rug, 'wax', 0.02);
    await timeIt('iron wax', async () => {
      RR.debug.hold('iron'); await W(300);
      RR.debug.lmb(true);
      await spot(rug, wx, 10, 0.1);
      RR.debug.lmb(false); await W(200);
      RR.grab.release();
    });
    snap('after wax', rug);
  }
  // ---------- Phase 3: spot treatments
  const spotMap = [['wine', 'oxilo', 6, 25], ['coffee', 'tannex', 6, 25], ['grease', 'absorbix', 6, 40], ['urine', 'enzora', 5, 25], ['mold', 'mycostop', 5, 30], ['paint', 'alcotol', 6, 10]];
  for (const [dirt, prod, sec, dwell] of spotMap) {
    if (mass(rug, dirt) < 0.01) continue;
    const sp = stainPoint(rug, dirt, 0.1) ?? stainPoint(rug, dirt, 0.02);
    if (!sp) continue;
    await timeIt(`spot ${dirt} with ${prod}`, async () => {
      RR.debug.hold(prod); await W(300);
      if (prod === 'absorbix') {
        RR.debug.lmb(true);
        await spot(rug, sp, sec, 0.12);
        RR.debug.lmb(false); await W(200);
        RR.grab.release();
        ev(`absorbent powder dwell ${dwell}s`);
        await W(dwell * 1000);
        RR.debug.hold('vacuum'); await W(300);
        RR.debug.lmb(true);
        await spot(rug, sp, 6, 0.2);
        RR.debug.lmb(false); await W(200);
        RR.grab.release();
      } else {
        RR.debug.lmb(true);
        await spot(rug, sp, sec, 0.1);
        RR.debug.lmb(false); await W(200);
        RR.grab.release();
        ev(`${prod} dwell ${dwell}s`);
        await W(dwell * 1000);
      }
    });
    snap(`after ${dirt} (${prod})`, rug);
  }
  shot('full/07-spot-treated.png');
  // ---------- Phase 4: shampoo + brush for sticky and mud
  await timeIt('shampoo and scrub', async () => {
    RR.debug.hold('lathera'); await W(300);
    RR.debug.lmb(true);
    await grid(rug, [0.1, 0.25, 0.4, 0.55, 0.7, 0.85], 1.6);
    RR.debug.lmb(false); await W(200);
    RR.grab.release();
    RR.debug.hold('brushStiff'); await W(300);
    RR.debug.lmb(true);
    await grid(rug, [0.1, 0.25, 0.4, 0.55, 0.7, 0.85], 2.2);
    RR.debug.lmb(false); await W(200);
    RR.grab.release();
  });
  snap('after shampoo+scrub', rug);
  shot('full/08-shampoo-scrub.png');
  // ---------- Phase 5: rinse with hose
  await timeIt('rinse', async () => {
    RR.debug.holdHose(); await W(400);
    RR.debug.lmb(true);
    await grid(rug, [0.1, 0.25, 0.4, 0.55, 0.7, 0.85], 2.4);
    RR.debug.lmb(false); await W(500);
    RR.grab.release();
  });
  snap('after rinse', rug);
  shot('full/09-rinsed.png');
  // ---------- Phase 6: squeegee
  await timeIt('squeegee', async () => {
    RR.debug.hold('squeegee'); await W(300);
    RR.debug.lmb(true);
    await grid(rug, [0.1, 0.25, 0.4, 0.55, 0.7, 0.85], 1.5);
    RR.debug.lmb(false); await W(200);
    RR.grab.release();
  });
  snap('after squeegee', rug);
  // ---------- Phase 7: drying (two air movers set down facing the rug)
  const blowers = RR.items.filter((i) => i.def?.kind === 'blower');
  ev(`blowers available: ${blowers.length}`);
  const rc2 = P(rug, 0.5, 0.5);
  await timeIt('drying', async () => {
    for (let k = 0; k < 2 && k < blowers.length; k++) {
      const b = blowers[k];
      RR.debug.hold(b.label); await W(300);
      b.useStart(); // turn on
      RR.grab.release();
      const side = k === 0 ? -1.2 : 1.2;
      const bx = rc2.x + side, bz = rc2.z - 0.6;
      const th = Math.atan2(-(rc2.x - bx), -(rc2.z - bz));
      b.body.setTranslation({ x: bx, y: 0.5, z: bz }, true);
      b.body.setRotation({ x: 0, y: Math.sin(th / 2), z: 0, w: Math.cos(th / 2) }, true);
      RR.physics.teleportBinding(b.body);
      await W(500);
    }
    standFacing(rc2.x, rc2.z + 2.5, 0, -1, -0.2);
    const t1 = performance.now();
    let snaps = 0;
    while (!RR.chem.evaluate(rug).dryEnough && performance.now() - t1 < 240000) {
      await W(4000);
      if (snaps++ % 3 === 0) ev(`dry check: wet ${RR.chem.evaluate(rug).wet.toFixed(3)}`);
    }
    ev(`dryEnough=${RR.chem.evaluate(rug).dryEnough} after ${((performance.now() - t1) / 1000).toFixed(0)}s`);
  });
  snap('after drying', rug);
  shot('full/10-drying.png');
  // ---------- Phase 8: roller
  const roller = RR.roller;
  const bo = roller.origin;
  await timeIt('roll and wrap', async () => {
    rug.body.setTranslation({ x: bo.x, y: 0.12, z: bo.z - 2.3 }, true);
    rug.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    RR.physics.teleportBinding(rug.body);
    await W(1200);
    ev(`on belt: ${RR.roller.onBelt(rug)} roller=${roller.state}`);
    standFacing(bo.x + 1.4, bo.z - 2.3, -1, 0, -0.6); await W(400);
    roller.press();
    ev(`roller press -> ${roller.state} msg=${roller.message ?? ''}`);
    const t2 = performance.now();
    while (roller.state !== 'cooldown' && roller.state !== 'idle' && performance.now() - t2 < 60000) await W(250);
    await W(800);
    ev(`roller ${roller.state} wrapped=${rug.wrapped} grade=${rug.finalEval?.grade} price=${rug.finalPrice}`);
  });
  shot('full/11-wrapped.png');
  // ---------- Phase 9: outbound truck
  while (tout.state !== 'open' && tout.state !== 'closing') await W(250);
  const slot = tout.cargoSlot(0);
  rug.body.setTranslation({ x: slot.x, y: slot.y + 0.3, z: slot.z }, true);
  RR.physics.teleportBinding(rug.body);
  await W(1200);
  const m0 = RR.economy.money;
  const btnP = { x: 18.6, z: 5.1 };
  standFacing(btnP.x, btnP.z + 1.0, 0, -1, -0.5);
  await W(300);
  look({ x: btnP.x, y: 1.3, z: btnP.z });
  await W(200);
  await press('KeyE');
  ev(`dispatch button E: requested=${tout.dispatchRequested} truck=${tout.state}`);
  const t3 = performance.now();
  while (tout.state !== 'away' && performance.now() - t3 < 40000) await W(300);
  await W(500);
  ev(`dispatched: money ${m0} -> ${RR.economy.money}, truck ${tout.state}`);
  L.res.money = [m0, RR.economy.money];
  // ---------- Phase 10: end of shift report
  RR.shift.t = 899.2;
  const t4 = performance.now();
  while (!RR.shift.ended && performance.now() - t4 < 15000) await W(200);
  await W(1500);
  shot('full/12-report.png');
  ev(`shift ended=${RR.shift.ended} t=${RR.shift.t.toFixed(1)}`);
  L.done = true;
})();
