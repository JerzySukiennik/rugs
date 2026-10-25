// Rug Rush save: day, money, lifetime stats and owned equipment persisted locally by the solo player or the host.
import * as THREE from 'three';
import { spawnProduct, spawnTool } from '../tools/items.js';
import { LAYOUT } from '../world/layout.js';

const KEY = 'rugrush.save.v1';

export class Save {
  constructor(game) {
    this.game = game;
    this.slots = [];
    this.toolSlots = [];
  }

  captureSlots() {
    this.slots = [];
    this.toolSlots = [];
    for (const it of this.game.items) {
      if (it.persistent) continue;
      const t = it.body.translation();
      const r = it.body.rotation();
      const slot = { p: new THREE.Vector3(t.x, t.y + 0.05, t.z), yaw: 2 * Math.atan2(r.y, r.w) };
      (it.product ? this.slots : this.toolSlots).push(slot);
    }
  }

  peek() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) ?? 'null');
      return s && s.v === 1 ? s : null;
    } catch (e) {
      return null;
    }
  }

  write() {
    const g = this.game;
    const inv = [];
    for (const it of g.items) {
      if (it.productId) inv.push({ k: 'p', id: it.productId, fill: +it.fill.toFixed(3) });
      else if (it.toolId) inv.push({ k: 't', id: it.toolId });
    }
    const data = {
      v: 1,
      day: g.shift?.day ?? 1,
      money: g.economy.money,
      life: g.lifeStats ?? {},
      inv,
      carts: g.carts.length,
      forklifts: g.forklifts.length,
      t: Date.now(),
    };
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch (e) {}
    return data;
  }

  clear() {
    try {
      localStorage.removeItem(KEY);
    } catch (e) {}
  }

  restore(data) {
    const g = this.game;
    if (!data) return false;
    g.economy.money = data.money;
    g.economy.log.length = 0;
    if (g.shift) g.shift.day = data.day;
    g.lifeStats = data.life ?? {};
    for (const it of [...g.items]) {
      if (it.persistent) continue;
      if (g.grab?.heldItem?.() === it) g.grab.release();
      it.dispose();
      g.entities.map.delete(it.id);
    }
    const keep = g.items.filter((it) => it.persistent);
    g.items.length = 0;
    g.items.push(...keep);
    g.blowers.length = 0;
    let pi = 0, ti = 0;
    const spare = (i) => new THREE.Vector3(LAYOUT.courierDrop.x - 1 + (i % 5) * 0.45, 0.4 + Math.floor(i / 5) * 0.35, LAYOUT.courierDrop.z + 1);
    let si = 0;
    for (const e of data.inv ?? []) {
      if (e.k === 'p') {
        const s = this.slots[pi++];
        const it = spawnProduct(g, e.id, s ? s.p : spare(si++), s ? s.yaw : 0);
        it.fill = Math.max(0, Math.min(it.product.capacity, e.fill ?? it.product.capacity));
      } else {
        const s = this.toolSlots[ti++];
        spawnTool(g, e.id, s ? s.p : spare(si++), s ? s.yaw : 0);
      }
    }
    while (g.carts.length < (data.carts ?? 1)) g.spawnCart?.(new THREE.Vector3(14, 0, -4 + g.carts.length * 1.2));
    while (g.forklifts.length < (data.forklifts ?? 0)) g.spawnForklift?.(new THREE.Vector3(12, 0, g.forklifts.length * 3));
    return true;
  }
}
