// Rug Rush trucks: kinematic box trucks that drive in, reverse to a dock, roll up the rear door and lower a tail lift, then leave.
import * as THREE from 'three';
import { R, GROUP, groups } from '../core/physics.js';
import * as K from '../world/kit.js';

const LEN = 7.5;
const BED = 0.62;
const BOX = { x0: -3.75, x1: 1.75, hz: 1.25, h: 2.3 };
const SLATS = 10;
const SLAT_H = BOX.h / SLATS;
const CURVE_R = 0.16;
const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);
const ZAX = new THREE.Vector3(0, 0, 1);
const _sa = new THREE.Vector3();
const _sb = new THREE.Vector3();
let liftMat = null;
let slatMat = null;
const sideTexCache = new Map();

function sideTexture(role) {
  if (sideTexCache.has(role)) return sideTexCache.get(role);
  const inb = role === 'in';
  const col = inb ? '#1f5fb8' : '#1d8a4c', dark = inb ? '#0f2f5f' : '#0f4a28';
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 432;
  const g = c.getContext('2d');
  g.fillStyle = '#f5f6f4';
  g.fillRect(0, 0, 1024, 432);
  g.fillStyle = col;
  g.beginPath();
  g.moveTo(0, 432);
  g.lineTo(0, 300);
  g.bezierCurveTo(300, 250, 620, 380, 1024, 300);
  g.lineTo(1024, 432);
  g.closePath();
  g.fill();
  g.fillStyle = dark;
  g.beginPath();
  g.moveTo(0, 432);
  g.lineTo(0, 360);
  g.bezierCurveTo(320, 320, 650, 430, 1024, 370);
  g.lineTo(1024, 432);
  g.closePath();
  g.fill();
  g.save();
  g.translate(150, 165);
  g.fillStyle = inb ? '#8a3b2b' : '#2d6aa8';
  g.beginPath();
  g.ellipse(0, 0, 58, 58, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = inb ? '#d9a35a' : '#e8c46a';
  g.lineWidth = 7;
  for (let r = 14; r < 56; r += 12) {
    g.beginPath();
    g.arc(0, 0, r, 0.3, Math.PI * 1.7);
    g.stroke();
  }
  g.fillStyle = inb ? '#a94a36' : '#3a7cc0';
  g.fillRect(0, -58, 170, 116);
  g.fillStyle = inb ? '#d9a35a' : '#e8c46a';
  for (let i = 0; i < 5; i++) g.fillRect(20 + i * 30, -58, 8, 116);
  g.restore();
  g.fillStyle = col;
  g.font = '900 104px "Arial Black", "Helvetica Neue", Impact, sans-serif';
  g.textBaseline = 'alphabetic';
  g.fillText(inb ? 'GZOWO' : 'CLEAN RUG', 360, 160);
  g.fillStyle = dark;
  g.font = '800 56px "Helvetica Neue", Arial, sans-serif';
  g.fillText(inb ? 'RUG LOGISTICS' : 'EXPRESS', 364, 224);
  g.fillStyle = '#ffffff';
  g.font = '600 34px "Helvetica Neue", Arial, sans-serif';
  g.fillText(inb ? 'dirty rugs in · since 2012' : 'clean rugs out · same day', 40, 410);
  g.textAlign = 'right';
  g.fillText('gzowo.fun', 990, 410);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  sideTexCache.set(role, t);
  return t;
}

function chequerTextures() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = 'rgb(128,128,255)';
  g.fillRect(0, 0, 128, 128);
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
    const x = i * 32 + 16, y = j * 32 + 16;
    g.save();
    g.translate(x, y);
    g.rotate((i + j) % 2 ? Math.PI / 4 : -Math.PI / 4);
    g.fillStyle = 'rgb(170,128,230)';
    g.fillRect(-11, -3, 11, 6);
    g.fillStyle = 'rgb(86,128,230)';
    g.fillRect(0, -3, 11, 6);
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(6, 8);
  return t;
}

