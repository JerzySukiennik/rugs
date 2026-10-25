// Rug Rush avatar: hand-scripted low-poly warehouse worker with customizable look and procedural walk, crouch, hold and ragdoll poses.
import * as THREE from 'three';

export const LOOK_OPTIONS = {
  suit: ['#2f6db5', '#e8742c', '#2fa04a', '#d6304a', '#7b4fd6', '#f2c230', '#2b2d30', '#f4f1ea'],
  skin: ['#f6d7c3', '#eac0a0', '#d9a07a', '#b97a52', '#8d5534', '#5d3a24'],
  hair: ['none', 'buzz', 'short', 'swoop', 'curly', 'bun', 'long', 'mohawk'],
  hairColor: ['#1d1b19', '#4a2f1d', '#8a5a2b', '#d9a441', '#f0e2b6', '#b8432d', '#9aa0a6', '#5aa9e6'],
  hat: ['none', 'cap', 'beanie', 'hardhat', 'bucket', 'bandana', 'headphones'],
  glasses: ['none', 'round', 'square', 'goggles', 'shades'],
  beard: ['none', 'stubble', 'mustache', 'goatee', 'full'],
  gloves: ['none', '#f2c230', '#2f6db5', '#2b2d30'],
  boots: ['#2b2d30', '#f2c230', '#2f7d4f', '#d6304a'],
};

const NAMES = ['Mop Master', 'Rug Doctor', 'Sudsy', 'Captain Foam', 'Dusty', 'Lint Lord', 'Squeegee Sam', 'Bubbles'];

export function randomLook(rnd = Math.random) {
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  return {
    name: pick(NAMES),
    suit: pick(LOOK_OPTIONS.suit),
    skin: pick(LOOK_OPTIONS.skin),
    hair: pick(LOOK_OPTIONS.hair),
    hairColor: pick(LOOK_OPTIONS.hairColor),
    hat: pick(LOOK_OPTIONS.hat),
    glasses: rnd() < 0.5 ? 'none' : pick(LOOK_OPTIONS.glasses),
    beard: rnd() < 0.55 ? 'none' : pick(LOOK_OPTIONS.beard),
    gloves: pick(LOOK_OPTIONS.gloves),
    boots: pick(LOOK_OPTIONS.boots),
  };
}

export function loadLook() {
  try {
    const s = localStorage.getItem('rugrush.look');
    if (s) return { ...randomLook(), ...JSON.parse(s) };
  } catch (e) {}
  return randomLook();
}

export function saveLook(look) {
  try {
    localStorage.setItem('rugrush.look', JSON.stringify(look));
  } catch (e) {}
}

const matCache = new Map();
function mat(color, rough = 0.7, metal = 0) {
  const k = `${color}|${rough}|${metal}`;
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, flatShading: true }));
  return matCache.get(k);
}

function shade(hex, k) {
  return '#' + new THREE.Color(hex).multiplyScalar(k).getHexString();
}

function mesh(geo, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function roundBox(w, h, d, seg = 1) {
  const g = new THREE.BoxGeometry(w, h, d, seg, seg, seg);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const k = 0.86 + 0.14 * (1 - Math.max(Math.abs(v.x) / (w / 2), Math.abs(v.y) / (h / 2), Math.abs(v.z) / (d / 2)) ** 4);
    const corner = Math.abs(v.x) / (w / 2) > 0.99 && Math.abs(v.z) / (d / 2) > 0.99;
    if (corner) {
      v.x *= 0.88;
      v.z *= 0.88;
    }
    p.setXYZ(i, v.x * (seg > 1 ? k : 1), v.y, v.z * (seg > 1 ? k : 1));
  }
  g.computeVertexNormals();
  return g;
}

function nameTag(text) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d');
  g.font = '700 64px Fredoka, "Arial Rounded MT Bold", Helvetica, sans-serif';
  const w = Math.min(500, g.measureText(text).width + 60);
  g.fillStyle = 'rgba(27,27,30,0.85)';
  g.beginPath();
  g.roundRect((512 - w) / 2, 20, w, 88, 44);
  g.fill();
  g.fillStyle = '#ffffff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 66);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: true, transparent: true }));
  s.scale.set(0.9, 0.225, 1);
  s.renderOrder = 10;
  return s;
}

export class Avatar {
  constructor(look = randomLook(), { tag = true } = {}) {
    this.look = { ...look };
    this.object3d = new THREE.Group();
    this.object3d.name = 'avatar';
    this.t = Math.random() * 10;
    this.phase = 0;
    this.speed = 0;
    this.showTag = tag;
    this.build();
  }

