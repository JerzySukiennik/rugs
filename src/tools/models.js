// Rug Rush product and tool models: real-looking containers with a printed label atlas and stylized real tools, drawn through the part batcher.
import * as THREE from 'three';
import { PRODUCTS, TOOLS } from '../data/products.js';
import * as K from '../world/kit.js';
import { define, has, part, follower, track, setFill, setAtlas } from '../world/batch.js';

const AT = 2048, SW = 512, SH = 256, COLS = 4;
const SLOT_KRAFT = 28, SLOT_DECAL = 29, SLOT_TOOLS = 30, SLOT_WHITE = 31;
const PRODUCT_IDS = new Map(Object.entries(PRODUCTS).map(([k, v]) => [v, k]));
const TOOL_IDS = new Map(Object.entries(TOOLS).map(([k, v]) => [v, k]));
const blueprints = new Map();
let atlas = null;
let nextSlot = 0;
let DQ = 1;
let SUFFIX = '';
const LO_Q = 0.38;
const S = (n, min = 3) => Math.max(min, Math.round(n * DQ));

function def(key, kind, geo) {
  return define(key + SUFFIX, kind, geo);
}

const F = {
  rounded: (s) => `800 ${s}px "Arial Rounded MT Bold", "Varela Round", "Trebuchet MS", sans-serif`,
  geo: (s) => `700 ${s}px Futura, "Century Gothic", "Trebuchet MS", sans-serif`,
  geoL: (s) => `500 ${s}px Futura, "Century Gothic", "Trebuchet MS", sans-serif`,
  serif: (s) => `italic 700 ${s}px Didot, "Bodoni 72", Georgia, serif`,
  heavy: (s) => `900 ${s}px "Arial Black", "Helvetica Neue", Impact, sans-serif`,
  heavyI: (s) => `italic 900 ${s}px "Arial Black", "Helvetica Neue", Impact, sans-serif`,
  cond: (s) => `700 ${s}px "Avenir Next Condensed", "Arial Narrow", "Helvetica Neue", sans-serif`,
  clean: (s) => `600 ${s}px "Avenir Next", "Helvetica Neue", Helvetica, Arial, sans-serif`,
  play: (s) => `700 ${s}px "Chalkboard SE", "Comic Sans MS", "Marker Felt", sans-serif`,
  text: (s) => `500 ${s}px "Helvetica Neue", Helvetica, Arial, sans-serif`,
  bold: (s) => `700 ${s}px "Helvetica Neue", Helvetica, Arial, sans-serif`,
};

const LOOK = {
  lathera: { font: 'rounded', word: 'lathera', bg: '#ffffff', brand: '#1556b0', accent: '#3fa9f5', ink: '#123', motif: 'bubbles', hz: ['irritant'], claim: 'pH 9.5 · low foam', bottle: 'natural', cap: '#1556b0', band: '#1556b0' },
  woolmara: { font: 'serif', word: 'Woolmara', bg: '#f6f2e6', brand: '#2f6b3a', accent: '#6fbf73', ink: '#2a2a20', motif: 'wool', hz: [], claim: 'pH 7 · Wool safe', bottle: 'natural', cap: '#2f6b3a', band: '#6fbf73' },
  bubblon: { font: 'play', word: 'Bubblon', bg: '#ffd93b', brand: '#1b4fb8', accent: '#ffffff', ink: '#1b2a4a', motif: 'lemon', hz: ['irritant'], claim: 'MEGA FOAM!', bottle: 'tint', tint: '#fff1a8', cap: '#1b4fb8', band: '#1b4fb8' },
  degrex: { font: 'heavyI', word: 'DEGREX', bg: '#17181a', brand: '#ff7a1a', accent: '#ffb000', ink: '#e8e8e8', motif: 'stripes', hz: ['corrosive'], claim: 'HEAVY DUTY · pH 12.5', bottle: 'natural', cap: '#ff7a1a', band: '#ff7a1a' },
  klorin: { font: 'geo', word: 'Klorin', bg: '#ffffff', brand: '#0a3d91', accent: '#e2231a', ink: '#0a1a33', motif: 'wave', hz: ['corrosive', 'env'], claim: 'THICK BLEACH', bottle: 'opaque', body: '#f7f8f8', cap: '#0a3d91', band: '#e2231a' },
  oxilo: { font: 'geo', word: 'OXILO', bg: '#ffffff', brand: '#0098cf', accent: '#003b5c', ink: '#0d2433', motif: 'oxygen', hz: ['irritant'], claim: 'Active oxygen 3%', bottle: 'clear', head: '#ffffff', trig: '#0098cf', band: '#0098cf' },
  enzora: { font: 'rounded', word: 'enzora', bg: '#eaf8f0', brand: '#0f7a5c', accent: '#33b28a', ink: '#0d2b22', motif: 'paw', hz: [], claim: 'Bio enzymes · Pet urine', bottle: 'clear', head: '#0f7a5c', trig: '#ffffff', band: '#33b28a' },
  solvane: { font: 'cond', word: 'SOLVANE', bg: '#f5c400', brand: '#111111', accent: '#111111', ink: '#111111', motif: 'stripes', hz: ['flame', 'irritant'], claim: 'SOLVENT SPOTTER', bottle: 'opaque', body: '#f2f2ee', head: '#1b1b1b', trig: '#1b1b1b', band: '#111111' },
  tannex: { font: 'serif', word: 'Tannex', bg: '#3b2416', brand: '#f1d3a2', accent: '#c98b3a', ink: '#f6e7cf', motif: 'coffee', hz: ['irritant'], claim: 'Coffee · Tea · Wine', bottle: 'clear', head: '#ffffff', trig: '#7a4a24', band: '#c98b3a' },
  redaway: { font: 'heavy', word: 'RED AWAY', bg: '#121212', brand: '#ff2d55', accent: '#ffffff', ink: '#eeeeee', motif: 'drop', hz: ['corrosive', 'irritant'], claim: 'PRO · Dye stripper', bottle: 'clear', head: '#141414', trig: '#ff2d55', band: '#ff2d55' },
  fixol: { font: 'geo', word: 'FIXOL', bg: '#ffffff', brand: '#5b3fa8', accent: '#a98be0', ink: '#1f1638', motif: 'lock', hz: ['irritant'], claim: 'Dye-lock before washing', bottle: 'tint', tint: '#c9b6f2', head: '#ffffff', trig: '#5b3fa8', band: '#5b3fa8' },
  mycostop: { font: 'cond', word: 'MYCO·STOP', bg: '#103e2f', brand: '#9ed6a5', accent: '#ffffff', ink: '#e6f4ea', motif: 'spores', hz: ['irritant', 'env'], claim: 'Anti-mould', bottle: 'opaque', body: '#f3f5f2', head: '#103e2f', trig: '#9ed6a5', band: '#9ed6a5' },
  acidra: { font: 'rounded', word: 'acidra', bg: '#f4f1e1', brand: '#6b7a1f', accent: '#a7b83a', ink: '#2c3010', motif: 'leaf', hz: [], claim: 'Vinegar acid rinse', bottle: 'clear', head: '#ffffff', trig: '#a7b83a', band: '#a7b83a' },
  alcotol: { font: 'clean', word: 'ALCOTOL', bg: '#ffffff', brand: '#1d4f91', accent: '#4fa3e0', ink: '#0d1f38', motif: 'drop', hz: ['flame', 'irritant'], claim: 'Isopropyl alcohol 70%', bottle: 'clear', head: '#1d4f91', trig: '#ffffff', band: '#4fa3e0' },
  thinra: { font: 'cond', word: 'THINRA', bg: '#e30613', brand: '#ffffff', accent: '#ffd400', ink: '#ffffff', motif: 'flame', hz: ['flame', 'env', 'irritant'], claim: 'WHITE SPIRIT', bottle: 'natural', cap: '#1a1a1a', band: '#ffd400' },
  trax: { font: 'heavyI', word: 'TRAX', bg: '#062b4a', brand: '#7fd1ff', accent: '#ffffff', ink: '#e4f4ff', motif: 'tracks', hz: ['irritant'], claim: 'Traffic lane pre-spray', bottle: 'tint', tint: '#8fd6ff', head: '#141414', trig: '#141414', band: '#7fd1ff' },
  freshair: { font: 'rounded', word: 'fresh air', bg: '#fff0f6', brand: '#e0457b', accent: '#8bc34a', ink: '#40122a', motif: 'flower', hz: [], claim: 'Meadow breeze', bottle: 'clear', head: '#ffffff', trig: '#e0457b', band: '#e0457b' },
  frostik: { font: 'heavyI', word: 'FROSTIK', bg: '#0b5fa5', bg2: '#8fd3ff', brand: '#ffffff', accent: '#cfefff', ink: '#ffffff', motif: 'snow', hz: ['flame'], claim: '-50°C GUM FREEZE', can: '#c9ced3', cap: '#ffffff', band: '#ffffff' },
  foamo: { font: 'rounded', word: 'foamo', bg: '#1f8ad8', bg2: '#5fc0ff', brand: '#ffffff', accent: '#ffffff', ink: '#ffffff', motif: 'bubbles', hz: [], claim: 'Dry foam rug cleaner', can: '#c9ced3', cap: '#ffffff', band: '#ffffff' },
  absorbix: { font: 'cond', word: 'ABSORBIX', bg: '#cfae78', brand: '#3b2a17', accent: '#6b4a2b', ink: '#2a1d10', motif: 'earth', hz: [], claim: "Fuller's earth", cap: '#6b4a2b', band: '#6b4a2b' },
  sodalux: { font: 'heavy', word: 'SODALUX', bg: '#ff8c1a', bg2: '#ffc93c', brand: '#ffffff', accent: '#0a3d91', ink: '#3a1a00', motif: 'sun', hz: [], claim: 'Pure baking soda', cap: '#ffffff', band: '#0a3d91' },
  starka: { font: 'serif', word: 'Starka', bg: '#ffd23f', brand: '#1f5b2a', accent: '#1f5b2a', ink: '#2a2a10', motif: 'corn', hz: [], claim: 'Pure corn starch', cap: '#f2c200', band: '#1f5b2a' },
  oxipow: { font: 'geo', word: 'OXILO', bg: '#ffffff', brand: '#0098cf', accent: '#003b5c', ink: '#0d2433', motif: 'oxygen', hz: ['irritant', 'corrosive'], claim: 'Oxi powder', cap: '#0098cf', band: '#0098cf' },
  siccara: { font: 'serif', word: 'Siccara', bg: '#24303a', brand: '#e8c48a', accent: '#e8c48a', ink: '#e9edf0', motif: 'grain', hz: [], claim: 'Dry compound · PRO', cap: '#24303a', band: '#e8c48a' },
  meadow: { font: 'rounded', word: 'fresh air', bg: '#ffe3ee', brand: '#e0457b', accent: '#8bc34a', ink: '#40122a', motif: 'flower', hz: [], claim: 'Carpet fresh', cap: '#ff9cc0', band: '#e0457b' },
  foamer: { font: 'play', word: 'Bubblon', bg: '#151515', brand: '#ffd93b', accent: '#ffffff', ink: '#f1f1f1', motif: 'bubbles', hz: [], claim: 'PRO FOAMER 2 L', bottle: 'natural', cap: '#ffd93b', band: '#ffd93b' },
};

const DIRECTIONS = {
  gel: ['Dilute 1:20 in warm water.', 'Apply, agitate with a brush.', 'Rinse thoroughly. Dry fast.', 'Test on a hidden spot first.'],
  mist: ['Spray from 20 cm onto the stain.', 'Leave 2-5 minutes to work.', 'Blot, never rub. Rinse.', 'Test on a hidden spot first.'],
  powder: ['Sprinkle evenly over the pile.', 'Brush in gently.', 'Leave to work, then vacuum.', 'Keep the lid closed.'],
  foam: ['Shake well before use.', 'Spray an even foam layer.', 'Work in, let dry, vacuum.', 'Do not saturate the backing.'],
};

function hexMix(a, b, t) {
  const c = new THREE.Color(a).lerp(new THREE.Color(b), t);
  return '#' + c.getHexString();
}

function lum(hex) {
  const c = new THREE.Color(hex);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

function ensureAtlas() {
  if (atlas) return atlas;
  const c = document.createElement('canvas');
  c.width = c.height = AT;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, AT, AT);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  atlas = { canvas: c, g, tex };
  drawCommons(g);
  setAtlas(tex);
  return atlas;
}

function slotXY(i) {
  return [(i % COLS) * SW, Math.floor(i / COLS) * SH];
}

function slotRect(i, x0 = 0, x1 = 1, y0 = 0, y1 = 1) {
  const [sx, sy] = slotXY(i);
  const pad = 3;
  const u0 = (sx + pad + x0 * (SW - 2 * pad)) / AT;
  const u1 = (sx + pad + x1 * (SW - 2 * pad)) / AT;
  const vTop = 1 - (sy + pad + (1 - y1) * (SH - 2 * pad)) / AT;
  const vBot = 1 - (sy + pad + (1 - y0) * (SH - 2 * pad)) / AT;
  return [u0, vBot, u1 - u0, vTop - vBot];
}

function fit(g, text, font, size, maxW, min = 5) {
  let s = size;
  g.font = font(s);
  while (g.measureText(text).width > maxW && s > min) {
    s -= Math.max(0.5, s * 0.04);
    g.font = font(s);
  }
  return s;
}

