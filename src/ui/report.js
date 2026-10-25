// Rug Rush end-of-shift report: stamped grades for every rug, money, fun stats and the next-shift button in friendslop style.
import { installTheme, el, button } from './theme.js';

const GRADE_COLORS = { 'A+': '#52c46b', A: '#52c46b', B: '#3bceac', C: '#ffd23f', D: '#ff8c42', E: '#ff5d8f', F: '#ef3e36' };

export function showReport(game, day, s, { canContinue = true, onNext }) {
  installTheme();
  const sfx = (n, v) => game.audio?.ui?.(n, v);
  const money = (v) => `${v < 0 ? '−' : ''}$${Math.abs(Math.round(v)).toLocaleString('en-US')}`;
  const scr = el('div', { class: 'rr-screen dim rr-ui' });
  const rows = el('div', { class: 'rr-col', style: 'gap:8px;margin:10px 0 4px' });
  const all = [...s.shipped.map((r) => ({ ...r, kind: 'Shipped' })), ...(s.unfinished ?? []).map((r) => ({ ...r, kind: r.price < 0 ? 'Ruined, you pay' : 'Not finished, no pay' }))];
  if (!all.length) rows.append(el('div', { class: 'rr-card', style: 'justify-content:center' }, 'No rugs went out today. The trucks are judging you.'));
  all.forEach((r, i) => {
    const stamp = el('div', { style: `font-family:var(--display);font-size:${r.grade.length > 2 ? 15 : 30}px;width:62px;height:52px;display:flex;align-items:center;justify-content:center;border:3px solid ${GRADE_COLORS[r.grade] ?? 'var(--ink)'};color:${GRADE_COLORS[r.grade] ?? 'var(--ink)'};border-radius:12px;transform:rotate(${(i % 2 ? 1 : -1) * 8}deg) scale(2.4);opacity:0;transition:transform .28s cubic-bezier(.2,1.8,.4,1),opacity .2s;background:#fff;flex:none` }, r.grade);
    rows.append(el('div', { class: 'rr-card' },
      stamp,
      el('div', { style: 'flex:1;min-width:0' },
        el('div', { style: 'font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis' }, r.name),
        el('div', { class: 'rr-muted', style: 'font-size:14px' }, `${r.client} · ${r.kind}`)),
      el('div', { style: `font-family:var(--display);font-size:22px;color:${r.price < 0 ? 'var(--red)' : 'var(--ink)'}` }, money(r.price))));
    setTimeout(() => {
      stamp.style.opacity = '1';
      stamp.style.transform = `rotate(${(i % 2 ? 1 : -1) * 8}deg) scale(1)`;
      sfx('ui_stamp', 0.8);
    }, 650 + i * 380);
  });
  const fact = (icon, text) => el('div', { class: 'rr-sticker', style: `font-size:15px;transform:rotate(${(Math.random() - 0.5) * 4}deg)` }, `${icon} ${text}`);
  const facts = el('div', { class: 'rr-row', style: 'gap:10px;margin-top:12px' },
    fact('\u{1F4B0}', `Earned ${money(s.earned)}`),
    fact('\u{1F6D2}', `Spent ${money(s.spent)}`),
    fact('\u{1F300}', `${s.unrolls} rug${s.unrolls === 1 ? '' : 's'} unrolled by accident`),
    fact('\u{1F915}', `${s.trips} faceplant${s.trips === 1 ? '' : 's'}`),
    fact('\u{1F4A7}', `${Math.round(s.water)} L of water`),
    fact('\u{1F9F4}', `${(s.productL ?? 0).toFixed(1)} L of liquids`),
    fact('\u{1F9C2}', `${(s.productKg ?? 0).toFixed(2)} kg of powder`),
  );
  const net = s.earned - s.spent;
  const next = canContinue ? button('Next shift', { cls: 'green big', sfx, onClick: () => { scr.remove(); onNext?.(); } }) : el('div', { class: 'rr-sticker' }, 'Waiting for the host…');
  scr.append(el('div', { class: 'rr-panel', style: 'width:min(680px,95vw)' },
    el('h2', {}, `Day ${day} done!`),
    el('div', { style: 'display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:10px' },
      el('div', { style: 'font-weight:600;font-size:18px' }, `${all.length} rug${all.length === 1 ? '' : 's'} handled`),
      el('div', { style: `font-family:var(--display);font-size:34px;color:${net < 0 ? 'var(--red)' : 'var(--green)'};-webkit-text-stroke:1.5px var(--ink);paint-order:stroke fill` }, `${net >= 0 ? '+' : ''}${money(net)}`)),
    rows,
    facts,
    el('div', { class: 'rr-row', style: 'justify-content:flex-end;margin-top:20px' }, next),
  ));
  document.body.append(scr);
  sfx('ui_shift_end', 0.9);
  return scr;
}
