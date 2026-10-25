(async () => {
  const W = (ms) => new Promise((r) => setTimeout(r, ms));
  const L = { res: [] }; RR.report = () => L;
  const trial = async (match, x, z, yaw) => {
    RR.debug.teleport(x, z, yaw, -0.2); await W(300);
    const label = RR.debug.hold(match); await W(250);
    const it = RR.grab.held?.item;
    if (!it) { L.res.push({ match, err: 'not held' }); return; }
    RR.grab.throw();
    const track = [];
    for (let k = 0; k < 25; k++) { await W(80); const t = it.body.translation(); track.push([+t.x.toFixed(2), +t.y.toFixed(2), +t.z.toFixed(2)]); }
    const zs = track.map((q) => q[2]); const maxSpeed = 0;
    L.res.push({ match, label, start: [x, z], minZ: Math.min(...zs), maxZ: Math.max(...zs), final: track[track.length - 1], outsideHall: track[track.length - 1][2] < -15 || track[track.length - 1][2] > 15 });
    RR.items.indexOf(it) >= 0 && (it.body.setTranslation({ x: 0, y: 0.5, z: 5 }, true), RR.physics.teleportBinding(it.body));
  };
  await trial('lathera', 0, -6, 0);
  await trial('vacuum', 2, -6, 0);
  await trial('brushSoft', -2, -6, 0);
  await trial('lathera', 0, -10, 0);
  log = null;
  L.done = true;
})();
