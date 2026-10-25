import { open, sleep, guard } from './h.mjs';
guard(200000);
const p = await open('ui2', { query: '', w: 1280, h: 720 });
const pg = p.page;
await sleep(600);
await pg.getByRole('button', { name: /play solo/i }).click(); await sleep(1200);
await p.ev(() => { RR.shift.t = 899.6; }); await sleep(3000);
await pg.getByRole('button', { name: /next shift/i }).click(); await sleep(800);
await p.ev(() => RR.input.onLockChange(false)); await sleep(700);
const info = await p.ev(() => {
  const b = [...document.querySelectorAll('button')].find((x) => /save/i.test(x.textContent));
  if (!b) return 'no button';
  const r = b.getBoundingClientRect();
  const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
  const chain = []; let e = hit; for (let i = 0; i < 4 && e; i++) { chain.push(`${e.tagName}.${(e.className && e.className.baseVal === undefined ? e.className : '')}#${e.id}`); e = e.parentElement; }
  return { rect: [r.x, r.y, r.width, r.height].map((v) => Math.round(v)), hit: chain, screens: document.querySelectorAll('.rr-screen').length, panels: document.querySelectorAll('.rr-panel').length, shopOpen: RR.shop?.isOpen, reportEl: !!document.querySelector('.rr-screen.dim') };
});
console.log(JSON.stringify(info));
await pg.getByRole('button', { name: /save/i }).click({ timeout: 4000 }).then(() => console.log('playwright click ok')).catch((e) => console.log('playwright click failed:', e.message.split('\n')[0]));
await sleep(800);
console.log('title visible:', await p.ev(() => !!document.querySelector('.rr-tag')));
p.flush(); await p.close();
