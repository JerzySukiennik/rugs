// Rug Rush carpet entity: spiral roll body, cloth tail, rolling/unrolling, roller winding, render grid, raycasts and serialization.
import * as THREE from 'three';
import { CARPET_TYPES, carpetMass, carpetThickness } from '../data/carpetTypes.js';
import { floorBaseHeightAt } from '../world/layout.js';
import { R, GROUP, groups } from '../core/physics.js';
import { CarpetSurface } from '../surface/surface.js';
import { Cloth } from './cloth.js';
import { patternSpec, mulberry } from './patterns.js';
import { detailSet, shagTile } from './detail.js';
import { makeUniforms, baseMaterial, underMaterial, volumeMaterial, depositMaterial, filmMaterial, edgeMaterial } from './materials.js';
import { Fringe } from './fringe.js';
import { WrapFilm } from './wrap.js';

const TAU = Math.PI * 2;

export const LOOKS = {
  loop: { tile: 0.11, detail: 'carpet_loop', fb: 'loop', detailStr: 0.55, napK: 0.04, rough: 0.93, baseAO: 0.86, sheen: 0.12, sheenRough: 0.6, lean: 0.04, aoMin: 0.55, spec: 0.08, backKind: 0, backCol: [0.035, 0.035, 0.038], aniso: 0, specInt: 0.5, shells: 6, hLo: 0.34, hHi: 0.62 },
  cut: { tile: 0.16, detail: 'carpet_cut', fb: 'cut', detailStr: 0.75, napK: 0.5, rough: 0.9, baseAO: 0.62, sheen: 0.35, sheenRough: 0.45, lean: 0.16, aoMin: 0.42, spec: 0.22, backKind: 1, backCol: [0.3, 0.22, 0.13], aniso: 0, specInt: 0.6, shells: 10, hLo: 0.38, hHi: 0.7 },
  shag: { tile: 0.2, hTile: 0.24, detail: 'carpet_cut', fb: 'cut', detailStr: 0.3, napK: 0.55, rough: 0.82, baseAO: 0.3, sheen: 0.6, sheenRough: 0.5, lean: 0.22, aoMin: 0.13, spec: 0.32, backKind: 2, backCol: [0.62, 0.59, 0.53], aniso: 0, specInt: 0.6, shells: 28, hLo: 0.38, hHi: 0.7 },
  dense: { tile: 0.07, detail: 'carpet_cut', fb: 'cut', detailStr: 0.55, napK: 0.32, rough: 0.88, baseAO: 0.72, sheen: 0.3, sheenRough: 0.5, lean: 0.2, aoMin: 0.5, spec: 0.14, backKind: 3, backCol: [0.5, 0.45, 0.4], aniso: 0, specInt: 0.6, shells: 8, hLo: 0.38, hHi: 0.7 },
  silk: { tile: 0.05, detail: 'carpet_cut', fb: 'cut', detailStr: 0.3, napK: 0.5, rough: 0.36, baseAO: 0.92, sheen: 0.85, sheenRough: 0.3, lean: 0.3, aoMin: 0.62, spec: 0.9, backKind: 3, backCol: [0.5, 0.45, 0.4], aniso: 0.7, specInt: 0.75, shells: 6, hLo: 0.38, hHi: 0.7 },
  sisal: { tile: 0.15, detail: 'jute', fb: 'weave', detailStr: 0.5, napK: 0, rough: 0.86, baseAO: 1, sheen: 0, sheenRough: 0.6, lean: 0, aoMin: 1, spec: 0, backKind: 5, backCol: [0.36, 0.32, 0.26], aniso: 0, specInt: 0.4, shells: 0, hLo: 0.26, hHi: 0.71 },
  kilim: { tile: 0.09, detail: 'fabric_cotton', fb: 'weave', detailStr: 0.35, napK: 0, rough: 0.9, baseAO: 1, sheen: 0.15, sheenRough: 0.7, lean: 0, aoMin: 1, spec: 0, backKind: 4, backCol: [0.5, 0.45, 0.4], aniso: 0, specInt: 0.45, shells: 0, hLo: 0.11, hHi: 0.57 },
};

const FRINGES = {
  persian: { enabled: true, color: 0xe2d9c4, length: 0.075, spacing: 0.0045, radius: 0.0009, knotted: true },
  silk: { enabled: true, color: 0xf0e8d6, length: 0.065, spacing: 0.0036, radius: 0.0007, knotted: true },
  kilim: { enabled: true, color: 0xd9ccb0, length: 0.1, spacing: 0.0055, radius: 0.0011, knotted: true },
};

const PILE_KIND = { flat: 0, loop: 1, cut: 2, dense: 3, shag: 4 };
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();

function clamp(x, a, b) {
  return x < a ? a : x > b ? b : x;
}

