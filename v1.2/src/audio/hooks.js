// Rug Rush sound hooks: watches tools, hose, footsteps, trucks, roller, forklift, money, impacts and ambience and drives the audio bank.
import * as THREE from 'three';

const _v = new THREE.Vector3();
const DOWN = new THREE.Vector3(0, -1, 0);

export class SoundHooks {
  constructor(game) {
    this.game = game;
    this.a = game.audio;
    this.order = 996;
    this.loops = new Map();
    this.timers = new Map();
    this.prev = new Map();
    this.step = 0;
    this.logLen = 0;
    this.started = false;
    this.lastPos = new THREE.Vector3();
    this.a.preload([
      'vacuum_loop', 'vacuum_start', 'vacuum_stop', 'wetvac_loop', 'slurp', 'brush_scrub', 'brush_soft', 'spray', 'aerosol_loop', 'foam_spray_loop',
      'pour_loop', 'glug', 'powder_shake_loop', 'hose_loop', 'water_splash', 'squeegee', 'drain_loop', 'scrape', 'iron_hiss', 'blower_loop', 'dryer_loop',
      'footstep_tile', 'footstep_carpet', 'footstep_wet', 'rug_thud', 'rug_unroll', 'cloth_flap', 'bottle_drop', 'metal_clank', 'cardboard_drop', 'body_fall',
      'truck_engine_loop', 'truck_reverse_beep', 'truck_air_brake', 'truck_door_open', 'truck_door_close', 'ramp_clank', 'roller_motor_loop', 'stretch_film_loop',
      'label_printer', 'cash_register', 'forklift_engine_loop', 'forklift_hydraulic', 'uv_click', 'button_press', 'trash_drop', 'roller_door',
      'ui_click', 'ui_hover', 'ui_pop', 'ui_whoosh', 'ui_error', 'ui_success', 'ui_coin', 'ui_shift_end', 'ui_stamp', 'ui_join', 'ui_leave', 'ui_slider',
    ]);
    const hud = game.hud;
    if (hud && !hud.__sfx) {
      const toast = hud.toast.bind(hud);
      hud.toast = (text, bad = false, ms) => {
        this.a.ui(bad ? 'ui_error' : 'ui_pop', 0.6);
        return toast(text, bad, ms);
      };
      hud.__sfx = true;
    }
  }

  loopOn(key, name, on, pos = null, vol = 1, rate = null) {
    let h = this.loops.get(key);
    if (on) {
      if (!h) {
        h = this.a.loop(name, { pos, volume: vol });
        this.loops.set(key, h);
      } else {
        h.setVolume(vol);
        if (pos) h.setPos(pos);
      }
      if (rate !== null) h.setRate(rate);
    } else if (h) {
      h.stop();
      this.loops.delete(key);
    }
  }

  every(key, sec, dt) {
    const t = (this.timers.get(key) ?? sec) + dt;
    if (t >= sec) {
      this.timers.set(key, 0);
      return true;
    }
    this.timers.set(key, t);
    return false;
  }

  changed(key, value) {
    const p = this.prev.get(key);
    this.prev.set(key, value);
    return p !== value ? { from: p } : null;
  }

  update(dt) {
    const g = this.game;
    if (!this.a.ctx) return;
    this.a.update(dt, g.engine.camera);
    if (!this.started) {
      this.started = true;
      this.loopOn('amb', 'amb_warehouse_loop', true, null, 0.35);
    }
    const p = g.player;
    const playing = g.mode && g.mode !== 'menu';
    this.tools(dt);
    this.hose(dt);
    if (playing && p && !p.ragdolled && !p.inVehicle) this.footsteps(dt, p);
    this.trucks(dt);
    this.machines(dt);
    this.money();
    this.impacts();
    this.water(dt);
  }

