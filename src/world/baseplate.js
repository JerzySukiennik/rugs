// Rug Rush baseplate: asphalt yard with lines, white 3D tile hall floor with the sloped wash bay and trench drain, sky, sun and hemisphere light, floor colliders.
import * as THREE from 'three';
import { R, GROUP, groups } from '../core/physics.js';
import { BAY, LAYOUT, floorBaseHeightAt } from './layout.js';
import { buildFloor } from './floor.js';
import * as K from './kit.js';

function loadTex(url, { srgb = false, repeat = 1 } = {}) {
  const t = new THREE.TextureLoader().load(url);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function skyTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 512;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 512);
  gr.addColorStop(0, '#4f86c6');
  gr.addColorStop(0.32, '#8fb7e0');
  gr.addColorStop(0.47, '#d6e4ef');
  gr.addColorStop(0.5, '#e4ebef');
  gr.addColorStop(0.53, '#a9b0a2');
  gr.addColorStop(1, '#6d7466');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 512);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.mapping = THREE.EquirectangularReflectionMapping;
  return t;
}

function yard(root) {
  const H = LAYOUT.hall;
  const asphaltMat = new THREE.MeshStandardMaterial({
    map: loadTex('assets/textures/asphalt/color.jpg', { srgb: true }),
    normalMap: loadTex('assets/textures/asphalt/normal.jpg'),
    roughnessMap: loadTex('assets/textures/asphalt/roughness.jpg'),
    normalScale: new THREE.Vector2(0.8, 0.8),
    color: '#9a9a96',
    roughness: 1,
  });
  const concreteMat = new THREE.MeshStandardMaterial({
    map: loadTex('assets/textures/concrete_floor/color.jpg', { srgb: true }),
    normalMap: loadTex('assets/textures/concrete_floor/normal.jpg'),
    normalScale: new THREE.Vector2(0.5, 0.5),
    color: '#d9d7d0',
    roughness: 0.85,
  });
  const uvPlane = (x0, x1, z0, z1, y, scale) => {
    const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
    g.rotateX(-Math.PI / 2);
    g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
    const p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / scale, -p.getZ(i) / scale);
    return g;
  };
  const ap = 3;
  const apron = K.mergeRaw([
    uvPlane(H.minX - ap, H.maxX + ap, H.minZ - ap, H.minZ, -0.003, 3),
    uvPlane(H.minX - ap, H.maxX + ap, H.maxZ, H.maxZ + ap, -0.003, 3),
    uvPlane(H.minX - ap, H.minX, H.minZ, H.maxZ, -0.003, 3),
    uvPlane(H.maxX, H.maxX + ap, H.minZ, H.maxZ, -0.003, 3),
  ]);
  const ca = new THREE.Mesh(apron, concreteMat);
  ca.receiveShadow = true;
  ca.name = 'apron';
  root.add(ca);
  const asphalt = K.mergeRaw([
    uvPlane(H.maxX + ap, 52, -80, 50, -0.006, 4),
    uvPlane(H.minX - ap - 8, H.maxX + ap, H.minZ - ap - 9, H.minZ - ap, -0.006, 4),
  ]);
  const am = new THREE.Mesh(asphalt, asphaltMat);
  am.receiveShadow = true;
  am.name = 'yardAsphalt';
  root.add(am);
  const grassC = document.createElement('canvas');
  grassC.width = grassC.height = 128;
  const gg = grassC.getContext('2d');
  gg.fillStyle = '#6f8a52';
  gg.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 1400; i++) {
    gg.fillStyle = K.hash(i, 3) > 0.5 ? 'rgba(88,112,62,0.6)' : 'rgba(132,150,92,0.5)';
    gg.fillRect(K.hash(i, 1) * 128, K.hash(i, 2) * 128, 2, 2);
  }
  const grassT = new THREE.CanvasTexture(grassC);
  grassT.colorSpace = THREE.SRGBColorSpace;
  grassT.wrapS = grassT.wrapT = THREE.RepeatWrapping;
  grassT.repeat.set(160, 160);
  grassT.repeat.set(1, 1);
  const PX0 = H.minX - ap - 8, PX1 = 52, PZ0 = -80, PZ1 = 50, E = 260;
  const grassParts = [
    [-E, E, -E, PZ0],
    [-E, E, PZ1, E],
    [-E, PX0, PZ0, PZ1],
    [PX1, E, PZ0, PZ1],
    [PX0, H.minX - ap, H.minZ - ap, PZ1],
    [H.minX - ap, H.maxX + ap, H.maxZ + ap, PZ1],
    [PX0, H.maxX + ap, PZ0, H.minZ - ap - 9],
  ].filter(([x0, x1, z0, z1]) => x1 - x0 > 0.01 && z1 - z0 > 0.01).map(([x0, x1, z0, z1]) => {
    const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0, Math.max(1, Math.ceil((x1 - x0) / 12)), Math.max(1, Math.ceil((z1 - z0) / 12)));
    g.rotateX(-Math.PI / 2);
    g.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
    const p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 3, p.getZ(i) / 3);
    return g;
  });
  const grass = new THREE.Mesh(K.mergeRaw(grassParts), new THREE.MeshStandardMaterial({ map: grassT, roughness: 0.95 }));
  grass.position.y = -0.02;
  grass.receiveShadow = true;
  grass.name = 'grass';
  root.add(grass);
  const lines = [];
  const Y = '#f2c230', W = '#f4f4f0';
  const quad = (x0, x1, z0, z1, color) => {
    const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
    g.rotateX(-Math.PI / 2);
    g.translate((x0 + x1) / 2, 0.001, (z0 + z1) / 2);
    lines.push(K.paint(g, color, { r: 0.75 }));
  };
  const laneX = LAYOUT.inboundDock.x + 14.1;
  for (let z = -78; z < 48; z += 4) quad(laneX - 0.06, laneX + 0.06, z, z + 2.2, W);
  quad(laneX + 3.6, laneX + 3.72, -80, 50, W);
  quad(H.maxX + ap + 0.3, H.maxX + ap + 0.42, -80, 50, W);
  for (const dk of [LAYOUT.inboundDock, LAYOUT.outboundDock]) {
    for (const s of [-1, 1]) quad(dk.x + 0.4, dk.x + 15, dk.z + s * 1.62 - 0.06, dk.z + s * 1.62 + 0.06, Y);
    quad(dk.x + 0.35, dk.x + 0.5, dk.z - 1.62, dk.z + 1.62, Y);
    for (let i = 0; i < 6; i++) quad(dk.x + 4 + i * 1.6, dk.x + 4.7 + i * 1.6, dk.z - 0.06, dk.z + 0.06, W);
  }
  for (let i = 0; i < 9; i++) quad(H.maxX + 0.6, H.maxX + ap - 0.2, -14.6 + i * 0.5, -14.35 + i * 0.5, W);
  for (let i = 0; i < 6; i++) {
    const x = H.maxX + ap + 6 + i * 2.8;
    quad(x, x + 0.1, H.minZ - ap - 8.5, H.minZ - ap - 3.5, W);
  }
  const lm = new THREE.Mesh(K.merge(lines), K.vcolorMaterial('rr-yard-lines', { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  lm.receiveShadow = true;
  lm.name = 'yardLines';
  root.add(lm);
}

export function buildBaseplate(engine, physics) {
  const scene = engine.scene;
  const root = new THREE.Group();
  root.name = 'baseplate';
  scene.add(root);
  scene.background = skyTexture();

  const hemi = new THREE.HemisphereLight(0xe8eef5, 0xe3ddd2, 1.05);
  root.add(hemi);
  const fill = new THREE.DirectionalLight(0xe9f0f8, 0.55);
  fill.position.set(-14, 9, -10);
  root.add(fill);
  const sun = new THREE.DirectionalLight(0xfff3e4, 2.25);
  sun.position.set(13, 27, 8);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -25; sc.right = 25; sc.top = 21; sc.bottom = -21; sc.near = 4; sc.far = 62;
  sun.shadow.bias = -0.00035;
  sun.shadow.normalBias = 0.028;
  sun.shadow.radius = 2.5;
  root.add(sun, sun.target);

  const half = LAYOUT.ground.half;
  const bx0 = BAY.cx - BAY.half, bx1 = BAY.cx + BAY.half, bz0 = BAY.cz - BAY.half, bz1 = BAY.cz + BAY.half;
  const pieces = [
    [-half, half, -half, bz0],
    [-half, half, bz1, half],
    [-half, bx0, bz0, bz1],
    [bx1, half, bz0, bz1],
  ];
  for (const [x0, x1, z0, z1] of pieces) {
    const w = x1 - x0, d = z1 - z0;
    physics.staticBox(w / 2, 0.5, d / 2, { x: (x0 + x1) / 2, y: -0.5, z: (z0 + z1) / 2 }, null, { friction: 0.9 });
  }
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

  yard(root);
  const floor = buildFloor(root, LAYOUT.hall);
  engine.add({ lateUpdate: () => floor.update(engine.camera) }, 950);
  floor.update(engine.camera);

  return { root, sun, hemi, bay: floor.far, bayMaterial: floor.far.material, floor };
}
