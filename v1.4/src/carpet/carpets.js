// Rug Rush carpet system: spawns rugs, runs their pre/post physics steps and per-frame rendering, pushers, UV lamp and raycasts.
import * as THREE from 'three';
import { FIXED_DT } from '../core/engine.js';
import { PatternBaker } from './patterns.js';
import { SurfaceCompositor } from './composite.js';
import { hairTexture } from './detail.js';
import { Carpet } from './carpet.js';

export class CarpetSystem {
  constructor(engine, physics) {
    this.engine = engine;
    this.physics = physics;
    this.order = -20;
    this.root = new THREE.Group();
    this.root.name = 'carpets';
    engine.scene.add(this.root);
    this.baker = new PatternBaker(engine.renderer);
    this.compositor = new SurfaceCompositor(engine.renderer);
    this.global = {
      hair: hairTexture(),
      time: { value: 0 },
      uv: { uUvOn: { value: 0 }, uUvPos: { value: new THREE.Vector3() }, uUvDir: { value: new THREE.Vector3(0, -1, 0) }, uUvCos: { value: Math.cos(0.45) } },
    };
    this.carpets = [];
    this.pushers = [];
    this.quality = { shells: 1, steps: 1, volume: 1 };
    this.nextId = 1;
    this.frameDt = 1 / 60;
    this.box = { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 };
    this.stats = { preMs: 0, postMs: 0, stepMs: 0, frameMs: 0, steps: 0 };
    this.onStep = () => this.postStep();
    physics.stepListeners.push(this.onStep);
  }

  get list() {
    return this.carpets;
  }

  spawn(opts = {}) {
    const id = opts.id ?? this.nextId++;
    if (id >= this.nextId) this.nextId = id + 1;
    const c = new Carpet(this, { ...opts, id });
    this.carpets.push(c);
    return c;
  }

  remove(c) {
    const i = this.carpets.indexOf(c);
    if (i >= 0) this.carpets.splice(i, 1);
    c.dispose();
  }

  setPushers(list) {
    this.pushers.length = 0;
    for (const p of list ?? []) {
      const r = p.r ?? 0.2;
      this.pushers.push({
        ax: p.a.x, ay: p.a.y, az: p.a.z, bx: p.b.x, by: p.b.y, bz: p.b.z, r,
        minX: Math.min(p.a.x, p.b.x) - r - 0.01, maxX: Math.max(p.a.x, p.b.x) + r + 0.01,
        minY: Math.min(p.a.y, p.b.y) - r - 0.01, maxY: Math.max(p.a.y, p.b.y) + r + 0.01,
        minZ: Math.min(p.a.z, p.b.z) - r - 0.01, maxZ: Math.max(p.a.z, p.b.z) + r + 0.01,
      });
    }
  }

  setUvLamp({ on = true, position, direction, angle = 0.45 } = {}) {
    const u = this.global.uv;
    u.uUvOn.value = on ? 1 : 0;
    if (position) u.uUvPos.value.copy(position);
    if (direction) u.uUvDir.value.copy(direction).normalize();
    u.uUvCos.value = Math.cos(angle);
  }

  raycast(origin, dir, maxDist = 100) {
    let best = null;
    for (const c of this.carpets) {
      const h = c.raycast(origin, dir, best ? best.distance : maxDist);
      if (h && (!best || h.distance < best.distance)) {
        h.carpet = c;
        best = h;
      }
    }
    return best;
  }

  fixedUpdate(dt) {
    const t0 = performance.now();
    for (const c of this.carpets) c.preStep(dt);
    this.stats.preMs = performance.now() - t0;
  }

  postStep() {
    const t0 = performance.now();
    for (const c of this.carpets) c.postStep(FIXED_DT, this.box);
    const ms = performance.now() - t0;
    this.stats.postMs = ms;
    const total = ms + this.stats.preMs;
    this.stats.steps++;
    this.stats.stepMs += (total - this.stats.stepMs) * 0.05;
    this.stats.stepMax = Math.max((this.stats.stepMax ?? 0) * 0.995, total);
  }

  update(dt, alpha) {
    const t0 = performance.now();
    this.frameDt = dt;
    this.global.time.value += dt;
    const cam = this.engine.camera;
    for (const c of this.carpets) c.render(alpha, cam);
    this.stats.frameMs += (performance.now() - t0 - this.stats.frameMs) * 0.05;
  }

  report() {
    return {
      stepMs: +this.stats.stepMs.toFixed(3),
      stepMaxMs: +(this.stats.stepMax ?? 0).toFixed(3),
      frameMs: +this.stats.frameMs.toFixed(3),
      rugs: this.carpets.map((c) => ({ id: c.id, type: c.type, state: c.state, rolled: +c.rolledFraction.toFixed(3), wrapped: c.wrapped, asleep: c.asleep, ms: +c.stepMsAvg.toFixed(3) })),
    };
  }

  dispose() {
    for (const c of [...this.carpets]) this.remove(c);
    const i = this.physics.stepListeners.indexOf(this.onStep);
    if (i >= 0) this.physics.stepListeners.splice(i, 1);
    this.baker.dispose();
    this.compositor.dispose();
    this.engine.scene.remove(this.root);
  }
}
