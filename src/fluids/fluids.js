// Rug Rush fluids system: floor water simulation, streams and particles, drips, squeegees and the hanging hose.
import { FloorWater } from './floor.js';
import { Particles, STREAM_DEFAULTS, KINDS } from './particles.js';
import { Hose } from './hose.js';
import { waterNormalTexture, bubbleTexture, grainTexture } from './textures.js';

export const FLUID_UNITS = {
  water: { unit: 'L', floorPerUnit: 1 },
  mist: { unit: 'L', floorPerUnit: 1 },
  gel: { unit: 'L', floorWaterPerUnit: 1, soap: 1 },
  foam: { unit: 'foam unit (1 L of foam)', floorPerUnit: 0.1 },
  powder: { unit: 'kg', floorPerUnit: 1, soapLitersPerKg: 3 },
};

export { STREAM_DEFAULTS, KINDS };

export class Fluids {
  constructor(engine, physics, opts = {}) {
    this.engine = engine;
    this.physics = physics;
    this.scene = engine.scene;
    this.renderer = engine.renderer;
    this.units = FLUID_UNITS;
    this.quality = {
      simRes: opts.simRes ?? 256,
      rippleRes: opts.rippleRes ?? 512,
      meshSegments: opts.meshSegments ?? 192,
      maxParticles: opts.maxParticles ?? 4096,
      testsPerStep: opts.testsPerStep ?? 192,
      reflections: opts.reflections ?? true,
      reflectionScale: opts.reflectionScale ?? 0.5,
    };
    this.tick = 0;
    this.time = 0;
    this.alpha = 0;
    this.hitTest = opts.hitTest ?? null;
    this.onDeposit = opts.onDeposit ?? null;
    this.entities = opts.entities ?? null;
    this.textures = { normal: waterNormalTexture(), bubble: bubbleTexture(), grain: grainTexture() };
    this.floor = new FloorWater(this, { res: this.quality.simRes, rippleRes: this.quality.rippleRes, meshSegments: this.quality.meshSegments, reflections: this.quality.reflections, reflectionScale: this.quality.reflectionScale });
    this.particles = new Particles(this, { max: this.quality.maxParticles, testsPerStep: this.quality.testsPerStep });
    this.floor.reflectionHide.push(this.particles.sprites.mesh);
    this.hoses = [];
    this.stats = { cpuMs: 0, cpuMsMax: 0, frameMs: 0, steps: 0 };
    this._msAcc = 0;
    this._msN = 0;
    this._msMax = 0;
  }

  addWater(x, z, liters, opts = {}) {
    return this.floor.addWater(x, z, liters, opts);
  }

  addFoam(x, z, amount, radius = 0.2) {
    return this.floor.addFoam(x, z, amount, radius);
  }

  addPowder(x, z, kg, color = '#ffffff', radius = 0.05) {
    return this.floor.addPowder(x, z, kg, color, radius);
  }

  removeWater(x, z, radius, maxLiters = Infinity) {
    return this.floor.removeWater(x, z, radius, maxLiters);
  }

  depthAt(x, z) {
    return this.floor.depthAt(x, z);
  }

  wetnessAt(x, z) {
    return this.floor.wetnessAt(x, z);
  }

  totalLiters() {
    return this.floor.liters;
  }

  drip(point, litersPerSecond) {
    this.particles.drip(point, litersPerSecond);
  }

  squeegee(id, a, b) {
    this.floor.squeegee(id, a, b, this.tick);
  }

  createStream(kind, opts = {}) {
    return this.particles.createStream(kind, opts);
  }

  createHose(cfg, opts = {}) {
    const h = new Hose(this, cfg, { entities: this.entities, ...opts });
    this.hoses.push(h);
    return h;
  }

  fixedUpdate(dt, tick) {
    const t0 = performance.now();
    this.tick = tick;
    for (const h of this.hoses) h.fixedUpdate(dt);
    const t1 = performance.now();
    this.particles.step(dt);
    const t2 = performance.now();
    this.floor.step(dt, tick);
    const t3 = performance.now();
    const pr = this.stats.parts ?? (this.stats.parts = { hose: 0, particles: 0, floor: 0 });
    pr.hose += (t1 - t0 - pr.hose) * 0.05;
    pr.particles += (t2 - t1 - pr.particles) * 0.05;
    pr.floor += (t3 - t2 - pr.floor) * 0.05;
    this.time += dt;
    const ms = performance.now() - t0;
    this._msAcc += ms;
    this._msN++;
    this._msMax = Math.max(this._msMax, ms);
    if (this._msN >= 60) {
      this.stats.cpuMs = this._msAcc / this._msN;
      this.stats.cpuMsMax = this._msMax;
      this._msAcc = 0;
      this._msN = 0;
      this._msMax = 0;
    }
    this.stats.steps++;
  }

  update(dt, alpha) {
    this.alpha = alpha;
  }

  lateUpdate(dt) {
    const t0 = performance.now();
    for (const h of this.hoses) h.update(dt, this.alpha);
    this.particles.render(this.alpha);
    this.floor.frame(dt, this.engine.camera);
    this.stats.frameMs += (performance.now() - t0 - this.stats.frameMs) * 0.1;
  }

  setReflections(on) {
    this.quality.reflections = !!on;
    this.floor.reflection.enabled = !!on;
  }

  report() {
    return {
      cpuMsPerStep: +this.stats.cpuMs.toFixed(3),
      cpuMsPerStepMax: +this.stats.cpuMsMax.toFixed(3),
      cpuMsPerFrameRender: +this.stats.frameMs.toFixed(3),
      gpuSimPassesPerStep: this.floor.passCount,
      simRes: this.floor.res,
      rippleRes: this.floor.rippleRes,
      particles: this.particles.count,
      testsPerStep: this.particles.testsLast,
      raysPerStep: this.particles.raysLast,
      totalLiters: +this.floor.liters.toFixed(2),
      readbackMs: +this.floor.lastRead.toFixed(1),
      reflections: this.floor.reflection.enabled,
      split: Object.fromEntries(Object.entries(this.stats.parts ?? {}).map(([k, v]) => [k, +v.toFixed(3)])),
    };
  }

  dispose() {
    for (const h of this.hoses) h.dispose();
    this.floor.dispose();
    this.scene.remove(this.particles.root);
  }
}
