// Rug Rush net state codec: the host's 20 Hz world snapshot (players, bodies, rugs, trucks, roller, hose, forklifts, streams, squeegees) and the client's pose packet.
import { Writer, Reader } from './codec.js';
import { writeCore, readCore } from './world.js';
import { writeTrucks, readTrucks, writeRoller, readRoller, writeHose, readHose, writeForklifts, readForklifts } from './mirror.js';
import { PART_COUNT } from './players.js';

export const MSG_STATE = 1;
export const MSG_POSE = 10;
export const KINDS = ['water', 'mist', 'foam', 'powder', 'gel'];

function wrapAngle(a) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

export function writePlayer(w, slot, v) {
  w.u8(slot).f32(v.pos[0]).f32(v.pos[1]).f32(v.pos[2]).i16(Math.round(wrapAngle(v.yaw) * 10000)).i16(Math.round(v.pitch * 10000))
    .u8(Math.round(Math.max(0, Math.min(1, v.crouch)) * 255)).u8(Math.round(Math.max(0, Math.min(2.55, v.eyeH)) * 100))
    .u8(Math.round(Math.max(0, Math.min(12.7, v.speed)) * 20)).u8(v.flags)
    .i16(Math.round(v.vel[0] * 100)).i16(Math.round(v.vel[1] * 100)).i16(Math.round(v.vel[2] * 100));
  if (v.flags & 1) {
    const parts = v.parts ?? [];
    for (let i = 0; i < PART_COUNT; i++) {
      const s = parts[i] ?? { p: v.pos, q: [0, 0, 0, 1] };
      w.pos(s.p[0], s.p[1], s.p[2]).quat({ x: s.q[0], y: s.q[1], z: s.q[2], w: s.q[3] });
    }
  }
}

export function readPlayer(r) {
  const slot = r.u8();
  const v = {
    pos: [r.f32(), r.f32(), r.f32()], yaw: r.i16() / 10000, pitch: r.i16() / 10000, crouch: r.u8() / 255, eyeH: r.u8() / 100,
    speed: r.u8() / 20, flags: r.u8(), vel: [r.i16() / 100, r.i16() / 100, r.i16() / 100], parts: null,
  };
  if (v.flags & 1) {
    v.parts = [];
    for (let i = 0; i < PART_COUNT; i++) v.parts.push({ p: r.pos([0, 0, 0]), q: r.quat([0, 0, 0, 1]) });
  }
  return { slot, v };
}

export function encodeState(s) {
  const w = new Writer(2048);
  w.u8(MSG_STATE).f64(s.t).u16(s.seq & 0xffff).u8(s.key ? 1 : 0);
  w.u8(s.players.length);
  for (const [slot, v] of s.players) writePlayer(w, slot, v);
  w.u16(s.bodies.length);
  for (const b of s.bodies) w.u16(b.id).pos(b.p.x, b.p.y, b.p.z).quat(b.q);
  w.u8(s.carpets.length);
  for (const c of s.carpets) writeCore(w, c);
  writeTrucks(w, s.trucks);
  writeHose(w, s.hose, s.hoseSlot);
  writeRoller(w, s.roller);
  writeForklifts(w, s.forklifts, s.slotOf);
  w.u8(s.streams.length);
  for (const st of s.streams) {
    w.u16(st.sid).u8(Math.max(0, KINDS.indexOf(st.kind))).f32(st.origin.x).f32(st.origin.y).f32(st.origin.z).dir(st.dir.x, st.dir.y, st.dir.z)
      .i16(Math.round((st.hv?.x ?? 0) * 100)).i16(Math.round((st.hv?.y ?? 0) * 100)).i16(Math.round((st.hv?.z ?? 0) * 100));
  }
  w.u8(s.blades.length);
  for (const b of s.blades) w.u16(b.id).f32(b.a.x).f32(b.a.z).f32(b.b.x).f32(b.b.z);
  return w.finish();
}

export function decodeState(buf) {
  const r = new Reader(buf, 1);
  const out = { t: r.f64(), seq: r.u16(), key: r.u8() === 1 };
  const np = r.u8();
  out.players = [];
  for (let i = 0; i < np; i++) out.players.push(readPlayer(r));
  const nb = r.u16();
  out.bodies = [];
  for (let i = 0; i < nb; i++) out.bodies.push({ id: r.u16(), p: r.pos([0, 0, 0]), q: r.quat([0, 0, 0, 1]) });
  const nc = r.u8();
  out.carpets = [];
  for (let i = 0; i < nc; i++) out.carpets.push(readCore(r));
  out.trucks = readTrucks(r);
  out.hose = readHose(r);
  out.roller = readRoller(r);
  out.forklifts = readForklifts(r);
  const ns = r.u8();
  out.streams = [];
  for (let i = 0; i < ns; i++) {
    out.streams.push({ sid: r.u16(), kind: KINDS[r.u8()], origin: [r.f32(), r.f32(), r.f32()], dir: r.dir([0, 0, 0]), hv: [r.i16() / 100, r.i16() / 100, r.i16() / 100] });
  }
  const nbl = r.u8();
  out.blades = [];
  for (let i = 0; i < nbl; i++) out.blades.push({ id: r.u16(), a: [r.f32(), r.f32()], b: [r.f32(), r.f32()] });
  return out;
}

export function encodePose(t, v) {
  const w = new Writer(256);
  w.u8(MSG_POSE).f64(t);
  writePlayer(w, 0, v);
  return w.finish();
}

export function decodePose(buf) {
  const r = new Reader(buf, 1);
  const t = r.f64();
  const { v } = readPlayer(r);
  for (const x of [...v.pos, v.yaw, v.pitch]) if (!Number.isFinite(x)) return null;
  if (Math.abs(v.pos[0]) > 200 || Math.abs(v.pos[2]) > 200 || v.pos[1] < -30 || v.pos[1] > 30) return null;
  return { t, v };
}
