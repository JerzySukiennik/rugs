// Rug Rush net players: virtual input for remote players, pose sample buffers, and the remote player proxy (camera, capsule, controller, avatar).
import * as THREE from 'three';
import { R, GROUP, groups } from '../core/physics.js';
import { PLAYER_DIMS } from '../player/player.js';
import { RAGDOLL_PARTS } from '../player/ragdoll.js';
import { createAvatar } from './avatarAdapter.js';
import { slerpArr, lerpAngle } from './codec.js';

const { RADIUS, HALF } = PLAYER_DIMS;
export const PART_COUNT = RAGDOLL_PARTS.length;
const _v = new THREE.Vector3();

export class NetInput {
  constructor() {
    this.down = new Set();
    this.pressedSet = new Set();
    this.releasedSet = new Set();
    this.mouseDown = [false, false, false];
    this.mousePressed = [false, false, false];
    this.mouseReleased = [false, false, false];
    this.wheel = 0;
    this.locked = true;
    this.enabled = true;
  }

  held(code) { return this.down.has(code); }
  pressed(code) { return this.pressedSet.has(code); }
  released(code) { return this.releasedSet.has(code); }
  axis(neg, pos) { return (this.down.has(pos) ? 1 : 0) - (this.down.has(neg) ? 1 : 0); }
  takeLook() { return { x: 0, y: 0 }; }
  lock() {}
  unlock() {}

  apply(code, isDown) {
    if (code === 'M0' || code === 'M2') {
      const b = code === 'M0' ? 0 : 2;
      if (isDown) {
        this.mouseDown[b] = true;
        this.mousePressed[b] = true;
      } else if (this.mouseDown[b] || this.mousePressed[b]) {
        this.mouseDown[b] = false;
        this.mouseReleased[b] = true;
      }
      return;
    }
    if (isDown) {
      this.down.add(code);
      this.pressedSet.add(code);
    } else if (this.down.has(code) || this.pressedSet.has(code)) {
      this.down.delete(code);
      this.releasedSet.add(code);
    }
  }

  releaseAll() {
    for (const c of [...this.down]) this.apply(c, false);
    for (const b of ['M0', 'M2']) this.apply(b, false);
  }

  lateUpdate() {
    this.pressedSet.clear();
    this.releasedSet.clear();
    this.mousePressed.fill(false);
    this.mouseReleased.fill(false);
    this.wheel = 0;
  }
}

export class Track {
  constructor(max = 10) {
    this.s = [];
    this.max = max;
  }

  push(t, v) {
    const s = this.s;
    const last = s[s.length - 1];
    if (last && t <= last.t) {
      if (t === last.t) s[s.length - 1] = { t, v };
      return;
    }
    if (last && t - last.t > 150) s.push({ t: t - 50, v: last.v });
    s.push({ t, v });
    while (s.length > this.max) s.shift();
  }

  get last() {
    return this.s[this.s.length - 1] ?? null;
  }

  bracket(t) {
    const s = this.s;
    if (!s.length) return null;
    if (t <= s[0].t) return { a: s[0].v, b: s[0].v, k: 0, age: 0 };
    for (let i = s.length - 1; i > 0; i--) {
      if (t >= s[i - 1].t) {
        if (t >= s[i].t) return { a: s[i].v, b: s[i].v, k: 1, age: t - s[i].t };
        return { a: s[i - 1].v, b: s[i].v, k: (t - s[i - 1].t) / Math.max(1e-3, s[i].t - s[i - 1].t), age: 0 };
      }
    }
    return { a: s[0].v, b: s[0].v, k: 0, age: 0 };
  }
}

