// Rug Rush first-person player: kinematic Rapier character, mouse look, sprint/crouch/jump, trip detection hooks.
import * as THREE from 'three';
import { R, GROUP, groups } from '../core/physics.js';

const RADIUS = 0.3;
const HALF = 0.55;
const EYE = 1.62;
const EYE_CROUCH = 1.05;

export class Player {
  constructor(engine, physics, input, { position = new THREE.Vector3(0, 0, 8), yaw = Math.PI } = {}) {
    this.kind = 'player';
    this.engine = engine;
    this.physics = physics;
    this.input = input;
    this.camera = engine.camera;
    this.yaw = yaw;
    this.pitch = -0.1;
    this.vel = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.speedMul = 1;
    this.grounded = false;
    this.crouch = 0;
    this.sprinting = false;
    this.eyeH = EYE;
    this.bob = 0;
    this.frozen = false;
    this.ragdolled = false;
    this.jumpLatch = false;
    this.lookEnabled = true;
    this.eye = new THREE.Vector3();
    this.forward = new THREE.Vector3(0, 0, -1);
    this.p0 = position.clone();
    this.p1 = position.clone();
    this.feet = position.clone();
    this.groupsSelf = groups(GROUP.PLAYER, GROUP.ALL & ~GROUP.HELD & ~GROUP.TRIGGER);
    this.body = physics.createBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(position.x, position.y + HALF + RADIUS, position.z), [
      R.ColliderDesc.capsule(HALF, RADIUS).setCollisionGroups(this.groupsSelf).setActiveEvents(R.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(400),
    ], this);
    this.collider = this.body.collider(0);
    const cc = physics.world.createCharacterController(0.02);
    cc.enableAutostep(0.22, 0.15, true);
    cc.enableSnapToGround(0.25);
    cc.setMaxSlopeClimbAngle((50 * Math.PI) / 180);
    cc.setMinSlopeSlideAngle((60 * Math.PI) / 180);
    cc.setApplyImpulsesToDynamicBodies(true);
    cc.setCharacterMass(80);
    cc.setUp({ x: 0, y: 1, z: 0 });
    this.cc = cc;
    this.contacts = [];
    this.onTrip = null;
    this.onHit = null;
    this.updateCamera(0);
  }

  get position() {
    return this.feet;
  }

  setEnabled(on) {
    this.collider.setEnabled(on);
  }

  teleport(pos, yaw = this.yaw) {
    this.body.setTranslation({ x: pos.x, y: pos.y + HALF + RADIUS, z: pos.z }, true);
    this.body.setNextKinematicTranslation({ x: pos.x, y: pos.y + HALF + RADIUS, z: pos.z });
    this.p0.copy(pos);
    this.p1.copy(pos);
    this.feet.copy(pos);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
  }

  onContactForce(other, force) {
    this.onHit?.(other, force);
  }

  fixedUpdate(dt) {
    if (this.ragdolled) return;
    const inp = this.input;
    const live = !this.frozen && inp.locked;
    const fx = live ? inp.axis('KeyA', 'KeyD') : 0;
    const fz = live ? inp.axis('KeyS', 'KeyW') : 0;
    const wantCrouch = live && (inp.held('KeyC') || inp.held('ControlLeft'));
    this.crouch += ((wantCrouch ? 1 : 0) - this.crouch) * Math.min(1, dt * 10);
    this.sprinting = live && inp.held('ShiftLeft') && fz > 0 && !wantCrouch;
    const base = wantCrouch ? 1.7 : this.sprinting ? 6.2 : 3.7;
    const speed = base * this.speedMul;
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    let wx = fx * cy - fz * sy;
    let wz = -fx * sy - fz * cy;
    const wl = Math.hypot(wx, wz);
    if (wl > 1) { wx /= wl; wz /= wl; }
    const accel = this.grounded ? 14 : 3;
    const k = Math.min(1, accel * dt);
    this.vel.x += (wx * speed - this.vel.x) * k;
    this.vel.z += (wz * speed - this.vel.z) * k;
    if (this.grounded && this.jumpLatch && live) {
      this.vel.y = 4.6;
      this.grounded = false;
    }
    this.jumpLatch = false;
    this.vel.y -= 9.81 * dt;
    if (this.vel.y < -30) this.vel.y = -30;
    const desired = { x: this.vel.x * dt, y: this.vel.y * dt, z: this.vel.z * dt };
    this.cc.computeColliderMovement(this.collider, desired, R.QueryFilterFlags.EXCLUDE_SENSORS, this.groupsSelf);
    const mv = this.cc.computedMovement();
    this.grounded = this.cc.computedGrounded();
    this.contacts.length = 0;
    const n = this.cc.numComputedCollisions();
    for (let i = 0; i < n; i++) {
      const c = this.cc.computedCollision(i);
      if (!c?.collider) continue;
      this.contacts.push({ owner: this.physics.ownerOf(c.collider), normal: c.normal1, point: c.witness1 });
    }
    const t = this.body.translation();
    const nx = t.x + mv.x, ny = t.y + mv.y, nz = t.z + mv.z;
    this.body.setNextKinematicTranslation({ x: nx, y: ny, z: nz });
    this.velocity.set(mv.x / dt, mv.y / dt, mv.z / dt);
    if (this.grounded && this.vel.y < 0) this.vel.y = -1;
    if (!this.grounded && this.velocity.y > -0.01 && this.vel.y > 0 && mv.y < desired.y * 0.5) this.vel.y = 0;
    this.p0.copy(this.p1);
    this.p1.set(nx, ny - HALF - RADIUS, nz);
    if (ny < -20) this.teleport(new THREE.Vector3(0, 1, 8));
  }

  update(dt, alpha) {
    if (this.ragdolled) return;
    if (this.input.pressed('Space')) this.jumpLatch = true;
    if (this.lookEnabled && this.input.locked) {
      const d = this.input.takeLook();
      this.yaw -= d.x;
      this.pitch = Math.max(-1.52, Math.min(1.52, this.pitch - d.y));
    } else this.input.takeLook();
    this.feet.lerpVectors(this.p0, this.p1, alpha);
    const hs = Math.hypot(this.velocity.x, this.velocity.z);
    if (this.grounded && hs > 0.5) this.bob += dt * hs * 2.1;
    this.updateCamera(dt);
  }

  updateCamera(dt) {
    const target = EYE + (EYE_CROUCH - EYE) * this.crouch;
    this.eyeH += (target - this.eyeH) * Math.min(1, dt * 12 || 1);
    const hs = Math.hypot(this.velocity.x, this.velocity.z);
    const bobAmt = this.grounded ? Math.min(1, hs / 6) * 0.035 : 0;
    this.camera.position.set(this.feet.x, this.feet.y + this.eyeH + Math.abs(Math.sin(this.bob)) * bobAmt, this.feet.z);
    this.camera.rotation.set(this.pitch, this.yaw, Math.sin(this.bob) * bobAmt * 0.25, 'YXZ');
    this.camera.updateMatrixWorld();
    this.eye.copy(this.camera.position);
    this.camera.getWorldDirection(this.forward);
  }
}

export const PLAYER_DIMS = { RADIUS, HALF, EYE };
