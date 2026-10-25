// Rug Rush stations: longspan product shelving, tool bench with shadow board, stainless drying racks, industrial dryer, dumpster, supply computer and dispatch post.
import * as THREE from 'three';
import { R, GROUP, groups } from '../core/physics.js';
import { LAYOUT } from './layout.js';
import { STARTING_STOCK, STARTING_TOOLS } from '../data/products.js';
import { spawnProduct, spawnTool } from '../tools/items.js';
import { buildHall } from './hall.js';
import * as K from './kit.js';

const UP = new THREE.Vector3(0, 1, 0);
const BLUE = '#2763b0', ORANGE = '#ee7a1c', GALV = '#b9bfc4', STAINLESS = '#d7dbde', GRAPHITE = '#394047', YELLOW = '#f2c230';

function coll(game, sx, sy, sz, pos, quat = null, owner = null) {
  const d = R.ColliderDesc.cuboid(sx / 2, sy / 2, sz / 2).setTranslation(pos.x, pos.y, pos.z).setFriction(0.8).setCollisionGroups(groups(GROUP.STATIC));
  if (quat) d.setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w });
  return game.physics.addCollider(d, null, owner);
}

function tubeBetween(a, b, r, segs = 10) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const d = B.clone().sub(A);
  const g = new THREE.CylinderGeometry(r, r, d.length(), segs);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()));
  g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
  return g;
}

function screenTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 320;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 320);
  gr.addColorStop(0, '#13233b');
  gr.addColorStop(1, '#0b1626');
  g.fillStyle = gr;
  g.fillRect(0, 0, 512, 320);
  g.fillStyle = '#e8452c';
  g.fillRect(24, 22, 10, 30);
  g.fillStyle = '#ffffff';
  g.font = '900 30px "Arial Black", "Helvetica Neue", sans-serif';
  g.fillText('RUG RUSH', 44, 48);
  g.fillStyle = '#7fb4e6';
  g.font = '600 18px "Helvetica Neue", Arial, sans-serif';
  g.fillText('Supplies & equipment', 232, 46);
  const cols = ['#2f7fd8', '#6fbf73', '#f2d33c', '#e8792b', '#9fd8ff', '#ff7aa8', '#a98be0', '#cbb99a'];
  for (let i = 0; i < 8; i++) {
    const x = 24 + (i % 4) * 118, y = 78 + Math.floor(i / 4) * 92;
    g.fillStyle = '#1c3150';
    g.fillRect(x, y, 106, 80);
    g.fillStyle = cols[i];
    g.fillRect(x + 38, y + 12, 30, 44);
    g.fillStyle = '#ffffff';
    g.fillRect(x + 46, y + 6, 14, 8);
    g.fillStyle = '#9fb3cc';
    g.fillRect(x + 12, y + 64, 82, 6);
  }
  g.fillStyle = '#e8452c';
  g.fillRect(24, 270, 464, 34);
  g.fillStyle = '#ffffff';
  g.font = '700 20px "Helvetica Neue", Arial, sans-serif';
  g.textAlign = 'center';
  g.fillText('Press E to order · delivery to the side door', 256, 294);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function shelving(parts, game, s, shelfSlots) {
  const q = new THREE.Quaternion().setFromAxisAngle(UP, s.rotY);
  const at = (x, y, z) => new THREE.Vector3(x, y, z).applyQuaternion(q).add(new THREE.Vector3(s.x, 0, s.z));
  const local = [];
  for (const x of [-2, 2]) for (const z of [-0.3, 0.3]) {
    local.push(K.paint(K.box(0.07, 2.2, 0.05, { x, y: 1.1, z }), BLUE, { r: 0.42, m: 0.3, shade: (px, py) => (Math.floor(py / 0.05) % 2 ? 0.8 : 1) }));
    local.push(K.paint(K.box(0.12, 0.012, 0.1, { x, y: 0.006, z }), '#8d949a', { r: 0.5, m: 0.6 }));
    local.push(K.paint(K.box(0.075, 0.01, 0.055, { x, y: 2.205, z }), '#1c1d1f', { r: 0.7 }));
    coll(game, 0.06, 2.0, 0.06, at(x, 1.0, z), q);
  }
  for (const x of [-2, 2]) {
    for (let k = 0; k < 5; k++) {
      const y0 = 0.15 + k * 0.4, y1 = y0 + 0.4;
      local.push(K.paint(tubeBetween([x, y0, -0.28], [x, y1, 0.28], 0.012, 6), BLUE, { r: 0.42, m: 0.3 }));
      local.push(K.paint(tubeBetween([x, y0, -0.28], [x, y0, 0.28], 0.012, 6), BLUE, { r: 0.42, m: 0.3 }));
    }
  }
  for (const y of [0.12, 0.62, 1.12, 1.62]) {
    for (const z of [-0.315, 0.315]) {
      local.push(K.paint(K.box(3.93, 0.1, 0.045, { x: 0, y: y - 0.03, z }), ORANGE, { r: 0.4, m: 0.25 }));
      for (const x of [-1.95, 1.95]) local.push(K.paint(K.box(0.03, 0.14, 0.05, { x, y: y - 0.03, z }), '#c25f12', { r: 0.45, m: 0.3 }));
    }
    local.push(K.paint(K.box(3.92, 0.012, 0.6, { x: 0, y: y + 0.014, z: 0 }), GALV, { r: 0.42, m: 0.65, shade: (px, py, pz) => 0.92 + 0.08 * Math.sin(pz * 120) }));
    for (const x of [-1.3, 0, 1.3]) local.push(K.paint(K.box(0.04, 0.03, 0.6, { x, y: y - 0.008, z: 0 }), '#9aa1a7', { r: 0.45, m: 0.6 }));
    coll(game, 4.1, 0.04, 0.62, at(0, y, 0), q);
    if (y > 0.2) for (let i = 0; i < 9; i++) {
      shelfSlots.push({ pos: at(-1.75 + i * 0.44, y + 0.02, 0.02), yaw: s.rotY + Math.PI });
    }
  }
  for (const g of local) {
    g.applyQuaternion(q);
    g.translate(s.x, 0, s.z);
    parts.push(g);
  }
}

