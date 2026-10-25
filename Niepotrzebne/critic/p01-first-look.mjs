// Play 1: first-time player path through the real menu (clicks), then solo start, first truck arrival, screenshots.
import { open, sleep, guard } from './h.mjs';
guard(240000);
const p = await open('solo', { query: '', w: 1280, h: 720 });
await sleep(1500);
await p.shot('play/01-menu.png');
await p.page.getByRole('button', { name: /play solo/i }).click();
const t0 = Date.now();
await p.page.waitForTimeout(800);
await p.shot('play/02-just-started.png');
for (let i = 0; i < 40; i++) {
  await sleep(1000);
  const st = await p.ev(() => ({ trucks: RR.trucks.map((t) => `${t.role}:${t.state}`), items: RR.items.length, carpets: RR.carpets?.list?.length, toast: document.querySelector('.rr-toast, #toast')?.textContent ?? null, mode: RR.mode }));
  if (i % 4 === 0) console.log(`[t+${((Date.now() - t0) / 1000).toFixed(0)}s]`, JSON.stringify(st));
  if (st.carpets > 0) break;
}
await p.shot('play/03-truck-arrived.png');
p.flush();
await p.close();
