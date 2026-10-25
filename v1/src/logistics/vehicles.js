// Rug Rush vehicles: a push cart for rolls and a drivable forklift with a carpet ram that skewers rolled rugs.
import * as THREE from 'three';
import { R, GROUP, groups } from '../core/physics.js';
import { floorBaseHeightAt } from '../world/layout.js';

const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();

export class Cart {
  constructor(game, pos, yaw = 0) {
    this.game = game;
    this.kind = 'cart';
    this.label = 'Platform cart';
    this.holdStyle = 'heavy';
    this.grabbable = true;
    const g = new THREE.Group();
    const m = (c, r = 0.5, me = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: me });
    const add = (geo, mat, x, y, z) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      g.add(mesh);
      return mesh;
    };
    add(new THREE.BoxGeometry(1.4, 0.05, 0.75), m('#2f6db5', 0.5, 0.2), 0, 0.22, 0);
    add(new THREE.BoxGeometry(1.36, 0.01, 0.71), m('#333', 0.9), 0, 0.25, 0);
    const bar = m('#9aa1a6', 0.3, 0.8);
    add(new THREE.BoxGeometry(0.04, 0.85, 0.04), bar, -0.68, 0.65, 0.33);
    add(new THREE.BoxGeometry(0.04, 0.85, 0.04), bar, -0.68, 0.65, -0.33);
    add(new THREE.BoxGeometry(0.04, 0.04, 0.7), bar, -0.68, 1.06, 0);
    const wg = new THREE.CylinderGeometry(0.08, 0.08, 0.05, 14);
    wg.rotateX(Math.PI / 2);
    for (const [x, z] of [[0.6, 0.3], [0.6, -0.3], [-0.6, 0.3], [-0.6, -0.3]]) add(wg, m('#1a1a1a', 0.8), x, 0.08, z);
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
    const m = (c, r = 0.5, me = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: me });
    const add = (geo, mat, x, y, z, parent = g) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };
    const yel = m('#f2b630', 0.45);
    add(new THREE.BoxGeometry(1.1, 0.7, 1.9), yel, 0, 0.6, 0.1);
    add(new THREE.BoxGeometry(1.1, 0.75, 0.45), m('#333', 0.6), 0, 0.65, 1.1);
    add(new THREE.BoxGeometry(0.55, 0.12, 0.5), m('#1a1a1a', 0.8), 0, 1.0, 0.35);
    add(new THREE.BoxGeometry(0.5, 0.55, 0.1), m('#1a1a1a', 0.8), 0, 1.3, 0.6);
    const cage = m('#2b2d30', 0.5, 0.4);
    for (const [x, z] of [[0.5, -0.45], [-0.5, -0.45], [0.5, 0.75], [-0.5, 0.75]]) add(new THREE.BoxGeometry(0.06, 1.55, 0.06), cage, x, 1.68, z);
    add(new THREE.BoxGeometry(1.06, 0.05, 1.26), cage, 0, 2.45, 0.15);
    const mastM = m('#4d5257', 0.4, 0.6);
    add(new THREE.BoxGeometry(0.08, 2.6, 0.12), mastM, 0.35, 1.3, -0.95);
    add(new THREE.BoxGeometry(0.08, 2.6, 0.12), mastM, -0.35, 1.3, -0.95);
    const wg = new THREE.CylinderGeometry(0.3, 0.3, 0.22, 16);
    wg.rotateZ(Math.PI / 2);
    for (const [x, z] of [[0.5, -0.6], [-0.5, -0.6]]) add(wg, m('#1a1a1a', 0.85), x, 0.3, z);
    const rg = new THREE.CylinderGeometry(0.22, 0.22, 0.2, 14);
    rg.rotateZ(Math.PI / 2);
    this.rearWheels = [];
    for (const x of [0.48, -0.48]) {
      const w = add(rg, m('#1a1a1a', 0.85), x, 0.22, 0.95);
      this.rearWheels.push(w);
    }
    const carriage = new THREE.Group();
    g.add(carriage);
    add(new THREE.BoxGeometry(0.85, 0.35, 0.08), mastM, 0, 0, -1.05, carriage);
    const ramGeo = new THREE.CylinderGeometry(0.045, 0.03, 2.7, 12);
    ramGeo.rotateX(Math.PI / 2);
    add(ramGeo, m('#c3c7cb', 0.25, 0.9), 0, 0, -2.4, carriage);
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