function toolBench(parts, game, tx, tz) {
  const top = K.roundedBox(0.8, 0.05, 2.4, 0.008, 1);
  top.translate(tx, 0.82, tz);
  parts.push(K.paint(top, '#c99a63', { r: 0.55, shade: (x, y, z) => 0.9 + 0.1 * Math.sin(z * 9 + Math.sin(x * 31) * 0.6) }));
  coll(game, 0.8, 0.05, 2.4, new THREE.Vector3(tx, 0.82, tz));
  for (const [dx, dz] of [[-0.35, -1.1], [0.35, -1.1], [-0.35, 1.1], [0.35, 1.1]]) {
    parts.push(K.paint(K.box(0.05, 0.8, 0.05, { x: tx + dx, y: 0.4, z: tz + dz }), '#4b525a', { r: 0.45, m: 0.4 }));
    coll(game, 0.05, 0.8, 0.05, new THREE.Vector3(tx + dx, 0.4, tz + dz));
    parts.push(K.paint(K.box(0.07, 0.015, 0.07, { x: tx + dx, y: 0.008, z: tz + dz }), '#1c1d1f', { r: 0.8 }));
  }
  for (const dz of [-1.1, 1.1]) parts.push(K.paint(K.box(0.7, 0.04, 0.04, { x: tx, y: 0.16, z: tz + dz }), '#4b525a', { r: 0.45, m: 0.4 }));
  parts.push(K.paint(K.box(0.7, 0.018, 2.18, { x: tx, y: 0.18, z: tz }), '#5f666d', { r: 0.6, m: 0.3 }));
  parts.push(K.paint(K.box(0.04, 0.05, 2.25, { x: tx + 0.42, y: 0.79, z: tz }), '#4b525a', { r: 0.45, m: 0.4 }));
  const bx = tx - 0.43;
  for (const dz of [-1.18, 1.18]) parts.push(K.paint(K.box(0.05, 1.3, 0.05, { x: bx, y: 1.45, z: tz + dz }), '#4b525a', { r: 0.45, m: 0.4 }));
  parts.push(K.paint(K.box(0.02, 1.15, 2.32, { x: bx, y: 1.45, z: tz }), '#e9eaea', { r: 0.7, shade: (x, y, z) => ((Math.round(y / 0.025) + Math.round(z / 0.025)) % 2 ? 1 : 0.97) }));
  coll(game, 0.03, 1.2, 2.4, new THREE.Vector3(bx, 1.45, tz));
  const outlines = [[0.21, 0.09], [0.21, 0.09], [0.21, 0.09], [0.06, 0.16], [0.13, 0.24], [0.05, 0.18]];
  outlines.forEach(([w, h], i) => {
    const z = tz - 0.95 + i * 0.38;
    const g = K.roundedBox(0.004, h + 0.03, w + 0.03, 0.012, 1);
    g.translate(bx + 0.012, 1.25, z);
    parts.push(K.paint(g, '#41474e', { r: 0.8 }));
    parts.push(K.paint(K.cyl(0.006, 0.006, 0.06, 6).rotateZ(Math.PI / 2).translate(bx + 0.04, 1.25 + h / 2 + 0.05, z), '#b9bfc4', { r: 0.3, m: 0.9 }));
  });
  parts.push(K.paint(K.box(0.01, 0.12, 2.0, { x: bx + 0.012, y: 1.95, z: tz }), YELLOW, { r: 0.5 }));
}

