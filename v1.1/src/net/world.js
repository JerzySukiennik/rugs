// Rug Rush net world: entity spawn descriptors, client-side spawn/despawn/reconcile, carpet core and cloth codecs, and wrap stickers.
import * as THREE from 'three';
import { R } from '../core/physics.js';
import { STORIES } from '../data/jobs.js';
import { spawnProduct, spawnTool } from '../tools/items.js';
import { Writer, Reader } from './codec.js';

export const MSG_CLOTH = 2;
const _q = new THREE.Quaternion();

function r3(v) {
  return Math.round(v * 1000) / 1000;
}

export function bodyPQ(body) {
  const t = body.translation(), r = body.rotation();
  return { p: [r3(t.x), r3(t.y), r3(t.z)], q: [r3(r.x), r3(r.y), r3(r.z), r3(r.w)] };
}

export function networkEntities(game) {
  const out = [];
  for (const e of game.entities.map.values()) {
    if (e.kind === 'item' || e.kind === 'cart' || e.kind === 'carpet' || e.kind === 'forklift') out.push(e);
  }
  return out;
}

export function describe(game, e) {
  if (e.kind === 'item') return { id: e.id, kind: 'item', cls: e.productId ? 'product' : 'tool', ref: e.productId ?? e.toolId, ...bodyPQ(e.body) };
  if (e.kind === 'cart') return { id: e.id, kind: 'cart', ...bodyPQ(e.body) };
  if (e.kind === 'forklift') return { id: e.id, kind: 'forklift', p: [r3(e.pos.x), r3(e.pos.y), r3(e.pos.z)], yaw: r3(e.yaw) };
  if (e.kind === 'carpet') {
    const pos = e.body ? e.body.translation() : (e.uvToWorld?.(0.5, 0.5)?.point ?? { x: 0, y: 0.05, z: -3 });
    return {
      id: e.id, kind: 'carpet', type: e.type, size: e.sizeName || { width: e.width, length: e.length }, seed: e.seed,
      story: Math.max(0, STORIES.indexOf(e.job)), clean: (e.chem?.initialDirt ?? 1) < 1e-9, paint: e.paintColor,
      rolled: !!e.body, p: [r3(pos.x), r3(pos.y), r3(pos.z)],
      wrap: e.wrapped ? { ev: liteEval(e.finalEval), price: e.finalPrice ?? 0 } : null,
    };
  }
  return null;
}

export function sameEntity(e, d) {
  if (!e || e.kind !== d.kind) return false;
  if (d.kind === 'item') return (d.cls === 'product' ? e.productId : e.toolId) === d.ref;
  if (d.kind === 'carpet') return e.type === d.type && e.seed === d.seed;
  return true;
}

function remap(game, ent, id) {
  game.entities.map.delete(ent.id);
  game.entities.add(ent, id);
}

export function makeKinematic(body) {
  if (body && !body.isKinematic()) {
    body.setBodyType(R.RigidBodyType.KinematicPositionBased, true);
  }
}

export function spawnEntity(game, d) {
  const p = new THREE.Vector3(d.p[0], d.p[1], d.p[2]);
  if (d.kind === 'item') {
    const it = d.cls === 'product' ? spawnProduct(game, d.ref, p, 0) : spawnTool(game, d.ref, p, 0);
    if (!it) return null;
    remap(game, it, d.id);
    it.body.setRotation({ x: d.q[0], y: d.q[1], z: d.q[2], w: d.q[3] }, true);
    makeKinematic(it.body);
    game.physics.teleportBinding(it.body);
    return it;
  }
  if (d.kind === 'cart') {
    const c = game.spawnCart(p);
    remap(game, c, d.id);
    c.body.setTranslation({ x: d.p[0], y: d.p[1], z: d.p[2] }, true);
    c.body.setRotation({ x: d.q[0], y: d.q[1], z: d.q[2], w: d.q[3] }, true);
    makeKinematic(c.body);
    game.physics.teleportBinding(c.body);
    return c;
  }
  if (d.kind === 'forklift') {
    const f = game.spawnForklift(p);
    remap(game, f, d.id);
    f.yaw = d.yaw;
    f.y0 = f.y1 = d.yaw;
    f.fixedUpdate = () => {};
    f.syncPose(true);
    return f;
  }
  if (d.kind === 'carpet') {
    const c = game.spawnRug({
      id: d.id, type: d.type, size: d.size, seed: d.seed, story: STORIES[d.story] ?? STORIES[0], clean: d.clean,
      state: d.rolled ? 'rolled' : 'flat', position: p, yaw: 0, wrapped: false,
    });
    if (!c) return null;
    if (c.body) c.setBodyMode('kinematic');
    if (d.wrap) applyWrap(c, d.wrap.ev, d.wrap.price);
    return c;
  }
  return null;
}