function wheelGeo(dual) {
  const parts = [];
  const w = dual ? 0.5 : 0.26;
  const tire = K.lathe([[0.2, -w / 2], [0.3, -w / 2], [0.335, -w / 2 + 0.03], [0.34, 0], [0.335, w / 2 - 0.03], [0.3, w / 2], [0.2, w / 2]], { segs: 28 });
  parts.push(K.paint(tire, '#161718', { r: 0.9 }));
  if (dual) parts.push(K.paint(K.cyl(0.338, 0.338, 0.02, 28), '#0c0c0d', { r: 0.95 }));
  for (const s of [-1, 1]) {
    const rim = K.lathe([[0.2, s * w / 2], [0.17, s * (w / 2 - 0.02)], [0.07, s * (w / 2 - 0.05)], [0.0, s * (w / 2 - 0.05)]].sort((a, b) => a[1] - b[1]), { segs: 24 });
    parts.push(K.paint(rim, '#c5cacf', { r: 0.3, m: 0.85 }));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      parts.push(K.paint(K.cyl(0.012, 0.012, 0.02, 6).translate(Math.cos(a) * 0.11, s * (w / 2 - 0.045), Math.sin(a) * 0.11), '#8d949a', { r: 0.3, m: 0.9 }));
    }
  }
  const g = K.merge(parts);
  g.rotateX(Math.PI / 2);
  return g;
}

function slatGeometry() {
  const parts = [];
  const body = K.roundedBox(0.03, SLAT_H - 0.004, BOX.hz * 2 - 0.06, 0.008, 1);
  body.translate(0, SLAT_H / 2, 0);
  parts.push(K.paint(body, '#e9ebea', { r: 0.4, m: 0.3 }));
  parts.push(K.paint(K.box(0.006, 0.01, BOX.hz * 2 - 0.1, { x: -0.016, y: 0.004, z: 0 }), '#a7acb0', { r: 0.4, m: 0.6 }));
  return K.merge(parts);
}

function bezier(p0, p1, p2, p3, t, out) {
  const u = 1 - t;
  return out.set(
    u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    0,
    u * u * u * p0.z + 3 * u * u * t * p1.z + 3 * u * t * t * p2.z + t * t * t * p3.z,
  );
}

export class Truck {
  constructor(game, { dock, role }) {
    this.game = game;
    this.kind = 'truck';
    this.role = role;
    this.dock = dock;
    this.capacity = 3;
    this.state = 'away';
    this.t = 0;
    this.wait = role === 'in' ? 1 : 6;
    this.door = 0;
    this.ramp = 0;
    this.pos = new THREE.Vector3(70, 0, dock.z);
    this.yaw = 0;
    this.cargo = [];
    this.emptyTime = 0;
    this.trips = 0;
    this.parkX = dock.x + 0.35 - BOX.x0;
    this.buildMesh();
    this.buildBody();
    this.visible(false);
  }

