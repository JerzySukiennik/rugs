// Co-op critic test: host and client through the real menus, then client sprays a rug that lives on the host.
import { open, sleep, guard, OUT } from './h.mjs';
guard(420000);
const log = (...a) => console.log(`[${((Date.now() - T0) / 1000).toFixed(0)}s]`, ...a);
const T0 = Date.now();
const host = await open('host', { query: '', w: 1280, h: 720 });
await host.page.waitForTimeout(1200);
await host.shot('coop/01-host-menu.png');
await host.page.getByRole('button', { name: /host co-op/i }).click();
await host.page.waitForTimeout(500);
await host.shot('coop/02-host-dialog.png');
await host.page.getByRole('button', { name: /open warehouse/i }).click();
let roomId = null;
for (let i = 0; i < 60 && !roomId; i++) { await sleep(500); roomId = await host.ev(() => RR.net?.roomId ?? null); }
log('host room', roomId, 'mode', await host.ev(() => RR.mode));
await sleep(1500);
await host.shot('coop/03-host-in-warehouse.png');

const cl = await open('client', { query: '', w: 1280, h: 720 });
await cl.page.waitForTimeout(800);
await cl.page.getByRole('button', { name: /join co-op/i }).click();
let card = null;
for (let i = 0; i < 40 && !card; i++) {
  await sleep(500);
  card = await cl.page.locator('.rr-card').filter({ hasText: /warehouse|Host:/ }).first().count().catch(() => 0);
  if (card) break;
}
await cl.shot('coop/04-client-list.png');
const join = cl.page.locator('.rr-card').filter({ hasText: /Host:/ }).getByRole('button', { name: /^join$/i }).first();
if (await join.count()) await join.click(); else log('no join button found');
const t1 = Date.now();
while (Date.now() - t1 < 40000) { const m = await cl.ev(() => RR.mode); if (m === 'client') break; await sleep(500); }
await sleep(3000);
log('client mode', await cl.ev(() => RR.mode), 'peers host', JSON.stringify(await host.ev(() => RR.net.peers.map((p) => p.name))));
await cl.shot('coop/05-client-joined.png');
await host.shot('coop/06-host-sees-client.png');
// client sprays a fresh dirty rug that lives on the host
const rugId = await host.ev(() => { const c = RR.debug.rugFlat('cut', 'M', 0, -3.5, 0, true); return c.id; });
await sleep(1500);
const before = await host.ev((id) => { const c = RR.carpets.list.find((k) => k.id === id); const st = RR.chem.state(c); return { water: st.f.surf.reduce((a, b) => a + b, 0) }; }, rugId);
await cl.ev(() => { const p = RR.player; RR.debug.teleport(0, -1.1, 0, -0.9); });
await sleep(800);
await cl.ev(() => { RR.debug.hold('lathera'); });
await sleep(800);
await cl.ev(() => { RR.debug.look(0, 0, -3.5); RR.debug.lmb(true); });
await sleep(4000);
await cl.ev(() => { RR.debug.lmb(false); });
await sleep(1500);
const after = await host.ev((id) => { const c = RR.carpets.list.find((k) => k.id === id); const st = RR.chem.state(c); return { surf: st.f.surf.reduce((a, b) => a + b, 0), gel: st.f.gel.reduce((a, b) => a + b, 0) }; }, rugId);
log('host rug soap before', before.water.toFixed(2), 'after client spray', JSON.stringify(after));
log('client held', await cl.ev(() => RR.grab.heldItem?.()?.label ?? null));
await host.shot('coop/07-host-after-client-spray.png');
await cl.shot('coop/08-client-spraying.png');
// report
log('host net', JSON.stringify(await host.ev(() => RR.net.report?.() ?? null)).slice(0, 400));
log('client net', JSON.stringify(await cl.ev(() => RR.net.report?.() ?? null)).slice(0, 400));
// client leaves; host should see peer-leave
await cl.ev(() => RR.leaveToMenu ? RR.leaveToMenu() : null).catch(() => {});
await sleep(3000);
log('host peers after leave', JSON.stringify(await host.ev(() => RR.net.peers.length)));
host.flush(); cl.flush();
await host.close(); await cl.close();
log('done');