function dryingRack(parts, game, r) {
  for (const dx of [-1.75, 1.75]) {
    const x = r.x + dx;
    for (const s of [-1, 1]) parts.push(K.paint(tubeBetween([x, 1.6, r.z], [x, 0.03, r.z + s * 0.42], 0.022, 12), STAINLESS, { r: 0.22, m: 0.92 }));
    parts.push(K.paint(tubeBetween([x, 0.035, r.z - 0.45], [x, 0.035, r.z + 0.45], 0.02, 10), STAINLESS, { r: 0.22, m: 0.92 }));
    for (const s of [-1, 1]) parts.push(K.paint(K.box(0.05, 0.02, 0.06, { x, y: 0.01, z: r.z + s * 0.45 }), '#1c1d1f', { r: 0.85 }));
    parts.push(K.paint(tubeBetween([x, 0.6, r.z - 0.27], [x, 0.6, r.z + 0.27], 0.014, 8), STAINLESS, { r: 0.25, m: 0.9 }));
    const cap = new THREE.SphereGeometry(0.045, 14, 10);
    cap.translate(x, 1.6, r.z);
    parts.push(K.paint(cap, '#bfc4c8', { r: 0.25, m: 0.9 }));
    coll(game, 0.06, 1.6, 0.06, new THREE.Vector3(x, 0.8, r.z));
    coll(game, 0.06, 0.04, 0.9, new THREE.Vector3(x, 0.02, r.z));
  }
  const bar = K.cyl(0.03, 0.03, 3.6, 20);
  bar.rotateZ(Math.PI / 2);
  bar.translate(r.x, 1.6, r.z);
  parts.push(K.paint(bar, '#e3e6e8', { r: 0.14, m: 0.96 }));
  game.physics.addCollider(R.ColliderDesc.capsule(1.8, 0.03).setRotation({ x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 }).setTranslation(r.x, 1.6, r.z).setFriction(1).setCollisionGroups(groups(GROUP.STATIC)));
}

function rotorGeometry() {
  const parts = [];
  const hub = K.cyl(0.075, 0.075, 0.08, 20);
  hub.rotateX(Math.PI / 2);
  parts.push(K.paint(hub, '#2a2d31', { r: 0.4, m: 0.6 }));
  for (let i = 0; i < 5; i++) {
    const b = K.extrude([[0.06, -0.05], [0.44, -0.11], [0.47, 0.0, 0.44, 0.1], [0.06, 0.05]], 0.012, { bevel: 0.003, bevelSegs: 1, curveSegs: 6 });
    b.rotateX(0.35);
    b.rotateZ((i / 5) * Math.PI * 2);
    parts.push(K.paint(b, '#c3c8cc', { r: 0.3, m: 0.85 }));
  }
  return K.merge(parts);
}