  buildMesh() {
    const g = new THREE.Group();
    const inb = this.role === 'in';
    const color = inb ? '#1f5fb8' : '#1d8a4c';
    const parts = [];
    const P = (geo, col, o = {}) => parts.push(K.paint(geo, col, o));
    const bx = (w, h, d, x, y, z) => K.box(w, h, d, { x, y, z });
    const boxL = BOX.x1 - BOX.x0, cx = (BOX.x0 + BOX.x1) / 2, top = BED + BOX.h;
    P(bx(boxL - 0.06, 0.04, BOX.hz * 2 - 0.02, cx, top + 0.03, 0), '#f1f2f0', { r: 0.45 });
    P(bx(0.04, BOX.h, BOX.hz * 2 - 0.02, BOX.x1 - 0.02, BED + BOX.h / 2, 0), '#f1f2f0', { r: 0.45 });
    for (const s of [-1, 1]) {
      for (const x of [BOX.x0 + 0.03, BOX.x1 - 0.03]) P(bx(0.07, BOX.h + 0.06, 0.07, x, BED + BOX.h / 2 + 0.01, s * (BOX.hz - 0.005)), '#c9cdd0', { r: 0.35, m: 0.7 });
      P(bx(boxL, 0.06, 0.07, cx, top + 0.02, s * (BOX.hz - 0.005)), '#c9cdd0', { r: 0.35, m: 0.7 });
      P(bx(boxL, 0.1, 0.06, cx, BED - 0.02, s * (BOX.hz - 0.01)), '#c9cdd0', { r: 0.35, m: 0.7 });
      P(bx(boxL - 0.1, 0.02, 0.01, cx, BED + 0.05, s * (BOX.hz + 0.006)), '#d8dbdc', { r: 0.4, m: 0.5 });
    }
    P(bx(0.05, 0.1, BOX.hz * 2 + 0.04, BOX.x0 + 0.01, top - 0.02, 0), '#8d949a', { r: 0.4, m: 0.6 });
    for (const s of [-1, 1]) P(bx(0.05, BOX.h, 0.06, BOX.x0 + 0.01, BED + BOX.h / 2, s * (BOX.hz - 0.02)), '#8d949a', { r: 0.4, m: 0.6 });
    P(bx(0.06, 0.06, BOX.hz * 2, BOX.x0 + 0.02, BED - 0.01, 0), '#5d6268', { r: 0.5, m: 0.6 });
    const inner = '#cfd2ce';
    P(bx(boxL - 0.1, 0.02, BOX.hz * 2 - 0.08, cx, BED + 0.01, 0), '#6e6a63', { r: 0.85 });
    const wallIn = (geo) => P(geo, inner, { r: 0.8 });
    for (const s of [-1, 1]) {
      const q = new THREE.PlaneGeometry(boxL - 0.1, BOX.h - 0.04);
      q.rotateY(s > 0 ? Math.PI : 0);
      q.translate(cx, BED + BOX.h / 2, s * (BOX.hz - 0.04));
      wallIn(q);
    }
    const ceil = new THREE.PlaneGeometry(boxL - 0.1, BOX.hz * 2 - 0.08);
    ceil.rotateX(Math.PI / 2);
    ceil.translate(cx, top - 0.02, 0);
    wallIn(ceil);
    const fw = new THREE.PlaneGeometry(BOX.hz * 2 - 0.08, BOX.h - 0.04);
    fw.rotateY(-Math.PI / 2);
    fw.translate(BOX.x1 - 0.05, BED + BOX.h / 2, 0);
    wallIn(fw);
    for (let i = 0; i < 4; i++) for (const s of [-1, 1]) P(bx(boxL - 0.2, 0.03, 0.012, cx, BED + 0.45 + i * 0.5, s * (BOX.hz - 0.045)), '#9aa1a7', { r: 0.4, m: 0.6 });
    P(bx(LEN - 0.4, 0.16, 0.12, 0, 0.5, 0.42), '#25272a', { r: 0.6, m: 0.4 });
    P(bx(LEN - 0.4, 0.16, 0.12, 0, 0.5, -0.42), '#25272a', { r: 0.6, m: 0.4 });
    for (let x = -3.4; x < 1.8; x += 0.7) P(bx(0.1, 0.08, BOX.hz * 2 - 0.1, x, BED - 0.1, 0), '#2e3135', { r: 0.6, m: 0.4 });
    for (const s of [-1, 1]) {
      for (const y of [0.42, 0.62]) P(bx(1.9, 0.05, 0.03, 0.15, y - 0.08, s * 1.18), '#bfc4c8', { r: 0.35, m: 0.8 });
      P(bx(0.9, 0.012, 0.56, -2.02, 0.78, s * 0.97), '#1b1c1e', { r: 0.8 });
      const arch = new THREE.CylinderGeometry(0.44, 0.44, 0.06, 20, 1, true, -Math.PI / 2, Math.PI);
      arch.rotateX(Math.PI / 2);
      arch.rotateY(Math.PI);
      arch.translate(2.6, 0.38, s * 1.17);
      P(arch, '#1b1c1e', { r: 0.8 });
    }
    const rearBar = bx(0.08, 0.12, BOX.hz * 2 - 0.3, BOX.x0 + 0.25, 0.38, 0);
    P(rearBar, '#c9cdd0', { r: 0.35, m: 0.8 });
    P(bx(0.02, 0.11, 0.52, BOX.x0 + 0.2, 0.38, 0), '#f4f4f0', { r: 0.4 });
    const cab = K.extrude([
      [1.82, 0.5], [3.7, 0.5], [3.8, 0.56], [3.8, 0.86], [3.74, 0.92], [3.72, 1.46], [3.66, 1.52],
      [3.46, 2.28], [3.3, 2.42], [1.86, 2.42], [1.82, 2.38],
    ], 2.36, { bevel: 0.05, bevelSegs: 2, curveSegs: 2 });
    P(cab, color, { r: 0.32, m: 0.25 });
    const glass = '#1a2632';
    const wa = Math.atan2(0.2, 0.76);
    const ws = new THREE.PlaneGeometry(2.08, 0.74);
    ws.rotateY(Math.PI / 2);
    ws.rotateZ(wa);
    ws.translate(3.56 + Math.cos(wa) * 0.056, 1.9 + Math.sin(wa) * 0.056, 0);
    P(ws, glass, { r: 0.04, m: 0.3 });
    for (const s of [-1, 1]) {
      const sw = new THREE.PlaneGeometry(0.92, 0.62);
      if (s < 0) sw.rotateY(Math.PI);
      sw.translate(3.0, 1.88, s * 1.183);
      P(sw, glass, { r: 0.04, m: 0.3 });
      P(bx(0.012, 1.05, 0.004, 2.45, 1.45, s * 1.181), '#123', { r: 0.6 });
      P(bx(0.16, 0.025, 0.03, 2.6, 1.3, s * 1.19), '#1b1c1e', { r: 0.5 });
      P(bx(0.5, 0.06, 0.25, 2.55, 0.48, s * 1.12), '#2b2d30', { r: 0.6, m: 0.4 });
      P(bx(0.5, 0.04, 0.22, 2.55, 0.75, s * 1.14), '#2b2d30', { r: 0.6, m: 0.4 });
      P(K.cyl(0.015, 0.015, 0.35, 6).rotateX(Math.PI / 2).translate(3.55, 2.05, s * 1.36), '#1b1c1e', { r: 0.5 });
      P(K.roundedBox(0.06, 0.34, 0.18, 0.02, 1).translate(3.52, 1.98, s * 1.55), '#1b1c1e', { r: 0.4 });
      P(bx(0.005, 0.28, 0.14, 3.555, 1.98, s * 1.55), '#5d7488', { r: 0.05, m: 0.8 });
      P(K.roundedBox(0.04, 0.12, 0.3, 0.02, 1).translate(3.8, 0.98, s * 0.82), '#f2f5f7', { r: 0.1, e: 0.6 });
      P(bx(0.02, 0.05, 0.12, 3.82, 0.98, s * 1.08), '#f2a01a', { r: 0.3, e: 0.4 });
    }
    P(bx(0.03, 0.42, 1.3, 3.78, 1.18, 0), '#1b1d20', { r: 0.5, m: 0.4 });
    for (let i = 0; i < 6; i++) P(bx(0.035, 0.025, 1.24, 3.79, 1.0 + i * 0.07, 0), '#3a3e43', { r: 0.4, m: 0.6 });
    P(bx(0.18, 0.28, 2.38, 3.82, 0.66, 0), '#2b2d30', { r: 0.5, m: 0.3 });
    P(bx(0.02, 0.1, 0.5, 3.92, 0.62, 0), '#f4f4f0', { r: 0.4 });
    P(K.extrude([[1.86, 2.42], [2.5, 2.42], [1.86, 2.9]], 2.2, { bevel: 0.03, bevelSegs: 1 }), color, { r: 0.35, m: 0.2 });
    P(bx(0.5, 0.012, 2.0, 2.8, 2.44, 0), '#1b1d20', { r: 0.5 });
    for (const [x, dual] of [[2.6, false], [-1.65, true], [-2.4, true]]) {
      for (const s of [-1, 1]) {
        const w = wheelGeo(dual);
        w.translate(x, 0.34, s * (dual ? 0.92 : 1.02));
        parts.push(w);
      }
    }
    const body = new THREE.Mesh(K.merge(parts), K.vcolorMaterial('rr-truck'));
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);
    const sideMat = new THREE.MeshStandardMaterial({ map: sideTexture(this.role), roughness: 0.42, metalness: 0.05 });
    const sides = [];
    for (const s of [-1, 1]) {
      const q = new THREE.PlaneGeometry(boxL - 0.1, BOX.h - 0.02);
      if (s < 0) q.rotateY(Math.PI);
      q.translate(cx, BED + BOX.h / 2 + 0.01, s * (BOX.hz + 0.025));
      sides.push(q);
    }
    const sideMesh = new THREE.Mesh(K.mergeRaw(sides), sideMat);
    sideMesh.castShadow = true;
    sideMesh.receiveShadow = true;
    g.add(sideMesh);
    this.shell = sideMesh;
    if (!slatMat) slatMat = K.vcolorMaterial('rr-truck-slat');
    this.slats = new THREE.InstancedMesh(slatGeometry(), slatMat, SLATS);
    this.slats.castShadow = true;
    this.slats.receiveShadow = true;
    this.slats.frustumCulled = false;
    g.add(this.slats);
    this.doors = [];
    this.lights = [];
    const lightMat = new THREE.MeshStandardMaterial({ color: '#b3170c', emissive: '#ff1a0a', emissiveIntensity: 0, roughness: 0.25 });
    const lg = [];
    for (const s of [-1, 1]) {
      lg.push(K.roundedBox(0.05, 0.14, 0.32, 0.015, 1).translate(BOX.x0 + 0.2, 0.52, s * 1.0));
      lg.push(K.roundedBox(0.05, 0.08, 0.06, 0.01, 1).translate(BOX.x0 + 0.2, top - 0.08, s * (BOX.hz - 0.08)));
    }
    const lights = new THREE.Mesh(K.mergeRaw(lg), lightMat);
    g.add(lights);
    this.lights.push(lights);
    if (!liftMat) liftMat = new THREE.MeshStandardMaterial({ color: '#c9ced2', roughness: 0.38, metalness: 0.85, normalMap: chequerTextures(), normalScale: new THREE.Vector2(0.9, 0.9) });
    const lift = new THREE.Group();
    const plate = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.05, 2.2), liftMat);
    plate.castShadow = true;
    plate.receiveShadow = true;
    lift.add(plate);
    const lipG = [];
    for (const s of [-1, 1]) lipG.push(K.paint(K.box(1.72, 0.08, 0.04, { x: 0, y: 0.03, z: s * 1.09 }), '#f2c230', { r: 0.5 }));
    lipG.push(K.paint(K.cyl(0.03, 0.03, 2.1, 10).rotateX(Math.PI / 2).translate(0.86, 0, 0), '#5d6268', { r: 0.4, m: 0.7 }));
    lipG.push(K.paint(K.box(0.08, 0.02, 2.18, { x: -0.86, y: -0.005, z: 0 }), '#9aa1a7', { r: 0.4, m: 0.7 }));
    const lips = new THREE.Mesh(K.merge(lipG), K.vcolorMaterial('rr-truck-lift'));
    lips.castShadow = true;
    lift.add(lips);
    this.rampMesh = lift;
    g.add(lift);
    this.mesh = g;
    this.game.engine.scene.add(g);
    this.mesh.traverse((o) => { o.userData.owner = this; });
    this.placeSlats(0);
  }

  placeSlats(e) {
    const arcL = (Math.PI / 2) * CURVE_R;
    const vert = BOX.h - CURVE_R - 0.02;
    const path = (s, out) => {
      if (s <= vert) return out.set(BOX.x0 + 0.045, BED + s, 0);
      if (s <= vert + arcL) {
        const a = (s - vert) / CURVE_R;
        return out.set(BOX.x0 + 0.045 + CURVE_R - CURVE_R * Math.cos(a), BED + vert + CURVE_R * Math.sin(a), 0);
      }
      return out.set(BOX.x0 + 0.045 + CURVE_R + (s - vert - arcL), BED + vert + CURVE_R, 0);
    };
    const a = _sa, b = _sb;
    for (let i = 0; i < SLATS; i++) {
      const s = i * SLAT_H + e * (BOX.h - 0.06);
      path(s, a);
      path(s + SLAT_H, b);
      _q.setFromAxisAngle(ZAX, -Math.atan2(b.x - a.x, b.y - a.y));
      _p.copy(a);
      _m.compose(_p, _q, _s);
      this.slats.setMatrixAt(i, _m);
    }
    this.slats.instanceMatrix.needsUpdate = true;
    this.slatE = e;
  }

  buildBody() {
    const C = (hx, hy, hz, x, y, z) => R.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z).setFriction(0.9).setCollisionGroups(groups(GROUP.VEHICLE));
    const cx = (BOX.x0 + BOX.x1) / 2, hl = (BOX.x1 - BOX.x0) / 2;
    const cy = BED + BOX.h / 2;
    this.body = this.game.physics.createBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(this.pos.x, 0, this.pos.z), [
      C(hl, 0.12, BOX.hz, cx, BED - 0.12, 0),
      C(hl, BOX.h / 2, 0.04, cx, cy, BOX.hz + 0.02),
      C(hl, BOX.h / 2, 0.04, cx, cy, -BOX.hz - 0.02),
      C(0.05, BOX.h / 2, BOX.hz, BOX.x1, cy, 0),
      C(hl, 0.05, BOX.hz, cx, BED + BOX.h + 0.03, 0),
      C(1.0, 0.95, 1.2, 2.75, 1.4, 0),
      C(0.04, BOX.h / 2, BOX.hz, BOX.x0 - 0.02, cy, 0),
    ], this);
    this.rearWall = this.body.collider(6);
    this.rampCollider = null;
  }

  visible(v) {
    this.mesh.visible = v;
    const n = this.body.numColliders();
    for (let i = 0; i < n; i++) this.body.collider(i).setEnabled(v && (i !== 6 || this.door < 0.5));
  }

  localToWorld(x, y, z, out = new THREE.Vector3()) {
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    return out.set(this.pos.x + x * c + z * s, y, this.pos.z - x * s + z * c);
  }

  worldToLocal(p, out = new THREE.Vector3()) {
    const dx = p.x - this.pos.x, dz = p.z - this.pos.z;
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    return out.set(dx * c - dz * s, p.y, dx * s + dz * c);
  }

  inCargo(p) {
    const l = this.worldToLocal(p, _v);
    return l.x > BOX.x0 - 0.2 && l.x < BOX.x1 && Math.abs(l.z) < BOX.hz + 0.1 && l.y > BED - 0.3 && l.y < BED + BOX.h;
  }

  carpetsInside() {
    const out = [];
    for (const c of this.game.carpets?.list ?? []) {
      const p = c.body ? c.body.translation() : c.uvToWorld?.(0.5, 0.5)?.point;
      if (p && this.inCargo(p)) out.push(c);
    }
    return out;
  }

  setPose() {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    this.body.setNextKinematicTranslation({ x: this.pos.x, y: 0, z: this.pos.z });
    this.body.setNextKinematicRotation(q);
    this.mesh.position.copy(this.pos);
    this.mesh.quaternion.copy(q);
  }

  teleport() {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    this.body.setTranslation({ x: this.pos.x, y: 0, z: this.pos.z }, true);
    this.body.setRotation(q, true);
    this.setPose();
  }

  deployRamp(on) {
    const ph = this.game.physics;
    if (on && !this.rampCollider) {
      const ang = Math.atan2(BED, 1.6);
      const mid = this.localToWorld(BOX.x0 - 0.8, BED / 2 - 0.02, 0);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, this.yaw, ang, 'YXZ'));
      this.rampCollider = ph.addCollider(R.ColliderDesc.cuboid(0.86, 0.03, 1.1).setTranslation(mid.x, mid.y, mid.z).setRotation(q).setFriction(1).setCollisionGroups(groups(GROUP.STATIC)), null, this);
    } else if (!on && this.rampCollider) {
      ph.removeCollider(this.rampCollider);
      this.rampCollider = null;
    }
  }

  start() {
    this.state = 'arrive';
    this.t = 0;
    this.yaw = -Math.PI / 2;
    this.pos.set(this.parkX + 10, 0, this.dock.z - 48);
    this.visible(true);
    this.teleport();
  }

  fixedUpdate(dt) {
    this.t += dt;
    const P = this.parkX, Z = this.dock.z;
    if (this.state === 'away') {
      this.wait -= dt;
      if (this.wait <= 0) this.start();
    } else if (this.state === 'arrive') {
      const d = 54, sp = 9;
      const s = Math.min(1, (this.t * sp) / d);
      const e = 1 - Math.pow(1 - s, 2);
      this.pos.set(P + 10, 0, Z - 48 + e * d);
      this.yaw = -Math.PI / 2;
      this.setPose();
      if (s >= 1) { this.state = 'reverse'; this.t = 0; }
    } else if (this.state === 'reverse') {
      const dur = 7;
      const s = Math.min(1, this.t / dur);
      const e = s * s * (3 - 2 * s);
      const p0 = { x: P + 10, z: Z + 6 }, p1 = { x: P + 10, z: Z - 1 }, p2 = { x: P + 6, z: Z }, p3 = { x: P, z: Z };
      bezier(p0, p1, p2, p3, e, this.pos);
      const a = bezier(p0, p1, p2, p3, Math.min(1, e + 0.01), new THREE.Vector3());
      const b = bezier(p0, p1, p2, p3, Math.max(0, e - 0.01), new THREE.Vector3());
      const tx = a.x - b.x, tz = a.z - b.z;
      if (Math.hypot(tx, tz) > 1e-5) this.yaw = Math.atan2(tz, -tx);
      this.setPose();
      const blink = Math.sin(this.t * 12) > 0 ? 3 : 0.3;
      for (const l of this.lights) l.material.emissiveIntensity = blink;
      if (s >= 1) {
        for (const l of this.lights) l.material.emissiveIntensity = 0;
        this.yaw = 0;
        this.setPose();
        this.state = 'parked';
        this.t = 0;
        if (this.role === 'in') this.game.onTruckParked?.(this);
      }
    } else if (this.state === 'parked') {
      if (this.t > 0.6) { this.state = 'opening'; this.t = 0; }
    } else if (this.state === 'opening') {
      this.door = Math.min(1, this.t / 1.6);
      this.ramp = Math.max(0, Math.min(1, (this.t - 0.8) / 1.4));
      if (this.door > 0.5) this.rearWall.setEnabled(false);
      if (this.ramp >= 1) {
        this.deployRamp(true);
        this.state = 'open';
        this.t = 0;
        this.emptyTime = 0;
      }
    } else if (this.state === 'open') {
      const inside = this.carpetsInside();
      if (this.role === 'in') {
        this.emptyTime = inside.length === 0 ? this.emptyTime + dt : 0;
        if (this.emptyTime > 3) this.close();
      } else {
        const wrapped = inside.filter((c) => c.wrapped);
        if (wrapped.length >= this.capacity || this.dispatchRequested) this.close();
      }
    } else if (this.state === 'closing') {
      this.ramp = Math.max(0, 1 - this.t / 1.2);
      this.door = Math.max(0, 1 - Math.max(0, this.t - 1.0) / 1.5);
      if (this.ramp < 1) this.deployRamp(false);
      if (this.door < 0.5) this.rearWall.setEnabled(true);
      if (this.door <= 0) {
        this.state = 'leave';
        this.t = 0;
        if (this.role === 'out') this.game.onTruckDispatched?.(this, this.carpetsInside());
        else for (const c of this.carpetsInside()) this.game.removeCarpet?.(c);
      }
    } else if (this.state === 'leave') {
      const s = this.t * this.t * 1.2;
      this.pos.set(this.parkX + s, 0, this.dock.z);
      this.yaw = 0;
      this.setPose();
      for (const c of this.carpetsInside()) this.game.removeCarpet?.(c);
      if (this.pos.x > this.parkX + 60) {
        this.state = 'away';
        this.wait = this.role === 'in' ? 9 : 8;
        this.dispatchRequested = false;
        this.trips++;
        this.visible(false);
      }
    }
    this.animate();
  }

  close() {
    this.state = 'closing';
    this.t = 0;
  }

  animate() {
    const e = this.door * this.door * (3 - 2 * this.door);
    if (this.slatE !== e) this.placeSlats(e);
    const r = this.ramp;
    const ang = Math.atan2(BED, 1.6);
    this.rampMesh.position.set(BOX.x0 + 0.86 - 1.66 * r, BED - 0.1 + (BED / 2 + 0.1 - BED) * r, 0);
    this.rampMesh.rotation.set(0, 0, ang * r);
    this.rampMesh.visible = r > 0.02;
  }

  cargoSlot(i) {
    const x = BOX.x0 + 0.8 + i * 1.5;
    return this.localToWorld(x, BED + 0.35, 0);
  }

  get isOpen() {
    return this.state === 'open';
  }
}
