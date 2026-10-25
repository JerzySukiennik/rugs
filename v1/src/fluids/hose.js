// Rug Rush fluids: car-wash hose boom (post, swivel arm), verlet hose with retractor and a grabbable spray lance.
import * as THREE from 'three';
import { R, GROUP, groups } from '../core/physics.js';
import { BAY, floorBaseHeightAt } from '../world/layout.js';
import { TubeMesh, catmull } from './tube.js';
import { hoseMaterial } from './particleMaterials.js';

const SEGS = 36;
const HOSE_R = 0.0125;
const ATTACH = new THREE.Vector3(0, -0.135, 0.05);
const NOZZLE = new THREE.Vector3(0, 0.012, -0.7);
const GUARD = [new THREE.Vector3(0, 0.012, -0.71), new THREE.Vector3(0, 0.012, -0.36), new THREE.Vector3(0, -0.135, 0.05), new THREE.Vector3(0, 0.03, 0.075)];
const _q = new THREE.Quaternion();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();
const _f = new THREE.Vector3();

export class Hose {
  constructor(fluids, cfg, opts = {}) {
    this.fluids = fluids;
    this.physics = fluids.physics;
    this.pivot = new THREE.Vector3(cfg.x, cfg.y, cfg.z);
    this.arm = cfg.arm;
    this.maxLen = cfg.hose;
    this.tipDrop = 0.14;
    this.hangY = opts.hangY ?? 1.75;
    this.minLen = Math.min(this.maxLen - 0.2, Math.max(1, cfg.y - this.tipDrop - this.hangY));
    this.payout = this.minLen;
    this.slackHeld = 0.55;
    this.k = 2200;
    this.c = 60;
    this.capFree = 90;
    this.capTaut = 420;
    this.ropeMass = 0.32;
    this.theta = opts.angle ?? Math.PI / 2;
    this.thetaPrev = this.theta;
    this.omega = 0;
    this.inertia = 38;
    this.boomDamp = 1.1;
    this.flowing = false;
    this.held = false;
    this.tension = 0;
    this.prevD = 0;
    this.n = SEGS + 1;
    this.rp = new Float32Array(this.n * 3);
    this.rq = new Float32Array(this.n * 3);
    this.rr = new Float32Array(this.n * 3);
    this.ri = new Float32Array(this.n * 3);
    this.sub = new Float32Array(((this.n - 1) * 3 + 1) * 3);
    this.subR = new Float32Array((this.n - 1) * 3 + 1).fill(HOSE_R);
    this.inR = new Float32Array(this.n).fill(HOSE_R);
    this.cands = [];
    this.tops = new Map();
    this.contacts = 0;
    this.root = new THREE.Group();
    this.root.name = 'hoseBoom';
    fluids.scene.add(this.root);
    this.buildBoom();
    this.buildLance(opts);
    this.stream = fluids.createStream('water', { rate: opts.rate ?? 0.25, speed: opts.speed ?? 4.2, spread: 0.01, size: 0.0045, exclude: this.body, productId: opts.productId ?? 'water' });
    this.tube = new TubeMesh((this.n - 1) * 3 + 4, 10, hoseMaterial());
    this.tube.mesh.castShadow = true;
    this.root.add(this.tube.mesh);
    const tip = this.tipPos(_a);
    const at = this.attachWorld(_b);
    for (let i = 0; i < this.n; i++) {
      const t = i / (this.n - 1);
      const sag = Math.sin(t * Math.PI) * 0.15;
      for (let j = 0; j < 3; j++) this.rp[i * 3 + j] = tip.getComponent(j) + (at.getComponent(j) - tip.getComponent(j)) * t;
      this.rp[i * 3] += sag;
    }
    this.rq.set(this.rp);
    this.rr.set(this.rp);
    this.prevD = tip.distanceTo(at);
  }

