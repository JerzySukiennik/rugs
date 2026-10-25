// Rug Rush economy and supply shop: money, payouts, ordering products and equipment delivered by courier.
import * as THREE from 'three';
import { PRODUCTS, TOOLS } from '../data/products.js';
import { LAYOUT } from '../world/layout.js';
import { spawnProduct, spawnTool } from '../tools/items.js';
import { productIcon, toolIcon, simpleIcon } from './icons.js';

const FIXES = { surf: 'sticky soda, dirt, shampoo', alk: 'grease, heavy soil', ox: 'wine, coffee, stains', enz: 'urine, pet smell', solv: 'grease, paint, gum, ink', absorb: 'grease, oil', dryc: 'dry clean, sisal, silk', fix: 'colour run, dye lock', fungi: 'mould', cold: 'gum, wax', tannin: 'coffee, tea, wine', reducer: 'red wine dye', chlor: 'bleach', scent: 'smell', acid: 'rinse, neutralise', encap: 'low moisture' };
const TOOL_FOR = { vacuum: 'dust, hair, powder', brush: 'scrub, hair, mud', squeegee: 'water, drain, extract', scraper: 'gum, wax, mud', iron: 'wax', uvlamp: 'urine, find stains', blower: 'dry, fan' };

const CSS = `
#shop{position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(8,10,14,.5);z-index:6;font:14px/1.4 -apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif;color:#fff}
#shop.on{display:flex}
#shop .win{width:min(880px,94vw);max-height:86vh;display:flex;flex-direction:column;border-radius:16px;background:rgba(22,25,31,.94);box-shadow:0 30px 80px rgba(0,0,0,.5);overflow:hidden}
#shop header{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid rgba(255,255,255,.08)}
#shop h2{margin:0;font:600 20px/1 -apple-system,"SF Pro Display",Helvetica,sans-serif}
#shop .money{font-weight:600;color:#7fe0a0}
#shop .list{overflow:auto;padding:8px 12px 12px;display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:8px}
#shop .sec{grid-column:1/-1;margin:10px 4px 2px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;opacity:.55}
#shop .it{display:flex;gap:10px;align-items:center;padding:9px 10px;border-radius:10px;background:rgba(255,255,255,.05);cursor:pointer;transition:background .15s,transform .1s}
#shop .it:hover{background:rgba(255,255,255,.1)}
#shop .it:active{transform:scale(.98)}
#shop .it.no{opacity:.4;cursor:default}
#shop .sw{width:14px;height:34px;border-radius:4px;flex:none}
#shop .tx{flex:1;min-width:0}
#shop .tx b{display:block;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#shop .tx span{font-size:12px;opacity:.65}
#shop .pr{font-weight:600}
#shop footer{display:flex;justify-content:space-between;align-items:center;padding:12px 20px;border-top:1px solid rgba(255,255,255,.08);font-size:13px;opacity:.85}
#shop button{font:inherit;color:#fff;background:#2f6db5;border:0;border-radius:8px;padding:8px 16px;cursor:pointer}
`;

export class Economy {
  constructor(game, start = 150) {
    this.game = game;
    this.money = start;
    this.log = [];
    this.order = 500;
    this.deliveries = [];
    this.time = 0;
  }

  add(amount, reason) {
    this.money += amount;
    this.log.push({ t: this.time, amount, reason });
    this.game.hud?.toast(`${amount >= 0 ? '+' : '−'}$${Math.abs(Math.round(amount))} · ${reason}`, amount < 0);
  }

  spend(amount, reason) {
    if (this.money < amount) return false;
    this.money -= amount;
    this.log.push({ t: this.time, amount: -amount, reason });
    return true;
  }

  schedule(kind, id, eta = 12) {
    this.deliveries.push({ kind, id, at: this.time + eta });
  }

  fixedUpdate(dt) {
    this.time += dt;
    const due = this.deliveries.filter((d) => d.at <= this.time);
    if (!due.length) return;
    this.deliveries = this.deliveries.filter((d) => d.at > this.time);
    const base = LAYOUT.courierDrop;
    due.forEach((d, i) => {
      const p = new THREE.Vector3(base.x + (i % 4) * 0.5 - 0.75, 0.6 + Math.floor(i / 4) * 0.4, base.z + (Math.random() - 0.5) * 0.6);
      if (d.kind === 'product') spawnProduct(this.game, d.id, p, Math.random() * 6);
      else if (d.kind === 'tool') spawnTool(this.game, d.id, p, Math.random() * 6);
      else if (d.kind === 'forklift') this.game.spawnForklift?.(p);
      else if (d.kind === 'cart') this.game.spawnCart?.(p);
    });
    this.game.hud?.toast(`Courier dropped ${due.length} item${due.length > 1 ? 's' : ''} at the side door.`);
    this.game.audio?.play('cardboard_drop', { pos: new THREE.Vector3(base.x, 0.5, base.z), volume: 0.8 });
  }
}

