// Rug Rush net mirror: encodes and replays trucks, the roller machine, the hose boom and forklifts on clients from their public fields.
import * as THREE from 'three';
import { lerpAngle } from './codec.js';

export const TRUCK_STATES = ['away', 'arrive', 'reverse', 'parked', 'opening', 'open', 'closing', 'leave'];
export const ROLLER_STATES = ['idle', 'rolling', 'wrapping', 'cooldown'];
const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3();

export function writeTrucks(w, trucks) {
  w.u8(trucks.length);
  for (const t of trucks) {
    const light = t.lights?.[0]?.material?.emissiveIntensity ?? 0;
    w.f32(t.pos.x).f32(t.pos.z).f32(t.yaw).u8(Math.max(0, TRUCK_STATES.indexOf(t.state))).u8(Math.round(t.door * 255)).u8(Math.round(t.ramp * 255))
      .u8((t.mesh?.visible ? 1 : 0) | (light > 1 ? 2 : 0)).u16(t.trips ?? 0);
  }
}

export function readTrucks(r) {
  const n = r.u8();
  const out = [];
  for (let i = 0; i < n; i++) out.push({ x: r.f32(), z: r.f32(), yaw: r.f32(), state: TRUCK_STATES[r.u8()] ?? 'away', door: r.u8() / 255, ramp: r.u8() / 255, flags: r.u8(), trips: r.u16() });
  return out;
}

export function applyTruck(t, a, b, k) {
  const v = k < 0.5 ? a : b;
  t.pos.set(a.x + (b.x - a.x) * k, 0, a.z + (b.z - a.z) * k);
  t.yaw = lerpAngle(a.yaw, b.yaw, k);
  t.door = a.door + (b.door - a.door) * k;
  t.ramp = a.ramp + (b.ramp - a.ramp) * k;
  t.state = v.state;
  t.trips = v.trips;
  const vis = !!(v.flags & 1);
  if (!!t.mesh.visible !== vis) {
    t.visible(vis);
    if (vis) t.teleport();
  }
  if (vis) {
    t.setPose();
    t.rearWall?.setEnabled(t.door < 0.5);
    const rampOn = t.ramp >= 0.99 && (t.state === 'open' || t.state === 'opening' || t.state === 'closing');
    t.deployRamp(rampOn);
  } else t.deployRamp(false);
  for (const l of t.lights ?? []) l.material.emissiveIntensity = v.flags & 2 ? 3 : 0;
  t.animate();
}

export function writeRoller(w, r) {
  if (!r) return w.u8(255);
  w.u8(Math.max(0, ROLLER_STATES.indexOf(r.state)));
  w.f32(r.shaft?.rotation.x ?? 0).f32(r.beltTex?.offset.y ?? 0).f32(r.film?.position.x ?? 0).f32(r.film?.rotation.y ?? 0).u16(r.carpet?.id ?? 0);
}

export function readRoller(r) {
  const s = r.u8();
  if (s === 255) return null;
  return { state: ROLLER_STATES[s] ?? 'idle', shaft: r.f32(), belt: r.f32(), filmX: r.f32(), filmR: r.f32(), carpet: r.u16() };
}

export function applyRoller(game, roller, v) {
  if (!roller || !v) return;
  roller.state = v.state;
  if (roller.shaft) roller.shaft.rotation.x = v.shaft;
  if (roller.beltTex) roller.beltTex.offset.y = v.belt;
  if (roller.film) {
    roller.film.position.x = v.filmX;
    roller.film.rotation.y = v.filmR;
  }
  roller.carpet = v.carpet ? game.entities.get(v.carpet) : null;
  if (roller.btn) roller.btn.material.emissiveIntensity = v.state === 'idle' ? 0.6 + Math.sin(performance.now() / 300) * 0.3 : 0.1;
}

export function writeHose(w, h, holderSlot) {
  if (!h) return w.u8(0);
  w.u8(1).f32(h.theta).u8((h.flowing ? 1 : 0) | (h.held ? 2 : 0)).u8(holderSlot ?? 255);
}

export function readHose(r) {
  if (!r.u8()) return null;
  const theta = r.f32(), f = r.u8(), slot = r.u8();
  return { theta, flowing: !!(f & 1), held: !!(f & 2), slot: slot === 255 ? -1 : slot };
}

export function writeForklifts(w, list, slotOf) {
  w.u8(list.length);
  for (const f of list) {
    w.u16(f.id).f32(f.pos.x).f32(f.pos.y).f32(f.pos.z).f32(f.yaw).f32(f.lift).f32(f.steer).f32(f.speed).u8(f.driver ? slotOf(f.driver) + 1 : 0);
  }
}

export function readForklifts(r) {
  const n = r.u8();
  const out = [];
  for (let i = 0; i < n; i++) out.push({ id: r.u16(), x: r.f32(), y: r.f32(), z: r.f32(), yaw: r.f32(), lift: r.f32(), steer: r.f32(), speed: r.f32(), driver: r.u8() - 1 });
  return out;
}

export function applyForklift(f, a, b, k) {
  f.p0.copy(f.p1);
  f.y0 = f.y1;
  f.pos.set(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, a.z + (b.z - a.z) * k);
  f.yaw = lerpAngle(a.yaw, b.yaw, k);
  f.lift = a.lift + (b.lift - a.lift) * k;
  f.steer = a.steer + (b.steer - a.steer) * k;
  f.speed = b.speed;
  f.p1.copy(f.pos);
  f.y1 = f.yaw;
  f.syncPose();
}

export function forkliftSeat(f, out = _v) {
  return out.set(0, 0.3, 0.4).applyAxisAngle(UP, f.yaw).add(f.pos);
}
