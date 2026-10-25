// Rug Rush rug pattern baker: seeded GPU design pass on a knot/weave grid plus a finishing pass with yarn, abrash and wear.
import * as THREE from 'three';
import { GLSL_COMMON, GLSL_SDF } from './glsl.js';

export const PATTERN_IDS = { tweed: 0, modern: 1, solid: 2, persian: 3, silk: 4, sisal: 5, kilim: 6 };

export function mulberry(seed) {
  let a = (seed * 2654435761) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PERSIAN = [
  ['#8a2a22', '#1f2d4d', '#e3d6b8', '#9b2d24', '#c8963f', '#1d2a47', '#a8382c', '#e6dbc0', '#c79a4a', '#d9c9a3', '#8a2a22', '#2a1c16', '#e9dec4', '#c59443', '#56683f', '#6f8db0'],
  ['#1e2b4a', '#8e2a24', '#e7dcc3', '#23345a', '#c9a04a', '#8b2723', '#1e2b4a', '#e8dcc2', '#c9a04a', '#e3d5b5', '#1e2b4a', '#22170f', '#e9dfc7', '#c79c45', '#5a6b3e', '#7193b8'],
  ['#e2d5b8', '#8d2521', '#23355c', '#e2d5b8', '#b33c2e', '#8d2521', '#22325a', '#e7dbc0', '#c49a4e', '#22325a', '#d8c497', '#3a2a22', '#ece2ca', '#c1953f', '#617448', '#6d8fb3'],
  ['#a0462a', '#233a3a', '#e3cfa3', '#7d2b1f', '#d0a24c', '#2b3b52', '#a0462a', '#e3cfa3', '#c99d4f', '#d8c39a', '#7d2b1f', '#24180f', '#eadcbc', '#c8973f', '#4f6a44', '#7c9cb4'],
  ['#7a1f24', '#e2d6bb', '#24365e', '#7a1f24', '#d4a548', '#24365e', '#9a2b2b', '#e6dabf', '#c99c4a', '#c99c4a', '#24365e', '#20140f', '#ebe0c6', '#cf9f45', '#3f6b52', '#89a7c2'],
];

const SILK = [
  ['#e8e0cc', '#1f4f8f', '#b8344a', '#e8e0cc', '#d9a441', '#1a4a86', '#b8344a', '#ece2c7', '#d4aa4a', '#c9b27a', '#1a4a86', '#2b2633', '#f0e9d6', '#d9a843', '#2f7d5b', '#7fb2d6'],
  ['#2f6a8f', '#ebe2c9', '#a3283e', '#2f6a8f', '#e0b14a', '#a3283e', '#2f6a8f', '#efe6cf', '#dcae4c', '#e6d7ae', '#a3283e', '#1d2430', '#f1ead7', '#d9a842', '#2e7a5f', '#8fc0de'],
  ['#a8203a', '#efe6cf', '#204a7e', '#a8203a', '#e3b54d', '#1d3f6e', '#c4374f', '#efe6cf', '#dcb04e', '#e8d9b0', '#204a7e', '#2a1a20', '#f3ecda', '#dfae47', '#2f7a58', '#86b9d8'],
];

const KILIM = [
  ['#9d2e22', '#283a5e', '#e6dcc4', '#2a201a', '#c46a2b', '#c99b3c', '#5b6e3c', '#d8c7a0'],
  ['#e3d7bd', '#8f2a21', '#2b3a5c', '#231a14', '#c97a31', '#b98f3a', '#4f6a42', '#a8432c'],
  ['#2b3a5c', '#a3332a', '#e5d9bf', '#1f1712', '#d0883a', '#c9a24a', '#6a7b44', '#b85d34'],
];

const MODERN = [
  ['#3b3d40', '#6b7b8c', '#c9a14a', '#e4ddd0', '#2c3a4f', '#a65d3f'],
  ['#b0644a', '#8e9a7f', '#e6dccb', '#4a4642', '#d4a373', '#6f7f87'],
  ['#1f2a44', '#e5dcc8', '#c49a45', '#46566e', '#8a8f96', '#2c2c2c'],
  ['#2d4a6b', '#4f6f93', '#8aa3bd', '#c7d2dc', '#e2e2dc', '#1d3047'],
  ['#7d3b45', '#a85d68', '#d39aa0', '#ead2cf', '#e9e4dc', '#55262e'],
  ['#3d3f42', '#686c70', '#9a9ea2', '#cfd1d2', '#e8e6e1', '#26282a'],
];

const TWEED = [
  [['#707377', 0.48], ['#4a4d52', 0.24], ['#9b9ea2', 0.16], ['#4f5d75', 0.07], ['#6b5a4a', 0.05]],
  [['#3e4c66', 0.45], ['#2b3447', 0.25], ['#6b7a94', 0.16], ['#8a8f99', 0.09], ['#504a44', 0.05]],
  [['#6e6155', 0.45], ['#4a4038', 0.25], ['#8d8274', 0.16], ['#a39886', 0.09], ['#3f4a5a', 0.05]],
  [['#5f665c', 0.46], ['#3f453d', 0.24], ['#858b80', 0.16], ['#9a9a8c', 0.09], ['#5a5248', 0.05]],
];

const SHAG = ['#ebe3d3', '#f1ece0', '#e7c9c3', '#b9c4ae', '#b8c9d9', '#c9bdd6', '#eedfa8', '#c9c8c4', '#bfd9cc', '#efc9ab'];
const SISAL_TAPE = ['#4a3a2c', '#2a2a2a', '#d8ccb4', '#1f2c45', '#5b5b58', '#7a2e25'];

function jitter(hex, rnd, amt = 0.035) {
  const c = new THREE.Color(hex);
  const hsl = {};
  c.getHSL(hsl, THREE.SRGBColorSpace);
  c.setHSL((hsl.h + (rnd() - 0.5) * amt * 0.5 + 1) % 1, Math.min(1, Math.max(0, hsl.s * (1 + (rnd() - 0.5) * amt * 2))), Math.min(1, Math.max(0, hsl.l * (1 + (rnd() - 0.5) * amt * 2))), THREE.SRGBColorSpace);
  const o = {};
  c.getRGB(o, THREE.SRGBColorSpace);
  return new THREE.Vector3(o.r, o.g, o.b);
}

export function srgbToLinear(v) {
  const f = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return new THREE.Vector3(f(v.x), f(v.y), f(v.z));
}

export function linearToSrgb(v) {
  const f = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
  return new THREE.Vector3(f(v.x), f(v.y), f(v.z));
}

function toVec3s(list, rnd, amt) {
  const out = [];
  for (let i = 0; i < 16; i++) out.push(jitter(list[i % list.length], rnd, amt));
  return out;
}

export function patternSpec(pattern, widthM, lengthM, seed) {
  const rnd = mulberry(seed * 7919 + 13);
  const W = widthM * 100, L = lengthM * 100;
  const spec = { pattern, id: PATTERN_IDS[pattern], W, L, seed, A: new THREE.Vector4(), B: new THREE.Vector4(), cells: [0, 0], fuzz: 1, abrash: 0, wear: 0, yarn: null, micro: 0 };
  let pal;
  if (pattern === 'persian' || pattern === 'silk') {
    const fine = pattern === 'silk';
    const kpc = fine ? 3.2 : 2.1;
    spec.cells = [Math.round(W * kpc), Math.round(L * kpc)];
    const set = fine ? SILK : PERSIAN;
    pal = toVec3s(set[Math.floor(rnd() * set.length)], rnd, fine ? 0.02 : 0.05);
    const border = Math.min(fine ? 30 : 44, Math.max(fine ? 11 : 14, W * (fine ? 0.14 : 0.16)));
    let variant = fine ? (rnd() < 0.4 ? 4 : rnd() < 0.5 ? 0 : 1) : Math.floor(rnd() * 4);
    if (variant === 3 && rnd() < 0.5) variant = 0;
    spec.A.set(border, 0.6 + rnd() * 0.1, fine ? 7 + rnd() * 2 : 11 + rnd() * 4, variant);
    spec.B.set(Math.floor(rnd() * 3), 1.6 + rnd() * 0.4, fine ? 0.25 : 0.9, rnd() * 100);
    spec.fuzz = fine ? 0.5 : 1.0;
    spec.abrash = fine ? 0.03 : 0.11;
    spec.wear = fine ? 0.02 : 0.08;
  } else if (pattern === 'kilim') {
    spec.cells = [Math.round(W / 0.45), Math.round(L / 0.4)];
    pal = toVec3s(KILIM[Math.floor(rnd() * KILIM.length)], rnd, 0.05);
    spec.A.set(rnd() < 0.55 ? 0 : 1, rnd() * 100, 0, 0);
    spec.fuzz = 0;
    spec.abrash = 0.14;
    spec.wear = 0.05;
    spec.micro = 3;
  } else if (pattern === 'modern') {
    spec.cells = [Math.round(W / 0.3), Math.round(L / 0.3)];
    const variant = Math.floor(rnd() * 4);
    const set = variant === 2 ? MODERN.slice(3) : MODERN.slice(0, 3);
    pal = toVec3s(set[Math.floor(rnd() * set.length)], rnd, 0.03);
    spec.A.set(variant, rnd() * 100, 20 + rnd() * 18, rnd());
    spec.B.set(Math.min(40, Math.max(14, W * 0.16)), 0.5 + rnd() * 0.1, 10 + rnd() * 3, 0);
    spec.fuzz = 0.6;
    spec.abrash = 0.0;
    spec.wear = variant === 2 ? 0.0 : 0.03;
  } else if (pattern === 'tweed') {
    spec.cells = [Math.max(8, Math.round(W / 1.5)), Math.max(8, Math.round(L / 1.5))];
    const set = TWEED[Math.floor(rnd() * TWEED.length)];
    const yarn = set.map(([hex, w]) => [jitter(hex, rnd, 0.03), w]);
    const meanLin = new THREE.Vector3();
    for (const [c, w] of yarn) meanLin.add(srgbToLinear(c).multiplyScalar(w));
    const mean = linearToSrgb(meanLin);
    pal = [];
    for (let i = 0; i < 16; i++) pal.push(mean.clone());
    for (let i = 0; i < 5; i++) pal[i + 1] = yarn[i][0].clone();
    let acc = 0;
    const cum = yarn.map(([, w]) => (acc += w));
    const stripe = rnd() < 0.5;
    spec.A.set(stripe ? 18 + rnd() * 20 : 0, rnd() * 100, 0, 0);
    spec.B.set(cum[0], cum[1], cum[2], cum[3]);
    spec.yarn = { colors: yarn.map(([c]) => srgbToLinear(c)), weights: yarn.map(([, w]) => w), mean: meanLin };
    spec.micro = 1;
  } else if (pattern === 'sisal') {
    spec.cells = [Math.max(8, Math.round(W / 1.0)), Math.max(8, Math.round(L / 1.0))];
    const base = jitter(rnd() < 0.5 ? '#bba584' : '#ab9370', rnd, 0.04);
    const tape = jitter(SISAL_TAPE[Math.floor(rnd() * SISAL_TAPE.length)], rnd, 0.03);
    pal = [];
    for (let i = 0; i < 16; i++) pal.push(base.clone());
    pal[1] = tape.clone();
    spec.A.set(4 + rnd() * 2.5, rnd() * 100, 0, 0);
    spec.micro = 2;
  } else {
    spec.cells = [Math.max(8, Math.round(W / 2)), Math.max(8, Math.round(L / 2))];
    const c = jitter(SHAG[Math.floor(rnd() * SHAG.length)], rnd, 0.03);
    pal = [];
    for (let i = 0; i < 16; i++) pal.push(c.clone());
    spec.A.set(rnd() * 100, 0, 0, 0);
  }
  spec.palette = pal;
  spec.seedOff = new THREE.Vector2(rnd() * 97.3, rnd() * 61.7);
  const longPx = Math.round(Math.min(2048, Math.max(1024, Math.max(W, L) * 5.2)));
  const s = longPx / Math.max(W, L);
  spec.out = [Math.max(256, Math.round(W * s)), Math.max(256, Math.round(L * s))];
  return spec;
}

const DESIGN_FRAG = `
uniform vec2 uSize;
uniform vec2 uCells;
uniform vec3 uPal[16];
uniform vec4 uA;
uniform vec4 uB;
uniform vec2 uSeed;
${GLSL_COMMON}
${GLSL_SDF}
vec3 C;
float OW;
void lay(float sd, vec3 fill) { if (sd < 0.0) C = fill; else if (sd < OW) C = uPal[11]; }
void layNO(float sd, vec3 fill) { if (sd < 0.0) C = fill; }

vec3 guardOuter(float s, float t, float w) {
  C = uPal[9];
  float per = w * 1.5;
  float x = s - per * floor(s / per + 0.5);
  vec2 lp = vec2(x, (t - 0.5) * w);
  lay(sdRosette(lp, w * 0.34, 4.0, 0.35), uPal[10]);
  layNO(length(lp) - w * 0.1, uPal[13]);
  float x2 = s - per * (floor(s / per) + 0.5);
  layNO(sdDiamond(vec2(x2, lp.y), vec2(w * 0.14, w * 0.2)), uPal[11]);
  return C;
}

vec3 guardInner(float s, float t, float w, float style) {
  if (style < 0.5) {
    C = uPal[13];
    float per = w * 1.2;
    float ph = fract(s / per);
    float tri = abs(ph - 0.5) * 2.0;
    if (t < tri * 0.8 + 0.1) C = uPal[0];
    float x = s - per * floor(s / per + 0.5);
    layNO(length(vec2(x, (t - 0.5) * w)) - w * 0.12, uPal[12]);
  } else if (style < 1.5) {
    C = uPal[12];
    float per = w * 1.4;
    float x = s - per * floor(s / per + 0.5);
    vec2 lp = vec2(x, (t - 0.5) * w);
    lay(sdStar(lp, w * 0.38, 8.0, 0.35), uPal[0]);
    layNO(length(lp) - w * 0.1, uPal[13]);
  } else {
    C = uPal[0];
    float y = (t - 0.5) * w;
    float wave = sin(s / w * 3.14159) * w * 0.22;
    lay(abs(y - wave) - w * 0.13, uPal[12]);
    float per = w * 2.0;
    float x = s - per * floor(s / per + 0.5);
    layNO(length(vec2(x, y + w * 0.22)) - w * 0.1, uPal[13]);
  }
  return C;
}

vec3 mainBorder(float s, float sideLen, float y, float w, float k) {
  C = uPal[5];
  float Lu = w * uB.y;
  float n = max(1.0, floor(sideLen / Lu + 0.5));
  Lu = sideLen / n;
  float sc = s - sideLen * 0.5 + (mod(n, 2.0) > 0.5 ? 0.0 : Lu * 0.5);
  float idx = floor(sc / Lu + 0.5);
  float x = sc - idx * Lu;
  float vy = 0.3 * w * sin(6.28318 * x / Lu);
  layNO(abs(y - vy) - 0.75 * k, uPal[8]);
  for (int j = -1; j <= 1; j += 2) {
    float fj = float(j);
    vec2 lc = vec2(x - fj * Lu * 0.25, y - 0.3 * w * sin(6.28318 * fj * 0.25));
    vec2 lr = rr_rot(lc, fj * 0.7 + 0.3);
    lay(sdLeaf(lr, 0.17 * w, 0.06 * w, 0.4), uPal[14]);
  }
  for (int j = -1; j <= 1; j += 2) {
    float fj = float(j);
    float dir = mod(idx + (fj > 0.0 ? 1.0 : 0.0), 2.0) < 0.5 ? 1.0 : -1.0;
    vec2 P = vec2(x - fj * Lu * 0.5, (y + dir * 0.3 * w) * dir);
    lay(sdPalmette(P, 0.66 * w), uPal[7]);
    lay(sdPalmette(P - vec2(0.0, 0.05 * w), 0.42 * w), uPal[6]);
    layNO(sdPalmette(P - vec2(0.0, 0.1 * w), 0.2 * w), uPal[13]);
    lay(length(P) - 0.11 * w, uPal[13]);
  }
  vec2 R = vec2(x, y);
  lay(sdRosette(R, 0.38 * w, 8.0, 0.24), uPal[6]);
  lay(sdRosette(rr_rot(R, 0.39), 0.24 * w, 8.0, 0.3), uPal[12]);
  layNO(sdRosette(R, 0.13 * w, 6.0, 0.3), uPal[13]);
  layNO(length(R) - 0.045 * w, uPal[3]);
  return C;
}

void herati(vec2 f, float hs, float k) {
  vec2 cs = vec2(hs, hs * 1.25);
  vec2 g = f / cs;
  vec2 cid = floor(g + 0.5);
  vec2 lc = (g - cid) * cs;
  layNO(abs(sdDiamond(lc, cs * 0.5)) - 0.45 * k, uPal[13]);
  for (int qi = 0; qi < 4; qi++) {
    float sx = (qi == 0 || qi == 3) ? 1.0 : -1.0;
    float sy = (qi < 2) ? 1.0 : -1.0;
    vec2 c0 = vec2(sx * 0.25 * cs.x, sy * 0.25 * cs.y);
    vec2 nrm = normalize(vec2(sx / cs.x, sy / cs.y));
    c0 += nrm * 0.06 * hs;
    vec2 axis = normalize(vec2(-sx * cs.x, sy * cs.y));
    vec2 d = lc - c0;
    vec2 lr = vec2(dot(d, vec2(axis.y, -axis.x)), dot(d, axis));
    lay(sdLeaf(lr, 0.2 * hs, 0.065 * hs, 0.35 * sx * sy), (qi == 0 || qi == 2) ? uPal[14] : uPal[15]);
  }
  lay(sdRosette(lc, 0.15 * hs, 6.0, 0.3), uPal[13]);
  layNO(length(lc) - 0.05 * hs, uPal[3]);
  vec2 v1 = vec2(abs(lc.x) - cs.x * 0.5, lc.y);
  vec2 v2 = vec2(lc.x, abs(lc.y) - cs.y * 0.5);
  lay(sdRosette(v1, 0.1 * hs, 4.0, 0.4), uPal[12]);
  lay(sdRosette(v2, 0.1 * hs, 4.0, 0.4), uPal[12]);
  layNO(length(v1) - 0.035 * hs, uPal[0] * 0.8);
  layNO(length(v2) - 0.035 * hs, uPal[0] * 0.8);
}

vec4 persian(vec2 p) {
  float W = uSize.x, L = uSize.y;
  float k = uSize.x / uCells.x;
  OW = k * 0.95;
  p.x += (rr_fbm3(vec2(p.y * 0.012, uB.w)) - 0.5) * uB.z;
  float endB = 2.0;
  float yy = min(p.y, L - p.y);
  if (yy < endB) {
    vec3 c = uPal[12] * 0.96;
    if (yy > 0.7 && yy < 1.15) c = uPal[0];
    return vec4(c, 0.0);
  }
  vec2 q = vec2(p.x, p.y - endB);
  vec2 S = vec2(W, L - 2.0 * endB);
  float dx = min(q.x, S.x - q.x), dy = min(q.y, S.y - q.y);
  float d = min(dx, dy);
  float B = uA.x;
  float a1 = B * 0.1, a2 = a1 + k, a3 = a2 + B * 0.55, a4 = a3 + k, a5 = a4 + B * 0.15, a6 = a5 + B * 0.07;
  bool longSide = dx < dy;
  float s = longSide ? q.y : q.x;
  float sideLen = longSide ? S.y : S.x;
  if (d < k * 0.9) return vec4(uPal[11], 1.0);
  if (d < a1) return vec4(guardOuter(s, (d - k) / (a1 - k), a1 - k), 1.0);
  if (d < a2) return vec4(uPal[11], 1.0);
  if (d < a3) return vec4(mainBorder(s, sideLen, d - (a2 + a3) * 0.5, a3 - a2, k), 1.0);
  if (d < a4) return vec4(uPal[11], 1.0);
  if (d < a5) return vec4(guardInner(s, (d - a4) / (a5 - a4), a5 - a4, uB.x), 1.0);
  if (d < a6) {
    float t = (d - a5) / (a6 - a5);
    vec3 c = uPal[12];
    float per = (a6 - a5) * 1.6;
    float x = s - per * floor(s / per + 0.5);
    if (abs(x) < (a6 - a5) * 0.3 && abs(t - 0.5) < 0.3) c = uPal[3];
    return vec4(c, 1.0);
  }
  if (d < B) return vec4(uPal[11], 1.0);
  vec2 f = q - S * 0.5;
  vec2 F = S * 0.5 - B;
  C = uPal[0];
  float variant = uA.w;
  herati(f, uA.z, k);
  if (variant < 2.5 || variant > 3.5) {
    vec2 l2 = F - abs(f);
    float rs = min(F.x, F.y) * 0.62;
    vec2 nn = l2 / vec2(rs, rs * 1.15);
    float an = atan(nn.y, nn.x);
    float edge = 1.0 + 0.05 * cos(an * 14.0);
    float sdS = (length(nn) - edge) * rs;
    if (variant < 3.5) {
      lay(sdS, uPal[1]);
      if (sdS < 0.0) {
        layNO(abs(sdS + 0.1 * rs) - 0.6 * k, uPal[12]);
        if (sdS < -0.13 * rs) {
          vec2 g = l2 / (0.22 * rs);
          vec2 lc = (fract(g) - 0.5) * 0.22 * rs;
          lay(sdRosette(lc, 0.07 * rs, 6.0, 0.35), uPal[6]);
          layNO(length(lc) - 0.02 * rs, uPal[13]);
        }
        lay(sdRosette(l2, 0.3 * rs, 8.0, 0.25), uPal[6]);
        layNO(sdRosette(l2, 0.16 * rs, 8.0, 0.3), uPal[13]);
      }
    }
  }
  if (variant < 2.5) {
    float rx = F.x * uA.y;
    float ry = min(rx * 1.22, F.y * 0.44);
    vec2 m = f / vec2(rx, ry);
    float an = atan(m.y, m.x);
    float nexp = 1.35;
    float mm = pow(pow(abs(m.x), nexp) + pow(abs(m.y), nexp), 1.0 / nexp);
    float R = 1.0 + 0.045 * cos(an * 20.0);
    float sc = min(rx, ry);
    float yP = ry * 1.33;
    vec2 pp = vec2(f.x, abs(f.y) - yP);
    lay(sdBox(vec2(f.x, abs(f.y) - (ry + yP) * 0.5), vec2(0.9 * k, (yP - ry) * 0.55)), uPal[1]);
    lay(sdDiamond(pp, vec2(0.2 * rx, 0.16 * ry)), uPal[1]);
    layNO(sdDiamond(pp, vec2(0.11 * rx, 0.085 * ry)), uPal[13]);
    lay(sdPalmette(vec2(f.x, abs(f.y) - yP - 0.14 * ry), 0.15 * rx), uPal[6]);
    lay((mm - R) * sc, uPal[1]);
    if (mm < R) {
      float a24 = floor(an / 0.2618 + 0.5) * 0.2618;
      vec2 dp = vec2(cos(a24), sin(a24)) * 0.925 / pow(pow(abs(cos(a24)), nexp) + pow(abs(sin(a24)), nexp), 1.0 / nexp) * vec2(rx, ry);
      layNO(length(f - dp) - 0.025 * sc, uPal[12]);
      float R2 = R * 0.85;
      lay((mm - R2) * sc, uPal[2]);
      if (mm < R2) {
        float a8 = floor(an / 0.7854 + 0.5) * 0.7854;
        vec2 rp = vec2(cos(a8), sin(a8)) * 0.66 / pow(pow(abs(cos(a8)), nexp) + pow(abs(sin(a8)), nexp), 1.0 / nexp) * vec2(rx, ry);
        lay(sdRosette(f - rp, 0.1 * sc, 6.0, 0.3), uPal[6]);
        layNO(length(f - rp) - 0.03 * sc, uPal[13]);
        float a8b = (floor(an / 0.7854) + 0.5) * 0.7854;
        vec2 lp = vec2(cos(a8b), sin(a8b)) * 0.66 / pow(pow(abs(cos(a8b)), nexp) + pow(abs(sin(a8b)), nexp), 1.0 / nexp) * vec2(rx, ry);
        vec2 ld = rr_rot(f - lp, -a8b);
        lay(sdLeaf(ld, 0.1 * sc, 0.035 * sc, 0.2), uPal[14]);
        float R3 = 0.45 * (1.0 + 0.08 * cos(an * 8.0));
        lay((mm - R3) * sc, uPal[3]);
        lay(sdRosette(f, 0.27 * sc, 12.0, 0.22), uPal[4]);
        lay(sdRosette(rr_rot(f, 0.26), 0.15 * sc, 8.0, 0.3), uPal[1]);
        layNO(length(f) - 0.05 * sc, uPal[12]);
      }
    }
  } else if (variant > 3.5) {
    float yS = F.y * 0.05;
    float cc = 0.32 * F.x;
    float Rr = F.x + cc;
    float sdA = f.y > yS ? length(f - vec2(-sign(f.x) * cc, yS)) - Rr : abs(f.x) - F.x;
    float apex = yS + sqrt(Rr * Rr - cc * cc);
    if (apex > F.y * 0.92) sdA = max(sdA, f.y - F.y * 0.92);
    if (sdA > 0.0) {
      C = uPal[1];
      vec2 g = f / (uA.z * 0.8);
      vec2 lc = (fract(g) - 0.5) * uA.z * 0.8;
      lay(sdRosette(lc, 0.2 * uA.z, 6.0, 0.35), uPal[6]);
      layNO(length(lc) - 0.06 * uA.z, uPal[13]);
    }
    layNO(abs(sdA + 0.6 * k) - 0.7 * k, uPal[13]);
    if (abs(sdA) < OW && sdA > 0.0) C = uPal[11];
    vec2 lampP = vec2(f.x, f.y - (min(apex, F.y * 0.92) - F.y * 0.22));
    lay(sdBox(vec2(f.x, f.y - (min(apex, F.y * 0.92) - F.y * 0.11)), vec2(0.5 * k, F.y * 0.1)), uPal[13]);
    lay(sdRosette(lampP, F.x * 0.12, 6.0, 0.3), uPal[3]);
    lay(sdPalmette(vec2(lampP.x, -lampP.y - F.x * 0.08), F.x * 0.14), uPal[13]);
    vec2 vp = vec2(f.x, f.y + F.y * 0.55);
    for (int j = -1; j <= 1; j++) {
      float fj = float(j);
      vec2 sp2 = rr_rot(vp - vec2(0.0, F.y * 0.05), fj * 0.5);
      lay(sdBox(sp2 - vec2(0.0, F.y * 0.12), vec2(0.5 * k, F.y * 0.12)), uPal[14]);
      lay(sdRosette(sp2 - vec2(0.0, F.y * 0.26), F.x * 0.1, 8.0, 0.3), j == 0 ? uPal[6] : uPal[13]);
      layNO(length(sp2 - vec2(0.0, F.y * 0.26)) - F.x * 0.03, uPal[12]);
      lay(sdLeaf(rr_rot(sp2 - vec2(F.x * 0.06, F.y * 0.14), -0.8), F.x * 0.07, F.x * 0.025, 0.2), uPal[14]);
    }
    lay(length((vp + vec2(0.0, F.y * 0.03)) / vec2(F.x * 0.16, F.y * 0.075)) - 1.0, uPal[1]);
    layNO(abs(vp.y + F.y * 0.03) - 0.6 * k, uPal[13]);
    layNO(length((vp + vec2(0.0, F.y * 0.03)) / vec2(F.x * 0.07, F.y * 0.03)) - 1.0, uPal[6]);
    lay(sdBox(vp - vec2(0.0, F.y * 0.055), vec2(F.x * 0.05, F.y * 0.025)), uPal[1]);
  }
  return vec4(C, 1.0);
}

vec4 kilim(vec2 p) {
  float W = uSize.x, L = uSize.y;
  OW = 0.0;
  float yy = min(p.y, L - p.y);
  if (yy < 3.5) {
    float b = floor(yy / 0.8);
    vec3 c = mod(b, 3.0) < 0.5 ? uPal[2] : (mod(b, 3.0) < 1.5 ? uPal[0] : uPal[3]);
    return vec4(c, 1.0);
  }
  vec2 q = vec2(p.x, p.y - 3.5);
  vec2 S = vec2(W, L - 7.0);
  float bw = clamp(W * 0.1, 8.0, 20.0);
  float dx = min(q.x, S.x - q.x);
  if (dx < bw) {
    float t = dx / bw;
    if (t < 0.14) return vec4(uPal[3], 1.0);
    if (t > 0.86) return vec4(uPal[2], 1.0);
    float tt = (t - 0.14) / 0.72;
    float per = bw * 1.2;
    float ph = fract(q.y / per);
    float tri = abs(ph - 0.5) * 2.0;
    vec3 c = tt < tri ? uPal[1] : uPal[4];
    float cy = q.y - per * floor(q.y / per + 0.5);
    float ct = (tt - 0.25) * bw * 0.72;
    if (abs(ct) / (bw * 0.12) + abs(cy) / (per * 0.16) < 1.0) c = uPal[2];
    return vec4(c, 1.0);
  }
  vec2 f = q - S * 0.5;
  vec2 F = vec2(S.x * 0.5 - bw, S.y * 0.5);
  vec3 bg = uPal[0];
  if (uA.x < 0.5) {
    float N = max(1.0, floor(S.y / (F.x * 2.2) + 0.5));
    float segL = S.y / N;
    float yi = floor(q.y / segL);
    float ly = q.y - (yi + 0.5) * segL;
    vec2 lp = vec2(f.x, ly);
    vec2 rad = vec2(F.x * 0.8, segL * 0.42);
    float r = abs(lp.x) / rad.x + abs(lp.y) / rad.y;
    if (r < 1.0) {
      float ring = floor(r * 5.0);
      vec3 c = ring > 3.5 ? uPal[1] : ring > 2.5 ? uPal[2] : ring > 1.5 ? uPal[4] : ring > 0.5 ? uPal[3] : uPal[5];
      if (r < 0.12) c = uPal[2];
      if (ring > 2.5 && ring < 3.5) {
        float e = (lp.x / rad.x + lp.y / rad.y) * 8.0;
        if (fract(e) < 0.25) c = uPal[0];
      }
      return vec4(c, 1.0);
    }
    float e2 = abs(lp.x) / rad.x - abs(lp.y) / rad.y;
    if (r < 1.2 && fract(e2 * 5.0 + 0.5) < 0.3) return vec4(uPal[1], 1.0);
    if (r < 1.06) return vec4(uPal[3], 1.0);
    float yb = q.y - segL * floor(q.y / segL + 0.5);
    vec2 hp = vec2(F.x - abs(f.x), yb);
    float rh = abs(hp.x) / (F.x * 0.38) + abs(hp.y) / (segL * 0.22);
    if (rh < 1.0) return vec4(rh < 0.5 ? uPal[3] : uPal[5], 1.0);
    vec2 g = f / vec2(6.0, 6.0);
    vec2 lc = (fract(g + 0.5) - 0.5) * 6.0;
    float hh = rr_h21(floor(g + 0.5) + uA.y);
    if (hh > 0.45 && ((abs(lc.x) < 0.5 && abs(lc.y) < 1.7) || (abs(lc.y) < 0.45 && abs(lc.x) < 1.7))) return vec4(hh > 0.75 ? uPal[2] : uPal[6], 1.0);
    return vec4(bg, 1.0);
  }
  float bandH = 14.0 + floor(rr_h11(uA.y) * 3.0) * 4.0;
  float bi = floor(q.y / bandH);
  float ly = q.y - (bi + 0.5) * bandH;
  float kind = floor(rr_h11(bi * 1.37 + uA.y) * 4.0);
  if (mod(bi, 2.0) > 0.5) kind = 4.0;
  vec3 c = bg;
  if (kind < 0.5) {
    float per = bandH * 0.9;
    float x = f.x - per * floor(f.x / per + 0.5);
    float r = abs(x) / (per * 0.45) + abs(ly) / (bandH * 0.42);
    c = r < 0.35 ? uPal[5] : r < 0.65 ? uPal[3] : r < 1.0 ? uPal[1] : uPal[2];
    if (r > 1.0 && r < 1.15) c = uPal[3];
  } else if (kind < 1.5) {
    float ph = fract(f.x / (bandH * 0.8));
    float tri = abs(ph - 0.5) * 2.0;
    float t = ly / bandH + 0.5;
    c = t < tri ? uPal[4] : uPal[1];
    if (abs(t - tri) < 0.07) c = uPal[2];
  } else if (kind < 2.5) {
    float s = floor((ly / bandH + 0.5) * 7.0);
    c = mod(s, 2.0) < 0.5 ? uPal[2] : (mod(s, 4.0) < 1.5 ? uPal[3] : uPal[6]);
  } else if (kind < 3.5) {
    float per = bandH * 0.7;
    float x = f.x - per * floor(f.x / per + 0.5);
    float r = abs(x) / (per * 0.3) + abs(ly) / (bandH * 0.36);
    c = uPal[3];
    if (r < 1.0) c = uPal[4];
    if (r < 0.45) c = uPal[2];
    if (abs(ly) > bandH * 0.42) c = uPal[2];
  } else {
    float t = abs(ly) / (bandH * 0.5);
    c = t > 0.8 ? uPal[3] : t > 0.6 ? uPal[2] : bg;
    float per = 4.0;
    float x = f.x - per * floor(f.x / per + 0.5);
    if (t < 0.4 && abs(x) + abs(ly) < 1.6) c = uPal[5];
  }
  return vec4(c, 1.0);
}

vec4 modern(vec2 p) {
  float W = uSize.x, L = uSize.y;
  float variant = uA.x;
  float k = uSize.x / uCells.x;
  OW = k * 1.1;
  float d = min(min(p.x, W - p.x), min(p.y, L - p.y));
  vec2 sp = p + uSeed * 10.0;
  if (variant < 0.5) {
    if (d < 3.0) return vec4(uPal[0], 1.0);
    if (d < 3.6) return vec4(uPal[3], 1.0);
    vec2 w = vec2(rr_fbm(sp * 0.006), rr_fbm(sp * 0.006 + 5.2));
    float v = rr_fbm(sp * 0.004 + w * 1.6);
    float lv = v * 5.0;
    float band = floor(lv);
    float fr = fract(lv);
    vec3 c = band < 1.5 ? uPal[0] : band < 2.5 ? uPal[1] : band < 3.0 ? uPal[3] : band < 3.5 ? uPal[2] : uPal[5];
    float edge = min(fr, 1.0 - fr) / max(fwidth(lv), 1e-4);
    if (edge < 1.1 && band > 1.5) c = uPal[3];
    float lines = abs(fract(v * 22.0) - 0.5);
    if (band > 2.5 && band < 3.0 && lines < 0.06) c = uPal[4];
    return vec4(c, 1.0);
  }
  if (variant < 1.5) {
    if (d < 4.0) return vec4(d < 1.5 ? uPal[0] : uPal[3], 1.0);
    float per = uA.z;
    vec2 g = (p - vec2(W, L) * 0.5) / vec2(per, per * 1.35);
    vec2 lc = fract(g + 0.5) - 0.5;
    float x = abs(lc.x), y = abs(lc.y);
    float ogee = abs(x + y - 0.5 + 0.12 * sin(6.28318 * (lc.y - lc.x)));
    float l = ogee * per;
    vec3 c = uPal[0];
    if (l < 1.0) c = uPal[3];
    if (length(lc * vec2(1.0, 1.35)) * per < 1.4) c = uPal[2];
    return vec4(c, 1.0);
  }
  if (variant < 2.5) {
    vec4 pr = persian(p);
    float lum = rr_luma(pr.rgb);
    float t = clamp((lum - 0.12) / 0.75, 0.0, 1.0);
    vec3 c = t < 0.25 ? uPal[5] : t < 0.45 ? uPal[0] : t < 0.62 ? uPal[1] : t < 0.82 ? uPal[2] : uPal[3];
    float n = rr_fbm(sp * 0.035);
    float n2 = rr_vnoise(sp * vec2(0.15, 2.2));
    float distress = smoothstep(0.6, 0.75, n) * (0.35 + 0.65 * n2);
    c = mix(c, uPal[4], distress * 0.75);
    return vec4(c, pr.a);
  }
  if (d < 2.5) return vec4(uPal[3], 1.0);
  vec3 c = uPal[3];
  vec2 cp = p - vec2(W, L) * 0.5;
  float s = min(W, L);
  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    vec3 h = rr_h32(vec2(fi, uA.y));
    vec2 ctr = (h.xy - 0.5) * vec2(W, L) * 0.8;
    float r = s * (0.12 + h.z * 0.25);
    float kind = floor(rr_h11(fi + uA.y * 3.1) * 3.0);
    float sd;
    if (kind < 0.5) sd = length(cp - ctr) - r;
    else if (kind < 1.5) sd = sdBox(rr_rot(cp - ctr, h.x * 3.14), vec2(r, r * 0.45));
    else sd = abs(length(cp - ctr) - r) - r * 0.12;
    if (sd < 0.0) c = uPal[i - 6 * (i / 6)];
    else if (sd < k * 1.6 && i > 3) c = uPal[3];
  }
  return vec4(c, 1.0);
}

vec4 tweed(vec2 p) {
  float stripe = 0.0;
  if (uA.x > 0.5) {
    float s = abs(p.x - uA.x * floor(p.x / uA.x + 0.5));
    if (s < 0.4) stripe = 1.0;
  }
  return vec4(vec3(stripe), 1.0);
}

vec4 sisal(vec2 p) {
  float W = uSize.x, L = uSize.y;
  float d = min(min(p.x, W - p.x), min(p.y, L - p.y));
  float tw = uA.x;
  if (d < tw) {
    vec3 c = uPal[1];
    if (abs(d - tw + 0.45) < 0.12 || abs(d - 0.45) < 0.12) c *= 0.75;
    return vec4(c, 0.0);
  }
  vec2 sp = p + uSeed * 10.0;
  float n = rr_fbm(sp * 0.02);
  vec3 c = uPal[0] * (0.9 + 0.2 * n);
  return vec4(c, 1.0);
}

vec4 solid(vec2 p) {
  vec2 sp = p + uSeed * 10.0;
  float n = rr_fbm(sp * 0.015);
  return vec4(uPal[0] * (0.95 + 0.1 * n), 1.0);
}

void main() {
  vec2 cell = floor(gl_FragCoord.xy);
  vec2 p = (cell + 0.5) / uCells * uSize;
  vec4 r;
#if PATTERN == 0
  r = tweed(p);
#elif PATTERN == 1
  r = modern(p);
#elif PATTERN == 2
  r = solid(p);
#elif PATTERN == 3 || PATTERN == 4
  r = persian(p);
#elif PATTERN == 5
  r = sisal(p);
#else
  r = kilim(p);
#endif
  gl_FragColor = vec4(clamp(r.rgb, 0.0, 1.0), r.a);
}
`;

const FINISH_FRAG = `
uniform sampler2D tDesign;
uniform vec2 uSize;
uniform vec2 uCells;
uniform vec2 uOut;
uniform vec2 uSeed;
uniform float uFuzz;
uniform float uAbrash;
uniform float uWear;
uniform vec3 uPalF[16];
uniform vec4 uB;
${GLSL_COMMON}
vec4 fetchD(vec2 c) { return texelFetch(tDesign, ivec2(clamp(c, vec2(0.0), uCells - 1.0)), 0); }
void main() {
  vec2 uv = gl_FragCoord.xy / uOut;
  vec2 pcm = uv * uSize;
  vec3 c;
  float a = 1.0;
#if PATTERN == 3 || PATTERN == 4 || PATTERN == 1 || PATTERN == 6
  vec2 kc = uv * uCells;
  kc.x += (rr_vnoise(vec2(kc.y * 0.07, 3.7) + uSeed) - 0.5) * 0.7 * uFuzz;
  vec2 jit = vec2(rr_vnoise(pcm * vec2(9.0, 3.0) + uSeed), rr_vnoise(pcm * vec2(4.0, 7.0) + uSeed.yx)) - 0.5;
  kc += jit * vec2(0.55, 0.9) * uFuzz;
  vec2 cell = floor(kc);
  vec2 fk = kc - cell;
  vec4 d = fetchD(cell);
  c = rr_toLin(d.rgb);
  a = d.a;
#if PATTERN == 6
  vec4 dr = fetchD(cell + vec2(1.0, 0.0));
  vec4 dl = fetchD(cell - vec2(1.0, 0.0));
  float slitR = 0.0, slitL = 0.0;
  if (distance(d.rgb, dr.rgb) > 0.02) {
    float up = distance(fetchD(cell + vec2(0.0, 1.0)).rgb, fetchD(cell + vec2(1.0, 1.0)).rgb);
    float dn = distance(fetchD(cell - vec2(0.0, 1.0)).rgb, fetchD(cell + vec2(1.0, -1.0)).rgb);
    if (up > 0.02 && dn > 0.02) slitR = 1.0;
  }
  if (distance(d.rgb, dl.rgb) > 0.02) {
    float up = distance(fetchD(cell + vec2(0.0, 1.0)).rgb, fetchD(cell + vec2(-1.0, 1.0)).rgb);
    float dn = distance(fetchD(cell - vec2(0.0, 1.0)).rgb, fetchD(cell + vec2(-1.0, -1.0)).rgb);
    if (up > 0.02 && dn > 0.02) slitL = 1.0;
  }
  float slit = max(slitR * smoothstep(0.86, 0.95, fk.x), slitL * (1.0 - smoothstep(0.05, 0.14, fk.x)));
  vec3 hw = rr_h32(vec2(floor(pcm.y * 3.2), cell.x * 0.01) + uSeed);
  c *= 0.95 + 0.1 * hw.x;
  c = mix(c, c * 0.18, slit);
  a = 1.0 - slit * 0.8;
#else
  vec4 dn = fetchD(cell + vec2(0.0, fk.y < 0.5 ? -1.0 : 1.0));
  vec4 de = fetchD(cell + vec2(fk.x < 0.5 ? -1.0 : 1.0, 0.0));
  float wy = smoothstep(0.25, 0.5, abs(fk.y - 0.5)) * 0.22 * uFuzz;
  float wx = smoothstep(0.3, 0.5, abs(fk.x - 0.5)) * 0.15 * uFuzz;
  c = mix(c, rr_toLin(dn.rgb), wy);
  c = mix(c, rr_toLin(de.rgb), wx);
  vec3 hk = rr_h32(cell + uSeed * 3.0);
  c *= 1.0 + (hk.x - 0.5) * 0.09;
  c = rr_hue(c, (hk.y - 0.5) * 0.05);
  float fib = rr_vnoise(pcm * vec2(7.0, 2.2) + uSeed);
  c *= 0.95 + 0.1 * fib;
#endif
#elif PATTERN == 0
  float stripe = texture2D(tDesign, uv).r;
  vec2 lp = pcm / vec2(0.32, 0.29);
  vec2 lc = floor(lp);
  float h = rr_h21(lc + uSeed);
  float h2 = rr_h21(lc + uSeed + 17.1);
  float hh = (fract(lp.x) > 0.5 && h2 < 0.45) ? rr_h21(lc + uSeed + 5.3) : h;
  vec3 y = hh < uB.x ? uPalF[1] : hh < uB.y ? uPalF[2] : hh < uB.z ? uPalF[3] : hh < uB.w ? uPalF[4] : uPalF[5];
  c = rr_toLin(y);
  c *= mix(1.0, 0.8, stripe);
  c *= 0.96 + 0.08 * rr_vnoise(pcm * 0.35 + uSeed);
#elif PATTERN == 5
  vec4 d = texture2D(tDesign, uv);
  c = rr_toLin(d.rgb);
  a = step(0.5, d.a);
  if (a < 0.5) {
    c *= 0.94 + 0.08 * rr_vnoise(pcm * vec2(9.0, 0.6) + uSeed);
  } else {
    float ci = floor(pcm.x / 1.25);
    float sg = mod(ci, 2.0) < 0.5 ? 1.0 : -1.0;
    float t = (pcm.y + sg * pcm.x) / 0.42;
    float tone = rr_h21(vec2(floor(t), ci) + uSeed);
    float streak = rr_vnoise(vec2(pcm.x * 3.0 - sg * pcm.y * 3.0, t * 0.15) + uSeed);
    c *= (0.86 + 0.28 * tone) * (0.9 + 0.2 * streak) * (0.92 + 0.16 * rr_vnoise(pcm * vec2(0.9, 0.3) + uSeed));
    c = mix(c, c * vec3(1.06, 0.98, 0.86), smoothstep(0.6, 0.9, tone));
  }
#else
  c = rr_toLin(texture2D(tDesign, uv).rgb);
  c *= 0.97 + 0.06 * rr_fbm3(pcm * 0.05 + uSeed);
#endif
  if (uAbrash > 0.0) {
    float ab = rr_fbm3(vec2(pcm.y * 0.018, uSeed.x * 3.1));
    float band = floor(ab * 6.0) / 6.0 + (rr_vnoise(vec2(pcm.y * 0.4, uSeed.y)) - 0.5) * 0.08;
    float sat = clamp((max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b))) * 3.0, 0.0, 1.0);
    c *= 1.0 + (band - 0.5) * uAbrash * (0.4 + 0.6 * sat) * 2.0;
    c = rr_hue(c, (band - 0.5) * uAbrash * 0.6 * sat);
  }
  if (uWear > 0.0) {
    float wear = rr_fbm(pcm * 0.025 + uSeed * 1.7);
    float cen = 1.0 - clamp(length((uv - 0.5) * vec2(1.6, 1.2)), 0.0, 1.0);
    c = mix(c, rr_sat(c, 0.75) * 1.12 + 0.012, smoothstep(0.5, 0.8, wear + cen * 0.15) * uWear * 4.0);
  }
  gl_FragColor = vec4(rr_toSrgb(c), a);
}
`;

const VERT = `
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

export class PatternBaker {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
    this.designMats = new Map();
    this.finishMats = new Map();
  }

  material(map, frag, id, uniforms) {
    let m = map.get(id);
    if (!m) {
      m = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, defines: { PATTERN: id }, uniforms, depthTest: false, depthWrite: false });
      map.set(id, m);
    }
    return m;
  }

  run(mat, rt) {
    const r = this.renderer;
    const prev = r.getRenderTarget();
    const prevAuto = r.autoClear;
    const prevXr = r.xr.enabled;
    r.xr.enabled = false;
    r.autoClear = false;
    this.quad.material = mat;
    r.setRenderTarget(rt);
    r.render(this.scene, this.camera);
    r.setRenderTarget(prev);
    r.autoClear = prevAuto;
    r.xr.enabled = prevXr;
  }

  bake(spec) {
    const [cw, ch] = spec.cells;
    const knotted = [1, 3, 4, 6].includes(spec.id);
    const design = new THREE.WebGLRenderTarget(cw, ch, {
      minFilter: knotted ? THREE.NearestFilter : THREE.LinearFilter,
      magFilter: knotted ? THREE.NearestFilter : THREE.LinearFilter,
      generateMipmaps: false,
      depthBuffer: false,
    });
    const dm = this.material(this.designMats, DESIGN_FRAG, spec.id, {
      uSize: { value: new THREE.Vector2() }, uCells: { value: new THREE.Vector2() }, uPal: { value: [] },
      uA: { value: new THREE.Vector4() }, uB: { value: new THREE.Vector4() }, uSeed: { value: new THREE.Vector2() },
    });
    dm.uniforms.uSize.value.set(spec.W, spec.L);
    dm.uniforms.uCells.value.set(cw, ch);
    dm.uniforms.uPal.value = spec.palette;
    dm.uniforms.uA.value.copy(spec.A);
    dm.uniforms.uB.value.copy(spec.B);
    dm.uniforms.uSeed.value.copy(spec.seedOff);
    this.run(dm, design);
    const [ow, oh] = spec.out;
    const out = new THREE.WebGLRenderTarget(ow, oh, {
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: true,
      depthBuffer: false,
      anisotropy: 8,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
    });
    const fm = this.material(this.finishMats, FINISH_FRAG, spec.id, {
      tDesign: { value: null }, uSize: { value: new THREE.Vector2() }, uCells: { value: new THREE.Vector2() }, uOut: { value: new THREE.Vector2() },
      uSeed: { value: new THREE.Vector2() }, uFuzz: { value: 1 }, uAbrash: { value: 0 }, uWear: { value: 0 },
      uPalF: { value: [] }, uB: { value: new THREE.Vector4() },
    });
    fm.uniforms.tDesign.value = design.texture;
    fm.uniforms.uSize.value.set(spec.W, spec.L);
    fm.uniforms.uCells.value.set(cw, ch);
    fm.uniforms.uOut.value.set(ow, oh);
    fm.uniforms.uSeed.value.copy(spec.seedOff);
    fm.uniforms.uFuzz.value = spec.fuzz;
    fm.uniforms.uAbrash.value = spec.abrash;
    fm.uniforms.uWear.value = spec.wear;
    fm.uniforms.uPalF.value = spec.palette;
    fm.uniforms.uB.value.copy(spec.B);
    this.run(fm, out);
    design.dispose();
    return out;
  }

  dispose() {
    for (const m of this.designMats.values()) m.dispose();
    for (const m of this.finishMats.values()) m.dispose();
    this.quad.geometry.dispose();
  }
}
