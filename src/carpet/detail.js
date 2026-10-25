// Rug Rush carpet detail textures: optional CC0 fiber maps with procedural fallbacks, hair strands, label, sticker and film crinkle.
import * as THREE from 'three';

const BASE = new URL('../../assets/textures/', import.meta.url).href;
const cache = new Map();

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

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

function heightToNormal(src, size, strength) {
  const g = src.getContext('2d').getImageData(0, 0, size, size).data;
  const out = canvas(size, size);
  const ctx = out.getContext('2d');
  const img = ctx.createImageData(size, size);
  const h = (x, y) => g[(((y + size) % size) * size + ((x + size) % size)) * 4] / 255;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (h(x + 1, y) - h(x - 1, y)) * strength;
    const dy = (h(x, y + 1) - h(x, y - 1)) * strength;
    const l = Math.hypot(dx, dy, 1);
    const i = (y * size + x) * 4;
    img.data[i] = (-dx / l * 0.5 + 0.5) * 255;
    img.data[i + 1] = (dy / l * 0.5 + 0.5) * 255;
    img.data[i + 2] = (1 / l * 0.5 + 0.5) * 255;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

function fiberHeight(kind, size = 512) {
  const c = canvas(size, size);
  const g = c.getContext('2d');
  const r = rng(kind.length * 977 + 11);
  g.fillStyle = '#202020';
  g.fillRect(0, 0, size, size);
  g.lineCap = 'round';
  const n = kind === 'loop' ? 2600 : kind === 'weave' ? 0 : 5200;
  if (kind === 'weave') {
    for (let y = 0; y < size; y += 8) for (let x = 0; x < size; x += 8) {
      const over = ((x + y) / 8) % 2 === 0;
      const grd = over ? g.createLinearGradient(x, y, x + 8, y) : g.createLinearGradient(x, y, x, y + 8);
      grd.addColorStop(0, '#303030');
      grd.addColorStop(0.5, '#e0e0e0');
      grd.addColorStop(1, '#303030');
      g.fillStyle = grd;
      g.fillRect(x, y, 8, 8);
    }
  }
  for (let i = 0; i < n; i++) {
    const x = r() * size, y = r() * size;
    const v = Math.floor(80 + r() * 175);
    g.strokeStyle = `rgb(${v},${v},${v})`;
    g.lineWidth = kind === 'loop' ? 3 + r() * 2 : 1.5 + r() * 2;
    const a = r() * Math.PI * 2, l = kind === 'loop' ? 4 + r() * 4 : 3 + r() * 9;
    for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) {
      if (Math.abs(x + ox - size / 2) > size / 2 + 20 || Math.abs(y + oy - size / 2) > size / 2 + 20) continue;
      g.beginPath();
      if (kind === 'loop') g.arc(x + ox, y + oy, l, a, a + Math.PI);
      else { g.moveTo(x + ox, y + oy); g.lineTo(x + ox + Math.cos(a) * l, y + oy + Math.sin(a) * l); }
      g.stroke();
    }
  }
  return c;
}

function texFromCanvas(c, srgb = false) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

export function detailSet(name, fallbackKind) {
  if (cache.has(name)) return cache.get(name);
  const fh = fiberHeight(fallbackKind);
  const set = { height: texFromCanvas(fh), normal: texFromCanvas(heightToNormal(fh, 512, 3)), loaded: false, name };
  cache.set(name, set);
  if (name) {
    const loader = new THREE.TextureLoader();
    const apply = (key, tex) => {
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.colorSpace = THREE.NoColorSpace;
      tex.anisotropy = 8;
      const old = set[key];
      old.dispose();
      old.image = tex.image;
      old.needsUpdate = true;
      set.loaded = true;
    };
    loader.load(`${BASE}${name}/height.jpg`, (t) => apply('height', t), undefined, () => {});
    loader.load(`${BASE}${name}/normal.jpg`, (t) => apply('normal', t), undefined, () => {});
  }
  return set;
}