function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function hazard(g, kind, cx, cy, s) {
  g.save();
  g.translate(cx, cy);
  g.beginPath();
  g.moveTo(0, -s);
  g.lineTo(s, 0);
  g.lineTo(0, s);
  g.lineTo(-s, 0);
  g.closePath();
  g.fillStyle = '#ffffff';
  g.fill();
  g.lineWidth = s * 0.14;
  g.strokeStyle = '#e2001a';
  g.stroke();
  g.fillStyle = '#111';
  g.strokeStyle = '#111';
  if (kind === 'irritant') {
    g.fillRect(-s * 0.08, -s * 0.5, s * 0.16, s * 0.6);
    g.beginPath();
    g.arc(0, s * 0.32, s * 0.09, 0, Math.PI * 2);
    g.fill();
  } else if (kind === 'flame') {
    g.beginPath();
    g.moveTo(0, -s * 0.55);
    g.bezierCurveTo(s * 0.35, -s * 0.2, s * 0.32, s * 0.25, 0, s * 0.3);
    g.bezierCurveTo(-s * 0.32, s * 0.25, -s * 0.3, -s * 0.05, -s * 0.12, -s * 0.15);
    g.bezierCurveTo(-s * 0.1, s * 0.02, 0, s * 0.02, 0.02 * s, -s * 0.12);
    g.closePath();
    g.fill();
    g.fillRect(-s * 0.38, s * 0.36, s * 0.76, s * 0.1);
  } else if (kind === 'corrosive') {
    for (const dx of [-0.24, 0.2]) {
      g.save();
      g.translate(dx * s, -s * 0.28);
      g.rotate(dx < 0 ? 0.5 : -0.5);
      g.fillRect(-s * 0.06, -s * 0.18, s * 0.12, s * 0.28);
      g.restore();
      g.beginPath();
      g.arc(dx * s * 0.8, s * 0.02, s * 0.05, 0, Math.PI * 2);
      g.fill();
    }
    g.fillRect(-s * 0.45, s * 0.2, s * 0.4, s * 0.12);
    g.beginPath();
    g.moveTo(s * 0.02, s * 0.2);
    g.lineTo(s * 0.45, s * 0.2);
    g.lineTo(s * 0.42, s * 0.34);
    g.lineTo(s * 0.06, s * 0.34);
    g.closePath();
    g.fill();
  } else if (kind === 'env') {
    g.lineWidth = s * 0.07;
    g.beginPath();
    g.moveTo(-s * 0.2, s * 0.35);
    g.lineTo(-s * 0.2, -s * 0.45);
    g.moveTo(-s * 0.2, -s * 0.15);
    g.lineTo(-s * 0.42, -s * 0.35);
    g.moveTo(-s * 0.2, -s * 0.25);
    g.lineTo(0, -s * 0.42);
    g.stroke();
    g.beginPath();
    g.ellipse(s * 0.15, s * 0.22, s * 0.17, s * 0.08, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(s * 0.3, s * 0.22);
    g.lineTo(s * 0.42, s * 0.12);
    g.lineTo(s * 0.42, s * 0.32);
    g.fill();
  }
  g.restore();
}

function ean(g, x, y, w, h, seed, ink = '#111') {
  const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
  const R = L.map((c) => c.split('').map((b) => (b === '0' ? '1' : '0')).join(''));
  const G = R.map((c) => c.split('').reverse().join(''));
  const PAR = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];
  const d = [5, 9, 0];
  for (let i = 0; i < 9; i++) d.push(Math.floor(K.hash(seed, i, 7) * 10));
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += d[i] * (i % 2 ? 3 : 1);
  d.push((10 - (sum % 10)) % 10);
  let bits = '101';
  const par = PAR[d[0]];
  for (let i = 1; i <= 6; i++) bits += (par[i - 1] === 'L' ? L : G)[d[i]];
  bits += '01010';
  for (let i = 7; i <= 12; i++) bits += R[d[i]];
  bits += '101';
  g.fillStyle = '#ffffff';
  g.fillRect(x - w * 0.06, y - h * 0.06, w * 1.12, h * 1.3);
  const bw = w / bits.length;
  g.fillStyle = ink;
  for (let i = 0; i < bits.length; i++) {
    if (bits[i] !== '1') continue;
    const guard = i < 3 || (i >= 45 && i < 50) || i >= 92;
    g.fillRect(x + i * bw, y, bw + 0.15, h * (guard ? 1.0 : 0.86));
  }
  g.font = F.text(Math.max(5, h * 0.17));
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  g.fillText(`${d[0]} ${d.slice(1, 7).join('')} ${d.slice(7).join('')}`, x + w / 2, y + h * 1.17);
}

function recycle(g, cx, cy, s, code, n, ink) {
  g.save();
  g.translate(cx, cy);
  g.strokeStyle = ink;
  g.fillStyle = ink;
  g.lineWidth = s * 0.1;
  g.beginPath();
  for (let i = 0; i < 3; i++) {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / 3;
    const b = a + (Math.PI * 2) / 3;
    g.moveTo(Math.cos(a) * s * 0.55, Math.sin(a) * s * 0.55);
    g.lineTo(Math.cos(b) * s * 0.55, Math.sin(b) * s * 0.55);
  }
  g.stroke();
  g.font = F.bold(s * 0.42);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(n), 0, s * 0.08);
  g.font = F.bold(s * 0.3);
  g.fillText(code, 0, s * 0.85);
  g.restore();
}

function motif(g, kind, x, y, w, h, L) {
  const cx = x + w / 2, cy = y + h / 2, s = Math.min(w, h);
  g.save();
  const A = L.accent, B = L.brand;
  if (kind === 'bubbles' || kind === 'oxygen') {
    const n = 9;
    for (let i = 0; i < n; i++) {
      const r = s * (0.08 + K.hash(i, 3, kind.length) * 0.14);
      const bx = x + K.hash(i, 1, 9) * w, by = y + K.hash(i, 2, 9) * h;
      g.beginPath();
      g.arc(bx, by, r, 0, Math.PI * 2);
      g.fillStyle = hexMix(A, '#ffffff', 0.35) + '99';
      g.fill();
      g.lineWidth = Math.max(1, r * 0.12);
      g.strokeStyle = A;
      g.stroke();
      g.beginPath();
      g.arc(bx - r * 0.35, by - r * 0.35, r * 0.22, 0, Math.PI * 2);
      g.fillStyle = '#ffffffcc';
      g.fill();
    }
    if (kind === 'oxygen') {
      g.font = F.geo(s * 0.34);
      g.fillStyle = B;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('O', cx - s * 0.05, cy);
      g.font = F.geo(s * 0.16);
      g.fillText('2', cx + s * 0.14, cy + s * 0.1);
    }
  } else if (kind === 'wave') {
    for (let k = 0; k < 3; k++) {
      g.beginPath();
      for (let i = 0; i <= 40; i++) {
        const px = x + (w * i) / 40;
        const py = y + h * (0.35 + k * 0.18) + Math.sin(i / 40 * Math.PI * 3 + k) * h * 0.08;
        if (i === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.lineWidth = h * 0.07;
      g.strokeStyle = k === 1 ? A : B;
      g.stroke();
    }
  } else if (kind === 'stripes') {
    g.beginPath();
    g.rect(x, y + h * 0.3, w, h * 0.4);
    g.clip();
    for (let i = -6; i < 20; i++) {
      g.beginPath();
      const sx = x + i * h * 0.3;
      g.moveTo(sx, y + h * 0.7);
      g.lineTo(sx + h * 0.15, y + h * 0.7);
      g.lineTo(sx + h * 0.55, y + h * 0.3);
      g.lineTo(sx + h * 0.4, y + h * 0.3);
      g.closePath();
      g.fillStyle = L.bg === '#f5c400' ? '#111' : A;
      g.fill();
    }
  } else if (kind === 'paw') {
    g.fillStyle = A;
    g.beginPath();
    g.ellipse(cx, cy + s * 0.12, s * 0.2, s * 0.16, 0, 0, Math.PI * 2);
    g.fill();
    for (const [dx, dy] of [[-0.24, -0.08], [-0.09, -0.24], [0.09, -0.24], [0.24, -0.08]]) {
      g.beginPath();
      g.ellipse(cx + dx * s, cy + dy * s, s * 0.075, s * 0.095, dx * 0.6, 0, Math.PI * 2);
      g.fill();
    }
  } else if (kind === 'coffee') {
    for (const [dx, dy, r] of [[-0.18, 0, 0.3], [0.2, 0.05, -0.4]]) {
      g.save();
      g.translate(cx + dx * s, cy + dy * s);
      g.rotate(r);
      g.beginPath();
      g.ellipse(0, 0, s * 0.15, s * 0.22, 0, 0, Math.PI * 2);
      g.fillStyle = A;
      g.fill();
      g.beginPath();
      g.moveTo(0, -s * 0.2);
      g.bezierCurveTo(s * 0.08, -s * 0.06, -s * 0.08, s * 0.06, 0, s * 0.2);
      g.lineWidth = s * 0.035;
      g.strokeStyle = L.bg;
      g.stroke();
      g.restore();
    }
  } else if (kind === 'drop') {
    g.beginPath();
    g.moveTo(cx, cy - s * 0.38);
    g.bezierCurveTo(cx + s * 0.32, cy, cx + s * 0.26, cy + s * 0.36, cx, cy + s * 0.36);
    g.bezierCurveTo(cx - s * 0.26, cy + s * 0.36, cx - s * 0.32, cy, cx, cy - s * 0.38);
    g.fillStyle = B;
    g.fill();
    g.beginPath();
    g.ellipse(cx - s * 0.08, cy + s * 0.1, s * 0.05, s * 0.1, 0.3, 0, Math.PI * 2);
    g.fillStyle = '#ffffff99';
    g.fill();
  } else if (kind === 'lock') {
    g.beginPath();
    g.moveTo(cx, cy - s * 0.38);
    g.lineTo(cx + s * 0.3, cy - s * 0.26);
    g.lineTo(cx + s * 0.26, cy + s * 0.12);
    g.quadraticCurveTo(cx + s * 0.15, cy + s * 0.32, cx, cy + s * 0.4);
    g.quadraticCurveTo(cx - s * 0.15, cy + s * 0.32, cx - s * 0.26, cy + s * 0.12);
    g.lineTo(cx - s * 0.3, cy - s * 0.26);
    g.closePath();
    g.fillStyle = A;
    g.fill();
    g.lineWidth = s * 0.07;
    g.strokeStyle = '#ffffff';
    g.beginPath();
    g.moveTo(cx - s * 0.12, cy);
    g.lineTo(cx - s * 0.02, cy + s * 0.1);
    g.lineTo(cx + s * 0.14, cy - s * 0.1);
    g.stroke();
  } else if (kind === 'spores') {
    for (let i = 0; i < 14; i++) {
      const r = s * (0.04 + K.hash(i, 5) * 0.08);
      g.beginPath();
      g.arc(x + K.hash(i, 6) * w, y + K.hash(i, 7) * h, r, 0, Math.PI * 2);
      g.strokeStyle = A;
      g.lineWidth = Math.max(1, r * 0.3);
      g.stroke();
    }
    g.beginPath();
    g.moveTo(x + w * 0.15, y + h * 0.85);
    g.lineTo(x + w * 0.85, y + h * 0.15);
    g.lineWidth = s * 0.08;
    g.strokeStyle = '#e2231a';
    g.stroke();
  } else if (kind === 'leaf') {
    g.save();
    g.translate(cx, cy);
    g.rotate(-0.5);
    g.beginPath();
    g.moveTo(0, -s * 0.38);
    g.quadraticCurveTo(s * 0.3, 0, 0, s * 0.38);
    g.quadraticCurveTo(-s * 0.3, 0, 0, -s * 0.38);
    g.fillStyle = A;
    g.fill();
    g.beginPath();
    g.moveTo(0, -s * 0.34);
    g.lineTo(0, s * 0.34);
    g.strokeStyle = L.bg;
    g.lineWidth = s * 0.025;
    g.stroke();
    g.restore();
  } else if (kind === 'tracks') {
    g.fillStyle = A;
    for (let row = 0; row < 2; row++) for (let i = 0; i < 7; i++) {
      const px = x + w * (0.08 + i * 0.13), py = y + h * (0.3 + row * 0.28);
      g.beginPath();
      g.moveTo(px, py);
      g.lineTo(px + w * 0.07, py + h * 0.1);
      g.lineTo(px, py + h * 0.2);
      g.lineTo(px + w * 0.035, py + h * 0.1);
      g.closePath();
      g.fill();
    }
  } else if (kind === 'flower') {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      g.beginPath();
      g.ellipse(cx + Math.cos(a) * s * 0.17, cy + Math.sin(a) * s * 0.17, s * 0.15, s * 0.09, a, 0, Math.PI * 2);
      g.fillStyle = hexMix(B, '#ffffff', 0.35);
      g.fill();
    }
    g.beginPath();
    g.arc(cx, cy, s * 0.09, 0, Math.PI * 2);
    g.fillStyle = '#ffd23f';
    g.fill();
    g.beginPath();
    g.ellipse(cx + s * 0.3, cy + s * 0.28, s * 0.12, s * 0.05, -0.6, 0, Math.PI * 2);
    g.fillStyle = A;
    g.fill();
  } else if (kind === 'snow') {
    g.strokeStyle = '#ffffff';
    g.lineWidth = s * 0.05;
    g.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const ex = Math.cos(a), ey = Math.sin(a);
      g.beginPath();
      g.moveTo(cx, cy);
      g.lineTo(cx + ex * s * 0.38, cy + ey * s * 0.38);
      for (const t of [0.22, 0.32]) {
        const bx = cx + ex * s * t, by = cy + ey * s * t;
        g.moveTo(bx, by);
        g.lineTo(bx + Math.cos(a + 0.7) * s * 0.09, by + Math.sin(a + 0.7) * s * 0.09);
        g.moveTo(bx, by);
        g.lineTo(bx + Math.cos(a - 0.7) * s * 0.09, by + Math.sin(a - 0.7) * s * 0.09);
      }
      g.stroke();
    }
  } else if (kind === 'earth') {
    for (let k = 0; k < 4; k++) {
      g.beginPath();
      g.moveTo(x, y + h);
      for (let i = 0; i <= 30; i++) g.lineTo(x + (w * i) / 30, y + h * (0.3 + k * 0.17) + Math.sin(i * 0.5 + k * 2) * h * 0.05);
      g.lineTo(x + w, y + h);
      g.closePath();
      g.fillStyle = hexMix(L.bg, B, 0.15 + k * 0.17);
      g.fill();
    }
  } else if (kind === 'sun') {
    g.fillStyle = L.bg2 ?? '#ffc93c';
    g.beginPath();
    g.arc(cx, cy, s * 0.2, 0, Math.PI * 2);
    g.fill();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      g.beginPath();
      g.moveTo(cx + Math.cos(a - 0.12) * s * 0.26, cy + Math.sin(a - 0.12) * s * 0.26);
      g.lineTo(cx + Math.cos(a) * s * 0.42, cy + Math.sin(a) * s * 0.42);
      g.lineTo(cx + Math.cos(a + 0.12) * s * 0.26, cy + Math.sin(a + 0.12) * s * 0.26);
      g.fill();
    }
  } else if (kind === 'corn') {
    g.save();
    g.translate(cx, cy);
    g.rotate(0.5);
    g.beginPath();
    g.ellipse(0, 0, s * 0.13, s * 0.34, 0, 0, Math.PI * 2);
    g.fillStyle = '#f7b500';
    g.fill();
    g.fillStyle = '#ffd84a';
    for (let i = -5; i <= 5; i++) for (let j = -1; j <= 1; j++) {
      g.beginPath();
      g.arc(j * s * 0.07, i * s * 0.055, s * 0.025, 0, Math.PI * 2);
      g.fill();
    }
    g.beginPath();
    g.moveTo(0, s * 0.36);
    g.quadraticCurveTo(-s * 0.3, s * 0.1, -s * 0.12, -s * 0.2);
    g.quadraticCurveTo(-s * 0.12, s * 0.15, 0, s * 0.36);
    g.fillStyle = '#3f8f3a';
    g.fill();
    g.restore();
  } else if (kind === 'grain') {
    for (let i = 0; i < 40; i++) {
      g.beginPath();
      g.arc(x + K.hash(i, 11) * w, y + h * 0.4 + K.hash(i, 12) * h * 0.55, s * (0.015 + K.hash(i, 13) * 0.03), 0, Math.PI * 2);
      g.fillStyle = K.hash(i, 14) > 0.5 ? A : hexMix(A, L.bg, 0.4);
      g.fill();
    }
  } else if (kind === 'wool') {
    g.strokeStyle = A;
    g.lineWidth = s * 0.035;
    for (let i = 0; i < 5; i++) {
      const px = x + w * (0.15 + i * 0.17), py = cy + Math.sin(i * 1.7) * h * 0.12;
      g.beginPath();
      for (let k = 0; k < 60; k++) {
        const a = k * 0.32, r = s * 0.012 * k * 0.18;
        const qx = px + Math.cos(a) * r, qy = py + Math.sin(a) * r;
        if (k === 0) g.moveTo(qx, qy);
        else g.lineTo(qx, qy);
      }
      g.stroke();
    }
  } else if (kind === 'lemon') {
    g.beginPath();
    g.arc(cx, cy, s * 0.32, 0, Math.PI * 2);
    g.fillStyle = '#ffe14d';
    g.fill();
    g.lineWidth = s * 0.05;
    g.strokeStyle = '#f2b705';
    g.stroke();
    g.fillStyle = '#fff6b0';
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      g.beginPath();
      g.moveTo(cx, cy);
      g.arc(cx, cy, s * 0.25, a + 0.06, a + Math.PI / 4 - 0.06);
      g.closePath();
      g.fill();
    }
    motif(g, 'bubbles', x, y, w * 0.4, h * 0.5, { ...L, accent: '#ffffff', brand: L.brand });
  } else if (kind === 'flame') {
    g.beginPath();
    g.moveTo(cx, cy - s * 0.4);
    g.bezierCurveTo(cx + s * 0.32, cy - s * 0.05, cx + s * 0.3, cy + s * 0.38, cx, cy + s * 0.38);
    g.bezierCurveTo(cx - s * 0.3, cy + s * 0.38, cx - s * 0.3, cy, cx - s * 0.1, cy - s * 0.12);
    g.bezierCurveTo(cx - s * 0.08, cy + s * 0.05, cx + s * 0.05, cy, cx, cy - s * 0.4);
    g.fillStyle = A;
    g.fill();
  }
  g.restore();
}

