// Rug Rush rug card: a corner sticker for the rug you are working on, with clean percent, stains cleared per kind, wetness and damage.
import { installTheme, el } from './theme.js';
import { stainDef } from '../game/progress.js';

const CSS = `
#rr-card{position:fixed;left:18px;bottom:58px;z-index:3;width:292px;padding:10px 12px 11px;border:3px solid #1b1b1e;border-radius:16px;background:#fffaf0;box-shadow:5px 5px 0 rgba(27,27,30,.35);font:600 12.5px/1.3 var(--font);color:#1b1b1e;pointer-events:none;transform:rotate(-.8deg);transition:opacity .25s,transform .25s;opacity:0}
#rr-card.on{opacity:1}
#rr-card .top{display:flex;align-items:baseline;gap:8px}
#rr-card .nm{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:700;font-size:13.5px}
#rr-card .pct{font-family:var(--display);font-size:26px;line-height:1}
#rr-card .bar{height:12px;margin:6px 0 5px;border:2.5px solid #1b1b1e;border-radius:8px;background:#e9e1cf;overflow:hidden}
#rr-card .bar i{display:block;height:100%;background:linear-gradient(90deg,#3bceac,#52c46b);transition:width .35s cubic-bezier(.2,1.2,.4,1)}
#rr-card .bar.gold i{background:linear-gradient(90deg,#ffd23f,#ffb703)}
#rr-card .meta{font-size:12px;opacity:.8}
#rr-card .meta .bad{color:#ef3e36;opacity:1}
#rr-card .chips{display:flex;flex-wrap:wrap;gap:5px;margin-top:7px}
#rr-card .chip{position:relative;overflow:hidden;padding:2px 8px;border:2px solid #1b1b1e;border-radius:9px;background:#fff;font-size:11.5px}
#rr-card .chip i{position:absolute;left:0;top:0;bottom:0;background:rgba(59,206,172,.35);z-index:0}
#rr-card .chip span{position:relative;z-index:1}
#rr-card .chip.done{background:#52c46b;color:#fff}
#rr-card .ready{margin-top:7px;display:inline-block;padding:2px 9px;border:2px solid #1b1b1e;border-radius:9px;background:#ffd23f;font-size:12px}
`;

export class RugCard {
  constructor(game) {
    installTheme();
    this.game = game;
    this.order = 989;
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.append(st);
    this.el = el('div', { id: 'rr-card', class: 'rr-ui' });
    document.body.append(this.el);
    this.rug = null;
    this.seen = 0;
    this.acc = 1;
    this.key = '';
    this.ev = null;
    this.evAt = 0;
    this.stuck = new Map();
  }

  watch(c, clean, dt) {
    const g = this.game;
    const now = performance.now();
    let s = this.stuck.get(c);
    if (!s) this.stuck.set(c, (s = { best: clean, at: now, work: 0, told: 0 }));
    if (clean > s.best + 1) {
      s.best = clean;
      s.at = now;
      s.work = 0;
    }
    if (g.grab?.heldItem?.()?.using) s.work += dt;
    if (now - s.at > 75000 && s.work > 20 && now - s.told > 180000 && clean < 95) {
      s.told = now;
      g.hud?.toast('Stuck on this rug? Press T: Rug Buddy can see it and will tell you what to try.');
      g.assistant?.nudge?.();
    }
  }

  pick() {
    const g = this.game;
    const aim = g.grab?.aim;
    let c = aim?.owner?.kind === 'carpet' ? aim.owner : null;
    const it = g.grab?.heldItem?.();
    if (!c && it?.prevUv?.c) c = it.prevUv.c;
    if (!c && g.grab?.held?.kind === 'cloth') c = g.grab.held.carpet;
    return c && c.state !== 'rolled' && !c.wrapped ? c : null;
  }

  update(dt) {
    const g = this.game;
    const now = performance.now();
    const c = this.pick();
    if (c) {
      this.rug = c;
      this.seen = now;
    }
    const list = g.carpets?.list ?? [];
    if (this.rug && (!list.includes(this.rug) || this.rug.wrapped || now - this.seen > 12000)) this.rug = null;
    const show = !!this.rug && g.mode !== 'menu' && !g.uiHidden && !g.assistant?.isOpen && !g.shop?.isOpen;
    this.el.classList.toggle('on', show);
    if (!show) return;
    this.acc += dt;
    if (this.acc < 0.25) return;
    this.acc = 0;
    this.render(this.rug);
  }

  render(c) {
    const g = this.game;
    const now = performance.now();
    if (!this.ev || this.ev.c !== c || now - this.evAt > 450) {
      this.ev = { c, v: g.chem?.evaluate(c) };
      this.evAt = now;
    }
    const v = this.ev.v;
    const pr = g.progress?.info(c);
    const clean = v ? Math.round(v.clean * 100) : null;
    if (clean !== null) this.watch(c, clean, 0.25);
    const kinds = new Map();
    for (const sp of pr?.spots ?? []) {
      if (sp.hidden && !sp.done) continue;
      const k = kinds.get(sp.kind) ?? { n: 0, done: 0, left: 0 };
      k.n++;
      if (sp.done) k.done++;
      else k.left += Math.min(1, sp.frac);
      kinds.set(sp.kind, k);
    }
    for (const ly of pr?.layers ?? []) kinds.set(ly.kind, { n: 1, done: ly.done ? 1 : 0, left: ly.done ? 0 : Math.min(1, ly.frac), layer: true });
    const spots = (pr?.spots ?? []).filter((x) => !x.hidden || x.done);
    const doneSpots = spots.filter((x) => x.done).length;
    const meta = [];
    if (spots.length) meta.push(`Stains ${doneSpots}/${spots.length}`);
    if (v) meta.push(v.wet > 0.02 ? `Wet ${Math.round(v.wet * 100)}%${v.dryEnough ? '' : ' (roll under 12%)'}` : 'Dry');
    if (v && (v.damage > 0.01 || v.damagePeak > 0.005)) meta.push(`<span class="bad">Damage ${Math.round(Math.max(v.damage, v.damagePeak) * 100)}%</span>`);
    if (v?.residue > 0.05) meta.push('Soap left');
    const chips = [...kinds.entries()].map(([k, x]) => {
      const done = x.done === x.n;
      const prog = done ? 100 : Math.round((1 - x.left / x.n) * 100);
      const label = `${stainDef(k)?.name ?? k}${x.n > 1 ? ` ${x.done}/${x.n}` : ''}${done ? ' ✓' : ''}`;
      return `<span class="chip${done ? ' done' : ''}">${done ? '' : `<i style="width:${Math.max(0, Math.min(100, prog))}%"></i>`}<span>${label}</span></span>`;
    }).join('');
    const ready = pr?.spotless ? (v?.dryEnough ? 'Spotless and dry: roll it up!' : 'Spotless! Now dry it') : v?.dryEnough && clean >= 90 ? 'Clean and dry: roll it up!' : '';
    const key = [c.id, clean, meta.join(), chips, ready].join('|');
    if (key === this.key) return;
    this.key = key;
    this.el.innerHTML = `<div class="top"><div class="nm"></div><div class="pct">${clean ?? '?'}%</div></div><div class="bar${pr?.spotless ? ' gold' : ''}"><i style="width:${clean ?? 0}%"></i></div><div class="meta">${meta.join(' · ')}</div>${chips ? `<div class="chips">${chips}</div>` : ''}${ready ? `<div class="ready">${ready}</div>` : ''}`;
    this.el.querySelector('.nm').textContent = c.displayName?.() ?? 'Rug';
  }
}
