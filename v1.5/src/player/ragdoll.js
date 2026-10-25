// Rug Rush ragdoll: trips and hits turn the player into a jointed low-poly body, the camera rides the head, then they get back up.
import * as THREE from 'three';
import { R, GROUP, groups } from '../core/physics.js';

const UP = new THREE.Vector3(0, 1, 0);

const PARTS = [
  { n: 'pelvis', s: [0.17, 0.1, 0.11], p: [0, 0.95, 0], c: 'suit' },
  { n: 'torso', s: [0.19, 0.24, 0.12], p: [0, 1.3, 0], c: 'suit' },
  { n: 'head', r: 0.12, p: [0, 1.67, 0], c: 'skin' },
  { n: 'armL', cap: [0.22, 0.05], p: [-0.3, 1.3, 0], c: 'suit' },
  { n: 'armR', cap: [0.22, 0.05], p: [0.3, 1.3, 0], c: 'suit' },
  { n: 'thighL', cap: [0.17, 0.065], p: [-0.1, 0.62, 0], c: 'suit' },
  { n: 'thighR', cap: [0.17, 0.065], p: [0.1, 0.62, 0], c: 'suit' },
  { n: 'shinL', cap: [0.17, 0.055], p: [-0.1, 0.22, 0], c: 'boot' },
  { n: 'shinR', cap: [0.17, 0.055], p: [0.1, 0.22, 0], c: 'boot' },
];

export const RAGDOLL_PARTS = PARTS;

const JOINTS = [
  ['pelvis', 'torso', [0, 1.08, 0]],
  ['torso', 'head', [0, 1.55, 0]],
  ['torso', 'armL', [-0.22, 1.5, 0]],
  ['torso', 'armR', [0.22, 1.5, 0]],
  ['pelvis', 'thighL', [-0.1, 0.85, 0]],
  ['pelvis', 'thighR', [0.1, 0.85, 0]],
  ['thighL', 'shinL', [-0.1, 0.42, 0]],
  ['thighR', 'shinR', [0.1, 0.42, 0]],
];

export class Ragdoll {
  constructor(game, player, { suit = '#2f6db5', skin = '#e2b48f', boot = '#1d1f24' } = {}) {
    this.game = game;
    this.player = player;
    this.colors = { suit, skin, boot };
    this.active = null;
    this.camQ = new THREE.Quaternion();
    this.order = 20;
  }

  get immune() {
    return performance.now() < (this.immuneUntil ?? 0);
  }