export function despawnEntity(game, e) {
  const g = game;
  if (g.grab?.held && (g.grab.held.item === e || g.grab.held.owner === e || g.grab.held.carpet === e)) g.grab.held = null;
  if (e.kind === 'carpet') return g.removeCarpet(e);
  g.entities.map.delete(e.id);
  if (e.kind === 'item') {
    e.stream?.dispose?.();
    e.dispose();
    for (const arr of [g.items, g.blowers]) {
      const i = arr.indexOf(e);
      if (i >= 0) arr.splice(i, 1);
    }
    if (g.uvLampOwner === e) {
      g.carpets?.setUvLamp({ on: false });
      g.uvLampOwner = null;
    }
  } else if (e.kind === 'cart') {
    g.physics.unbind(e.mesh);
    g.physics.removeBody(e.body);
    e.mesh.removeFromParent();
    const i = g.carts.indexOf(e);
    if (i >= 0) g.carts.splice(i, 1);
  } else if (e.kind === 'forklift') {
    g.engine.remove(e);
    g.physics.removeBody(e.body);
    e.mesh.removeFromParent();
    const i = g.forklifts.indexOf(e);
    if (i >= 0) g.forklifts.splice(i, 1);
  }
}

export function liteEval(ev) {
  if (!ev) return null;
  const per = {};
  for (const [k, v] of Object.entries(ev.per ?? {})) if (v > 0.0005) per[k] = r3(v);
  return {
    clean: r3(ev.clean), dirt: r3(ev.dirt), residue: r3(ev.residue), damage: r3(ev.damage), damagePeak: r3(ev.damagePeak),
    wet: r3(ev.wet), wetHigh: r3(ev.wetHigh), lumps: r3(ev.lumps), per, dryEnough: !!ev.dryEnough, ruined: !!ev.ruined, score: r3(ev.score), grade: ev.grade,
  };
}

