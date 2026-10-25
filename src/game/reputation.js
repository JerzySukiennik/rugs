// Rug Rush reputation: every shipped rug earns a client review; the star rating pays tips and decides which rugs the trucks bring next.
import { installTheme, el } from '../ui/theme.js';
import { CARPET_TYPES } from '../data/carpetTypes.js';

const STARS_OF = { 'A+': 5, A: 5, B: 4, C: 3, D: 2, E: 1, F: 1 };
const LINES = {
  5: ['Like new. Better than new, honestly.', 'My grandmother cried. Good tears.', 'It smells like a meadow and looks like a catalogue.', 'Five stars. I would give six.', 'The dog refuses to walk on it now. Too nice.'],
  4: ['Really clean. One corner is a bit sad.', 'Great job, and fast too.', 'Looks fresh. The cat approves.', 'Almost perfect. Almost.'],
  3: ['It is cleaner. Mostly.', 'Fine. Not amazing, fine.', 'I can still see where the coffee was.', 'Okay. My expectations were low.'],
  2: ['Did anyone actually wash this?', 'Still sticky. Disappointed.', 'The stain moved. It did not leave.', 'Smells like a wet dog. We do not have a dog.'],
  1: ['You RUINED it.', 'The colours ran away from home.', 'I want my rug back. The old one.', 'My lawyer will call you. He also hates the rug now.'],
};
const TIERS = [
  { rep: 0, n: 0, pool: ['cut', 'loop'] },
  { rep: 2.8, n: 2, pool: ['cut', 'loop', 'shag'], msg: 'Word is spreading: shag rugs incoming!' },
  { rep: 3.4, n: 4, pool: ['cut', 'loop', 'shag', 'persian', 'kilim'], msg: 'Fancy clients now trust you: Persian and kilim rugs incoming!' },
  { rep: 4.1, n: 7, pool: ['cut', 'loop', 'shag', 'persian', 'kilim', 'sisal', 'silk', 'persian'], msg: 'Top reputation: silk and sisal rugs incoming. Careful!' },
];

const CSS = `
#rr-rep{position:fixed;right:18px;top:66px;z-index:3;padding:3px 10px;border:3px solid #1b1b1e;border-radius:12px;background:#fffaf0;box-shadow:3px 4px 0 #1b1b1e;font:600 13px var(--font);color:#1b1b1e;transform:rotate(1.5deg);pointer-events:none;display:none;white-space:nowrap}
#rr-rep b{font-size:16px;letter-spacing:1px;color:#ffb703;-webkit-text-stroke:.6px #1b1b1e}
#rr-reviews{position:fixed;right:18px;top:108px;z-index:14;display:flex;flex-direction:column;gap:10px;align-items:flex-end;pointer-events:none}
#rr-reviews .rv{width:300px;padding:10px 13px;border:3px solid #1b1b1e;border-radius:16px;background:#fffaf0;box-shadow:6px 6px 0 rgba(27,27,30,.35);font:600 13px/1.35 var(--font);color:#1b1b1e;animation:rr-rv-in .45s cubic-bezier(.2,1.6,.4,1);transition:opacity .4s,transform .4s}
#rr-reviews .rv.out{opacity:0;transform:translateX(40px)}
#rr-reviews .st{font-size:21px;letter-spacing:2px;color:#ffb703;-webkit-text-stroke:.8px #1b1b1e;line-height:1}
#rr-reviews .who{font-size:12px;opacity:.7;margin-top:3px}
#rr-reviews .q{font-size:14px;margin-top:3px}
#rr-reviews .tip{display:inline-block;margin-top:6px;padding:1px 8px;border:2px solid #1b1b1e;border-radius:8px;background:#52c46b;color:#fff;font-size:12.5px}
#rr-reviews .tip.neg{background:#ef3e36}
@keyframes rr-rv-in{from{transform:translateX(60px) rotate(4deg);opacity:0}}
`;

function stars(n) {
  const full = Math.round(n);
  return '★'.repeat(full) + '☆'.repeat(5 - full);
}

export class Reputation {
  constructor(game) {
    installTheme();
    this.game = game;
    this.order = 987;
    this.reviews = [];
    this.tier = 0;
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.append(st);
    this.badge = el('div', { id: 'rr-rep', class: 'rr-ui' });
    this.stack = el('div', { id: 'rr-reviews', class: 'rr-ui' });
    document.body.append(this.badge, this.stack);
    this.key = '';
    this.wire();
  }

  get rep() {
    return this.game.stats.rep ?? 3;
  }

  reset() {
    this.reviews.length = 0;
    this.tier = 0;
    this.game.stats.rep = 3;
    this.game.stats.reviews = 0;
  }

