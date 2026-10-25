// Rug Rush trucks: kinematic box trucks that drive in, reverse to a dock, open doors and lower a ramp, then leave.
import * as THREE from 'three';
import { R, GROUP, groups } from '../core/physics.js';

const LEN = 7.5;
const BED = 0.62;
const BOX = { x0: -3.75, x1: 1.75, hz: 1.25, h: 2.3 };
const _v = new THREE.Vector3();

function sideTexture(text, color) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 384;
  const g = c.getContext('2d');
  g.fillStyle = '#f3f4f2';
  g.fillRect(0, 0, 1024, 384);
  g.fillStyle = color;
  g.fillRect(0, 250, 1024, 70);
  g.font = 'bold 92px Helvetica, Arial, sans-serif';
  g.fillStyle = color;
  g.fillText(text[0], 50, 170);
  g.font = '40px Helvetica, Arial, sans-serif';
  g.fillStyle = '#ffffff';
  g.fillText(text[1], 50, 298);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function bezier(p0, p1, p2, p3, t, out) {
  const u = 1 - t;
  return out.set(
    u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    0,
    u * u * u * p0.z + 3 * u * u * t * p1.z + 3 * u * t * t * p2.z + t * t * t * p3.z,
  );
}

export class Truck {
  constructor(game, { dock, role }) {
    this.game = game;
    this.kind = 'truck';
    this.role = role;
    this.dock = dock;
    this.capacity = 3;
    this.state = 'away';
    this.t = 0;
    this.wait = role === 'in' ? 1 : 6;
    this.door = 0;
    this.ramp = 0;
    this.pos = new THREE.Vector3(70, 0, dock.z);
    this.yaw = 0;
    this.cargo = [];
    this.emptyTime = 0;
    this.trips = 0;
    this.parkX = dock.x + 0.35 - BOX.x0;
    this.buildMesh();
    this.buildBody();
    this.visible(false);
  }