export function lerpPose(a, b, k, out = {}) {
  out.pos = out.pos ?? [0, 0, 0];
  for (let i = 0; i < 3; i++) out.pos[i] = a.pos[i] + (b.pos[i] - a.pos[i]) * k;
  out.yaw = lerpAngle(a.yaw, b.yaw, k);
  out.pitch = a.pitch + (b.pitch - a.pitch) * k;
  out.crouch = a.crouch + (b.crouch - a.crouch) * k;
  out.eyeH = a.eyeH + (b.eyeH - a.eyeH) * k;
  out.speed = a.speed + (b.speed - a.speed) * k;
  out.vel = b.vel;
  out.flags = k < 0.5 ? a.flags : b.flags;
  out.parts = null;
  const pa = a.parts ?? b.parts, pb = b.parts ?? a.parts;
  if (pa && pb && (out.flags & 1)) {
    out.parts = [];
    for (let i = 0; i < pa.length; i++) {
      const p = [pa[i].p[0] + (pb[i].p[0] - pa[i].p[0]) * k, pa[i].p[1] + (pb[i].p[1] - pa[i].p[1]) * k, pa[i].p[2] + (pb[i].p[2] - pa[i].p[2]) * k];
      out.parts.push({ p, q: slerpArr(pa[i].q, pb[i].q, k, [0, 0, 0, 1]) });
    }
  }
  return out;
}

export class NetPlayer {
  constructor(game, { slot, peerId, look, physical = false, controller = false }) {
    this.game = game;
    this.kind = 'player';
    this.remote = true;
    this.slot = slot;
    this.peerId = peerId;
    this.look = look;
    this.name = look.name;
    this.camera = new THREE.PerspectiveCamera(72, 16 / 9, 0.03, 60);
    this.eye = new THREE.Vector3();
    this.forward = new THREE.Vector3(0, 0, -1);
    this.velocity = new THREE.Vector3();
    this.feet = new THREE.Vector3(0, -50, 0);
    this.p0 = this.feet.clone();
    this.p1 = this.feet.clone();
    this.yaw = 0;
    this.pitch = 0;
    this.crouch = 0;
    this.eyeH = PLAYER_DIMS.EYE;
    this.speed = 0;
    this.flags = 0;
    this.ragdolled = false;
    this.parts = null;
    this.inVehicle = null;
    this.frozen = false;
    this.speedMul = 1;
    this.grounded = true;
    this.sprinting = false;
    this.contacts = [];
    this.track = new Track(12);
    this.view = {};
    this.hasPose = false;
    this.holding = null;
    this.immuneUntil = 0;
    this.grab = null;
    this.input = null;
    this.avatar = null;
    this.disposed = false;
    if (physical) {
      this.groupsSelf = groups(GROUP.PLAYER, GROUP.ALL & ~GROUP.HELD & ~GROUP.TRIGGER & ~GROUP.PLAYER);
      const desc = R.ColliderDesc.capsule(HALF, RADIUS).setCollisionGroups(this.groupsSelf);
      if (controller) desc.setActiveEvents(R.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(400);
      this.body = game.physics.createBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(0, -50, 0), [desc], this);
      this.collider = this.body.collider(0);
    }
    if (controller) {
      const cc = game.physics.world.createCharacterController(0.02);
      cc.enableAutostep(0.22, 0.15, true);
      cc.enableSnapToGround(0.25);
      cc.setMaxSlopeClimbAngle((50 * Math.PI) / 180);
      cc.setApplyImpulsesToDynamicBodies(true);
      cc.setCharacterMass(80);
      cc.setUp({ x: 0, y: 1, z: 0 });
      this.cc = cc;
    }
    createAvatar(look).then((a) => {
      if (this.disposed) return a.dispose?.();
      this.avatar = a;
      game.engine.scene.add(a.object3d);
    });
  }

  get position() {
    return this.feet;
  }

  onContactForce(other, force) {
    this.onHit?.(other, force);
  }

  setEnabled(on) {
    this.collider?.setEnabled(on && !this.ragdolled);
  }

  teleport(pos, yaw = this.yaw) {
    this.feet.copy(pos);
    this.p0.copy(pos);
    this.p1.copy(pos);
    this.yaw = yaw;
    this.body?.setTranslation({ x: pos.x, y: pos.y + HALF + RADIUS, z: pos.z }, true);
    this.onTeleport?.(pos, yaw);
  }

  applyPose(v) {
    this.feet.set(v.pos[0], v.pos[1], v.pos[2]);
    this.yaw = v.yaw;
    this.pitch = v.pitch;
    this.crouch = v.crouch;
    this.eyeH = v.eyeH;
    this.speed = v.speed;
    this.flags = v.flags;
    this.sprinting = !!(v.flags & 4);
    this.grounded = !!(v.flags & 8);
    if (v.vel) this.velocity.set(v.vel[0], v.vel[1], v.vel[2]);
    const rag = !!(v.flags & 1);
    if (rag !== this.ragdolled) {
      this.ragdolled = rag;
      this.collider?.setEnabled(!rag && !this.inVehicle);
    }
    this.parts = rag ? v.parts : null;
    this.updateCamera();
    this.hasPose = true;
  }

