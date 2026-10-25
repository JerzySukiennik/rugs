// Rug Rush phase-1 baseplate: grid ground, sloped tiled wash bay with trench drain, lights and colliders.
import * as THREE from 'three';
import { R, GROUP, groups } from '../core/physics.js';
import { BAY, LAYOUT, TILE, floorBaseHeightAt } from './layout.js';

function gridTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#8f969c';
  g.fillRect(0, 0, 512, 512);
  g.strokeStyle = 'rgba(255,255,255,0.22)';
  g.lineWidth = 3;
  g.strokeRect(0, 0, 512, 512);
  g.strokeStyle = 'rgba(255,255,255,0.08)';
  g.lineWidth = 1.5;
  for (let i = 1; i < 4; i++) {
    g.beginPath(); g.moveTo(i * 128, 0); g.lineTo(i * 128, 512); g.stroke();
    g.beginPath(); g.moveTo(0, i * 128); g.lineTo(512, i * 128); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function tileTextures(tilesPerTex = 10) {
  const S = 1024, step = S / tilesPerTex, gw = Math.max(3, step * 0.014);
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#f4f5f4';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < tilesPerTex; i++) for (let j = 0; j < tilesPerTex; j++) {
    const v = 240 + Math.floor(Math.random() * 10);
    g.fillStyle = `rgb(${v},${v + 1},${v})`;
    g.fillRect(i * step + gw / 2, j * step + gw / 2, step - gw, step - gw);
  }
  g.fillStyle = '#b9bcba';
  for (let i = 0; i <= tilesPerTex; i++) {
    g.fillRect(i * step - gw / 2, 0, gw, S);
    g.fillRect(0, i * step - gw / 2, S, gw);
  }
  const n = document.createElement('canvas');
  n.width = n.height = S;
  const ng = n.getContext('2d');
  ng.fillStyle = 'rgb(128,128,255)';
  ng.fillRect(0, 0, S, S);
  const bev = gw * 1.2;
  for (let i = 0; i <= tilesPerTex; i++) {
    const p = i * step;
    ng.fillStyle = 'rgb(60,128,230)'; ng.fillRect(p + gw / 2, 0, bev, S);
    ng.fillStyle = 'rgb(196,128,230)'; ng.fillRect(p - gw / 2 - bev, 0, bev, S);
    ng.fillStyle = 'rgb(128,196,230)'; ng.fillRect(0, p + gw / 2, S, bev);
    ng.fillStyle = 'rgb(128,60,230)'; ng.fillRect(0, p - gw / 2 - bev, S, bev);
  }
  const color = new THREE.CanvasTexture(c);
  color.colorSpace = THREE.SRGBColorSpace;
  const normal = new THREE.CanvasTexture(n);
  for (const t of [color, normal]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
  }
  return { color, normal, metersPerTex: tilesPerTex * TILE };
}