  build() {
    const L = this.look;
    const root = this.object3d;
    while (root.children.length) root.remove(root.children[0]);
    const suit = mat(L.suit, 0.75);
    const suitDark = mat(shade(L.suit, 0.72), 0.8);
    const skin = mat(L.skin, 0.62);
    const boot = mat(L.boots, 0.45);
    const glove = L.gloves === 'none' ? skin : mat(L.gloves, 0.4);
    const hairM = mat(L.hairColor, 0.85);
    const reflect = mat('#e9eef2', 0.35, 0.2);

    const hips = new THREE.Group();
    hips.position.y = 0.92;
    root.add(hips);
    hips.add(mesh(roundBox(0.36, 0.2, 0.22, 2), suitDark, 0, 0, 0));
    const belt = mesh(new THREE.BoxGeometry(0.37, 0.05, 0.23), mat('#2b2d30', 0.5), 0, 0.08, 0);
    hips.add(belt);

    const torso = new THREE.Group();
    torso.position.y = 0.1;
    hips.add(torso);
    torso.add(mesh(roundBox(0.42, 0.46, 0.25, 2), suit, 0, 0.25, 0));
    torso.add(mesh(new THREE.BoxGeometry(0.43, 0.035, 0.26), reflect, 0, 0.16, 0));
    torso.add(mesh(new THREE.BoxGeometry(0.43, 0.035, 0.26), reflect, 0, 0.36, 0));
    torso.add(mesh(new THREE.BoxGeometry(0.015, 0.4, 0.01), suitDark, 0, 0.27, -0.128));
    torso.add(mesh(new THREE.BoxGeometry(0.1, 0.09, 0.012), suitDark, -0.11, 0.38, -0.128));
    torso.add(mesh(roundBox(0.46, 0.1, 0.27, 2), suit, 0, 0.47, 0));

    const neck = new THREE.Group();
    neck.position.y = 0.52;
    torso.add(neck);
    neck.add(mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.08, 8), skin, 0, 0.03, 0));

    const head = new THREE.Group();
    head.position.y = 0.07;
    neck.add(head);
    const skull = new THREE.IcosahedronGeometry(0.135, 1);
    skull.scale(1, 1.12, 1.02);
    head.add(mesh(skull, skin, 0, 0.13, 0));
    const nose = mesh(new THREE.ConeGeometry(0.025, 0.05, 4), skin, 0, 0.12, -0.135);
    nose.rotation.x = -Math.PI / 2;
    head.add(nose);
    const ear = new THREE.SphereGeometry(0.03, 6, 4);
    head.add(mesh(ear, skin, 0.13, 0.13, 0), mesh(ear, skin, -0.13, 0.13, 0));
    const eyeM = mat('#1b1b1e', 0.3);
    const eyeG = new THREE.SphereGeometry(0.018, 8, 6);
    head.add(mesh(eyeG, eyeM, 0.048, 0.16, -0.122), mesh(eyeG, eyeM, -0.048, 0.16, -0.122));
    const browG = new THREE.BoxGeometry(0.05, 0.012, 0.012);
    const browM = mat(L.hairColor, 0.8);
    const bl = mesh(browG, browM, 0.05, 0.2, -0.124);
    const br = mesh(browG, browM, -0.05, 0.2, -0.124);
    bl.rotation.z = 0.12;
    br.rotation.z = -0.12;
    head.add(bl, br);
    const mouth = mesh(new THREE.BoxGeometry(0.06, 0.012, 0.01), mat('#7a3b33', 0.6), 0, 0.075, -0.128);
    head.add(mouth);
    this.mouth = mouth;
    this.buildHair(head, hairM);
    this.buildBeard(head, hairM);
    this.buildGlasses(head);
    this.buildHat(head);

    const arms = [];
    for (const s of [-1, 1]) {
      const sh = new THREE.Group();
      sh.position.set(s * 0.26, 0.44, 0);
      torso.add(sh);
      sh.add(mesh(new THREE.SphereGeometry(0.07, 8, 6), suit, 0, 0, 0));
      sh.add(mesh(new THREE.CylinderGeometry(0.058, 0.052, 0.3, 8), suit, 0, -0.16, 0));
      const el = new THREE.Group();
      el.position.y = -0.31;
      sh.add(el);
      el.add(mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.27, 8), suit, 0, -0.13, 0));
      el.add(mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.05, 8), L.gloves === 'none' ? suitDark : glove, 0, -0.25, 0));
      const hand = mesh(roundBox(0.075, 0.1, 0.05, 2), glove, 0, -0.32, 0);
      el.add(hand);
      arms.push({ s, sh, el, hand });
    }
    const legs = [];
    for (const s of [-1, 1]) {
      const hp = new THREE.Group();
      hp.position.set(s * 0.1, -0.06, 0);
      hips.add(hp);
      hp.add(mesh(new THREE.CylinderGeometry(0.085, 0.07, 0.42, 8), suit, 0, -0.22, 0));
      const kn = new THREE.Group();
      kn.position.y = -0.43;
      hp.add(kn);
      kn.add(mesh(new THREE.CylinderGeometry(0.068, 0.06, 0.3, 8), suit, 0, -0.14, 0));
      kn.add(mesh(new THREE.CylinderGeometry(0.075, 0.072, 0.17, 8), boot, 0, -0.32, 0));
      const foot = mesh(roundBox(0.13, 0.08, 0.24, 2), boot, 0, -0.39, -0.04);
      kn.add(foot);
      kn.add(mesh(new THREE.BoxGeometry(0.14, 0.02, 0.25), mat('#1b1b1e', 0.9), 0, -0.43, -0.04));
      legs.push({ s, hp, kn });
    }
    this.parts = { hips, torso, neck, head, arms, legs };
    if (this.showTag && L.name) {
      this.tag = nameTag(L.name);
      this.tag.position.y = 2.05;
      root.add(this.tag);
    }
  }

  buildHair(head, m) {
    const s = this.look.hair;
    if (s === 'none') return;
    const add = (g, x, y, z, rx = 0) => {
      const h = mesh(g, m, x, y, z);
      h.rotation.x = rx;
      head.add(h);
      return h;
    };
    if (s === 'buzz') {
      const g = new THREE.SphereGeometry(0.142, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.42);
      add(g, 0, 0.15, 0.005);
    } else if (s === 'short' || s === 'swoop' || s === 'curly' || s === 'bun' || s === 'long') {
      const g = new THREE.SphereGeometry(0.15, 10, 7, 0, Math.PI * 2, 0, Math.PI * 0.5);
      add(g, 0, 0.15, 0.01);
      add(new THREE.BoxGeometry(0.27, 0.1, 0.05), 0, 0.17, 0.12);
      if (s === 'swoop') {
        const f = add(new THREE.BoxGeometry(0.24, 0.07, 0.12), 0, 0.27, -0.08, 0.5);
        f.rotation.z = 0.15;
      }
      if (s === 'curly') for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        add(new THREE.IcosahedronGeometry(0.05, 0), Math.cos(a) * 0.12, 0.25 + Math.sin(a * 2) * 0.02, Math.sin(a) * 0.1);
      }
      if (s === 'bun') add(new THREE.IcosahedronGeometry(0.065, 1), 0, 0.3, 0.1);
      if (s === 'long') {
        add(new THREE.BoxGeometry(0.29, 0.28, 0.06), 0, 0.03, 0.12);
        add(new THREE.BoxGeometry(0.05, 0.22, 0.14), 0.135, 0.06, 0.03);
        add(new THREE.BoxGeometry(0.05, 0.22, 0.14), -0.135, 0.06, 0.03);
      }
    } else if (s === 'mohawk') {
      for (let i = 0; i < 5; i++) add(new THREE.ConeGeometry(0.035, 0.11, 4), 0, 0.3 - Math.abs(i - 2) * 0.012, -0.09 + i * 0.05);
    }
  }

  buildBeard(head, m) {
    const s = this.look.beard;
    if (s === 'none') return;
    if (s === 'stubble') {
      const g = new THREE.SphereGeometry(0.137, 10, 6, Math.PI * 0.62, Math.PI * 0.76, Math.PI * 0.55, Math.PI * 0.3);
      head.add(mesh(g, mat(shade(this.look.hairColor, 1.4), 0.95), 0, 0.13, 0));
      return;
    }
    if (s === 'mustache' || s === 'goatee' || s === 'full') head.add(mesh(new THREE.BoxGeometry(0.1, 0.025, 0.03), m, 0, 0.097, -0.13));
    if (s === 'goatee') head.add(mesh(new THREE.BoxGeometry(0.05, 0.06, 0.04), m, 0, 0.04, -0.12));
    if (s === 'full') {
      const g = new THREE.SphereGeometry(0.14, 10, 6, Math.PI * 0.55, Math.PI * 0.9, Math.PI * 0.5, Math.PI * 0.38);
      head.add(mesh(g, m, 0, 0.12, 0.005));
      head.add(mesh(new THREE.BoxGeometry(0.16, 0.08, 0.06), m, 0, 0.03, -0.1));
    }
  }

  buildGlasses(head) {
    const s = this.look.glasses;
    if (s === 'none') return;
    const frame = mat(s === 'goggles' ? '#f2c230' : '#1b1b1e', 0.4);
    const lens = new THREE.MeshStandardMaterial({ color: s === 'shades' ? '#111' : '#bfe3ff', roughness: 0.1, metalness: 0.3, transparent: true, opacity: s === 'shades' ? 0.92 : 0.35 });
    if (s === 'goggles') {
      const band = mesh(new THREE.TorusGeometry(0.142, 0.012, 4, 20), mat('#2b2d30', 0.6), 0, 0.17, 0);
      band.rotation.x = Math.PI / 2;
      head.add(band);
      head.add(mesh(new THREE.BoxGeometry(0.22, 0.07, 0.04), lens, 0, 0.165, -0.13));
      head.add(mesh(new THREE.BoxGeometry(0.23, 0.08, 0.02), frame, 0, 0.165, -0.115));
      return;
    }
    for (const x of [-0.05, 0.05]) {
      const g = s === 'round' ? new THREE.TorusGeometry(0.032, 0.007, 4, 12) : new THREE.TorusGeometry(0.035, 0.007, 4, 4);
      const r = mesh(g, frame, x, 0.16, -0.142);
      if (s !== 'round') r.rotation.z = Math.PI / 4;
      head.add(r);
      const l = mesh(new THREE.CircleGeometry(0.03, s === 'round' ? 12 : 4), lens, x, 0.16, -0.143);
      l.rotation.y = Math.PI;
      if (s !== 'round') l.rotation.z = Math.PI / 4;
      head.add(l);
    }
    head.add(mesh(new THREE.BoxGeometry(0.03, 0.007, 0.007), frame, 0, 0.165, -0.142));
  }

  buildHat(head) {
    const s = this.look.hat;
    if (s === 'none') return;
    const c = this.look.suit;
    if (s === 'cap') {
      head.add(mesh(new THREE.SphereGeometry(0.152, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.5), mat(c, 0.7), 0, 0.17, 0));
      const brim = mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.015, 12, 1, false, -Math.PI / 2, Math.PI), mat(shade(c, 0.7), 0.7), 0, 0.18, -0.09);
      head.add(brim);
    } else if (s === 'beanie') {
      head.add(mesh(new THREE.SphereGeometry(0.155, 12, 7, 0, Math.PI * 2, 0, Math.PI * 0.52), mat('#d6304a', 0.95), 0, 0.15, 0));
      head.add(mesh(new THREE.CylinderGeometry(0.158, 0.158, 0.05, 12), mat('#b52436', 0.95), 0, 0.16, 0));
      head.add(mesh(new THREE.IcosahedronGeometry(0.04, 0), mat('#f4f1ea', 0.95), 0, 0.31, 0));
    } else if (s === 'hardhat') {
      head.add(mesh(new THREE.SphereGeometry(0.16, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.5), mat('#f2c230', 0.35), 0, 0.17, 0));
      head.add(mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.015, 14), mat('#e0b020', 0.35), 0, 0.18, 0));
      head.add(mesh(new THREE.BoxGeometry(0.025, 0.03, 0.3), mat('#e0b020', 0.35), 0, 0.31, 0));
    } else if (s === 'bucket') {
      head.add(mesh(new THREE.CylinderGeometry(0.13, 0.155, 0.1, 12), mat('#c9b48a', 0.9), 0, 0.27, 0));
      head.add(mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.015, 14), mat('#b8a274', 0.9), 0, 0.22, 0));
    } else if (s === 'bandana') {
      head.add(mesh(new THREE.CylinderGeometry(0.147, 0.147, 0.06, 12), mat('#d6304a', 0.8), 0, 0.22, 0));
      const knot = mesh(new THREE.ConeGeometry(0.04, 0.12, 4), mat('#d6304a', 0.8), 0, 0.2, 0.16);
      knot.rotation.x = Math.PI / 2.4;
      head.add(knot);
    } else if (s === 'headphones') {
      const band = mesh(new THREE.TorusGeometry(0.15, 0.015, 6, 16, Math.PI), mat('#1b1b1e', 0.4), 0, 0.15, 0);
      band.rotation.y = Math.PI / 2;
      head.add(band);
      for (const x of [-0.15, 0.15]) {
        const cup = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 12), mat(c, 0.4), x, 0.13, 0);
        cup.rotation.z = Math.PI / 2;
        head.add(cup);
      }
    }
  }

  setLook(look) {
    this.look = { ...this.look, ...look };
    this.build();
  }

  setPose({ pos, yaw = 0, pitch = 0, crouch = 0, speed = 0, holding = false, ragdollParts = null, dt = 1 / 60 } = {}) {
    const P = this.parts;
    const root = this.object3d;
    if (ragdollParts) return this.ragdollPose(ragdollParts);
    if (pos) root.position.copy(pos);
    root.rotation.set(0, yaw, 0);
    this.t += dt;
    this.speed += (speed - this.speed) * Math.min(1, dt * 10);
    const sp = this.speed;
    this.phase += dt * (sp > 0.2 ? 2.2 + sp * 1.25 : 0);
    const swing = Math.min(1, sp / 4) * 0.75;
    const ph = this.phase;
    const bob = Math.abs(Math.sin(ph)) * 0.03 * Math.min(1, sp / 2);
    const breathe = Math.sin(this.t * 2) * 0.006;
    P.hips.position.y = 0.92 - crouch * 0.38 + bob;
    P.hips.rotation.y = Math.sin(ph) * swing * 0.12;
    P.torso.rotation.x = crouch * 0.35 + Math.min(1, sp / 6) * 0.12;
    P.torso.position.y = 0.1 + breathe;
    P.head.rotation.x = -pitch * 0.6 - crouch * 0.2;
    P.neck.rotation.x = -pitch * 0.25;
    for (const l of P.legs) {
      const a = Math.sin(ph + (l.s > 0 ? 0 : Math.PI)) * swing;
      l.hp.rotation.x = a - crouch * 1.25;
      l.kn.rotation.x = Math.max(0, -Math.cos(ph + (l.s > 0 ? 0 : Math.PI))) * swing * 1.1 + crouch * 2.0;
    }
    for (const a of P.arms) {
      const sw = Math.sin(ph + (a.s > 0 ? Math.PI : 0)) * swing * 0.9;
      if (holding && a.s > 0) {
        a.sh.rotation.set(-1.2 - pitch * 0.8, 0, 0.1);
        a.el.rotation.set(-0.5, 0, 0);
      } else {
        a.sh.rotation.set(sw, 0, a.s * (0.08 + crouch * 0.1));
        a.el.rotation.set(-0.25 - Math.max(0, sw) * 0.4, 0, 0);
      }
    }
    if (this.tag) this.tag.visible = this.showTag;
  }

  ragdollPose(parts) {
    const P = this.parts;
    const root = this.object3d;
    const p = parts.pelvis;
    if (!p) return;
    root.position.set(p.p[0], p.p[1] - 0.92, p.p[2]);
    root.quaternion.set(p.q[0], p.q[1], p.q[2], p.q[3]);
    const inv = root.quaternion.clone().invert();
    const rel = (q) => new THREE.Quaternion(q[0], q[1], q[2], q[3]).premultiply(inv);
    if (parts.torso) P.torso.quaternion.copy(rel(parts.torso.q));
    const relTo = (a, b) => new THREE.Quaternion(b[0], b[1], b[2], b[3]).premultiply(new THREE.Quaternion(a[0], a[1], a[2], a[3]).invert());
    if (parts.torso && parts.head) P.head.quaternion.copy(relTo(parts.torso.q, parts.head.q));
    for (const [arr, names, base] of [[P.arms, ['armL', 'armR'], 'torso'], [P.legs, ['thighL', 'thighR'], 'pelvis']]) {
      arr.forEach((seg, i) => {
        const n = names[seg.s < 0 ? 0 : 1];
        if (parts[n] && parts[base]) (seg.sh ?? seg.hp).quaternion.copy(relTo(parts[base].q, parts[n].q));
      });
    }
    P.legs.forEach((l) => {
      const thigh = parts[l.s < 0 ? 'thighL' : 'thighR'], shin = parts[l.s < 0 ? 'shinL' : 'shinR'];
      if (thigh && shin) l.kn.quaternion.copy(relTo(thigh.q, shin.q));
    });
    if (this.tag) this.tag.visible = this.showTag;
  }

  dispose() {
    this.object3d.removeFromParent();
    this.object3d.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material?.map) o.material.map.dispose();
    });
  }
}