  buildMesh() {
    const g = new THREE.Group();
    const color = this.role === 'in' ? '#2563b8' : '#1f8a4c';
    const m = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: o.r ?? 0.5, metalness: o.m ?? 0 });
    const add = (geo, mat, x, y, z) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      g.add(mesh);
      return mesh;
    };
    const boxL = BOX.x1 - BOX.x0;
    const tex = sideTexture(this.role === 'in' ? ['GZOWO RUG LOGISTICS', 'dirty rugs in · since 2012'] : ['CLEAN RUG EXPRESS', 'clean rugs out · same day'], color);
    const white = m('#f3f4f2', { r: 0.45 });
    const sideMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45 });
    const hidden = new THREE.MeshBasicMaterial({ visible: false });
    const shell = new THREE.Mesh(new THREE.BoxGeometry(boxL, BOX.h + 0.1, BOX.hz * 2 + 0.06), [white, hidden, white, white, sideMat, sideMat]);
    shell.position.set((BOX.x0 + BOX.x1) / 2, BED + BOX.h / 2, 0);
    shell.castShadow = true;
    g.add(shell);
    const innerMat = new THREE.MeshStandardMaterial({ color: '#c9cbc7', roughness: 0.8, side: THREE.BackSide });
    const inner = new THREE.Mesh(new THREE.BoxGeometry(boxL - 0.1, BOX.h - 0.04, BOX.hz * 2 - 0.06), [innerMat, hidden, innerMat, innerMat, innerMat, innerMat]);
    inner.position.copy(shell.position);
    inner.receiveShadow = true;
    g.add(inner);
    shell.visible = true;
    this.shell = shell;
    const bedMat = m('#5d5f61', { r: 0.8 });
    add(new THREE.BoxGeometry(boxL, 0.04, BOX.hz * 2 - 0.08), bedMat, (BOX.x0 + BOX.x1) / 2, BED + 0.02, 0).name = 'bed';
    add(new THREE.BoxGeometry(LEN - 0.2, 0.2, 2.0), m('#2b2d2f', { r: 0.7 }), 0, 0.48, 0);
    add(new THREE.BoxGeometry(1.95, 1.7, 2.4), m(color, { r: 0.35 }), 2.75, 1.45, 0);
    add(new THREE.BoxGeometry(0.9, 0.7, 2.3), m('#9fc4dc', { r: 0.08, m: 0.2 }), 3.25, 2.0, 0);
    add(new THREE.BoxGeometry(0.15, 0.35, 2.3), m('#222', { r: 0.6 }), 3.72, 0.75, 0);
    const wheelGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.3, 18);
    wheelGeo.rotateX(Math.PI / 2);
    const wm = m('#1a1a1a', { r: 0.9 });
    for (const [x, z] of [[2.6, 1.05], [2.6, -1.05], [-2.4, 1.05], [-2.4, -1.05], [-1.65, 1.05], [-1.65, -1.05]]) add(wheelGeo, wm, x, 0.3, z);
    this.doors = [];
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(BOX.x0 - 0.03, BED + BOX.h / 2, s * BOX.hz);
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.05, BOX.h, BOX.hz), m('#e9eae8', { r: 0.45 }));
      leaf.position.set(0, 0, -s * BOX.hz / 2);
      leaf.castShadow = true;
      pivot.add(leaf);
      g.add(pivot);
      this.doors.push({ pivot, s });
    }
    this.lights = [];
    for (const s of [-1, 1]) {
      const l = add(new THREE.BoxGeometry(0.04, 0.12, 0.2), new THREE.MeshStandardMaterial({ color: '#ff3b2f', emissive: '#ff1a0a', emissiveIntensity: 0 }), BOX.x0 - 0.04, 0.55, s * 1.05);
      this.lights.push(l);
    }
    this.rampMesh = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.05, 2.2), m('#a3a8ad', { r: 0.55, m: 0.3 }));
    this.rampMesh.castShadow = true;
    this.rampMesh.receiveShadow = true;
    g.add(this.rampMesh);
    this.mesh = g;
    this.game.engine.scene.add(g);
    this.mesh.traverse((o) => { o.userData.owner = this; });
  }

  buildBody() {
    const C = (hx, hy, hz, x, y, z) => R.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z).setFriction(0.9).setCollisionGroups(groups(GROUP.VEHICLE));
    const cx = (BOX.x0 + BOX.x1) / 2, hl = (BOX.x1 - BOX.x0) / 2;
    const cy = BED + BOX.h / 2;
    this.body = this.game.physics.createBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(this.pos.x, 0, this.pos.z), [
      C(hl, 0.12, BOX.hz, cx, BED - 0.12, 0),
      C(hl, BOX.h / 2, 0.04, cx, cy, BOX.hz + 0.02),
      C(hl, BOX.h / 2, 0.04, cx, cy, -BOX.hz - 0.02),
      C(0.05, BOX.h / 2, BOX.hz, BOX.x1, cy, 0),
      C(hl, 0.05, BOX.hz, cx, BED + BOX.h + 0.03, 0),
      C(1.0, 0.95, 1.2, 2.75, 1.4, 0),
      C(0.04, BOX.h / 2, BOX.hz, BOX.x0 - 0.02, cy, 0),
    ], this);
    this.rearWall = this.body.collider(6);
    this.rampCollider = null;
  }

  visible(v) {
    this.mesh.visible = v;
    const n = this.body.numColliders();
    for (let i = 0; i < n; i++) this.body.collider(i).setEnabled(v && (i !== 6 || this.door < 0.5));
  }

  localToWorld(x, y, z, out = new THREE.Vector3()) {
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    return out.set(this.pos.x + x * c + z * s, y, this.pos.z - x * s + z * c);
  }

  worldToLocal(p, out = new THREE.Vector3()) {
    const dx = p.x - this.pos.x, dz = p.z - this.pos.z;
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    return out.set(dx * c - dz * s, p.y, dx * s + dz * c);
  }

  inCargo(p) {
    const l = this.worldToLocal(p, _v);
    return l.x > BOX.x0 - 0.2 && l.x < BOX.x1 && Math.abs(l.z) < BOX.hz + 0.1 && l.y > BED - 0.3 && l.y < BED + BOX.h;
  }

  carpetsInside() {
    const out = [];
    for (const c of this.game.carpets?.list ?? []) {
      const p = c.body ? c.body.translation() : c.uvToWorld?.(0.5, 0.5)?.point;
      if (p && this.inCargo(p)) out.push(c);
    }
    return out;
  }

  setPose() {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    this.body.setNextKinematicTranslation({ x: this.pos.x, y: 0, z: this.pos.z });
    this.body.setNextKinematicRotation(q);
    this.mesh.position.copy(this.pos);
    this.mesh.quaternion.copy(q);
  }

  teleport() {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    this.body.setTranslation({ x: this.pos.x, y: 0, z: this.pos.z }, true);
    this.body.setRotation(q, true);
    this.setPose();
  }

  deployRamp(on) {
    const ph = this.game.physics;
    if (on && !this.rampCollider) {
      const ang = Math.atan2(BED, 1.6);
      const mid = this.localToWorld(BOX.x0 - 0.8, BED / 2 - 0.02, 0);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, this.yaw, ang, 'YXZ'));
      this.rampCollider = ph.addCollider(R.ColliderDesc.cuboid(0.86, 0.03, 1.1).setTranslation(mid.x, mid.y, mid.z).setRotation(q).setFriction(1).setCollisionGroups(groups(GROUP.STATIC)), null, this);
    } else if (!on && this.rampCollider) {
      ph.removeCollider(this.rampCollider);
      this.rampCollider = null;
    }
  }

  start() {
    this.state = 'arrive';
    this.t = 0;
    this.yaw = -Math.PI / 2;
    this.pos.set(this.parkX + 10, 0, this.dock.z - 48);
    this.visible(true);
    this.teleport();
  }

  fixedUpdate(dt) {
    this.t += dt;
    const P = this.parkX, Z = this.dock.z;
    if (this.state === 'away') {
      this.wait -= dt;
      if (this.wait <= 0) this.start();
    } else if (this.state === 'arrive') {
      const d = 54, sp = 9;
      const s = Math.min(1, (this.t * sp) / d);
      const e = 1 - Math.pow(1 - s, 2);
      this.pos.set(P + 10, 0, Z - 48 + e * d);
      this.yaw = -Math.PI / 2;
      this.setPose();
      if (s >= 1) { this.state = 'reverse'; this.t = 0; }
    } else if (this.state === 'reverse') {
      const dur = 7;
      const s = Math.min(1, this.t / dur);
      const e = s * s * (3 - 2 * s);
      const p0 = { x: P + 10, z: Z + 6 }, p1 = { x: P + 10, z: Z - 1 }, p2 = { x: P + 6, z: Z }, p3 = { x: P, z: Z };
      bezier(p0, p1, p2, p3, e, this.pos);
      const a = bezier(p0, p1, p2, p3, Math.min(1, e + 0.01), new THREE.Vector3());
      const b = bezier(p0, p1, p2, p3, Math.max(0, e - 0.01), new THREE.Vector3());
      const tx = a.x - b.x, tz = a.z - b.z;
      if (Math.hypot(tx, tz) > 1e-5) this.yaw = Math.atan2(tz, -tx);
      this.setPose();
      const blink = Math.sin(this.t * 12) > 0 ? 3 : 0.3;
      for (const l of this.lights) l.material.emissiveIntensity = blink;
      if (s >= 1) {
        for (const l of this.lights) l.material.emissiveIntensity = 0;
        this.yaw = 0;
        this.setPose();
        this.state = 'parked';
        this.t = 0;
        if (this.role === 'in') this.game.onTruckParked?.(this);
      }
    } else if (this.state === 'parked') {
      if (this.t > 0.6) { this.state = 'opening'; this.t = 0; }
    } else if (this.state === 'opening') {
      this.door = Math.min(1, this.t / 1.6);
      this.ramp = Math.max(0, Math.min(1, (this.t - 0.8) / 1.4));
      if (this.door > 0.5) this.rearWall.setEnabled(false);
      if (this.ramp >= 1) {
        this.deployRamp(true);
        this.state = 'open';
        this.t = 0;
        this.emptyTime = 0;
      }
    } else if (this.state === 'open') {
      const inside = this.carpetsInside();
      if (this.role === 'in') {
        this.emptyTime = inside.length === 0 ? this.emptyTime + dt : 0;
        if (this.emptyTime > 3) this.close();
      } else {
        const wrapped = inside.filter((c) => c.wrapped);
        if (wrapped.length >= this.capacity || this.dispatchRequested) this.close();
      }
    } else if (this.state === 'closing') {
      this.ramp = Math.max(0, 1 - this.t / 1.2);
      this.door = Math.max(0, 1 - Math.max(0, this.t - 1.0) / 1.5);
      if (this.ramp < 1) this.deployRamp(false);
      if (this.door < 0.5) this.rearWall.setEnabled(true);
      if (this.door <= 0) {
        this.state = 'leave';
        this.t = 0;
        if (this.role === 'out') this.game.onTruckDispatched?.(this, this.carpetsInside());
        else for (const c of this.carpetsInside()) this.game.removeCarpet?.(c);
      }
    } else if (this.state === 'leave') {
      const s = this.t * this.t * 1.2;
      this.pos.set(this.parkX + s, 0, this.dock.z);
      this.yaw = 0;
      this.setPose();
      for (const c of this.carpetsInside()) this.game.removeCarpet?.(c);
      if (this.pos.x > this.parkX + 60) {
        this.state = 'away';
        this.wait = this.role === 'in' ? 9 : 8;
        this.dispatchRequested = false;
        this.trips++;
        this.visible(false);
      }
    }
    this.animate();
  }

  close() {
    this.state = 'closing';
    this.t = 0;
  }

  animate() {
    const e = this.door * this.door * (3 - 2 * this.door);
    for (const d of this.doors) d.pivot.rotation.y = d.s * e * 1.75;
    const r = this.ramp;
    const ang = Math.atan2(BED, 1.6);
    this.rampMesh.position.set(BOX.x0 + 0.86 - 1.66 * r, BED - 0.1 + (BED / 2 + 0.1 - BED) * r, 0);
    this.rampMesh.rotation.set(0, 0, ang * r);
    this.rampMesh.visible = r > 0.02;
  }

  cargoSlot(i) {
    const x = BOX.x0 + 0.8 + i * 1.5;
    return this.localToWorld(x, BED + 0.35, 0);
  }

  get isOpen() {
    return this.state === 'open';
  }
}