function volumeText(p) {
  if (p.form === 'powder') return p.capacity >= 1 ? `${+p.capacity.toFixed(1)} kg` : `${Math.round(p.capacity * 1000)} g`;
  return p.capacity >= 1 ? `${+p.capacity.toFixed(1)} L` : `${Math.round(p.capacity * 1000)} ml`;
}

function frontPanel(g, W, H, p, L) {
  const wide = H < W * 0.8;
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  const mx = W * 0.07;
  if (wide) {
    const bs = fit(g, L.word, F[L.font], H * 0.42, W * 0.6);
    g.fillStyle = L.brand;
    g.textAlign = 'left';
    g.fillText(L.word, mx, H * 0.08 + bs * 0.95);
    motif(g, L.motif, W * 0.68, H * 0.06, W * 0.3, H * 0.6, L);
    g.fillStyle = L.ink;
    fit(g, p.name, F.bold, H * 0.13, W * 0.62);
    g.fillText(p.name, mx, H * 0.72);
    g.fillStyle = L.accent;
    fit(g, L.claim, F.clean, H * 0.1, W * 0.55);
    g.fillText(L.claim, mx, H * 0.88);
    g.textAlign = 'right';
    g.fillStyle = L.ink;
    g.font = F.bold(H * 0.12);
    g.fillText(volumeText(p) + ' ℮', W - mx * 0.6, H * 0.92);
    return;
  }
  g.fillStyle = L.band;
  g.fillRect(0, H * 0.03, W, H * 0.018);
  const bs = fit(g, L.word, F[L.font], W * 0.3, W * 0.84);
  g.fillStyle = L.brand;
  g.fillText(L.word, W / 2, H * 0.08 + bs * 0.85);
  const my = H * 0.1 + bs, mh = H * 0.62 - my;
  if (mh > 10) motif(g, L.motif, W * 0.2, my, W * 0.6, mh, L);
  g.fillStyle = L.ink;
  const words = p.name.split(' ');
  let line = '', lines = [];
  g.font = F.bold(W * 0.085);
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (g.measureText(t).width > W * 0.84 && line) {
      lines.push(line);
      line = w;
    } else line = t;
  }
  lines.push(line);
  lines = lines.slice(0, 3);
  const ls = W * 0.085, ly = H * 0.68;
  lines.forEach((t, i) => {
    fit(g, t, F.bold, ls, W * 0.86);
    g.fillText(t, W / 2, ly + i * ls * 1.08);
  });
  const cy = ly + lines.length * ls * 1.08 + ls * 0.25;
  const cs = fit(g, L.claim, F.clean, W * 0.06, W * 0.72);
  const cw = g.measureText(L.claim).width + cs * 1.4;
  rr(g, W / 2 - cw / 2, cy - cs * 0.95, cw, cs * 1.45, cs * 0.7);
  g.fillStyle = L.band;
  g.fill();
  g.fillStyle = lum(L.band) > 0.6 ? '#111' : '#fff';
  g.fillText(L.claim, W / 2, cy + cs * 0.12);
  g.textAlign = 'right';
  g.fillStyle = L.ink;
  g.font = F.bold(W * 0.07);
  g.fillText(volumeText(p) + ' ℮', W - mx * 0.7, H - H * 0.035);
}

function backPanel(g, W, H, p, L, id, recycleCode) {
  const wide = H < W * 0.8;
  const ink = L.ink;
  const mx = W * 0.07;
  g.textBaseline = 'alphabetic';
  g.textAlign = 'left';
  const ts = wide ? H * 0.11 : W * 0.055;
  g.fillStyle = L.brand;
  fit(g, L.word, F[L.font], ts * 1.3, W * 0.4);
  g.fillText(L.word, mx, (wide ? H * 0.06 : H * 0.03) + ts * 1.15);
  g.fillStyle = ink;
  fit(g, p.name, F.bold, ts * 0.85, W - mx * 2 - (wide ? W * 0.35 : W * 0.4));
  g.textAlign = 'right';
  g.fillText(p.name, W - mx, (wide ? H * 0.06 : H * 0.03) + ts * 1.1);
  g.textAlign = 'left';
  const lines = [...DIRECTIONS[p.form] ?? DIRECTIONS.gel, p.blurb];
  const fs = wide ? H * 0.062 : W * 0.04;
  let y = (wide ? H * 0.06 : H * 0.03) + ts * 2.2;
  const colW = wide ? W * 0.5 : W - mx * 2;
  g.font = F.bold(fs);
  g.fillText('DIRECTIONS', mx, y);
  y += fs * 1.25;
  g.font = F.text(fs * 0.92);
  for (const t of lines) {
    const words = t.split(' ');
    let line = '';
    for (const w of words) {
      const tt = line ? line + ' ' + w : w;
      if (g.measureText(tt).width > colW && line) {
        g.fillText(line, mx, y);
        y += fs * 1.1;
        line = w;
      } else line = tt;
    }
    g.fillText(line, mx, y);
    y += fs * 1.1;
    if (!wide && y > H * 0.58) break;
    if (wide && y > H * 0.9) break;
  }
  g.font = F.text(fs * 0.8);
  if (!wide) {
    g.fillText('Keep out of reach of children. Do not mix', mx, y + fs * 0.3);
    g.fillText('with other products. Store upright, cool.', mx, y + fs * 1.2);
  }
  const hz = L.hz ?? [];
  let hy = wide ? H * 0.32 : H * 0.7;
  let hx = wide ? W * 0.6 : mx;
  const hs = wide ? H * 0.14 : W * 0.07;
  if (hz.length) {
    hz.forEach((k, i) => hazard(g, k, hx + hs + i * hs * 2.2, hy + hs, hs));
    g.fillStyle = ink;
    g.font = F.heavy(hs * 0.7);
    g.textAlign = 'left';
    g.fillText(hz.includes('corrosive') || hz.includes('flame') ? 'DANGER' : 'WARNING', hx + hz.length * hs * 2.2 + hs * 0.2, hy + hs * 1.25);
  }
  const by = wide ? H * 0.62 : H * 0.8;
  const bw = wide ? W * 0.22 : W * 0.44, bh = wide ? H * 0.22 : H * 0.11;
  const bx = wide ? W * 0.56 : mx;
  ean(g, bx, by, bw, bh, Object.keys(PRODUCTS).indexOf(id) + 11, '#111');
  recycle(g, wide ? W * 0.88 : W * 0.66, by + bh * 0.45, wide ? H * 0.1 : W * 0.06, recycleCode[0], recycleCode[1], ink);
  g.fillStyle = ink;
  g.textAlign = 'right';
  g.font = F.text(wide ? H * 0.05 : W * 0.032);
  g.fillText('Gzowo Industries', W - mx * 0.6, by + bh * 1.05);
  g.fillText('Warszawa · PL', W - mx * 0.6, by + bh * 1.05 + (wide ? H * 0.06 : W * 0.038));
  g.font = F.bold(wide ? H * 0.07 : W * 0.045);
  g.fillText(volumeText(p) + ' ℮', W - mx * 0.6, H - H * 0.03);
}

function drawProductLabel(slot, id, p, L, bp) {
  const [backAspect, frontAspect] = bp.aspect;
  const recycleCode = bp.recycle;
  const vis = bp.wrap ?? 1;
  const { g } = ensureAtlas();
  const [sx, sy] = slotXY(slot);
  g.save();
  g.beginPath();
  g.rect(sx, sy, SW, SH);
  g.clip();
  if (L.bg2) {
    const gr = g.createLinearGradient(0, sy, 0, sy + SH);
    gr.addColorStop(0, L.bg);
    gr.addColorStop(1, L.bg2);
    g.fillStyle = gr;
  } else g.fillStyle = L.bg;
  g.fillRect(sx, sy, SW, SH);
  g.fillStyle = L.band;
  g.fillRect(sx, sy + SH - 7, SW, 7);
  g.fillRect(sx, sy, SW, 4);
  for (const [i, asp] of [[0, backAspect], [1, frontAspect]]) {
    const VW = 256, VH = (256 * asp) / vis;
    g.save();
    g.translate(sx + i * 256 + (256 * (1 - vis)) / 2, sy);
    g.scale(vis, 256 / VH);
    if (i === 0) backPanel(g, VW, VH, p, L, id, recycleCode);
    else frontPanel(g, VW, VH, p, L);
    g.restore();
  }
  g.restore();
  atlas.tex.needsUpdate = true;
}