function dryer(parts, game, root, d) {
  const x = d.x, z = d.z;
  const body = K.roundedBox(2.4, 1.55, 0.7, 0.06, 3);
  body.translate(x, 0.97, z);
  parts.push(K.paint(body, GRAPHITE, { r: 0.42, m: 0.35 }));
  const circ = (cx) => {
    const pts = [];
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      pts.push([cx + Math.cos(a) * 0.5, Math.sin(a) * 0.5]);
    }
    return pts;
  };
  const face = K.extrude([[-1.15, -0.71], [1.15, -0.71], [1.15, 0.71], [-1.15, 0.71]], 0.02, { bevel: 0.004, bevelSegs: 1, curveSegs: 4, holes: [circ(-0.6), circ(0.6)] });
  face.translate(x, 0.97, z - 0.355);
  parts.push(K.paint(face, '#c9ced2', { r: 0.3, m: 0.85 }));
  const rotorG = rotorGeometry();
  const rotorMat = K.vcolorMaterial('rr-dryer-rotor');
  const fans = [];
  for (const fx of [-0.6, 0.6]) {
    const shroud = K.lathe([[0.52, -0.02], [0.5, 0.0], [0.5, 0.18]], { segs: 40 });
    shroud.rotateX(-Math.PI / 2);
    shroud.translate(x + fx, 0.97, z - 0.37);
    parts.push(K.paint(shroud, '#1a1c1f', { r: 0.6 }));
    const back = new THREE.CircleGeometry(0.5, 40);
    back.rotateY(Math.PI);
    back.translate(x + fx, 0.97, z - 0.2);
    parts.push(K.paint(back, '#141517', { r: 0.8 }));
    for (const rr of [0.12, 0.22, 0.32, 0.42, 0.5]) {
      const ring = new THREE.TorusGeometry(rr, 0.006, 6, 48);
      ring.translate(x + fx, 0.97, z - 0.385);
      parts.push(K.paint(ring, '#d8dcdf', { r: 0.25, m: 0.95 }));
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      parts.push(K.paint(tubeBetween([x + fx, 0.97, z - 0.385], [x + fx + Math.cos(a) * 0.5, 0.97 + Math.sin(a) * 0.5, z - 0.385], 0.006, 6), '#d8dcdf', { r: 0.25, m: 0.95 }));
    }
    const rotor = new THREE.Mesh(rotorG, rotorMat);
    rotor.position.set(x + fx, 0.97, z - 0.3);
    rotor.name = 'dryerRotor';
    root.add(rotor);
    fans.push(rotor);
  }
  for (let i = 0; i < 9; i++) parts.push(K.paint(K.box(0.012, 0.04, 0.6, { x: x + 1.205, y: 0.55 + i * 0.09, z }), '#2a2f35', { r: 0.6 }));
  const panel = K.roundedBox(0.36, 0.3, 0.05, 0.02, 2);
  panel.translate(x + 0.8, 1.6, z - 0.37);
  parts.push(K.paint(panel, '#24282d', { r: 0.4 }));
  parts.push(K.paint(K.box(0.2, 0.08, 0.004, { x: x + 0.78, y: 1.64, z: z - 0.397 }), '#5dff9a', { r: 0.3, e: 0.8 }));
  for (const [bx, col] of [[0.7, '#2fbf55'], [0.86, '#d42a20']]) parts.push(K.paint(K.cyl(0.022, 0.022, 0.02, 14).rotateX(Math.PI / 2).translate(x + bx, 1.53, z - 0.4), col, { r: 0.35 }));
  parts.push(K.paint(tubeBetween([x - 0.9, 1.82, z + 0.1], [x + 0.9, 1.82, z + 0.1], 0.02, 10), '#c3c8cc', { r: 0.25, m: 0.9 }));
  for (const s of [-1, 1]) parts.push(K.paint(K.box(0.04, 0.1, 0.04, { x: x + s * 0.9, y: 1.78, z: z + 0.1 }), '#c3c8cc', { r: 0.25, m: 0.9 }));
  for (const [dx, dz] of [[-1.05, -0.25], [1.05, -0.25], [-1.05, 0.25], [1.05, 0.25]]) {
    parts.push(K.paint(K.box(0.08, 0.05, 0.06, { x: x + dx, y: 0.165, z: z + dz }), '#4b525a', { r: 0.4, m: 0.5 }));
    parts.push(K.paint(K.cyl(0.07, 0.07, 0.045, 16).rotateZ(Math.PI / 2).translate(x + dx, 0.07, z + dz), '#1a1b1d', { r: 0.8 }));
  }
  game.physics.addCollider(R.ColliderDesc.cuboid(1.2, 0.95, 0.35).setTranslation(x, 0.95, z).setCollisionGroups(groups(GROUP.STATIC)));
  game.dryers.push({ pos: new THREE.Vector3(x, 1.0, z - 0.4), dir: new THREE.Vector3(0, 0, -1), range: 7, cos: Math.cos(0.75), power: 5, on: true, fans });
  return fans;
}

