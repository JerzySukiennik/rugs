// Rug Rush briefing: logs what players do and see, and packs the warehouse state into a compact snapshot for Rug Buddy.
import { FIBERS } from '../data/fibers.js';
import { CARPET_TYPES } from '../data/carpetTypes.js';
import { LAYOUT, inBay } from '../world/layout.js';

const DIRT_LABEL = { dust: 'dust', hair: 'pet hair', mud: 'mud', sticky: 'sticky soda', wine: 'red wine', coffee: 'coffee', grease: 'grease', urine: 'urine', gum: 'gum', wax: 'wax', paint: 'paint', mold: 'mould' };

function rugPos(c) {
  const t = c.body?.translation?.();
  if (t) return t;
  return c.uvToWorld?.(0.5, 0.5)?.point ?? null;
}

export class Briefing {
  constructor(game) {
    this.game = game;
    this.order = 988;
    this.log = [];
    this.use = null;
    this.sampleAcc = 0;
    this.t = 0;
    this.wire();
  }

  push(text) {
    this.log.push({ t: this.t, text });
    if (this.log.length > 30) this.log.shift();
  }

  wire() {
    const g = this.game;
    const hud = g.hud;
    const toast = hud.toast.bind(hud);
    hud.toast = (text, bad = false, ms) => {
      if (text) this.push(`${bad ? 'warning' : 'message'}: ${text}`);
      return toast(text, bad, ms);
    };
    const wr = g.onRugWrapped;
    g.onRugWrapped = (c, ev, price) => {
      wr?.(c, ev, price);
      this.push(`wrapped ${c.displayName?.() ?? c.type}: grade ${ev?.grade ?? '?'}, $${price}`);
    };
    const rag = g.onRagdoll;
    g.onRagdoll = (reason) => {
      rag?.(reason);
      this.push(`you fell over (${reason})`);
    };
  }

  zone(p) {
    if (!p) return 'unknown';
    const g = this.game;
    for (const t of g.trucks ?? []) if (t.inCargo?.(p)) return t.role === 'in' ? 'inside the inbound truck' : 'inside the outbound truck';
    if (Math.hypot(p.x - LAYOUT.roller.x, p.z - LAYOUT.roller.z) < 2.2) return 'at the roller';
    for (const r of LAYOUT.dryingRacks) if (Math.abs(p.x - r.x) < 1.6 && Math.abs(p.z - r.z) < 1.2) return 'at the drying racks';
    if (Math.hypot(p.x - LAYOUT.dryer.x, p.z - LAYOUT.dryer.z) < 4.5) return 'in front of the industrial dryer';
    if (inBay(p.x, p.z)) return 'in the wash bay';
    return 'on the warehouse floor';
  }

  aimTarget() {
    const a = this.game.grab?.aim;
    if (a?.owner?.kind === 'carpet') return a.owner.displayName?.() ?? 'a rug';
    if (this.game.fluids?.floor && a?.point && a.point.y < 0.2) return 'the floor';
    return a?.owner?.label ?? 'nothing';
  }

  update(dt) {
    const g = this.game;
    this.t += dt;
    if (g.mode === 'menu') return;
    if (!g.assistant?.isOpen) {
      this.lastAim = this.aimTarget();
      this.lastStain = g.stainHover?.name ?? null;
    }
    const it = g.grab?.heldItem?.();
    const using = !!it?.using;
    if (using) {
      const target = this.aimTarget();
      if (!this.use || this.use.item !== it || this.use.target !== target) {
        this.flushUse();
        this.use = { item: it, target, dur: 0 };
      }
      this.use.dur += dt;
    } else this.flushUse();
    this.sampleAcc += dt;
    if (this.sampleAcc > 15) {
      this.sampleAcc = 0;
      for (const c of g.carpets?.list ?? []) {
        const ev = g.chem?.evaluate(c);
        if (!ev) continue;
        (c.cleanHistory ??= []).push(Math.round(ev.clean * 100));
        if (c.cleanHistory.length > 8) c.cleanHistory.shift();
      }
    }
  }

  flushUse() {
    const u = this.use;
    this.use = null;
    if (!u || u.dur < 0.3) return;
    this.push(`you used ${u.item.label} on ${u.target} for ${u.dur.toFixed(1)} s`);
  }

  prime() {
    for (const c of this.game.carpets?.list ?? []) this.game.chem?.evaluate(c);
  }

