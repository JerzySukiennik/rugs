// UI critic: settings, creator, shift clock, report, pause, save and reload, through real clicks where possible.
import { open, sleep, guard, OUT } from './h.mjs';
guard(300000);
const p = await open('ui', { query: '', w: 1280, h: 720 });
const pg = p.page;
const note = (s) => console.log('[ui]', s);
await sleep(800);
await pg.getByRole('button', { name: /settings/i }).click(); await sleep(500); await p.shot('ui/01-settings.png');
await pg.getByRole('button', { name: /^done$/i }).click(); await sleep(400);
await pg.getByRole('button', { name: /dusty|worker/i }).click(); await sleep(700); await p.shot('ui/02-creator.png');
await pg.getByRole('button', { name: /^done$/i }).click(); await sleep(400);
await pg.getByRole('button', { name: /play solo/i }).click(); await sleep(1500);
await p.ev(() => { RR.shift.t = 800; }); await sleep(1500); await p.shot('ui/03-hud-clock-day1.png');
await p.ev(() => { RR.shift.t = 890; }); await sleep(2500); await p.shot('ui/04-hud-late.png');
await p.ev(() => { RR.shift.t = 899.6; }); await sleep(3000);
note('report visible: ' + (await pg.locator('.rr-panel h2').filter({ hasText: /Day 1 done/ }).count()));
await p.shot('ui/05-report.png');
const nxt = pg.getByRole('button', { name: /next shift/i });
if (await nxt.count()) { await nxt.click(); await sleep(800); }
note('day after next: ' + (await p.ev(() => RR.shift.day)));
// pause via the same path as pointer-lock loss
await p.ev(() => RR.input.onLockChange(false)); await sleep(700); await p.shot('ui/06-pause.png');
await pg.getByRole('button', { name: /save (&|and) quit|leave/i }).click(); await sleep(1200);
const saved = await p.ev(() => localStorage.getItem('rugrush.save.v1'));
note('save stored: ' + (saved ? saved.slice(0, 160) : 'NONE'));
await p.shot('ui/07-title-after-save.png');
// reload: does the title show the save sticker and does Play restore money/day?
await pg.reload({ waitUntil: 'load' }); await pg.waitForFunction(() => window.RR?.ready, null, { timeout: 90000 }); await sleep(1200);
await p.shot('ui/08-title-after-reload.png');
await pg.getByRole('button', { name: /play solo/i }).click(); await sleep(1500);
note('after restore: day ' + (await p.ev(() => RR.shift.day)) + ' money ' + (await p.ev(() => RR.economy.money)) + ' items ' + (await p.ev(() => RR.items.length)));
await p.shot('ui/09-restored-day.png');
note('console errors: ' + p.logs.filter((l) => /error|PAGEERROR/i.test(l)).slice(0, 5).join(' || '));
p.flush();
await p.close();