function drawCommons(g) {
  const [kx, ky] = slotXY(SLOT_KRAFT);
  g.fillStyle = '#a67b4b';
  g.fillRect(kx, ky, SW, SH);
  for (let i = 0; i < 2600; i++) {
    const x = kx + K.hash(i, 1, 1) * SW, y = ky + K.hash(i, 2, 1) * SH;
    const l = 4 + K.hash(i, 3, 1) * 26;
    g.strokeStyle = K.hash(i, 4, 1) > 0.5 ? 'rgba(80,52,25,0.22)' : 'rgba(210,170,120,0.22)';
    g.lineWidth = 0.7 + K.hash(i, 5, 1);
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + l, y + (K.hash(i, 6, 1) - 0.5) * 3);
    g.stroke();
  }
  for (let i = 0; i < 9; i++) {
    g.strokeStyle = 'rgba(70,45,20,0.12)';
    g.lineWidth = 3;
    g.beginPath();
    const y = ky + K.hash(i, 9, 2) * SH;
    g.moveTo(kx, y);
    g.bezierCurveTo(kx + SW * 0.3, y + 20, kx + SW * 0.6, y - 25, kx + SW, y + 5);
    g.stroke();
  }
  const [dx, dy] = slotXY(SLOT_DECAL);
  g.fillStyle = '#1b1d20';
  g.fillRect(dx, dy, 256, 256);
  g.save();
  g.translate(dx + 128, dy + 128);
  g.strokeStyle = '#4a4f55';
  for (let r = 16; r < 124; r += 9) {
    g.lineWidth = 3.2;
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.stroke();
  }
  g.lineWidth = 5;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(Math.cos(a) * 124, Math.sin(a) * 124);
    g.stroke();
  }
  g.fillStyle = '#2a2d31';
  g.beginPath();
  g.arc(0, 0, 22, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#d8dadc';
  g.font = F.heavy(10);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('GZOWO', 0, -3);
  g.fillText('AIR', 0, 8);
  g.restore();
  g.fillStyle = '#f4f4f2';
  g.fillRect(dx + 256, dy, 128, 128);
  g.fillStyle = '#2a2a2a';
  for (let r = 0; r < 4; r++) {
    const n = r === 0 ? 1 : r * 6;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      g.beginPath();
      g.arc(dx + 320 + Math.cos(a) * r * 15, dy + 64 + Math.sin(a) * r * 15, 4.2, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.fillStyle = '#16181a';
  g.fillRect(dx + 384, dy, 128, 128);
  g.fillStyle = '#34383d';
  for (let i = 0; i < 9; i++) g.fillRect(dx + 384, dy + 6 + i * 13.5, 128, 6);
  g.fillStyle = '#c0c5ca';
  g.fillRect(dx + 256, dy + 128, 256, 128);
  g.fillStyle = '#7c8186';
  for (let i = 0; i < 70; i++) {
    g.beginPath();
    g.arc(dx + 268 + (i % 14) * 17.5, dy + 140 + Math.floor(i / 14) * 22, 3.2, 0, Math.PI * 2);
    g.fill();
  }
  const [tx, ty] = slotXY(SLOT_TOOLS);
  g.fillStyle = '#c8352b';
  g.fillRect(tx, ty, 256, 128);
  g.fillStyle = '#ffffff';
  g.font = F.heavyI(46);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('TURBO', tx + 128, ty + 52);
  g.font = F.bold(20);
  g.fillText('GZOWO · 1800 W', tx + 128, ty + 98);
  g.fillStyle = '#1c5fb4';
  g.fillRect(tx + 256, ty, 256, 128);
  g.fillStyle = '#ffffff';
  g.font = F.heavy(38);
  g.fillText('AQUA·VAC', tx + 384, ty + 52);
  g.font = F.bold(19);
  g.fillText('WET & DRY · 15 L', tx + 384, ty + 98);
  g.fillStyle = '#2e2f33';
  g.fillRect(tx, ty + 128, 256, 128);
  g.fillStyle = '#d4d7da';
  g.font = F.heavy(30);
  g.fillText('UV-365', tx + 128, ty + 180);
  g.font = F.bold(16);
  g.fillText('GZOWO LIGHT', tx + 128, ty + 218);
  g.fillStyle = '#ffffff';
  g.fillRect(tx + 256, ty + 128, 256, 128);
  g.fillStyle = '#1c5fb4';
  g.font = F.heavyI(40);
  g.fillText('STEAMO', tx + 384, ty + 180);
  g.fillStyle = '#e94f37';
  g.fillRect(tx + 300, ty + 210, 168, 8);
  const [wx, wy] = slotXY(SLOT_WHITE);
  g.fillStyle = '#ffffff';
  g.fillRect(wx, wy, SW, SH);
}

function decalRect(x, y, w, h) {
  const [sx, sy] = slotXY(SLOT_DECAL);
  const pad = 2;
  return [(sx + x + pad) / AT, 1 - (sy + y + h - pad) / AT, (w - pad * 2) / AT, (h - pad * 2) / AT];
}

function toolRect(i) {
  const [sx, sy] = slotXY(SLOT_TOOLS);
  const x = (i % 2) * 256, y = Math.floor(i / 2) * 128;
  const pad = 3;
  return [(sx + x + pad) / AT, 1 - (sy + y + 128 - pad) / AT, (256 - pad * 2) / AT, (128 - pad * 2) / AT];
}

function kraftRect() {
  const [sx, sy] = slotXY(SLOT_KRAFT);
  return [(sx + 4) / AT, 1 - (sy + SH - 4) / AT, (SW - 8) / AT, (SH - 8) / AT];
}

const SHELL = {
  clear: { color: '#e6f1f4', a: 0.13, r: 0.05 },
  natural: { color: '#f3f2ea', a: 0.5, r: 0.38 },
  tint: { color: '#ffffff', a: 0.3, r: 0.08 },
};

function shellPart(key, geo, L, opaqueColor) {
  if (L.bottle === 'opaque') return def(key, 'opaque', K.paint(geo, opaqueColor ?? L.body ?? '#f4f4f2', { r: 0.36 }));
  const s = SHELL[L.bottle] ?? SHELL.clear;
  const col = L.bottle === 'tint' ? L.tint : s.color;
  return def(key, 'clear', K.paint(geo, col, { r: s.r, a: s.a }));
}

function liquidPart(key, geo, p, L) {
  const c = L.liquid ?? p.color;
  const clearish = lum(c) > 0.8;
  const col = clearish ? hexMix(c, '#cfe6ee', 0.3) : c;
  return def(key, 'liquid', K.paint(geo, col, { r: 0.06, a: clearish ? 0.32 : 0.82, liquid: true }));
}

function capRings(r, h, y) {
  return K.ribbedRing(r, h, Math.max(10, Math.round(r * 1600 * DQ)), 0.00065, y);
}

function shiftAll(list, dy) {
  for (const g of list) g.translate(0, dy, 0);
}

function bpTrigger(id, p, L, slot) {
  const k = p.capacity / 0.5;
  const sh = Math.pow(k, 0.62), sw = Math.pow(k, 0.2);
  const hw = 0.0405 * sw, hd = 0.0278 * sw, cr = 0.02 * sw;
  const yb = 0.135 * sh;
  const rings = [
    { y: 0, hw: hw - 0.0045, hd: hd - 0.0045, cr: cr - 0.0045 },
    { y: 0.0022, hw: hw - 0.0012, hd: hd - 0.0012, cr: cr - 0.0012 },
    { y: 0.0065, hw, hd, cr },
    { y: yb * 0.6, hw: hw * 0.99, hd: hd * 0.99, cr: cr * 0.99 },
    { y: yb, hw: hw * 0.975, hd: hd * 0.98, cr },
    { y: yb + 0.012, hw: hw * 0.93, hd: hd * 0.95, cr: cr * 0.97 },
    { y: yb + 0.024, hw: hw * 0.74, hd: hd * 0.83, cr: cr * 0.85 },
    { y: yb + 0.034, hw: 0.0235, hd: 0.0205, cr: 0.0195 },
    { y: yb + 0.041, hw: 0.0158, hd: 0.0158, cr: 0.0158 },
    { y: yb + 0.045, hw: 0.0148, hd: 0.0148, cr: 0.0148 },
    { y: yb + 0.058, hw: 0.0148, hd: 0.0148, cr: 0.0148 },
  ];
  const yn = yb + 0.058, yc = yn + 0.006, H = yc + 0.044;
  const dy = -H / 2;
  const shell = K.loft(rings, { segs: S(48) });
  const liq = K.loft([
    { y: 0.0035, hw: hw - 0.0028, hd: hd - 0.0028, cr: cr - 0.0028 },
    { y: 0.0075, hw: hw - 0.0013, hd: hd - 0.0013, cr: cr - 0.0013 },
    { y: yb, hw: hw * 0.975 - 0.0013, hd: hd * 0.98 - 0.0013, cr: cr - 0.0013 },
    { y: yb + 0.012, hw: hw * 0.93 - 0.0013, hd: hd * 0.95 - 0.0013, cr: cr * 0.97 - 0.0013 },
    { y: yb + 0.024, hw: hw * 0.74 - 0.0013, hd: hd * 0.83 - 0.0013, cr: cr * 0.85 - 0.0013 },
    { y: yb + 0.034, hw: 0.022, hd: 0.019, cr: 0.0182 },
  ], { segs: S(40) });
  const ly0 = 0.016, ly1 = yb - 0.008;
  const phi = 1.22;
  const backB = K.band(rings, ly0, ly1, 0.0004, { theta0: -phi, theta1: phi, segs: S(40) });
  const frontB = K.band(rings, ly0, ly1, 0.0004, { theta0: Math.PI - phi, theta1: Math.PI + phi, segs: S(40) });
  const mid = K.ringAt(rings, (ly0 + ly1) / 2);
  const aspect = (ly1 - ly0) / K.arcLength(mid, -phi, phi);
  const tubeG = K.tube([[0, yn, 0.002], [0, yb * 0.5, 0.004], [0, 0.012, -0.004], [0.0, 0.0045, -0.016]], 0.0021, { segs: S(24), radial: S(6, 4) });
  const collar = capRings(0.0168, 0.022, yn - 0.005);
  const topDisk = K.cyl(0.0158, 0.0168, 0.002, S(28), { y: yc - 0.001 });
  const shroud = K.extrude([
    [-0.0145, 0.002],
    [-0.0175, 0.016, -0.0165, 0.028],
    [-0.0145, 0.040, -0.002, 0.040],
    [0.030, 0.037],
    [0.046, 0.0355, 0.052, 0.031],
    [0.053, 0.019],
    [0.050, 0.0135, 0.040, 0.0135],
    [0.022, 0.012, 0.0135, 0.002],
  ], 0.03, { bevel: 0.004, bevelSegs: S(3, 1), curveSegs: S(10, 2) });
  shroud.rotateY(Math.PI / 2);
  shroud.translate(0, yc, 0);
  const nozzleCap = K.roundedBox(0.017, 0.017, 0.011, 0.003, S(2, 1));
  nozzleCap.translate(0, yc + 0.025, -0.0615);
  const orifice = K.cyl(0.0017, 0.0017, 0.0012, S(10));
  orifice.rotateX(Math.PI / 2);
  orifice.translate(0, yc + 0.025, -0.0672);
  const lever = K.extrude([
    [0.004, -0.002],
    [-0.004, -0.002],
    [-0.008, -0.02, -0.0095, -0.044],
    [-0.009, -0.0525, -0.0035, -0.0525],
    [0.0015, -0.05, 0.001, -0.04],
    [-0.0005, -0.026, 0.0045, -0.012],
  ], 0.016, { bevel: 0.0025, bevelSegs: S(2, 1), curveSegs: S(8, 2) });
  lever.rotateY(Math.PI / 2);
  const all = [shell, liq, backB, frontB, tubeG, collar, topDisk, shroud, nozzleCap, orifice];
  shiftAll(all, dy);
  const head = L.head ?? '#ffffff', trig = L.trig ?? head;
  const parts = [
    { key: shellPart(`p:${id}:shell`, shell, L) },
    { key: def(`p:${id}:label`, 'opaque', K.merge([
      K.paint(backB, '#ffffff', { r: 0.42, uvRect: slotRect(slot, 0, 0.5) }),
      K.paint(frontB, '#ffffff', { r: 0.42, uvRect: slotRect(slot, 0.5, 1) }),
    ])) },
    { key: def(`p:${id}:head`, 'opaque', K.merge([
      K.paint(collar, head, { r: 0.42 }),
      K.paint(topDisk, head, { r: 0.42 }),
      K.paint(shroud, head, { r: 0.32 }),
      K.paint(nozzleCap, trig, { r: 0.4 }),
      K.paint(orifice, '#202020', { r: 0.6 }),
      K.paint(tubeG, '#eef2f0', { r: 0.3 }),
    ])) },
    { key: def(`p:${id}:trigger`, 'opaque', K.paint(lever, trig, { r: 0.36 })), name: 'trigger', pos: [0, yc + 0.0115 + dy, -0.041] },
  ];
  const liquids = [];
  if (L.bottle !== 'opaque') {
    parts.push({ key: liquidPart(`p:${id}:liquid`, liq, p, L), liquid: [0.0045 + dy, yb + 0.02 + dy] });
  }
  return { parts, liquids, nozzle: [0, yc + 0.025 + dy, -0.07], shape: { type: 'box', x: hw, y: H / 2, z: hd + 0.002, cy: 0 }, half: H / 2, aspect: [aspect, aspect], recycle: L.bottle === 'opaque' ? ['HDPE', 2] : ['PET', 1] };
}

function bpAerosol(id, p, L, slot) {
  const big = p.capacity > 0.45;
  const r = big ? 0.0325 : 0.0275, hb = big ? 0.205 : 0.168;
  const bare = '#c9ced3';
  const bottom = K.lathe([[0.001, 0.011], [r * 0.55, 0.0075], [r - 0.0035, 0.0012], [r - 0.0012, 0.0], [r - 0.0002, 0.0018], [r + 0.0004, 0.004], [r, 0.0075], [r, 0.009]], { segs: S(48) });
  const body = K.lathe([[r, 0.009], [r, hb - 0.004]], { segs: S(64) });
  const top = K.lathe([[r, hb - 0.004], [r + 0.0005, hb], [r, hb + 0.003], [r * 0.93, hb + 0.011], [r * 0.78, hb + 0.019], [r * 0.6, hb + 0.025], [0.0145, hb + 0.0295], [0.0142, hb + 0.0315]], { segs: S(48) });
  const curl = new THREE.TorusGeometry(0.0134, 0.0017, S(8, 4), S(40));
  curl.rotateX(Math.PI / 2);
  curl.translate(0, hb + 0.032, 0);
  const cup = K.lathe([[0.0125, hb + 0.0325], [0.0105, hb + 0.0305], [0.004, hb + 0.0295], [0.0028, hb + 0.032], [0.0026, hb + 0.036]], { segs: S(32) });
  const parts = [];
  let H, nozzle;
  const act = [];
  if (big) {
    const base = K.lathe([[0.0118, hb + 0.034], [0.0118, hb + 0.046], [0.0105, hb + 0.049], [0.0, hb + 0.05]], { segs: S(32) });
    const spout = K.tube([[0, hb + 0.044, -0.004], [0, hb + 0.046, -0.02], [0, hb + 0.04, -0.036]], 0.0048, { segs: S(12), radial: S(12, 4) });
    const tip = K.cyl(0.0052, 0.0048, 0.004, S(12));
    tip.rotateX(-Math.PI / 2 + 0.35);
    tip.translate(0, hb + 0.0395, -0.037);
    act.push(K.paint(base, L.cap, { r: 0.35 }), K.paint(spout, L.cap, { r: 0.35 }), K.paint(tip, '#d8dadc', { r: 0.4 }));
    H = hb + 0.05;
    nozzle = [0, hb + 0.038, -0.04];
  } else {
    const btn = K.lathe([[0.0102, hb + 0.034], [0.0102, hb + 0.046], [0.009, hb + 0.0495], [0.0, hb + 0.051]], { segs: S(32) });
    const pad = K.cyl(0.0088, 0.0088, 0.0012, S(24), { y: hb + 0.0505 });
    const nz = K.cyl(0.0022, 0.0022, 0.004, S(10));
    nz.rotateX(Math.PI / 2);
    nz.translate(0, hb + 0.042, -0.0105);
    act.push(K.paint(btn, L.cap, { r: 0.3 }), K.paint(pad, '#e8eaec', { r: 0.6 }), K.paint(nz, '#1b1b1b', { r: 0.5 }));
    H = hb + 0.052;
    nozzle = [0, hb + 0.042, -0.014];
  }
  const dy = -H / 2;
  const all = [bottom, body, top, curl, cup];
  shiftAll(all, dy);
  for (const a of act) a.translate(0, dy, 0);
  parts.push({ key: def(`p:${id}:can`, 'opaque', K.merge([
    K.paint(bottom, bare, { r: 0.28, m: 0.9 }),
    K.paint(top, bare, { r: 0.24, m: 0.92 }),
    K.paint(curl, '#d6d9dc', { r: 0.22, m: 0.95 }),
    K.paint(cup, '#b9bec3', { r: 0.3, m: 0.9 }),
    K.paint(body, '#ffffff', { r: 0.3, m: 0.25, uvRect: slotRect(slot, 0, 1) }),
    ...act,
  ])) });
  const per = Math.PI * r;
  const aspect = (hb - 0.013) / per;
  return { parts, nozzle: [nozzle[0], nozzle[1] + dy, nozzle[2]], shape: { type: 'cylinder', r: r + 0.0004, h: H, cy: 0 }, half: H / 2, aspect: [aspect, aspect], recycle: ['ALU', 41], wrap: 0.58 };
}

function bpJug(id, p, L, slot) {
  const big = p.capacity > 1.5;
  const hw = big ? 0.0675 : 0.054, hd = big ? 0.044 : 0.037, cr = big ? 0.03 : 0.025, hb = big ? 0.2 : 0.165;
  const xn = -hw * 0.42;
  const rings = [
    { y: 0, hw: hw - 0.004, hd: hd - 0.004, cr: cr - 0.004 },
    { y: 0.0025, hw: hw - 0.001, hd: hd - 0.001, cr: cr - 0.001 },
    { y: 0.008, hw, hd, cr },
    { y: hb * 0.55, hw: hw * 0.995, hd: hd * 0.99, cr },
    { y: hb, hw: hw * 0.99, hd: hd * 0.99, cr },
    { y: hb + 0.016, hw: hw * 0.93, hd: hd * 0.95, cr: cr * 0.95 },
    { y: hb + 0.031, hw: hw * 0.68, hd: hd * 0.8, cr: cr * 0.8, x: -hw * 0.12 },
    { y: hb + 0.043, hw: 0.029, hd: 0.026, cr: 0.024, x: xn * 0.8 },
    { y: hb + 0.05, hw: 0.0195, hd: 0.0195, cr: 0.0195, x: xn },
    { y: hb + 0.066, hw: 0.0185, hd: 0.0185, cr: 0.0185, x: xn },
  ];
  const capH = L.word === 'Klorin' ? 0.03 : 0.024;
  const H = hb + 0.066 + capH - 0.004;
  const dy = -H / 2;
  const shell = K.loft(rings, { segs: S(48) });
  const hr = big ? 0.0105 : 0.0088;
  const handle = K.tube([[hw * 0.05, hb + 0.03, 0], [hw * 0.4, hb + 0.06, 0], [hw * 0.82, hb + 0.052, 0], [hw + 0.006, hb + 0.012, 0], [hw + 0.002, hb - 0.03, 0], [hw * 0.9, hb - 0.055, 0]], hr, { segs: S(40), radial: S(12, 4), tension: 0.5 });
  const liq = K.loft([
    { y: 0.0035, hw: hw - 0.0035, hd: hd - 0.0035, cr: cr - 0.0035 },
    { y: 0.009, hw: hw - 0.0014, hd: hd - 0.0014, cr: cr - 0.0014 },
    { y: hb, hw: hw * 0.99 - 0.0014, hd: hd * 0.99 - 0.0014, cr: cr - 0.0014 },
    { y: hb + 0.016, hw: hw * 0.93 - 0.0014, hd: hd * 0.95 - 0.0014, cr: cr * 0.95 - 0.0014 },
    { y: hb + 0.031, hw: hw * 0.68 - 0.0014, hd: hd * 0.8 - 0.0014, cr: cr * 0.8 - 0.0014, x: -hw * 0.12 },
    { y: hb + 0.043, hw: 0.027, hd: 0.024, cr: 0.022, x: xn * 0.8 },
  ], { segs: S(40) });
  const ly0 = 0.018, ly1 = hb - 0.014;
  const phi = 0.95;
  const backB = K.band(rings, ly0, ly1, 0.0005, { theta0: -phi, theta1: phi, segs: S(40) });
  const frontB = K.band(rings, ly0, ly1, 0.0005, { theta0: Math.PI - phi, theta1: Math.PI + phi, segs: S(40) });
  const aspect = (ly1 - ly0) / K.arcLength(K.ringAt(rings, (ly0 + ly1) / 2), -phi, phi);
  const cap = capRings(0.0215, capH, hb + 0.066 + capH / 2 - 0.006);
  cap.translate(xn, 0, 0);
  const capTop = K.cyl(0.0205, 0.0213, 0.002, S(36), { x: xn, y: hb + 0.066 + capH - 0.005 });
  const ring = K.cyl(0.0222, 0.0222, 0.004, S(36), { x: xn, y: hb + 0.059 });
  const all = [shell, handle, liq, backB, frontB, cap, capTop, ring];
  shiftAll(all, dy);
  const shellGeo = K.merge([K.paint(shell, '#fff'), K.paint(handle, '#fff')]);
  shellGeo.deleteAttribute('color');
  shellGeo.deleteAttribute('mat');
  const capCol = L.cap;
  const parts = [
    { key: shellPart(`p:${id}:shell`, shellGeo, L) },
    { key: def(`p:${id}:label`, 'opaque', K.merge([
      K.paint(backB, '#ffffff', { r: 0.42, uvRect: slotRect(slot, 0, 0.5) }),
      K.paint(frontB, '#ffffff', { r: 0.42, uvRect: slotRect(slot, 0.5, 1) }),
      K.paint(cap, capCol, { r: 0.4 }),
      K.paint(capTop, capCol, { r: 0.45 }),
      K.paint(ring, capCol, { r: 0.45 }),
    ])) },
  ];
  if (L.bottle !== 'opaque') parts.push({ key: liquidPart(`p:${id}:liquid`, liq, p, L), liquid: [0.0045 + dy, hb + 0.018 + dy] });
  return { parts, nozzle: [xn, hb + 0.07 + dy, 0], shape: { type: 'box', x: hw + 0.006, y: H / 2, z: hd, cy: 0 }, half: H / 2, aspect: [aspect, aspect], recycle: ['HDPE', 2] };
}

function bpJerrycan(id, p, L, slot) {
  const hw = 0.095, hd = 0.0625, cr = 0.017, hb = 0.252;
  const rings = [
    { y: 0, hw: hw - 0.005, hd: hd - 0.005, cr: cr - 0.004 },
    { y: 0.003, hw: hw - 0.0012, hd: hd - 0.0012, cr: cr - 0.001 },
    { y: 0.009, hw, hd, cr },
    { y: hb * 0.5, hw: hw * 0.997, hd: hd * 0.995, cr },
    { y: hb, hw: hw * 0.995, hd: hd * 0.99, cr },
    { y: hb + 0.011, hw: hw * 0.975, hd: hd * 0.96, cr: cr * 1.15 },
    { y: hb + 0.018, hw: hw * 0.935, hd: hd * 0.9, cr: cr * 1.25 },
  ];
  const top = hb + 0.018;
  const zn = -hd * 0.42;
  const neck = K.lathe([[0.027, top - 0.004], [0.026, top + 0.004], [0.0225, top + 0.01], [0.0215, top + 0.026]], { segs: S(36) });
  neck.translate(0, 0, zn);
  const capY = top + 0.026;
  const cap = capRings(0.026, 0.028, capY + 0.008);
  cap.translate(0, 0, zn);
  const capTop = K.cyl(0.0248, 0.0258, 0.002, S(40), { y: capY + 0.022, z: zn });
  const tamper = capRings(0.0262, 0.005, capY - 0.004);
  tamper.translate(0, 0, zn);
  const hz = hd * 0.38;
  const handle = K.extrude([
    [-0.078, 0],
    [0.078, 0],
    [0.078, 0.022],
    [0.074, 0.047, 0.05, 0.048],
    [-0.05, 0.048],
    [-0.074, 0.047, -0.078, 0.022],
  ], 0.026, { bevel: 0.006, bevelSegs: S(3, 1), curveSegs: S(8, 2), holes: [[
    [-0.056, 0.012],
    [0.056, 0.012],
    [0.06, 0.03, 0.045, 0.031],
    [-0.045, 0.031],
    [-0.06, 0.03, -0.056, 0.012],
  ]] });
  handle.translate(0, top - 0.006, hz);
  const shell = K.loft(rings, { segs: S(52) });
  const liq = K.loft([
    { y: 0.0035, hw: hw - 0.0045, hd: hd - 0.0045, cr: cr - 0.0035 },
    { y: 0.009, hw: hw - 0.0016, hd: hd - 0.0016, cr: cr - 0.0016 },
    { y: hb, hw: hw * 0.995 - 0.0016, hd: hd * 0.99 - 0.0016, cr: cr - 0.0016 },
    { y: hb + 0.011, hw: hw * 0.975 - 0.0016, hd: hd * 0.96 - 0.0016, cr: cr * 1.15 - 0.0016 },
    { y: hb + 0.016, hw: hw * 0.94 - 0.0016, hd: hd * 0.91 - 0.0016, cr: cr * 1.2 - 0.0016 },
  ], { segs: S(44) });
  const pw = 2 * (hw - cr) + 0.004, ly0 = 0.028, ly1 = hb - 0.016, ph = ly1 - ly0;
  const back = new THREE.PlaneGeometry(pw, ph);
  back.translate(0, (ly0 + ly1) / 2, hd + 0.0006);
  const front = new THREE.PlaneGeometry(pw, ph);
  front.rotateY(Math.PI);
  front.translate(0, (ly0 + ly1) / 2, -hd - 0.0006);
  const grad = [];
  for (let i = 1; i <= 5; i++) {
    const y = 0.012 + (hb - 0.02) * (i / 5.4);
    grad.push(K.box(0.0006, 0.0012, i % 5 === 0 ? 0.03 : 0.018, { x: hw + 0.0004, y, z: -hd * 0.25 }));
  }
  const H = capY + 0.022 - 0.0;
  const dy = -H / 2;
  const all = [neck, cap, capTop, tamper, handle, shell, liq, back, front, ...grad];
  shiftAll(all, dy);
  const shellGeo = K.merge([K.paint(shell, '#fff'), K.paint(handle, '#fff'), K.paint(neck, '#fff')]);
  shellGeo.deleteAttribute('color');
  shellGeo.deleteAttribute('mat');
  const parts = [
    { key: shellPart(`p:${id}:shell`, shellGeo, L) },
    { key: def(`p:${id}:label`, 'opaque', K.merge([
      K.paint(back, '#ffffff', { r: 0.45, uvRect: slotRect(slot, 0, 0.5) }),
      K.paint(front, '#ffffff', { r: 0.45, uvRect: slotRect(slot, 0.5, 1) }),
      K.paint(cap, L.cap, { r: 0.42 }),
      K.paint(capTop, L.cap, { r: 0.45 }),
      K.paint(tamper, L.cap, { r: 0.45 }),
      ...grad.map((g) => K.paint(g, '#d8d8d0', { r: 0.6 })),
    ])) },
    { key: liquidPart(`p:${id}:liquid`, liq, p, L), liquid: [0.0045 + dy, hb + 0.012 + dy] },
  ];
  const aspect = ph / pw;
  return { parts, nozzle: [0, capY + 0.024 + dy, zn], shape: { type: 'box', x: hw, y: H / 2, z: hd, cy: 0 }, half: H / 2, aspect: [aspect, aspect], recycle: ['HDPE', 2] };
}

function bpTub(id, p, L, slot) {
  const sz = p.capacity >= 2 ? 2 : p.capacity >= 1.5 ? 1.5 : 1;
  const r = sz === 2 ? 0.088 : sz === 1.5 ? 0.08 : 0.072, h = sz === 2 ? 0.145 : sz === 1.5 ? 0.13 : 0.115;
  const rb = r * 0.9;
  const body = K.lathe([[0.001, 0.003], [rb - 0.006, 0.003], [rb - 0.002, 0.0005], [rb, 0.003], [rb + (r - rb) * 0.06, 0.008]], { segs: S(56) });
  const wall = K.lathe([[rb + (r - rb) * 0.06, 0.008], [r - (r - rb) * 0.1, h - 0.02], [r, h - 0.014]], { segs: S(64) });
  const ly0 = 0.012, ly1 = h - 0.024;
  const lab = K.lathe([[rb + (r - rb) * (ly0 / h) + 0.0006, ly0], [rb + (r - rb) * (ly1 / h) + 0.0006, ly1]], { segs: S(64) });
  const lidSkirt = K.ribbedRing(r + 0.0045, 0.022, S(70, 10), 0.0007, h - 0.004);
  const lidTop = K.lathe([[r + 0.0045, h + 0.007], [r + 0.002, h + 0.0098], [r - 0.004, h + 0.0102], [r - 0.008, h + 0.0085], [r - 0.012, h + 0.0085], [r - 0.014, h + 0.0098], [0.001, h + 0.0098]], { segs: S(64) });
  const tab = K.roundedBox(0.03, 0.006, 0.012, 0.002, S(2, 1));
  tab.translate(0, h - 0.012, -(r + 0.009));
  const H = h + 0.0105;
  const dy = -H / 2;
  const all = [body, wall, lab, lidSkirt, lidTop, tab];
  shiftAll(all, dy);
  const parts = [{ key: def(`p:${id}:tub`, 'opaque', K.merge([
    K.paint(body, '#f6f6f2', { r: 0.42 }),
    K.paint(wall, '#f6f6f2', { r: 0.4 }),
    K.paint(lab, '#ffffff', { r: 0.38, uvRect: slotRect(slot, 0, 1) }),
    K.paint(lidSkirt, L.cap, { r: 0.4 }),
    K.paint(lidTop, L.cap, { r: 0.36 }),
    K.paint(tab, L.cap, { r: 0.4 }),
  ])) }];
  const per = Math.PI * ((r + rb) / 2);
  const aspect = (ly1 - ly0) / per;
  return { parts, nozzle: [0, h + 0.012 + dy, 0], shape: { type: 'cylinder', r: r + 0.0045, h: H, cy: 0 }, half: H / 2, aspect: [aspect, aspect], recycle: ['PP', 5], wrap: 0.7 };
}

function bpShaker(id, p, L, slot) {
  const small = p.capacity < 0.9;
  const r = small ? 0.04 : 0.045, h = small ? 0.158 : 0.18;
  const rim = K.lathe([[0.001, 0.0005], [r - 0.003, 0.0005], [r + 0.0009, 0.002], [r + 0.0011, 0.006], [r + 0.0003, 0.0075]], { segs: S(48) });
  const paper = K.lathe([[r, 0.0065], [r, h - 0.01]], { segs: S(64) });
  const lid = K.lathe([[r + 0.0003, h - 0.013], [r + 0.0014, h - 0.012], [r + 0.0014, h + 0.004], [r - 0.001, h + 0.0085], [r - 0.004, h + 0.0092]], { segs: S(48) });
  const top = new THREE.CircleGeometry(r - 0.004, S(40));
  top.rotateX(-Math.PI / 2);
  top.translate(0, h + 0.0092, 0);
  const dr = decalRect(256, 0, 128, 128);
  const flap = new THREE.CylinderGeometry(r - 0.006, r - 0.006, 0.0016, S(32), 1, false, Math.PI * 0.5, Math.PI);
  flap.translate(0, h + 0.0101, 0);
  const grip = K.roundedBox(0.014, 0.0026, 0.006, 0.0012, S(1, 1));
  grip.translate(0, h + 0.0115, -(r - 0.012));
  const H = h + 0.011;
  const dy = -H / 2;
  const all = [rim, paper, lid, top, flap, grip];
  shiftAll(all, dy);
  const parts = [{ key: def(`p:${id}:shaker`, 'opaque', K.merge([
    K.paint(rim, '#b9bdc1', { r: 0.32, m: 0.85 }),
    K.paint(paper, '#ffffff', { r: 0.72, uvRect: slotRect(slot, 0, 1) }),
    K.paint(lid, L.cap, { r: 0.38 }),
    K.paint(top, L.cap, { r: 0.4, uvFn: (x, y, z) => [dr[0] + (x / (2 * (r - 0.004)) + 0.5) * dr[2], dr[1] + (0.5 - z / (2 * (r - 0.004))) * dr[3]] }),
    K.paint(flap, L.cap, { r: 0.35, shade: () => 0.92 }),
    K.paint(grip, L.cap, { r: 0.35, shade: () => 0.85 }),
  ])) }];
  const aspect = (h - 0.0165) / (Math.PI * r);
  return { parts, nozzle: [0, h + 0.012 + dy, 0], shape: { type: 'cylinder', r: r + 0.0014, h: H, cy: 0 }, half: H / 2, aspect: [aspect, aspect], recycle: ['PAP', 21], wrap: 0.6 };
}

function bpFoamer(id, p, L, slot) {
  const r = 0.058, h = 0.22;
  const rings = [
    { y: 0, hw: r - 0.006, hd: r - 0.006, cr: r - 0.006 },
    { y: 0.004, hw: r - 0.001, hd: r - 0.001, cr: r - 0.001 },
    { y: 0.012, hw: r, hd: r, cr: r },
    { y: h - 0.032, hw: r, hd: r, cr: r },
    { y: h - 0.014, hw: r * 0.88, hd: r * 0.88, cr: r * 0.88 },
    { y: h - 0.004, hw: 0.044, hd: 0.044, cr: 0.044 },
    { y: h + 0.006, hw: 0.042, hd: 0.042, cr: 0.042 },
  ];
  const tank = K.loft(rings, { segs: S(56) });
  const liq = K.loft([
    { y: 0.004, hw: r - 0.004, hd: r - 0.004, cr: r - 0.004 },
    { y: 0.012, hw: r - 0.0016, hd: r - 0.0016, cr: r - 0.0016 },
    { y: h - 0.032, hw: r - 0.0016, hd: r - 0.0016, cr: r - 0.0016 },
    { y: h - 0.016, hw: r * 0.88 - 0.0016, hd: r * 0.88 - 0.0016, cr: r * 0.88 - 0.0016 },
  ], { segs: S(44) });
  const foot = K.lathe([[0.001, -0.002], [r - 0.004, -0.002], [r + 0.0025, 0.0], [r + 0.0028, 0.028], [r + 0.001, 0.03]], { segs: S(56) });
  const collar = capRings(0.047, 0.032, h + 0.002);
  const collarTop = K.cyl(0.04, 0.046, 0.004, S(40), { y: h + 0.02 });
  const pumpTube = K.cyl(0.017, 0.017, h - 0.03, S(24), { y: 0.03 + (h - 0.03) / 2 });
  const rod = K.cyl(0.0075, 0.0075, 0.05, S(16), { y: h + 0.045 });
  const knob = K.roundedBox(0.1, 0.024, 0.032, 0.01, S(3, 1));
  knob.translate(0, h + 0.078, 0);
  const valve = K.cyl(0.006, 0.006, 0.014, S(14));
  valve.rotateZ(Math.PI / 2);
  valve.translate(-0.05, h + 0.004, 0);
  const valveCap = K.cyl(0.0075, 0.0075, 0.004, S(14));
  valveCap.rotateZ(Math.PI / 2);
  valveCap.translate(-0.058, h + 0.004, 0);
  const hose = K.tube([[0.044, h + 0.006, 0.0], [0.062, h + 0.004, 0.012], [0.085, h - 0.05, 0.03], [0.094, 0.09, 0.012], [0.086, 0.04, -0.03], [0.085, 0.052, -0.055]], 0.0055, { segs: S(48), radial: S(10, 4) });
  const grip = K.roundedBox(0.022, 0.07, 0.03, 0.008, S(2, 1));
  grip.rotateX(0.35);
  grip.translate(0.085, 0.055, -0.06);
  const lever = K.roundedBox(0.012, 0.045, 0.01, 0.003, S(1, 1));
  lever.rotateX(0.2);
  lever.translate(0.085, 0.058, -0.083);
  const wand = K.cyl(0.0055, 0.0055, 0.26, S(14));
  wand.rotateX(Math.PI / 2);
  wand.translate(0.085, 0.075, -0.205);
  const ferrule = K.cyl(0.0085, 0.0085, 0.02, S(14));
  ferrule.rotateX(Math.PI / 2);
  ferrule.translate(0.085, 0.075, -0.082);
  const tip = K.roundedBox(0.026, 0.012, 0.028, 0.004, S(2, 1));
  tip.translate(0.085, 0.075, -0.345);
  const ly0 = 0.04, ly1 = h - 0.045;
  const phi = 1.0;
  const backB = K.band(rings, ly0, ly1, 0.0005, { theta0: -phi, theta1: phi, segs: S(40) });
  const frontB = K.band(rings, ly0, ly1, 0.0005, { theta0: Math.PI - phi, theta1: Math.PI + phi, segs: S(40) });
  const aspect = (ly1 - ly0) / (2 * phi * r);
  const H = h + 0.09;
  const dy = -H / 2 + 0.002;
  const all = [tank, liq, foot, collar, collarTop, pumpTube, rod, knob, valve, valveCap, hose, grip, lever, wand, ferrule, tip, backB, frontB];
  shiftAll(all, dy);
  const parts = [
    { key: def(`p:${id}:shell`, 'clear', K.paint(tank, SHELL.natural.color, { r: SHELL.natural.r, a: 0.46 })) },
    { key: def(`p:${id}:body`, 'opaque', K.merge([
      K.paint(backB, '#ffffff', { r: 0.42, uvRect: slotRect(slot, 0, 0.5) }),
      K.paint(frontB, '#ffffff', { r: 0.42, uvRect: slotRect(slot, 0.5, 1) }),
      K.paint(foot, '#1d1e20', { r: 0.6 }),
      K.paint(collar, '#1d1e20', { r: 0.5 }),
      K.paint(collarTop, '#1d1e20', { r: 0.5 }),
      K.paint(pumpTube, '#9aa2a8', { r: 0.4, m: 0.2 }),
      K.paint(rod, '#c7ccd0', { r: 0.25, m: 0.9 }),
      K.paint(knob, L.cap, { r: 0.35 }),
      K.paint(valve, '#d42a20', { r: 0.4 }),
      K.paint(valveCap, '#d42a20', { r: 0.4 }),
      K.paint(hose, '#17181a', { r: 0.55 }),
      K.paint(grip, '#2a2c2f', { r: 0.6 }),
      K.paint(lever, L.cap, { r: 0.35 }),
      K.paint(wand, '#b9bfc4', { r: 0.25, m: 0.9 }),
      K.paint(ferrule, '#2a2c2f', { r: 0.5 }),
      K.paint(tip, '#f2f2f0', { r: 0.4 }),
    ])) },
    { key: liquidPart(`p:${id}:liquid`, liq, p, { ...L, liquid: '#f3efe2' }), liquid: [0.005 + dy, h - 0.018 + dy] },
  ];
  return { parts, nozzle: [0.085, 0.075 + dy, -0.362], shape: { type: 'cylinder', r: r + 0.003, h: H, cy: 0 }, half: H / 2, aspect: [aspect, aspect], recycle: ['HDPE', 2] };
}

const BUILD = { trigger: bpTrigger, aerosol: bpAerosol, jug: bpJug, jerrycan: bpJerrycan, tub: bpTub, shaker: bpShaker, foamer: bpFoamer };

function productBlueprint(id, p) {
  const key = 'p:' + id;
  if (blueprints.has(key)) return blueprints.get(key);
  ensureAtlas();
  const L = LOOK[id] ?? { font: 'geo', word: p.brand, bg: '#ffffff', brand: p.color, accent: p.color, ink: '#222', motif: 'bubbles', hz: [], claim: '', bottle: 'opaque', body: p.color, cap: '#ffffff', band: p.color };
  const slot = nextSlot < SLOT_KRAFT ? nextSlot++ : 0;
  const build = BUILD[p.container] ?? BUILD.trigger;
  const bp = build(id, p, L, slot);
  try {
    DQ = LO_Q;
    SUFFIX = '~lo';
    const lo = build(id, p, L, slot);
    bp.parts.forEach((d, i) => { d.lo = lo.parts[i]?.key ?? null; });
  } finally {
    DQ = 1;
    SUFFIX = '';
  }
  drawProductLabel(slot, id, p, L, bp);
  blueprints.set(key, bp);
  return bp;
}

function prebuild() {
  if (blueprints.size) return;
  ensureAtlas();
  for (const [id, p] of Object.entries(PRODUCTS)) productBlueprint(id, p);
  for (const [id, d] of Object.entries(TOOLS)) toolBlueprint(id, d);
}

export function labelTexture() {
  return ensureAtlas().tex;
}

export function containerModel(p) {
  prebuild();
  const id = PRODUCT_IDS.get(p) ?? p.brand;
  const bp = productBlueprint(id, p);
  const g = new THREE.Group();
  g.name = 'product:' + id;
  const liquids = [];
  for (const d of bp.parts) {
    const o = part(d.key, d.name ?? '');
    if (d.lo) o.userData.rbLod = d.lo;
    if (d.pos) o.position.set(d.pos[0], d.pos[1], d.pos[2]);
    g.add(o);
    if (d.liquid) {
      liquids.push({ o, y0: d.liquid[0], y1: d.liquid[1] });
      setFill(o, d.liquid[1]);
    }
  }
  const nozzle = new THREE.Object3D();
  nozzle.position.set(bp.nozzle[0], bp.nozzle[1], bp.nozzle[2]);
  g.add(nozzle);
  track(g);
  const updateFill = (frac) => {
    const f = Math.max(0, Math.min(1, frac));
    for (const l of liquids) {
      setFill(l.o, f < 0.004 ? l.y0 - 0.002 : l.y0 + (l.y1 - l.y0) * f);
      l.o.visible = f >= 0.004;
    }
  };
  return { group: g, nozzle, shape: { ...bp.shape }, half: bp.half, updateFill };
}

function stickGeo(color, r = 0.0135, m = 0.85) {
  const g = K.cyl(r, r, 1, S(12));
  return K.paint(g, color, { r: 0.3, m });
}

function tufts(rows, cols, w, d, h, r, color, { flare = 1.15, rough = 0.85, jitter = 0.0 } = {}) {
  const list = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const x = -w / 2 + (w * (i + 0.5)) / cols + (j % 2 ? w / cols / 2 : 0) - w / cols / 4;
    const z = -d / 2 + (d * (j + 0.5)) / rows;
    const hh = h * (1 + (K.hash(i, j, 4) - 0.5) * jitter);
    const t = K.cyl(r, r * flare, hh, S(7), { x, y: hh / 2, z });
    list.push(K.paint(t, color, { r: rough, shade: (px, py) => 0.78 + 0.22 * Math.min(1, py / h) }));
  }
  return K.merge(list);
}

function gripBlack() {
  const key = 't:grip:black';
  if (!has(key + SUFFIX)) {
    const grip = K.cyl(0.018, 0.018, 0.14, S(16), { y: -0.08 });
    const end = K.cyl(0.02, 0.018, 0.012, S(16), { y: -0.004 });
    def(key, 'opaque', K.merge([K.paint(grip, '#1d1e20', { r: 0.8 }), K.paint(end, '#1d1e20', { r: 0.6 })]));
  }
  return key + SUFFIX;
}

function aluStick() {
  const key = 't:stick:alu';
  if (!has(key + SUFFIX)) def(key, 'opaque', stickGeo('#b6bcc2', 0.0135, 0.85));
  return key + SUFFIX;
}

function dHandle(len, hgt, thick, w) {
  const a = len / 2;
  return K.extrude([
    [-a, 0],
    [a, 0],
    [a, hgt * 0.35],
    [a * 0.95, hgt, a * 0.55, hgt],
    [-a * 0.55, hgt],
    [-a * 0.95, hgt, -a, hgt * 0.35],
  ], w, { bevel: thick * 0.35, bevelSegs: S(3, 1), curveSegs: S(10, 2), holes: [[
    [-a * 0.62, hgt * 0.22],
    [a * 0.62, hgt * 0.22],
    [a * 0.66, hgt * 0.62, a * 0.42, hgt * 0.64],
    [-a * 0.42, hgt * 0.64],
    [-a * 0.66, hgt * 0.62, -a * 0.62, hgt * 0.22],
  ]] });
}

function toolBlueprint(id, d) {
  const key = 't:' + id;
  if (blueprints.has(key)) return blueprints.get(key);
  ensureAtlas();
  const bp = buildTool(id, d);
  try {
    DQ = LO_Q;
    SUFFIX = '~lo';
    const lo = buildTool(id, d);
    bp.headLo = lo.head;
    bp.extra.forEach((e, i) => { e.lo = lo.extra[i]?.key ?? null; });
    bp.stickLo = lo.stick;
  } finally {
    DQ = 1;
    SUFFIX = '';
  }
  blueprints.set(key, bp);
  return bp;
}

function buildTool(id, td) {
  const k = td.kind;
  const head = [], extra = [];
  let shape, tip = [0, 0, 0], handleLen = 0, stick = null, lens = null;
  if (k === 'vacuum' && !td.wet) {
    const body = '#c8352b', dark = '#2a2c30', grey = '#5b6066';
    const housing = K.roundedBox(0.34, 0.055, 0.2, 0.022, S(3, 1));
    housing.translate(0, -0.008, -0.045);
    const hood = K.roundedBox(0.26, 0.03, 0.11, 0.012, S(2, 1));
    hood.translate(0, 0.024, -0.065);
    const bumper = K.roundedBox(0.35, 0.026, 0.022, 0.009, S(2, 1));
    bumper.translate(0, -0.022, -0.143);
    const light = K.roundedBox(0.14, 0.008, 0.004, 0.002, S(1, 1));
    light.translate(0, 0.004, -0.146);
    const neck = K.cyl(0.03, 0.034, 0.05, S(20), { y: 0.03, z: 0.0 });
    const knuckle = new THREE.SphereGeometry(0.033, S(18), S(12));
    knuckle.translate(0, 0.055, 0.0);
    const wheels = [];
    for (const s of [-1, 1]) {
      const w = K.cyl(0.036, 0.036, 0.024, S(20));
      w.rotateZ(Math.PI / 2);
      w.translate(s * 0.158, -0.004, 0.03);
      wheels.push(K.paint(w, '#1a1b1d', { r: 0.7 }));
      const hub = K.cyl(0.016, 0.016, 0.026, S(14));
      hub.rotateZ(Math.PI / 2);
      hub.translate(s * 0.159, -0.004, 0.03);
      wheels.push(K.paint(hub, '#9aa1a6', { r: 0.3, m: 0.8 }));
    }
    head.push(def('t:vac:head', 'opaque', K.merge([
      K.paint(housing, dark, { r: 0.45 }),
      K.paint(hood, body, { r: 0.3 }),
      K.paint(bumper, '#151617', { r: 0.8 }),
      K.paint(light, '#eaf6ff', { r: 0.2, e: 1 }),
      K.paint(neck, grey, { r: 0.45 }),
      K.paint(knuckle, dark, { r: 0.4 }),
      ...wheels,
    ])));
    const motor = K.roundedBox(0.17, 0.2, 0.12, 0.03, S(3, 1));
    motor.translate(0, 0.1, 0.012);
    const binR = 0.048;
    const bin = K.cyl(binR, binR, 0.2, S(28), { y: 0.22, z: -0.045 });
    const binCap = K.cyl(binR + 0.003, binR + 0.003, 0.025, S(28), { y: 0.335, z: -0.045 });
    const dust = K.cyl(binR - 0.004, binR - 0.004, 0.05, S(24), { y: 0.145, z: -0.045 });
    const cyc = K.cyl(0.02, 0.026, 0.12, S(20), { y: 0.26, z: -0.045 });
    const badge = new THREE.PlaneGeometry(0.11, 0.055);
    badge.translate(0, 0.11, 0.0725);
    const hook = K.roundedBox(0.05, 0.016, 0.03, 0.006, S(1, 1));
    hook.translate(0, 0.24, 0.07);
    extra.push({ key: def('t:vac:body', 'opaque', K.merge([
      K.paint(motor, body, { r: 0.32 }),
      K.paint(binCap, '#2a2c30', { r: 0.4 }),
      K.paint(dust, '#8a8178', { r: 0.95 }),
      K.paint(cyc, '#a9b0b6', { r: 0.35, m: 0.5 }),
      K.paint(badge, '#ffffff', { r: 0.4, uvRect: toolRect(0) }),
      K.paint(hook, '#2a2c30', { r: 0.5 }),
    ])), at: 'base', offset: 0.03 });
    extra.push({ key: def('t:vac:bin', 'clear', K.paint(bin, '#dfe8ee', { r: 0.06, a: 0.2 })), at: 'base', offset: 0.03 });
    const grip = K.cyl(0.019, 0.019, 0.12, S(18), { y: -0.08 });
    const loop = new THREE.TorusGeometry(0.05, 0.012, S(10, 4), S(28), Math.PI);
    loop.translate(0, -0.005, 0);
    const sw = K.roundedBox(0.018, 0.01, 0.016, 0.004, S(1, 1));
    sw.translate(0, -0.03, -0.018);
    extra.push({ key: def('t:vac:grip', 'opaque', K.merge([K.paint(grip, '#1d1e20', { r: 0.75 }), K.paint(loop, '#2a2c30', { r: 0.45 }), K.paint(sw, body, { r: 0.35 })])), at: 'top', offset: 0.0 });
    stick = aluStick();
    handleLen = 1.05;
    shape = { type: 'box', x: 0.18, y: 0.04, z: 0.12, cy: 0 };
  } else if (k === 'vacuum') {
    const body = '#1c5fb4', dark = '#24262a';
    const nozzleG = K.roundedBox(0.34, 0.035, 0.11, 0.014, S(3, 1));
    nozzleG.translate(0, -0.016, -0.02);
    const lipF = K.box(0.33, 0.012, 0.005, { y: -0.036, z: -0.072 });
    const lipB = K.box(0.33, 0.012, 0.005, { y: -0.036, z: 0.03 });
    const window = K.roundedBox(0.24, 0.012, 0.05, 0.005, S(1, 1));
    window.translate(0, 0.004, -0.03);
    const neck = K.cyl(0.026, 0.03, 0.05, S(18), { y: 0.02, z: 0.0 });
    const knuckle = new THREE.SphereGeometry(0.03, S(16), S(10));
    knuckle.translate(0, 0.05, 0.0);
    const wheels = [];
    for (const s of [-1, 1]) {
      const w = K.cyl(0.026, 0.026, 0.018, S(18));
      w.rotateZ(Math.PI / 2);
      w.translate(s * 0.15, -0.012, 0.035);
      wheels.push(K.paint(w, '#141516', { r: 0.7 }));
    }
    head.push(def('t:wet:head', 'opaque', K.merge([
      K.paint(nozzleG, body, { r: 0.35 }),
      K.paint(lipF, '#101112', { r: 0.85 }),
      K.paint(lipB, '#101112', { r: 0.85 }),
      K.paint(window, '#a9c7e0', { r: 0.1 }),
      K.paint(neck, dark, { r: 0.45 }),
      K.paint(knuckle, dark, { r: 0.4 }),
      ...wheels,
    ])));
    const base = K.roundedBox(0.19, 0.05, 0.14, 0.03, S(3, 1));
    base.translate(0, 0.02, 0);
    const motor = K.roundedBox(0.17, 0.08, 0.12, 0.03, S(3, 1));
    motor.translate(0, 0.34, 0.0);
    const spine = K.roundedBox(0.05, 0.3, 0.04, 0.012, S(2, 1));
    spine.translate(0, 0.19, 0.065);
    const badge = new THREE.PlaneGeometry(0.12, 0.06);
    badge.translate(0, 0.34, 0.0605);
    extra.push({ key: def('t:wet:body', 'opaque', K.merge([
      K.paint(base, dark, { r: 0.45 }),
      K.paint(motor, body, { r: 0.3 }),
      K.paint(spine, dark, { r: 0.45 }),
      K.paint(badge, '#ffffff', { r: 0.4, uvRect: toolRect(1) }),
    ])), at: 'base', offset: 0.03 });
    const tank = K.loft([
      { y: 0.045, hw: 0.08, hd: 0.052, cr: 0.03 },
      { y: 0.3, hw: 0.08, hd: 0.052, cr: 0.03 },
    ], { segs: S(40) });
    tank.translate(0, 0, -0.01);
    extra.push({ key: def('t:wet:tank', 'clear', K.paint(tank, '#dce8f0', { r: 0.06, a: 0.22 })), at: 'base', offset: 0.03 });
    const water = K.loft([
      { y: 0.048, hw: 0.077, hd: 0.049, cr: 0.028 },
      { y: 0.296, hw: 0.077, hd: 0.049, cr: 0.028 },
    ], { segs: S(32) });
    water.translate(0, 0, -0.01);
    extra.push({ key: def('t:wet:water', 'liquid', K.paint(water, '#6b5a3e', { r: 0.08, a: 0.88, liquid: true })), at: 'base', offset: 0.03, fill: [0.048, 0.296] });
    const grip = K.cyl(0.019, 0.019, 0.12, S(18), { y: -0.08 });
    const tee = K.cyl(0.016, 0.016, 0.13, S(16));
    tee.rotateZ(Math.PI / 2);
    tee.translate(0, -0.005, 0);
    extra.push({ key: def('t:wet:grip', 'opaque', K.merge([K.paint(grip, '#1d1e20', { r: 0.75 }), K.paint(tee, '#1d1e20', { r: 0.7 })])), at: 'top', offset: 0.0 });
    stick = def('t:stick:dark', 'opaque', stickGeo('#3b3f44', 0.0135, 0.3));
    handleLen = 1.05;
    shape = { type: 'box', x: 0.18, y: 0.04, z: 0.12, cy: 0 };
  } else if (k === 'brush' && td.rake) {
    const bar = K.roundedBox(0.42, 0.022, 0.04, 0.008, S(2, 1));
    bar.translate(0, 0.064, 0);
    const pins = [];
    for (let row = 0; row < 2; row++) for (let i = 0; i < 30; i++) {
      const x = -0.2 + i * 0.0138 + (row ? 0.0069 : 0);
      const pin = K.cyl(0.0016, 0.0019, 0.056, S(6), { x, y: 0.028, z: row ? 0.009 : -0.009 });
      pins.push(K.paint(pin, '#c3c8cc', { r: 0.25, m: 0.9 }));
    }
    const socket = K.cyl(0.017, 0.021, 0.05, S(18));
    socket.rotateX(-0.35);
    socket.translate(0, 0.09, 0.008);
    const caps = [];
    for (const s of [-1, 1]) {
      const c = K.roundedBox(0.012, 0.03, 0.044, 0.005, S(1, 1));
      c.translate(s * 0.212, 0.064, 0);
      caps.push(K.paint(c, '#1b1c1e', { r: 0.6 }));
    }
    head.push(def('t:rake:head', 'opaque', K.merge([K.paint(bar, '#2e7d4f', { r: 0.4 }), K.paint(socket, '#1b1c1e', { r: 0.5 }), ...pins, ...caps])));
    extra.push({ key: gripBlack(), at: 'top', offset: 0 });
    stick = aluStick();
    handleLen = 1.3;
    shape = { type: 'box', x: 0.21, y: 0.04, z: 0.03, cy: 0.04 };
  } else if (k === 'brush') {
    const rubber = !!td.rubber, stiff = !rubber && td.strength > 0.8;
    const blockCol = rubber ? '#d8432a' : stiff ? '#1f5fae' : '#c99a63';
    const blkR = rubber ? 0.55 : stiff ? 0.35 : 0.55;
    const block = K.roundedBox(0.2, 0.026, 0.078, 0.008, S(2, 1));
    block.translate(0, 0.043, 0);
    const handle = dHandle(0.15, 0.04, 0.012, 0.024);
    handle.translate(0, 0.055, 0);
    const parts = [K.paint(block, blockCol, { r: blkR, shade: rubber ? null : (x, y, z) => (stiff ? 1 : 0.92 + 0.08 * Math.sin(x * 160 + z * 30)) }), K.paint(handle, rubber ? '#232427' : blockCol, { r: rubber ? 0.55 : blkR })];
    if (rubber) {
      for (let j = 0; j < 4; j++) for (let i = 0; i < 12; i++) {
        const x = -0.088 + i * 0.016 + (j % 2 ? 0.008 : 0), z = -0.027 + j * 0.018;
        const nub = K.cyl(0.0025, 0.0055, 0.03, S(8), { x, y: 0.015, z });
        parts.push(K.paint(nub, '#c53a24', { r: 0.7 }));
      }
    } else {
      parts.push(tufts(4, 13, 0.19, 0.07, 0.031, stiff ? 0.0033 : 0.0042, stiff ? '#f2c94c' : '#3a2a1c', { flare: stiff ? 1.05 : 1.25, rough: 0.7, jitter: stiff ? 0.04 : 0.12 }));
    }
    head.push(def(`t:${id}:head`, 'opaque', K.merge(parts)));
    shape = { type: 'box', x: 0.1, y: 0.045, z: 0.04, cy: 0.045 };
  } else if (k === 'squeegee') {
    const frame = K.roundedBox(0.56, 0.026, 0.03, 0.006, S(2, 1));
    frame.translate(0, 0.052, 0);
    const bladeA = K.box(0.55, 0.045, 0.005, { y: 0.0225, z: -0.006 });
    const bladeB = K.box(0.55, 0.045, 0.005, { y: 0.0225, z: 0.006 });
    const socket = K.cyl(0.018, 0.022, 0.05, S(18));
    socket.rotateX(-0.4);
    socket.translate(0, 0.075, 0.01);
    const caps = [];
    for (const s of [-1, 1]) {
      const c = K.roundedBox(0.014, 0.036, 0.036, 0.006, S(1, 1));
      c.translate(s * 0.283, 0.05, 0);
      caps.push(K.paint(c, '#1b1c1e', { r: 0.6 }));
    }
    head.push(def('t:squeegee:head', 'opaque', K.merge([K.paint(frame, '#f2c230', { r: 0.35 }), K.paint(bladeA, '#141414', { r: 0.85 }), K.paint(bladeB, '#141414', { r: 0.85 }), K.paint(socket, '#f2c230', { r: 0.35 }), ...caps])));
    extra.push({ key: gripBlack(), at: 'top', offset: 0 });
    stick = aluStick();
    handleLen = 1.3;
    shape = { type: 'box', x: 0.28, y: 0.035, z: 0.02, cy: 0.035 };
  } else if (k === 'scraper') {
    const blade = K.extrude([
      [-0.022, -0.1],
      [0.022, -0.1],
      [0.026, -0.04],
      [0.018, 0.03],
      [0.013, 0.12],
      [0.0, 0.13, -0.013, 0.12],
      [-0.018, 0.03],
      [-0.026, -0.04],
    ], 0.004, { bevel: 0.0015, bevelSegs: S(2, 1), curveSegs: S(6, 2) });
    blade.rotateX(Math.PI / 2);
    K.bend(blade, (v) => {
      if (v.z > 0.02) v.y += (v.z - 0.02) * (v.z - 0.02) * 1.6;
      const t = Math.max(0, Math.min(1, (-v.z + 0.02) / 0.12));
      v.y *= 1 - t * 0.5;
    });
    blade.translate(0, -0.004, 0);
    head.push(def('t:scraper:head', 'opaque', K.paint(blade, '#efe6d2', { r: 0.32, shade: (x, y, z) => 0.94 + 0.06 * Math.sin(z * 90) })));
    shape = { type: 'box', x: 0.03, y: 0.015, z: 0.1, cy: 0.012 };
  } else if (k === 'iron') {
    const paperG = new THREE.PlaneGeometry(0.3, 0.24, S(18), S(14));
    paperG.rotateX(-Math.PI / 2);
    K.bend(paperG, (v) => {
      v.y = 0.003 + Math.max(0, Math.sin(v.x * 37 + v.z * 11) * 0.0015 + Math.sin(v.z * 53 - v.x * 7) * 0.001) * (Math.abs(v.x) > 0.07 || Math.abs(v.z) > 0.12 ? 1 : 0.1);
    });
    const kr = kraftRect();
    const outline = [
      [0.055, 0.1],
      [-0.055, 0.1],
      [-0.058, 0.02],
      [-0.052, -0.06, -0.0, -0.125],
      [0.052, -0.06, 0.058, 0.02],
    ];
    const sole = K.extrude(outline, 0.008, { bevel: 0.0015, bevelSegs: S(1, 1), curveSegs: S(12, 2) });
    sole.rotateX(Math.PI / 2);
    sole.translate(0, 0.0065, 0);
    const bodyG = K.extrude(outline.map((q) => q.map((v, i) => (i % 2 === 0 ? v * 0.93 : v * 0.95))), 0.034, { bevel: 0.012, bevelSegs: S(4, 1), curveSegs: S(14, 2) });
    bodyG.rotateX(Math.PI / 2);
    bodyG.translate(0, 0.03, 0.004);
    const handle = K.tube([[0, 0.05, 0.085], [0, 0.098, 0.055], [0, 0.104, -0.01], [0, 0.07, -0.07]], 0.0115, { segs: S(24), radial: S(12, 4) });
    const post = K.roundedBox(0.026, 0.05, 0.02, 0.008, S(2, 1));
    post.translate(0, 0.075, 0.075);
    const dial = K.cyl(0.016, 0.017, 0.008, S(24));
    dial.rotateX(-0.6);
    dial.translate(0, 0.06, 0.06);
    const steamBtn = K.cyl(0.006, 0.006, 0.006, S(12), { y: 0.106, z: -0.02 });
    const tank = K.roundedBox(0.05, 0.022, 0.05, 0.01, S(2, 1));
    tank.translate(0, 0.052, -0.055);
    const cord = K.tube([[0, 0.05, 0.1], [0, 0.04, 0.13], [0.02, 0.012, 0.16]], 0.004, { segs: S(10), radial: S(8, 4) });
    const badge = new THREE.PlaneGeometry(0.06, 0.03);
    badge.rotateY(Math.PI / 2);
    badge.translate(0.0545, 0.032, 0.02);
    head.push(def('t:iron:head', 'opaque', K.merge([
      K.paint(paperG, '#ffffff', { r: 0.92, uvFn: (x, y, z) => [kr[0] + (x / 0.3 + 0.5) * kr[2], kr[1] + (z / 0.24 + 0.5) * kr[3]] }),
      K.paint(sole, '#c9ced2', { r: 0.12, m: 0.95 }),
      K.paint(bodyG, '#f4f6f8', { r: 0.28, shade: (x, y) => (y < 0.022 ? 0.72 : 1) }),
      K.paint(handle, '#1c5fb4', { r: 0.3 }),
      K.paint(post, '#1c5fb4', { r: 0.3 }),
      K.paint(dial, '#ffffff', { r: 0.35 }),
      K.paint(steamBtn, '#e94f37', { r: 0.35 }),
      K.paint(tank, '#9cc8ea', { r: 0.12 }),
      K.paint(cord, '#202124', { r: 0.55 }),
      K.paint(badge, '#ffffff', { r: 0.35, uvRect: toolRect(3) }),
    ])));
    shape = { type: 'box', x: 0.07, y: 0.05, z: 0.12, cy: 0.05 };
  } else if (k === 'uvlamp') {
    const bodyP = [[0.0, 0.086], [0.0185, 0.0855], [0.0195, 0.082], [0.0195, 0.066], [0.0178, 0.062], [0.0178, -0.03], [0.0215, -0.045], [0.026, -0.068], [0.0262, -0.083], [0.024, -0.086]];
    const body = K.lathe(bodyP.map(([r, y]) => [Math.max(r, 0.0005), -y]), { segs: S(36) });
    body.rotateX(-Math.PI / 2);
    const knurl = K.ribbedRing(0.0182, 0.07, S(24, 10), 0.0009, 0);
    knurl.rotateX(Math.PI / 2);
    knurl.translate(0, 0, 0.022);
    const clip = K.roundedBox(0.006, 0.0025, 0.055, 0.001, S(1, 1));
    clip.translate(0, 0.0205, 0.045);
    const button = K.cyl(0.009, 0.01, 0.006, S(18));
    button.rotateX(Math.PI / 2);
    button.translate(0, 0, 0.088);
    const reflector = K.lathe([[0.0235, 0.084], [0.012, 0.072], [0.006, 0.07]], { segs: S(32) });
    reflector.rotateX(-Math.PI / 2);
    const band2 = new THREE.CylinderGeometry(0.01784, 0.01784, 0.016, S(36), 1, true, -Math.PI * 0.45, Math.PI * 0.9);
    band2.rotateX(Math.PI / 2);
    band2.rotateZ(Math.PI);
    band2.translate(0, 0, -0.022);
    head.push(def('t:uv:head', 'opaque', K.merge([
      K.paint(body, '#2d2a33', { r: 0.32, m: 0.75 }),
      K.paint(knurl, '#26232b', { r: 0.45, m: 0.7 }),
      K.paint(clip, '#c5cacf', { r: 0.25, m: 0.95 }),
      K.paint(button, '#151515', { r: 0.8 }),
      K.paint(reflector, '#e2e5e8', { r: 0.08, m: 1 }),
      K.paint(band2, '#ffffff', { r: 0.4, uvFn: (x, y, z, u, v) => { const r2 = toolRect(2); return [r2[0] + u * r2[2], r2[1] + v * r2[3]]; } }),
    ])));
    lens = true;
    tip = [0, 0, -0.09];
    shape = { type: 'cylinder', r: 0.026, h: 0.17, cy: 0, axis: 'z' };
  } else if (k === 'blower') {
    const prof = [
      [0.27, 0.035],
      [-0.05, 0.035],
      [-0.16, 0.05, -0.215, 0.16],
      [-0.25, 0.27, -0.215, 0.39],
      [-0.165, 0.5, -0.02, 0.51],
      [0.11, 0.5, 0.17, 0.42],
      [0.215, 0.33, 0.215, 0.24],
      [0.27, 0.215],
    ];
    const shellG = K.extrude(prof, 0.3, { bevel: 0.022, bevelSegs: S(4, 1), curveSegs: S(16, 2) });
    shellG.rotateY(Math.PI / 2);
    const grilleR = 0.135;
    const gr = decalRect(0, 0, 256, 256);
    const grilles = [];
    for (const s of [-1, 1]) {
      const c = new THREE.CircleGeometry(grilleR, S(40));
      c.rotateY(s * Math.PI / 2);
      c.translate(s * 0.1506, 0.29, 0.02);
      grilles.push(K.paint(c, '#ffffff', { r: 0.6, uvFn: (x, y, z) => [gr[0] + ((s > 0 ? -1 : 1) * (z - 0.02) / (2 * grilleR) + 0.5) * gr[2], gr[1] + ((y - 0.29) / (2 * grilleR) + 0.5) * gr[3]] }));
      const ring = new THREE.TorusGeometry(grilleR + 0.004, 0.006, S(8, 4), S(40));
      ring.rotateY(Math.PI / 2);
      ring.translate(s * 0.15, 0.29, 0.02);
      grilles.push(K.paint(ring, '#1d1e20', { r: 0.6 }));
    }
    const ol = decalRect(384, 0, 128, 128);
    const outlet = new THREE.PlaneGeometry(0.29, 0.15);
    outlet.rotateY(Math.PI);
    outlet.translate(0, 0.125, -0.2925);
    const handle = K.tube([[0, 0.49, 0.1], [0, 0.585, 0.06], [0, 0.585, -0.06], [0, 0.48, -0.1]], 0.016, { segs: S(20), radial: S(12, 4) });
    const feet = [];
    for (const [x, z] of [[-0.12, -0.2], [0.12, -0.2], [-0.12, 0.14], [0.12, 0.14]]) feet.push(K.paint(K.cyl(0.025, 0.028, 0.03, S(14), { x, y: 0.015, z }), '#151617', { r: 0.8 }));
    const sw = K.roundedBox(0.05, 0.03, 0.012, 0.005, S(1, 1));
    sw.translate(0.0, 0.43, 0.17);
    head.push(def('t:blower:head', 'opaque', K.merge([
      K.paint(shellG, '#c8352b', { r: 0.34, shade: (x, y) => 0.86 + 0.14 * Math.min(1, y / 0.4) }),
      ...grilles,
      K.paint(outlet, '#ffffff', { r: 0.6, uvFn: (x, y) => [ol[0] + (-(x) / 0.29 + 0.5) * ol[2], ol[1] + ((y - 0.125) / 0.15 + 0.5) * ol[3]] }),
      K.paint(handle, '#1d1e20', { r: 0.7 }),
      K.paint(sw, '#f2c230', { r: 0.4 }),
      ...feet,
    ])));
    tip = [0, 0.12, -0.36];
    shape = { type: 'box', x: 0.155, y: 0.28, z: 0.28, cy: 0.28 };
  }
  return { head, extra, shape, tip, handleLen, stick, lens };
}

let lensMat = null;
function lensMesh() {
  if (!lensMat) lensMat = new THREE.MeshStandardMaterial({ color: '#3a2470', emissive: '#7a3cff', emissiveIntensity: 0.2, roughness: 0.12, metalness: 0 });
  const g = new THREE.CylinderGeometry(0.0225, 0.0225, 0.004, S(28));
  g.rotateX(Math.PI / 2);
  const m = new THREE.Mesh(g, lensMat.clone());
  m.position.z = -0.0845;
  m.name = 'lens';
  return m;
}

export function toolModel(def) {
  prebuild();
  const id = TOOL_IDS.get(def) ?? def.kind;
  const bp = toolBlueprint(id, def);
  const g = new THREE.Group();
  g.name = 'tool:' + id;
  const head = new THREE.Group();
  g.add(head);
  bp.head.forEach((key, i) => {
    const o = part(key);
    if (bp.headLo?.[i]) o.userData.rbLod = bp.headLo[i];
    head.add(o);
  });
  if (bp.lens) head.add(lensMesh());
  let stick = null;
  if (bp.handleLen > 0 && bp.stick) {
    stick = part(bp.stick, 'stick');
    if (bp.stickLo) stick.userData.rbLod = bp.stickLo;
    g.add(stick);
    for (const e of bp.extra) {
      const f = follower(e.key, stick, e.at, e.offset);
      if (e.lo) f.userData.rbLod = e.lo;
      if (e.fill) {
        const [y0, y1] = e.fill;
        f.userData.fillFn = (o) => {
          const it = o.userData.item;
          const fr = it && it.def?.tank ? Math.max(0, Math.min(1, it.tank / it.def.tank)) : 0;
          o.visible = fr > 0.01;
          return y0 + (y1 - y0) * fr;
        };
      }
      g.add(f);
    }
  }
  const tip = new THREE.Object3D();
  tip.position.set(bp.tip[0], bp.tip[1], bp.tip[2]);
  g.add(tip);
  track(g);
  return { group: g, head, stick, tip, shape: { ...bp.shape }, handleLen: bp.handleLen };
}