export class Shop {
  constructor(game) {
    this.game = game;
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
    const el = document.createElement('div');
    el.id = 'shop';
    el.innerHTML = '<div class="win"><header><h2>Supplies</h2><input class="q" type="search" placeholder="Search: wine, grease, foam, vacuum\u2026" spellcheck="false"><div class="money"></div></header><div class="list"></div><footer><span>Orders arrive by courier at the side door in ~12 s.</span><button>Close (Esc)</button></footer></div>';
    document.body.appendChild(el);
    this.el = el;
    this.list = el.querySelector('.list');
    this.moneyEl = el.querySelector('.money');
    this.q = el.querySelector('.q');
    this.q.addEventListener('input', () => this.render());
    el.querySelector('button').addEventListener('click', () => this.close());
    el.addEventListener('click', (e) => { if (e.target === el) this.close(); });
    addEventListener('keydown', (e) => {
      if (!this.isOpen) return;
      if (e.code === 'Escape' || (e.code === 'KeyE' && e.target !== this.q)) this.close();
    });
    this.isOpen = false;
    this.render();
  }

  catalog() {
    const out = [];
    out.push({ sec: 'Chemicals & powders' });
    for (const [id, p] of Object.entries(PRODUCTS)) {
      const tags = Object.keys(p.agents).map((a) => FIXES[a]).filter(Boolean).join(', ');
      out.push({ kind: 'product', id, name: `${p.brand} ${p.name}`, sub: p.blurb, price: p.price, color: p.color, icon: productIcon(p), tags: `${tags} ${p.form} ${p.container}` });
    }
    out.push({ sec: 'Tools' });
    for (const [id, t] of Object.entries(TOOLS)) out.push({ kind: 'tool', id, name: t.name, sub: `For ${TOOL_FOR[t.kind] ?? t.kind}`, price: t.price, color: '#9aa1a6', icon: toolIcon(t), tags: `${TOOL_FOR[t.kind] ?? ''} ${t.kind}` });
    out.push({ sec: 'Equipment' });
    out.push({ kind: 'cart', id: 'cart', name: 'Platform cart', sub: 'Carries 3 rolls', price: 60, color: '#2f6db5', icon: simpleIcon('\u{1F6D2}', '#3bceac'), tags: 'cart trolley transport' });
    out.push({ kind: 'forklift', id: 'forklift', name: 'Forklift with carpet ram', sub: 'Skewer rolls, lift them into trucks', price: 600, color: '#f2b630', icon: simpleIcon('\u{1F69C}', '#ffd23f'), tags: 'forklift vehicle lift' });
    return out;
  }

  render() {
    const money = this.game.economy?.money ?? 0;
    this.moneyEl.textContent = `$${Math.round(money)}`;
    this.list.innerHTML = '';
    const q = (this.q?.value ?? '').trim().toLowerCase();
    let sec = null, shown = 0;
    for (const it of this.catalog()) {
      if (it.sec) {
        sec = it.sec;
        continue;
      }
      if (q && !`${it.name} ${it.sub} ${it.tags ?? ''}`.toLowerCase().includes(q)) continue;
      if (sec) {
        const s = document.createElement('div');
        s.className = 'sec';
        s.textContent = sec;
        this.list.appendChild(s);
        sec = null;
      }
      shown++;
      const d = document.createElement('div');
      d.className = 'it' + (money < it.price ? ' no' : '');
      d.innerHTML = `<img class="ic" alt="" src="${it.icon ?? ''}"><div class="tx"><b></b><span></span></div><div class="pr">$${it.price}</div>`;
      d.querySelector('b').textContent = it.name;
      d.querySelector('span').textContent = it.sub;
      d.addEventListener('click', () => this.buy(it));
      this.list.appendChild(d);
    }
    if (!shown) {
      const e = document.createElement('div');
      e.className = 'sec';
      e.textContent = `Nothing matches \u201c${this.q.value}\u201d`;
      this.list.appendChild(e);
    }
  }

  buy(it) {
    if (this.game.net?.isClient) return this.game.net.order(it.kind, it.id);
    const eco = this.game.economy;
    if (!eco.spend(it.price, `Bought ${it.name}`)) return this.game.hud?.toast('Not enough money.', true);
    eco.schedule(it.kind, it.id);
    this.game.hud?.toast(`Ordered: ${it.name}`);
    this.render();
  }

  open() {
    this.isOpen = true;
    if (this.q) this.q.value = '';
    this.render();
    this.el.classList.add('on');
    setTimeout(() => this.q?.focus(), 60);
    this.game.input.unlock();
    this.game.input.autoLock = false;
  }

  close() {
    this.isOpen = false;
    this.el.classList.remove('on');
    this.game.input.autoLock = true;
    this.game.input.lock();
  }
}