function dumpster(parts, game, tr) {
  const bw = 1.8, bd = 1.2, bh = 1.1, col = '#2f7d4f';
  const walls = [
    [bw, 0.06, bd, 0, 0.03, 0],
    [bw, bh, 0.06, 0, bh / 2, -bd / 2],
    [bw, bh, 0.06, 0, bh / 2, bd / 2],
    [0.06, bh, bd, -bw / 2, bh / 2, 0],
    [0.06, bh, bd, bw / 2, bh / 2, 0],
  ];
  for (const [sx, sy, sz, x, y, z] of walls) {
    parts.push(K.paint(K.box(sx, sy, sz, { x: tr.x + x, y, z: tr.z + z }), col, { r: 0.5, m: 0.25 }));
    coll(game, sx, sy, sz, new THREE.Vector3(tr.x + x, y, tr.z + z));
  }
  for (const z of [-bd / 2 - 0.035, bd / 2 + 0.035]) for (let i = 0; i < 6; i++) {
    const x = -bw / 2 + 0.2 + i * 0.28;
    parts.push(K.paint(K.box(0.05, bh - 0.12, 0.03, { x: tr.x + x, y: bh / 2 + 0.02, z: tr.z + z }), '#286b43', { r: 0.5, m: 0.25 }));
  }
  parts.push(K.paint(K.box(bw + 0.12, 0.06, 0.08, { x: tr.x, y: bh + 0.01, z: tr.z - bd / 2 }), '#286b43', { r: 0.5, m: 0.3 }));
  parts.push(K.paint(K.box(bw + 0.12, 0.06, 0.08, { x: tr.x, y: bh + 0.01, z: tr.z + bd / 2 }), '#286b43', { r: 0.5, m: 0.3 }));
  parts.push(K.paint(K.box(0.08, 0.06, bd + 0.12, { x: tr.x - bw / 2, y: bh + 0.01, z: tr.z }), '#286b43', { r: 0.5, m: 0.3 }));
  parts.push(K.paint(K.box(0.08, 0.06, bd + 0.12, { x: tr.x + bw / 2, y: bh + 0.01, z: tr.z }), '#286b43', { r: 0.5, m: 0.3 }));
  for (const s of [-1, 1]) {
    const lid = K.roundedBox(bw / 2 - 0.02, 0.04, bd + 0.1, 0.015, 1);
    lid.translate(0, 0, (bd + 0.1) / 2);
    lid.rotateX(-2.2);
    lid.translate(tr.x + s * (bw / 4), bh + 0.05, tr.z - bd / 2 - 0.05);
    parts.push(K.paint(lid, '#1d2a22', { r: 0.6 }));
  }
  for (const s of [-1, 1]) parts.push(K.paint(K.box(0.3, 0.12, 0.05, { x: tr.x + s * 0.5, y: 0.45, z: tr.z + bd / 2 + 0.06 }), '#1d2a22', { r: 0.6 }));
  game.trashZone = { min: new THREE.Vector3(tr.x - bw / 2, 0, tr.z - bd / 2), max: new THREE.Vector3(tr.x + bw / 2, bh + 0.4, tr.z + bd / 2) };
}

