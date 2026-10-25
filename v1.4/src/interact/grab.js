// Rug Rush grab system: aim, pick up / drop / throw, velocity-driven tools, force-limited heavy carrying and cloth grabbing.
import * as THREE from 'three';
import { R, GROUP, groups, toVec } from '../core/physics.js';

const REACH = 2.6;
const STRENGTH = 430;
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _e = new THREE.Euler();
const DOWN = new THREE.Vector3(0, -1, 0);

export class Grab {
  constructor(engine, physics, input, player, opts = {}) {
    this.engine = engine;
    this.physics = physics;
    this.input = input;
    this.player = player;
    this.carpets = opts.carpets ?? null;
    this.hud = opts.hud ?? null;
    this.held = null;
    this.aim = null;
    this.holdDist = 1.5;
    this.lmb = false;
    this.rmb = false;
    this.rolling = null;
    this.onEvent = opts.onEvent ?? null;
    this.blocked = opts.blocked ?? null;
    this.canInteract = opts.canInteract ?? null;
    this.proxy = opts.proxy ?? null;
    player.grab = this;
  }

  heldItem() {
    return this.held?.kind === 'item' ? this.held.item : null;
  }

  heldBody() {
    return this.held?.body ?? null;
  }

  raycastAll(origin, dir, max = REACH, picks = false) {
    const exclude = this.heldBody();
    const hit = this.physics.raycast(origin, dir, max, {
      groupsMask: groups(GROUP.PLAYER, GROUP.ALL & ~GROUP.PLAYER & ~GROUP.HELD & ~GROUP.TRIGGER),
      predicate: exclude ? (c) => c.parent()?.handle !== exclude.handle : undefined,
    });
    let best = hit ? { ...hit, carpetHit: null } : null;
    const ch = this.carpets?.raycast(origin, dir, max);
    if (ch && (!best || ch.distance <= best.distance + 0.03)) {
      if (!(this.held?.kind === 'cloth' && this.held.carpet === ch.carpet)) best = { distance: ch.distance, point: ch.point.clone(), normal: ch.normal.clone(), owner: ch.carpet, carpetHit: ch, collider: null };
    }
    if (best?.owner?.kind === 'carpet' && !best.carpetHit && this.carpets) {
      const c2 = best.owner.raycast?.(origin, dir, max);
      if (c2) best.carpetHit = { ...c2, carpet: best.owner };
    }
    if (picks && this.extraPick) {
      const ex = this.extraPick(origin, dir, best ? best.distance : max, this);
      if (ex) best = ex;
    }
    return best;
  }

  surfaceAim(maxDist = 2.4) {
    const p = this.player;
    const hit = this.raycastAll(p.eye, p.forward, maxDist);
    if (hit) return hit;
    _a.copy(p.eye).addScaledVector(p.forward, maxDist);
    const down = this.raycastAll(_a, DOWN, 2.2);
    return down;
  }

  describe(hit) {
    if (!hit?.owner) return null;
    const o = hit.owner;
    if (o.kind === 'carpet') {
      if (hit.carpetHit?.part === 'label') return { label: 'Care label', actions: ['E read label'] };
      const acts = ['E grab'];
      if (o.state === 'rolled' && !o.wrapped) acts.push('R unroll');
      if (o.state !== 'rolled' && hit.carpetHit && (hit.carpetHit.uv.v < 0.1 || hit.carpetHit.uv.v > 0.9)) acts.push('R roll up');
      return { label: o.displayName?.() ?? 'Rug', actions: acts };
    }
    if (o.interact) return { label: o.label ?? 'Use', actions: [`E ${o.interactVerb ?? 'use'}`] };
    if (o.body && (o.holdStyle || o.grabbable)) return { label: o.label ?? 'Item', actions: ['E pick up'] };
    return null;
  }

