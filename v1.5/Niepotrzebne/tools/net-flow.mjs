// Rug Rush menu-flow co-op test: host via RR.startHost, join via RR.joinRoom, compare money, peers, rugs and what Rug Buddy's snapshot sees on each side.
import { launch, flush, sleep, shot, guard, closeAll } from './netkit.mjs';

guard(180000);
const host = await launch('host', { query: '' });
await host.ev(() => window.RR.startHost('Flow test warehouse'));
const roomId = await host.ev(() => window.RR.net.roomId);
console.log('[T] host room', roomId, 'mode', await host.ev(() => window.RR.mode));
const cl = await launch('c1', { query: '', w: 900, h: 506 });
await cl.ev((id) => window.RR.joinRoom(id), roomId);
console.log('[T] client mode', await cl.ev(() => window.RR.mode));
await host.ev(() => { window.RR.debug.rugFlat('persian', 'M', 4, 2, 0, false); });
await sleep(6000);
const hs = await host.ev(() => ({ money: window.RR.economy.money, peers: window.RR.net.peers.length, rugs: window.RR.carpets.list.length, shift: !!window.RR.shift, clock: !!document.querySelector('#hud .clock') }));
const cs = await cl.ev(() => ({ money: window.RR.economy.money, peers: window.RR.net.peers.length, rugs: window.RR.carpets.list.length, shift: !!window.RR.shift, clock: !!document.querySelector('#hud .clock') }));
console.log('[T] host', JSON.stringify(hs), 'client', JSON.stringify(cs));
await cl.ev(() => { window.RR.briefing.prime(); });
await sleep(1500);
const snapC = await cl.ev(() => { const s = window.RR.briefing.snapshot(); return { others: s.otherPlayers, rugs: s.rugs.map((r) => [r.name, r.cleanPercent, r.where]) }; });
const snapH = await host.ev(() => { const s = window.RR.briefing.snapshot(); return { others: s.otherPlayers, rugs: s.rugs.map((r) => [r.name, r.cleanPercent, r.where]) }; });
console.log('[T] client snapshot', JSON.stringify(snapC));
console.log('[T] host snapshot', JSON.stringify(snapH));
const stain = await cl.ev(async () => {
  const RR = window.RR;
  const c = RR.carpets.list.find((x) => x.state === 'flat');
  if (!c) return 'no flat rug';
  const s = c.surface;
  let best = null;
  for (let i = 0; i < s.N; i++) { const v = s.data.dirt1[i * 4 + 1]; if (v > 80 && (!best || v > best.v)) best = { i, v }; }
  if (!best) return 'no stain';
  const p = c.uvToWorld(((best.i % s.W) + 0.5) / s.W, (Math.floor(best.i / s.W) + 0.5) / s.H).point;
  RR.debug.teleport(p.x + 0.8, p.z + 0.8, 0, 0);
  await new Promise((r) => setTimeout(r, 100));
  RR.debug.look(p.x, p.y, p.z);
  await new Promise((r) => setTimeout(r, 800));
  return RR.stainHover?.name ?? 'none';
});
console.log('[T] client stain hover', stain);
await shot(cl, 'flow-client-stain.png');
flush(host);
flush(cl);
await closeAll();
