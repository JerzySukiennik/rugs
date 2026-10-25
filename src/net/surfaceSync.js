// Rug Rush surface sync: host diffs each rug's eight RGBA8 grids against a sent shadow in 16x16 tiles and ships deflated byte deltas; clients apply them.
import { TEX_NAMES } from '../surface/surface.js';
import { Writer, Reader, deflate, inflate, fnv } from './codec.js';

export const MSG_SURF = 3;
export const MSG_SURF_FULL = 4;
const TILE = 16;
const FAST = 6;
const SLOW_MS = 1500;

export class SurfaceShadow {
  constructor(surface) {
    this.surface = surface;
    this.W = surface.W;
    this.H = surface.H;
    this.tx = Math.ceil(surface.W / TILE);
    this.ty = Math.ceil(surface.H / TILE);
    this.data = {};
    this.sentAt = {};
    for (const n of TEX_NAMES) {
      this.data[n] = surface.data[n].slice();
      this.sentAt[n] = new Float64Array(this.tx * this.ty);
    }
    this.pending = new Set(TEX_NAMES);
    this.hash = this.checksum();
  }

  checksum() {
    let h = 0;
    for (const n of TEX_NAMES) h = (Math.imul(h, 31) + fnv(this.data[n])) >>> 0;
    return h;
  }

  collect(now) {
    const s = this.surface;
    for (const n of s.netDirty) this.pending.add(n);
    for (const n of s.dirty) this.pending.add(n);
    s.netDirty.clear();
    if (!this.pending.size) return null;
    const entries = [];
    const W = this.W, H = this.H;
    for (const n of this.pending) {
      const cur = s.data[n], sh = this.data[n], sent = this.sentAt[n];
      const c32 = new Uint32Array(cur.buffer, cur.byteOffset, W * H), s32 = new Uint32Array(sh.buffer, sh.byteOffset, W * H);
      let left = false;
      for (let ty = 0; ty < this.ty; ty++) for (let tx = 0; tx < this.tx; tx++) {
        const x0 = tx * TILE, y0 = ty * TILE, x1 = Math.min(W, x0 + TILE), y1 = Math.min(H, y0 + TILE);
        let maxd = 0;
        for (let y = y0; y < y1 && maxd < FAST; y++) {
          const e = y * W + x1;
          for (let c = y * W + x0; c < e; c++) {
            if (c32[c] === s32[c]) continue;
            const o = c * 4;
            for (let q = o; q < o + 4; q++) {
              const d = cur[q] - sh[q];
              const a = d < 0 ? -d : d;
              if (a > maxd) maxd = a;
            }
            if (maxd >= FAST) break;
          }
        }
        if (!maxd) continue;
        const ti = ty * this.tx + tx;
        if (maxd < FAST && now - sent[ti] < SLOW_MS) {
          left = true;
          continue;
        }
        const tw = x1 - x0, th = y1 - y0;
        const delta = new Uint8Array(tw * th * 4);
        let k = 0;
        for (let y = y0; y < y1; y++) {
          let o = (y * W + x0) * 4;
          const e = (y * W + x1) * 4;
          for (; o < e; o++) {
            delta[k++] = (cur[o] - sh[o]) & 255;
            sh[o] = cur[o];
          }
        }
        sent[ti] = now;
        entries.push({ tex: TEX_NAMES.indexOf(n), ti, delta });
      }
      if (!left) this.pending.delete(n);
    }
    return entries.length ? entries : null;
  }

  fullBytes() {
    const out = new Uint8Array(this.W * this.H * 4 * TEX_NAMES.length);
    TEX_NAMES.forEach((n, i) => out.set(this.data[n], i * this.W * this.H * 4));
    return out;
  }
}

export async function encodeDelta(id, shadow, entries) {
  const w = new Writer(8192);
  w.u16(id).u16(shadow.W).u16(shadow.H).u16(entries.length);
  for (const e of entries) {
    w.u8(e.tex).u16(e.ti).bytes(e.delta);
  }
  const z = await deflate(w.finish());
  const out = new Uint8Array(z.length + 1);
  out[0] = MSG_SURF;
  out.set(z, 1);
  return out.buffer;
}

export async function encodeFull(id, shadow) {
  const w = new Writer(64);
  w.u16(id).u16(shadow.W).u16(shadow.H).u32(shadow.checksum());
  const head = new Uint8Array(w.finish());
  const body = shadow.fullBytes();
  const all = new Uint8Array(head.length + body.length);
  all.set(head, 0);
  all.set(body, head.length);
  const z = await deflate(all);
  const out = new Uint8Array(z.length + 1);
  out[0] = MSG_SURF_FULL;
  out.set(z, 1);
  return out.buffer;
}

export async function applySurfaceMessage(buf, findSurface) {
  const type = new Uint8Array(buf, 0, 1)[0];
  const raw = await inflate(new Uint8Array(buf, 1));
  const r = new Reader(raw.buffer);
  const id = r.u16(), W = r.u16(), H = r.u16();
  const surface = findSurface(id);
  if (!surface || surface.W !== W || surface.H !== H) return { id, ok: false };
  if (type === MSG_SURF_FULL) {
    r.u32();
    const size = W * H * 4;
    TEX_NAMES.forEach((n, i) => {
      surface.data[n].set(new Uint8Array(raw.buffer, r.o + i * size, size));
      surface.markDirty(n);
    });
    return { id, ok: true, full: true };
  }
  const n = r.u16();
  const tx = Math.ceil(W / TILE);
  for (let k = 0; k < n; k++) {
    const tex = TEX_NAMES[r.u8()], ti = r.u16();
    const x0 = (ti % tx) * TILE, y0 = Math.floor(ti / tx) * TILE;
    const x1 = Math.min(W, x0 + TILE), y1 = Math.min(H, y0 + TILE);
    const arr = surface.data[tex];
    const d = r.bytes((x1 - x0) * (y1 - y0) * 4);
    let q = 0;
    for (let y = y0; y < y1; y++) {
      let o = (y * W + x0) * 4;
      const e = (y * W + x1) * 4;
      for (; o < e; o++) arr[o] = (arr[o] + d[q++]) & 255;
    }
    surface.markDirty(tex);
  }
  return { id, ok: true, tiles: n };
}

export function surfaceHash(surface) {
  let h = 0;
  for (const n of TEX_NAMES) h = (Math.imul(h, 31) + fnv(surface.data[n])) >>> 0;
  return h;
}
