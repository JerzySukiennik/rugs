// Co-op pour check: client pours shampoo onto a rug that lives on the host; compare fills and rug chemistry on both sides.
import { open, sleep, guard } from './h.mjs';
guard(150000);
const host = await open('host', { query: '', w: 1280, h: 720 });
await host.ev(() => window.RR.startHost('Pour check'));
const roomId = await host.ev(() => RR.net.roomId);
const cl = await open('client', { query: '', w: 1280, h: 720 });
await host.ev(() => { RR.shift.t = 120; RR.debug.rugFlat("cut", "M", 0, -3.5, 0, true); });
await sleep(1500);
await cl.ev((id) => window.RR.joinRoom(id), roomId);
await sleep(6000);
console.log('modes', await host.ev(() => RR.mode), await cl.ev(() => RR.mode));
await host.ev(() => { RR.shift.t = 120; });
await sleep(1200);
const hostFill = () => host.ev(() => RR.items.filter((i) => i.productId === 'lathera').map((i) => +i.fill.toFixed(3)));
const hostRug = () => host.ev(() => { const c = RR.carpets.list[RR.carpets.list.length - 1]; const st = RR.chem.state(c); let s = 0, g = 0; for (let i = 0; i < st.N; i++) { s += st.f.surf[i]; g += st.f.gel[i]; } return { surf: +(s / st.N).toFixed(4), gel: +(g / st.N).toFixed(4) }; });
console.log('before host fills', JSON.stringify(await hostFill()), 'rug', JSON.stringify(await hostRug()));
// client: pick up a lathera and pour onto the rug centre (client coordinates are the same world)
await cl.ev(() => { RR.debug.teleport(0, -1.1, 0, -0.9); });
await sleep(800);
const cFill0 = await cl.ev(() => RR.items.filter((i) => i.productId === 'lathera').map((i) => +i.fill.toFixed(3)));
await cl.ev(() => { RR.debug.hold('lathera'); }); await sleep(600);
await cl.ev(() => { RR.debug.look(0, 0.05, -3.5); RR.debug.lmb(true); }); await sleep(4000); await cl.ev(() => RR.debug.lmb(false)); await sleep(1500);
console.log('client lathera fill before', JSON.stringify(cFill0), 'after', JSON.stringify(await cl.ev(() => RR.grab.heldItem?.()?.fill?.toFixed?.(3) ?? RR.items.filter((i) => i.productId === 'lathera').map((i) => +i.fill.toFixed(3)))));
console.log('after host fills', JSON.stringify(await hostFill()), 'rug', JSON.stringify(await hostRug()));
console.log('client held', await cl.ev(() => RR.grab.heldItem?.()?.label ?? null), 'client aim', await cl.ev(() => RR.grab.aim?.owner?.kind ?? null));
await host.shot('coop/09-host-pour-check.png'); await cl.shot('coop/10-client-pour-check.png');
host.flush(); cl.flush(); await host.close(); await cl.close();
console.log('done');