  tools(dt) {
    const g = this.game;
    const it = g.grab?.heldItem?.();
    const pos = it?.mesh ? it.mesh.getWorldPosition(_v).clone() : null;
    const k = it?.def?.kind;
    const using = !!it?.using && g.grab?.lmb;
    const vac = k === 'vacuum' && using;
    const ch = this.changed('vac', vac);
    if (ch && vac) this.a.play('vacuum_start', { pos, volume: 0.7 });
    if (ch && !vac && ch.from) this.a.play('vacuum_stop', { pos, volume: 0.6 });
    this.loopOn('vac', it?.def?.wet ? 'wetvac_loop' : 'vacuum_loop', vac, pos, 0.55);
    if (vac && it.def.wet && it.tank > (this.prev.get('tank') ?? 0) + 0.05) {
      this.a.play('slurp', { pos, volume: 0.5 });
      this.prev.set('tank', it.tank);
    }
    if (k === 'brush' && using) {
      const mv = it.prevHead ? 1 : 0;
      if (mv && this.every('brush', it.def.rake ? 0.42 : 0.26, dt)) this.a.play(it.def.strength < 0.6 || it.def.rake ? 'brush_soft' : 'brush_scrub', { pos, volume: 0.5 });
    }
    if (k === 'squeegee' && using && this.every('sq', 0.55, dt)) this.a.play('squeegee', { pos, volume: 0.5 });
    if (k === 'scraper' && using && this.every('scr', 0.35, dt)) this.a.play('scrape', { pos, volume: 0.5 });
    this.loopOn('iron', 'iron_hiss', k === 'iron' && using, pos, 0.35);
    if (k === 'uvlamp' && this.changed('uv', it.on)?.from !== undefined) this.a.play('uv_click', { pos, volume: 0.6 });
    const p = it?.product;
    const flowing = !!it?.stream?.active || (p && using && it.fill > 0 && (it.mode === 'spray' || it.tilt > 0.55));
    const trig = p?.container === 'trigger' && using && it.fill > 0;
    if (trig && this.every('spray', 0.24, dt)) this.a.play('spray', { pos, volume: 0.55 });
    this.loopOn('aero', p?.form === 'foam' ? 'foam_spray_loop' : 'aerosol_loop', flowing && (p?.container === 'aerosol' || p?.container === 'foamer'), pos, 0.45);
    this.loopOn('pour', 'pour_loop', flowing && it.mode === 'pour', pos, 0.5);
    if (flowing && it.mode === 'pour' && this.every('glug', 1.1, dt)) this.a.play('glug', { pos, volume: 0.35 });
    this.loopOn('shake', 'powder_shake_loop', flowing && it.mode === 'shake', pos, 0.5);
    for (const b of g.blowers ?? []) this.loopOn(b, 'blower_loop', !!b.on, b.mesh.getWorldPosition(_v).clone(), 0.45);
    for (const d of g.dryers ?? []) this.loopOn(d, 'dryer_loop', !!d.on, d.pos, 0.4);
  }

  hose(dt) {
    const g = this.game;
    const h = g.hose;
    if (!h) return;
    let pos = null;
    if (h.nozzle) pos = h.nozzle.getWorldPosition(_v).clone();
    this.loopOn('hose', 'hose_loop', !!h.flowing, pos, 0.6);
    if (h.flowing && pos && this.every('splash', 0.32, dt)) {
      const aim = g.grab?.aim?.point;
      const at = aim && aim.distanceTo(pos) < 6 ? aim : pos.clone().add(new THREE.Vector3(0, -1.2, 0));
      this.a.play('water_splash', { pos: at, volume: 0.28 });
    }
    const held = g.grab?.held;
    const rug = held?.carpet;
    const sp = Math.hypot(g.player.velocity.x, g.player.velocity.z);
    const dragging = !!rug && sp > 0.4;
    this.loopOn('drag', 'rug_drag_loop', dragging, g.player.feet.clone(), Math.min(0.55, sp * 0.22), dragging ? 0.85 + Math.min(0.3, sp * 0.1) : null);
  }

  footsteps(dt, p) {
    const g = this.game;
    const sp = Math.hypot(p.velocity.x, p.velocity.z);
    if (!p.grounded || sp < 0.6) {
      this.step = 0.5;
      return;
    }
    this.step += sp * dt;
    const stride = p.sprinting ? 0.95 : 0.72;
    if (this.step < stride) return;
    this.step = 0;
    let kind = 'footstep_tile';
    const f = p.feet;
    const ch = g.carpets?.raycast?.(_v.set(f.x, f.y + 0.4, f.z), DOWN, 0.6);
    if (ch && ch.part !== 'roll') kind = 'footstep_carpet';
    else if ((g.fluids?.depthAt?.(f.x, f.z) ?? 0) > 0.0004) kind = 'footstep_wet';
    this.a.play(kind, { volume: (p.sprinting ? 0.5 : 0.32) * (p.crouch > 0.5 ? 0.5 : 1), jitter: 0.08 });
  }