  updateCamera() {
    this.eye.set(this.feet.x, this.feet.y + this.eyeH, this.feet.z);
    this.camera.position.copy(this.eye);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    this.camera.updateMatrixWorld();
    this.camera.getWorldDirection(this.forward);
  }

  moveBody(dt) {
    if (!this.body || this.ragdolled || this.inVehicle) return;
    const target = this.feet;
    const t = this.body.translation();
    const tx = target.x, ty = target.y + HALF + RADIUS, tz = target.z;
    const dx = tx - t.x, dy = ty - t.y, dz = tz - t.z;
    if (dx * dx + dy * dy + dz * dz < 4e-6) return;
    if (dx * dx + dy * dy + dz * dz > 2.25 || !this.cc) {
      if (dx * dx + dy * dy + dz * dz > 2.25) this.body.setTranslation({ x: tx, y: ty, z: tz }, true);
      this.body.setNextKinematicTranslation({ x: tx, y: ty, z: tz });
      return;
    }
    this.cc.computeColliderMovement(this.collider, { x: dx, y: dy, z: dz }, R.QueryFilterFlags.EXCLUDE_SENSORS, this.groupsSelf);
    const mv = this.cc.computedMovement();
    this.body.setNextKinematicTranslation({ x: t.x + mv.x, y: t.y + mv.y, z: t.z + mv.z });
  }

  ragdollParts() {
    if (!this.parts) return null;
    const out = this.view.partsOut ?? (this.view.partsOut = RAGDOLL_PARTS.map((p) => ({ name: p.n, pos: new THREE.Vector3(), quat: new THREE.Quaternion() })));
    for (let i = 0; i < out.length && i < this.parts.length; i++) {
      const s = this.parts[i];
      out[i].pos.set(s.p[0], s.p[1], s.p[2]);
      out[i].quat.set(s.q[0], s.q[1], s.q[2], s.q[3]);
    }
    return out;
  }

  pushers() {
    if (!this.hasPose) return [];
    if (this.parts) return this.parts.filter((_, i) => i !== 2).map((s) => {
      const v = new THREE.Vector3(s.p[0], s.p[1], s.p[2]);
      return { a: v, b: v, r: 0.15 };
    });
    if (this.inVehicle) return [];
    const f = this.feet;
    return [{ a: new THREE.Vector3(f.x, f.y + 0.3, f.z), b: new THREE.Vector3(f.x, f.y + 1.5, f.z), r: 0.3 }];
  }

  renderAvatar(v) {
    const a = this.avatar;
    if (!a || !v) return;
    _v.set(v.pos[0], v.pos[1], v.pos[2]);
    let parts = null;
    if (v.parts) {
      const out = this.view.rpOut ?? (this.view.rpOut = RAGDOLL_PARTS.map((p) => ({ name: p.n, pos: new THREE.Vector3(), quat: new THREE.Quaternion() })));
      for (let i = 0; i < out.length && i < v.parts.length; i++) {
        out[i].pos.set(v.parts[i].p[0], v.parts[i].p[1], v.parts[i].p[2]);
        out[i].quat.set(v.parts[i].q[0], v.parts[i].q[1], v.parts[i].q[2], v.parts[i].q[3]);
      }
      parts = out;
    }
    a.object3d.visible = true;
    a.setPose({ pos: _v, yaw: v.yaw, pitch: v.pitch, crouch: v.crouch, speed: v.speed, holding: this.holding, ragdollParts: parts });
  }

  dispose() {
    this.disposed = true;
    this.input?.releaseAll?.();
    if (this.grab) {
      this.grab.release();
      this.game.engine.remove(this.grab);
    }
    if (this.input) this.game.engine.remove(this.input);
    if (this.body) this.game.physics.removeBody(this.body);
    if (this.cc) this.game.physics.world.removeCharacterController(this.cc);
    this.avatar?.dispose?.();
    this.avatar?.object3d?.removeFromParent();
  }
}
