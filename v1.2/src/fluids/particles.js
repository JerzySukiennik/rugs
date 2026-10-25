// Rug Rush fluids: CPU particle pool for streams, drips and splashes with budgeted hit tests and instanced rendering.
import * as THREE from 'three';
import { R, GROUP, groups } from '../core/physics.js';
import { FIXED_DT } from '../core/engine.js';
import { floorBaseHeightAt } from '../world/layout.js';
import { TubeMesh, catmull } from './tube.js';
import { dropMaterial, foamMaterial, grainMaterial, spriteMaterial, gelTubeMaterial } from './particleMaterials.js';

export const KINDS = ['water', 'mist', 'foam', 'powder', 'gel'];
const KW = 0, KM = 1, KF = 2, KP = 3, KG = 4, KS = 5, KD = 6;
const VD = 0, VM = 1, VF = 2, VG = 3, VL = 4, VU = 5;
const FLY = 0, SET = 1;

export const STREAM_DEFAULTS = {
  water: { color: '#e4f1f7', rate: 0.25, speed: 4, spread: 0.012, size: 0.0045, pps: 240 },
  mist: { color: '#f2f7fa', rate: 0.012, speed: 7, spread: 0.3, size: 0.0009, pps: 480 },
  foam: { color: '#ffffff', rate: 1.6, speed: 3.2, spread: 0.09, size: 0.026, pps: 40 },
  powder: { color: '#eef1f4', rate: 0.03, speed: 0.7, spread: 0.45, size: 0.0011, pps: 200 },
  gel: { color: '#38a8e0', rate: 0.07, speed: 0.5, spread: 0.0, size: 0.0085, pps: 120 },
};

const DRAG = [0.04, 4.5, 0.45, 2.6, 0.0, 0.25, 3.2];
const GRAV = [1, 0.32, 1, 1, 1, 1, -0.04];
const JET_BREAK = 0.085;
const STREAM_DEFAULTS_COLOR = new THREE.Color('#e4f1f7');
const WHITE = new THREE.Color(1, 1, 1);

const _c = new THREE.Color();
const _v = new THREE.Vector3();
const _u = new THREE.Vector3();
const _w = new THREE.Vector3();
const _p0 = new THREE.Vector3();
const _p1 = new THREE.Vector3();

class InstGroup {
  constructor(base, material, max, layout) {
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index;
    g.setAttribute('position', base.attributes.position);
    if (base.attributes.normal) g.setAttribute('normal', base.attributes.normal);
    this.attrs = [];
    for (const [name, size] of layout) {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(max * size), size).setUsage(THREE.DynamicDrawUsage);
      g.setAttribute(name, a);
      this.attrs.push(a);
    }
    g.instanceCount = 0;
    this.geo = g;
    this.max = max;
    this.n = 0;
    this.mesh = new THREE.Mesh(g, material);
    this.mesh.frustumCulled = false;
    this.A = this.attrs[0].array;
    this.B = this.attrs[1].array;
    this.C = this.attrs[2].array;
  }

  begin() {
    this.n = 0;
  }

  push(x, y, z, s, b0, b1, b2, b3, r, g, b) {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.A[i * 4] = x; this.A[i * 4 + 1] = y; this.A[i * 4 + 2] = z; this.A[i * 4 + 3] = s;
    this.B[i * 4] = b0; this.B[i * 4 + 1] = b1; this.B[i * 4 + 2] = b2; this.B[i * 4 + 3] = b3;
    this.C[i * 3] = r; this.C[i * 3 + 1] = g; this.C[i * 3 + 2] = b;
  }

  end() {
    for (const a of this.attrs) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, Math.max(1, this.n) * a.itemSize);
      a.needsUpdate = true;
    }
    this.geo.instanceCount = this.n;
    this.mesh.visible = this.n > 0;
  }
}

export class Stream {
  constructor(sys, kind, opts = {}) {
    if (!(kind in STREAM_DEFAULTS)) throw new Error(`Unknown stream kind ${kind}`);
    const d = STREAM_DEFAULTS[kind];
    this.sys = sys;
    this.kind = kind;
    this.k = KINDS.indexOf(kind);
    this.color = new THREE.Color(opts.color ?? d.color);
    this.colorHex = '#' + this.color.getHexString();
    this.rate = opts.rate ?? d.rate;
    this.speed = opts.speed ?? d.speed;
    this.spread = opts.spread ?? d.spread;
    this.size = opts.size ?? d.size;
    this.pps = opts.pps ?? d.pps;
    this.productId = opts.productId ?? null;
    this.exclude = opts.exclude ?? null;
    this.dirt = opts.dirt ?? 0;
    this.soap = opts.soap ?? 0;
    this.active = true;
    this.accum = 0;
    this.lastTick = -10;
    this.lastIdx = -1;
    this.lastSer = -1;
    this.origin = new THREE.Vector3();
    this.dir = new THREE.Vector3(0, 0, -1);
    this.coil = null;
    this.emitted = 0;
  }

