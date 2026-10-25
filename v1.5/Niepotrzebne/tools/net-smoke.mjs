// Rug Rush net smoke test: host a room, list it from a second browser, join, and compare basic world state.
import { launch, flush, sleep, waitFor, shot, installEventLog, guard, closeAll } from './netkit.mjs';

guard(200000);
console.log('[T] launching host');
const host = await launch('host');
await installEventLog(host);
const room = await host.ev(async () => window.RR.net.host({ name: 'Smoke test warehouse', look: { name: 'Hosty', suit: '#d0462f' } }));
console.log('[T] hosted', JSON.stringify(room));
flush(host);
const cl = await launch('c1', { w: 800, h: 450 });
await installEventLog(cl);
const listed = await cl.ev(async (id) => new Promise((resolve) => {
  const off = window.RR.net.listRooms((rooms) => {
    const r = rooms.find((x) => x.id === id);
    if (r) { off(); resolve({ count: rooms.length, room: r }); }
  });
  setTimeout(() => resolve(null), 20000);
}), room.roomId);
console.log('[T] list', JSON.stringify(listed));
const t0 = Date.now();
const joined = await cl.ev(async (id) => {
  try { return await window.RR.net.join(id, { look: { name: 'Clienta', suit: '#2f9a57' } }); } catch (e) { return { error: e.message }; }
}, room.roomId);
console.log('[T] joined', JSON.stringify(joined), `${Date.now() - t0} ms`);
await sleep(3000);
flush(host); flush(cl);
const hs = await host.ev(() => ({ report: window.RR.net.report(), ents: window.RR.entities.map.size, money: window.RR.economy.money, carpets: window.RR.carpets.list.length, peers: window.RR.net.peers }));
const cs = await cl.ev(() => ({ report: window.RR.net.report(), ents: window.RR.entities.map.size, money: window.RR.economy.money, carpets: window.RR.carpets.list.length, peers: window.RR.net.peers, trucks: window.RR.trucks.map((t) => `${t.state}@${t.pos.x.toFixed(1)},${t.pos.z.toFixed(1)}`) }));
console.log('[T] host', JSON.stringify(hs));
console.log('[T] client', JSON.stringify(cs));
await host.ev(() => window.RR.debug.teleport(2, 4, 0, 0));
await cl.ev(() => { window.RR.debug.teleport(2, 0, 0, 0); window.RR.debug.look(2, 1.2, 4); });
await sleep(1500);
await shot(cl, '01-smoke-client-sees-host.png');
await host.ev(() => window.RR.debug.look(2, 1.2, 0));
await sleep(800);
await shot(host, '01-smoke-host-sees-client.png');
flush(host); flush(cl);
await closeAll();
