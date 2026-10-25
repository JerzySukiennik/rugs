// Rug Rush shifts: a 15-minute work day with its own stats, end-of-shift settlement of unfinished rugs and the next-day reset.
import { CARPET_TYPES } from '../data/carpetTypes.js';

export const SHIFT_SECONDS = 900;

function freshStats() {
  return { earned: 0, spent: 0, shipped: [], unrolls: 0, trips: 0, water: 0, product: 0, rugsIn: 0, ruined: 0 };
}

export class Shift {
  constructor(game) {
    this.game = game;
    this.day = 1;
    this.t = 0;
    this.running = false;
    this.ended = false;
    this.stats = freshStats();
    this.order = 400;
    this.base = null;
    this.fillAcc = 0;
    this.fills = new Map();
  }

  get left() {
    return Math.max(0, SHIFT_SECONDS - this.t);
  }

  clock() {
    const s = Math.ceil(this.left);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  start() {
    const g = this.game;
    this.t = 0;
    this.running = true;
    this.ended = false;
    this.stats = freshStats();
    this.base = { unrolls: g.stats.unrolls, trips: g.stats.trips, rugsIn: g.stats.rugsIn, ruined: g.stats.ruined, log: g.economy.log.length };
    this.fills.clear();
    for (const t of g.trucks) t.shiftClosed = false;
  }

  record(c, ev, price) {
    this.stats.shipped.push({ name: c.displayName?.() ?? c.type, client: c.job?.client ?? '', grade: ev?.grade ?? '?', price, ruined: !!ev?.ruined });
  }

  fixedUpdate(dt) {
    const g = this.game;
    if (g.mode === 'client') {
      if (this.running && !this.ended) this.t += dt;
      return;
    }
    if (!this.running) return;
    this.t += dt;
    if (g.hose?.flowing) this.stats.water += 0.7 * dt;
    this.fillAcc += dt;
    if (this.fillAcc > 1) {
      this.fillAcc = 0;
      for (const it of g.items) {
        if (it.fill === undefined) continue;
        const prev = this.fills.get(it);
        if (prev !== undefined && it.fill < prev) this.stats.product += prev - it.fill;
        this.fills.set(it, it.fill);
      }
    }
    if (this.t >= SHIFT_SECONDS && !this.ended) this.end();
    if (this.t >= SHIFT_SECONDS - 60) for (const t of g.trucks) if (t.role === 'in') t.shiftClosed = true;
  }

  end() {
    const g = this.game;
    this.ended = true;
    this.running = false;
    for (const t of g.trucks) t.shiftClosed = true;
    const unfinished = [];
    for (const c of [...(g.carpets?.list ?? [])]) {
      const ev = c.finalEval ?? g.chem.evaluate(c);
      let price;
      if (c.wrapped && c.finalPrice !== undefined) price = c.finalPrice;
      else if (ev?.ruined) price = -Math.round(CARPET_TYPES[c.type].basePrice * 1.5);
      else price = Math.round(g.chem.price(c, ev) * 0.5);
      unfinished.push({ name: c.displayName?.() ?? c.type, client: c.job?.client ?? '', grade: ev?.ruined ? 'F' : c.wrapped ? ev?.grade ?? '?' : 'Half done', price, ruined: !!ev?.ruined });
      g.removeCarpet(c);
    }
    const sumU = unfinished.reduce((a, b) => a + b.price, 0);
    if (unfinished.length) g.economy.add(sumU, 'Clients collected unfinished rugs');
    const log = g.economy.log.slice(this.base.log);
    const s = this.stats;
    s.earned = log.filter((e) => e.amount > 0).reduce((a, e) => a + e.amount, 0);
    s.spent = -log.filter((e) => e.amount < 0).reduce((a, e) => a + e.amount, 0);
    s.unrolls = g.stats.unrolls - this.base.unrolls;
    s.trips = g.stats.trips - this.base.trips;
    s.rugsIn = g.stats.rugsIn - this.base.rugsIn;
    s.ruined = g.stats.ruined - this.base.ruined + unfinished.filter((u) => u.ruined).length;
    s.unfinished = unfinished;
    const life = (g.lifeStats ??= {});
    life.days = (life.days ?? 0) + 1;
    life.earned = (life.earned ?? 0) + s.earned;
    life.rugs = (life.rugs ?? 0) + s.shipped.length;
    life.unrolls = (life.unrolls ?? 0) + s.unrolls;
    g.onShiftEnd?.(this.day, s);
  }

  next() {
    this.day++;
    this.start();
    this.game.onShiftStart?.(this.day);
  }
}
