(async () => {
  const W = (ms) => new Promise((r) => setTimeout(r, ms));
  const L = { ev: [], shotReq: [] }; RR.report = () => L;
  const T0 = performance.now();
  const ev = (s) => L.ev.push(`[${((performance.now() - T0) / 1000).toFixed(1)}s] ${s}`);
  const yawOf = (fx, fz) => Math.atan2(-fx, -fz);
  try {
    const roller = RR.roller, bo = roller.origin;
    const tout = RR.trucks.find((t) => t.role === 'out');
    const rug = RR.debug.rugFlat("cut", "M", bo.x, bo.z - 2.3, 0, true);
    await W(700);
    ev(`rug ${rug.type} state=${rug.state} body=${!!rug.body}`);
    await W(1200);
    ev(`on belt: ${roller.onBelt(rug)} roller=${roller.state}`);
    RR.debug.teleport(bo.x + 1.4, bo.z - 2.3, yawOf(-1, 0), -0.6); await W(400);
    roller.press();
    ev(`roller press -> ${roller.state} msg=${roller.message ?? ''}`);
    const t2 = performance.now();
    while (roller.state !== 'cooldown' && roller.state !== 'idle' && performance.now() - t2 < 60000) await W(250);
    await W(800);
    ev(`roller ${roller.state} wrapped=${rug.wrapped} grade=${rug.finalEval?.grade} price=${rug.finalPrice}`);
    L.shotReq.push('ship/01-wrapped.png');
    // outbound
    const t3 = performance.now();
    while (tout.state !== 'open' && tout.state !== 'closing' && performance.now() - t3 < 90000) await W(250);
    ev(`outbound truck state=${tout.state}`);
    const slot = tout.cargoSlot(0);
    if (rug.body) { rug.body.setTranslation({ x: slot.x, y: slot.y + 0.3, z: slot.z }, true); RR.physics.teleportBinding(rug.body); } else ev("no body for wrapped rug");
    await W(1200);
    ev(`in outbound: ${tout.carpetsInside().length} wrapped=${tout.carpetsInside().filter((c) => c.wrapped).length}`);
    const m0 = RR.economy.money;
    const btn = { x: 18.6, z: 5.1 };
    RR.debug.teleport(btn.x, btn.z + 1.0, yawOf(0, -1), -0.5); await W(300);
    RR.debug.look(btn.x, 1.3, btn.z); await W(250);
    ev(`aim at dispatch: owner=${RR.grab.aim?.owner?.label ?? RR.grab.aim?.owner?.kind} dist=${RR.grab.aim?.distance?.toFixed?.(2)}`);
    L.shotReq.push('ship/02-aim-dispatch.png');
    RR.debug.key('KeyE', true); await W(90); RR.debug.key('KeyE', false); await W(200);
    ev(`dispatch pressed: requested=${tout.dispatchRequested} truck=${tout.state}`);
    const t4 = performance.now();
    while (tout.state !== 'away' && performance.now() - t4 < 40000) await W(300);
    await W(600);
    ev(`dispatched: money ${m0} -> ${RR.economy.money} (truck ${tout.state}) log=${JSON.stringify(RR.economy.log.slice(-2))}`);
    L.shotReq.push('ship/03-dispatched.png');
  } catch (e) { ev(`ERROR ${e.message} ${(e.stack || '').split('\n').slice(0, 3).join(' | ')}`); }
  L.done = true;
})();
