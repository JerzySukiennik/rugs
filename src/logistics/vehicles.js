// Rug Rush vehicles: a push cart for rolls and a drivable forklift with a carpet ram that skewers rolled rugs.
import * as THREE from 'three';
import { R, GROUP, groups } from '../core/physics.js';
import { floorBaseHeightAt } from '../world/layout.js';
import * as K from '../world/kit.js';

const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();

let cartGeo = null;
let cartMat = null;
function cartMesh() {
  if (!cartGeo) {
    const parts = [];
    const P = (geo, col, o = {}) => parts.push(K.paint(geo, col, o));
    P(K.roundedBox(1.4, 0.05, 0.75, 0.015, 1).translate(0, 0.22, 0), '#2f6db5', { r: 0.45, m: 0.25 });
    P(K.box(1.36, 0.008, 0.71, { x: 0, y: 0.249, z: 0 }), '#2a2c2f', { r: 0.95, shade: (x, y, z) => ((Math.round(x / 0.04) + Math.round(z / 0.04)) % 2 ? 0.85 : 1) });
    for (const s of [-1, 1]) P(K.box(1.4, 0.06, 0.03, { x: 0, y: 0.2, z: s * 0.37 }), '#24569a', { r: 0.45, m: 0.3 });
    const handle = K.tube([[-0.66, 0.25, 0.33], [-0.68, 0.95, 0.33], [-0.68, 1.06, 0.26], [-0.68, 1.06, -0.26], [-0.68, 0.95, -0.33], [-0.66, 0.25, -0.33]], 0.016, { segs: 40, radial: 10, tension: 0.2 });
    P(handle, '#b9bfc4', { r: 0.3, m: 0.85 });
    P(K.cyl(0.024, 0.024, 0.36, 12).rotateX(Math.PI / 2).translate(-0.68, 1.06, 0), '#1d1e20', { r: 0.8 });
    for (const [x, z] of [[0.6, 0.3], [0.6, -0.3], [-0.6, 0.3], [-0.6, -0.3]]) {
      P(K.box(0.07, 0.012, 0.07, { x, y: 0.19, z }), '#9aa1a7', { r: 0.4, m: 0.7 });
      P(K.box(0.012, 0.09, 0.05, { x: x - 0.025, y: 0.14, z }), '#9aa1a7', { r: 0.4, m: 0.7 });
      P(K.box(0.012, 0.09, 0.05, { x: x + 0.025, y: 0.14, z }), '#9aa1a7', { r: 0.4, m: 0.7 });
      const wh = K.lathe([[0.04, -0.022], [0.075, -0.022], [0.08, -0.012], [0.08, 0.012], [0.075, 0.022], [0.04, 0.022]], { segs: 18 });
      wh.rotateZ(Math.PI / 2);
      wh.translate(x, 0.08, z);
      P(wh, '#1a1b1d', { r: 0.8 });
      P(K.cyl(0.035, 0.035, 0.05, 10).rotateZ(Math.PI / 2).translate(x, 0.08, z), '#e2e4e5', { r: 0.4 });
    }
    cartGeo = K.merge(parts);
    cartMat = K.vcolorMaterial('rr-cart');
  }
  const m = new THREE.Mesh(cartGeo, cartMat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export class Cart {
  constructor(game, pos, yaw = 0) {
    this.game = game;
    this.kind = 'cart';
    this.label = 'Platform cart';
    this.holdStyle = 'heavy';
    this.grabbable = true;
    const g = new THREE.Group();
    g.add(cartMesh());
    this.mesh = g;
    game.engine.scene.add(g);
    const q = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
    const C = (d) => d.setCollisionGroups(groups(GROUP.DYNAMIC));
    this.body = game.physics.createBody(R.RigidBodyDesc.dynamic().setTranslation(pos.x, pos.y + 0.05, pos.z).setRotation(q).setLinearDamping(0.6).setAngularDamping(2.5), [
      C(R.ColliderDesc.cuboid(0.7, 0.03, 0.375).setTranslation(0, 0.22, 0).setMass(16).setFriction(0.9)),
      C(R.ColliderDesc.cuboid(0.02, 0.45, 0.36).setTranslation(-0.68, 0.65, 0).setMass(2).setFriction(0.6)),
      C(R.ColliderDesc.ball(0.08).setTranslation(0.6, 0.08, 0.3).setFriction(0.02).setMass(1)),
      C(R.ColliderDesc.ball(0.08).setTranslation(0.6, 0.08, -0.3).setFriction(0.02).setMass(1)),
      C(R.ColliderDesc.ball(0.08).setTranslation(-0.6, 0.08, 0.3).setFriction(0.02).setMass(1)),
      C(R.ColliderDesc.ball(0.08).setTranslation(-0.6, 0.08, -0.3).setFriction(0.02).setMass(1)),
    ], this);
    game.physics.bind(this.body, g);
    game.entities?.add(this);
  }
}

export class Forklift {
  constructor(game, pos, yaw = 0) {
    this.game = game;
    this.kind = 'forklift';
    this.label = 'Forklift with carpet ram';
    this.interactVerb = 'drive';
    this.pos = pos.clone();
    this.yaw = yaw;
    this.speed = 0;
    this.steer = 0;
    this.lift = 0.35;
    this.driver = null;
    this.load = null;
    this.loadLocal = new THREE.Vector3();
    this.loadQuat = new THREE.Quaternion();
    this.p0 = this.pos.clone();
    this.p1 = this.pos.clone();
    this.y0 = yaw;
    this.y1 = yaw;
    this.build();
    game.entities?.add(this);
  }

  build() {
    const g = new THREE.Group();
    const parts = [];
    const P = (geo, col, o = {}) => parts.push(K.paint(geo, col, o));
    const YEL = '#f2b630', BLK = '#1d1f22', GRY = '#4d5257';
    const body = K.extrude([[-0.95, 0.25], [1.05, 0.25], [1.25, 0.4], [1.3, 0.75], [1.15, 1.05], [0.75, 1.1], [0.55, 0.95], [-0.45, 0.95], [-0.62, 0.8], [-0.95, 0.8]], 1.1, { bevel: 0.05, bevelSegs: 2, curveSegs: 6 });
    body.rotateY(-Math.PI / 2);
    P(body, YEL, { r: 0.4, m: 0.15 });
    P(K.roundedBox(1.0, 0.25, 0.35, 0.06, 2).translate(0, 0.98, 1.08), YEL, { r: 0.4, m: 0.15 });
    P(K.box(1.12, 0.06, 1.9, { x: 0, y: 0.28, z: 0.12 }), BLK, { r: 0.7 });
    for (const s of [-1, 1]) P(K.box(0.02, 0.06, 1.2, { x: s * 0.56, y: 0.7, z: 0.2 }), BLK, { r: 0.6 });
    P(K.roundedBox(0.52, 0.1, 0.48, 0.04, 2).translate(0, 1.03, 0.38), BLK, { r: 0.8 });
    P(K.roundedBox(0.48, 0.5, 0.1, 0.04, 2).translate(0, 1.3, 0.64).rotateX(0), BLK, { r: 0.8 });
    P(K.cyl(0.03, 0.03, 0.42, 8).rotateX(-0.5).translate(0, 1.18, -0.12), GRY, { r: 0.4, m: 0.6 });
    const sw = new THREE.TorusGeometry(0.17, 0.018, 8, 24);
    sw.rotateX(Math.PI / 2 - 0.5);
    sw.translate(0, 1.37, -0.22);
    P(sw, BLK, { r: 0.6 });
    P(K.roundedBox(0.7, 0.12, 0.26, 0.03, 2).translate(0, 1.0, -0.32), '#2a2d31', { r: 0.6 });
    for (const s of [-1, 1]) P(K.box(0.05, 0.3, 0.05, { x: s * 0.2, y: 1.12, z: -0.4 }), GRY, { r: 0.4, m: 0.6 });
    for (const [x, z] of [[0.5, -0.45], [-0.5, -0.45], [0.5, 0.75], [-0.5, 0.75]]) P(K.box(0.06, 1.55, 0.06, { x, y: 1.68, z }), BLK, { r: 0.5, m: 0.4 });
    P(K.box(1.06, 0.05, 0.06, { x: 0, y: 2.45, z: -0.45 }), BLK, { r: 0.5, m: 0.4 });
    P(K.box(1.06, 0.05, 0.06, { x: 0, y: 2.45, z: 0.75 }), BLK, { r: 0.5, m: 0.4 });
    for (const x of [-0.5, 0.5]) P(K.box(0.06, 0.05, 1.26, { x, y: 2.45, z: 0.15 }), BLK, { r: 0.5, m: 0.4 });
    for (let i = 1; i < 6; i++) P(K.box(0.02, 0.04, 1.2, { x: -0.5 + i * (1 / 6), y: 2.46, z: 0.15 }), BLK, { r: 0.5, m: 0.4 });
    P(K.roundedBox(0.16, 0.08, 0.12, 0.02, 1).translate(0.3, 2.52, 0.6), '#f28c1a', { r: 0.3, e: 0.5 });
    for (const s of [-1, 1]) P(K.roundedBox(0.1, 0.07, 0.04, 0.01, 1).translate(s * 0.4, 2.38, -0.48), '#f4f6f7', { r: 0.2, e: 0.5 });
    for (const x of [0.36, -0.36]) {
      P(K.box(0.07, 2.6, 0.12, { x, y: 1.3, z: -0.95 }), GRY, { r: 0.45, m: 0.6 });
      P(K.box(0.02, 2.6, 0.08, { x: x * 1.12, y: 1.3, z: -0.95 }), '#3a3f45', { r: 0.45, m: 0.6 });
    }
    for (const y of [0.4, 1.4, 2.55]) P(K.box(0.8, 0.07, 0.08, { x: 0, y, z: -0.95 }), GRY, { r: 0.45, m: 0.6 });
    for (const s of [-1, 1]) {
      P(K.cyl(0.035, 0.035, 0.9, 10).rotateX(0.25).translate(s * 0.3, 0.75, -0.78), '#c9cdd0', { r: 0.25, m: 0.9 });
      P(K.cyl(0.05, 0.05, 0.5, 10).rotateX(0.25).translate(s * 0.3, 0.45, -0.7), GRY, { r: 0.4, m: 0.6 });
    }
    const wheel = (r, w) => {
      const t = K.lathe([[r * 0.55, -w / 2], [r * 0.92, -w / 2], [r, -w / 2 + 0.03], [r, w / 2 - 0.03], [r * 0.92, w / 2], [r * 0.55, w / 2]], { segs: 22 });
      t.rotateZ(Math.PI / 2);
      const hub = K.cyl(r * 0.56, r * 0.56, w * 0.8, 18);
      hub.rotateZ(Math.PI / 2);
      return K.merge([K.paint(t, '#151617', { r: 0.9 }), K.paint(hub, '#c9a224', { r: 0.4, m: 0.5 })]);
    };
    for (const [x, z] of [[0.5, -0.6], [-0.5, -0.6]]) parts.push(wheel(0.3, 0.22).translate(x, 0.3, z));
    const bodyMesh = new THREE.Mesh(K.merge(parts), K.vcolorMaterial('rr-forklift'));
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    g.add(bodyMesh);
    const rwMat = bodyMesh.material;
    this.rearWheels = [];
    const rwGeo = wheel(0.22, 0.2);
    for (const x of [0.48, -0.48]) {
      const w = new THREE.Mesh(rwGeo, rwMat);
      w.position.set(x, 0.22, 0.95);
      w.castShadow = true;
      g.add(w);
      this.rearWheels.push(w);
    }
    const inner = [];
    for (const x of [0.27, -0.27]) inner.push(K.paint(K.box(0.06, 2.3, 0.08, { x, y: 1.15, z: -1.0 }), '#5d6268', { r: 0.45, m: 0.6 }));
    inner.push(K.paint(K.box(0.6, 0.06, 0.07, { x: 0, y: 2.25, z: -1.0 }), '#5d6268', { r: 0.45, m: 0.6 }));
    this.innerMast = new THREE.Mesh(K.merge(inner), rwMat);
    this.innerMast.castShadow = true;
    g.add(this.innerMast);
    const carriage = new THREE.Group();
    g.add(carriage);
    const cp = [];
    cp.push(K.paint(K.box(0.86, 0.36, 0.08, { x: 0, y: 0, z: -1.06 }), '#3a3f45', { r: 0.45, m: 0.6 }));
    for (let i = 0; i < 5; i++) cp.push(K.paint(K.box(0.04, 0.5, 0.04, { x: -0.36 + i * 0.18, y: 0.38, z: -1.08 }), '#3a3f45', { r: 0.45, m: 0.6 }));
    cp.push(K.paint(K.box(0.8, 0.04, 0.04, { x: 0, y: 0.62, z: -1.08 }), '#3a3f45', { r: 0.45, m: 0.6 }));
    const collar = K.cyl(0.08, 0.06, 0.16, 16);
    collar.rotateX(Math.PI / 2);
    collar.translate(0, 0, -1.17);
    cp.push(K.paint(collar, '#2a2d31', { r: 0.4, m: 0.6 }));
    const ram = K.cyl(0.03, 0.045, 2.7, 16);
    ram.rotateX(Math.PI / 2);
    ram.translate(0, 0, -2.4);
    cp.push(K.paint(ram, '#d5d9dc', { r: 0.18, m: 0.95 }));
    const tip = K.cyl(0.001, 0.03, 0.1, 12);
    tip.rotateX(-Math.PI / 2);
    tip.translate(0, 0, -3.8);
    cp.push(K.paint(tip, '#d5d9dc', { r: 0.18, m: 0.95 }));
    const cm = new THREE.Mesh(K.merge(cp), rwMat);
    cm.castShadow = true;
    cm.receiveShadow = true;
    carriage.add(cm);
    this.carriage = carriage;
    this.mesh = g;
    this.game.engine.scene.add(g);
    const C = (hx, hy, hz, x, y, z) => R.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z).setFriction(0.6).setCollisionGroups(groups(GROUP.VEHICLE, GROUP.ALL & ~GROUP.CARPET));
    this.body = this.game.physics.createBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(this.pos.x, this.pos.y, this.pos.z), [
      C(0.55, 0.4, 1.15, 0, 0.6, 0.25),
      C(0.5, 0.05, 0.65, 0, 2.45, 0.15),
      C(0.45, 1.3, 0.08, 0, 1.3, -0.95),
    ], this);
    this.syncPose(true);
  }

  interact(player) {
    if (this.driver) return;
    const g = this.game;
    if (g.grab?.held) g.grab.release();
    this.driver = player;
    player.frozen = true;
    player.setEnabled(false);
    player.inVehicle = this;
    g.hud?.toast('W/S drive · A/D steer · Space/C ram up/down · G drop roll · E exit');
  }

  exit() {
    const p = this.driver;
    if (!p) return;
    const side = new THREE.Vector3(-1.3, 0, 0.3).applyAxisAngle(UP, this.yaw).add(this.pos);
    side.y = 0;
    p.teleport(side, p.yaw);
    p.frozen = false;
    p.setEnabled(true);
    p.inVehicle = null;
    this.driver = null;
    this.speed = 0;
  }

  ramTip(out = new THREE.Vector3()) {
    return out.set(0, this.lift, -3.75).applyAxisAngle(UP, this.yaw).add(this.pos);
  }

  ramBase(out = new THREE.Vector3()) {
    return out.set(0, this.lift, -1.1).applyAxisAngle(UP, this.yaw).add(this.pos);
  }

  tryPickup() {
    const tip = this.ramTip(new THREE.Vector3());
    const base = this.ramBase(new THREE.Vector3());
    const dir = tip.clone().sub(base).normalize();
    for (const c of this.game.carpets?.list ?? []) {
      if (!c.body || c.state !== 'rolled' || c.attachedTo) continue;
      const t = c.body.translation();
      const cp = new THREE.Vector3(t.x, t.y, t.z);
      const r = c.body.rotation();
      const axis = new THREE.Vector3(1, 0, 0).applyQuaternion(_q.set(r.x, r.y, r.z, r.w));
      if (Math.abs(axis.dot(dir)) < 0.93) continue;
      const rel = cp.clone().sub(base);
      const along = rel.dot(dir);
      if (along < 0.3 || along > 2.65) continue;
      const perp = rel.clone().addScaledVector(dir, -along).length();
      if (perp > 0.09) continue;
      this.attach(c);
      return true;
    }
    return false;
  }

  attach(c) {
    this.load = c;
    c.attachedTo = this;
    const t = c.body.translation(), r = c.body.rotation();
    const inv = new THREE.Quaternion().setFromAxisAngle(UP, this.yaw).invert();
    this.loadLocal.set(t.x, t.y, t.z).sub(this.pos).applyQuaternion(inv);
    this.loadLocal.y -= this.lift;
    this.loadQuat.set(r.x, r.y, r.z, r.w).premultiply(inv);
    c.body.setBodyType(R.RigidBodyType.KinematicPositionBased, true);
    this.game.hud?.toast('Roll on the ram. G to drop.');
  }

  drop() {
    const c = this.load;
    if (!c) return;
    c.body.setBodyType(R.RigidBodyType.Dynamic, true);
    const v = new THREE.Vector3(0, 0, -this.speed).applyAxisAngle(UP, this.yaw);
    c.body.setLinvel({ x: v.x, y: 0, z: v.z }, true);
    c.attachedTo = null;
    this.load = null;
  }

  syncPose(snap = false) {
    const q = _q.setFromAxisAngle(UP, this.yaw);
    if (snap) {
      this.body.setTranslation({ x: this.pos.x, y: this.pos.y, z: this.pos.z }, true);
      this.body.setRotation(q, true);
    }
    this.body.setNextKinematicTranslation({ x: this.pos.x, y: this.pos.y, z: this.pos.z });
    this.body.setNextKinematicRotation(q);
  }

  fixedUpdate(dt) {
    const inp = this.game.input;
    const driving = !!this.driver && inp.locked;
    let thr = 0, st = 0, lift = 0;
    if (driving) {
      thr = inp.axis('KeyS', 'KeyW');
      st = inp.axis('KeyD', 'KeyA');
      lift = (inp.held('Space') ? 1 : 0) - (inp.held('KeyC') ? 1 : 0);
    }
    const target = thr * (thr > 0 ? 5.5 : 3);
    this.speed += (target - this.speed) * Math.min(1, dt * (thr ? 1.6 : 3));
    this.steer += (st * 0.75 - this.steer) * Math.min(1, dt * 5);
    this.lift = Math.max(0.12, Math.min(2.3, this.lift + lift * dt * 0.6));
    const fwd = new THREE.Vector3(0, 0, -1).applyAxisAngle(UP, this.yaw);
    const dx = fwd.x * this.speed * dt, dz = fwd.z * this.speed * dt;
    if (Math.abs(this.speed) > 0.01) {
      const shape = new R.Cuboid(0.55, 0.38, 1.15);
      const hit = this.game.physics.world.castShape(
        { x: this.pos.x, y: this.pos.y + 0.62, z: this.pos.z }, _q.setFromAxisAngle(UP, this.yaw), { x: dx / dt, y: 0, z: dz / dt }, shape, 0, dt * 1.5, true,
        undefined, groups(GROUP.VEHICLE, GROUP.STATIC | GROUP.VEHICLE), undefined, this.body,
      );
      if (hit) this.speed *= -0.2;
      else {
        this.pos.x += dx;
        this.pos.z += dz;
        this.yaw += (this.speed * Math.tan(this.steer) / 1.6) * dt * (this.speed >= 0 ? 1 : 1);
      }
    }
    this.pos.y = floorBaseHeightAt(this.pos.x, this.pos.z);
    this.p0.copy(this.p1);
    this.p1.copy(this.pos);
    this.y0 = this.y1;
    this.y1 = this.yaw;
    this.syncPose();
    if (driving) {
      if (inp.pressed('KeyG')) this.drop();
      if (!this.load && Math.abs(this.speed) > 0.05) this.tryPickup();
    }
    if (this.load) {
      const q = new THREE.Quaternion().setFromAxisAngle(UP, this.yaw);
      const p = this.loadLocal.clone();
      p.y += this.lift;
      p.applyQuaternion(q).add(this.pos);
      const lq = this.loadQuat.clone().premultiply(q);
      this.load.body.setNextKinematicTranslation({ x: p.x, y: p.y, z: p.z });
      this.load.body.setNextKinematicRotation(lq);
    }
    if (this.driver) {
      const seat = new THREE.Vector3(0, 0.3, 0.4).applyAxisAngle(UP, this.yaw).add(this.pos);
      const d = this.driver;
      d.p0.copy(d.p1);
      d.p1.copy(seat);
      d.body.setNextKinematicTranslation({ x: seat.x, y: seat.y + 0.85, z: seat.z });
    }
  }

  update(dt, alpha) {
    const p = _v.lerpVectors(this.p0, this.p1, alpha);
    this.mesh.position.copy(p);
    this.mesh.rotation.set(0, this.y0 + (this.y1 - this.y0) * alpha, 0);
    this.carriage.position.y = this.lift;
    this.innerMast.position.y = Math.max(0, this.lift - 0.4) * 0.5;
    for (const w of this.rearWheels) w.rotation.y = this.steer;
    if (this.driver && this.game.input.pressed('KeyE')) this.exitLatch = true;
  }

  lateUpdate() {
    if (this.exitLatch) {
      this.exitLatch = false;
      if (this.driver) this.exit();
    }
  }
}
