// Rug Rush physics: Rapier world, collision groups, owner lookup, raycasts and interpolated mesh bindings.
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { FIXED_DT } from './engine.js';

export let R = null;

export async function initRapier() {
  if (!R) {
    await RAPIER.init();
    R = RAPIER;
  }
  return R;
}

export const GROUP = {
  STATIC: 1 << 0,
  DYNAMIC: 1 << 1,
  PLAYER: 1 << 2,
  CARPET: 1 << 3,
  TRIGGER: 1 << 4,
  VEHICLE: 1 << 5,
  RAGDOLL: 1 << 6,
  HELD: 1 << 7,
  ALL: 0xffff,
};

export function groups(membership, filter = GROUP.ALL) {
  return ((membership & 0xffff) << 16) | (filter & 0xffff);
}

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();

export class Physics {
  constructor(engine) {
    this.engine = engine;
    this.world = new R.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = FIXED_DT;
    this.events = new R.EventQueue(true);
    this.owners = new Map();
    this.bindings = [];
    this.order = 0;
    this.stepListeners = [];
  }

  fixedUpdate() {
    for (const b of this.bindings) {
      b.p0.copy(b.p1);
      b.q0.copy(b.q1);
    }
    this.world.step(this.events);
    this.events.drainContactForceEvents((e) => {
      const a = this.owners.get(e.collider1());
      const b = this.owners.get(e.collider2());
      const f = e.maxForceMagnitude();
      a?.onContactForce?.(b, f, e);
      b?.onContactForce?.(a, f, e);
    });
    this.events.drainCollisionEvents((h1, h2, started) => {
      const a = this.owners.get(h1);
      const b = this.owners.get(h2);
      a?.onCollision?.(b, started, h1, h2);
      b?.onCollision?.(a, started, h2, h1);
    });
    for (const b of this.bindings) {
      const t = b.body.translation();
      const r = b.body.rotation();
      b.p1.set(t.x, t.y, t.z);
      b.q1.set(r.x, r.y, r.z, r.w);
    }
    for (const fn of this.stepListeners) fn();
  }

  update(dt, alpha) {
    for (const b of this.bindings) {
      if (b.snap) {
        b.object.position.copy(b.p1);
        b.object.quaternion.copy(b.q1);
      } else {
        b.object.position.lerpVectors(b.p0, b.p1, alpha);
        b.object.quaternion.slerpQuaternions(b.q0, b.q1, alpha);
      }
      if (b.offset) b.object.position.add(_v.copy(b.offset).applyQuaternion(b.object.quaternion));
    }
  }

  createBody(desc, colliders = [], owner = null) {
    const body = this.world.createRigidBody(desc);
    const made = [];
    for (const cd of colliders) {
      const c = this.world.createCollider(cd, body);
      if (owner) this.owners.set(c.handle, owner);
      made.push(c);
    }
    body.userData = { owner, colliders: made };
    return body;
  }

  addCollider(desc, body = null, owner = null) {
    const c = this.world.createCollider(desc, body ?? undefined);
    if (owner) this.owners.set(c.handle, owner);
    if (body?.userData) body.userData.colliders.push(c);
    return c;
  }

  setOwner(collider, owner) {
    this.owners.set(collider.handle, owner);
  }

  ownerOf(colliderOrHandle) {
    const h = typeof colliderOrHandle === 'number' ? colliderOrHandle : colliderOrHandle?.handle;
    return this.owners.get(h) ?? null;
  }

  removeBody(body) {
    if (!body) return;
    const n = body.numColliders();
    for (let i = 0; i < n; i++) this.owners.delete(body.collider(i).handle);
    this.bindings = this.bindings.filter((b) => b.body !== body);
    this.world.removeRigidBody(body);
  }

  removeCollider(collider) {
    this.owners.delete(collider.handle);
    this.world.removeCollider(collider, true);
  }

  bind(body, object, { snap = false, offset = null } = {}) {
    const t = body.translation();
    const r = body.rotation();
    const b = {
      body,
      object,
      snap,
      offset,
      p0: new THREE.Vector3(t.x, t.y, t.z),
      p1: new THREE.Vector3(t.x, t.y, t.z),
      q0: new THREE.Quaternion(r.x, r.y, r.z, r.w),
      q1: new THREE.Quaternion(r.x, r.y, r.z, r.w),
    };
    this.bindings.push(b);
    return b;
  }

  unbind(object) {
    this.bindings = this.bindings.filter((b) => b.object !== object);
  }

  teleportBinding(body) {
    for (const b of this.bindings) {
      if (b.body !== body) continue;
      const t = body.translation();
      const r = body.rotation();
      b.p0.set(t.x, t.y, t.z);
      b.p1.copy(b.p0);
      b.q0.set(r.x, r.y, r.z, r.w);
      b.q1.copy(b.q0);
    }
  }

  raycast(origin, dir, maxDist = 100, { exclude = null, groupsMask = undefined, predicate = undefined, solid = true } = {}) {
    const ray = new R.Ray(origin, dir);
    const hit = this.world.castRayAndGetNormal(ray, maxDist, solid, undefined, groupsMask, undefined, exclude ?? undefined, predicate);
    if (!hit) return null;
    const p = ray.pointAt(hit.timeOfImpact ?? hit.toi);
    return {
      collider: hit.collider,
      owner: this.ownerOf(hit.collider),
      distance: hit.timeOfImpact ?? hit.toi,
      point: new THREE.Vector3(p.x, p.y, p.z),
      normal: new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z),
    };
  }

  staticBox(hx, hy, hz, pos, quat = null, { friction = 0.8, owner = null, group = GROUP.STATIC } = {}) {
    const d = R.ColliderDesc.cuboid(hx, hy, hz).setTranslation(pos.x, pos.y, pos.z).setFriction(friction).setCollisionGroups(groups(group));
    if (quat) d.setRotation(quat);
    return this.addCollider(d, null, owner);
  }

  bodyVelocityAt(body, point, out = new THREE.Vector3()) {
    const v = body.linvel();
    const w = body.angvel();
    const c = body.translation();
    const rx = point.x - c.x, ry = point.y - c.y, rz = point.z - c.z;
    return out.set(v.x + w.y * rz - w.z * ry, v.y + w.z * rx - w.x * rz, v.z + w.x * ry - w.y * rx);
  }
}

export function toVec(t, out = new THREE.Vector3()) {
  return out.set(t.x, t.y, t.z);
}

export function toQuat(r, out = new THREE.Quaternion()) {
  return out.set(r.x, r.y, r.z, r.w);
}

export function bodyMatrix(body, out = new THREE.Matrix4()) {
  return out.compose(toVec(body.translation(), _v), toQuat(body.rotation(), _q), new THREE.Vector3(1, 1, 1));
}
