// Rug Rush phase-1 stations: product shelves, tool table, drying racks with a big dryer, trash bin, shop computer, dock buttons and floor markings.
import * as THREE from 'three';
import { R, GROUP, groups } from '../core/physics.js';
import { LAYOUT } from './layout.js';
import { STARTING_STOCK, STARTING_TOOLS } from '../data/products.js';
import { spawnProduct, spawnTool } from '../tools/items.js';

const UP = new THREE.Vector3(0, 1, 0);
const m = (c, r = 0.55, me = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: me });

function staticBox(game, root, size, pos, quat, mat, owner = null) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), mat);
  mesh.position.copy(pos);
  if (quat) mesh.quaternion.copy(quat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  root.add(mesh);
  const d = R.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2).setTranslation(pos.x, pos.y, pos.z).setFriction(0.8).setCollisionGroups(groups(GROUP.STATIC));
  if (quat) d.setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w });
  game.physics.addCollider(d, null, owner);
  return mesh;
}

function marking(root, x, z, w, d, color = '#f2c230') {
  const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ color, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2 }));
  p.rotation.x = -Math.PI / 2;
  p.position.set(x, 0.003, z);
  p.receiveShadow = true;
  root.add(p);
}

export function buildStations(game) {
  const root = new THREE.Group();
  root.name = 'stations';
  game.engine.scene.add(root);
  const steel = m('#5b7fa6', 0.45, 0.5);
  const board = m('#b9bec4', 0.6, 0.3);
  const shelfSlots = [];
  for (const s of LAYOUT.shelves) {
    const q = new THREE.Quaternion().setFromAxisAngle(UP, s.rotY);
    const at = (x, y, z) => new THREE.Vector3(x, y, z).applyQuaternion(q).add(new THREE.Vector3(s.x, 0, s.z));
    for (const x of [-2, 2]) for (const z of [-0.3, 0.3]) staticBox(game, root, new THREE.Vector3(0.06, 2.0, 0.06), at(x, 1.0, z), q, steel);
    for (const y of [0.12, 0.62, 1.12, 1.62]) {
      staticBox(game, root, new THREE.Vector3(4.1, 0.04, 0.62), at(0, y, 0), q, board);
      if (y > 0.2) for (let i = 0; i < 9; i++) shelfSlots.push({ pos: at(-1.75 + i * 0.44, y + 0.02, 0.02), yaw: s.rotY + Math.PI });
    }
  }
  const stock = [];
  for (const [id, n] of Object.entries(STARTING_STOCK)) for (let k = 0; k < n; k++) stock.push(id);
  for (let si = 0; si < stock.length; si++) {
    const id = stock[si];
    {
      const slot = shelfSlots[Math.floor((si * shelfSlots.length) / stock.length)];
      const p = slot.pos.clone();
      p.y += 0.2;
      spawnProduct(game, id, p, slot.yaw);
    }
  }
  const tq = new THREE.Quaternion().setFromAxisAngle(UP, Math.PI / 2);
  const tx = -8.6, tz = 3.2;
  staticBox(game, root, new THREE.Vector3(0.8, 0.05, 2.4), new THREE.Vector3(tx, 0.82, tz), null, m('#8a6a4a', 0.7));
  for (const [dx, dz] of [[-0.35, -1.1], [0.35, -1.1], [-0.35, 1.1], [0.35, 1.1]]) staticBox(game, root, new THREE.Vector3(0.05, 0.8, 0.05), new THREE.Vector3(tx + dx, 0.4, tz + dz), null, steel);
  const small = STARTING_TOOLS.filter((t) => ['brushSoft', 'brushStiff', 'brushRubber', 'scraper', 'iron', 'uvlamp'].includes(t));
  small.forEach((t, i) => spawnTool(game, t, new THREE.Vector3(tx, 1.0, tz - 0.95 + i * 0.38), Math.PI / 2));
  const big = STARTING_TOOLS.filter((t) => !small.includes(t));
  big.forEach((t, i) => spawnTool(game, t, new THREE.Vector3(-7.4, 0.5, 5.2 - i * 0.9), Math.PI / 2));

  for (const r of LAYOUT.dryingRacks) {
    for (const dx of [-1.75, 1.75]) staticBox(game, root, new THREE.Vector3(0.06, 1.6, 0.06), new THREE.Vector3(r.x + dx, 0.8, r.z), null, steel);
    for (const dx of [-1.75, 1.75]) staticBox(game, root, new THREE.Vector3(0.06, 0.04, 0.9), new THREE.Vector3(r.x + dx, 0.02, r.z), null, steel);
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 3.6, 12), m('#c3c7cb', 0.25, 0.9));
    bar.rotation.z = Math.PI / 2;
    bar.position.set(r.x, 1.6, r.z);
    bar.castShadow = true;
    root.add(bar);
    game.physics.addCollider(R.ColliderDesc.capsule(1.8, 0.03).setRotation({ x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 }).setTranslation(r.x, 1.6, r.z).setFriction(1).setCollisionGroups(groups(GROUP.STATIC)));
  }
  const d = LAYOUT.dryer;
  const dg = new THREE.Group();
  dg.position.set(d.x, 0, d.z);
  root.add(dg);
  const shell = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.6, 0.7), m('#7b8790', 0.45, 0.4));
  shell.position.y = 0.95;
  shell.castShadow = true;
  dg.add(shell);
  const fans = [];
  for (const fx of [-0.6, 0.6]) {
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.06, 28), m('#222', 0.7));
    ring.rotation.x = Math.PI / 2;
    ring.position.set(fx, 0.95, -0.36);
    dg.add(ring);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.12, 0.02), m('#d9dde0', 0.4, 0.6));
    blade.position.set(fx, 0.95, -0.4);
    dg.add(blade);
    const blade2 = blade.clone();
    blade2.rotation.z = Math.PI / 2;
    dg.add(blade2);
    fans.push(blade, blade2);
  }
  game.physics.addCollider(R.ColliderDesc.cuboid(1.2, 0.95, 0.35).setTranslation(d.x, 0.95, d.z).setCollisionGroups(groups(GROUP.STATIC)));
  game.dryers.push({ pos: new THREE.Vector3(d.x, 1.0, d.z - 0.4), dir: new THREE.Vector3(0, 0, -1), range: 7, cos: Math.cos(0.75), power: 5, on: true, fans });

  const tr = LAYOUT.trash;
  const binMat = m('#2f7d4f', 0.55, 0.2);
  const bw = 1.8, bd = 1.2, bh = 1.1;
  staticBox(game, root, new THREE.Vector3(bw, 0.06, bd), new THREE.Vector3(tr.x, 0.03, tr.z), null, binMat);
  staticBox(game, root, new THREE.Vector3(bw, bh, 0.06), new THREE.Vector3(tr.x, bh / 2, tr.z - bd / 2), null, binMat);
  staticBox(game, root, new THREE.Vector3(bw, bh, 0.06), new THREE.Vector3(tr.x, bh / 2, tr.z + bd / 2), null, binMat);
  staticBox(game, root, new THREE.Vector3(0.06, bh, bd), new THREE.Vector3(tr.x - bw / 2, bh / 2, tr.z), null, binMat);
  staticBox(game, root, new THREE.Vector3(0.06, bh, bd), new THREE.Vector3(tr.x + bw / 2, bh / 2, tr.z), null, binMat);
  game.trashZone = { min: new THREE.Vector3(tr.x - bw / 2, 0, tr.z - bd / 2), max: new THREE.Vector3(tr.x + bw / 2, bh + 0.4, tr.z + bd / 2) };

  const c = LAYOUT.computer;
  staticBox(game, root, new THREE.Vector3(0.7, 0.05, 1.3), new THREE.Vector3(c.x, 0.76, c.z), null, m('#8a6a4a', 0.7));
  for (const dz of [-0.6, 0.6]) staticBox(game, root, new THREE.Vector3(0.6, 0.74, 0.04), new THREE.Vector3(c.x, 0.37, c.z + dz), null, steel);
  const scr = document.createElement('canvas');
  scr.width = 256;
  scr.height = 160;
  const sg = scr.getContext('2d');
  sg.fillStyle = '#10243a';
  sg.fillRect(0, 0, 256, 160);
  sg.fillStyle = '#7fd1ff';
  sg.font = 'bold 26px Helvetica, Arial, sans-serif';
  sg.fillText('RUG RUSH', 20, 50);
  sg.font = '18px Helvetica, Arial, sans-serif';
  sg.fillStyle = '#fff';
  sg.fillText('Supplies & equipment', 20, 84);
  sg.fillText('Press E to order', 20, 112);
  const st = new THREE.CanvasTexture(scr);
  st.colorSpace = THREE.SRGBColorSpace;
  const shopOwner = { kind: 'computer', label: 'Supply computer', interactVerb: 'order supplies', interact: () => game.shop?.open() };
  const mon = staticBox(game, root, new THREE.Vector3(0.06, 0.42, 0.66), new THREE.Vector3(c.x - 0.1, 1.05, c.z), null, m('#1d1f24', 0.5), shopOwner);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.37), new THREE.MeshBasicMaterial({ map: st, toneMapped: false }));
  face.position.set(c.x - 0.065, 1.05, c.z);
  face.rotation.y = Math.PI / 2;
  root.add(face);
  mon.userData.owner = shopOwner;

  const od = LAYOUT.outboundDock;
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
  staticBox(game, root, new THREE.Vector3(0.14, 1.2, 0.14), new THREE.Vector3(od.x - 1.4, 0.6, od.z - 2.9), null, steel);
  staticBox(game, root, new THREE.Vector3(0.3, 0.3, 0.2), new THREE.Vector3(od.x - 1.4, 1.3, od.z - 2.9), null, m('#1f8a4c', 0.4), dispatch);

  for (const dk of [LAYOUT.inboundDock, LAYOUT.outboundDock]) {
    marking(root, dk.x - 0.5, dk.z - 1.6, 1, 0.12);
    marking(root, dk.x - 0.5, dk.z + 1.6, 1, 0.12);
    marking(root, dk.x + 4, dk.z - 1.6, 8, 0.12, '#ffffff');
    marking(root, dk.x + 4, dk.z + 1.6, 8, 0.12, '#ffffff');
  }
  const hall = LAYOUT.hall;
  marking(root, (hall.minX + hall.maxX) / 2, hall.minZ, hall.maxX - hall.minX, 0.08, '#4d5257');
  marking(root, (hall.minX + hall.maxX) / 2, hall.maxZ, hall.maxX - hall.minX, 0.08, '#4d5257');
  marking(root, hall.minX, 0, 0.08, hall.maxZ - hall.minZ, '#4d5257');
  marking(root, hall.maxX, -12, 0.08, 6, '#4d5257');
  marking(root, hall.maxX, 0, 0.08, 6, '#4d5257');
  marking(root, hall.maxX, 12, 0.08, 6, '#4d5257');
  return { root, fans };
}