export function hairTexture() {
  if (cache.has('_hair')) return cache.get('_hair');
  const size = 1024;
  const c = canvas(size, size);
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,0)';
  g.clearRect(0, 0, size, size);
  const r = rng(4242);
  g.lineCap = 'round';
  for (let i = 0; i < 260; i++) {
    const id = Math.floor(8 + r() * 247);
    const kind = r() < 0.55 ? 40 : r() < 0.7 ? 140 : 230;
    g.strokeStyle = `rgb(${id},${kind},255)`;
    g.lineWidth = 1.2 + r() * 1.4;
    let x = r() * size, y = r() * size, a = r() * Math.PI * 2;
    const len = 50 + r() * 200, steps = 14;
    const curl = (r() - 0.5) * 0.5;
    for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) {
      let px = x + ox, py = y + oy, pa = a;
      g.beginPath();
      g.moveTo(px, py);
      for (let s = 0; s < steps; s++) {
        pa += curl + (r() - 0.5) * 0.25;
        px += Math.cos(pa) * len / steps;
        py += Math.sin(pa) * len / steps;
        g.lineTo(px, py);
      }
      g.stroke();
    }
  }
  const t = texFromCanvas(c);
  t.premultiplyAlpha = false;
  cache.set('_hair', t);
  return t;
}

export function defaultLabelTexture(text = 'RUG RUSH') {
  const c = canvas(192, 320);
  const g = c.getContext('2d');
  g.fillStyle = '#f2efe6';
  g.fillRect(0, 0, 192, 320);
  g.strokeStyle = '#c9c3b4';
  g.lineWidth = 6;
  g.strokeRect(6, 6, 180, 308);
  g.fillStyle = '#2b2b2b';
  g.font = 'bold 26px sans-serif';
  g.textAlign = 'center';
  g.fillText(text, 96, 52);
  g.font = '16px sans-serif';
  g.fillText('100% WOOL', 96, 84);
  g.fillText('MADE BY HAND', 96, 106);
  g.lineWidth = 3;
  g.strokeStyle = '#2b2b2b';
  const icons = [[40, 150], [96, 150], [152, 150]];
  g.strokeRect(icons[0][0] - 18, icons[0][1] - 14, 36, 28);
  g.beginPath(); g.moveTo(icons[1][0] - 20, icons[1][1] + 14); g.lineTo(icons[1][0], icons[1][1] - 16); g.lineTo(icons[1][0] + 20, icons[1][1] + 14); g.closePath(); g.stroke();
  g.beginPath(); g.arc(icons[2][0], icons[2][1], 15, 0, Math.PI * 2); g.stroke();
  g.font = '14px sans-serif';
  g.fillText('DO NOT BLEACH', 96, 210);
  g.fillText('PROFESSIONAL', 96, 236);
  g.fillText('CLEAN ONLY', 96, 256);
  return texFromCanvas(c, true);
}

export function defaultStickerTexture(text = 'RUG RUSH') {
  const c = canvas(512, 256);
  const g = c.getContext('2d');
  g.fillStyle = '#fbfaf5';
  g.fillRect(0, 0, 512, 256);
  g.fillStyle = '#d94a2b';
  g.fillRect(0, 0, 512, 56);
  g.fillStyle = '#fff';
  g.font = 'bold 40px sans-serif';
  g.fillText(text, 20, 42);
  g.fillStyle = '#222';
  g.font = 'bold 26px sans-serif';
  g.fillText('CLEANED + PACKED', 20, 96);
  g.font = '20px monospace';
  g.fillText('ORDER #' + Math.floor(10000 + Math.random() * 89999), 20, 130);
  const r = rng(77);
  let x = 20;
  while (x < 492) {
    const w = 2 + Math.floor(r() * 5);
    if (r() > 0.4) g.fillRect(x, 150, w, 80);
    x += w + 1;
  }
  return texFromCanvas(c, true);
}