export function stickerTexture(c, ev, price) {
  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = 256;
  const g = cv.getContext('2d');
  const e = ev ?? { clean: 0, damage: 0, grade: '?', ruined: false };
  g.fillStyle = '#fffdf6';
  g.fillRect(0, 0, 512, 256);
  g.fillStyle = '#1d1f24';
  g.font = 'bold 30px Helvetica, Arial, sans-serif';
  g.fillText('RUG RUSH · CLEANED', 24, 46);
  g.font = '22px Helvetica, Arial, sans-serif';
  g.fillText(c.job?.client ?? 'Client', 24, 84);
  g.fillText(c.displayName?.() ?? c.type, 24, 114);
  g.fillText(`Clean ${Math.round(e.clean * 100)}%  ·  Damage ${Math.round(e.damage * 100)}%`, 24, 150);
  g.font = 'bold 34px Helvetica, Arial, sans-serif';
  g.fillStyle = price < 0 ? '#b3261e' : '#1f8a4c';
  g.fillText(`${price < 0 ? '−' : ''}$${Math.abs(price)}`, 24, 214);
  g.fillStyle = e.ruined ? '#b3261e' : '#1d1f24';
  g.font = 'bold 150px Helvetica, Arial, sans-serif';
  g.textAlign = 'right';
  g.fillText(e.grade, 490, 200);
  for (let i = 0; i < 30; i++) {
    g.fillStyle = '#1d1f24';
    g.fillRect(300 + i * 6, 218, i % 3 ? 2 : 4, 26);
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function applyWrap(c, ev, price) {
  c.finalEval = ev;
  c.finalPrice = price;
  c.netWrap = { ev, price };
  if (c.body && c.state === 'rolled') c.setWrapped(true, stickerTexture(c, ev, price));
}

export function writeCore(w, c) {
  const f = (c.body ? 1 : 0) | (c.wrapped ? 2 : 0) | (c.rollEdge === 'v1' ? 4 : 0) | (c.asleep ? 8 : 0);
  w.u16(c.id).u8(f).f32(c.rolledLen).f32(c.phi0);
  if (c.body) {
    const t = c.body.translation(), r = c.body.rotation();
    w.f32(t.x).f32(t.y).f32(t.z).quat(r);
  }
}

export function readCore(r) {
  const id = r.u16(), f = r.u8();
  const v = { id, hasBody: !!(f & 1), wrapped: !!(f & 2), v1: !!(f & 4), asleep: !!(f & 8), rolledLen: r.f32(), phi0: r.f32(), p: null, q: null };
  if (v.hasBody) {
    v.p = [r.f32(), r.f32(), r.f32()];
    v.q = r.quat([0, 0, 0, 1]);
  }
  return v;
}

export function coreKey(c) {
  if (!c.body) return `${c.rolledLen.toFixed(4)}|${c.wrapped}|${c.rollEdge}`;
  const t = c.body.translation(), r = c.body.rotation();
  return `${c.rolledLen.toFixed(4)}|${c.wrapped}|${c.rollEdge}|${t.x.toFixed(3)},${t.y.toFixed(3)},${t.z.toFixed(3)}|${r.x.toFixed(3)},${r.y.toFixed(3)},${r.z.toFixed(3)},${r.w.toFixed(3)}`;
}

export function encodeCloth(c, t, settle = false) {
  const cl = c.cloth, nx = cl.nx, ny = cl.ny;
  const w = new Writer(64 + cl.n * 6);
  w.u8(MSG_CLOTH).u8(settle ? 1 : 0).f64(t).u16(c.id).f32(c.rolledLen).u8(nx).u8(ny);
  let minX = 1e9, minY = 1e9, minZ = 1e9, maxX = -1e9, maxY = -1e9, maxZ = -1e9;
  const rows = [];
  for (let j = 0; j < ny; j++) {
    const on = !!cl.active[j * nx];
    rows.push(on);
    if (!on) continue;
    for (let i = 0; i < nx; i++) {
      const k = (j * nx + i) * 3;
      const x = cl.x[k], y = cl.x[k + 1], z = cl.x[k + 2];
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
  }
  for (let j = 0; j < ny; j += 8) {
    let b = 0;
    for (let q = 0; q < 8 && j + q < ny; q++) if (rows[j + q]) b |= 1 << q;
    w.u8(b);
  }
  if (minX > maxX) {
    minX = minY = minZ = 0;
    maxX = maxY = maxZ = 1;
  }
  const sx = Math.max(1e-4, maxX - minX), sy = Math.max(1e-4, maxY - minY), sz = Math.max(1e-4, maxZ - minZ);
  w.f32(minX).f32(minY).f32(minZ).f32(sx).f32(sy).f32(sz);
  for (let j = 0; j < ny; j++) {
    if (!rows[j]) continue;
    for (let i = 0; i < nx; i++) {
      const k = (j * nx + i) * 3;
      w.u16(Math.round(((cl.x[k] - minX) / sx) * 65535));
      w.u16(Math.round(((cl.x[k + 1] - minY) / sy) * 65535));
      w.u16(Math.round(((cl.x[k + 2] - minZ) / sz) * 65535));
    }
  }
  return w.finish();
}

export function decodeCloth(buf) {
  const r = new Reader(buf, 1);
  const settle = r.u8() === 1;
  const t = r.f64(), id = r.u16(), rolledLen = r.f32(), nx = r.u8(), ny = r.u8();
  const mask = new Uint8Array(ny);
  for (let j = 0; j < ny; j += 8) {
    const b = r.u8();
    for (let q = 0; q < 8 && j + q < ny; q++) mask[j + q] = (b >> q) & 1;
  }
  const minX = r.f32(), minY = r.f32(), minZ = r.f32(), sx = r.f32(), sy = r.f32(), sz = r.f32();
  const pos = new Float32Array(nx * ny * 3);
  for (let j = 0; j < ny; j++) {
    if (!mask[j]) continue;
    for (let i = 0; i < nx; i++) {
      const k = (j * nx + i) * 3;
      pos[k] = minX + (r.u16() / 65535) * sx;
      pos[k + 1] = minY + (r.u16() / 65535) * sy;
      pos[k + 2] = minZ + (r.u16() / 65535) * sz;
    }
  }
  return { settle, t, id, rolledLen, nx, ny, mask, pos };
}

export function applyCore(game, c, v) {
  if (v.hasBody && !c.body) {
    c.createBody(new THREE.Vector3(v.p[0], v.p[1], v.p[2]), _q.set(v.q[0], v.q[1], v.q[2], v.q[3]), 'kinematic');
  } else if (!v.hasBody && c.body) {
    c.removeBody();
  }
  c.rollEdge = v.v1 ? 'v1' : 'v0';
  c.sgnU = v.v1 ? -1 : 1;
  c.phi0 = v.phi0;
  const rl = v.rolledLen > c.length - 0.004 ? c.length : v.rolledLen < 1e-5 ? 0 : v.rolledLen;
  const moved = Math.abs(c.rolledLen - rl) > 1e-6;
  c.prevRolledLen = c.rolledLen;
  c.rolledLen = rl;
  let bodyMoved = false;
  if (c.body) {
    if (c.mode !== 'kinematic') c.setBodyMode('kinematic');
    const p = v.p, q = v.q;
    bodyMoved = Math.abs(c.p1.x - p[0]) + Math.abs(c.p1.y - p[1]) + Math.abs(c.p1.z - p[2]) > 1e-5 || Math.abs(c.q1.x - q[0]) + Math.abs(c.q1.y - q[1]) + Math.abs(c.q1.z - q[2]) + Math.abs(c.q1.w - q[3]) > 1e-5;
    c.p0.copy(c.p1);
    c.q0.copy(c.q1);
    c.p1.set(p[0], p[1], p[2]);
    c.q1.set(q[0], q[1], q[2], q[3]);
    c.body.setNextKinematicTranslation({ x: p[0], y: p[1], z: p[2] });
    c.body.setNextKinematicRotation({ x: q[0], y: q[1], z: q[2], w: q[3] });
    c.rebuildCollider();
  }
  if (v.wrapped && !c.wrapped && c.body) {
    const w = c.netWrap ?? { ev: c.finalEval, price: c.finalPrice ?? 0 };
    c.setWrapped(true, stickerTexture(c, w.ev, w.price));
  } else if (!v.wrapped && c.wrapped) c.setWrapped(false);
  c.bodyMoving = bodyMoved;
  return moved || bodyMoved;
}

export function applyClothFrames(c, a, b, k) {
  const cl = c.cloth;
  if (!b || b.nx !== cl.nx || b.ny !== cl.ny) return false;
  const nx = cl.nx;
  cl.prevStep.set(cl.x);
  let maxMove = 0;
  for (let j = 0; j < cl.ny; j++) {
    const on = b.mask[j];
    const useA = a && a !== b && a.mask[j];
    for (let i = 0; i < nx; i++) {
      const pi = j * nx + i;
      const wasOn = cl.active[pi];
      cl.active[pi] = on;
      if (!on) continue;
      const kk = pi * 3;
      let x = b.pos[kk], y = b.pos[kk + 1], z = b.pos[kk + 2];
      if (useA) {
        x = a.pos[kk] + (x - a.pos[kk]) * k;
        y = a.pos[kk + 1] + (y - a.pos[kk + 1]) * k;
        z = a.pos[kk + 2] + (z - a.pos[kk + 2]) * k;
      }
      if (!wasOn) {
        cl.prevStep[kk] = x; cl.prevStep[kk + 1] = y; cl.prevStep[kk + 2] = z;
      }
      const dx = x - cl.x[kk], dy = y - cl.x[kk + 1], dz = z - cl.x[kk + 2];
      const m = dx * dx + dy * dy + dz * dz;
      if (m > maxMove) maxMove = m;
      cl.x[kk] = x; cl.x[kk + 1] = y; cl.x[kk + 2] = z;
      cl.p[kk] = x; cl.p[kk + 1] = y; cl.p[kk + 2] = z;
    }
  }
  cl.maxMove = Math.sqrt(maxMove);
  return cl.maxMove > 1e-5;
}