  emit(origin, dir, holderVelocity = null) {
    if (!this.active) return;
    this.sys.emitStream(this, origin, dir, holderVelocity);
  }

  dispose() {
    const i = this.sys.streams.indexOf(this);
    if (i >= 0) this.sys.streams.splice(i, 1);
  }
}

export class Particles {
  constructor(fluids, { max = 4096, testsPerStep = 192 } = {}) {
    this.fluids = fluids;
    this.max = max;
    this.testsPerStep = testsPerStep;
    const N = max;
    this.p = new Float32Array(N * 3);
    this.o = new Float32Array(N * 3);
    this.v = new Float32Array(N * 3);
    this.t = new Float32Array(N * 3);
    this.col = new Float32Array(N * 3);
    this.life = new Float32Array(N);
    this.maxLife = new Float32Array(N);
    this.size = new Float32Array(N);
    this.amount = new Float32Array(N);
    this.age = new Float32Array(N);
    this.settleT = new Float32Array(N);
    this.seed = new Float32Array(N);
    this.kind = new Int8Array(N);
    this.vis = new Int8Array(N);
    this.state = new Int8Array(N);
    this.bounce = new Int8Array(N);
    this.skip = new Int8Array(N);
    this.since = new Int16Array(N);
    this.st = new Array(N).fill(null);
    this.link = new Int32Array(N).fill(-1);
    this.linkSer = new Int32Array(N);
    this.ser = new Int32Array(N);
    this.mark = new Int32Array(N);
    this.prod = new Array(N).fill(null);
    this.free = new Int32Array(N);
    for (let i = 0; i < N; i++) this.free[i] = N - 1 - i;
    this.freeCount = N;
    this.alive = new Int32Array(N);
    this.aliveCount = 0;
    this.serial = 1;
    this.frameId = 1;
    this.streams = [];
    this.interval = 1;
    this.testsLast = 0;
    this.raysLast = 0;
    this.deposits = 0;
    this.ray = new R.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
    this.queryGroups = groups(GROUP.ALL, GROUP.ALL & ~(GROUP.PLAYER | GROUP.TRIGGER | GROUP.HELD));
    this.queryFlags = R.QueryFilterFlags.EXCLUDE_SENSORS;
    this.pts = new Float32Array(4096 * 3);
    this.rad = new Float32Array(4096);
    this.spts = new Float32Array(8192 * 3);
    this.srad = new Float32Array(8192);
    this.buildRender();
  }

  buildRender() {
    const scene = this.fluids.scene;
    const tex = this.fluids.textures;
    const L4 = [['iA', 4], ['iB', 4], ['iC', 3]];
    const quad = new THREE.BufferGeometry();
    quad.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
    quad.setIndex([0, 1, 2, 0, 2, 3]);
    this.drops = new InstGroup(new THREE.IcosahedronGeometry(1, 1), dropMaterial({ body: 0 }), this.max, L4);
    this.gelBlobs = new InstGroup(new THREE.IcosahedronGeometry(1, 1), dropMaterial({ body: 1, blur: 0.0 }), 512, L4);
    this.foams = new InstGroup(new THREE.IcosahedronGeometry(1, 3), foamMaterial(tex.bubble), 1024, L4);
    this.grains = new InstGroup(new THREE.OctahedronGeometry(1, 0), grainMaterial(), this.max, L4);
    this.sprites = new InstGroup(quad, spriteMaterial(), this.max, L4);
    this.jetMat = dropMaterial({ instanced: false, tint: 0xdfeef6 });
    this.jet = new TubeMesh(800, 10, this.jetMat);
    this.gelTube = new TubeMesh(2400, 8, gelTubeMaterial(), { colors: true });
    this.drops.mesh.renderOrder = 5;
    this.jet.mesh.renderOrder = 5;
    this.sprites.mesh.renderOrder = 8;
    this.root = new THREE.Group();
    this.root.name = 'fluidParticles';
    this.root.add(this.drops.mesh, this.gelBlobs.mesh, this.foams.mesh, this.grains.mesh, this.sprites.mesh, this.jet.mesh, this.gelTube.mesh);
    scene.add(this.root);
  }

  createStream(kind, opts) {
    const s = new Stream(this, kind, opts);
    this.streams.push(s);
    return s;
  }