  buildBoom() {
    const steel = new THREE.MeshStandardMaterial({ color: 0xc7ccd1, metalness: 0.85, roughness: 0.32 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a2e33, metalness: 0.4, roughness: 0.5 });
    const piv = this.pivot;
    const postZ = BAY.cz - BAY.half - 0.32;
    const topY = piv.y + 0.38;
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, topY + 0.1, 0.16), steel);
    post.position.set(piv.x, (topY + 0.1) / 2, postZ);
    post.castShadow = post.receiveShadow = true;
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.02, 0.42), dark);
    foot.position.set(piv.x, 0.01, postZ);
    const beamLen = Math.abs(piv.z - postZ) + 0.12;
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, beamLen), steel);
    beam.position.set(piv.x, topY, (piv.z + postZ) / 2 + Math.sign(piv.z - postZ) * 0.04);
    beam.castShadow = true;
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 1.4), steel);
    strut.position.set(piv.x, topY - 0.45, postZ + 0.45);
    strut.rotation.x = Math.atan2(0.9, 1.0) * Math.sign(piv.z - postZ);
    this.root.add(post, foot, beam, strut);
    this.physics.staticBox(0.08, (topY + 0.1) / 2, 0.08, { x: piv.x, y: (topY + 0.1) / 2, z: postZ }, null, { friction: 0.5 });
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, topY - piv.y + 0.06, 20), dark);
    hub.position.set(piv.x, (topY + piv.y) / 2, piv.z);
    this.root.add(hub);
    this.swivel = new THREE.Group();
    this.swivel.position.copy(piv);
    this.root.add(this.swivel);
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.1, 24), steel);
    this.swivel.add(collar);
    const armMesh = new THREE.Mesh(new THREE.BoxGeometry(this.arm, 0.07, 0.07), steel);
    armMesh.position.set(this.arm / 2, 0, 0);
    armMesh.castShadow = true;
    const brace = new THREE.Mesh(new THREE.BoxGeometry(this.arm * 0.62, 0.035, 0.035), steel);
    const by = topY - piv.y - 0.05;
    brace.position.set(this.arm * 0.29, by / 2, 0);
    brace.rotation.z = -Math.atan2(by, this.arm * 0.58);
    brace.scale.x = Math.hypot(by, this.arm * 0.58) / (this.arm * 0.62);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), dark);
    head.position.set(this.arm, 0, 0);
    const pulley = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.014, 10, 24), dark);
    pulley.position.set(this.arm, -this.tipDrop + 0.05, 0);
    pulley.rotation.y = Math.PI / 2;
    const guide = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.03, 0.09, 16), dark);
    guide.position.set(this.arm, -this.tipDrop + 0.02, 0);
    this.swivel.add(armMesh, brace, head, pulley, guide);
  }

  buildLance(opts) {
    const P = this.physics;
    const black = new THREE.MeshStandardMaterial({ color: 0x1e2124, roughness: 0.55, metalness: 0.05 });
    const red = new THREE.MeshStandardMaterial({ color: 0xc8322a, roughness: 0.45 });
    const steel = new THREE.MeshStandardMaterial({ color: 0xd4d8dc, metalness: 0.95, roughness: 0.22 });
    const brass = new THREE.MeshStandardMaterial({ color: 0xc79a4a, metalness: 0.9, roughness: 0.3 });
    const g = new THREE.Group();
    g.name = 'hoseLance';
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.13, 0.05), black);
    grip.position.set(0, -0.065, 0.045);
    grip.rotation.x = -0.22;
    const headM = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.15), black);
    headM.position.set(0, 0.012, 0.0);
    const trig = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.075, 0.016), red);
    trig.position.set(0, -0.045, -0.02);
    trig.rotation.x = 0.18;
    this.trigger = trig;
    const guard = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.005, 6, 16, Math.PI), black);
    guard.position.set(0, -0.03, -0.015);
    guard.rotation.set(0, Math.PI / 2, Math.PI / 2);
    const wand = new THREE.Mesh(new THREE.CylinderGeometry(0.0085, 0.0085, 0.6, 12), steel);
    wand.rotation.x = Math.PI / 2;
    wand.position.set(0, 0.012, -0.375);
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.016, 0.05, 14), brass);
    tip.rotation.x = Math.PI / 2;
    tip.position.set(0, 0.012, -0.69);
    const fit = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.04, 12), brass);
    fit.position.copy(ATTACH).add(new THREE.Vector3(0, 0.015, 0));
    fit.rotation.x = -0.22;
    for (const m of [grip, headM, trig, wand, tip, fit]) m.castShadow = true;
    g.add(grip, headM, trig, guard, wand, tip, fit);
    this.nozzle = new THREE.Object3D();
    this.nozzle.position.copy(NOZZLE);
    g.add(this.nozzle);
    this.fluids.scene.add(g);
    this.lanceMesh = g;
    const tipW = this.tipPos(new THREE.Vector3());
    _q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
    const att = ATTACH.clone().applyQuaternion(_q);
    const start = new THREE.Vector3(tipW.x, tipW.y - this.minLen, tipW.z).sub(att);
    const desc = R.RigidBodyDesc.dynamic().setTranslation(start.x, start.y, start.z).setRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w })
      .setLinearDamping(0.5).setAngularDamping(1.6).setCcdEnabled(true).setCanSleep(false);
    if (typeof desc.setSoftCcdPrediction === 'function') desc.setSoftCcdPrediction(0.1);
    const qz = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
    const grp = groups(GROUP.DYNAMIC);
    const cols = [
      R.ColliderDesc.capsule(0.3, 0.016).setRotation({ x: qz.x, y: qz.y, z: qz.z, w: qz.w }).setTranslation(0, 0.012, -0.38).setMass(0.35).setFriction(0.6).setCollisionGroups(grp),
      R.ColliderDesc.cuboid(0.02, 0.07, 0.03).setTranslation(0, -0.065, 0.045).setMass(0.55).setFriction(0.8).setCollisionGroups(grp),
      R.ColliderDesc.cuboid(0.026, 0.026, 0.075).setTranslation(0, 0.012, 0.0).setMass(0.3).setFriction(0.8).setCollisionGroups(grp),
    ];
    const hose = this;
    this.lance = {
      id: opts.id ?? 'hoseLance',
      kind: 'hoseLance',
      label: 'Hose',
      body: null,
      holdStyle: 'tool',
      holdPose: { pos: new THREE.Vector3(0.24, -0.27, -0.42), rot: new THREE.Euler(0.06, 0, 0) },
      hose,
      useStart() { hose.flowing = true; },
      useEnd() { hose.flowing = false; },
      onGrab() { hose.held = true; },
      onRelease() { hose.held = false; hose.flowing = false; },
    };
    this.body = P.createBody(desc, cols, this.lance);
    this.lance.body = this.body;
    P.bind(this.body, g);
    if (opts.entities) opts.entities.add(this.lance);
  }

  tipPos(out) {
    return out.set(this.pivot.x + Math.cos(this.theta) * this.arm, this.pivot.y - this.tipDrop, this.pivot.z + Math.sin(this.theta) * this.arm);
  }

  attachWorld(out) {
    const t = this.body ? this.body.translation() : null;
    if (!t) return out.set(0, 0, 0);
    const r = this.body.rotation();
    _q.set(r.x, r.y, r.z, r.w);
    return out.copy(ATTACH).applyQuaternion(_q).add(_d.set(t.x, t.y, t.z));
  }

  nozzleWorld(pos, dir) {
    const t = this.body.translation(), r = this.body.rotation();
    _q.set(r.x, r.y, r.z, r.w);
    pos.copy(NOZZLE).applyQuaternion(_q).add(_d.set(t.x, t.y, t.z));
    dir.set(0, 0, -1).applyQuaternion(_q);
  }

  colliderTop(c) {
    const t = c.translation(), sh = c.shape;
    const T = R.ShapeType;
    if (sh.type === T.Cuboid) {
      const r = c.rotation();
      const he = sh.halfExtents;
      const ident = Math.abs(r.w) > 0.9999;
      return t.y + (ident ? he.y : Math.hypot(he.x, he.y, he.z));
    }
    if (sh.type === T.TriMesh && sh.vertices) {
      let m = -Infinity;
      const v = sh.vertices;
      for (let i = 1; i < v.length; i += 3) m = Math.max(m, v[i]);
      return m + t.y;
    }
    if (sh.type === T.Ball) return t.y + sh.radius;
    if (sh.type === T.Capsule) return t.y + sh.halfHeight + sh.radius;
    return Infinity;
  }

  usable(c) {
    if (c.isSensor()) return false;
    const par = c.parent();
    if (par && par.handle === this.body.handle) return false;
    if ((c.collisionGroups() >>> 16) & (GROUP.TRIGGER | GROUP.HELD)) return false;
    if (!par || par.isFixed()) {
      let top = this.tops.get(c.handle);
      if (top === undefined) {
        top = this.colliderTop(c);
        this.tops.set(c.handle, top);
      }
      if (top < 0.006) return false;
    }
    return true;
  }

  gather() {
    const p = this.rp;
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (let i = 1; i < this.n - 1; i++) {
      const j = i * 3;
      x0 = Math.min(x0, p[j]); x1 = Math.max(x1, p[j]);
      y0 = Math.min(y0, p[j + 1]); y1 = Math.max(y1, p[j + 1]);
      z0 = Math.min(z0, p[j + 2]); z1 = Math.max(z1, p[j + 2]);
    }
    const m = HOSE_R * 2;
    this.cands.length = 0;
    this.physics.world.collidersWithAabbIntersectingAabb(
      { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2 },
      { x: (x1 - x0) / 2 + m, y: (y1 - y0) / 2 + m, z: (z1 - z0) / 2 + m },
      (c) => {
        if (this.usable(c)) this.cands.push(c);
        return true;
      },
    );
  }

  collide(i, r) {
    const p = this.rp, q = this.rq;
    const j = i * 3;
    const fy = floorBaseHeightAt(p[j], p[j + 2]) + r;
    let hit = false;
    if (p[j + 1] < fy) {
      p[j + 1] = fy;
      hit = true;
    }
    for (const c of this.cands) {
      const pr = c.projectPoint({ x: p[j], y: p[j + 1], z: p[j + 2] }, false);
      if (!pr) continue;
      const dx = p[j] - pr.point.x, dy = p[j + 1] - pr.point.y, dz = p[j + 2] - pr.point.z;
      const d = Math.hypot(dx, dy, dz);
      if (pr.isInside) {
        const s = d > 1e-6 ? -1 / d : 0;
        p[j] = pr.point.x + dx * s * r; p[j + 1] = pr.point.y + dy * s * r; p[j + 2] = pr.point.z + dz * s * r;
        hit = true;
      } else if (d < r) {
        const s = d > 1e-6 ? r / d : 0;
        p[j] = pr.point.x + dx * s; p[j + 1] = pr.point.y + dy * s; p[j + 2] = pr.point.z + dz * s;
        hit = true;
      }
    }
    if (hit) {
      this.contacts++;
      q[j] += (p[j] - q[j]) * 0.5;
      q[j + 1] += (p[j + 1] - q[j + 1]) * 0.5;
      q[j + 2] += (p[j + 2] - q[j + 2]) * 0.5;
    }
  }

  solve(iters, tip, at, rest) {
    const p = this.rp, n = this.n;
    const minBend = rest * 1.55;
    for (let it = 0; it < iters; it++) {
      p[0] = tip.x; p[1] = tip.y; p[2] = tip.z;
      const e = (n - 1) * 3;
      p[e] = at.x; p[e + 1] = at.y; p[e + 2] = at.z;
      for (let i = 0; i < n - 1; i++) {
        const a = i * 3, b = a + 3;
        const dx = p[b] - p[a], dy = p[b + 1] - p[a + 1], dz = p[b + 2] - p[a + 2];
        const d = Math.hypot(dx, dy, dz) || 1e-6;
        const wa = i === 0 ? 0 : 1, wb = i + 1 === n - 1 ? 0 : 1;
        if (wa + wb === 0) continue;
        const c = (d - rest) / d / (wa + wb);
        p[a] += dx * c * wa; p[a + 1] += dy * c * wa; p[a + 2] += dz * c * wa;
        p[b] -= dx * c * wb; p[b + 1] -= dy * c * wb; p[b + 2] -= dz * c * wb;
      }
      for (let i = 0; i < n - 2; i += 1) {
        const a = i * 3, b = a + 6;
        const dx = p[b] - p[a], dy = p[b + 1] - p[a + 1], dz = p[b + 2] - p[a + 2];
        const d = Math.hypot(dx, dy, dz) || 1e-6;
        if (d >= minBend) continue;
        const wa = i === 0 ? 0 : 1, wb = i + 2 === n - 1 ? 0 : 1;
        if (wa + wb === 0) continue;
        const c = ((d - minBend) / d / (wa + wb)) * 0.25;
        p[a] += dx * c * wa; p[a + 1] += dy * c * wa; p[a + 2] += dz * c * wa;
        p[b] -= dx * c * wb; p[b + 1] -= dy * c * wb; p[b + 2] -= dz * c * wb;
      }
    }
  }

  guardFloor() {
    const t = this.body.translation(), r = this.body.rotation();
    _q.set(r.x, r.y, r.z, r.w);
    let pen = 0;
    for (const lp of GUARD) {
      _c.copy(lp).applyQuaternion(_q).add(_d.set(t.x, t.y, t.z));
      pen = Math.max(pen, floorBaseHeightAt(_c.x, _c.z) + 0.004 - _c.y);
    }
    if (pen <= 0.006) return;
    this.body.setTranslation({ x: t.x, y: t.y + pen, z: t.z }, true);
    const v = this.body.linvel();
    if (v.y < 0) this.body.setLinvel({ x: v.x * 0.5, y: 0, z: v.z * 0.5 }, true);
    this.physics.teleportBinding(this.body);
  }

  fixedUpdate(dt) {
    const p = this.rp, q = this.rq, n = this.n;
    this.guardFloor();
    this.rr.set(p);
    this.thetaPrev = this.theta;
    const tip = this.tipPos(_a);
    const at = this.attachWorld(_b);
    const D = tip.distanceTo(at);
    const target = this.held ? Math.min(this.maxLen, Math.max(this.minLen, D + this.slackHeld)) : this.minLen;
    const lv = this.body.linvel();
    const sp = Math.hypot(lv.x, lv.y, lv.z);
    const rate = target > this.payout ? 5 : 0.6 * Math.max(0, 1 - sp / 1.6);
    this.payout += Math.max(-rate * dt, Math.min(rate * dt, target - this.payout));
    const cap = this.held ? this.capTaut : this.capFree;
    if (!this.held) this.payout = Math.max(this.payout, Math.min(this.maxLen, D - cap / this.k));
    const rest = this.payout / (n - 1);
    const g = -9.81 * dt * dt;
    for (let i = 1; i < n - 1; i++) {
      const j = i * 3;
      for (let k = 0; k < 3; k++) {
        const cur = p[j + k];
        p[j + k] += (cur - q[j + k]) * 0.98 + (k === 1 ? g : 0);
        q[j + k] = cur;
      }
    }
    this.solve(14, tip, at, rest);
    this.contacts = 0;
    this.gather();
    for (let i = 1; i < n - 1; i++) this.collide(i, HOSE_R);
    this.solve(4, tip, at, rest);
    const e = (n - 1) * 3;
    _c.set(p[e - 3] - at.x, p[e - 2] - at.y, p[e - 1] - at.z).normalize();
    _d.copy(tip).sub(at).normalize();
    const dD = (D - this.prevD) / dt;
    this.prevD = D;
    let Ts = 0;
    if (D > this.payout) Ts = Math.min(cap, Math.max(0, this.k * (D - this.payout) + this.c * dD));
    let lowY = Infinity;
    for (let i = 0; i < n; i++) lowY = Math.min(lowY, p[i * 3 + 1]);
    const Tw = this.ropeMass * 9.81 * Math.min(this.payout, Math.max(0.25, at.y - lowY + 0.3));
    _f.copy(_d).multiplyScalar(Ts).addScaledVector(_c, Tw);
    this.tension = _f.length();
    if (this.flowing) {
      this.nozzleWorld(_a, _c);
      _f.addScaledVector(_c, -1.0);
    }
    this.body.applyImpulseAtPoint({ x: _f.x * dt, y: _f.y * dt, z: _f.z * dt }, { x: at.x, y: at.y, z: at.z }, true);
    const sn = Math.sin(this.theta), cs = Math.cos(this.theta);
    const tau = this.arm * (-_f.x * -sn + -_f.z * cs);
    this.omega += (tau / this.inertia - this.boomDamp * this.omega) * dt;
    if (Math.abs(this.omega) < 0.01 && Math.abs(tau) < 1.2) this.omega *= 0.6;
    this.theta += this.omega * dt;
    if (this.flowing) {
      this.nozzleWorld(_a, _c);
      const v = this.physics.bodyVelocityAt(this.body, _a, _d);
      this.stream.emit(_a, _c, v);
    }
  }

  update(dt, alpha) {
    const th = this.thetaPrev + (this.theta - this.thetaPrev) * alpha;
    this.swivel.rotation.y = -th;
    const p = this.rp, r = this.rr, ri = this.ri, n = this.n;
    for (let i = 0; i < n * 3; i++) ri[i] = r[i] + (p[i] - r[i]) * alpha;
    this.lanceMesh.updateMatrixWorld();
    _a.copy(ATTACH).applyMatrix4(this.lanceMesh.matrixWorld);
    const e = (n - 1) * 3;
    ri[e] = _a.x; ri[e + 1] = _a.y; ri[e + 2] = _a.z;
    ri[0] = this.pivot.x + Math.cos(th) * this.arm;
    ri[1] = this.pivot.y - this.tipDrop;
    ri[2] = this.pivot.z + Math.sin(th) * this.arm;
    const m = catmull(ri, n, 3, this.sub);
    this.tube.begin();
    this.tube.chain(this.sub, m, this.subR);
    this.tube.end();
    this.trigger.rotation.x = this.flowing ? 0.42 : 0.18;
  }

  dispose() {
    this.physics.removeBody(this.body);
    this.physics.unbind(this.lanceMesh);
    this.fluids.scene.remove(this.root, this.lanceMesh);
    this.tube.dispose();
    this.stream.dispose();
  }
}