function computerDesk(parts, game, root, c) {
  const top = K.roundedBox(0.7, 0.04, 1.3, 0.008, 1);
  top.translate(c.x, 0.76, c.z);
  parts.push(K.paint(top, '#f1f1ee', { r: 0.4 }));
  coll(game, 0.7, 0.05, 1.3, new THREE.Vector3(c.x, 0.76, c.z));
  for (const dz of [-0.6, 0.6]) {
    parts.push(K.paint(K.box(0.6, 0.74, 0.035, { x: c.x, y: 0.37, z: c.z + dz }), '#4b525a', { r: 0.45, m: 0.4 }));
    coll(game, 0.6, 0.74, 0.04, new THREE.Vector3(c.x, 0.37, c.z + dz));
  }
  parts.push(K.paint(K.box(0.02, 0.3, 1.16, { x: c.x - 0.28, y: 0.55, z: c.z }), '#4b525a', { r: 0.45, m: 0.4 }));
  const shopOwner = { kind: 'computer', label: 'Supply computer', interactVerb: 'order supplies', interact: () => game.shop?.open() };
  const mx = c.x - 0.1;
  const bezel = K.roundedBox(0.03, 0.42, 0.68, 0.012, 2);
  bezel.translate(mx, 1.06, c.z);
  parts.push(K.paint(bezel, '#18191b', { r: 0.35, m: 0.3 }));
  parts.push(K.paint(K.box(0.03, 0.2, 0.05, { x: mx - 0.05, y: 0.88, z: c.z }), '#9aa1a7', { r: 0.3, m: 0.8 }));
  parts.push(K.paint(K.roundedBox(0.2, 0.012, 0.24, 0.005, 1).translate(mx - 0.04, 0.786, c.z), '#9aa1a7', { r: 0.3, m: 0.8 }));
  coll(game, 0.06, 0.42, 0.66, new THREE.Vector3(mx, 1.05, c.z), null, shopOwner);
  parts.push(K.paint(K.roundedBox(0.16, 0.015, 0.44, 0.005, 1).translate(c.x + 0.12, 0.787, c.z), '#26282b', { r: 0.6 }));
  for (let i = 0; i < 5; i++) parts.push(K.paint(K.box(0.12, 0.004, 0.4, { x: c.x + 0.12, y: 0.797, z: c.z }).translate(0, 0, 0), '#3a3d42', { r: 0.7, shade: () => 0.9 + i * 0.02 }));
  parts.push(K.paint(K.roundedBox(0.1, 0.03, 0.06, 0.012, 2).translate(c.x + 0.14, 0.79, c.z + 0.34), '#26282b', { r: 0.5 }));
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.37), new THREE.MeshBasicMaterial({ map: screenTexture(), toneMapped: false }));
  screen.material.color.setScalar(0.85);
  screen.position.set(mx + 0.0165, 1.065, c.z);
  screen.rotation.y = Math.PI / 2;
  screen.userData.owner = shopOwner;
  root.add(screen);
}