  trigger(impulse = new THREE.Vector3(), reason = 'trip') {
    const p = this.player;
    if (p.ragdolled || p.inVehicle || this.immune) return;
    const g = this.game;
    g.grab?.release();
    p.ragdolled = true;
    p.setEnabled(false);
    const ph = g.physics;
    const yawQ = new THREE.Quaternion().setFromAxisAngle(UP, p.yaw);
    const base = p.feet.clone();
    const bodies = {};
    const meshes = [];
    const vel = p.velocity.clone();
    for (const part of PARTS) {
      const lp = new THREE.Vector3(...part.p).applyQuaternion(yawQ).add(base);
      let cd, geo;
      if (part.s) {
        cd = R.ColliderDesc.cuboid(...part.s);
        geo = new THREE.BoxGeometry(part.s[0] * 2, part.s[1] * 2, part.s[2] * 2);
      } else if (part.r) {
        cd = R.ColliderDesc.ball(part.r);
        geo = new THREE.SphereGeometry(part.r, 12, 10);
      } else {
        cd = R.ColliderDesc.capsule(part.cap[0], part.cap[1]);
        geo = new THREE.CapsuleGeometry(part.cap[1], part.cap[0] * 2, 4, 8);
      }
      cd.setDensity(part.n === 'torso' || part.n === 'pelvis' ? 900 : 1000).setFriction(0.9).setRestitution(0).setCollisionGroups(groups(GROUP.RAGDOLL, GROUP.ALL & ~GROUP.PLAYER & ~GROUP.HELD & ~GROUP.RAGDOLL));
      const body = ph.createBody(R.RigidBodyDesc.dynamic().setTranslation(lp.x, lp.y, lp.z).setRotation(yawQ).setLinvel(vel.x, vel.y, vel.z).setAngularDamping(2.5).setLinearDamping(0.35).setCcdEnabled(true), [cd], { kind: 'ragdoll' });
      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: this.colors[part.c], roughness: 0.6 }));
      mesh.castShadow = true;
      g.engine.scene.add(mesh);
      ph.bind(body, mesh);
      bodies[part.n] = body;
      meshes.push(mesh);
    }
    const joints = [];
    for (const [a, b, at] of JOINTS) {
      const w = new THREE.Vector3(...at).applyQuaternion(yawQ).add(base);
      const ba = bodies[a], bb = bodies[b];
      const la = this.toLocal(ba, w), lb = this.toLocal(bb, w);
      const j = ph.world.createImpulseJoint(R.JointData.spherical(la, lb), ba, bb, true);
      j.setContactsEnabled?.(false);
      joints.push(j);
    }
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(yawQ);
    if (reason === 'trip') {
      bodies.shinL.applyImpulse({ x: -fwd.x * 6, y: 0, z: -fwd.z * 6 }, true);
      bodies.shinR.applyImpulse({ x: -fwd.x * 6, y: 0, z: -fwd.z * 6 }, true);
      bodies.torso.applyImpulse({ x: fwd.x * 18, y: 2, z: fwd.z * 18 }, true);
    }
    bodies.torso.applyImpulse({ x: impulse.x, y: impulse.y, z: impulse.z }, true);
    this.active = { bodies, meshes, joints, t: 0 };
    this.camQ.copy(p.camera.quaternion);
    g.onRagdoll?.(reason);
  }

  toLocal(body, w) {
    const t = body.translation(), r = body.rotation();
    const q = new THREE.Quaternion(r.x, r.y, r.z, r.w).invert();
    const v = w.clone().sub(new THREE.Vector3(t.x, t.y, t.z)).applyQuaternion(q);
    return { x: v.x, y: v.y, z: v.z };
  }

  limbs() {
    if (!this.active) return [];
    const out = [];
    for (const n of ['torso', 'pelvis', 'thighL', 'thighR', 'shinL', 'shinR']) {
      const t = this.active.bodies[n].translation();
      const v = new THREE.Vector3(t.x, t.y, t.z);
      out.push({ a: v, b: v, r: 0.15 });
    }
    return out;
  }

  fixedUpdate(dt) {
    const a = this.active;
    if (!a) return;
    a.t += dt;
    let sum = 0, n = 0;
    for (const b of Object.values(a.bodies)) {
      const v = b.linvel();
      sum += Math.hypot(v.x, v.y, v.z);
      n++;
    }
    a.calm = sum / n < 0.6 ? (a.calm ?? 0) + dt : 0;
    if ((a.t > 1.6 && a.calm > 0.4) || a.t > 4.5) this.standUp();
  }

  update() {
    const a = this.active;
    if (!a) return;
    const p = this.player;
    const h = a.bodies.head.translation(), hr = a.bodies.head.rotation();
    const cam = p.camera;
    cam.position.set(h.x, h.y + 0.04, h.z);
    const hq = new THREE.Quaternion(hr.x, hr.y, hr.z, hr.w);
    this.camQ.slerp(hq, 0.12);
    cam.quaternion.copy(this.camQ);
    cam.updateMatrixWorld();
    p.eye.copy(cam.position);
    cam.getWorldDirection(p.forward);
    p.input.takeLook();
  }

  standUp() {
    const a = this.active;
    const p = this.player;
    const g = this.game;
    const t = a.bodies.pelvis.translation();
    const tr = a.bodies.torso.rotation();
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(new THREE.Quaternion(tr.x, tr.y, tr.z, tr.w));
    const yaw = Math.atan2(-fwd.x, -fwd.z);
    for (const j of a.joints) g.physics.world.removeImpulseJoint(j, true);
    for (const [, b] of Object.entries(a.bodies)) g.physics.removeBody(b);
    for (const m of a.meshes) {
      m.removeFromParent();
      m.geometry.dispose();
    }
    this.active = null;
    const ground = g.physics.raycast({ x: t.x, y: t.y + 0.3, z: t.z }, { x: 0, y: -1, z: 0 }, 3, { groupsMask: groups(GROUP.PLAYER, GROUP.STATIC | GROUP.VEHICLE) });
    const gy = ground ? ground.point.y : 0;
    p.teleport(new THREE.Vector3(t.x, gy + 0.02, t.z), Number.isFinite(yaw) ? yaw : p.yaw);
    this.immuneUntil = performance.now() + 3000;
    p.pitch = 0;
    p.ragdolled = false;
    p.setEnabled(true);
  }
}