  alloc() {
    if (this.freeCount <= 0) return -1;
    const i = this.free[--this.freeCount];
    this.alive[this.aliveCount++] = i;
    this.ser[i] = this.serial++;
    this.link[i] = -1;
    this.state[i] = FLY;
    this.bounce[i] = 0;
    this.skip[i] = 0;
    this.since[i] = Math.floor(Math.random() * 4);
    this.age[i] = 0;
    this.settleT[i] = 0;
    this.st[i] = null;
    this.seed[i] = Math.random();
    this.prod[i] = null;
    return i;
  }

  spawn(kind, vis, x, y, z, vx, vy, vz, size, amount, life, color) {
    const i = this.alloc();
    if (i < 0) return -1;
    const j = i * 3;
    this.p[j] = this.o[j] = this.t[j] = x;
    this.p[j + 1] = this.o[j + 1] = this.t[j + 1] = y;
    this.p[j + 2] = this.o[j + 2] = this.t[j + 2] = z;
    this.v[j] = vx; this.v[j + 1] = vy; this.v[j + 2] = vz;
    this.col[j] = color.r; this.col[j + 1] = color.g; this.col[j + 2] = color.b;
    this.kind[i] = kind;
    this.vis[i] = vis;
    this.size[i] = size;
    this.amount[i] = amount;
    this.life[i] = this.maxLife[i] = life;
    return i;
  }

  get count() {
    return this.aliveCount;
  }

  emitStream(s, origin, dir, hv) {
    const tick = this.fluids.tick;
    const dt = FIXED_DT;
    s.origin.copy(origin);
    s.dir.copy(dir).normalize();
    const cont = s.lastTick === tick - 1 || s.lastTick === tick;
    if (s.lastTick === tick) return;
    if (!cont) s.coil = null;
    s.accum += s.pps * dt;
    const n = Math.floor(s.accum);
    s.accum -= n;
    s.lastTick = tick;
    if (n <= 0) return;
    const amountPer = s.rate / s.pps;
    const d = s.dir;
    _u.set(1, 0, 0);
    if (Math.abs(d.x) > 0.9) _u.set(0, 1, 0);
    _u.crossVectors(d, _u).normalize();
    _w.crossVectors(d, _u);
    const hx = hv ? hv.x : 0, hy = hv ? hv.y : 0, hz = hv ? hv.z : 0;
    let prev = cont && s.lastIdx >= 0 && this.ser[s.lastIdx] === s.lastSer && this.life[s.lastIdx] > 0 ? s.lastIdx : -1;
    for (let k = 0; k < n; k++) {
      const th = s.k === KW ? 0 : s.spread * Math.sqrt(Math.random());
      const ph = Math.random() * Math.PI * 2;
      const tn = Math.tan(th);
      let ex = d.x + (_u.x * Math.cos(ph) + _w.x * Math.sin(ph)) * tn;
      let ey = d.y + (_u.y * Math.cos(ph) + _w.y * Math.sin(ph)) * tn;
      let ez = d.z + (_u.z * Math.cos(ph) + _w.z * Math.sin(ph)) * tn;
      const el = Math.hypot(ex, ey, ez);
      ex /= el; ey /= el; ez /= el;
      let sp = s.speed, size = s.size, life = 3, vis = VD, kind = s.k;
      if (s.k === KW) { sp *= 0.97 + Math.random() * 0.06; life = 3.5; }
      else if (s.k === KM) { sp *= 0.55 + Math.random() * 0.6; size = s.size * (0.6 + Math.random() * 0.9); life = 0.7 + Math.random() * 0.6; vis = VM; }
      else if (s.k === KF) { sp *= 0.8 + Math.random() * 0.4; size = s.size * (0.65 + Math.random() * 0.7); life = 4; vis = VF; }
      else if (s.k === KP) { sp *= 0.5 + Math.random() * 0.8; size = s.size * (0.6 + Math.random() * 0.9); life = 5; vis = VG; }
      else if (s.k === KG) { life = 6; vis = VL; }
      const vx = ex * sp + hx, vy = ey * sp + hy, vz = ez * sp + hz;
      const back = (n - 1 - k) / n;
      const x = origin.x + vx * dt * back, y = origin.y + vy * dt * back, z = origin.z + vz * dt * back;
      const i = this.spawn(kind, vis, x, y, z, vx, vy, vz, size, amountPer, life, s.color);
      if (i < 0) break;
      const j = i * 3;
      this.t[j] = origin.x; this.t[j + 1] = origin.y; this.t[j + 2] = origin.z;
      this.st[i] = s;
      this.prod[i] = s.productId;
      this.skip[i] = s.exclude ? 0 : 1;
      if (s.k === KW || s.k === KG) {
        if (prev >= 0) {
          this.link[i] = prev;
          this.linkSer[i] = this.ser[prev];
        }
        prev = i;
      }
      s.lastIdx = i;
      s.lastSer = this.ser[i];
      s.emitted += amountPer;
    }
  }

