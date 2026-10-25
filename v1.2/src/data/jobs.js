// Rug Rush client jobs: soiling stories and the generator that paints realistic initial dirt onto a rug state.
import { fbm } from '../surface/surface.js';

export const STORIES = [
  { id: 'dog', client: 'The Kowalski family', note: 'Our dog loves this rug. A bit too much.', soils: [['hair', 'even', 0.85], ['urine', 'spots', 0.9], ['mud', 'paws', 0.9], ['dust', 'traffic', 0.6]] },
  { id: 'party', client: 'Flat 4B', note: 'Housewarming party. We are so sorry.', soils: [['wine', 'blob', 1], ['sticky', 'spots', 0.8], ['gum', 'lumps', 1], ['wax', 'lumps', 1], ['dust', 'even', 0.4]] },
  { id: 'cafe', client: 'Café Ziarno', note: 'Entrance rug. Seven years of mornings.', soils: [['coffee', 'spots', 0.9], ['grease', 'spots', 0.7], ['dust', 'traffic', 1], ['sticky', 'spots', 0.5]] },
  { id: 'kids', client: 'Nowak household', note: 'Kids room. Art happened.', soils: [['paint', 'splatter', 1], ['sticky', 'spots', 0.7], ['gum', 'lumps', 1], ['mud', 'spots', 0.6], ['dust', 'even', 0.4]] },
  { id: 'garage', client: 'Mr. Zieliński', note: 'Found it rolled up in the garage after 3 years.', soils: [['dust', 'even', 1], ['mold', 'edge', 0.9], ['grease', 'blob', 0.6], ['paint', 'splatter', 0.4]] },
  { id: 'grandma', client: 'Mrs. Wiśniewska', note: 'Candles every evening. And the cat.', soils: [['wax', 'lumps', 1], ['urine', 'spots', 0.7], ['hair', 'even', 0.5], ['coffee', 'spots', 0.6], ['dust', 'even', 0.5]] },
  { id: 'office', client: 'Gzowo Industries', note: 'Meeting room. Nobody admits anything.', soils: [['coffee', 'spots', 1], ['dust', 'traffic', 0.8], ['gum', 'lumps', 1], ['sticky', 'spots', 0.4]] },
  { id: 'student', client: 'Student dorm 312', note: 'Do your best.', soils: [['wine', 'spots', 0.8], ['grease', 'spots', 0.6], ['mud', 'paws', 0.6], ['sticky', 'spots', 0.7], ['dust', 'even', 0.7], ['hair', 'even', 0.4]] },
];

export const PAINT_COLORS = ['#2a6fd0', '#e0402e', '#2fa04a', '#f2c230', '#8a3fd0', '#ff7a1a'];