export function crinkleNormal() {
  if (cache.has('_crinkle')) return cache.get('_crinkle');
  const size = 512;
  const c = canvas(size, size);
  const g = c.getContext('2d');
  g.fillStyle = '#808080';
  g.fillRect(0, 0, size, size);
  const r = rng(99);
  for (let i = 0; i < 900; i++) {
    const v = Math.floor(90 + r() * 90);
    g.strokeStyle = `rgba(${v},${v},${v},0.35)`;
    g.lineWidth = 1 + r() * 4;
    const x = r() * size, y = r() * size, a = (r() - 0.5) * 0.6 + (r() < 0.7 ? 0 : Math.PI / 2), l = 20 + r() * 120;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  for (let y = 0; y < size; y += 64) {
    g.fillStyle = 'rgba(200,200,200,0.5)';
    g.fillRect(0, y, size, 3);
  }
  const t = texFromCanvas(heightToNormal(c, size, 2.2));
  cache.set('_crinkle', t);
  return t;
}

export function shagTile(size = 1024, tileM = 0.24) {
  if (cache.has('_shag')) return cache.get('_shag');
  const ppm = size / tileM;
  const N = size * size;
  const zb = new Float32Array(N);
  const id = new Float32Array(N);
  const ang = new Float32Array(N);
  const r = rng(9137);
  const tufts = Math.round(tileM * tileM * 3900);
  const seg = 12;
  const px = [], py = [], ph = [];
  for (let t = 0; t < tufts; t++) {
    const rx = r() * size, ry = r() * size;
    const main = r() * Math.PI * 2;
    const nStr = 5 + Math.floor(r() * 5);
    for (let k = 0; k < nStr; k++) {
      const fly = r() < 0.12;
      const len = (fly ? 0.015 + r() * 0.02 : 0.024 + r() * 0.028) * ppm;
      const rad = (fly ? 0.0005 + r() * 0.0003 : 0.0013 + r() * 0.0009) * ppm;
      let a = main + (r() - 0.5) * 2.6;
      const curl = (r() - 0.5) * 3.0 / len;
      const hs = fly ? 0.85 + r() * 0.15 : 0.6 + r() * 0.4;
      const sid = r();
      let x = rx + (r() - 0.5) * 0.009 * ppm + Math.cos(a) * 0.004 * ppm, y = ry + (r() - 0.5) * 0.009 * ppm + Math.sin(a) * 0.004 * ppm;
      px.length = 0; py.length = 0; ph.length = 0;
      for (let i = 0; i <= seg; i++) {
        const s = i / seg;
        px.push(x); py.push(y);
        ph.push(hs * (1 - 0.62 * Math.pow(s, 1.25)) * (0.96 + 0.04 * Math.sin(s * 9 + sid * 6)));
        a += curl * (len / seg);
        x += Math.cos(a) * len / seg;
        y += Math.sin(a) * len / seg;
      }
      const aStore = ((main % Math.PI) + Math.PI) % Math.PI / Math.PI;
      for (let i = 0; i < seg; i++) {
        const ax = px[i], ay = py[i], bx = px[i + 1], by = py[i + 1];
        const dx = bx - ax, dy = by - ay;
        const ll = dx * dx + dy * dy || 1;
        const x0 = Math.floor(Math.min(ax, bx) - rad - 1), x1 = Math.ceil(Math.max(ax, bx) + rad + 1);
        const y0 = Math.floor(Math.min(ay, by) - rad - 1), y1 = Math.ceil(Math.max(ay, by) + rad + 1);
        const sAng = (((Math.atan2(dy, dx)) % Math.PI) + Math.PI) % Math.PI / Math.PI;
        for (let yy = y0; yy <= y1; yy++) {
          const wy = ((yy % size) + size) % size;
          for (let xx = x0; xx <= x1; xx++) {
            const qx = xx + 0.5 - ax, qy = yy + 0.5 - ay;
            let t = (qx * dx + qy * dy) / ll;
            t = t < 0 ? 0 : t > 1 ? 1 : t;
            const ex = qx - dx * t, ey = qy - dy * t;
            const d2 = ex * ex + ey * ey;
            if (d2 > rad * rad) continue;
            const c = Math.sqrt(1 - d2 / (rad * rad));
            const along = (i + t) / seg;
            const tw = 0.018 * Math.sin((along * len / (0.0034 * ppm) + Math.sqrt(d2) / rad * 0.5 * (ex * dy - ey * dx > 0 ? 1 : -1)) * Math.PI * 2);
            const h = (ph[i] + (ph[i + 1] - ph[i]) * t) * (0.72 + 0.28 * c) + tw * c;
            const wx = ((xx % size) + size) % size;
            const k = wy * size + wx;
            if (h > zb[k]) { zb[k] = h; id[k] = sid; ang[k] = sAng; }
          }
        }
      }
    }
  }
  const blur = new Float32Array(N);
  const tmp = new Float32Array(N);
  const R = 9;
  for (let y = 0; y < size; y++) {
    let acc = 0;
    for (let x = -R; x <= R; x++) acc += zb[y * size + ((x + size) % size)];
    for (let x = 0; x < size; x++) {
      tmp[y * size + x] = acc / (2 * R + 1);
      acc += zb[y * size + ((x + R + 1) % size)] - zb[y * size + ((x - R + size) % size)];
    }
  }
  for (let x = 0; x < size; x++) {
    let acc = 0;
    for (let y = -R; y <= R; y++) acc += tmp[((y + size) % size) * size + x];
    for (let y = 0; y < size; y++) {
      blur[y * size + x] = acc / (2 * R + 1);
      acc += tmp[((y + R + 1) % size) * size + x] - tmp[((y - R + size) % size) * size + x];
    }
  }
  const data = new Uint8Array(N * 4);
  for (let k = 0; k < N; k++) {
    const ao = Math.max(0.25, Math.min(1, 1 - (blur[k] - zb[k]) * 2.2));
    data[k * 4] = Math.round(Math.min(1, zb[k]) * 255);
    data[k * 4 + 1] = Math.round(id[k] * 255);
    data[k * 4 + 2] = Math.round(ang[k] * 255);
    data[k * 4 + 3] = Math.round(ao * 255);
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.colorSpace = THREE.NoColorSpace;
  t.needsUpdate = true;
  cache.set('_shag', t);
  return t;
}

export function filmAlpha() {
  if (cache.has('_filmA')) return cache.get('_filmA');
  const size = 512;
  const c = canvas(size, size);
  const g = c.getContext('2d');
  g.fillStyle = 'rgb(34,34,34)';
  g.fillRect(0, 0, size, size);
  const r = rng(311);
  g.lineCap = 'round';
  for (let i = 0; i < 520; i++) {
    const v = Math.floor(60 + r() * 150);
    g.strokeStyle = `rgba(${v},${v},${v},${0.25 + r() * 0.5})`;
    g.lineWidth = 0.6 + r() * 2.2;
    const x = r() * size, y = r() * size;
    const a = Math.PI / 2 + (r() - 0.5) * 0.9, l = 10 + r() * 70;
    for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) {
      g.beginPath();
      g.moveTo(x + ox, y + oy);
      g.quadraticCurveTo(x + ox + Math.cos(a + 0.4) * l * 0.5, y + oy + Math.sin(a + 0.4) * l * 0.5, x + ox + Math.cos(a) * l, y + oy + Math.sin(a) * l);
      g.stroke();
    }
  }
  for (let k = 0; k < 3; k++) {
    const x = r() * size;
    const grd = g.createLinearGradient(x - 10, 0, x + 10, 0);
    grd.addColorStop(0, 'rgba(255,255,255,0)');
    grd.addColorStop(0.5, 'rgba(200,200,200,0.55)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(x - 10, 0, 20, size);
  }
  const t = texFromCanvas(c);
  cache.set('_filmA', t);
  return t;
}