  drip(point, lps) {
    if (!(lps > 0)) return;
    const vol = Math.min(Math.max(lps / 18, 0.00005), 0.0012);
    const pr = (lps * FIXED_DT) / vol;
    let nDrops = Math.floor(pr);
    if (Math.random() < pr - nDrops) nDrops++;
    for (let k = 0; k < nDrops; k++) {
      const r = Math.cbrt((3 * vol * 0.001) / (4 * Math.PI));
      const i = this.spawn(KW, VD, point.x + (Math.random() - 0.5) * 0.004, point.y - 0.012, point.z + (Math.random() - 0.5) * 0.004, 0, -0.15, 0, r, vol, 4, STREAM_DEFAULTS_COLOR);
      if (i < 0) return;
      this.skip[i] = 3;
    }
  }

  spray(x, y, z, nx, ny, nz, speed, count, size, color = STREAM_DEFAULTS_COLOR, water = 0) {
    if (this.freeCount < this.max * 0.25) return 0;
    const each = count > 0 ? water / count : 0;
    for (let k = 0; k < count; k++) {
      const up = (0.4 + Math.random() * 0.9) * Math.min(speed, 4) * 0.32;
      const side = (0.25 + Math.random() * 0.7) * Math.min(speed, 4) * 0.22;
      const a = Math.random() * Math.PI * 2;
      _u.set(Math.cos(a), 0, Math.sin(a));
      _u.addScaledVector(_w.set(nx, ny, nz), -_u.dot(_w)).normalize();
      const vx = nx * up + _u.x * side, vy = ny * up + _u.y * side, vz = nz * up + _u.z * side;
      const s = size * (0.5 + Math.random() * 0.7);
      this.spawn(KS, VD, x + nx * 0.004, y + ny * 0.004, z + nz * 0.004, vx, vy, vz, s, each, 0.5 + Math.random() * 0.3, color);
    }
    return water;
  }

  dust(x, y, z, color, n = 1) {
    if (this.freeCount < this.max * 0.2) return;
    for (let k = 0; k < n; k++) {
      _c.copy(color).lerp(WHITE, 0.35);
      const i = this.spawn(KD, VU, x, y + 0.01, z, (Math.random() - 0.5) * 0.25, 0.05 + Math.random() * 0.15, (Math.random() - 0.5) * 0.25, 0.012, 0, 0.8 + Math.random() * 0.6, _c);
      if (i >= 0) this.skip[i] = 1;
    }
  }

  deposit(i, point, normal, receiver) {
    const cb = this.fluids.onDeposit;
    this.deposits++;
    if (!cb) return;
    cb({ kind: KINDS[this.kind[i]], productId: this.prod[i], amount: this.amount[i], point: point.clone(), normal: normal.clone(), receiver });
  }

