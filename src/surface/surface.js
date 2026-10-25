// Rug Rush carpet surface: per-cell dirt, product, damage and pile-direction grids mirrored into GPU data textures.
import * as THREE from 'three';

export const CELLS_PER_M = 50;

export const CHANNELS = {
  dirt0: ['dust', 'hair', 'mud', 'sticky'],
  dirt1: ['wine', 'coffee', 'grease', 'urine'],
  dirt2: ['gum', 'wax', 'paint', 'mold'],
  layer: ['water', 'powder', 'gel', 'foam'],
  tintGel: ['r', 'g', 'b', 'foamDirt'],
  tintPowder: ['r', 'g', 'b', 'waterDirt'],
  damage: ['bleed', 'bleach', 'shrink', 'burn'],
  nap: ['dirX', 'dirY', 'fluff', 'crush'],
};

export const TEX_NAMES = Object.keys(CHANNELS);

const CH = {};
for (const [tex, chans] of Object.entries(CHANNELS)) chans.forEach((c, i) => (CH[`${tex}.${c}`] = [tex, i]));
export function channel(path) {
  return CH[path];
}

function hash(x, y, s) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

export function valueNoise(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, seed), b = hash(xi + 1, yi, seed), c = hash(xi, yi + 1, seed), d = hash(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm(x, y, seed, oct = 4) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) {
    s += valueNoise(x * f, y * f, seed + i * 17) * a;
    n += a;
    a *= 0.5;
    f *= 2;
  }
  return s / n;
}

export class CarpetSurface {
  constructor(widthM, lengthM, cellsPerM = CELLS_PER_M) {
    this.widthM = widthM;
    this.lengthM = lengthM;
    this.cellsPerM = cellsPerM;
    this.W = Math.max(8, Math.round(widthM * cellsPerM));
    this.H = Math.max(8, Math.round(lengthM * cellsPerM));
    this.N = this.W * this.H;
    this.data = {};
    this.textures = {};
    this.dirty = new Set();
    this.netDirty = new Set();
    for (const name of TEX_NAMES) {
      const arr = new Uint8Array(this.N * 4);
      const tex = new THREE.DataTexture(arr, this.W, this.H, THREE.RGBAFormat, THREE.UnsignedByteType);
      tex.colorSpace = THREE.NoColorSpace;
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.magFilter = THREE.LinearFilter;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.generateMipmaps = true;
      tex.flipY = false;
      tex.needsUpdate = true;
      this.data[name] = arr;
      this.textures[name] = tex;
    }
    const nap = this.data.nap;
    for (let i = 0; i < this.N; i++) {
      nap[i * 4] = 128;
      nap[i * 4 + 1] = 255;
      nap[i * 4 + 2] = 190;
      nap[i * 4 + 3] = 0;
    }
    const tg = this.data.tintGel, tp = this.data.tintPowder;
    for (let i = 0; i < this.N; i++) {
      tg[i * 4] = 120; tg[i * 4 + 1] = 190; tg[i * 4 + 2] = 230;
      tp[i * 4] = 245; tp[i * 4 + 1] = 245; tp[i * 4 + 2] = 240;
    }
    this.markAllDirty();
  }

  markDirty(name) {
    this.dirty.add(name);
  }

  markAllDirty() {
    for (const n of TEX_NAMES) this.dirty.add(n);
  }

  upload() {
    for (const n of this.dirty) {
      this.textures[n].needsUpdate = true;
      this.netDirty.add(n);
    }
    this.dirty.clear();
  }

  idx(x, y) {
    return (y * this.W + x) * 4;
  }

  uvToCell(u, v) {
    return { x: Math.min(this.W - 1, Math.max(0, Math.floor(u * this.W))), y: Math.min(this.H - 1, Math.max(0, Math.floor(v * this.H))) };
  }

  get(path, x, y) {
    const [tex, c] = CH[path];
    return this.data[tex][this.idx(x, y) + c] / 255;
  }

  set(path, x, y, value) {
    const [tex, c] = CH[path];
    this.data[tex][this.idx(x, y) + c] = Math.max(0, Math.min(255, Math.round(value * 255)));
    this.dirty.add(tex);
  }