  rug(c, me) {
    const g = this.game;
    const ev = g.chem?.evaluate(c);
    const f = FIBERS[c.type];
    const p = rugPos(c);
    const r = {
      name: c.displayName?.() ?? c.type,
      type: CARPET_TYPES[c.type]?.name ?? c.type,
      fibre: f?.fiber,
      careLabel: f?.care?.notes,
      client: c.job?.client,
      clientNote: c.job?.note,
      state: c.wrapped ? 'wrapped, ready to ship' : c.state === 'rolled' ? 'rolled up' : c.state === 'flat' ? 'open' : 'partly rolled',
      where: this.zone(p),
    };
    if (p) {
      r.distanceFromYou = `${Math.hypot(p.x - me.x, p.z - me.z).toFixed(1)} m`;
      if (!c.body && p.y > 0.35) r.hanging = true;
    }
    if (ev) {
      r.cleanPercent = Math.round(ev.clean * 100);
      r.wetPercent = Math.round(ev.wet * 100);
      r.dryEnoughToRoll = !!ev.dryEnough;
      r.damagePercent = Math.round(Math.max(ev.damage, ev.damagePeak) * 1000) / 10;
      if (ev.ruined) r.ruined = true;
      r.gradeIfFinishedNow = ev.grade;
      if (ev.residue > 0.05) r.soapOrPowderLeft = Math.round(ev.residue * 100) / 100;
      const left = Object.entries(ev.per ?? {}).filter(([, v]) => v > 0.0015).sort((a, b) => b[1] - a[1]).slice(0, 6);
      if (left.length) r.dirtLeft = Object.fromEntries(left.map(([k, v]) => [DIRT_LABEL[k] ?? k, Math.round(v * 1000) / 10]));
    }
    if (c.cleanHistory?.length > 1) r.cleanPercentEvery15s = c.cleanHistory.slice(-6);
    return r;
  }

  snapshot() {
    const g = this.game;
    const me = g.player.feet;
    const it = g.grab?.heldItem?.();
    const held = g.grab?.held;
    const you = {
      name: g.look?.name ?? 'you',
      holding: it ? `${it.label}${it.fillFrac !== undefined ? ` (${Math.round(it.fillFrac * 100)}% full)` : ''}` : held?.kind === 'cloth' ? `a corner of ${held.carpet?.displayName?.() ?? 'a rug'}` : held ? 'something heavy' : 'nothing',
      aimingAt: this.lastAim ?? this.aimTarget(),
      where: this.zone(me),
    };
    if (this.lastStain) you.stainUnderCrosshair = this.lastStain;
    const others = [];
    const s = g.net?.session;
    const remotes = s?.remotes ? [...s.remotes.values()] : s?.peers ? [...s.peers.values()].map((e) => e.player).filter(Boolean) : [];
    for (const rp of remotes) {
      const h = rp.holding;
      const ent = h?.id != null ? g.entities.get(h.id) : null;
      others.push({ name: rp.name ?? 'player', holding: ent ? ent.label ?? ent.displayName?.() ?? h.kind : 'nothing', where: this.zone(rp.feet?.y > -10 ? rp.feet : rp.avatar?.object3d?.position) });
    }
    const stock = {};
    const tools = {};
    for (const x of g.items) {
      if (x.product) {
        const k = `${x.product.brand} ${x.product.name}`;
        (stock[k] ??= []).push(Math.round((x.fillFrac ?? 1) * 100));
      } else if (x.def && !x.persistent) tools[x.label] = (tools[x.label] ?? 0) + 1;
    }
    return {
      mode: g.mode,
      money: Math.round(g.economy?.money ?? 0),
      you,
      otherPlayers: others,
      rugs: (g.carpets?.list ?? []).map((c) => this.rug(c, me)),
      trucks: (g.trucks ?? []).map((t) => ({ role: t.role === 'in' ? 'inbound (brings dirty rugs)' : 'outbound (takes wrapped rugs)', state: t.state, rugsInside: t.carpetsInside?.().length ?? 0 })),
      productsInStock: Object.entries(stock).map(([k, v]) => `${k} (${v.map((n) => `${n}%`).join(', ')})`),
      tools: Object.entries(tools).map(([k, n]) => (n > 1 ? `${k} x${n}` : k)),
      recent: this.log.slice(-18).map((e) => `${Math.round(this.t - e.t)} s ago, ${e.text}`),
    };
  }
}