  update() {
    const inp = this.input;
    const p = this.player;
    if (p.ragdolled) {
      if (this.held && !this.proxy) this.release();
      this.aim = null;
      return;
    }
    if (this.blocked?.()) {
      this.aim = null;
      this.lmb = false;
      return;
    }
    this.aim = this.raycastAll(p.eye, p.forward, REACH, true);
    if (this.aimFix) this.aim = this.aimFix(this.aim);
    if (!inp.locked) return;
    if (inp.wheel) this.holdDist = Math.max(0.9, Math.min(2.3, this.holdDist - inp.wheel * 0.15));
    if (this.proxy) return this.proxyUpdate();
    const item = this.heldItem();
    if (inp.pressed('KeyE')) {
      if (this.aim?.owner?.interact && (!this.held || this.aim.owner.acceptsHeld) && this.canInteract?.(this.aim.owner) !== false) this.aim.owner.interact(p, this);
      else if (this.aim?.carpetHit?.part === 'label') this.hud?.showCareLabel?.(this.aim.owner);
      else if (this.held) this.release();
      else if (this.aim) this.tryGrab(this.aim);
    }
    if (inp.pressed('KeyQ') && this.held) this.release();
    if (inp.pressed('KeyF') && this.held) this.throw();
    if (inp.pressed('KeyR') && !this.held && this.aim?.owner?.kind === 'carpet' && this.aim.owner.state === 'rolled' && !this.aim.owner.wrapped) {
      const dir = new THREE.Vector3(p.forward.x, 0, p.forward.z).normalize();
      this.aim.owner.unroll?.(dir);
      this.onEvent?.('unroll', this.aim.owner);
    } else if (inp.pressed('KeyR') && !this.held && this.aim?.carpetHit && this.aim.owner.state !== 'rolled') {
      const c = this.aim.owner;
      const edge = this.aim.carpetHit.uv.v < 0.5 ? 'v0' : 'v1';
      c.startRoll?.(edge);
      this.rolling = c;
    }
    if (this.rolling && (inp.released('KeyR') || this.rolling.state === 'rolled')) this.rolling = null;
    const lmb = inp.mouseDown[0], rmb = inp.mouseDown[2];
    if (item) {
      if (inp.mousePressed[0]) item.useStart?.(p, this);
      if (inp.mouseReleased[0]) item.useEnd?.(p, this);
      if (inp.mousePressed[2]) item.altStart?.(p, this);
      if (inp.mouseReleased[2]) item.altEnd?.(p, this);
      item.update?.(p, this);
    }
    this.lmb = lmb;
    this.rmb = rmb;
  }

  proxyUpdate() {
    const inp = this.input;
    const p = this.player;
    const a = this.aim;
    if (inp.pressed('KeyE') && a) {
      const o = a.owner;
      if (o?.interact && (!this.held || o.acceptsHeld)) {
        if (o.kind === 'computer' || o.localInteract) {
          o.interact(p, this);
          this.proxy.consume('KeyE');
        }
      } else if (a.carpetHit?.part === 'label') {
        this.hud?.showCareLabel?.(o);
        this.proxy.consume('KeyE');
      }
    }
    const item = this.heldItem();
    if (item) item.update?.(p, this);
    this.lmb = inp.mouseDown[0];
    this.rmb = inp.mouseDown[2];
  }

  tryGrab(hit) {
    const o = hit?.owner;
    if (!o) return false;
    if (o.kind === 'carpet') {
      const h = o.grabAt?.(hit.carpetHit ?? hit);
      if (!h) return false;
      if (h.kind === 'cloth') {
        this.held = { kind: 'cloth', carpet: o, handle: h };
      } else {
        this.held = { kind: 'heavy', owner: o, body: h.body, localPoint: toVec(h.localPoint).clone(), carpet: o };
        this.prepareBody(h.body);
      }
      o.onGrab?.(this.player, hit.point, this);
      this.onEvent?.('grab', o);
      return true;
    }
    if (o.body && (o.holdStyle || o.grabbable)) {
      if (o.holdStyle === 'tool') {
        this.held = { kind: 'item', item: o, body: o.body };
      } else {
        const inv = _q.copy(o.body.rotation()).invert();
        const t = o.body.translation();
        const local = hit.point.clone().sub(_a.set(t.x, t.y, t.z)).applyQuaternion(inv);
        this.held = { kind: o.holdStyle === 'heavy' ? 'heavy' : 'item', item: o, owner: o, body: o.body, localPoint: local };
        if (o.holdStyle !== 'heavy') this.held.kind = 'item';
      }
      this.prepareBody(o.body);
      o.onGrab?.(this.player, hit.point, this);
      this.onEvent?.('grab', o);
      return true;
    }
    return false;
  }

