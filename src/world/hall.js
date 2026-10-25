// Rug Rush warehouse hall: portal frames, roof trusses, sandwich-panel walls, high windows, skylights, LED high-bays, dock sectional doors driven by the trucks, personnel door, markings, signs and wall colliders.
import * as THREE from 'three';
import { R, GROUP, groups } from '../core/physics.js';
import { LAYOUT, BAY } from './layout.js';
import * as K from './kit.js';

const H = LAYOUT.hall;
const EAVE = 7.0;
const RIDGE = 8.45;
const WT = 0.12;
const CHORD_Y = 6.3;
const FRAME_X = [-20, -13.333, -6.667, 0, 6.667, 13.333, 20];
const DOOR_H = 4.5;
const SEC = 0.5;
const TRACK_R = 0.45;
const PDOOR = { z: -13, w: 1.0, h: 2.15 };
const OPEN_STATES = new Set(['reverse', 'parked', 'opening', 'open', 'closing', 'leave']);
const C = {
  steel: '#d7dbde', column: '#cfd4d8', dark: '#2e3338', rubber: '#141516', yellow: '#f2c230', panelIn: '#f3f4f2', plinthIn: '#c9cbc7',
  panelOut: '#c3c8cd', bandOut: '#3a4047', plinthOut: '#5d6268', door: '#59616a', glass: '#9fb7c8',
};

function deckY(z) {
  return EAVE + 0.2 + (RIDGE - EAVE) * (1 - Math.abs(z) / (H.maxZ + 0.3));
}

function panelNormalTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = 'rgb(128,128,255)';
  g.fillRect(0, 0, 64, 256);
  for (let y = 0; y < 256; y += 32) {
    g.fillStyle = 'rgb(128,108,236)';
    g.fillRect(0, y + 14, 64, 2);
    g.fillStyle = 'rgb(128,148,236)';
    g.fillRect(0, y + 16, 64, 2);
  }
  g.fillStyle = 'rgb(128,70,210)';
  g.fillRect(0, 0, 64, 4);
  g.fillStyle = 'rgb(128,190,210)';
  g.fillRect(0, 4, 64, 4);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function signAtlas() {
  const c = document.createElement('canvas');
  c.width = 2048;
  c.height = 1024;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 2048, 1024);
  const navy = '#0e182b', red = '#e2371f';
  g.fillStyle = navy;
  g.fillRect(0, 0, 1024, 256);
  g.fillStyle = red;
  g.beginPath();
  g.moveTo(70, 70);
  g.lineTo(180, 70);
  g.lineTo(140, 186);
  g.lineTo(30, 186);
  g.closePath();
  g.fill();
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.moveTo(120, 96);
  g.lineTo(160, 96);
  g.lineTo(136, 160);
  g.lineTo(96, 160);
  g.closePath();
  g.fill();
  g.font = '900 132px "Arial Black", "Helvetica Neue", Impact, sans-serif';
  g.textBaseline = 'middle';
  g.fillStyle = '#ffffff';
  g.fillText('RUG', 220, 134);
  g.fillStyle = red;
  g.fillText('RUSH', 560, 134);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 256, 1024, 128);
  g.fillStyle = navy;
  g.font = '700 70px Futura, "Century Gothic", "Trebuchet MS", sans-serif';
  g.textAlign = 'center';
  g.fillText('GZOWO  INDUSTRIES', 512, 322);
  const dock = (x, y, num, txt, arrow) => {
    g.fillStyle = navy;
    g.fillRect(x, y, 512, 128);
    g.fillStyle = C.yellow;
    g.fillRect(x + 16, y + 16, 96, 96);
    g.fillStyle = navy;
    g.font = '900 74px "Arial Black", Impact, sans-serif';
    g.textAlign = 'center';
    g.fillText(num, x + 64, y + 68);
    g.fillStyle = '#ffffff';
    g.font = '800 44px "Helvetica Neue", Arial, sans-serif';
    g.textAlign = 'left';
    g.fillText(txt, x + 136, y + 50);
    g.font = '500 30px "Helvetica Neue", Arial, sans-serif';
    g.fillText(arrow, x + 136, y + 94);
  };
  dock(1024, 0, '1', 'INBOUND', 'dirty rugs arrive here');
  dock(1536, 0, '2', 'OUTBOUND', 'wrapped rugs leave here');
  g.fillStyle = '#119a48';
  g.fillRect(1024, 128, 256, 128);
  g.fillStyle = '#ffffff';
  g.font = '800 54px "Helvetica Neue", Arial, sans-serif';
  g.textAlign = 'left';
  g.fillText('EXIT', 1150, 196);
  g.save();
  g.translate(1080, 192);
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.arc(8, -36, 9, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 10;
  g.strokeStyle = '#ffffff';
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(4, -22);
  g.lineTo(-6, 6);
  g.moveTo(-6, 6);
  g.lineTo(14, 20);
  g.moveTo(-6, 6);
  g.lineTo(-24, 30);
  g.moveTo(2, -16);
  g.lineTo(22, -6);
  g.moveTo(2, -16);
  g.lineTo(-20, -8);
  g.stroke();
  g.restore();
  const stencil = (x, y, w, txt) => {
    g.clearRect(x, y, w, 128);
    g.fillStyle = C.yellow;
    g.font = '900 86px "Arial Black", Impact, sans-serif';
    g.textAlign = 'center';
    g.fillText(txt, x + w / 2, y + 68);
  };
  stencil(0, 384, 1024, 'WASH BAY');
  stencil(0, 512, 1024, 'DRYING');
  stencil(0, 640, 1024, 'WRAP & SHIP');
  stencil(0, 768, 1024, 'SUPPLIES');
  stencil(0, 896, 1024, 'KEEP CLEAR');
  for (let i = 0; i < 4; i++) {
    const [x, y] = [1024 + (i % 2) * 512, 256 + Math.floor(i / 2) * 128];
    const labels = ['WASH BAY', 'DRYING', 'WRAP & SHIP', 'SUPPLIES'];
    g.fillStyle = '#ffffff';
    g.fillRect(x, y, 512, 128);
    g.fillStyle = navy;
    g.fillRect(x, y, 512, 18);
    g.font = '800 58px "Helvetica Neue", Arial, sans-serif';
    g.textAlign = 'center';
    g.fillText(labels[i], x + 256, y + 82);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function atlasRect(x, y, w, h) {
  return [x / 2048, 1 - (y + h) / 1024, w / 2048, h / 1024];
}

function wallQuad(list, ax, a0, a1, y0, y1, off, side, color, { r = 0.6, e = 0 } = {}) {
  if (a1 - a0 < 1e-4 || y1 - y0 < 1e-4) return;
  const P = ax === 'x' ? [[off, y0, a0], [off, y0, a1], [off, y1, a1], [off, y1, a0]] : [[a0, y0, off], [a1, y0, off], [a1, y1, off], [a0, y1, off]];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P.flat(), 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([a0, y0, a1, y0, a1, y1, a0, y1], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.computeVertexNormals();
  orient(g, ax === 'x' ? [side, 0, 0] : [0, 0, side]);
  list.push(K.paint(g, color, { r, e, uvFn: (x, y, z, u, v) => [u, v] }));
}

function orient(geo, want) {
  const n = geo.attributes.normal;
  if (n.getX(0) * want[0] + n.getY(0) * want[1] + n.getZ(0) * want[2] < 0) {
    const idx = geo.index.array;
    for (let i = 0; i < idx.length; i += 3) {
      const t = idx[i + 1];
      idx[i + 1] = idx[i + 2];
      idx[i + 2] = t;
    }
    for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
  }
  return geo;
}

function segmentsAlong(lo, hi, holes) {
  const out = [];
  let a = lo;
  for (const [h0, h1, top] of holes.slice().sort((p, q) => p[0] - q[0])) {
    if (h0 > a) out.push([a, h0, 0]);
    out.push([h0, h1, top]);
    a = h1;
  }
  if (a < hi) out.push([a, hi, 0]);
  return out;
}

function beam(list, a, b, w, h, color, opts = {}) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const d = B.clone().sub(A);
  const L = d.length();
  const g = new THREE.BoxGeometry(w, L, h);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  g.applyQuaternion(q);
  g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
  list.push(K.paint(g, color, { r: opts.r ?? 0.45, m: opts.m ?? 0.35 }));
}

function iBeam(h, w, len, tf = 0.016, tw = 0.01) {
  const hw = w / 2, hh = h / 2;
  return K.extrude([
    [-hw, -hh], [hw, -hh], [hw, -hh + tf], [tw / 2, -hh + tf], [tw / 2, hh - tf], [hw, hh - tf], [hw, hh], [-hw, hh], [-hw, hh - tf], [-tw / 2, hh - tf], [-tw / 2, -hh + tf], [-hw, -hh + tf],
  ], len, { bevel: 0, curveSegs: 1 });
}

export function buildHall(game) {
  const scene = game.engine.scene;
  const physics = game.physics;
  const root = new THREE.Group();
  root.name = 'hall';
  scene.add(root);
  const signTex = signAtlas();
  const panelN = panelNormalTexture();
  const steelLow = [], steelHigh = [], walls = [], glass = [], glow = [], signs = [], marks = [], stencils = [];

  for (const fx of FRAME_X) {
    const x = Math.max(H.minX + 0.18, Math.min(H.maxX - 0.18, fx));
    for (const s of [-1, 1]) {
      const col = iBeam(0.3, 0.22, EAVE - 0.05);
      col.rotateX(-Math.PI / 2);
      col.translate(x, (EAVE - 0.05) / 2, s * (H.maxZ - 0.22));
      steelLow.push(K.paint(col, C.column, { r: 0.42, m: 0.3 }));
      const base = K.box(0.4, 0.02, 0.34, { x, y: 0.01, z: s * (H.maxZ - 0.22) });
      steelLow.push(K.paint(base, '#9aa0a5', { r: 0.5, m: 0.5 }));
      const haunch = K.box(0.18, 0.5, 0.5, { x, y: EAVE - 0.3, z: s * (H.maxZ - 0.45) });
      steelHigh.push(K.paint(haunch, C.steel, { r: 0.45, m: 0.3 }));
    }
    const zE = H.maxZ - 0.3;
    const top = (z) => deckY(z) - 0.16;
    const n = 12;
    const zs = [];
    for (let i = 0; i <= n; i++) zs.push(-zE + (2 * zE * i) / n);
    for (let i = 0; i < n; i++) {
      beam(steelHigh, [x, top(zs[i]), zs[i]], [x, top(zs[i + 1]), zs[i + 1]], 0.12, 0.14, C.steel);
      beam(steelHigh, [x, CHORD_Y, zs[i]], [x, CHORD_Y, zs[i + 1]], 0.1, 0.12, C.steel);
      const diagUp = i < n / 2;
      beam(steelHigh, [x, CHORD_Y, diagUp ? zs[i] : zs[i + 1]], [x, top(diagUp ? zs[i + 1] : zs[i]), diagUp ? zs[i + 1] : zs[i]], 0.06, 0.06, C.steel);
    }
    for (let i = 0; i <= n; i++) beam(steelHigh, [x, CHORD_Y, zs[i]], [x, top(zs[i]), zs[i]], 0.06, 0.06, C.steel);
  }
  for (let k = -9; k <= 9; k++) {
    const z = k * 1.6;
    if (Math.abs(z) > H.maxZ - 0.35) continue;
    beam(steelHigh, [H.minX + 0.05, deckY(z) - 0.05, z], [H.maxX - 0.05, deckY(z) - 0.05, z], 0.05, 0.14, '#e2e5e7', { r: 0.5, m: 0.3 });
  }
  for (const s of [-1, 1]) for (let i = 0; i < FRAME_X.length - 1; i++) {
    const x0 = FRAME_X[i] + 0.2, x1 = FRAME_X[i + 1] - 0.2;
    beam(steelHigh, [x0, CHORD_Y - 0.05, s * 3], [x1, CHORD_Y - 0.05, s * 3], 0.05, 0.05, C.steel);
  }

  const doorHoles = [];
  for (const dk of [LAYOUT.inboundDock, LAYOUT.outboundDock]) doorHoles.push([dk.z - dk.door / 2, dk.z + dk.door / 2, DOOR_H]);
  doorHoles.push([PDOOR.z - PDOOR.w / 2, PDOOR.z + PDOOR.w / 2, PDOOR.h]);
  const winY0 = 4.55, winY1 = 5.65;
  const buildWall = (ax, plane, lo, hi, holes, windows) => {
    for (const side of [-1, 1]) {
      const inner = Math.sign(plane) === -side;
      const off = plane + side * WT / 2;
      const segs = segmentsAlong(lo, hi, holes);
      for (const [a0, a1, top] of segs) {
        const ys = top > 0 ? [[top, EAVE + (ax === 'x' ? 0 : 0.2)]] : [[0, EAVE + (ax === 'x' ? 0 : 0.2)]];
        for (const [y0, y1] of ys) {
          const bands = inner ? [[y0, Math.max(y0, Math.min(y1, 1.0)), C.plinthIn, 0.85, 0.03], [Math.max(y0, 1.0), y1, C.panelIn, 0.55, 0.05]] : [[y0, Math.max(y0, Math.min(y1, 0.6)), C.plinthOut, 0.8], [Math.max(y0, 0.6), Math.min(y1, 6.3), C.panelOut, 0.5], [Math.max(y0, 6.3), y1, C.bandOut, 0.5]];
          for (const [b0, b1, col, r, e = 0] of bands) {
            if (b1 - b0 < 1e-3) continue;
            if (windows && b1 > winY0 && b0 < winY1) {
              const cut = [];
              for (const [w0, w1] of windows) if (w1 > a0 && w0 < a1) cut.push([Math.max(w0, a0), Math.min(w1, a1)]);
              if (b0 < winY0) wallQuad(walls, ax, a0, a1, b0, winY0, off, side, col, { r, e });
              if (b1 > winY1) wallQuad(walls, ax, a0, a1, winY1, b1, off, side, col, { r, e });
              let c0 = a0;
              for (const [w0, w1] of cut) {
                wallQuad(walls, ax, c0, w0, Math.max(b0, winY0), Math.min(b1, winY1), off, side, col, { r, e });
                c0 = w1;
              }
              wallQuad(walls, ax, c0, a1, Math.max(b0, winY0), Math.min(b1, winY1), off, side, col, { r, e });
            } else wallQuad(walls, ax, a0, a1, b0, b1, off, side, col, { r, e });
          }
        }
      }
    }
  };
  const winsLong = [];
  for (let i = 0; i < FRAME_X.length - 1; i++) winsLong.push([FRAME_X[i] + 0.7, FRAME_X[i + 1] - 0.7]);
  buildWall('z', H.minZ, H.minX, H.maxX, [], winsLong);
  buildWall('z', H.maxZ, H.minX, H.maxX, [], winsLong);
  buildWall('x', H.minX, H.minZ, H.maxZ, [], null);
  buildWall('x', H.maxX, H.minZ, H.maxZ, doorHoles, null);
  for (const xs of [H.minX, H.maxX]) for (const side of [-1, 1]) {
    const inner = Math.sign(xs) === -side;
    const shape = new THREE.Shape();
    shape.moveTo(H.minZ - 0.06, EAVE);
    shape.lineTo(H.maxZ + 0.06, EAVE);
    shape.lineTo(H.maxZ + 0.06, deckY(H.maxZ + 0.06) + 0.25);
    shape.lineTo(0, RIDGE + 0.25);
    shape.lineTo(H.minZ - 0.06, deckY(H.minZ - 0.06) + 0.25);
    shape.closePath();
    const g = new THREE.ShapeGeometry(shape);
    g.rotateY(-Math.PI / 2);
    g.translate(xs + side * WT / 2, 0, 0);
    const pp = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < pp.count; i++) uv.setXY(i, pp.getZ(i), pp.getY(i));
    g.computeVertexNormals();
    orient(g, [side, 0, 0]);
    walls.push(K.paint(g, inner ? C.panelIn : C.bandOut, { r: 0.55, e: inner ? 0.05 : 0, uvFn: (x, y, z, u, v) => [u, v] }));
  }
  for (const [ax, plane] of [['z', H.minZ], ['z', H.maxZ]]) {
    const s = Math.sign(plane);
    const cap = K.box(H.maxX - H.minX + WT + 0.16, 0.06, WT + 0.16, { x: 0, y: EAVE + 0.23, z: plane + s * 0.04 });
    steelLow.push(K.paint(cap, C.bandOut, { r: 0.5, m: 0.4 }));
    const gut = K.box(H.maxX - H.minX + 0.4, 0.14, 0.16, { x: 0, y: EAVE + 0.12, z: plane + s * (WT / 2 + 0.08) });
    steelLow.push(K.paint(gut, '#8d949a', { r: 0.4, m: 0.6 }));
    void ax;
    for (const x of [-19.6, 19.6]) {
      const dp = K.cyl(0.05, 0.05, EAVE, 10, { x, y: EAVE / 2, z: plane + s * (WT / 2 + 0.07) });
      steelLow.push(K.paint(dp, '#8d949a', { r: 0.4, m: 0.6 }));
    }
  }
  for (const s of [-1, 1]) for (const [w0, w1] of winsLong) {
    const pane = K.box(w1 - w0, winY1 - winY0, 0.01, { x: (w0 + w1) / 2, y: (winY0 + winY1) / 2, z: s * H.maxZ });
    glass.push(K.paint(pane, C.glass, { r: 0.05, m: 0.1 }));
    const n = Math.round((w1 - w0) / 1.3);
    for (let i = 0; i <= n; i++) {
      const x = w0 + ((w1 - w0) * i) / n;
      steelLow.push(K.paint(K.box(0.06, winY1 - winY0, WT + 0.02, { x, y: (winY0 + winY1) / 2, z: s * H.maxZ }), '#9aa1a7', { r: 0.35, m: 0.7 }));
    }
    for (const y of [winY0, winY1]) steelLow.push(K.paint(K.box(w1 - w0 + 0.06, 0.06, WT + 0.04, { x: (w0 + w1) / 2, y, z: s * H.maxZ }), '#9aa1a7', { r: 0.35, m: 0.7 }));
    steelLow.push(K.paint(K.box(w1 - w0 + 0.1, 0.03, 0.18, { x: (w0 + w1) / 2, y: winY0 - 0.02, z: s * (H.maxZ - 0.1) }), '#e4e6e7', { r: 0.4, m: 0.2 }));
  }

  const skyZ = [[-9.2, -6.6], [6.6, 9.2]];
  const roofParts = [];
  const deckStrip = (z0, z1) => {
    const g = new THREE.PlaneGeometry(H.maxX - H.minX + 0.6, 1, 1, 1);
    g.rotateX(Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const z = p.getZ(i) > 0 ? z1 : z0;
      p.setXYZ(i, p.getX(i), deckY(z), z);
    }
    g.computeVertexNormals();
    orient(g, [0, -1, 0]);
    const uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getZ(i) * 0.5, p.getX(i) * 0.5);
    roofParts.push(K.paint(g, '#f2f3f3', { r: 0.6, m: 0.1, e: 0.07, uvFn: (x, y, z, u, v) => [u, v] }));
    const top = g.clone();
    top.translate(0, 0.14, 0);
    orient(top, [0, 1, 0]);
    roofParts.push(K.paint(top, '#7d848b', { r: 0.6, m: 0.3 }));
  };
  const zEdges = [H.minZ - 0.3, skyZ[0][0], skyZ[0][1], 0, skyZ[1][0], skyZ[1][1], H.maxZ + 0.3];
  deckStrip(zEdges[0], zEdges[1]);
  deckStrip(zEdges[2], zEdges[3]);
  deckStrip(zEdges[3], zEdges[4]);
  deckStrip(zEdges[5], zEdges[6]);
  for (const [z0, z1] of skyZ) {
    const g = new THREE.PlaneGeometry(H.maxX - H.minX - 2.0, 1);
    g.rotateX(Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const z = p.getZ(i) > 0 ? z1 : z0;
      p.setXYZ(i, p.getX(i), deckY(z) + 0.05, z);
    }
    g.computeVertexNormals();
    orient(g, [0, -1, 0]);
    glow.push(K.paint(g, '#eef6ff', { r: 1, e: 1 }));
    for (let x = H.minX + 1; x <= H.maxX - 1; x += 2.5) beam(steelHigh, [x, deckY(z0) - 0.02, z0], [x, deckY(z1) - 0.02, z1], 0.05, 0.06, '#b9bfc4');
    for (const z of [z0, z1]) beam(steelHigh, [H.minX + 1, deckY(z) - 0.03, z], [H.maxX - 1, deckY(z) - 0.03, z], 0.08, 0.08, '#b9bfc4');
  }
  const ledX = [-16.667, -10, -3.333, 3.333, 10, 16.667];
  const ledZ = [-10.5, -3.5, 3.5, 10.5];
  for (const x of ledX) for (const z of ledZ) {
    const y = 5.55;
    const hous = K.lathe([[0.23, y], [0.23, y + 0.02], [0.2, y + 0.06], [0.1, y + 0.13], [0.08, y + 0.2], [0.02, y + 0.22]], { segs: 20 });
    hous.translate(x, 0, z);
    steelHigh.push(K.paint(hous, '#3a3f45', { r: 0.4, m: 0.6 }));
    const fins = K.cyl(0.13, 0.13, 0.08, 16, { x, y: y + 0.13, z });
    steelHigh.push(K.paint(fins, '#4a5057', { r: 0.5, m: 0.6 }));
    const cable = K.cyl(0.006, 0.006, deckY(z) - y - 0.22, 5, { x, y: (deckY(z) + y + 0.22) / 2, z });
    steelHigh.push(K.paint(cable, '#2b2e31', { r: 0.6 }));
    const disc = new THREE.CircleGeometry(0.2, 24);
    disc.rotateX(Math.PI / 2);
    disc.translate(x, y - 0.002, z);
    glow.push(K.paint(disc, '#ffffff', { r: 1, e: 1 }));
  }

  const doorParts = [];
  const doors = [];
  for (const [dk, role] of [[LAYOUT.inboundDock, 'in'], [LAYOUT.outboundDock, 'out']]) {
    const z0 = dk.z - dk.door / 2, z1 = dk.z + dk.door / 2;
    for (const z of [z0 - 0.1, z1 + 0.1]) {
      const post = K.box(0.2, DOOR_H + 0.3, 0.2, { x: H.maxX - 0.17, y: (DOOR_H + 0.3) / 2, z });
      steelLow.push(K.paint(post, C.column, { r: 0.42, m: 0.3 }));
      const wrap = K.box(0.205, 1.2, 0.205, { x: H.maxX - 0.17, y: 0.6, z });
      steelLow.push(K.paint(wrap, C.yellow, { r: 0.5, shade: (x, y) => (Math.floor((y + (x - z) * 0.2) / 0.15) % 2 ? 0.12 : 1) }));
      const track = K.box(0.06, DOOR_H, 0.08, { x: H.maxX - 0.3, y: DOOR_H / 2, z: z + Math.sign(z - dk.z) * -0.12 });
      steelLow.push(K.paint(track, '#9aa1a7', { r: 0.35, m: 0.7 }));
      const ht = K.box(4.6, 0.06, 0.08, { x: H.maxX - 0.3 - TRACK_R - 2.3, y: DOOR_H + TRACK_R, z: z + Math.sign(z - dk.z) * -0.12 });
      steelHigh.push(K.paint(ht, '#9aa1a7', { r: 0.35, m: 0.7 }));
      const arc = new THREE.TorusGeometry(TRACK_R, 0.03, 6, 10, Math.PI / 2);
      arc.translate(H.maxX - 0.3 - TRACK_R, DOOR_H, z + Math.sign(z - dk.z) * -0.12);
      steelLow.push(K.paint(arc, '#9aa1a7', { r: 0.35, m: 0.7 }));
      for (const hx of [H.maxX - 2.5, H.maxX - 4.8]) beam(steelHigh, [hx, DOOR_H + TRACK_R, z + Math.sign(z - dk.z) * -0.12], [hx, CHORD_Y, z + Math.sign(z - dk.z) * -0.12], 0.04, 0.04, '#9aa1a7');
    }
    const header = K.box(0.2, 0.3, dk.door + 0.4, { x: H.maxX - 0.17, y: DOOR_H + 0.15, z: dk.z });
    steelLow.push(K.paint(header, C.column, { r: 0.42, m: 0.3 }));
    const shaft = K.cyl(0.05, 0.05, dk.door, 12);
    shaft.rotateX(Math.PI / 2);
    shaft.translate(H.maxX - 0.35, DOOR_H + 0.55, dk.z);
    steelHigh.push(K.paint(shaft, '#b9bfc4', { r: 0.3, m: 0.85 }));
    const motor = K.roundedBox(0.3, 0.3, 0.22, 0.03, 2);
    motor.translate(H.maxX - 0.35, DOOR_H + 0.55, z1 + 0.35);
    steelHigh.push(K.paint(motor, '#2f3439', { r: 0.4, m: 0.3 }));
    for (const s of [-1, 1]) {
      const pad = K.roundedBox(0.34, DOOR_H + 0.3, 0.32, 0.05, 2);
      pad.translate(H.maxX + 0.23, (DOOR_H + 0.3) / 2, dk.z + s * (dk.door / 2 + 0.17));
      steelLow.push(K.paint(pad, '#1c1d1f', { r: 0.85 }));
      const bump = K.roundedBox(0.16, 0.32, 0.24, 0.03, 2);
      bump.translate(H.maxX + 0.14, 0.62, dk.z + s * 1.0);
      steelLow.push(K.paint(bump, C.rubber, { r: 0.9 }));
      for (const bx of [H.maxX - 0.55, H.maxX + 0.75]) {
        const bol = K.cyl(0.085, 0.085, 1.15, 16, { x: bx, y: 0.575, z: dk.z + s * (dk.door / 2 + 0.45) });
        steelLow.push(K.paint(bol, C.yellow, { r: 0.4, shade: (x, y) => (y > 0.85 && y < 1.0 ? 0.12 : 1) }));
        const cap = new THREE.SphereGeometry(0.085, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
        cap.translate(bx, 1.15, dk.z + s * (dk.door / 2 + 0.45));
        steelLow.push(K.paint(cap, C.yellow, { r: 0.4 }));
        physics.staticBox(0.09, 0.6, 0.09, { x: bx, y: 0.6, z: dk.z + s * (dk.door / 2 + 0.45) });
      }
    }
    const topSeal = K.roundedBox(0.36, 0.5, dk.door + 0.66, 0.05, 2);
    topSeal.translate(H.maxX + 0.24, DOOR_H + 0.3 + 0.25, dk.z);
    steelLow.push(K.paint(topSeal, '#1c1d1f', { r: 0.85 }));
    const lamp = K.roundedBox(0.2, 0.1, 0.3, 0.02, 1);
    lamp.translate(H.maxX + 0.2, DOOR_H + 1.1, dk.z);
    steelLow.push(K.paint(lamp, '#2f3439', { r: 0.4, m: 0.4 }));
    const lampGlow = K.box(0.12, 0.01, 0.22, { x: H.maxX + 0.24, y: DOOR_H + 1.045, z: dk.z });
    glow.push(K.paint(lampGlow, '#fff5df', { r: 1, e: 1 }));
    const coll = physics.staticBox(0.08, DOOR_H / 2, dk.door / 2, { x: H.maxX, y: DOOR_H / 2, z: dk.z });
    doors.push({ dk, role, open: 0, coll, base: doorParts.length });
    const signY = DOOR_H + 0.9;
    const sg = new THREE.PlaneGeometry(2.4, 0.6);
    sg.rotateY(-Math.PI / 2);
    sg.translate(H.maxX - WT / 2 - 0.01, signY, dk.z);
    signs.push(K.paint(sg, '#ffffff', { r: 0.5, uvRect: atlasRect(role === 'in' ? 1024 : 1536, 0, 512, 128) }));
  }
  const secGeo = (withWin) => {
    const parts = [];
    const w = LAYOUT.inboundDock.door + 0.1;
    const body = K.roundedBox(0.045, SEC - 0.006, w, 0.01, 1);
    body.translate(0, SEC / 2, 0);
    parts.push(K.paint(body, C.door, { r: 0.45, m: 0.35 }));
    for (const y of [0.17, 0.33]) parts.push(K.paint(K.box(0.008, 0.012, w - 0.08, { x: -0.025, y, z: 0 }), '#4c535b', { r: 0.5, m: 0.35 }));
    if (withWin) for (let i = 0; i < 4; i++) {
      const z = -w / 2 + w * (i + 0.5) / 4;
      parts.push(K.paint(K.roundedBox(0.012, 0.26, 0.7, 0.03, 1).translate(-0.022, SEC / 2, z), '#202a33', { r: 0.08, m: 0.2 }));
      parts.push(K.paint(K.roundedBox(0.012, 0.26, 0.7, 0.03, 1).translate(0.022, SEC / 2, z), '#202a33', { r: 0.08, m: 0.2 }));
    }
    return K.merge(parts);
  };
  const secMat = K.vcolorMaterial('rr-door');
  const nSec = Math.round(DOOR_H / SEC);
  const plain = new THREE.InstancedMesh(secGeo(false), secMat, doors.length * (nSec - 1));
  const winM = new THREE.InstancedMesh(secGeo(true), secMat, doors.length);
  for (const m of [plain, winM]) {
    m.castShadow = true;
    m.receiveShadow = true;
    m.frustumCulled = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    root.add(m);
  }
  plain.name = 'dockDoorSections';
  const winRow = 6;
  const _mm = new THREE.Matrix4(), _qq = new THREE.Quaternion(), _pp = new THREE.Vector3(), _ss = new THREE.Vector3(1, 1, 1), ZAX = new THREE.Vector3(0, 0, 1);
  const pathAt = (s) => {
    const arcL = (Math.PI / 2) * TRACK_R;
    if (s <= DOOR_H) return [0, s, 0];
    if (s <= DOOR_H + arcL) {
      const a = (s - DOOR_H) / TRACK_R;
      return [TRACK_R - TRACK_R * Math.cos(a), DOOR_H + TRACK_R * Math.sin(a), a];
    }
    return [TRACK_R + (s - DOOR_H - arcL), DOOR_H + TRACK_R, Math.PI / 2];
  };
  const placeDoor = (d, di) => {
    let pi = 0;
    for (let i = 0; i < nSec; i++) {
      const s = i * SEC + d.open * (DOOR_H + 0.15);
      const [u, y] = pathAt(s);
      const [u2, y2] = pathAt(s + SEC);
      _pp.set(H.maxX - 0.3 - u, y, d.dk.z);
      _qq.setFromAxisAngle(ZAX, Math.atan2(u2 - u, y2 - y));
      _mm.compose(_pp, _qq, _ss);
      if (i === winRow) winM.setMatrixAt(di, _mm);
      else plain.setMatrixAt(di * (nSec - 1) + pi++, _mm);
    }
    plain.instanceMatrix.needsUpdate = true;
    winM.instanceMatrix.needsUpdate = true;
  };
  doors.forEach((d, i) => placeDoor(d, i));

  const pd = PDOOR;
  for (const z of [pd.z - pd.w / 2 - 0.04, pd.z + pd.w / 2 + 0.04]) steelLow.push(K.paint(K.box(0.16, pd.h + 0.04, 0.08, { x: H.maxX, y: (pd.h + 0.04) / 2, z }), '#9aa1a7', { r: 0.35, m: 0.6 }));
  steelLow.push(K.paint(K.box(0.16, 0.08, pd.w + 0.16, { x: H.maxX, y: pd.h + 0.04, z: pd.z }), '#9aa1a7', { r: 0.35, m: 0.6 }));
  const leafG = K.merge([
    K.paint(K.roundedBox(0.05, pd.h - 0.02, pd.w - 0.02, 0.008, 1).translate(0, (pd.h - 0.02) / 2, -(pd.w - 0.02) / 2), '#dfe2e4', { r: 0.4, m: 0.2 }),
    K.paint(K.roundedBox(0.012, 0.5, 0.36, 0.02, 1).translate(-0.026, 1.55, -0.5), '#202a33', { r: 0.08 }),
    K.paint(K.roundedBox(0.012, 0.5, 0.36, 0.02, 1).translate(0.026, 1.55, -0.5), '#202a33', { r: 0.08 }),
    K.paint(K.cyl(0.018, 0.018, 0.8, 10).rotateX(Math.PI / 2).translate(-0.09, 1.0, -0.5), '#c5cacf', { r: 0.25, m: 0.9 }),
    K.paint(K.box(0.07, 0.04, 0.04, { x: -0.06, y: 1.0, z: -0.12 }), '#c5cacf', { r: 0.25, m: 0.9 }),
    K.paint(K.box(0.07, 0.04, 0.04, { x: -0.06, y: 1.0, z: -0.88 }), '#c5cacf', { r: 0.25, m: 0.9 }),
    K.paint(K.cyl(0.012, 0.012, 0.14, 8).rotateX(Math.PI / 2).translate(0.05, 1.0, -0.86), '#c5cacf', { r: 0.25, m: 0.9 }),
  ]);
  const leafPivot = new THREE.Group();
  leafPivot.position.set(H.maxX, 0, pd.z + pd.w / 2 - 0.01);
  const leaf = new THREE.Mesh(leafG, K.vcolorMaterial('rr-pdoor'));
  leaf.castShadow = true;
  leaf.receiveShadow = true;
  leafPivot.add(leaf);
  root.add(leafPivot);
  const exitG = new THREE.PlaneGeometry(0.62, 0.31);
  exitG.rotateY(-Math.PI / 2);
  exitG.translate(H.maxX - WT / 2 - 0.02, pd.h + 0.35, pd.z);
  signs.push(K.paint(exitG, '#ffffff', { r: 0.4, e: 0.6, uvRect: atlasRect(1024, 128, 256, 128) }));
  const ext = K.merge([
    K.paint(K.cyl(0.075, 0.075, 0.5, 16, { y: 0.25 }), '#c8261d', { r: 0.35 }),
    K.paint(new THREE.SphereGeometry(0.075, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.5, 0), '#c8261d', { r: 0.35 }),
    K.paint(K.cyl(0.02, 0.02, 0.08, 8, { y: 0.6 }), '#1c1d1f', { r: 0.5 }),
    K.paint(K.box(0.08, 0.02, 0.03, { y: 0.63, z: 0.02 }), '#1c1d1f', { r: 0.5 }),
  ]);
  for (const [x, z, ry] of [[H.maxX - 0.2, pd.z - 1.0, 0], [H.minX + 0.2, 0, 0], [0, H.maxZ - 0.2, 0]]) {
    const e = ext.clone();
    e.rotateY(ry);
    e.translate(x, 0.75, z);
    steelLow.push(e);
    const br = K.box(0.05, 0.2, 0.05, { x: x + Math.sign(x) * 0.04 * (Math.abs(x) > 19 ? 1 : 0), y: 1.1, z: z + Math.sign(z) * 0.04 * (Math.abs(z) > 14 ? 1 : 0) });
    steelLow.push(K.paint(br, '#2e3338', { r: 0.5 }));
  }

  const logoW = 9, logoH = 2.25;
  const lg = new THREE.PlaneGeometry(logoW, logoH);
  lg.rotateY(Math.PI / 2);
  lg.translate(H.minX + WT / 2 + 0.02, 4.9, 0);
  signs.push(K.paint(lg, '#ffffff', { r: 0.45, uvRect: atlasRect(0, 0, 1024, 256) }));
  const gz = new THREE.PlaneGeometry(4.6, 0.575);
  gz.rotateY(Math.PI / 2);
  gz.translate(H.minX + WT / 2 + 0.02, 3.35, 0);
  signs.push(K.paint(gz, '#ffffff', { r: 0.45, uvRect: atlasRect(0, 256, 1024, 128) }));
  const lgo = new THREE.PlaneGeometry(10, 2.5);
  lgo.rotateY(Math.PI / 2);
  lgo.translate(H.maxX + WT / 2 + 0.02, 5.65, 0);
  signs.push(K.paint(lgo, '#ffffff', { r: 0.45, uvRect: atlasRect(0, 0, 1024, 256) }));
  const gzo = new THREE.PlaneGeometry(4.6, 0.575);
  gzo.rotateY(Math.PI / 2);
  gzo.translate(H.maxX + WT / 2 + 0.02, 3.9, 0);
  signs.push(K.paint(gzo, '#ffffff', { r: 0.45, uvRect: atlasRect(0, 256, 1024, 128) }));
  const zoneSign = (x, y, z, ry, i) => {
    for (const flip of [0, Math.PI]) {
      const s = new THREE.PlaneGeometry(1.8, 0.45);
      s.translate(0, 0, 0.001);
      s.rotateY(ry + flip);
      s.translate(x, y, z);
      signs.push(K.paint(s, '#ffffff', { r: 0.5, uvRect: atlasRect(1024 + (i % 2) * 512, 256 + Math.floor(i / 2) * 128, 512, 128) }));
    }
    const back = K.box(1.84, 0.49, 0.0, { x: 0, y: 0, z: 0 });
    back.rotateY(ry);
    back.translate(x, y, z);
    steelHigh.push(K.paint(back, C.dark, { r: 0.5 }));
    for (const dx of [-0.7, 0.7]) {
      const c = K.cyl(0.005, 0.005, CHORD_Y - y - 0.22, 4);
      c.translate(dx, 0, 0);
      c.rotateY(ry);
      c.translate(x, (CHORD_Y + y + 0.22) / 2, z);
      steelHigh.push(K.paint(c, '#2b2e31', { r: 0.5 }));
    }
  };
  zoneSign(BAY.cx + 3.333, 3.9, BAY.cz + 6.4, 0, 0);
  zoneSign(-3.333, 3.9, 9.3, 0, 1);
  zoneSign(6.667, 3.9, 3.0, Math.PI / 2, 2);
  zoneSign(-6.667, 3.9, -4.0, -Math.PI / 2, 3);

  const Y = C.yellow;
  const mq = (x0, x1, z0, z1, col = Y) => {
    const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
    g.rotateX(-Math.PI / 2);
    g.translate((x0 + x1) / 2, 0.0007, (z0 + z1) / 2);
    marks.push(K.paint(g, col, { r: 0.55 }));
  };
  const rect = (x0, x1, z0, z1, w = 0.1, col = Y) => {
    mq(x0, x1, z0, z0 + w, col);
    mq(x0, x1, z1 - w, z1, col);
    mq(x0, x0 + w, z0 + w, z1 - w, col);
    mq(x1 - w, x1, z0 + w, z1 - w, col);
  };
  const bx0 = BAY.cx - BAY.half - 0.25, bx1 = BAY.cx + BAY.half + 0.25, bz0 = BAY.cz - BAY.half - 0.25, bz1 = BAY.cz + BAY.half + 0.25;
  rect(bx0, bx1, bz0, bz1, 0.1);
  for (const dk of [LAYOUT.inboundDock, LAYOUT.outboundDock]) {
    const x0 = H.maxX - 4.6, x1 = H.maxX - 0.2, z0 = dk.z - 2.25, z1 = dk.z + 2.25;
    rect(x0, x1, z0, z1, 0.1);
    for (let i = 0; i < 9; i++) {
      const zz = z0 + 0.25 + i * 0.5;
      const g = new THREE.PlaneGeometry(0.12, 0.62);
      g.rotateX(-Math.PI / 2);
      g.rotateY(Math.PI / 4);
      g.translate(x0 + 0.42, 0.0008, zz);
      if (zz < z1 - 0.3) marks.push(K.paint(g, '#1b1c1e', { r: 0.55 }));
    }
    mq(x0 + 0.1, x0 + 0.75, z0 + 0.1, z1 - 0.1, Y);
  }
  const wx0 = H.maxX - 1.6, wx1 = H.maxX - 0.4;
  for (const [x0, x1] of [[wx0, wx0 + 0.08], [wx1 - 0.08, wx1]]) for (let z = -14.9; z < 14.9; z += 0.9) {
    const inDoor = [LAYOUT.inboundDock, LAYOUT.outboundDock].some((dk) => Math.abs(z - dk.z) < 2.8);
    if (!inDoor) mq(x0, x1, z, Math.min(z + 0.6, 14.9), Y);
  }
  for (let i = 0; i < 6; i++) mq(H.maxX - 3.4 + i * 0.5, H.maxX - 3.1 + i * 0.5, pd.z - 0.6, pd.z + 0.6, '#f4f4f0');
  rect(-10.6, -7.8, -9.0, 1.0, 0.08);
  rect(-7.4, 1.4, 7.4, 13.2, 0.08);
  rect(5.6, 12.4, 0.6, 7.8, 0.08);
  rect(-8.0, -6.8, 0.2, 5.8, 0.06);
  const stencil = (x, z, w, i, ry) => {
    const g = new THREE.PlaneGeometry(w, w / 8);
    g.rotateX(-Math.PI / 2);
    g.rotateY(ry);
    g.translate(x, 0.0009, z);
    stencils.push(K.paint(g, '#ffffff', { r: 0.6, uvRect: atlasRect(0, 384 + i * 128, 1024, 128) }));
  };
  for (const dk of [LAYOUT.inboundDock, LAYOUT.outboundDock]) stencil(H.maxX - 2.6, dk.z, 3.0, 4, -Math.PI / 2);

  const steelLowMesh = new THREE.Mesh(K.merge(steelLow), K.vcolorMaterial('rr-hall-steel'));
  steelLowMesh.castShadow = true;
  steelLowMesh.receiveShadow = true;
  steelLowMesh.name = 'hallSteel';
  const steelHighMesh = new THREE.Mesh(K.merge(steelHigh), steelLowMesh.material);
  steelHighMesh.receiveShadow = true;
  steelHighMesh.name = 'hallStructure';
  const wallMat = K.vcolorMaterial('rr-hall-walls', { normalMap: panelN, normalScale: new THREE.Vector2(0.6, 0.6) });
  const wallMesh = new THREE.Mesh(K.merge([...walls, ...roofParts]), wallMat);
  wallMesh.receiveShadow = true;
  wallMesh.name = 'hallWalls';
  const glassMesh = new THREE.Mesh(K.merge(glass), new THREE.MeshStandardMaterial({ color: '#cfe0ee', roughness: 0.05, metalness: 0.2, emissive: '#b9d3ea', emissiveIntensity: 0.55 }));
  glassMesh.name = 'hallGlass';
  const glowMesh = new THREE.Mesh(K.merge(glow), new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, side: THREE.DoubleSide }));
  glowMesh.material.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = pow( diffuseColor.rgb, vec3( 2.2 ) ) * 1.6;');
  };
  glowMesh.name = 'hallGlow';
  const signMesh = new THREE.Mesh(K.merge(signs), K.vcolorMaterial('rr-hall-signs', { map: signTex }));
  signMesh.receiveShadow = true;
  signMesh.name = 'hallSigns';
  const markMesh = new THREE.Mesh(K.merge(marks), K.vcolorMaterial('rr-hall-marks', { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  markMesh.receiveShadow = true;
  markMesh.name = 'hallMarkings';
  signMesh.material.polygonOffset = true;
  signMesh.material.polygonOffsetFactor = -2;
  signMesh.material.polygonOffsetUnits = -2;
  const stencilMesh = new THREE.Mesh(K.merge(stencils), K.vcolorMaterial('rr-hall-stencil', { map: signTex, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
  stencilMesh.receiveShadow = true;
  stencilMesh.name = 'hallStencils';
  root.add(steelLowMesh, steelHighMesh, wallMesh, glassMesh, glowMesh, signMesh, markMesh, stencilMesh);

  const wallColl = (ax, plane, lo, hi, holes) => {
    for (const [a0, a1, top] of segmentsAlong(lo, hi, holes)) {
      const y0 = top, y1 = 8.6;
      const c = { x: 0, y: (y0 + y1) / 2, z: 0 };
      if (ax === 'x') { c.x = plane; c.z = (a0 + a1) / 2; physics.staticBox(0.15, (y1 - y0) / 2, (a1 - a0) / 2, c); }
      else { c.z = plane; c.x = (a0 + a1) / 2; physics.staticBox((a1 - a0) / 2, (y1 - y0) / 2, 0.15, c); }
    }
  };
  wallColl('z', H.minZ - 0.04, H.minX - 0.2, H.maxX + 0.2, []);
  wallColl('z', H.maxZ + 0.04, H.minX - 0.2, H.maxX + 0.2, []);
  wallColl('x', H.minX - 0.04, H.minZ, H.maxZ, []);
  wallColl('x', H.maxX + 0.1, H.minZ, H.maxZ, doorHoles);

  const _pv = new THREE.Vector3();
  let pdOpen = 0;
  const sys = {
    update(dt) {
      for (let i = 0; i < doors.length; i++) {
        const d = doors[i];
        const t = game.trucks?.find((k) => k.dock === d.dk);
        const want = t && OPEN_STATES.has(t.state) ? 1 : 0;
        if (Math.abs(want - d.open) > 1e-4) {
          d.open = want > d.open ? Math.min(1, d.open + dt * 0.24) : Math.max(0, d.open - dt * 0.2);
          placeDoor(d, i);
        }
        const blocked = d.open < 0.55;
        if (d.coll.isEnabled() !== blocked) d.coll.setEnabled(blocked);
      }
      const ps = game.players?.length ? game.players : game.player ? [game.player] : [];
      let near = false;
      for (const p of ps) {
        const f = p.feet ?? p.position;
        if (!f) continue;
        _pv.set(H.maxX, 0, pd.z);
        if (Math.hypot(f.x - _pv.x, f.z - _pv.z) < 1.9) near = true;
      }
      pdOpen += ((near ? 1 : 0) - pdOpen) * Math.min(1, dt * 5);
      leafPivot.rotation.y = -pdOpen * 1.65;
    },
  };
  game.engine.add(sys, 30);
  game.hall = { root, doors, sys };
  return game.hall;
}