  test(i, ex, ey, ez) {
    const j = i * 3;
    _p0.set(this.t[j], this.t[j + 1], this.t[j + 2]);
    _p1.set(ex, ey, ez);
    this.t[j] = ex; this.t[j + 1] = ey; this.t[j + 2] = ez;
    this.since[i] = 0;
    this.testsLast++;
    const dx = ex - _p0.x, dy = ey - _p0.y, dz = ez - _p0.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-5) return null;
    const ht = this.fluids.hitTest;
    if (ht && this.kind[i] <= KG) {
      const h = ht(_p0, _p1);
      if (h) return { point: h.point, normal: h.normal ?? _v.set(0, 1, 0), receiver: h.receiver ?? null, floor: false };
    }
    const ph = this.fluids.physics;
    if (!ph) return null;
    this.ray.origin.x = _p0.x; this.ray.origin.y = _p0.y; this.ray.origin.z = _p0.z;
    this.ray.dir.x = dx / len; this.ray.dir.y = dy / len; this.ray.dir.z = dz / len;
    const ex2 = this.st[i] ? this.st[i].exclude : null;
    this.raysLast++;
    const hit = ph.world.castRayAndGetNormal(this.ray, len, true, this.queryFlags, this.queryGroups, undefined, ex2 ?? undefined);
    if (!hit) return null;
    const toi = hit.timeOfImpact ?? hit.toi;
    const px = _p0.x + this.ray.dir.x * toi, py = _p0.y + this.ray.dir.y * toi, pz = _p0.z + this.ray.dir.z * toi;
    const n = hit.normal;
    const floor = n.y > 0.85 && py < floorBaseHeightAt(px, pz) + 0.02;
    return { point: new THREE.Vector3(px, py, pz), normal: new THREE.Vector3(n.x, n.y, n.z), receiver: null, floor };
  }

  impactFloor(i, x, y, z, speed) {
    const fl = this.fluids.floor;
    const k = this.kind[i];
    const amt = this.amount[i];
    const U = this.fluids.units;
    const depth = fl.depthAt(x, z);
    if (k === KW) {
      const st = this.st[i];
      const wetHit = depth > 0.0006;
      const prob = Math.min(1, 0.25 + speed * 0.12);
      let away = 0;
      if (Math.random() < prob) away = this.spray(x, y, z, 0, 1, 0, speed * (wetHit ? 1.15 : 0.9), wetHit ? 2 : 2 + (Math.random() < 0.5 ? 1 : 0), Math.max(0.0012, this.size[i] * 0.45), STREAM_DEFAULTS_COLOR, amt * (wetHit ? 0.06 : 0.18));
      fl.addWater(x, z, (amt - away) * U.water.floorPerUnit, { radius: st && st.size > 0.008 ? 0.12 : 0.05, dirt: st ? st.dirt : 0, soap: st ? st.soap : 0 });
      fl.addRipple(x, z, 0.0012 * Math.min(speed, 5) * Math.sqrt(Math.max(amt, 1e-5) / 0.001));
      return this.kill(i);
    }
    if (k === KS) {
      if (amt > 0) fl.addWater(x, z, amt, { radius: 0.03 });
      if (Math.random() < 0.3) fl.addRipple(x, z, 0.00025);
      return this.kill(i);
    }
    if (k === KM) {
      fl.addWater(x, z, amt * U.mist.floorPerUnit, { radius: 0.04 });
      return this.kill(i);
    }
    if (k === KF) {
      fl.addFoam(x, z, amt, Math.max(0.05, this.size[i] * 2.4));
      if (depth > 0.0006) fl.addRipple(x, z, 0.0006);
      return this.settle(i, x, y + this.size[i] * 0.3, z, fl.covers(x, z) ? 0.7 : 4);
    }
    if (k === KP) {
      const s = this.st[i];
      const hex = s ? s.colorHex : '#ffffff';
      if (Math.random() < 0.12) this.dust(x, y, z, _c.setRGB(this.col[i * 3], this.col[i * 3 + 1], this.col[i * 3 + 2]));
      if (fl.covers(x, z)) {
        fl.addPowder(x, z, amt, hex, 0.04);
        return this.kill(i);
      }
      return this.settle(i, x, y + this.size[i] * 0.4, z, 8 + Math.random() * 4);
    }
    if (k === KG) {
      fl.addWater(x, z, amt * U.gel.floorWaterPerUnit, { soap: U.gel.soap, radius: 0.06 });
      return this.settleGel(i, x, y, z);
    }
    if (k === KD) return;
    return this.kill(i);
  }

  impactSurface(i, h, speed) {
    const k = this.kind[i];
    const j = i * 3;
    const p = h.point, n = h.normal;
    if (h.receiver) {
      this.deposit(i, p, n, h.receiver);
      if (k === KW) {
        if (Math.random() < 0.6) this.spray(p.x, p.y, p.z, n.x, n.y, n.z, speed * 0.7, 1 + (Math.random() < 0.4 ? 1 : 0), Math.max(0.0012, this.size[i] * 0.4));
        return this.kill(i);
      }
      if (k === KF) return this.settle(i, p.x + n.x * this.size[i] * 0.3, p.y + n.y * this.size[i] * 0.3, p.z + n.z * this.size[i] * 0.3, 1.6);
      if (k === KG) return this.settleGel(i, p.x, p.y, p.z, true);
      if (k === KP && Math.random() < 0.15) this.dust(p.x, p.y, p.z, _c.setRGB(this.col[j], this.col[j + 1], this.col[j + 2]));
      return this.kill(i);
    }
    if (h.floor) return this.impactFloor(i, p.x, p.y, p.z, speed);
    if (k === KF || k === KG) {
      this.amount[i] = 0;
      return this.settle(i, p.x + n.x * this.size[i] * 0.3, p.y + n.y * this.size[i] * 0.3, p.z + n.z * this.size[i] * 0.3, 3.5);
    }
    if (k === KM) return this.kill(i);
    this.bounce[i]++;
    if (this.bounce[i] > 4) return this.kill(i);
    const vx = this.v[j], vy = this.v[j + 1], vz = this.v[j + 2];
    const vn = vx * n.x + vy * n.y + vz * n.z;
    const e = k === KP ? 0.3 : 0.12, fr = k === KP ? 0.6 : 0.55;
    this.v[j] = (vx - vn * n.x) * fr - vn * n.x * e;
    this.v[j + 1] = (vy - vn * n.y) * fr - vn * n.y * e;
    this.v[j + 2] = (vz - vn * n.z) * fr - vn * n.z * e;
    this.p[j] = p.x + n.x * 0.003; this.p[j + 1] = p.y + n.y * 0.003; this.p[j + 2] = p.z + n.z * 0.003;
    this.t[j] = this.p[j]; this.t[j + 1] = this.p[j + 1]; this.t[j + 2] = this.p[j + 2];
    if (k === KW && speed > 1 && Math.random() < 0.5) this.spray(p.x, p.y, p.z, n.x, n.y, n.z, speed * 0.6, 1, Math.max(0.0012, this.size[i] * 0.4));
    return true;
  }

  settle(i, x, y, z, life) {
    const j = i * 3;
    this.state[i] = SET;
    this.p[j] = this.o[j] = x; this.p[j + 1] = this.o[j + 1] = y; this.p[j + 2] = this.o[j + 2] = z;
    this.v[j] = this.v[j + 1] = this.v[j + 2] = 0;
    this.life[i] = this.maxLife[i] = life;
    this.settleT[i] = 0;
    return true;
  }

  settleGel(i, x, y, z, onReceiver = false) {
    const s = this.st[i];
    const time = this.fluids.time;
    let cx = x, cz = z, cy = y, hgt = 0;
    if (s) {
      const c = s.coil;
      if (c && time - c.last < 0.6 && Math.hypot(x - c.x, z - c.z) < 0.09) {
        c.phase += 0.95 + Math.random() * 0.25;
        c.n = Math.min(c.n + 1, 60);
        c.last = time;
        const rr = 0.013 + Math.min(c.n, 30) * 0.0002;
        cx = c.x + Math.cos(c.phase) * rr;
        cz = c.z + Math.sin(c.phase) * rr;
        cy = c.y;
        hgt = Math.min(0.004 + c.n * 0.0011, 0.04);
        c.x += (x - c.x) * 0.05;
        c.z += (z - c.z) * 0.05;
      } else {
        s.coil = { x, y, z, phase: Math.random() * 6.28, n: 0, last: time };
      }
    }
    return this.settle(i, cx, cy + this.size[i] * 0.8 + hgt, cz, onReceiver ? 2.2 : 2.6);
  }

  kill(i) {
    this.life[i] = 0;
    return false;
  }

  step(dt) {
    const N = this.aliveCount;
    const p = this.p, o = this.o, v = this.v;
    const g = -9.81;
    for (let a = 0; a < N; a++) {
      const i = this.alive[a];
      const j = i * 3;
      this.age[i] += dt;
      if (this.state[i] === SET) {
        o[j] = p[j]; o[j + 1] = p[j + 1]; o[j + 2] = p[j + 2];
        this.settleT[i] += dt;
        continue;
      }
      o[j] = p[j]; o[j + 1] = p[j + 1]; o[j + 2] = p[j + 2];
      const k = this.kind[i];
      const dr = Math.exp(-DRAG[k] * dt);
      v[j + 1] += g * GRAV[k] * dt;
      if (k === KP || k === KM || k === KD) {
        const turb = k === KP ? 0.9 : k === KM ? 0.5 : 0.35;
        v[j] += (Math.random() - 0.5) * turb * dt * 6;
        v[j + 2] += (Math.random() - 0.5) * turb * dt * 6;
      }
      v[j] *= dr; v[j + 1] *= dr; v[j + 2] *= dr;
      if (k === KW && this.st[i] && this.age[i] >= JET_BREAK && this.age[i] - dt < JET_BREAK) {
        const st = this.st[i];
        const s = (0.03 + (st ? st.spread : 0.01) * 1.5) * Math.hypot(v[j], v[j + 1], v[j + 2]);
        v[j] += (Math.random() - 0.5) * s; v[j + 1] += (Math.random() - 0.5) * s; v[j + 2] += (Math.random() - 0.5) * s;
        this.size[i] *= 1.25;
      }
      p[j] += v[j] * dt; p[j + 1] += v[j + 1] * dt; p[j + 2] += v[j + 2] * dt;
    }
    for (let it = 0; it < 2; it++) {
      for (let a = 0; a < N; a++) {
        const i = this.alive[a];
        if (this.kind[i] !== KG) continue;
        const l = this.link[i];
        if (l < 0 || this.ser[l] !== this.linkSer[i] || this.life[l] <= 0) continue;
        const s = this.st[i];
        const rest = s ? s.speed / s.pps : 0.005;
        const j = i * 3, q = l * 3;
        const dx = p[q] - p[j], dy = p[q + 1] - p[j + 1], dz = p[q + 2] - p[j + 2];
        const d = Math.hypot(dx, dy, dz);
        if (d > 0.35) { this.link[i] = -1; continue; }
        if (d <= rest) continue;
        const wi = this.state[i] === SET ? 0 : 1, wl = this.state[l] === SET ? 0 : 1;
        if (wi + wl === 0) continue;
        const c = ((d - rest) / d) * 0.22 / (wi + wl);
        p[j] += dx * c * wi; p[j + 1] += dy * c * wi; p[j + 2] += dz * c * wi;
        p[q] -= dx * c * wl; p[q + 1] -= dy * c * wl; p[q + 2] -= dz * c * wl;
      }
    }
    let testable = 0;
    const interval = this.interval;
    let budget = this.testsPerStep;
    this.testsLast = 0;
    this.raysLast = 0;
    let w = 0;
    for (let a = 0; a < N; a++) {
      const i = this.alive[a];
      const j = i * 3;
      let alive = true;
      this.life[i] -= dt;
      if (this.life[i] <= 0) alive = false;
      else if (this.state[i] === FLY) {
        const k = this.kind[i];
        const r = k === KF ? this.size[i] * 0.5 : this.size[i] * 0.4;
        const x = p[j], y = p[j + 1], z = p[j + 2];
        const fy = floorBaseHeightAt(x, z);
        const below = y - r < fy;
        if (y < -2) alive = false;
        else if (k === KD) {
          if (below) p[j + 1] = fy + r;
        } else {
          const visual = k === KS;
          const speed = Math.hypot(v[j], v[j + 1], v[j + 2]);
          if (!visual) testable++;
          if (this.skip[i] > 0) {
            this.skip[i]--;
            this.t[j] = x; this.t[j + 1] = y; this.t[j + 2] = z;
          }
          this.since[i]++;
          let ex = x, ey = y, ez = z;
          if (below) {
            const oy = o[j + 1];
            const sF = oy - y > 1e-6 ? Math.min(Math.max((oy - r - fy) / (oy - y), 0), 1) : 1;
            ex = o[j] + (x - o[j]) * sF;
            ey = fy + r;
            ez = o[j + 2] + (z - o[j + 2]) * sF;
          }
          let h = null;
          if (!visual && (below || (this.since[i] >= interval && budget > 0))) {
            if (!below) budget--;
            h = this.test(i, ex, ey, ez);
          }
          if (h) alive = this.impactSurface(i, h, speed);
          else if (below) alive = this.impactFloor(i, ex, ey - r, ez, speed);
        }
      } else if (this.kind[i] === KF || this.kind[i] === KG || this.kind[i] === KP) {
        if (this.kind[i] === KG && this.life[i] < 0.6) this.size[i] *= 0.97;
      }
      if (alive && this.life[i] > 0) this.alive[w++] = i;
      else {
        this.life[i] = 0;
        this.free[this.freeCount++] = i;
      }
    }
    this.aliveCount = w;
    this.interval = Math.max(1, Math.ceil(testable / Math.max(1, this.testsPerStep)));
    this.testable = testable;
  }

  render(alpha) {
    this.frameId++;
    const fid = this.frameId;
    const p = this.p, o = this.o, v = this.v;
    const tick = this.fluids.tick;
    this.jet.begin();
    this.gelTube.begin();
    for (const s of this.streams) {
      if (s.k !== KW && s.k !== KG) continue;
      let i = s.lastIdx;
      if (i < 0 || this.ser[i] !== s.lastSer || this.life[i] <= 0) continue;
      let n = 0;
      const pts = this.pts, rad = this.rad;
      const live = tick - s.lastTick <= 1;
      if (live && s.k === KW) {
        pts[0] = s.origin.x; pts[1] = s.origin.y; pts[2] = s.origin.z;
        rad[0] = s.size * 0.9;
        n = 1;
      }
      while (i >= 0 && n < 1200) {
        if (this.life[i] <= 0) break;
        if (s.k === KW && (this.age[i] >= JET_BREAK || this.state[i] !== FLY || this.kind[i] !== KW)) break;
        const j = i * 3;
        pts[n * 3] = o[j] + (p[j] - o[j]) * alpha;
        pts[n * 3 + 1] = o[j + 1] + (p[j + 1] - o[j + 1]) * alpha;
        pts[n * 3 + 2] = o[j + 2] + (p[j + 2] - o[j + 2]) * alpha;
        if (s.k === KW) {
          const f = this.age[i] / JET_BREAK;
          rad[n] = s.size * (1 - 0.22 * f * f) * (1 + 0.22 * Math.sin(this.ser[i] * 1.7) * f * f * f);
        } else {
          let rr = s.size;
          if (n > 0) {
            const q = (n - 1) * 3;
            const dd = Math.hypot(pts[n * 3] - pts[q], pts[n * 3 + 1] - pts[q + 1], pts[n * 3 + 2] - pts[q + 2]);
            const rest = s.speed / s.pps;
            rr = s.size * Math.sqrt(Math.min(1, rest / Math.max(dd, 1e-5)));
            rr = Math.max(rr, s.size * 0.28);
          }
          if (this.state[i] === SET) rr = this.size[i] * Math.min(1, this.life[i] / 0.6 + 0.2) * 1.15;
          rad[n] = rr;
        }
        this.mark[i] = fid;
        n++;
        const l = this.link[i];
        if (l < 0 || this.ser[l] !== this.linkSer[i]) break;
        i = l;
      }
      if (n < 2) {
        if (n === 1 && i >= 0) this.mark[i] = 0;
        continue;
      }
      if (s.k === KW) {
        for (let q = 0; q < n; q++) rad[q] *= 1.25;
        const m = catmull(pts, n, 2, this.spts, rad, this.srad);
        this.jet.chain(this.spts, m, this.srad);
      } else if (n <= 400) {
        const m = catmull(pts, n, 2, this.spts, rad, this.srad);
        this.gelTube.chain(this.spts, m, this.srad, s.color);
      } else this.gelTube.chain(pts, n, rad, s.color);
    }
    this.jet.end();
    this.gelTube.end();
    this.drops.begin();
    this.gelBlobs.begin();
    this.foams.begin();
    this.grains.begin();
    this.sprites.begin();
    const N = this.aliveCount;
    for (let a = 0; a < N; a++) {
      const i = this.alive[a];
      if (this.mark[i] === fid) continue;
      const j = i * 3;
      const x = o[j] + (p[j] - o[j]) * alpha, y = o[j + 1] + (p[j + 1] - o[j + 1]) * alpha, z = o[j + 2] + (p[j + 2] - o[j + 2]) * alpha;
      const cr = this.col[j], cg = this.col[j + 1], cb = this.col[j + 2];
      const lf = this.life[i] / this.maxLife[i];
      switch (this.vis[i]) {
        case VD: {
          const fade = this.kind[i] === KS ? Math.min(1, lf * 3) : 1;
          this.drops.push(x, y, z, this.size[i], v[j], v[j + 1], v[j + 2], 0.95 * fade, cr, cg, cb);
          break;
        }
        case VM: {
          const age = this.age[i];
          this.sprites.push(x, y, z, 0.004 + age * 0.045, cr * 1.3, cg * 1.3, cb * 1.35, 0.16 * Math.min(1, lf * 2.2) * Math.min(1, age * 12), 0, 0, 0);
          if ((this.ser[i] & 7) === 0) this.drops.push(x, y, z, this.size[i] * 1.4, v[j] * 0.4, v[j + 1] * 0.4, v[j + 2] * 0.4, 0.9, cr, cg, cb);
          break;
        }
        case VU: {
          const age = 1 - lf;
          const sz = 0.015 + age * 0.07;
          this.sprites.push(x, y, z, sz, cr, cg, cb, 0.22 * (1 - age) * (1 - age), 0, 0, 0);
          break;
        }
        case VF: {
          let sx = 1, sy = 1, sc = 1;
          if (this.state[i] === SET) {
            const t = Math.min(1, this.settleT[i] / 0.35);
            sx = 1 + 0.35 * t;
            sy = 1 - 0.55 * t;
            sc = Math.min(1, this.life[i] / 0.5);
          }
          this.foams.push(x, y, z, this.size[i] * sc, sx, sy, this.seed[i], 1, cr, cg, cb);
          break;
        }
        case VG: {
          const sc = this.state[i] === SET ? Math.min(1, this.life[i] / 1.5) : 1;
          this.grains.push(x, y, z, this.size[i] * 2.3 * sc, this.seed[i], this.seed[i] > 0.75 ? 1 : 0, 1, 0, cr, cg, cb);
          if (this.state[i] === FLY) this.sprites.push(x, y, z, 0.006 + this.age[i] * 0.012, cr, cg, cb, 0.07, 0, 0, 0);
          break;
        }
        case VL:
          this.gelBlobs.push(x, y, z, this.size[i] * 1.2, v[j], v[j + 1], v[j + 2], 1, cr, cg, cb);
          break;
        default:
          break;
      }
    }
    this.drops.end();
    this.gelBlobs.end();
    this.foams.end();
    this.grains.end();
    this.sprites.end();
  }
}