  prepareBody(body) {
    if (body.isKinematic?.() || body.isFixed?.()) {
      this.held.kinematicOwned = true;
      return;
    }
    this.held.saved = { grav: body.gravityScale(), ang: body.angularDamping(), lin: body.linearDamping(), groups: [], mass: body.mass() };
    const n = body.numColliders();
    for (let i = 0; i < n; i++) {
      const c = body.collider(i);
      this.held.saved.groups.push(c.collisionGroups());
      if (this.held.kind !== 'heavy') c.setCollisionGroups(groups(GROUP.HELD, GROUP.ALL & ~GROUP.PLAYER));
    }
    if (this.held.kind === 'item') {
      this.held.item.massKg = body.mass();
      body.setBodyType(R.RigidBodyType.KinematicPositionBased, true);
      this.held.kinematic = true;
    } else body.setAngularDamping(2.5);
    body.wakeUp();
  }

  restoreBody() {
    const h = this.held;
    if (!h?.body || !h.saved) return;
    const b = h.body;
    if (h.kinematic) {
      b.setBodyType(R.RigidBodyType.Dynamic, true);
      const v = h.vel ?? new THREE.Vector3();
      const vl = Math.min(12, v.length());
      if (vl > 0) v.setLength(vl);
      b.setLinvel({ x: v.x, y: v.y, z: v.z }, true);
      b.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
    b.setGravityScale(h.saved.grav, true);
    b.setAngularDamping(h.saved.ang);
    b.setLinearDamping(h.saved.lin);
    const n = b.numColliders();
    for (let i = 0; i < n; i++) b.collider(i).setCollisionGroups(h.saved.groups[i]);
  }

  release() {
    const h = this.held;
    if (!h) return;
    if (this.proxy) {
      this.held = null;
      this.player.speedMul = 1;
      return;
    }
    if (h.kind === 'cloth') {
      h.handle.release();
      h.carpet.onRelease?.(this.player, this);
    } else {
      if (h.carpet) h.carpet.onRelease?.(this.player, this);
      if (h.kind === 'item') h.item.useEnd?.(this.player, this);
      this.restoreBody();
      h.item?.onRelease?.(this.player, this);
    }
    this.held = null;
    this.player.speedMul = 1;
    this.onEvent?.('release', h.item ?? h.owner ?? h.carpet);
  }

  throw() {
    const h = this.held;
    if (!h) return;
    if (h.kind === 'cloth') return this.release();
    const b = h.body;
    this.release();
    const m = b.mass();
    const v = Math.min(9, 140 / Math.max(m, 0.5));
    const f = this.player.forward;
    b.applyImpulse({ x: f.x * v * m, y: (f.y + 0.25) * v * m, z: f.z * v * m }, true);
    this.onEvent?.('throw', h.item ?? h.owner);
  }

  fixedUpdate(dt) {
    const h = this.held;
    const p = this.player;
    if (this.proxy) {
      if (h?.kind === 'item' && h.body) this.driveTool(h, dt);
      return;
    }
    if (this.rolling) {
      const fwd = Math.max(0, p.velocity.x * p.forward.x + p.velocity.z * p.forward.z);
      if (fwd > 0.05) this.rolling.pushRoll?.(fwd * dt);
    }
    if (!h) return;
    if (h.kind === 'item') {
      this.driveTool(h, dt);
      if (this.held === h && this.lmb && this.input.locked) h.item.useHold?.(p, dt, this);
      return;
    }
    if (h.kind === 'heavy') return this.driveHeavy(h, dt);
    if (h.kind === 'cloth') return this.driveCloth(h, dt);
  }

  driveTool(h, dt) {
    const b = h.body;
    if (h.kinematicOwned) return;
    const it = h.item;
    const p = this.player;
    const cam = p.camera;
    const tp = _a, tq = _q;
    let custom = false;
    if (it.holdTarget) custom = it.holdTarget(p, this, tp, tq);
    if (!custom) {
      const hp = it.holdPose ?? { pos: new THREE.Vector3(0.28, -0.3, -0.65), rot: new THREE.Euler() };
      tp.copy(hp.pos).applyMatrix4(cam.matrixWorld);
      tq.setFromEuler(hp.rot);
      tq.premultiply(cam.quaternion);
    }
    const t = b.translation();
    const r = b.rotation();
    const cur = _b.set(t.x, t.y, t.z);
    if (cur.distanceTo(tp) > 3) cur.copy(tp);
    const kp = 1 - Math.exp(-dt * (custom ? 26 : 34));
    const kr = 1 - Math.exp(-dt * 26);
    const np = _c.copy(cur).lerp(tp, kp);
    _q2.set(r.x, r.y, r.z, r.w).slerp(tq, kr);
    h.vel = (h.vel ?? new THREE.Vector3()).copy(np).sub(cur).divideScalar(dt);
    b.setNextKinematicTranslation({ x: np.x, y: np.y, z: np.z });
    b.setNextKinematicRotation({ x: _q2.x, y: _q2.y, z: _q2.z, w: _q2.w });
    const m = it.massKg ?? b.mass();
    this.player.speedMul = Math.max(0.55, 1 - Math.max(0, m - 6) / 40);
  }

  driveHeavy(h, dt) {
    const b = h.body;
    const p = this.player;
    const t = b.translation();
    const r = b.rotation();
    const wp = _a.copy(h.localPoint).applyQuaternion(_q.set(r.x, r.y, r.z, r.w)).add(_b.set(t.x, t.y, t.z));
    const target = _c.copy(p.eye).addScaledVector(p.forward, this.holdDist);
    target.y -= 0.2;
    const err = target.sub(wp);
    const d = err.length();
    if (d > 2.6) return this.release();
    const m = b.mass();
    const pv = this.physics.bodyVelocityAt(b, wp, new THREE.Vector3()).sub(p.velocity);
    const k = Math.min(1400, 60 * Math.max(m, 3));
    const c = 2 * Math.sqrt(k * Math.max(m, 3)) * 0.9;
    const F = err.multiplyScalar(k).addScaledVector(pv, -c);
    F.y += Math.min(m * 9.81 * 0.5, STRENGTH * 0.5);
    const fl = F.length();
    if (fl > STRENGTH) F.multiplyScalar(STRENGTH / fl);
    b.applyImpulseAtPoint({ x: F.x * dt, y: F.y * dt, z: F.z * dt }, { x: wp.x, y: wp.y, z: wp.z }, true);
    const load = Math.min(1, (m * 9.81) / (STRENGTH * 2));
    this.player.speedMul = Math.max(0.35, 1 - load * 0.8 - Math.max(0, d - 0.5) * 0.3);
  }

  driveCloth(h, dt) {
    const p = this.player;
    const target = _c.copy(p.eye).addScaledVector(p.forward, Math.min(this.holdDist, 1.1));
    target.y = Math.max(target.y - 0.25, p.feet.y + 0.75);
    h.handle.setTarget(target, 0.9);
    const pt = h.handle.point?.();
    const lag = pt ? pt.distanceTo(target) : 0;
    if (lag > 3.5) return this.release();
    const m = h.carpet.mass ?? 10;
    this.player.speedMul = Math.max(0.6, 1 - m / 70) * (lag > 1 ? Math.max(0.3, 1 - (lag - 1) * 0.6) : 1);
  }
}
