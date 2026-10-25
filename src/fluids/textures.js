// Rug Rush fluids: procedural tileable textures for water detail normals, foam bubbles and powder grain.
import * as THREE from 'three';

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function finish(tex) {
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function waterNormalTexture(size = 256, seed = 11) {
  const r = rng(seed);
  const waves = [];
  for (let i = 0; i < 36; i++) {
    let kx, ky;
    do {
      kx = Math.round((r() * 2 - 1) * 16);
      ky = Math.round((r() * 2 - 1) * 16);
    } while (kx * kx + ky * ky < 5);
    const k = Math.hypot(kx, ky);
    waves.push([kx, ky, r() * Math.PI * 2, 1 / Math.pow(k, 1.35)]);
  }
  const h = new Float32Array(size * size);
  let mn = Infinity, mx = -Infinity;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size;
    let s = 0;
    for (const [kx, ky, ph, a] of waves) s += a * Math.sin(2 * Math.PI * (kx * u + ky * v) + ph);
    h[y * size + x] = s;
    if (s < mn) mn = s;
    if (s > mx) mx = s;
  }
  const fb = new Float32Array(size * size);
  const oct = [[1, 0.55, 0, 0], [4, 0.3, 0.31, 0.17], [11, 0.15, 0.73, 0.41]];
  let fmn = Infinity, fmx = -Infinity;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let v = 0;
    for (const [f, a, ox, oy] of oct) {
      const xx = (x * f + ox * size) % size, yy = (y * f + oy * size) % size;
      const xi = Math.floor(xx), yi = Math.floor(yy), tx = xx - xi, ty = yy - yi;
      const g = (i, j) => h[((j + size) % size) * size + ((i + size) % size)];
      v += a * ((g(xi, yi) * (1 - tx) + g(xi + 1, yi) * tx) * (1 - ty) + (g(xi, yi + 1) * (1 - tx) + g(xi + 1, yi + 1) * tx) * ty);
    }
    fb[y * size + x] = v;
    if (v < fmn) fmn = v;
    if (v > fmx) fmx = v;
  }
  const data = new Uint8Array(size * size * 4);
  const sc = size / (mx - mn) * 0.18;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const xl = (x + size - 1) % size, xr = (x + 1) % size, yd = (y + size - 1) % size, yu = (y + 1) % size;
    const dx = (h[y * size + xr] - h[y * size + xl]) * sc;
    const dy = (h[yu * size + x] - h[yd * size + x]) * sc;
    const l = Math.hypot(dx, dy, 1);
    const i = (y * size + x) * 4;
    data[i] = Math.round((-dx / l * 0.5 + 0.5) * 255);
    data[i + 1] = Math.round((-dy / l * 0.5 + 0.5) * 255);
    data[i + 2] = Math.round((h[y * size + x] - mn) / (mx - mn) * 255);
    data[i + 3] = Math.round((fb[y * size + x] - fmn) / (fmx - fmn) * 255);
  }
  return finish(new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType));
}

export function bubbleTexture(size = 256, cells = 14, seed = 5) {
  const r = rng(seed);
  const pts = [];
  for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) pts.push([(i + 0.12 + r() * 0.76) / cells, (j + 0.12 + r() * 0.76) / cells, r()]);
  const data = new Uint8Array(size * size * 4);
  const cs = 1 / cells;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = (x + 0.5) / size, v = (y + 0.5) / size;
    const ci = Math.floor(u * cells), cj = Math.floor(v * cells);
    let d1 = 9, d2 = 9, vx = 0, vy = 0, id = 0;
    for (let oj = -2; oj <= 2; oj++) for (let oi = -2; oi <= 2; oi++) {
      const ii = (ci + oi + cells) % cells, jj = (cj + oj + cells) % cells;
      const p = pts[jj * cells + ii];
      const px = p[0] + Math.floor((ci + oi) / cells) * 1, py = p[1] + Math.floor((cj + oj) / cells) * 1;
      const dx = px - u, dy = py - v;
      const d = Math.hypot(dx, dy);
      if (d < d1) {
        d2 = d1;
        d1 = d;
        vx = dx;
        vy = dy;
        id = p[2];
      } else if (d < d2) d2 = d;
    }
    const i = (y * size + x) * 4;
    data[i] = Math.round(Math.max(0, Math.min(1, vx / cs * 0.5 + 0.5)) * 255);
    data[i + 1] = Math.round(Math.max(0, Math.min(1, vy / cs * 0.5 + 0.5)) * 255);
    data[i + 2] = Math.round(Math.min(1, (d2 - d1) / cs) * 255);
    data[i + 3] = Math.round(id * 255);
  }
  return finish(new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType));
}

export function grainTexture(size = 256, seed = 3) {
  const r = rng(seed);
  const mask = new Float32Array(size * size);
  const id = new Float32Array(size * size).fill(1);
  const spark = new Float32Array(size * size);
  const n = Math.round(size * size * 0.045);
  for (let k = 0; k < n; k++) {
    const cx = r() * size, cy = r() * size, rad = 0.9 + r() * 1.5, v = r() * 0.97, sp = Math.pow(r(), 5);
    const x0 = Math.floor(cx - rad - 1), x1 = Math.ceil(cx + rad + 1), y0 = Math.floor(cy - rad - 1), y1 = Math.ceil(cy + rad + 1);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      const m = Math.max(0, Math.min(1, rad + 0.5 - d));
      if (m <= 0) continue;
      const i = ((y + size) % size) * size + ((x + size) % size);
      if (m > mask[i]) {
        mask[i] = m;
        id[i] = v;
        spark[i] = sp;
      }
    }
  }
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    data[i * 4] = Math.round(mask[i] * 255);
    data[i * 4 + 1] = Math.round(id[i] * 255);
    data[i * 4 + 2] = Math.round(spark[i] * 255);
    data[i * 4 + 3] = Math.round((0.75 + r() * 0.25) * 255);
  }
  return finish(new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType));
}
