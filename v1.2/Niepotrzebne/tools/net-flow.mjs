// Rug Rush menu-flow co-op test: host via RR.startHost, join via RR.joinRoom, compare shift clock, money, peers and avatars.
import { launch, flush, sleep, shot, guard, closeAll } from './netkit.mjs';

guard(180000);
const host = await launch('host', { query: '' });
await host.ev(() => window.RR.startHost('Flow test warehouse'));
const roomId = await host.ev(() => window.RR.net.roomId);
console.log('[T] host room', roomId, 'mode', await host.ev(() => window.RR.mode));
const cl = await launch('c1', { query: '', w: 900, h: 506 });
await cl.ev((id) => window.RR.joinRoom(id), roomId);
console.log('[T] client mode', await cl.ev(() => window.RR.mode));
await sleep(4000);
await host.ev(() => { window.RR.shift.t = 120; });
await sleep(3000);
const hs = await host.ev(() => ({ day: window.RR.shift.day, t: Math.round(window.RR.shift.t), money: window.RR.economy.money, peers: window.RR.net.peers.length }));
const cs = await cl.ev(() => ({ day: window.RR.shift.day, t: Math.round(window.RR.shift.t), money: window.RR.economy.money, peers: window.RR.net.peers.length, clock: document.querySelector('#hud .clock b')?.textContent }));
console.log('[T] host', JSON.stringify(hs), 'client', JSON.stringify(cs));
await cl.ev(() => { const p = window.RR.player; p.teleport(new p.camera.position.constructor(1, 0, 5), Math.PI); });
await host.ev(() => { window.RR.debug.teleport(1, 9, 0, -0.05); });
await sleep(1500);
await shot(host, 'flow-host-sees-client.png');
await host.ev(() => { window.RR.shift.t = 899.5; });
await sleep(3000);
const rep = await cl.ev(() => !!document.querySelector('.rr-screen h2')?.textContent?.includes('done'));
console.log('[T] client sees report', rep);
await shot(cl, 'flow-client-report.png');
flush(host);
flush(cl);
await closeAll();
