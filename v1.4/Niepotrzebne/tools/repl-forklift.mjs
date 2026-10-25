// Rug Rush REPL command: client enters, drives and leaves a forklift (run with repl.sh < this file).
export default async ({ host, c1, sleep, shot }) => {
  const fid = await host.ev(() => window.RR.spawnForklift({ x: 12, z: 0 }).id);
  await sleep(1500);
  const f0 = await c1.ev((id) => { const f = window.RR.entities.get(id); return f ? { x: f.pos.x, z: f.pos.z, yaw: f.yaw } : null; }, fid);
  await c1.ev(([x, z]) => window.RR.debug.teleport(x, z), [f0.x - 1.8, f0.z + 0.3]);
  await sleep(200);
  await c1.ev(([x, z]) => window.RR.debug.look(x, 0.8, z), [f0.x, f0.z + 0.2]);
  await sleep(200);
  const aim = await c1.ev(() => window.RR.grab.aim?.owner?.kind ?? null);
  await c1.ev(() => window.RR.debug.key('KeyE', true)); await sleep(80); await c1.ev(() => window.RR.debug.key('KeyE', false));
  await sleep(800);
  const inside = { host: await host.ev((id) => !!window.RR.entities.get(id).driver, fid), c1: await c1.ev(() => window.RR.player.inVehicle?.kind ?? null) };
  await c1.ev(() => window.RR.debug.key('KeyW', true));
  await sleep(1800);
  await c1.ev(() => window.RR.debug.key('KeyW', false));
  await sleep(600);
  await shot(c1, '14-c1-driving-forklift.png');
  const moved = { host: await host.ev((id) => { const f = window.RR.entities.get(id); return [+f.pos.x.toFixed(2), +f.pos.z.toFixed(2)]; }, fid), c1: await c1.ev((id) => { const f = window.RR.entities.get(id); return [+f.pos.x.toFixed(2), +f.pos.z.toFixed(2), +window.RR.player.p1.x.toFixed(2), +window.RR.player.p1.z.toFixed(2)]; }, fid) };
  await host.ev(([x, z]) => window.RR.debug.teleport(x, z), [moved.host[0] + 4, moved.host[1] + 3]);
  await sleep(200);
  await host.ev(([x, z]) => window.RR.debug.look(x, 1.2, z), [moved.host[0], moved.host[1]]);
  await sleep(400);
  await shot(host, '14-host-sees-c1-on-forklift.png');
  await c1.ev(() => window.RR.debug.key('KeyE', true)); await sleep(80); await c1.ev(() => window.RR.debug.key('KeyE', false));
  await sleep(1000);
  const out = { host: await host.ev((id) => !!window.RR.entities.get(id).driver, fid), c1: await c1.ev(() => ({ veh: window.RR.player.inVehicle?.kind ?? null, frozen: window.RR.player.frozen, p: [+window.RR.player.p1.x.toFixed(2), +window.RR.player.p1.z.toFixed(2)] })) };
  return { fid, f0, aim, inside, moved, out };
};