  trucks() {
    for (const t of this.game.trucks ?? []) {
      const moving = ['arrive', 'reverse', 'leave'].includes(t.state);
      const pos = t.pos.clone().setY(1);
      this.loopOn(t, 'truck_engine_loop', moving || t.state === 'parked' || t.state === 'opening' || t.state === 'closing', pos, moving ? 0.7 : 0.35, moving ? 1.05 : 0.9);
      this.loopOn(`${t.role}-beep`, 'truck_reverse_beep', t.state === 'reverse', pos, 0.45);
      const ch = this.changed(`${t.role}-st`, t.state);
      if (!ch || ch.from === undefined) continue;
      if (t.state === 'parked') this.a.play('truck_air_brake', { pos, volume: 0.8, ref: 4 });
      if (t.state === 'opening') {
        this.a.play('truck_door_open', { pos, volume: 0.8, ref: 4 });
        setTimeout(() => this.a.play('ramp_clank', { pos, volume: 0.7, ref: 4 }), 1300);
      }
      if (t.state === 'closing') this.a.play('truck_door_close', { pos, volume: 0.8, ref: 4 });
      if (t.state === 'reverse') this.a.play('roller_door', { pos: pos.clone().setX(t.dock.x), volume: 0.6, ref: 5 });
    }
  }

  machines() {
    const g = this.game;
    const r = g.roller;
    if (r) {
      const pos = r.origin.clone().setY(0.8);
      const ch = this.changed('roller', r.state);
      if (ch && ch.from !== undefined) {
        if (r.state === 'rolling') this.a.play('button_press', { pos, volume: 0.7 });
        if (r.state === 'cooldown') this.a.play('label_printer', { pos, volume: 0.7 });
      }
      this.loopOn('rollerM', 'roller_motor_loop', r.state === 'rolling' || r.state === 'wrapping', pos, 0.5);
      this.loopOn('film', 'stretch_film_loop', r.state === 'wrapping', pos, 0.55);
    }
    for (const f of g.forklifts ?? []) {
      const pos = f.pos.clone().setY(1);
      this.loopOn(f, 'forklift_engine_loop', !!f.driver, pos, 0.5, 0.9 + Math.min(0.4, Math.abs(f.speed) * 0.08));
      const ch = this.changed(`fl-lift-${f.id}`, Math.round(f.lift * 20));
      if (ch && ch.from !== undefined && f.driver && this.every(`fl-h-${f.id}`, 0.5, 1 / 60)) this.a.play('forklift_hydraulic', { pos, volume: 0.4 });
    }
  }

  money() {
    const log = this.game.economy?.log;
    if (!log) return;
    while (this.logLen < log.length) {
      const e = log[this.logLen++];
      if (e.amount > 0) {
        this.a.play('cash_register', { volume: 0.6, bus: 'ui' });
        setTimeout(() => this.a.ui('ui_coin', 0.7), 250);
      }
    }
  }

  impacts() {
    const g = this.game;
    for (const it of g.items ?? []) {
      if (it.__sfx) continue;
      it.__sfx = true;
      const prev = it.onContactForce;
      it.onContactForce = (other, f) => {
        prev?.call(it, other, f);
        const now = performance.now();
        if (now - (it.__last ?? 0) < 120 || f < 40) return;
        it.__last = now;
        const kind = it.product ? 'bottle_drop' : it.def?.kind === 'blower' || it.def?.kind === 'vacuum' ? 'metal_clank' : 'bottle_drop';
        this.a.play(kind, { pos: it.mesh.getWorldPosition(new THREE.Vector3()), volume: Math.min(0.9, f / 600) });
      };
    }
    if (!g.__rugSfx) {
      g.__rugSfx = true;
      const imp = g.onRugImpact;
      g.onRugImpact = (c, f) => {
        imp?.(c, f);
        const t = c.body?.translation?.();
        if (t && f > 80) this.a.play('rug_thud', { pos: new THREE.Vector3(t.x, t.y, t.z), volume: Math.min(1, f / 1500) });
      };
      const rag = g.onRagdoll;
      g.onRagdoll = (reason) => {
        rag?.(reason);
        this.a.play('body_fall', { volume: 0.8 });
      };
      const grabEv = g.grab?.onEvent;
      if (g.grab) g.grab.onEvent = (type, obj) => {
        grabEv?.(type, obj);
        if (type === 'unroll') this.a.play('rug_unroll', { volume: 0.7 });
        if (type === 'grab' && obj?.kind === 'carpet') this.a.play('cloth_flap', { volume: 0.5 });
        if (type === 'throw') this.a.ui('ui_whoosh', 0.4);
      };
    }
  }

  water() {
    const g = this.game;
    const l = g.fluids?.totalLiters?.() ?? 0;
    this.loopOn('drain', 'drain_loop', l > 0.5, new THREE.Vector3(0, 0, -3), Math.min(0.6, l / 25));
  }
}