function dispatchPost(parts, game) {
  const od = LAYOUT.outboundDock;
  const x = od.x - 1.4, z = od.z - 2.9;
  const dispatch = {
    kind: 'button',
    label: 'Outbound truck: dispatch now',
    interactVerb: 'dispatch',
    interact: () => {
      const t = game.trucks?.find((k) => k.role === 'out');
      if (!t || !t.isOpen) return game.hud?.toast('No outbound truck at the dock.');
      const n = t.carpetsInside().filter((k) => k.wrapped).length;
      if (!n) return game.hud?.toast('Load at least one wrapped rug first.');
      t.dispatchRequested = true;
    },
  };
  parts.push(K.paint(K.box(0.12, 1.2, 0.12, { x, y: 0.6, z }), YELLOW, { r: 0.45, shade: (px, py) => (Math.floor((py + px * 0.3) / 0.12) % 2 ? 0.14 : 1) }));
  parts.push(K.paint(K.box(0.3, 0.02, 0.3, { x, y: 0.01, z }), '#4b525a', { r: 0.5, m: 0.5 }));
  coll(game, 0.14, 1.2, 0.14, new THREE.Vector3(x, 0.6, z));
  const box = K.roundedBox(0.3, 0.3, 0.2, 0.025, 2);
  box.translate(x, 1.3, z);
  parts.push(K.paint(box, '#d8dcdf', { r: 0.4, m: 0.2 }));
  parts.push(K.paint(K.box(0.012, 0.22, 0.17, { x: x - 0.152, y: 1.3, z }), YELLOW, { r: 0.45 }));
  parts.push(K.paint(K.cyl(0.05, 0.05, 0.03, 20).rotateZ(Math.PI / 2).translate(x - 0.17, 1.3, z), '#1d1e20', { r: 0.6 }));
  const mush = new THREE.SphereGeometry(0.055, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  mush.rotateZ(Math.PI / 2);
  mush.translate(x - 0.185, 1.3, z);
  parts.push(K.paint(mush, '#1fae4f', { r: 0.3, e: 0.25 }));
  coll(game, 0.3, 0.3, 0.2, new THREE.Vector3(x, 1.3, z), null, dispatch);
  parts.push(K.paint(K.box(0.02, 0.1, 0.26, { x: x - 0.01, y: 1.52, z }), '#16223a', { r: 0.5 }));
}

export function buildStations(game) {
  buildHall(game);
  const root = new THREE.Group();
  root.name = 'stations';
  game.engine.scene.add(root);
  const parts = [];
  const shelfSlots = [];
  for (const s of LAYOUT.shelves) shelving(parts, game, s, shelfSlots);
  const stock = [];
  for (const [id, n] of Object.entries(STARTING_STOCK)) for (let k = 0; k < n; k++) stock.push(id);
  for (let si = 0; si < stock.length; si++) {
    const slot = shelfSlots[Math.floor((si * shelfSlots.length) / stock.length)];
    const p = slot.pos.clone();
    p.y += 0.2;
    spawnProduct(game, stock[si], p, slot.yaw);
  }
  const tx = -8.6, tz = 3.2;
  toolBench(parts, game, tx, tz);
  const small = STARTING_TOOLS.filter((t) => ['brushSoft', 'brushStiff', 'brushRubber', 'scraper', 'iron', 'uvlamp'].includes(t));
  small.forEach((t, i) => spawnTool(game, t, new THREE.Vector3(tx, 1.0, tz - 0.95 + i * 0.38), Math.PI / 2));
  const big = STARTING_TOOLS.filter((t) => !small.includes(t));
  big.forEach((t, i) => spawnTool(game, t, new THREE.Vector3(-7.4, 0.5, 5.2 - i * 0.9), Math.PI / 2));
  for (const r of LAYOUT.dryingRacks) dryingRack(parts, game, r);
  const fans = dryer(parts, game, root, LAYOUT.dryer);
  dumpster(parts, game, LAYOUT.trash);
  computerDesk(parts, game, root, LAYOUT.computer);
  dispatchPost(parts, game);
  const mesh = new THREE.Mesh(K.merge(parts), K.vcolorMaterial('rr-stations'));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = 'stationProps';
  root.add(mesh);
  const hide = game.fluids?.floor?.reflectionHide;
  const sc = game.engine.scene;
  if (hide) for (const n of ['hallFloorTiles', 'hallFloorFar', 'hallFloorGrout', 'apron', 'yardAsphalt', 'grass', 'yardLines', 'hallMarkings', 'hallStencils']) {
    const o = sc.getObjectByName(n);
    if (o && !hide.includes(o)) hide.push(o);
  }
  return { root, fans };
}