function wrapPi(a) {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

function shareGeometry(src, instanced = false) {
  const g = instanced ? new THREE.InstancedBufferGeometry() : new THREE.BufferGeometry();
  g.setIndex(src.index);
  for (const k in src.attributes) g.setAttribute(k, src.attributes[k]);
  g.boundingSphere = src.boundingSphere;
  return g;
}

export class Carpet {
  constructor(sys, opts) {
    const type = opts.type ?? 'persian';
    const def = CARPET_TYPES[type];
    if (!def) throw new Error(`unknown carpet type ${type}`);
    this.sys = sys;
    this.engine = sys.engine;
    this.physics = sys.physics;
    this.id = opts.id;
    this.kind = 'carpet';
    this.type = type;
    this.typeDef = def;
    this.label = def.name;
    this.holdStyle = 'heavy';
    this.holdPose = null;
    this.width = opts.width ?? 2;
    this.length = opts.length ?? 3;
    this.seed = opts.seed ?? 1;
    this.surface = opts.surface ?? new CarpetSurface(this.width, this.length);
    this.ownSurface = !opts.surface;
    this.paintColor = opts.paintColor ?? '#3a6ea5';
    this.paintLinear = new THREE.Color(this.paintColor);
    this.onImpact = null;
    this.onUnrollStart = null;
    this.pileKind = PILE_KIND[def.pile.kind];
    const lookKey = LOOKS[type] ? type : def.pile.kind;
    const lk = LOOKS[lookKey];
    this.look = { ...lk, backCol: new THREE.Vector3(...lk.backCol) };
    this.pileMax = def.pile.height * (this.pileKind === 4 ? 1.35 : 1.1);
    this.pileTop = def.pile.height * (this.pileKind === 4 ? 1.12 : 1.0);
    this.thick = carpetThickness(type);
    this.r0 = 0.025;
    this.baseMass = carpetMass(type, { width: this.width, length: this.length });
    this.waterAvg = 0;
    this.mass = this.baseMass;
    this.spec = patternSpec(def.pattern, this.width, this.length, this.seed);
    this.seedOff = this.spec.seedOff;
    this.patternRT = sys.baker.bake(this.spec);
    this.targets = sys.compositor.createTargets(this.patternRT, this.surface);
    this.detail = detailSet(lk.detail, lk.fb);
    this.heightTex = this.pileKind === 4 ? shagTile() : this.detail.height;
    this.versions = new Int32Array(8).fill(-1);
    this.group = new THREE.Group();
    this.group.name = `carpet-${this.id}`;
    sys.root.add(this.group);
    this.rollGroup = new THREE.Group();
    this.group.add(this.rollGroup);
    this.buildGeometry();
    this.u = makeUniforms(this, sys.global);
    this.buildMeshes();
    const rnd = mulberry(this.seed * 31 + 7);
    this.fringe = new Fringe(this, FRINGES[type] ?? { enabled: false }, rnd);
    this.buildCloth();
    this.rollEdge = 'v0';
    this.sgnU = 1;
    this.rolledLen = 0;
    this.prevRolledLen = 0;
    this.phi0 = 0;
    this.body = null;
    this.collider = null;
    this.colliderR = 0;
    this.mode = 'none';
    this.wrapped = false;
    this.wrap = null;
    this.memory = 0;
    this.pendingPush = 0;
    this.lastPush = -1;
    this.roller = null;
    this.impact = 0;
    this.impactCooldown = 0;
    this.lastVel = new THREE.Vector3();
    this.springSpeed = 2.9;
    this.rollTicks = 0;
    this.held = false;
    this.unrolling = null;
    this.sleepCount = 0;
    this.asleep = false;
    this.shapes = [];
    this.pushers = [];
    this.handles = new Set();
    this.renderMoving = true;
    this.forceRender = 3;
    this.time = 0;
    this.scanTick = 0;
    this.depMax = 0;
    this.filmMax = 0;
    this.shrinkMax = 0;
    this.p0 = new THREE.Vector3();
    this.p1 = new THREE.Vector3();
    this.q0 = new THREE.Quaternion();
    this.q1 = new THREE.Quaternion();
    this.pose = { p: new THREE.Vector3(), ex: new THREE.Vector3(), ey: new THREE.Vector3(), ez: new THREE.Vector3() };
    this.stepMs = 0;
    this.stepMsAvg = 0;
    this.scanSurface();
    const pos = opts.position ? new THREE.Vector3().copy(opts.position) : new THREE.Vector3(0, 0, 0);
    const yaw = opts.yaw ?? 0;
    this.yaw = yaw;
    if ((opts.state ?? 'flat') === 'rolled') this.initRolled(pos, yaw, opts.wrapped);
    else this.initFlat(pos, yaw);
    if (opts.wrapped && this.rolledLen >= this.length - 1e-4) this.setWrapped(true);
  }

  get state() {
    if (this.rolledLen <= 1e-6) return 'flat';
    if (this.rolledLen >= this.length - 1e-4) return 'rolled';
    return 'mixed';
  }

  get rolledFraction() {
    return clamp(this.rolledLen / this.length, 0, 1);
  }

  get rollerProgress() {
    return this.roller ? clamp(this.rolledLen / this.length, 0, 1) : this.state === 'rolled' ? 1 : 0;
  }

  buildGeometry() {
    const w = this.width, L = this.length;
    const nu = clamp(Math.round(w / 0.06) + 1, 20, 48);
    const Rf = Math.sqrt(this.r0 * this.r0 + this.thick * L / Math.PI);
    const turns = (Rf - this.r0) / this.thick;
    const nv = clamp(Math.max(Math.round(L / 0.025) + 1, Math.round(turns * 34) + 1), 60, 420);
    this.nu = nu;
    this.nv = nv;
    const N = nu * nv;
    this.pos = new Float32Array(N * 3);
    this.nrm = new Float32Array(N * 3);
    this.tng = new Float32Array(N * 3);
    this.vtxShrink = new Float32Array(N);
    const uv = new Float32Array(N * 2);
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const k = j * nu + i;
      uv[k * 2] = i / (nu - 1);
      uv[k * 2 + 1] = j / (nv - 1);
    }
    const idx = new (N > 65535 ? Uint32Array : Uint16Array)((nu - 1) * (nv - 1) * 6);
    let o = 0;
    for (let j = 0; j < nv - 1; j++) for (let i = 0; i < nu - 1; i++) {
      const a = j * nu + i, b = a + 1, c = a + nu, d = c + 1;
      idx[o++] = a; idx[o++] = b; idx[o++] = c;
      idx[o++] = b; idx[o++] = d; idx[o++] = c;
    }
    const g = new THREE.BufferGeometry();
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nrm, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aTanU', new THREE.BufferAttribute(this.tng, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1);
    g.boundingBox = new THREE.Box3();
    this.geoTop = g;
    this.geoUnder = shareGeometry(g);
    this.geoFilm = shareGeometry(g);
    this.geoShell = shareGeometry(g);
    this.geoDep = shareGeometry(g);
    const per = 2 * nv + 2 * nu;
    this.edgeK = 5;
    this.edgePos = new Float32Array(per * this.edgeK * 3);
    this.edgeNrm = new Float32Array(per * this.edgeK * 3);
    this.edgeUv = new Float32Array(per * this.edgeK * 2);
    this.edgeAttr = new Float32Array(per * this.edgeK * 3);
    const eidx = [];
    const strips = [[0, nv], [nv, nv], [2 * nv, nu], [2 * nv + nu, nu]];
    for (const [start, cnt] of strips) for (let p = 0; p < cnt - 1; p++) for (let k = 0; k < this.edgeK - 1; k++) {
      const a = (start + p) * this.edgeK + k, b = a + 1, c = a + this.edgeK, d = c + 1;
      eidx.push(a, c, b, b, c, d);
    }
    const eg = new THREE.BufferGeometry();
    eg.setIndex(eidx);
    eg.setAttribute('position', new THREE.BufferAttribute(this.edgePos, 3).setUsage(THREE.DynamicDrawUsage));
    eg.setAttribute('normal', new THREE.BufferAttribute(this.edgeNrm, 3).setUsage(THREE.DynamicDrawUsage));
    eg.setAttribute('uv', new THREE.BufferAttribute(this.edgeUv, 2).setUsage(THREE.DynamicDrawUsage));
    eg.setAttribute('aEdge', new THREE.BufferAttribute(this.edgeAttr, 3).setUsage(THREE.DynamicDrawUsage));
    eg.boundingSphere = g.boundingSphere;
    this.geoEdge = eg;
    this.tileQ = 8;
    this.tilesU = Math.ceil((nu - 1) / this.tileQ);
    this.tilesV = Math.ceil((nv - 1) / this.tileQ);
    this.tileBox = new Float32Array(this.tilesU * this.tilesV * 6);
    this.top = new Float32Array(N * 3);
  }

  buildMeshes() {
    const g = this.group;
    this.matBase = baseMaterial(this, this.u);
    const type = this.type;
    this.matUnder = underMaterial(this, this.u);
    this.matUnder.shadowSide = THREE.DoubleSide;
    this.matShell = this.pileKind > 0 && type !== 'silk' ? volumeMaterial(this, this.u, this.sys.global) : null;
    this.matDep = depositMaterial(this, this.u);
    this.matFilm = filmMaterial(this, this.u, this.sys.global);
    this.matEdge = edgeMaterial(this, this.u);
    this.matEdge.side = THREE.DoubleSide;
    this.meshTop = new THREE.Mesh(this.geoTop, [this.matBase]);
    this.meshTop.receiveShadow = true;
    this.meshTop.castShadow = false;
    this.meshUnder = new THREE.Mesh(this.geoUnder, this.matUnder);
    this.meshUnder.castShadow = true;
    this.meshUnder.receiveShadow = true;
    this.meshEdge = new THREE.Mesh(this.geoEdge, this.matEdge);
    this.meshEdge.castShadow = true;
    this.meshEdge.receiveShadow = true;
    g.add(this.meshTop, this.meshUnder, this.meshEdge);
    if (this.matShell) {
      this.meshShell = new THREE.Mesh(this.geoShell, this.matShell);
      this.meshShell.receiveShadow = true;
      this.meshShell.renderOrder = 1;
      g.add(this.meshShell);
    }
    this.meshDep = new THREE.Mesh(this.geoDep, this.matDep);
    this.meshDep.receiveShadow = true;
    this.meshDep.renderOrder = 1;
    this.meshFilm = new THREE.Mesh(this.geoFilm, this.matFilm);
    this.meshFilm.receiveShadow = true;
    this.meshFilm.renderOrder = 2;
    g.add(this.meshDep, this.meshFilm);
    for (const m of [this.meshTop, this.meshUnder, this.meshEdge, this.meshShell, this.meshDep, this.meshFilm]) if (m) m.userData.carpet = this;
  }

  buildCloth() {
    const nx = clamp(Math.round(this.width / 0.115) + 1, 14, 30);
    const ny = clamp(Math.round(this.length / 0.115) + 1, 20, 40);
    const c = new Cloth(nx, ny, this.width, this.length);
    this.cloth = c;
    this.particleMass = this.baseMass / (nx * ny);
    this.applyClothParams();
    this.colW = new Float32Array(this.nu * 4);
    this.colI = new Int32Array(this.nu * 4);
    for (let i = 0; i < this.nu; i++) {
      const fc = (i / (this.nu - 1)) * (nx - 1);
      let c0 = Math.min(nx - 2, Math.floor(fc));
      const t = fc - c0;
      const t2 = t * t, t3 = t2 * t;
      const w = [-0.5 * t3 + t2 - 0.5 * t, 1.5 * t3 - 2.5 * t2 + 1, -1.5 * t3 + 2 * t2 + 0.5 * t, 0.5 * t3 - 0.5 * t2];
      for (let q = 0; q < 4; q++) {
        this.colW[i * 4 + q] = w[q];
        this.colI[i * 4 + q] = c0 - 1 + q;
      }
    }
    this.rowBuf = [];
    for (let j = 0; j <= ny; j++) this.rowBuf.push(new Float32Array(this.nu * 3));
    this.rowV = new Float32Array(ny + 1);
    this.rowRec = [];
    this.clothI = new Float32Array(nx * ny * 3);
    this.attachData = {
      cols: nx, points: new Float32Array(nx * 6), free: new Int32Array(nx), free2: new Int32Array(nx), rest: new Float32Array(nx),
      back: 0.06, backStiff: 0.45, bendStiff: 0.3,
    };
  }

  applyClothParams() {
    const bend = this.typeDef.bend;
    const wet = this.waterAvg;
    const c = this.cloth;
    c.compliance[2] = Math.pow(10, -6.6 + (1 - bend) * 2.6) * (1 + wet * 6);
    c.compliance[1] = 4e-7 * (1 + wet * 2);
    c.friction = this.roller ? 0.25 : 0.85;
    c.radius = 0.0025;
    c.selfThick = Math.max(0.008, this.thick * 1.8);
  }

  sOfRow(j) {
    const v = j / (this.cloth.ny - 1);
    return this.rollEdge === 'v0' ? v * this.length : (1 - v) * this.length;
  }

  sOfV(v) {
    return this.rollEdge === 'v0' ? v * this.length : (1 - v) * this.length;
  }

  theta(s) {
    const t = this.thick, r0 = this.r0;
    return (Math.sqrt(r0 * r0 + t * Math.max(0, s) / Math.PI) - r0) * TAU / t;
  }

  radiusAt(theta) {
    return this.r0 + this.thick * theta / TAU;
  }

  get rollRadius() {
    return this.radiusAt(this.theta(this.rolledLen));
  }

  setPoseFromBody(target) {
    const t = this.body.translation(), r = this.body.rotation();
    target.p.set(t.x, t.y, t.z);
    _q.set(r.x, r.y, r.z, r.w);
    target.ex.set(1, 0, 0).applyQuaternion(_q);
    target.ey.set(0, 1, 0).applyQuaternion(_q);
    target.ez.set(0, 0, 1).applyQuaternion(_q);
  }

  spiralWorld(u, s, pose, out, rl = this.rolledLen) {
    let sc = s, ext = 0;
    if (s > rl) { ext = s - rl; sc = rl; }
    const th = this.theta(sc);
    const r = this.radiusAt(th);
    const a = th + this.phi0;
    const ca = Math.cos(a), sa = Math.sin(a);
    const xl = this.sgnU * (u - 0.5) * this.width;
    let ly = r * ca, lz = r * sa;
    if (ext > 0) { ly -= sa * ext; lz += ca * ext; }
    out.x = pose.p.x + pose.ex.x * xl + pose.ey.x * ly + pose.ez.x * lz;
    out.y = pose.p.y + pose.ex.y * xl + pose.ey.y * ly + pose.ez.y * lz;
    out.z = pose.p.z + pose.ex.z * xl + pose.ey.z * ly + pose.ez.z * lz;
    return out;
  }

  initFlat(pos, yaw) {
    const c = this.cloth;
    const eu = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const ev = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    for (let j = 0; j < c.ny; j++) for (let i = 0; i < c.nx; i++) {
      const u = i / (c.nx - 1), v = j / (c.ny - 1);
      const x = pos.x + eu.x * (u - 0.5) * this.width + ev.x * (v - 0.5) * this.length;
      const z = pos.z + eu.z * (u - 0.5) * this.width + ev.z * (v - 0.5) * this.length;
      const y = pos.y > floorBaseHeightAt(x, z) + 0.05 ? pos.y : floorBaseHeightAt(x, z) + c.radius;
      c.place(j * c.nx + i, x, y, z);
    }
    c.active.fill(1);
    this.rolledLen = 0;
    this.prevRolledLen = 0;
    this.asleep = pos.y <= floorBaseHeightAt(pos.x, pos.z) + 0.05;
    this.attachUpdate();
  }

  initRolled(pos, yaw) {
    this.rollEdge = 'v0';
    this.sgnU = 1;
    this.rolledLen = this.length;
    this.prevRolledLen = this.length;
    const rnd = mulberry(this.seed * 13 + 5);
    const thE = this.theta(this.length);
    this.phi0 = -thE - (0.6 + rnd() * 1.6);
    this.cloth.active.fill(0);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    this.createBody(pos, q, 'dynamic');
    this.asleep = true;
  }

  createBody(pos, quat, mode) {
    const desc = (mode === 'dynamic' ? R.RigidBodyDesc.dynamic() : R.RigidBodyDesc.kinematicPositionBased())
      .setTranslation(pos.x, pos.y, pos.z)
      .setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w })
      .setLinearDamping(0.08)
      .setAngularDamping(0.55)
      .setCcdEnabled(true);
    this.body = this.physics.createBody(desc, [], this);
    this.mode = mode === 'dynamic' ? 'dynamic' : mode;
    this.rebuildCollider(true);
    this.p0.set(pos.x, pos.y, pos.z);
    this.p1.copy(this.p0);
    this.q0.copy(quat);
    this.q1.copy(quat);
  }

  rebuildCollider(force = false) {
    if (!this.body) return;
    const Rr = Math.max(this.rollRadius, this.r0 + this.thick);
    if (!force && Math.abs(Rr - this.colliderR) < 0.004 && this.collider) {
      this.updateMassOnly();
      return;
    }
    if (this.collider) this.physics.removeCollider(this.collider);
    const m = Math.max(0.4, this.mass * this.rolledFraction);
    const d = R.ColliderDesc.cylinder(this.width / 2, Rr)
      .setRotation({ x: 0, y: 0, z: -Math.SQRT1_2, w: Math.SQRT1_2 })
      .setMass(m)
      .setFriction(0.9)
      .setRestitution(0.05)
      .setCollisionGroups(groups(GROUP.CARPET, GROUP.ALL))
      .setActiveEvents(R.ActiveEvents.CONTACT_FORCE_EVENTS)
      .setContactForceEventThreshold(Math.max(40, m * 9.81 * 2));
    this.collider = this.physics.addCollider(d, this.body, this);
    this.colliderR = Rr;
    this.colliderMass = m;
  }

  updateMassOnly() {
    const m = Math.max(0.4, this.mass * this.rolledFraction);
    if (Math.abs(m - this.colliderMass) > 0.25) {
      this.collider.setMass(m);
      this.colliderMass = m;
    }
  }

  removeBody() {
    if (!this.body) return;
    this.physics.removeBody(this.body);
    this.body = null;
    this.collider = null;
    this.mode = 'none';
    this.wrap?.dispose();
    this.wrap = null;
    this.wrapped = false;
  }

  setBodyMode(mode) {
    if (!this.body || this.mode === mode) return;
    this.body.setBodyType(mode === 'dynamic' ? R.RigidBodyType.Dynamic : R.RigidBodyType.KinematicPositionBased, true);
    if (mode === 'dynamic') {
      this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
    this.mode = mode;
  }

  onContactForce(other, force) {
    if (force > this.impact) this.impact = force;
  }

  onGrab() {
    this.held = true;
  }

  onRelease() {
    this.held = false;
  }

  isHeld() {
    if (this.held) return true;
    if (!this.body || this.mode !== 'dynamic') return false;
    return this.body.angularDamping() > 1.5 || this.body.gravityScale() < 0.5;
  }

  axisWorld(out = new THREE.Vector3()) {
    const r = this.body.rotation();
    return out.set(1, 0, 0).applyQuaternion(_q.set(r.x, r.y, r.z, r.w));
  }

  setPoseNow(p, q) {
    this.body.setTranslation({ x: p.x, y: p.y, z: p.z }, true);
    this.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
    this.p0.copy(p);
    this.p1.copy(p);
    this.q0.copy(q);
    this.q1.copy(q);
  }

  flipSpiral() {
    if (!this.body || this.rolledLen < this.length - 1e-4) return false;
    const r = this.body.rotation();
    const q = new THREE.Quaternion(r.x, r.y, r.z, r.w);
    const ax = this.axisWorld(new THREE.Vector3());
    const pivot = Math.abs(ax.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const qf = new THREE.Quaternion().setFromAxisAngle(pivot, Math.PI).multiply(q);
    this.body.setRotation({ x: qf.x, y: qf.y, z: qf.z, w: qf.w }, true);
    this.q0.copy(qf);
    this.q1.copy(qf);
    this.forceRender = 2;
    return true;
  }

  alignForUnroll(m) {
    const ax = this.axisWorld(new THREE.Vector3());
    ax.y = 0;
    if (ax.lengthSq() < 1e-6) ax.set(1, 0, 0);
    ax.normalize();
    const up = new THREE.Vector3(0, 1, 0);
    m.y = 0;
    m.addScaledVector(ax, -m.dot(ax));
    if (m.lengthSq() < 1e-6) m.set(-ax.z, 0, ax.x);
    m.normalize();
    const A = new THREE.Vector3().crossVectors(up, m).normalize();
    const d = m.clone().negate();
    const gamma = this.theta(this.rolledLen) + this.phi0;
    const ey = up.clone().multiplyScalar(-Math.cos(gamma)).addScaledVector(d, -Math.sin(gamma));
    const ez = up.clone().multiplyScalar(-Math.sin(gamma)).addScaledVector(d, Math.cos(gamma));
    _m.makeBasis(A, ey, ez);
    const q = new THREE.Quaternion().setFromRotationMatrix(_m);
    const t = this.body.translation();
    const p = new THREE.Vector3(t.x, floorBaseHeightAt(t.x, t.z) + this.rollRadius + 0.002, t.z);
    this.setPoseNow(p, q);
    return m;
  }

  unroll(dir = { x: 0, y: 0, z: 1 }) {
    if (!this.body || this.wrapped || this.roller || this.rolledLen <= 0 || this.unrolling) return false;
    let m = new THREE.Vector3(dir.x, 0, dir.z);
    if (m.lengthSq() < 1e-8) m.set(0, 0, 1);
    m.normalize();
    if (this.state === 'rolled') {
      m = this.alignForUnroll(m);
    } else {
      const pose = this.pose;
      this.setPoseFromBody(pose);
      const pr = this.probe(pose);
      const tail = pr ? new THREE.Vector3().addScaledVector(pose.ey, pr.qy).addScaledVector(pose.ez, pr.qz) : m.clone().negate();
      tail.y = 0;
      const ax = pose.ex.clone();
      ax.y = 0;
      tail.addScaledVector(ax.normalize(), -tail.dot(ax));
      m = tail.lengthSq() > 1e-8 ? tail.normalize().negate() : m;
    }
    this.handMode = false;
    this.pendingPush = 0;
    this.memory = 0;
    this.unrolling = { m, R0: this.rollRadius, t: 0 };
    this.setBodyMode('kinematic');
    this.wake();
    return true;
  }

  unrollPre(dt) {
    const u = this.unrolling;
    u.t += dt;
    const Re = this.rollRadius;
    const speed = clamp(2.6 * (0.55 + 0.45 * Re / Math.max(u.R0, 1e-3)) * Math.min(1, 0.35 + u.t * 3), 0.8, 2.6);
    const ds = Math.min(speed * dt, this.rolledLen);
    const nl = this.rolledLen - ds;
    const pose = this.pose;
    this.setPoseFromBody(pose);
    if (nl < 0.06) {
      this.unrolling = null;
      this.finishUnroll(pose);
      return;
    }
    const t = this.body.translation(), r = this.body.rotation();
    const px = t.x + u.m.x * ds, pz = t.z + u.m.z * ds;
    const Rn = this.radiusAt(this.theta(nl));
    const p = new THREE.Vector3(px, floorBaseHeightAt(px, pz) + Rn + 0.002, pz);
    const q = new THREE.Quaternion().setFromAxisAngle(pose.ex, ds / Re).multiply(new THREE.Quaternion(r.x, r.y, r.z, r.w));
    this.body.setNextKinematicTranslation(p);
    this.body.setNextKinematicRotation(q);
    this.pendingLen = nl;
  }

  tensionUnspool() {
    const c = this.cloth;
    if (!c.attach || !c.handles.length || !this.body || this.mode !== 'dynamic' || this.wrapped || this.roller) return;
    const t = this.body.translation();
    let best = 0;
    for (const h of c.handles) {
      if (!h.target) continue;
      let px = 0, py = 0, pz = 0, ws = 0;
      for (let q = 0; q < h.idx.length; q++) {
        const k = h.idx[q] * 3, w = h.w[q];
        px += c.x[k] * w; py += c.x[k + 1] * w; pz += c.x[k + 2] * w; ws += w;
      }
      if (ws <= 0) continue;
      px /= ws; py /= ws; pz /= ws;
      const gx = h.target.x - px, gy = h.target.y - py, gz = h.target.z - pz;
      const ox = px - t.x, oz = pz - t.z;
      const ol = Math.hypot(ox, oz) || 1;
      const out = (gx * ox + gz * oz) / ol;
      const gap = Math.hypot(gx, gy, gz);
      if (out > 0.02 && gap > 0.05) best = Math.max(best, Math.min(gap - 0.05, out));
    }
    if (best <= 0) return;
    const dl = Math.min(best * 0.5, 0.045, this.rolledLen);
    const Re = this.rollRadius;
    const r = this.body.rotation();
    const ax = this.axisWorld(new THREE.Vector3());
    const q = new THREE.Quaternion().setFromAxisAngle(ax, dl / Re).multiply(new THREE.Quaternion(r.x, r.y, r.z, r.w));
    this.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
    this.q1.copy(q);
    const pose = this.pose;
    this.setPoseFromBody(pose);
    this.memory = 0;
    if (this.rolledLen - dl < 0.06) {
      this.finishUnroll(pose);
      return;
    }
    this.setRolledLen(this.rolledLen - dl, pose, false);
    this.attachUpdate(pose);
  }


  rowActiveFor(j, rl) {
    return !(rl > 1e-6 && this.sOfRow(j) < rl - 1e-6);
  }

  setRolledLen(nl, pose, vel = true) {
    nl = clamp(nl, 0, this.length);
    if (nl > this.length - 0.004) nl = this.length;
    const c = this.cloth;
    const old = this.rolledLen;
    this.rolledLen = nl;
    for (let j = 0; j < c.ny; j++) {
      const was = !!c.active[j * c.nx];
      const now = this.rowActiveFor(j, nl);
      if (was === now) continue;
      if (!now) { c.setRow(j, false); continue; }
      const s = this.sOfRow(j);
      for (let i = 0; i < c.nx; i++) {
        const u = i / (c.nx - 1);
        if (pose) this.spiralWorld(u, s, pose, _v, Math.min(old, s));
        else _v.set(c.x[(j * c.nx + i) * 3], c.x[(j * c.nx + i) * 3 + 1], c.x[(j * c.nx + i) * 3 + 2]);
        let vx = 0, vy = 0, vz = 0;
        if (vel && this.body && this.mode === 'dynamic') {
          this.physics.bodyVelocityAt(this.body, _v, _v2);
          vx = _v2.x; vy = _v2.y; vz = _v2.z;
        }
        c.place(j * c.nx + i, _v.x, _v.y, _v.z, vx, vy, vz);
        c.active[j * c.nx + i] = 1;
      }
    }
    if (nl !== old) this.wake();
  }

  attachUpdate(pose = null) {
    const c = this.cloth;
    if (this.rolledLen <= 1e-6 || !this.body) { c.attach = null; return; }
    const a = this.attachData;
    const rl = this.rolledLen;
    let jf = -1, jf2 = -1;
    if (this.rollEdge === 'v0') {
      for (let j = 0; j < c.ny; j++) if (c.active[j * c.nx]) { jf = j; jf2 = j + 1 < c.ny ? j + 1 : -1; break; }
    } else {
      for (let j = c.ny - 1; j >= 0; j--) if (c.active[j * c.nx]) { jf = j; jf2 = j - 1 >= 0 ? j - 1 : -1; break; }
    }
    if (jf < 0) { c.attach = null; return; }
    if (!pose) { pose = this.pose; this.setPoseFromBody(pose); }
    const back = Math.min(a.back, rl);
    a.back = 0.06;
    const restF = this.sOfRow(jf) - rl;
    for (let i = 0; i < c.nx; i++) {
      const u = i / (c.nx - 1);
      this.spiralWorld(u, rl, pose, _v);
      a.points[i * 3] = _v.x; a.points[i * 3 + 1] = _v.y; a.points[i * 3 + 2] = _v.z;
      this.spiralWorld(u, rl - back, pose, _v);
      a.points[(c.nx + i) * 3] = _v.x; a.points[(c.nx + i) * 3 + 1] = _v.y; a.points[(c.nx + i) * 3 + 2] = _v.z;
      a.free[i] = jf * c.nx + i;
      a.free2[i] = jf2 >= 0 ? jf2 * c.nx + i : -1;
      a.rest[i] = Math.max(0, restF);
    }
    a.back = back;
    c.attach = a;
  }

  wake() {
    if (this.asleep && this.sleepBox) this.sleepBox.ok = false;
    this.asleep = false;
    this.sleepCount = 0;
  }

  clothAabb(out) {
    const c = this.cloth;
    let minX = 1e9, minY = 1e9, minZ = 1e9, maxX = -1e9, maxY = -1e9, maxZ = -1e9, any = false;
    for (let i = 0; i < c.n; i++) {
      if (!c.active[i]) continue;
      any = true;
      const x = c.x[i * 3], y = c.x[i * 3 + 1], z = c.x[i * 3 + 2];
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    if (this.body) {
      const t = this.body.translation(), r = this.colliderR + 0.05, hw = this.width / 2 + r;
      minX = Math.min(minX, t.x - hw); maxX = Math.max(maxX, t.x + hw);
      minY = Math.min(minY, t.y - hw); maxY = Math.max(maxY, t.y + hw);
      minZ = Math.min(minZ, t.z - hw); maxZ = Math.max(maxZ, t.z + hw);
      any = true;
    }
    out.minX = minX; out.minY = minY; out.minZ = minZ; out.maxX = maxX; out.maxY = maxY; out.maxZ = maxZ;
    return any;
  }

  queryShapes(box) {
    const world = this.physics.world;
    const m = 0.12;
    const cx = (box.minX + box.maxX) / 2, cy = (box.minY + box.maxY) / 2, cz = (box.minZ + box.maxZ) / 2;
    const hx = (box.maxX - box.minX) / 2 + m, hy = (box.maxY - box.minY) / 2 + m, hz = (box.maxZ - box.minZ) / 2 + m;
    const out = [];
    let dynamicNear = false;
    const visit = (col) => {
      if (col.isSensor()) return true;
      if ((col.collisionGroups() >>> 16) & (GROUP.PLAYER | GROUP.RAGDOLL | GROUP.HELD)) return true;
      const parent = col.parent();
      if (parent && this.body && parent.handle === this.body.handle) return true;
      const st = col.shapeType();
      let type, r = 0, hh = 0, hx2 = 0, hy2 = 0, hz2 = 0, b;
      if (st === R.ShapeType.Ball) { type = 0; r = col.radius(); b = r; }
      else if (st === R.ShapeType.Capsule) { type = 1; r = col.radius(); hh = col.halfHeight(); b = hh + r; }
      else if (st === R.ShapeType.Cylinder || st === R.ShapeType.RoundCylinder) { type = 2; r = col.radius() + (col.roundRadius?.() ?? 0); hh = col.halfHeight(); b = Math.hypot(hh, r); }
      else if (st === R.ShapeType.Cuboid || st === R.ShapeType.RoundCuboid) {
        type = 3;
        const he = col.halfExtents();
        const rr = st === R.ShapeType.RoundCuboid ? col.roundRadius() : 0;
        hx2 = he.x + rr; hy2 = he.y + rr; hz2 = he.z + rr;
        b = Math.hypot(hx2, hy2, hz2);
      } else return true;
      const t = col.translation(), q = col.rotation();
      if (t.y + b < floorBaseHeightAt(t.x, t.z) + 0.006) return true;
      if (type === 3) {
        const x = q.x, y = q.y, z = q.z, w = q.w;
        const upY = Math.abs(1 - 2 * (x * x + z * z));
        if (upY > 0.999 && t.y + hy2 < floorBaseHeightAt(t.x, t.z) + 0.006) return true;
      }
      const x = q.x, y = q.y, z = q.z, w = q.w;
      const r00 = 1 - 2 * (y * y + z * z), r01 = 2 * (x * y - z * w), r02 = 2 * (x * z + y * w);
      const r10 = 2 * (x * y + z * w), r11 = 1 - 2 * (x * x + z * z), r12 = 2 * (y * z - x * w);
      const r20 = 2 * (x * z - y * w), r21 = 2 * (y * z + x * w), r22 = 1 - 2 * (x * x + y * y);
      let vx = 0, vy = 0, vz = 0;
      if (parent && !parent.isFixed()) {
        this.physics.bodyVelocityAt(parent, t, _v2);
        vx = _v2.x; vy = _v2.y; vz = _v2.z;
        if (parent.isDynamic() && !parent.isSleeping()) dynamicNear = true;
        if (parent.isKinematic()) dynamicNear = true;
      }
      const pad = b + 0.01;
      out.push({
        type, r, hh, hx: hx2, hy: hy2, hz: hz2, cx: t.x, cy: t.y, cz: t.z,
        m: [r00, r10, r20, r01, r11, r21, r02, r12, r22],
        minX: t.x - pad, maxX: t.x + pad, minY: t.y - pad, maxY: t.y + pad, minZ: t.z - pad, maxZ: t.z + pad,
        vx, vy, vz, thin: (type === 2 || type === 1 || type === 0) ? r < 0.12 : Math.min(hx2, hy2, hz2) < 0.06,
      });
      return true;
    };
    if (world.collidersWithAabbIntersectingAabb) world.collidersWithAabbIntersectingAabb({ x: cx, y: cy, z: cz }, { x: hx, y: hy, z: hz }, visit);
    else world.forEachCollider(visit);
    this.shapes = out;
    return dynamicNear;
  }

  probe(pose) {
    const c = this.cloth;
    const rl = this.rolledLen;
    let best = -1;
    const order = this.rollEdge === 'v0' ? [...Array(c.ny).keys()] : [...Array(c.ny).keys()].reverse();
    for (const j of order) {
      if (!c.active[j * c.nx]) continue;
      if (this.sOfRow(j) - rl >= 0.05) { best = j; break; }
    }
    if (best < 0) return null;
    let x = 0, y = 0, z = 0, n = 0;
    const i0 = Math.floor(c.nx * 0.25), i1 = Math.ceil(c.nx * 0.75);
    for (let i = i0; i < i1; i++) {
      const k = (best * c.nx + i) * 3;
      x += c.x[k]; y += c.x[k + 1]; z += c.x[k + 2]; n++;
    }
    const dx = x / n - pose.p.x, dy = y / n - pose.p.y, dz = z / n - pose.p.z;
    const qy = dx * pose.ey.x + dy * pose.ey.y + dz * pose.ey.z;
    const qz = dx * pose.ez.x + dy * pose.ez.y + dz * pose.ez.z;
    return { qy, qz, d: Math.hypot(qy, qz), psi: Math.atan2(qz, qy) };
  }

  unspool(pose, dt) {
    if (this.wrapped || this.roller || this.mode !== 'dynamic' || this.rolledLen <= 0) return;
    const pr = this.probe(pose);
    if (!pr) return;
    const Re = this.rollRadius;
    const gamma = this.theta(this.rolledLen) + this.phi0;
    if (pr.d > Re * 1.01) {
      const beta = pr.psi - Math.acos(clamp(Re / pr.d, -1, 1));
      const delta = wrapPi(gamma - beta);
      if (delta > 0.003 && delta < 2.5) {
        const dl = Math.min(delta * Re, 0.08);
        const nl = this.rolledLen - dl;
        if (nl < 0.06) { this.finishUnroll(pose); return; }
        this.setRolledLen(nl, pose);
        this.memory = Math.max(0, this.memory - dl);
        return;
      }
    }
    if (pr.d < Re + this.thick * 1.6 && !this.cloth.handles.length) {
      const ahead = wrapPi(pr.psi - gamma);
      if (ahead > 0.02 && ahead < 1.6) this.setRolledLen(this.rolledLen + Math.min(ahead * Re * 0.5, 0.05), pose);
    }
  }

  finishUnroll(pose) {
    this.unrolling = null;
    this.handMode = false;
    this.setRolledLen(0, pose, false);
    this.removeBody();
    this.cloth.attach = null;
    this.wake();
  }

  springOpen(speed) {
    const pose = this.pose;
    this.setPoseFromBody(pose);
    const stiff = 0.5 + this.typeDef.bend * 0.5;
    const extra = clamp(speed / this.springSpeed - 1, 0, 2);
    const len = clamp(0.16 + 0.1 * stiff + extra * 0.08, 0.14, Math.min(0.45, this.length * 0.3));
    this.setRolledLen(this.length - len, pose);
    const c = this.cloth;
    for (let i = 0; i < c.n; i++) {
      if (!c.active[i]) continue;
      const k = i * 3;
      const dx = c.x[k] - pose.p.x, dy = c.x[k + 1] - pose.p.y, dz = c.x[k + 2] - pose.p.z;
      const ax = pose.ex.x * dx + pose.ex.y * dy + pose.ex.z * dz;
      let rx = dx - pose.ex.x * ax, ry = dy - pose.ex.y * ax, rz = dz - pose.ex.z * ax;
      const rl = Math.hypot(rx, ry, rz) || 1;
      c.v[k] += rx / rl * 0.8; c.v[k + 1] += ry / rl * 0.8 + 0.3; c.v[k + 2] += rz / rl * 0.8;
    }
    this.memory = 0.3 + extra * 0.3 + (1 - this.typeDef.bend) * 0.2;
    this.attachUpdate(pose);
    this.wake();
    this.onUnrollStart?.();
  }

  handPose(nl) {
    const c = this.cloth;
    const sb = nl;
    const vb = this.rollEdge === 'v0' ? sb / this.length : 1 - sb / this.length;
    const fj = vb * (c.ny - 1);
    let j0 = clamp(Math.floor(fj), 0, c.ny - 2);
    const t = fj - j0;
    const rowPt = (i, out) => {
      const a = (j0 * c.nx + i) * 3, b = ((j0 + 1) * c.nx + i) * 3;
      return out.set(c.x[a] + (c.x[b] - c.x[a]) * t, c.x[a + 1] + (c.x[b + 1] - c.x[a + 1]) * t, c.x[a + 2] + (c.x[b + 2] - c.x[a + 2]) * t);
    };
    const first = rowPt(0, new THREE.Vector3());
    const last = rowPt(c.nx - 1, new THREE.Vector3());
    const contact = first.clone().add(last).multiplyScalar(0.5);
    const A = last.clone().sub(first).multiplyScalar(this.sgnU).normalize();
    const nb = this.rollEdge === 'v0' ? Math.min(c.ny - 1, j0 + 2) : Math.max(0, j0 - 1);
    const mid = Math.floor(c.nx / 2);
    const far = new THREE.Vector3(c.x[(nb * c.nx + mid) * 3], c.x[(nb * c.nx + mid) * 3 + 1], c.x[(nb * c.nx + mid) * 3 + 2]);
    const d = far.sub(contact);
    if (this.rollEdge === 'v1' && nb === j0) d.negate();
    d.addScaledVector(A, -d.dot(A));
    if (d.lengthSq() < 1e-8) d.set(0, 0, 1);
    d.normalize();
    const n = new THREE.Vector3().crossVectors(A, d).normalize();
    if (n.y < 0) n.negate();
    const gamma = this.theta(nl) + this.phi0;
    const Re = this.radiusAt(this.theta(nl));
    const ey = n.clone().multiplyScalar(-Math.cos(gamma)).addScaledVector(d, -Math.sin(gamma));
    const ez = n.clone().multiplyScalar(-Math.sin(gamma)).addScaledVector(d, Math.cos(gamma));
    const ex = new THREE.Vector3().crossVectors(ey, ez).normalize();
    _m.makeBasis(ex, ey, ez);
    const q = new THREE.Quaternion().setFromRotationMatrix(_m);
    const p = contact.addScaledVector(n, Re);
    return { p, q };
  }

  startRoll(edge = 'v0') {
    if (this.wrapped) return false;
    if (this.rolledLen > 0 && edge !== this.rollEdge) return false;
    if (this.roller) return false;
    if (this.rolledLen <= 0) {
      this.rollEdge = edge;
      this.sgnU = edge === 'v0' ? 1 : -1;
      this.phi0 = 0;
      const nl = Math.min(0.12, this.length);
      const { p, q } = this.handPose(nl);
      this.createBody(p, q, 'kinematic');
      const pose = this.pose;
      this.setPoseFromBody(pose);
      this.setRolledLen(nl, pose, false);
      this.attachUpdate(pose);
      this.prevRolledLen = nl;
    } else {
      this.setBodyMode('kinematic');
    }
    this.handMode = true;
    this.lastPush = this.time;
    this.wake();
    return true;
  }

  pushRoll(m) {
    if (!this.handMode) {
      if (this.rolledLen <= 0 || this.roller || this.wrapped) return;
      this.handMode = true;
      this.setBodyMode('kinematic');
    }
    this.pendingPush += m;
    this.lastPush = this.time;
    this.wake();
  }

  attachToRoller(roller) {
    if (this.wrapped) return false;
    this.roller = { ref: roller, phase: 'lead', t: 0, A: null };
    this.handMode = false;
    this.applyClothParams();
    if (this.state === 'rolled') {
      this.roller.phase = 'done';
      this.setBodyMode('kinematic');
      this.rollerAxis(roller);
    } else if (this.rolledLen > 0) {
      this.roller.phase = 'wind';
      this.setBodyMode('kinematic');
      this.rollerAxis(roller);
    } else {
      const ap = roller.axisPoint();
      const c = this.cloth;
      const e0 = this.rowCenter(0), e1 = this.rowCenter(c.ny - 1);
      this.rollEdge = e0.distanceTo(ap) <= e1.distanceTo(ap) ? 'v0' : 'v1';
      this.sgnU = this.rollEdge === 'v0' ? 1 : -1;
      const j = this.rollEdge === 'v0' ? 0 : c.ny - 1;
      const handles = [];
      for (let i = 0; i < c.nx; i++) handles.push({ idx: [j * c.nx + i], w: [1], target: new THREE.Vector3(), k: 0.12, maxStep: 2.5 });
      this.roller.leadHandles = handles;
      for (const h of handles) c.handles.push(h);
    }
    this.wake();
    return true;
  }

  rowCenter(j) {
    const c = this.cloth;
    let x = 0, y = 0, z = 0;
    for (let i = 0; i < c.nx; i++) { const k = (j * c.nx + i) * 3; x += c.x[k]; y += c.x[k + 1]; z += c.x[k + 2]; }
    return new THREE.Vector3(x / c.nx, y / c.nx, z / c.nx);
  }

  rollerAxis(roller) {
    const dir = roller.axisDir().clone().normalize();
    const c = this.cloth;
    const jEdge = this.rollEdge === 'v0' ? 0 : c.ny - 1;
    const jIn = this.rollEdge === 'v0' ? Math.min(c.ny - 1, 4) : Math.max(0, c.ny - 5);
    const d = this.rowCenter(jIn).sub(this.rowCenter(jEdge));
    const up = new THREE.Vector3(0, 1, 0);
    const A = new THREE.Vector3().crossVectors(d, up);
    if (A.lengthSq() < 1e-8 || A.dot(dir) >= 0) this.roller.A = dir;
    else this.roller.A = dir.clone().negate();
    const ax = this.roller.A;
    const e1 = up.clone().addScaledVector(ax, -up.dot(ax));
    if (e1.lengthSq() < 1e-6) e1.set(1, 0, 0).addScaledVector(ax, -ax.x);
    e1.normalize();
    this.roller.e1 = e1;
    this.roller.e2 = new THREE.Vector3().crossVectors(ax, e1);
  }

  releaseFromRoller() {
    if (!this.roller) return;
    for (const h of this.roller.leadHandles ?? []) this.removeHandle(h);
    this.roller = null;
    this.applyClothParams();
    if (this.body) this.setBodyMode('dynamic');
    this.wake();
  }

  removeHandle(h) {
    const arr = this.cloth.handles;
    const i = arr.indexOf(h);
    if (i >= 0) arr.splice(i, 1);
  }

  rollerPose(roller) {
    const r = this.roller;
    const ap = roller.axisPoint();
    const ax = r.A, e1 = r.e1, e2 = r.e2;
    const Re = this.rollRadius;
    const gl = this.theta(this.rolledLen) + this.phi0;
    let beta = r.beta ?? -Math.PI / 2;
    const c = this.cloth;
    let pj = -1;
    const order = this.rollEdge === 'v0' ? [...Array(c.ny).keys()] : [...Array(c.ny).keys()].reverse();
    for (const j of order) if (c.active[j * c.nx] && this.sOfRow(j) - this.rolledLen > 0.04) { pj = j; break; }
    if (pj >= 0) {
      const q = this.rowCenter(pj).sub(ap);
      const qa = q.dot(e1), qb = q.dot(e2);
      const d = Math.hypot(qa, qb);
      if (d > Re * 1.02) {
        const nb = Math.atan2(qb, qa) - Math.acos(clamp(Re / d, -1, 1));
        beta = r.beta === undefined ? nb : r.beta + wrapPi(nb - r.beta) * 0.25;
      }
    }
    r.beta = beta;
    const ab = beta - gl;
    const ey = e1.clone().multiplyScalar(Math.cos(ab)).addScaledVector(e2, Math.sin(ab));
    const ez = e1.clone().multiplyScalar(-Math.sin(ab)).addScaledVector(e2, Math.cos(ab));
    _m.makeBasis(ax, ey, ez);
    return { p: ap.clone(), q: new THREE.Quaternion().setFromRotationMatrix(_m) };
  }

  setWrapped(on, tex = null) {
    if (on) {
      if (this.state !== 'rolled' || !this.body) return false;
      this.wrap?.dispose();
      this.wrap = new WrapFilm(this.rollGroup, this.width, this.rollRadius, this.r0, tex);
      this.wrapped = true;
      this.forceRender = 2;
      return true;
    }
    this.wrap?.dispose();
    this.wrap = null;
    this.wrapped = false;
    return true;
  }

  setLabelTexture(tex) {
    this.fringe.setLabelTexture(tex);
  }

  setPaintColor(hex) {
    this.paintColor = hex;
    this.paintLinear.set(hex);
    this.versions.fill(-1);
  }

  grabAt(hit) {
    if (!hit) return null;
    const c = this.cloth;
    const u = hit.uv?.u ?? 0.5, v = hit.uv?.v ?? 0.5;
    const sv = this.sOfV(v);
    const onRoll = this.body && (hit.part === 'roll' || (this.rolledLen > 0 && sv < this.rolledLen));
    if (onRoll || (hit.part === 'label' && this.state === 'rolled')) {
      const t = this.body.translation(), r = this.body.rotation();
      _q.set(r.x, r.y, r.z, r.w).invert();
      const lp = new THREE.Vector3().copy(hit.point).sub(_v.set(t.x, t.y, t.z)).applyQuaternion(_q);
      return { kind: 'body', body: this.body, localPoint: lp };
    }
    const fu = clamp(u, 0, 1) * (c.nx - 1), fv = clamp(v, 0, 1) * (c.ny - 1);
    const i0 = Math.min(c.nx - 2, Math.floor(fu)), j0 = Math.min(c.ny - 2, Math.floor(fv));
    const tu = fu - i0, tv = fv - j0;
    const idx = [], w = [];
    const cand = [[i0, j0, (1 - tu) * (1 - tv)], [i0 + 1, j0, tu * (1 - tv)], [i0, j0 + 1, (1 - tu) * tv], [i0 + 1, j0 + 1, tu * tv]];
    for (const [i, j, ww] of cand) if (c.active[j * c.nx + i] && ww > 0.01) { idx.push(j * c.nx + i); w.push(ww); }
    if (!idx.length) return null;
    const h = { idx, w, target: null, k: 0.3, maxStep: 7, tether: 0.7 };
    c.handles.push(h);
    this.handles.add(h);
    this.wake();
    const self = this;
    return {
      kind: 'cloth',
      setTarget(p, stiffness = 0.3) {
        if (!h.target) h.target = new THREE.Vector3();
        h.target.copy(p);
        h.k = clamp(stiffness, 0.01, 1) / (1 + self.waterAvg * 1.5);
        self.wake();
      },
      point(out = new THREE.Vector3()) {
        let x = 0, y = 0, z = 0, s = 0;
        for (let q = 0; q < h.idx.length; q++) {
          const k = h.idx[q] * 3;
          x += c.x[k] * h.w[q]; y += c.x[k + 1] * h.w[q]; z += c.x[k + 2] * h.w[q]; s += h.w[q];
        }
        return out.set(x / s, y / s, z / s);
      },
      release() {
        self.removeHandle(h);
        self.handles.delete(h);
        self.wake();
      },
    };
  }

  scanSurface() {
    const d = this.surface.data;
    const N = this.surface.N;
    const ly = d.layer, d0 = d.dirt0, d2 = d.dirt2, dm = d.damage;
    let water = 0, dep = 0, film = 0, shrink = 0;
    for (let i = 0; i < N; i++) {
      const k = i * 4;
      water += ly[k];
      const dd = Math.max(ly[k + 1], ly[k + 3], d0[k + 2], d2[k], d2[k + 1], d2[k + 2] * 0.5);
      if (dd > dep) dep = dd;
      const ff = Math.max(ly[k] > 198 ? ly[k] : 0, ly[k + 2]);
      if (ff > film) film = ff;
      if (dm[k + 2] > shrink) shrink = dm[k + 2];
    }
    const wa = water / (N * 255);
    const changed = Math.abs(wa - this.waterAvg) > 0.01;
    this.waterAvg = wa;
    this.mass = this.baseMass + wa * this.width * this.length * 1.5;
    this.depMax = dep / 255;
    this.filmMax = film / 255;
    const sh = shrink / 255;
    if (sh !== this.shrinkMax || sh > 0) this.sampleShrink();
    this.shrinkMax = sh;
    if (changed) {
      this.applyClothParams();
      this.particleMass = this.mass / this.cloth.n;
      if (this.body) this.rebuildCollider();
    }
  }

  sampleShrink() {
    const s = this.surface, dm = s.data.damage;
    for (let j = 0; j < this.nv; j++) for (let i = 0; i < this.nu; i++) {
      const x = Math.min(s.W - 1, Math.floor((i / (this.nu - 1)) * s.W)), y = Math.min(s.H - 1, Math.floor((j / (this.nv - 1)) * s.H));
      this.vtxShrink[j * this.nu + i] = dm[(y * s.W + x) * 4 + 2] / 255;
    }
  }

  preStep(dt) {
    this.time += dt;
    this.prevRolledLen = this.rolledLen;
    if (this.impactCooldown > 0) this.impactCooldown -= dt;
    const onFloor = this.body ? this.body.translation().y - this.colliderR < floorBaseHeightAt(this.body.translation().x, this.body.translation().z) + 0.03 : false;
    if (this.body && this.cloth.attach && this.mode === 'dynamic' && (!onFloor || this.cloth.handles.length)) {
      const r = this.cloth.reaction;
      const h = dt / this.cloth.substeps;
      const k = (this.particleMass / (h * h)) * dt * 0.7;
      let ix = r[0] * k, iy = r[1] * k, iz = r[2] * k;
      const il = Math.hypot(ix, iy, iz), cap = this.colliderMass * 0.08;
      if (il > cap) { ix *= cap / il; iy *= cap / il; iz *= cap / il; }
      if (il > 1e-5) {
        const a = this.cloth.attach.points, mid = Math.floor(this.cloth.nx / 2) * 3;
        this.body.applyImpulseAtPoint({ x: ix, y: iy, z: iz }, { x: a[mid], y: a[mid + 1], z: a[mid + 2] }, true);
      }
    }
    if (this.body && this.mode === 'dynamic') {
      const t = this.body.translation();
      if (t.y - this.colliderR < floorBaseHeightAt(t.x, t.z) + 0.03) {
        const r = this.body.rotation();
        _v.set(1, 0, 0).applyQuaternion(_q.set(r.x, r.y, r.z, r.w));
        const av = this.body.angvel();
        const w = av.x * _v.x + av.y * _v.y + av.z * _v.z;
        const I = 0.5 * this.colliderMass * this.colliderR * this.colliderR + this.colliderMass * this.colliderR * this.colliderR;
        const lim = (this.state === 'mixed' && w > 0 ? 0.022 : 0.06) * this.colliderMass * 9.81 * this.colliderR * dt;
        const j = -Math.sign(w) * Math.min(lim, Math.abs(w) * I * 0.95);
        if (Math.abs(w) > 0.004 && !this.body.isSleeping() && this.memory <= 0.02) {
          if (Math.abs(w) < 0.12 && Math.abs(w) * I < lim) {
            this.body.setAngvel({ x: av.x - _v.x * w, y: av.y - _v.y * w, z: av.z - _v.z * w }, false);
            const lv = this.body.linvel();
            if (Math.hypot(lv.x, lv.z) < 0.02) this.body.setLinvel({ x: 0, y: lv.y, z: 0 }, false);
          } else this.body.applyTorqueImpulse({ x: _v.x * j, y: _v.y * j, z: _v.z * j }, false);
        }
      }
    }
    if (this.memory > 0) this.memory = Math.max(0, this.memory - dt * 0.04);
    if (this.body && this.mode === 'dynamic' && this.memory > 0.02 && this.state === 'mixed') {
      const t = this.body.translation();
      const Re = this.colliderR;
      if (t.y - Re < floorBaseHeightAt(t.x, t.z) + 0.04) {
        const r = this.body.rotation();
        _v.set(1, 0, 0).applyQuaternion(_q.set(r.x, r.y, r.z, r.w));
        const av = this.body.angvel();
        const w = av.x * _v.x + av.y * _v.y + av.z * _v.z;
        if (w < 2.5) {
          const tau = 0.09 * this.colliderMass * 9.81 * Re * dt * (0.6 + this.typeDef.bend) * Math.min(1, this.memory / 0.25);
          this.body.applyTorqueImpulse({ x: _v.x * tau, y: _v.y * tau, z: _v.z * tau }, true);
        }
      }
    }
    if (this.handMode && this.body && this.pendingPush < 0) {
      const pose = this.pose;
      this.setPoseFromBody(pose);
      const pr = this.probe(pose);
      const dl = Math.min(-this.pendingPush, this.rolledLen);
      this.pendingPush = 0;
      if (this.rolledLen - dl < 0.05) {
        this.finishUnroll(pose);
        this.handMode = false;
      } else {
        const Re = this.rollRadius;
        const tail = pr ? new THREE.Vector3().addScaledVector(pose.ey, pr.qy).addScaledVector(pose.ez, pr.qz) : new THREE.Vector3(0, 0, 1);
        tail.addScaledVector(pose.ex, -tail.dot(pose.ex));
        tail.y = 0;
        if (tail.lengthSq() < 1e-8) tail.set(0, 0, 1);
        tail.normalize();
        const t = this.body.translation(), r = this.body.rotation();
        const p = new THREE.Vector3(t.x, t.y, t.z).addScaledVector(tail, -dl);
        const q = new THREE.Quaternion().setFromAxisAngle(pose.ex, dl / Re).multiply(new THREE.Quaternion(r.x, r.y, r.z, r.w));
        this.body.setNextKinematicTranslation(p);
        this.body.setNextKinematicRotation(q);
        this.pendingLen = this.rolledLen - dl;
        this.unrollFree = true;
      }
    }
    if (this.handMode && this.body) {
      if (this.pendingPush !== 0) {
        const nl = clamp(this.rolledLen + this.pendingPush, 0, this.length);
        this.pendingPush = 0;
        if (nl < 0.05) {
          const pose = this.pose;
          this.setPoseFromBody(pose);
          this.finishUnroll(pose);
          this.handMode = false;
        } else {
          const { p, q } = this.handPose(nl >= this.length - 0.004 ? this.length : nl);
          this.body.setNextKinematicTranslation(p);
          this.body.setNextKinematicRotation(q);
          this.pendingLen = nl;
        }
      } else if (this.time - this.lastPush > 0.3 && this.pendingLen === undefined) {
        this.handMode = false;
        this.setBodyMode('dynamic');
        if (this.state === 'mixed') this.memory = Math.max(this.memory, 0.06 + (1 - this.typeDef.bend) * 0.12);
        this.wake();
      }
    }
    if (this.roller) this.rollerPre(dt);
    if (this.unrolling && this.body) this.unrollPre(dt);
  }

  rollerPre(dt) {
    const r = this.roller;
    const roller = r.ref;
    const c = this.cloth;
    r.t += dt;
    if (r.phase === 'lead') {
      const ap = roller.axisPoint(), dir = roller.axisDir().clone().normalize();
      let maxD = 0;
      for (const h of r.leadHandles) {
        const k = h.idx[0] * 3;
        _v.set(c.x[k], c.x[k + 1], c.x[k + 2]);
        const foot = ap.clone().addScaledVector(dir, _v.clone().sub(ap).dot(dir));
        const off = _v.clone().sub(foot);
        const dl = off.length();
        if (dl > maxD) maxD = dl;
        off.multiplyScalar(dl > 1e-6 ? (this.r0 + 0.006) / dl : 0);
        h.target.copy(foot).add(off);
      }
      if (maxD < this.r0 + 0.05 || r.t > 1.6) {
        for (const h of r.leadHandles) this.removeHandle(h);
        r.leadHandles = [];
        this.rollerAxis(roller);
        this.phi0 = 0;
        r.phase = 'wind';
        const pose0 = this.rollerPose(roller);
        this.createBody(pose0.p, pose0.q, 'kinematic');
        const pose = this.pose;
        this.setPoseFromBody(pose);
        this.setRolledLen(0.0001, pose, false);
        this.attachUpdate(pose);
      }
      return;
    }
    if (!this.body) return;
    if (r.phase === 'wind') {
      const nl = Math.min(this.length, this.rolledLen + Math.max(0, roller.feedSpeed ?? 0.3) * dt);
      this.pendingLen = nl;
      const keep = this.rolledLen;
      this.rolledLen = nl;
      const { p, q } = this.rollerPose(roller);
      this.rolledLen = keep;
      this.body.setNextKinematicTranslation(p);
      this.body.setNextKinematicRotation(q);
      if (nl >= this.length) r.phase = 'done';
    } else if (r.phase === 'done') {
      const ap = roller.axisPoint();
      this.body.setNextKinematicTranslation(ap);
    }
  }

  postStep(dt, box) {
    const t0 = performance.now();
    if (this.body) {
      const t = this.body.translation(), r = this.body.rotation();
      this.p0.copy(this.p1);
      this.q0.copy(this.q1);
      this.p1.set(t.x, t.y, t.z);
      this.q1.set(r.x, r.y, r.z, r.w);
    }
    const pose = this.pose;
    if (this.body) this.setPoseFromBody(pose);
    if (this.pendingLen !== undefined && this.body) {
      this.setRolledLen(this.pendingLen, pose, false);
      this.pendingLen = undefined;
      this.unrollFree = false;
    }
    if (this.body && this.mode === 'dynamic' && !this.roller) {
      const lv = this.body.linvel(), av = this.body.angvel();
      const hs = Math.hypot(lv.x, lv.z), lim = this.isHeld() ? 7 : 6;
      if (hs > lim || lv.y > 2.5) {
        const f = hs > lim ? lim / hs : 1;
        this.body.setLinvel({ x: lv.x * f, y: Math.min(lv.y, 2.5), z: lv.z * f }, true);
      }
      const as = Math.hypot(av.x, av.y, av.z), alim = 6 / Math.max(0.05, this.colliderR);
      if (as > alim) this.body.setAngvel({ x: av.x * alim / as, y: av.y * alim / as, z: av.z * alim / as }, true);
    }
    let dv = 0;
    if (this.body) {
      const lv = this.body.linvel();
      dv = Math.hypot(lv.x - this.lastVel.x, lv.y - this.lastVel.y, lv.z - this.lastVel.z);
      this.lastVel.set(lv.x, lv.y, lv.z);
    }
    if (this.impact > 0) {
      const f = this.impact;
      this.impact = 0;
      if (this.impactCooldown <= 0 && f > this.mass * 9.81 * 2.5) {
        this.onImpact?.(f);
        this.impactCooldown = 0.15;
      }
      this.lastImpact = { f, dv };
      if (dv > this.springSpeed && f > this.mass * 9.81 * 2 && !this.wrapped && this.state === 'rolled' && this.mode === 'dynamic' && !this.roller && !this.isHeld()) this.springOpen(dv);
    }
    if (this.body && this.mode === 'dynamic' && this.state === 'rolled' && !this.wrapped && !this.roller && !this.unrolling && !this.isHeld()) {
      const t = this.body.translation();
      const ax = this.axisWorld(_v2);
      const av = this.body.angvel(), lv = this.body.linvel();
      const w = av.x * ax.x + av.y * ax.y + av.z * ax.z;
      const onF = t.y - this.colliderR < floorBaseHeightAt(t.x, t.z) + 0.05 && Math.abs(ax.y) < 0.5;
      if (onF && Math.abs(w) * this.colliderR > 0.4 && Math.hypot(lv.x, lv.z) > 0.3) {
        if (++this.rollTicks > 5) {
          this.rollTicks = 0;
          if (w < 0) this.flipSpiral();
          this.springOpen(this.springSpeed * (1 + Math.min(1, Math.abs(w) * this.colliderR / 3)));
          this.memory = Math.max(this.memory, 0.5);
        }
      } else this.rollTicks = 0;
    }
    if (this.body && this.mode === 'dynamic') this.unspool(pose, dt);
    let bodyMoving = false;
    this.bodyMoving = false;
    if (this.body) {
      const lv = this.body.linvel(), av = this.body.angvel();
      bodyMoving = Math.abs(lv.x) + Math.abs(lv.y) + Math.abs(lv.z) > 0.004 || Math.abs(av.x) + Math.abs(av.y) + Math.abs(av.z) > 0.01 || this.mode !== 'dynamic';
      if (bodyMoving) this.wake();
      this.bodyMoving = bodyMoving && (Math.abs(lv.x) + Math.abs(lv.y) + Math.abs(lv.z) > 0.002 || Math.abs(av.x) + Math.abs(av.y) + Math.abs(av.z) > 0.02 || this.mode !== 'dynamic');
      this.rebuildCollider();
    }
    this.attachUpdate(pose);
    const hasFree = this.rolledLen < this.length - 1e-4;
    const sb = this.sleepBox ?? (this.sleepBox = { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0, ok: false });
    let haveBox = false;
    if (hasFree && this.asleep && sb.ok && !this.cloth.handles.length) {
      Object.assign(box, sb);
      haveBox = true;
      this.sleepTick = (this.sleepTick ?? 0) + 1;
      if (this.sleepTick % 12 === 0 && this.queryShapes(box)) this.wake();
    } else if (hasFree) {
      haveBox = this.clothAabb(box);
      if (haveBox) {
        Object.assign(sb, box);
        sb.ok = true;
        if (this.queryShapes(box)) this.wake();
      }
    }
    if (hasFree && haveBox) {
      this.pushers.length = 0;
      for (const p of this.sys.pushers) {
        if (p.maxX < box.minX || p.minX > box.maxX || p.maxY < box.minY || p.minY > box.maxY || p.maxZ < box.minZ || p.minZ > box.maxZ) continue;
        this.pushers.push(p);
        this.wake();
      }
      if (this.cloth.handles.length) this.wake();
      if (!this.asleep) {
        this.cloth.step(dt, { floor: floorBaseHeightAt, shapes: this.shapes, pushers: this.pushers });
        this.tensionUnspool();
        if (this.cloth.maxMove < 1e-4 && !this.cloth.handles.length && (!this.body || this.mode === 'dynamic')) {
          if (++this.sleepCount > 45) { this.asleep = true; this.cloth.freeze(); }
        } else this.sleepCount = 0;
        this.renderMoving = true;
      } else {
        this.cloth.prevStep.set(this.cloth.x);
      }
    }
    if (!hasFree && this.body && !bodyMoving && this.impact === 0) {
      if (++this.sleepCount > 20) this.asleep = true;
    }
    if (this.body && !this.asleep) this.renderMoving = true;
    this.stepMs = performance.now() - t0;
    this.stepMsAvg += (this.stepMs - this.stepMsAvg) * 0.05;
  }

  endVisible(e) {
    if (this.rolledLen <= 1e-6) return true;
    if (e === 0) return this.rollEdge !== 'v0';
    return this.rollEdge !== 'v1';
  }

  interpPose(alpha, out) {
    _v.lerpVectors(this.p0, this.p1, alpha);
    _q.slerpQuaternions(this.q0, this.q1, alpha);
    out.p.copy(_v);
    out.ex.set(1, 0, 0).applyQuaternion(_q);
    out.ey.set(0, 1, 0).applyQuaternion(_q);
    out.ez.set(0, 0, 1).applyQuaternion(_q);
    return out;
  }

  render(alpha, camera) {
    const still = this.asleep || (this.cloth.maxMove < 2e-5 && !this.bodyMoving && this.rolledLen === this.prevRolledLen && this.lastBuilt);
    const moving = this.forceRender > 0 || (!still && (this.renderMoving || !this.asleep));
    if (moving) {
      this.lastBuilt = true;
      if (this.forceRender > 0) this.forceRender--;
      this.buildFrame(alpha);
      this.renderMoving = !this.asleep;
    }
    this.fringe.update(this.sys.frameDt, this.forceRender > 0);
    this.updateLod(camera);
    this.updateComposite();
    if (this.body) {
      if (!this.rpose) this.rpose = { p: new THREE.Vector3(), ex: new THREE.Vector3(), ey: new THREE.Vector3(), ez: new THREE.Vector3() };
      _v.lerpVectors(this.p0, this.p1, alpha);
      _q.slerpQuaternions(this.q0, this.q1, alpha);
      this.rollGroup.position.copy(_v);
      this.rollGroup.quaternion.copy(_q);
    }
    this.u.uPileMax.value = this.pileMax;
    const loaded = this.detail.loaded;
    if (this.pileKind === 4) this.u.uHRemap.value.set(0, 1);
    else this.u.uHRemap.value.set(loaded ? this.look.hLo : 0.15, loaded ? this.look.hHi : 0.95);
  }

  updateComposite() {
    const t = this.surface.textures;
    let changed = false;
    let i = 0;
    for (const k in t) {
      if (t[k].version !== this.versions[i]) { this.versions[i] = t[k].version; changed = true; }
      i++;
    }
    if (changed) {
      this.sys.compositor.run(this);
      this.scanTick = 0;
    }
    if (changed || ++this.scanTick > 40) {
      this.scanTick = 0;
      this.scanSurface();
    }
  }

  updateLod(camera) {
    const bs = this.geoTop.boundingSphere;
    const d = Math.max(0.25, camera.position.distanceTo(bs.center) - bs.radius * 0.7);
    const q = this.sys.quality;
    const free = this.rolledLen < this.length - 1e-4;
    let volOn = false;
    if (this.meshShell) {
      volOn = free && d < 22 * q.volume && q.volume > 0;
      this.meshShell.visible = volOn;
      this.u.uMaxSteps.value = Math.round(clamp(48 * q.steps * clamp(2.5 / d, 0.35, 1), 8, 64));
      this.u.uMinSteps.value = this.pileKind === 4 ? 6 : 4;
    }
    const g = this.geoTop;
    g.clearGroups();
    const [fs, fc] = this.topFree ?? [0, 0];
    const [cs, cc] = this.topCore ?? [0, 0];
    if (fc > 0 && !volOn) g.addGroup(fs, fc, 0);
    if (cc > 0) g.addGroup(cs, cc, 0);
    this.meshDep.visible = free && this.depMax > 0.01 && d < 30;
    this.meshFilm.visible = free && this.filmMax > 0.02;
  }

  buildFrame(alpha) {
    const nu = this.nu, nv = this.nv, L = this.length;
    const pos = this.pos;
    const c = this.cloth;
    const rlI = this.prevRolledLen + (this.rolledLen - this.prevRolledLen) * alpha;
    const hasRoll = rlI > 1e-6 && this.body;
    const pose = this.rpose ?? (this.rpose = { p: new THREE.Vector3(), ex: new THREE.Vector3(), ey: new THREE.Vector3(), ez: new THREE.Vector3() });
    if (hasRoll) this.interpPose(alpha, pose);
    const ci = this.clothI;
    const ps = c.prevStep, cx = c.x;
    for (let k = 0; k < c.n * 3; k++) ci[k] = ps[k] + (cx[k] - ps[k]) * alpha;
    const rows = [];
    if (hasRoll && rlI < L - 1e-4) {
      const buf = this.rowBuf[0];
      for (let i = 0; i < nu; i++) {
        this.spiralWorld(i / (nu - 1), rlI, pose, _v, rlI);
        buf[i * 3] = _v.x; buf[i * 3 + 1] = _v.y; buf[i * 3 + 2] = _v.z;
      }
      const rr = this.rowRec[0] ?? (this.rowRec[0] = { v: 0, buf });
      rr.v = this.rollEdge === 'v0' ? rlI / L : 1 - rlI / L;
      rr.buf = buf;
      rows.push(rr);
    }
    let bi = 1;
    const nx = c.nx;
    const pad = this.padBuf ?? (this.padBuf = new Float32Array((nx + 3) * 3));
    const colI = this.colI, colW = this.colW;
    for (let j = 0; j < c.ny; j++) {
      if (!c.active[j * nx]) continue;
      const s = this.sOfRow(j);
      if (hasRoll && s <= rlI + 1e-5) continue;
      const buf = this.rowBuf[bi++];
      const base = j * nx * 3;
      for (let i = 0; i < nx * 3; i++) pad[i + 3] = ci[base + i];
      for (let k = 0; k < 3; k++) {
        pad[k] = 2 * pad[3 + k] - pad[6 + k];
        pad[(nx + 1) * 3 + k] = 2 * pad[nx * 3 + k] - pad[(nx - 1) * 3 + k];
        pad[(nx + 2) * 3 + k] = pad[(nx + 1) * 3 + k];
      }
      for (let i = 0; i < nu; i++) {
        const o4 = i * 4;
        const a = (colI[o4] + 1) * 3;
        const w0 = colW[o4], w1 = colW[o4 + 1], w2 = colW[o4 + 2], w3 = colW[o4 + 3];
        buf[i * 3] = pad[a] * w0 + pad[a + 3] * w1 + pad[a + 6] * w2 + pad[a + 9] * w3;
        buf[i * 3 + 1] = pad[a + 1] * w0 + pad[a + 4] * w1 + pad[a + 7] * w2 + pad[a + 10] * w3;
        buf[i * 3 + 2] = pad[a + 2] * w0 + pad[a + 5] * w1 + pad[a + 8] * w2 + pad[a + 11] * w3;
      }
      const rr = this.rowRec[bi - 1] ?? (this.rowRec[bi - 1] = { v: 0, buf });
      rr.v = j / (c.ny - 1);
      rr.buf = buf;
      rows.push(rr);
    }
    rows.sort((a, b) => a.v - b.v);
    const nr = rows.length;
    let k0 = 0;
    for (let j = 0; j < nv; j++) {
      const v = j / (nv - 1);
      const s = this.sOfV(v);
      const o = j * nu * 3;
      if (hasRoll && s <= rlI) {
        const th = this.theta(s);
        const r = this.radiusAt(th);
        const a = th + this.phi0;
        const ly = r * Math.cos(a), lz = r * Math.sin(a);
        const bx = pose.p.x + pose.ey.x * ly + pose.ez.x * lz;
        const by = pose.p.y + pose.ey.y * ly + pose.ez.y * lz;
        const bz = pose.p.z + pose.ey.z * ly + pose.ez.z * lz;
        for (let i = 0; i < nu; i++) {
          const xl = this.sgnU * (i / (nu - 1) - 0.5) * this.width;
          pos[o + i * 3] = bx + pose.ex.x * xl;
          pos[o + i * 3 + 1] = by + pose.ex.y * xl;
          pos[o + i * 3 + 2] = bz + pose.ex.z * xl;
        }
        continue;
      }
      if (nr === 0) continue;
      if (nr === 1) { pos.set(rows[0].buf, o); continue; }
      while (k0 < nr - 2 && rows[k0 + 1].v < v) k0++;
      while (k0 > 0 && rows[k0].v > v) k0--;
      const A = rows[k0], B = rows[k0 + 1];
      const h = Math.max(1e-6, B.v - A.v);
      const t = clamp((v - A.v) / h, 0, 1);
      const P = k0 > 0 ? rows[k0 - 1] : null, Q = k0 + 2 < nr ? rows[k0 + 2] : null;
      const t2 = t * t, t3 = t2 * t;
      const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
      const sA = P ? h / (B.v - P.v) : 1, sB = Q ? h / (Q.v - A.v) : 1;
      const ab = A.buf, bb = B.buf, pb = P ? P.buf : null, qb = Q ? Q.buf : null;
      for (let i = 0; i < nu * 3; i++) {
        const a = ab[i], b = bb[i];
        const ma = pb ? (b - pb[i]) * sA : (b - a);
        const mb = qb ? (qb[i] - a) * sB : (b - a);
        pos[o + i] = h00 * a + h10 * ma + h01 * b + h11 * mb;
      }
    }
    this.renderPushOut(rlI, hasRoll);
    this.computeNormals();
    if (this.shrinkMax > 0.004) {
      this.applyShrink();
      this.computeNormals();
    }
    this.updateRanges(rlI, hasRoll);
    this.updateEdges(rlI, hasRoll);
    this.updateBounds();
    const g = this.geoTop.attributes;
    g.position.needsUpdate = true;
    g.normal.needsUpdate = true;
    g.aTanU.needsUpdate = true;
    this.geoEdge.attributes.position.needsUpdate = true;
    this.geoEdge.attributes.normal.needsUpdate = true;
    this.geoEdge.attributes.uv.needsUpdate = true;
    this.geoEdge.attributes.aEdge.needsUpdate = true;
  }

  isRolledRow(j, rlI, hasRoll) {
    return hasRoll && this.sOfV(j / (this.nv - 1)) <= rlI;
  }

  renderPushOut(rlI, hasRoll) {
    const shapes = this.shapes;
    if (!shapes.length) return;
    const nu = this.nu, nv = this.nv, pos = this.pos, r = 0.002;
    for (const sh of shapes) {
      if (!sh.thin) continue;
      for (let j = 0; j < nv; j++) {
        if (this.isRolledRow(j, rlI, hasRoll)) continue;
        for (let i = 0; i < nu; i++) {
          const o = (j * nu + i) * 3;
          const X = pos[o], Y = pos[o + 1], Z = pos[o + 2];
          if (X < sh.minX || X > sh.maxX || Y < sh.minY || Y > sh.maxY || Z < sh.minZ || Z > sh.maxZ) continue;
          const m = sh.m;
          const ox = X - sh.cx, oy = Y - sh.cy, oz = Z - sh.cz;
          const lx = m[0] * ox + m[1] * oy + m[2] * oz, ly = m[3] * ox + m[4] * oy + m[5] * oz, lz = m[6] * ox + m[7] * oy + m[8] * oz;
          let d, gx, gy, gz;
          if (sh.type === 2) {
            const rl = Math.hypot(lx, lz);
            if (Math.abs(ly) > sh.hh) continue;
            d = rl - sh.r; gx = rl > 1e-9 ? lx / rl : 0; gy = 0; gz = rl > 1e-9 ? lz / rl : 1;
          } else if (sh.type === 1) {
            const cy = clamp(ly, -sh.hh, sh.hh);
            const qx = lx, qy = ly - cy, qz = lz;
            d = Math.hypot(qx, qy, qz);
            gx = qx / (d || 1); gy = qy / (d || 1); gz = qz / (d || 1);
            d -= sh.r;
          } else if (sh.type === 0) {
            d = Math.hypot(lx, ly, lz);
            gx = lx / (d || 1); gy = ly / (d || 1); gz = lz / (d || 1);
            d -= sh.r;
          } else {
            const qx = Math.abs(lx) - sh.hx, qy = Math.abs(ly) - sh.hy, qz = Math.abs(lz) - sh.hz;
            if (qx > 0 || qy > 0 || qz > 0) continue;
            if (qx > qy && qx > qz) { d = qx; gx = Math.sign(lx); gy = 0; gz = 0; }
            else if (qy > qz) { d = qy; gx = 0; gy = Math.sign(ly); gz = 0; }
            else { d = qz; gx = 0; gy = 0; gz = Math.sign(lz); }
          }
          if (d >= r) continue;
          const push = r - d;
          pos[o] += (m[0] * gx + m[3] * gy + m[6] * gz) * push;
          pos[o + 1] += (m[1] * gx + m[4] * gy + m[7] * gz) * push;
          pos[o + 2] += (m[2] * gx + m[5] * gy + m[8] * gz) * push;
        }
      }
    }
  }

  computeNormals() {
    const nu = this.nu, nv = this.nv, P = this.pos, N = this.nrm, T = this.tng;
    for (let j = 0; j < nv; j++) {
      const jm = j > 0 ? j - 1 : j, jp = j < nv - 1 ? j + 1 : j;
      for (let i = 0; i < nu; i++) {
        const im = i > 0 ? i - 1 : i, ip = i < nu - 1 ? i + 1 : i;
        const a = (j * nu + ip) * 3, b = (j * nu + im) * 3, c = (jp * nu + i) * 3, d = (jm * nu + i) * 3;
        const ux = P[a] - P[b], uy = P[a + 1] - P[b + 1], uz = P[a + 2] - P[b + 2];
        const vx = P[c] - P[d], vy = P[c + 1] - P[d + 1], vz = P[c + 2] - P[d + 2];
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        const ul = Math.sqrt(ux * ux + uy * uy + uz * uz) || 1;
        const o = (j * nu + i) * 3;
        N[o] = nx / nl; N[o + 1] = ny / nl; N[o + 2] = nz / nl;
        T[o] = ux / ul; T[o + 1] = uy / ul; T[o + 2] = uz / ul;
      }
    }
  }

  applyShrink() {
    const nu = this.nu, nv = this.nv, P = this.pos, N = this.nrm, T = this.tng, S = this.vtxShrink;
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const k = j * nu + i;
      const s = S[k];
      if (s <= 0.002) continue;
      const u = i / (nu - 1), v = j / (nv - 1);
      const o = k * 3;
      const wr = Math.sin(u * 61.3 + v * 17.1) * Math.sin(v * 47.7 - u * 23.4) * 0.6 + Math.sin(u * 131 + v * 97) * 0.4;
      const h = s * 0.0045 * wr;
      P[o] += N[o] * h; P[o + 1] += N[o + 1] * h; P[o + 2] += N[o + 2] * h;
      const eu = Math.max(0, 1 - Math.min(u, 1 - u) / 0.12), ev = Math.max(0, 1 - Math.min(v, 1 - v) / 0.12);
      const pullU = (u < 0.5 ? 1 : -1) * eu * s * 0.02, pullV = (v < 0.5 ? 1 : -1) * ev * s * 0.02;
      const bx = N[o + 1] * T[o + 2] - N[o + 2] * T[o + 1], by = N[o + 2] * T[o] - N[o] * T[o + 2], bz = N[o] * T[o + 1] - N[o + 1] * T[o];
      P[o] += T[o] * pullU + bx * pullV; P[o + 1] += T[o + 1] * pullU + by * pullV; P[o + 2] += T[o + 2] * pullU + bz * pullV;
    }
  }

  updateRanges(rlI, hasRoll) {
    const nu = this.nu, nv = this.nv, L = this.length;
    const qr = (nu - 1) * 6;
    const nq = nv - 1;
    let f0 = 0, f1 = nq;
    let u0 = 0, u1 = nq;
    let c0 = 0, c1 = 0;
    if (hasRoll) {
      const Re = this.radiusAt(this.theta(rlI));
      const turn = Math.ceil((TAU * Re * 1.15) / L * nq) + 1;
      const core = Math.ceil((TAU * (this.r0 + this.thick) * 1.3) / L * nq) + 1;
      const jb = (rlI / L) * nq;
      if (this.rollEdge === 'v0') {
        f0 = clamp(Math.floor(jb) - 1, 0, nq); f1 = nq;
        u0 = clamp(Math.floor(jb) - turn, 0, nq); u1 = nq;
        c0 = 0; c1 = Math.min(core, f0);
      } else {
        const je = nq - jb;
        f0 = 0; f1 = clamp(Math.ceil(je) + 1, 0, nq);
        u0 = 0; u1 = clamp(Math.ceil(je) + turn, 0, nq);
        c0 = Math.max(nq - core, f1); c1 = nq;
      }
    }
    const fs = f0 * qr, fc = Math.max(0, f1 - f0) * qr;
    this.topFree = [fs, fc];
    this.topCore = c1 > c0 ? [c0 * qr, (c1 - c0) * qr] : [0, 0];
    this.geoUnder.setDrawRange(u0 * qr, Math.max(0, u1 - u0) * qr);
    this.geoShell.setDrawRange(fs, fc);
    this.geoDep.setDrawRange(fs, fc);
    this.geoFilm.setDrawRange(fs, fc);
    this.freeRange = [f0, f1];
  }

  updateEdges(rlI, hasRoll) {
    const nu = this.nu, nv = this.nv, P = this.pos, N = this.nrm, T = this.tng;
    const K = this.edgeK;
    const EP = this.edgePos, EN = this.edgeNrm, EU = this.edgeUv, EA = this.edgeAttr;
    if (!this.edgeCs) {
      this.edgeCs = new Float32Array(K);
      this.edgeSn = new Float32Array(K);
      for (let k = 0; k < K; k++) {
        const ph = -Math.PI / 2 + (k / (K - 1)) * Math.PI;
        this.edgeCs[k] = Math.cos(ph);
        this.edgeSn[k] = Math.sin(ph);
      }
    }
    const CS = this.edgeCs, SN = this.edgeSn;
    const free = this.typeDef.backing + Math.min(this.pileTop * 0.85, 0.011);
    const roll = this.thick;
    const L = this.length, W = this.width;
    let o = 0;
    const put = (vi, ox, oy, oz, hgt, along, u, v) => {
      const pb = vi * 3;
      const bulge = Math.min(hgt * 0.5, 0.0045);
      const px = P[pb], py = P[pb + 1], pz = P[pb + 2], nx = N[pb], ny = N[pb + 1], nz = N[pb + 2];
      for (let k = 0; k < K; k++) {
        const cp = CS[k], sp = SN[k];
        const hh = hgt * 0.5 * (1 + sp);
        const bc = bulge * cp;
        const w = o * 3;
        EP[w] = px + ox * bc + nx * hh;
        EP[w + 1] = py + oy * bc + ny * hh;
        EP[w + 2] = pz + oz * bc + nz * hh;
        EN[w] = ox * cp + nx * sp; EN[w + 1] = oy * cp + ny * sp; EN[w + 2] = oz * cp + nz * sp;
        EU[o * 2] = u; EU[o * 2 + 1] = v;
        EA[w] = along; EA[w + 1] = k / (K - 1); EA[w + 2] = 0.55 + 0.45 * cp;
        o++;
      }
    };
    const v0Rolled = hasRoll && this.rollEdge === 'v0', v1Rolled = hasRoll && this.rollEdge === 'v1';
    const vb = rlI / L;
    for (let side = 0; side < 2; side++) {
      const i = side === 0 ? 0 : nu - 1;
      const sg = side === 0 ? -1 : 1;
      for (let j = 0; j < nv; j++) {
        const vi = j * nu + i, t3 = vi * 3;
        const v = j / (nv - 1);
        const rolled = (v0Rolled && v <= vb) || (v1Rolled && 1 - v <= vb);
        put(vi, T[t3] * sg, T[t3 + 1] * sg, T[t3 + 2] * sg, rolled ? roll : free, v * L, side === 0 ? 0.002 : 0.998, v);
      }
    }
    for (let end = 0; end < 2; end++) {
      const j = end === 0 ? 0 : nv - 1;
      const jn = end === 0 ? 1 : nv - 2;
      const v = j / (nv - 1);
      const rolled = (v0Rolled && v <= vb) || (v1Rolled && 1 - v <= vb);
      for (let i = 0; i < nu; i++) {
        const vi = j * nu + i, vn = (jn * nu + i) * 3;
        let dx = P[vi * 3] - P[vn], dy = P[vi * 3 + 1] - P[vn + 1], dz = P[vi * 3 + 2] - P[vn + 2];
        const dl = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
        put(vi, dx / dl, dy / dl, dz / dl, rolled ? roll : free, (i / (nu - 1)) * W, i / (nu - 1), end === 0 ? 0.002 : 0.998);
      }
    }
  }

  updateBounds() {
    const P = this.pos;
    let minX = 1e9, minY = 1e9, minZ = 1e9, maxX = -1e9, maxY = -1e9, maxZ = -1e9;
    const n = this.nu * this.nv;
    for (let i = 0; i < n; i++) {
      const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    const m = this.pileMax + 0.06 + this.typeDef.backing;
    const bb = this.geoTop.boundingBox;
    bb.min.set(minX - m, minY - m, minZ - m);
    bb.max.set(maxX + m, maxY + m, maxZ + m);
    bb.getBoundingSphere(this.geoTop.boundingSphere);
    this.buildTiles();
  }

  buildTiles() {
    const nu = this.nu, nv = this.nv, P = this.pos, N = this.nrm, TP = this.top;
    const off = this.typeDef.backing + this.typeDef.pile.height * 0.7;
    for (let k = 0; k < nu * nv; k++) {
      TP[k * 3] = P[k * 3] + N[k * 3] * off;
      TP[k * 3 + 1] = P[k * 3 + 1] + N[k * 3 + 1] * off;
      TP[k * 3 + 2] = P[k * 3 + 2] + N[k * 3 + 2] * off;
    }
    const tq = this.tileQ, tb = this.tileBox;
    for (let ty = 0; ty < this.tilesV; ty++) for (let tx = 0; tx < this.tilesU; tx++) {
      let minX = 1e9, minY = 1e9, minZ = 1e9, maxX = -1e9, maxY = -1e9, maxZ = -1e9;
      const j1 = Math.min(nv - 1, (ty + 1) * tq), i1 = Math.min(nu - 1, (tx + 1) * tq);
      for (let j = ty * tq; j <= j1; j++) for (let i = tx * tq; i <= i1; i++) {
        const k = (j * nu + i) * 3;
        const x = TP[k], y = TP[k + 1], z = TP[k + 2];
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
      }
      const o = (ty * this.tilesU + tx) * 6;
      tb[o] = minX - 0.002; tb[o + 1] = minY - 0.002; tb[o + 2] = minZ - 0.002; tb[o + 3] = maxX + 0.002; tb[o + 4] = maxY + 0.002; tb[o + 5] = maxZ + 0.002;
    }
  }

  raycast(origin, dir, maxDist = 100) {
    let best = null;
    const ox = origin.x, oy = origin.y, oz = origin.z, dx = dir.x, dy = dir.y, dz = dir.z;
    const idx = 1 / (Math.abs(dx) > 1e-12 ? dx : 1e-12), idy = 1 / (Math.abs(dy) > 1e-12 ? dy : 1e-12), idz = 1 / (Math.abs(dz) > 1e-12 ? dz : 1e-12);
    const [f0, f1] = this.freeRange ?? [0, this.nv - 1];
    const nu = this.nu, TP = this.top, tq = this.tileQ, tb = this.tileBox;
    let bt = maxDist;
    let hitTri = null;
    if (f1 > f0) {
      for (let ty = 0; ty < this.tilesV; ty++) {
        const ja = ty * tq, jb = Math.min(this.nv - 1, (ty + 1) * tq);
        if (jb <= f0 || ja >= f1) continue;
        for (let tx = 0; tx < this.tilesU; tx++) {
          const o = (ty * this.tilesU + tx) * 6;
          let t0 = (tb[o] - ox) * idx, t1 = (tb[o + 3] - ox) * idx;
          let tmin = Math.min(t0, t1), tmax = Math.max(t0, t1);
          t0 = (tb[o + 1] - oy) * idy; t1 = (tb[o + 4] - oy) * idy;
          tmin = Math.max(tmin, Math.min(t0, t1)); tmax = Math.min(tmax, Math.max(t0, t1));
          t0 = (tb[o + 2] - oz) * idz; t1 = (tb[o + 5] - oz) * idz;
          tmin = Math.max(tmin, Math.min(t0, t1)); tmax = Math.min(tmax, Math.max(t0, t1));
          if (tmax < Math.max(tmin, 0) || tmin > bt) continue;
          const i1 = Math.min(nu - 1, (tx + 1) * tq);
          for (let j = Math.max(ja, f0); j < Math.min(jb, f1); j++) for (let i = tx * tq; i < i1; i++) {
            const a = j * nu + i, b = a + 1, c = a + nu, d = c + 1;
            for (let tri = 0; tri < 2; tri++) {
              const A = tri === 0 ? a : b, B = tri === 0 ? b : d, C = c;
              const ax = TP[A * 3], ay = TP[A * 3 + 1], az = TP[A * 3 + 2];
              const e1x = TP[B * 3] - ax, e1y = TP[B * 3 + 1] - ay, e1z = TP[B * 3 + 2] - az;
              const e2x = TP[C * 3] - ax, e2y = TP[C * 3 + 1] - ay, e2z = TP[C * 3 + 2] - az;
              const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
              const det = e1x * px + e1y * py + e1z * pz;
              if (Math.abs(det) < 1e-14) continue;
              const inv = 1 / det;
              const sx = ox - ax, sy = oy - ay, sz = oz - az;
              const bu = (sx * px + sy * py + sz * pz) * inv;
              if (bu < 0 || bu > 1) continue;
              const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
              const bv = (dx * qx + dy * qy + dz * qz) * inv;
              if (bv < 0 || bu + bv > 1) continue;
              const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
              if (t < 0 || t >= bt) continue;
              bt = t;
              hitTri = { A, B, C, bu, bv };
            }
          }
        }
      }
    }
    if (hitTri) {
      const { A, B, C, bu, bv } = hitTri;
      const w0 = 1 - bu - bv;
      const uvA = [A % nu / (nu - 1), Math.floor(A / nu) / (this.nv - 1)], uvB = [B % nu / (nu - 1), Math.floor(B / nu) / (this.nv - 1)], uvC = [C % nu / (nu - 1), Math.floor(C / nu) / (this.nv - 1)];
      const u = uvA[0] * w0 + uvB[0] * bu + uvC[0] * bv, v = uvA[1] * w0 + uvB[1] * bu + uvC[1] * bv;
      const N = this.nrm, T = this.tng;
      const n = new THREE.Vector3(N[A * 3] * w0 + N[B * 3] * bu + N[C * 3] * bv, N[A * 3 + 1] * w0 + N[B * 3 + 1] * bu + N[C * 3 + 1] * bv, N[A * 3 + 2] * w0 + N[B * 3 + 2] * bu + N[C * 3 + 2] * bv).normalize();
      const tu = new THREE.Vector3(T[A * 3] * w0 + T[B * 3] * bu + T[C * 3] * bv, T[A * 3 + 1] * w0 + T[B * 3 + 1] * bu + T[C * 3 + 1] * bv, T[A * 3 + 2] * w0 + T[B * 3 + 2] * bu + T[C * 3 + 2] * bv).normalize();
      const tv = new THREE.Vector3().crossVectors(n, tu).normalize();
      const fromTop = n.x * dx + n.y * dy + n.z * dz < 0;
      best = {
        distance: bt,
        point: new THREE.Vector3(ox + dx * bt, oy + dy * bt, oz + dz * bt),
        normal: fromTop ? n : n.clone().negate(),
        uv: { u, v },
        tangentU: tu,
        tangentV: tv,
        part: fromTop ? 'top' : 'bottom',
      };
    }
    if (this.body && this.rolledLen > 0) {
      const rh = this.raycastRoll(origin, dir, best ? best.distance : maxDist);
      if (rh) best = rh;
    }
    const lh = this.fringe.raycastLabel(origin, dir, best ? best.distance + (maxDist > 1 ? 0.2 : 0) : maxDist, maxDist > 1);
    if (lh) {
      const p = new THREE.Vector3().copy(origin).addScaledVector(dir, lh.distance);
      best = { distance: lh.distance, point: p, normal: lh.normal, uv: { u: 0.08, v: 1 }, tangentU: new THREE.Vector3(1, 0, 0), tangentV: new THREE.Vector3(0, 0, 1), part: 'label' };
    }
    return best;
  }

  raycastRoll(origin, dir, maxDist) {
    const t = this.body.translation(), r = this.body.rotation();
    _q.set(r.x, r.y, r.z, r.w);
    const inv = _q.clone().invert();
    const lo = new THREE.Vector3(origin.x - t.x, origin.y - t.y, origin.z - t.z).applyQuaternion(inv);
    const ld = new THREE.Vector3(dir.x, dir.y, dir.z).applyQuaternion(inv);
    const Rr = this.rollRadius + (this.wrapped ? 0.005 : 0);
    const hw = this.width / 2;
    let best = Infinity, cap = 0;
    const a = ld.y * ld.y + ld.z * ld.z, b = 2 * (lo.y * ld.y + lo.z * ld.z), c = lo.y * lo.y + lo.z * lo.z - Rr * Rr;
    const disc = b * b - 4 * a * c;
    if (a > 1e-12 && disc >= 0) {
      const tt = (-b - Math.sqrt(disc)) / (2 * a);
      if (tt >= 0 && Math.abs(lo.x + ld.x * tt) <= hw) best = tt;
    }
    if (Math.abs(ld.x) > 1e-9) for (const sx of [-hw, hw]) {
      const tt = (sx - lo.x) / ld.x;
      if (tt < 0 || tt >= best) continue;
      const y = lo.y + ld.y * tt, z = lo.z + ld.z * tt;
      if (y * y + z * z <= Rr * Rr) { best = tt; cap = Math.sign(sx); }
    }
    if (best > maxDist) return null;
    const lp = lo.clone().addScaledVector(ld, best);
    const ang = Math.atan2(lp.z, lp.y);
    const thE = this.theta(this.rolledLen);
    const back = ((thE + this.phi0 - ang) % TAU + TAU) % TAU;
    const th = Math.max(0, thE - back);
    const s = this.r0 * th + this.thick * th * th / (2 * TAU);
    const v = this.rollEdge === 'v0' ? s / this.length : 1 - s / this.length;
    const u = clamp(lp.x / (this.sgnU * this.width) + 0.5, 0, 1);
    const nl = cap ? new THREE.Vector3(cap, 0, 0) : new THREE.Vector3(0, Math.cos(ang), Math.sin(ang));
    const tvl = new THREE.Vector3(0, -Math.sin(ang), Math.cos(ang)).multiplyScalar(this.rollEdge === 'v0' ? 1 : -1);
    const tul = new THREE.Vector3(this.sgnU, 0, 0);
    return {
      distance: best,
      point: new THREE.Vector3(origin.x, origin.y, origin.z).addScaledVector(dir, best),
      normal: nl.applyQuaternion(_q),
      uv: { u, v: clamp(v, 0, 1) },
      tangentU: tul.applyQuaternion(_q),
      tangentV: tvl.applyQuaternion(_q),
      part: 'roll',
    };
  }

  uvToWorld(u, v) {
    const s = this.sOfV(v);
    if (this.body && this.rolledLen > 0 && s <= this.rolledLen) {
      const pose = this.pose;
      this.setPoseFromBody(pose);
      const p = this.spiralWorld(u, s, pose, new THREE.Vector3());
      const th = this.theta(s), a = th + this.phi0;
      const n = new THREE.Vector3().addScaledVector(pose.ey, Math.cos(a)).addScaledVector(pose.ez, Math.sin(a)).normalize();
      return { point: p, normal: n };
    }
    const nu = this.nu, nv = this.nv;
    const fu = clamp(u, 0, 1) * (nu - 1), fv = clamp(v, 0, 1) * (nv - 1);
    const i0 = Math.min(nu - 2, Math.floor(fu)), j0 = Math.min(nv - 2, Math.floor(fv));
    const tu = fu - i0, tv = fv - j0;
    const P = this.top, N = this.nrm;
    const p = new THREE.Vector3(), n = new THREE.Vector3();
    for (const [i, j, w] of [[i0, j0, (1 - tu) * (1 - tv)], [i0 + 1, j0, tu * (1 - tv)], [i0, j0 + 1, (1 - tu) * tv], [i0 + 1, j0 + 1, tu * tv]]) {
      const k = (j * nu + i) * 3;
      p.x += P[k] * w; p.y += P[k + 1] * w; p.z += P[k + 2] * w;
      n.x += N[k] * w; n.y += N[k + 1] * w; n.z += N[k + 2] * w;
    }
    return { point: p, normal: n.normalize() };
  }

  surfaceHeightAt(x, z) {
    const fb = floorBaseHeightAt(x, z);
    const h = this.raycast({ x, y: fb + 3, z }, { x: 0, y: -1, z: 0 }, 3.2);
    if (!h) return null;
    return h.point.y - fb;
  }

  edgeFrame(u, end, outP, outD, outN) {
    const nu = this.nu, nv = this.nv, P = this.pos, N = this.nrm;
    const j = end === 1 ? nv - 1 : 0, jn = end === 1 ? nv - 2 : 1;
    const fu = clamp(u, 0, 1) * (nu - 1);
    const i0 = Math.min(nu - 2, Math.floor(fu)), t = fu - i0;
    const a = (j * nu + i0) * 3, b = a + 3, an = (jn * nu + i0) * 3, bn = an + 3;
    const px = P[a] + (P[b] - P[a]) * t, py = P[a + 1] + (P[b + 1] - P[a + 1]) * t, pz = P[a + 2] + (P[b + 2] - P[a + 2]) * t;
    const qx = P[an] + (P[bn] - P[an]) * t, qy = P[an + 1] + (P[bn + 1] - P[an + 1]) * t, qz = P[an + 2] + (P[bn + 2] - P[an + 2]) * t;
    outN.set(N[a] + (N[b] - N[a]) * t, N[a + 1] + (N[b + 1] - N[a + 1]) * t, N[a + 2] + (N[b + 2] - N[a + 2]) * t).normalize();
    outD.set(px - qx, py - qy, pz - qz).normalize();
    outP.set(px, py, pz).addScaledVector(outN, this.typeDef.backing * 0.5).addScaledVector(outD, 0.002);
  }

  serialize() {
    const body = this.body ? { p: this.body.translation(), q: this.body.rotation(), v: this.body.linvel(), w: this.body.angvel(), mode: this.mode } : null;
    const c = this.cloth;
    const cloth = [];
    for (let i = 0; i < c.n * 3; i++) cloth.push(Math.round(c.x[i] * 1000) / 1000);
    return {
      type: this.type, width: this.width, length: this.length, seed: this.seed, paintColor: this.paintColor,
      state: this.state, rollEdge: this.rollEdge, rolledLen: this.rolledLen, phi0: this.phi0, wrapped: this.wrapped,
      memory: this.memory, body, cloth, active: Array.from(c.active),
    };
  }

  dispose() {
    this.removeBody();
    this.sys.root.remove(this.group);
    for (const g of [this.geoTop, this.geoUnder, this.geoFilm, this.geoShell, this.geoDep, this.geoEdge]) g.dispose();
    for (const m of [this.matBase, this.matUnder, this.matShell, this.matDep, this.matFilm, this.matEdge]) m?.dispose();
    this.fringe.dispose();
    this.patternRT.dispose();
    this.targets.albedo.dispose();
    this.targets.params.dispose();
    if (this.ownSurface) this.surface.dispose();
  }
}
