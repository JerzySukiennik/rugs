// Rug Rush net codec: growable binary writer/reader, quantization helpers and deflate-raw compression.
export const POS_Q = 400;
export const QUAT_Q = 32767;

export class Writer {
  constructor(size = 4096) {
    this.buf = new ArrayBuffer(size);
    this.dv = new DataView(this.buf);
    this.mem = new Uint8Array(this.buf);
    this.o = 0;
  }

  ensure(n) {
    if (this.o + n <= this.buf.byteLength) return;
    let size = this.buf.byteLength * 2;
    while (size < this.o + n) size *= 2;
    const nb = new ArrayBuffer(size);
    new Uint8Array(nb).set(this.mem.subarray(0, this.o));
    this.buf = nb;
    this.dv = new DataView(nb);
    this.mem = new Uint8Array(nb);
  }

  u8(v) { this.ensure(1); this.dv.setUint8(this.o, v); this.o += 1; return this; }
  i8(v) { this.ensure(1); this.dv.setInt8(this.o, v); this.o += 1; return this; }
  u16(v) { this.ensure(2); this.dv.setUint16(this.o, v, true); this.o += 2; return this; }
  i16(v) { this.ensure(2); this.dv.setInt16(this.o, clampI16(v), true); this.o += 2; return this; }
  u32(v) { this.ensure(4); this.dv.setUint32(this.o, v >>> 0, true); this.o += 4; return this; }
  f32(v) { this.ensure(4); this.dv.setFloat32(this.o, v, true); this.o += 4; return this; }
  f64(v) { this.ensure(8); this.dv.setFloat64(this.o, v, true); this.o += 8; return this; }

  bytes(arr) {
    this.ensure(arr.length);
    this.mem.set(arr, this.o);
    this.o += arr.length;
    return this;
  }

  pos(x, y, z) {
    return this.i16(Math.round(x * POS_Q)).i16(Math.round(y * POS_Q)).i16(Math.round(z * POS_Q));
  }

  quat(q) {
    const s = q.w < 0 ? -1 : 1;
    return this.i16(Math.round(q.x * s * QUAT_Q)).i16(Math.round(q.y * s * QUAT_Q)).i16(Math.round(q.z * s * QUAT_Q)).i16(Math.round(q.w * s * QUAT_Q));
  }

  dir(x, y, z) {
    return this.i16(Math.round(x * QUAT_Q)).i16(Math.round(y * QUAT_Q)).i16(Math.round(z * QUAT_Q));
  }

  str(s) {
    const b = new TextEncoder().encode(s ?? '');
    this.u16(b.length);
    return this.bytes(b);
  }

  finish() {
    return this.buf.slice(0, this.o);
  }
}

export class Reader {
  constructor(buf, o = 0) {
    this.dv = new DataView(buf);
    this.buf = buf;
    this.o = o;
  }

  get left() { return this.dv.byteLength - this.o; }
  u8() { const v = this.dv.getUint8(this.o); this.o += 1; return v; }
  i8() { const v = this.dv.getInt8(this.o); this.o += 1; return v; }
  u16() { const v = this.dv.getUint16(this.o, true); this.o += 2; return v; }
  i16() { const v = this.dv.getInt16(this.o, true); this.o += 2; return v; }
  u32() { const v = this.dv.getUint32(this.o, true); this.o += 4; return v; }
  f32() { const v = this.dv.getFloat32(this.o, true); this.o += 4; return v; }
  f64() { const v = this.dv.getFloat64(this.o, true); this.o += 8; return v; }

  bytes(n) {
    const v = new Uint8Array(this.buf, this.o, n);
    this.o += n;
    return v;
  }

  pos(out) {
    out[0] = this.i16() / POS_Q;
    out[1] = this.i16() / POS_Q;
    out[2] = this.i16() / POS_Q;
    return out;
  }

  quat(out) {
    const x = this.i16() / QUAT_Q, y = this.i16() / QUAT_Q, z = this.i16() / QUAT_Q, w = this.i16() / QUAT_Q;
    const l = Math.hypot(x, y, z, w) || 1;
    out[0] = x / l; out[1] = y / l; out[2] = z / l; out[3] = w / l;
    return out;
  }

  dir(out) {
    out[0] = this.i16() / QUAT_Q;
    out[1] = this.i16() / QUAT_Q;
    out[2] = this.i16() / QUAT_Q;
    return out;
  }

  str() {
    const n = this.u16();
    return new TextDecoder().decode(this.bytes(n));
  }
}

function clampI16(v) {
  return v > 32767 ? 32767 : v < -32768 ? -32768 : v | 0;
}

async function pipe(data, stream) {
  const blob = new Blob([data]);
  const out = blob.stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

export function deflate(data) {
  return pipe(data, new CompressionStream('deflate-raw'));
}

export function inflate(data) {
  return pipe(data, new DecompressionStream('deflate-raw'));
}

export function slerpArr(a, b, t, out) {
  let ax = a[0], ay = a[1], az = a[2], aw = a[3];
  let bx = b[0], by = b[1], bz = b[2], bw = b[3];
  let cos = ax * bx + ay * by + az * bz + aw * bw;
  if (cos < 0) { bx = -bx; by = -by; bz = -bz; bw = -bw; cos = -cos; }
  let k0 = 1 - t, k1 = t;
  if (cos < 0.9995) {
    const th = Math.acos(cos), s = Math.sin(th);
    k0 = Math.sin((1 - t) * th) / s;
    k1 = Math.sin(t * th) / s;
  }
  out[0] = ax * k0 + bx * k1; out[1] = ay * k0 + by * k1; out[2] = az * k0 + bz * k1; out[3] = aw * k0 + bw * k1;
  const l = Math.hypot(out[0], out[1], out[2], out[3]) || 1;
  out[0] /= l; out[1] /= l; out[2] /= l; out[3] /= l;
  return out;
}

export function lerpAngle(a, b, t) {
  let d = b - a;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return a + d * t;
}

export function fnv(u8) {
  let h = 0x811c9dc5;
  for (let i = 0; i < u8.length; i++) h = Math.imul(h ^ u8[i], 16777619);
  return h >>> 0;
}