export function rngFrom(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function smooth(e0, e1, x) {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

export function soilRug(st, story, seed) {
  const rnd = rngFrom(seed * 9973 + 17);
  const { W, H, widthM, lengthM } = st;
  const add = (name, x, y, v) => {
    const a = st.f[name];
    const i = y * W + x;
    a[i] = Math.min(1, Math.max(a[i], v));
  };
  const field = (name, fn) => {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const v = fn((x + 0.5) / W, (y + 0.5) / H, (x + 0.5) / W * widthM, (y + 0.5) / H * lengthM);
      if (v > 0.003) add(name, x, y, v);
    }
  };
  const disc = (name, cu, cv, r, amt, ns = 0.5, sd = 1) => {
    const cx = cu * widthM, cy = cv * lengthM;
    const x0 = Math.max(0, Math.floor((cx - r * 1.6) / widthM * W)), x1 = Math.min(W - 1, Math.ceil((cx + r * 1.6) / widthM * W));
    const y0 = Math.max(0, Math.floor((cy - r * 1.6) / lengthM * H)), y1 = Math.min(H - 1, Math.ceil((cy + r * 1.6) / lengthM * H));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = (x + 0.5) / W * widthM, py = (y + 0.5) / H * lengthM;
      const d = Math.hypot(px - cx, py - cy) / r;
      const n = (fbm(px * 6, py * 6, sd) - 0.5) * ns * 2;
      const v = smooth(1.05, 0.75, d + n) * amt;
      if (v > 0.003) add(name, x, y, v);
    }
  };
  for (const [name, shape, strength] of story.soils) {
    const amt = strength * (0.75 + rnd() * 0.25);
    const sd = Math.floor(rnd() * 1e6);
    if (shape === 'even') {
      field(name, (u, v, px, py) => amt * smooth(0.32, 0.72, fbm(px * 2.2, py * 2.2, sd, 5)) * (0.55 + 0.45 * fbm(px * 9, py * 9, sd + 3)));
    } else if (shape === 'traffic') {
      const off = (rnd() - 0.5) * 0.3;
      field(name, (u, v, px, py) => {
        const lane = Math.exp(-Math.pow(((u - 0.5 - off) * widthM) / (widthM * 0.28), 2));
        return amt * lane * (0.5 + 0.6 * fbm(px * 3, py * 3, sd, 4)) * smooth(0.0, 0.15, Math.min(v, 1 - v) * 2 + 0.1);
      });
    } else if (shape === 'spots') {
      const n = 2 + Math.floor(rnd() * 4);
      for (let k = 0; k < n; k++) disc(name, 0.12 + rnd() * 0.76, 0.1 + rnd() * 0.8, 0.07 + rnd() * 0.16, amt * (0.7 + rnd() * 0.3), 0.6, sd + k);
    } else if (shape === 'blob') {
      const cu = 0.25 + rnd() * 0.5, cv = 0.25 + rnd() * 0.5, r = 0.22 + rnd() * 0.2;
      disc(name, cu, cv, r, amt, 0.8, sd);
      for (let k = 0; k < 7; k++) {
        const a = rnd() * Math.PI * 2, d = r * (1.1 + rnd() * 0.9);
        disc(name, cu + Math.cos(a) * d / widthM, cv + Math.sin(a) * d / lengthM, 0.02 + rnd() * 0.05, amt * 0.9, 0.4, sd + k + 50);
      }
    } else if (shape === 'paws') {
      const trails = 2 + Math.floor(rnd() * 2);
      for (let t = 0; t < trails; t++) {
        let x = rnd() * widthM, y = 0, a = Math.PI / 2 + (rnd() - 0.5) * 0.8;
        if (rnd() < 0.5) { y = lengthM; a = -a; }
        for (let s = 0; s < 40; s++) {
          a += (rnd() - 0.5) * 0.35;
          x += Math.cos(a) * 0.22;
          y += Math.sin(a) * 0.22;
          if (x < 0 || x > widthM || y < 0 || y > lengthM) break;
          const side = s % 2 ? 1 : -1;
          const px = x + Math.cos(a + Math.PI / 2) * 0.06 * side, py = y + Math.sin(a + Math.PI / 2) * 0.06 * side;
          disc(name, px / widthM, py / lengthM, 0.03, amt * (0.6 + rnd() * 0.4), 0.3, sd + s);
          for (let toe = 0; toe < 4; toe++) {
            const ta = a + (toe - 1.5) * 0.45;
            disc(name, (px + Math.cos(ta) * 0.045) / widthM, (py + Math.sin(ta) * 0.045) / lengthM, 0.012, amt * 0.8, 0.2, sd + s * 7 + toe);
          }
        }
      }
    } else if (shape === 'splatter') {
      const cu = 0.2 + rnd() * 0.6, cv = 0.2 + rnd() * 0.6;
      disc(name, cu, cv, 0.08 + rnd() * 0.08, amt, 0.7, sd);
      for (let k = 0; k < 26; k++) {
        const a = rnd() * Math.PI * 2, d = 0.1 + Math.pow(rnd(), 1.6) * 0.7;
        disc(name, cu + Math.cos(a) * d / widthM, cv + Math.sin(a) * d / lengthM, 0.008 + rnd() * 0.025, amt, 0.3, sd + k);
      }
    } else if (shape === 'edge') {
      const end = rnd() < 0.5;
      field(name, (u, v, px, py) => {
        const e = end ? v : 1 - v;
        return amt * smooth(0.22, 0.02, e + (fbm(px * 4, py * 4, sd) - 0.5) * 0.18) * smooth(0.35, 0.65, fbm(px * 14, py * 14, sd + 1));
      });
    } else if (shape === 'lumps') {
      const n = 2 + Math.floor(rnd() * 4);
      for (let k = 0; k < n; k++) disc(name, 0.1 + rnd() * 0.8, 0.1 + rnd() * 0.8, 0.018 + rnd() * 0.03, 1, 0.25, sd + k);
    }
  }
}