export function buildBaseplate(engine, physics) {
  const scene = engine.scene;
  const root = new THREE.Group();
  root.name = 'baseplate';
  scene.add(root);

  const hemi = new THREE.HemisphereLight(0xdfe8f2, 0x6d6a64, 0.55);
  root.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff3e2, 2.2);
  sun.position.set(14, 26, 10);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -26; sc.right = 26; sc.top = 22; sc.bottom = -22; sc.near = 1; sc.far = 70;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  root.add(sun, sun.target);

  const half = LAYOUT.ground.half;
  const grid = gridTexture();
  const groundMat = new THREE.MeshStandardMaterial({ map: grid, roughness: 0.92, metalness: 0 });
  const bx0 = BAY.cx - BAY.half, bx1 = BAY.cx + BAY.half, bz0 = BAY.cz - BAY.half, bz1 = BAY.cz + BAY.half;
  const pieces = [
    [-half, half, -half, bz0],
    [-half, half, bz1, half],
    [-half, bx0, bz0, bz1],
    [bx1, half, bz0, bz1],
  ];
  for (const [x0, x1, z0, z1] of pieces) {
    const w = x1 - x0, d = z1 - z0;
    const geo = new THREE.PlaneGeometry(w, d);
    geo.rotateX(-Math.PI / 2);
    const uv = geo.attributes.uv;
    const pos = geo.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) + (x0 + x1) / 2 + half) / 4, (-(pos.getZ(i) + (z0 + z1) / 2) + half) / 4);
    const m = new THREE.Mesh(geo, groundMat);
    m.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
    m.receiveShadow = true;
    root.add(m);
    physics.staticBox(w / 2, 0.5, d / 2, { x: (x0 + x1) / 2, y: -0.5, z: (z0 + z1) / 2 }, null, { friction: 0.9 });
  }

  const tiles = tileTextures();
  const segs = 96;
  const bayGeo = new THREE.PlaneGeometry(BAY.half * 2, BAY.half * 2, segs, segs);
  bayGeo.rotateX(-Math.PI / 2);
  const p = bayGeo.attributes.position, uv = bayGeo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + BAY.cx, z = p.getZ(i) + BAY.cz;
    p.setY(i, floorBaseHeightAt(x, z));
    uv.setXY(i, x / tiles.metersPerTex, -z / tiles.metersPerTex);
  }
  bayGeo.computeVertexNormals();
  const bayMat = new THREE.MeshStandardMaterial({ map: tiles.color, normalMap: tiles.normal, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.18, metalness: 0 });
  const bay = new THREE.Mesh(bayGeo, bayMat);
  bay.position.set(BAY.cx, 0, BAY.cz);
  bay.receiveShadow = true;
  bay.name = 'bayFloor';
  root.add(bay);

  const cs = 48;
  const verts = [], idx = [];
  for (let j = 0; j <= cs; j++) for (let i = 0; i <= cs; i++) {
    const x = BAY.cx - BAY.half + (i / cs) * BAY.half * 2;
    const z = BAY.cz - BAY.half + (j / cs) * BAY.half * 2;
    verts.push(x, floorBaseHeightAt(x, z), z);
  }
  for (let j = 0; j < cs; j++) for (let i = 0; i < cs; i++) {
    const a = j * (cs + 1) + i, b = a + 1, c = a + cs + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  physics.addCollider(R.ColliderDesc.trimesh(new Float32Array(verts), new Uint32Array(idx)).setFriction(0.7).setCollisionGroups(groups(GROUP.STATIC)));
  const cells = 12, cw = (BAY.half * 2) / cells;
  for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) {
    const x0 = BAY.cx - BAY.half + i * cw, z0 = BAY.cz - BAY.half + j * cw;
    let lo = 0;
    for (let a = 0; a <= 4; a++) for (let b = 0; b <= 4; b++) lo = Math.min(lo, floorBaseHeightAt(x0 + (a / 4) * cw, z0 + (b / 4) * cw));
    const top = lo - 0.003;
    physics.staticBox(cw / 2, 0.15, cw / 2, { x: x0 + cw / 2, y: top - 0.15, z: z0 + cw / 2 }, null, { friction: 0.7 });
  }

  const tr = BAY.trench;
  const slot = new THREE.Mesh(new THREE.BoxGeometry(tr.halfLen * 2, 0.02, tr.halfW * 2), new THREE.MeshStandardMaterial({ color: 0x1a1c1e, roughness: 0.6 }));
  slot.position.set(BAY.cx, -BAY.depth - 0.012, BAY.cz);
  root.add(slot);
  const barGeo = new THREE.BoxGeometry(0.012, 0.012, tr.halfW * 2);
  const steel = new THREE.MeshStandardMaterial({ color: 0xb8bcc0, metalness: 1, roughness: 0.32 });
  const nBars = Math.floor((tr.halfLen * 2) / 0.03);
  const bars = new THREE.InstancedMesh(barGeo, steel, nBars + 2);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < nBars; i++) {
    m4.makeTranslation(BAY.cx - tr.halfLen + (i + 0.5) * 0.03, -BAY.depth - 0.003, BAY.cz);
    bars.setMatrixAt(i, m4);
  }
  const rail = new THREE.BoxGeometry(tr.halfLen * 2, 0.014, 0.012);
  for (const s of [-1, 1]) {
    const r = new THREE.Mesh(rail, steel);
    r.position.set(BAY.cx, -BAY.depth - 0.002, BAY.cz + s * tr.halfW);
    root.add(r);
  }
  bars.count = nBars;
  bars.receiveShadow = true;
  root.add(bars);

  return { root, sun, hemi, bay, bayMaterial: bayMat };
}