  forEachInRadius(u, v, radiusM, fn) {
    const cx = u * this.W, cy = v * this.H;
    const r = radiusM * this.cellsPerM;
    const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(this.W - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(this.H - 1, Math.ceil(cy + r));
    const r2 = r * r;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;
        const fall = 1 - Math.sqrt(d2) / Math.max(r, 1e-6);
        fn(x, y, fall * fall * (3 - 2 * fall), this.idx(x, y));
      }
    }
  }

  stamp(path, u, v, radiusM, amount, mode = 'add') {
    const [tex, c] = CH[path];
    const arr = this.data[tex];
    this.forEachInRadius(u, v, radiusM, (x, y, w, i) => {
      const cur = arr[i + c] / 255;
      const nv = mode === 'add' ? cur + amount * w : mode === 'sub' ? cur - amount * w : cur + (amount - cur) * w;
      arr[i + c] = Math.max(0, Math.min(255, Math.round(nv * 255)));
    });
    this.dirty.add(tex);
  }

  napStroke(u, v, dirU, dirV, radiusM, strength = 0.5) {
    const len = Math.hypot(dirU, dirV) || 1;
    const tx = dirU / len, ty = dirV / len;
    const nap = this.data.nap;
    this.forEachInRadius(u, v, radiusM, (x, y, w, i) => {
      const k = Math.min(1, strength * w);
      let dx = nap[i] / 127.5 - 1, dy = nap[i + 1] / 127.5 - 1;
      dx += (tx - dx) * k;
      dy += (ty - dy) * k;
      const l = Math.hypot(dx, dy) || 1;
      nap[i] = Math.round((dx / l * 0.5 + 0.5) * 255);
      nap[i + 1] = Math.round((dy / l * 0.5 + 0.5) * 255);
    });
    this.dirty.add('nap');
  }

  napCrush(u, v, radiusM, amount = 0.6) {
    this.stamp('nap.crush', u, v, radiusM, amount, 'add');
  }

  coverage(path) {
    const [tex, c] = CH[path];
    const arr = this.data[tex];
    let s = 0;
    for (let i = 0; i < this.N; i++) s += arr[i * 4 + c];
    return s / (this.N * 255);
  }

  debugFill(seed = 1) {
    const W = this.W, H = this.H;
    const put = (path, fn) => {
      const [tex, c] = CH[path];
      const arr = this.data[tex];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) arr[(y * W + x) * 4 + c] = Math.round(Math.max(0, Math.min(1, fn(x / W, y / H))) * 255);
    };
    const blob = (cu, cv, r, sharp = 6) => (u, v) => {
      const d = Math.hypot((u - cu) * this.widthM, (v - cv) * this.lengthM) / r;
      const n = fbm(u * this.widthM * 3, v * this.lengthM * 3, seed + 9) * 0.6;
      return Math.max(0, Math.min(1, (1 - d + n - 0.3) * sharp));
    };
    put('dirt0.dust', (u, v) => fbm(u * this.widthM * 4, v * this.lengthM * 4, seed) * 1.3 - 0.35);
    put('dirt0.hair', (u, v) => (fbm(u * this.widthM * 9, v * this.lengthM * 9, seed + 3) > 0.62 ? 0.8 : 0));
    put('dirt0.mud', blob(0.25, 0.2, 0.35));
    put('dirt0.sticky', blob(0.7, 0.3, 0.25));
    put('dirt1.wine', blob(0.3, 0.55, 0.22));
    put('dirt1.coffee', blob(0.72, 0.62, 0.2));
    put('dirt1.grease', blob(0.5, 0.42, 0.18));
    put('dirt1.urine', blob(0.25, 0.8, 0.3, 3));
    put('dirt2.gum', blob(0.62, 0.86, 0.03, 20));
    put('dirt2.wax', blob(0.45, 0.72, 0.06, 12));
    put('dirt2.paint', blob(0.8, 0.12, 0.08, 10));
    put('dirt2.mold', (u, v) => (v > 0.9 ? fbm(u * 30, v * 30, seed + 5) * 2 - 0.6 : 0));
    put('layer.water', (u, v) => (u > 0.5 && v < 0.5 ? 0.85 : 0));
    put('layer.powder', blob(0.2, 0.42, 0.2, 4));
    put('layer.gel', blob(0.55, 0.22, 0.15, 5));
    put('layer.foam', blob(0.75, 0.42, 0.22, 3));
    put('tintGel.foamDirt', (u, v) => (u > 0.75 ? 0.7 : 0));
    put('tintPowder.waterDirt', (u, v) => (v < 0.25 ? 0.6 : 0));
    put('damage.bleed', blob(0.15, 0.62, 0.15, 3));
    put('damage.bleach', blob(0.85, 0.75, 0.1, 6));
    put('damage.shrink', (u, v) => (v > 0.95 ? 1 : 0));
    put('damage.burn', blob(0.9, 0.92, 0.05, 12));
    this.markAllDirty();
  }

  dispose() {
    for (const t of Object.values(this.textures)) t.dispose();
  }
}