  wire() {
    const g = this.game;
    const prev = g.onTruckDispatched;
    g.onTruckDispatched = (truck, inside) => {
      prev?.(truck, inside);
      if (g.net?.isClient) return;
      let i = 0;
      for (const c of inside) if (c.wrapped && c.finalPrice !== undefined) setTimeout(() => this.review(c), 900 + i++ * 1300);
    };
    g.makeJobs = (trip) => {
      const t = TIERS[this.tier];
      const n = trip === 0 ? 2 : 1 + Math.floor(g.rnd() * (this.rep >= 4 ? 3 : 2.4));
      const jobs = [];
      for (let k = 0; k < n; k++) {
        const type = t.pool[Math.floor(g.rnd() * t.pool.length)];
        const sizes = CARPET_TYPES[type].sizes;
        jobs.push({ type, size: sizes[Math.floor(g.rnd() * sizes.length)] });
      }
      return jobs;
    };
  }

  review(c) {
    const g = this.game;
    const ev = c.finalEval ?? {};
    const grade = ev.ruined ? 'F' : ev.grade ?? 'C';
    const s = STARS_OF[grade] ?? 3;
    const lines = LINES[s];
    const price = Math.max(0, c.finalPrice ?? 0);
    const repK = (this.rep - 3) * 0.08;
    const tipK = grade === 'A+' ? 0.25 : grade === 'A' ? 0.12 : s === 4 ? 0.05 : 0;
    const k = s >= 4 ? tipK + Math.max(0, repK) : s <= 2 ? -0.1 + Math.min(0, repK) : 0;
    const tip = Math.round(price * k) || (s <= 2 ? -5 : 0);
    const r = { stars: s, grade, client: c.job?.client ?? 'A client', rug: c.displayName?.() ?? 'rug', quote: lines[Math.floor(g.rnd() * lines.length)], tip };
    this.reviews.push(s);
    if (this.reviews.length > 8) this.reviews.shift();
    const sum = this.reviews.reduce((a, b) => a + b, 0);
    g.stats.rep = Math.round(((3 * 2 + sum) / (2 + this.reviews.length)) * 10) / 10;
    g.stats.reviews = (g.stats.reviews ?? 0) + 1;
    if (tip) {
      g.economy.money += tip;
      g.economy.log.push({ t: g.economy.time, amount: tip, reason: tip > 0 ? `Tip from ${r.client}` : `Unhappy ${r.client}` });
    }
    (g.reviewLog ??= []).push(r);
    if (g.reviewLog.length > 10) g.reviewLog.shift();
    this.show(r);
    if (g.net?.isHost) g.net.session?.broadcast?.({ t: 'review', r, rep: g.stats.rep, reviews: g.stats.reviews });
    this.checkTier();
  }

  checkTier() {
    const g = this.game;
    const n = g.stats.reviews ?? 0;
    let t = 0;
    TIERS.forEach((x, i) => { if (this.rep >= x.rep && n >= x.n) t = i; });
    if (t > this.tier) {
      this.tier = t;
      g.hud?.toast(TIERS[t].msg);
      g.audio?.ui('ui_success', 0.7);
    } else if (t < this.tier) this.tier = t;
  }

  show(r) {
    const g = this.game;
    const card = el('div', { class: 'rv' },
      el('div', { class: 'st' }, stars(r.stars)),
      el('div', { class: 'q' }, `“${r.quote}”`),
      el('div', { class: 'who' }, `${r.client} · ${r.rug} · ${r.grade}`));
    if (r.tip) card.append(el('div', { class: `tip${r.tip < 0 ? ' neg' : ''}` }, r.tip > 0 ? `+$${r.tip} tip` : `−$${-r.tip} unhappy client`));
    this.stack.prepend(card);
    while (this.stack.children.length > 3) this.stack.lastChild.remove();
    g.audio?.ui('ui_stamp', 0.7);
    if (r.stars === 5) setTimeout(() => g.audio?.ui('ui_coin', 0.6), 220);
    setTimeout(() => card.classList.add('out'), 6500);
    setTimeout(() => card.remove(), 7000);
  }

  update() {
    const g = this.game;
    const show = g.mode && g.mode !== 'menu' && !g.uiHidden && !g.assistant?.isOpen;
    this.badge.style.display = show ? 'block' : 'none';
    this.stack.style.display = g.uiHidden ? 'none' : 'flex';
    if (!show) return;
    const n = g.stats.reviews ?? 0;
    const key = `${this.rep}|${n}`;
    if (key === this.key) return;
    this.key = key;
    this.badge.innerHTML = n ? `<b>${stars(this.rep)}</b> ${this.rep.toFixed(1)}` : '<b>☆☆☆☆☆</b> New business';
  }
}
