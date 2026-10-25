// Rug Rush avatar adapter: uses the lead's Avatar (src/player/avatar.js) when it exists, otherwise a coloured capsule with a floating name tag.
import * as THREE from 'three';
import { RAGDOLL_PARTS } from '../player/ragdoll.js';

const SUITS = ['#2f6db5', '#d0462f', '#2f9a57', '#e0a024', '#7a49c9', '#1f8f9a', '#d4572a', '#3f4a5c'];
const SKINS = ['#f1c9a5', '#e2b48f', '#c98e64', '#a86b45', '#7a4a2e', '#5a3622'];
const HAIR = ['#1d1a17', '#4a3020', '#8a5a2b', '#c99a4b', '#e6d2a0', '#b2452a', '#8c8c8c'];
const NAMES = ['Mop', 'Suds', 'Fringe', 'Lint', 'Bristle', 'Shampoo', 'Nap', 'Tassel', 'Dusty', 'Sponge', 'Fluff', 'Rinse'];

let modPromise = null;

function pick(a) {
  return a[Math.floor(Math.random() * a.length)];
}

export function randomLook() {
  return {
    name: `${pick(NAMES)} ${10 + Math.floor(Math.random() * 90)}`,
    suit: pick(SUITS),
    skin: pick(SKINS),
    hair: pick(['short', 'long', 'bun', 'bald', 'curly']),
    hairColor: pick(HAIR),
    hat: pick([null, null, 'cap', 'beanie', 'hardhat']),
    glasses: Math.random() < 0.3,
    beard: Math.random() < 0.25,
    gloves: pick(['#e8d23a', '#2b2d30', '#3a7bd5', '#d94a3a']),
    boots: pick(['#1d1f24', '#5a3b22', '#3a3f45']),
  };
}

export function sanitizeLook(l) {
  const r = randomLook();
  const o = l && typeof l === 'object' ? l : {};
  const str = (v, n, d) => (typeof v === 'string' && v.length <= n ? v : d);
  return {
    name: str(o.name, 24, r.name).replace(/[\u0000-\u001f]/g, '').trim().slice(0, 24) || r.name,
    suit: str(o.suit, 16, r.suit),
    skin: str(o.skin, 16, r.skin),
    hair: str(o.hair, 16, r.hair),
    hairColor: str(o.hairColor, 16, r.hairColor),
    hat: o.hat === null ? null : str(o.hat, 16, null),
    glasses: !!o.glasses,
    beard: !!o.beard,
    gloves: str(o.gloves, 16, r.gloves),
    boots: str(o.boots, 16, r.boots),
  };
}

export function loadLook() {
  try {
    const s = localStorage.getItem('rugrush.look');
    if (s) return sanitizeLook(JSON.parse(s));
  } catch {}
  return randomLook();
}

export async function createAvatar(look) {
  modPromise ??= import('../player/avatar.js').catch(() => null);
  const m = await modPromise;
  if (m?.Avatar) {
    try {
      return new m.Avatar(look);
    } catch (e) {
      console.warn('[net] Avatar failed, using fallback', e?.message);
    }
  }
  return new FallbackAvatar(look);
}

function nameTag(text, color) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d');
  g.font = '600 56px -apple-system, Helvetica, Arial, sans-serif';
  const w = Math.min(500, g.measureText(text).width + 56);
  g.fillStyle = 'rgba(16,18,22,0.72)';
  const x = (512 - w) / 2;
  g.beginPath();
  g.roundRect(x, 24, w, 80, 40);
  g.fill();
  g.fillStyle = color;
  g.beginPath();
  g.arc(x + 36, 64, 12, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256 + 14, 66);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: true, transparent: true }));
  s.scale.set(0.9, 0.225, 1);
  return s;
}

export class FallbackAvatar {
  constructor(look) {
    this.look = look;
    const suit = new THREE.MeshStandardMaterial({ color: look.suit, roughness: 0.6 });
    const skin = new THREE.MeshStandardMaterial({ color: look.skin, roughness: 0.55 });
    const dark = new THREE.MeshStandardMaterial({ color: look.boots ?? '#1d1f24', roughness: 0.7 });
    this.mats = [suit, skin, dark];
    this.object3d = new THREE.Group();
    this.object3d.name = `avatar-${look.name}`;
    this.body = new THREE.Group();
    this.object3d.add(this.body);
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.25, 1.02, 6, 14), suit);
    torso.position.y = 0.79;
    this.torso = torso;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 18, 14), skin);
    head.position.y = 1.66;
    this.head = head;
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.04), dark);
    visor.position.set(0, 0.02, -0.14);
    head.add(visor);
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.45, 4, 8), suit);
    arm.geometry.translate(0, -0.25, 0);
    this.armL = arm;
    this.armR = arm.clone();
    this.armL.position.set(-0.31, 1.4, 0);
    this.armR.position.set(0.31, 1.4, 0);
    for (const m of [torso, head, visor, this.armL, this.armR]) m.castShadow = true;
    this.body.add(torso, head, this.armL, this.armR);
    this.tag = nameTag(look.name, look.suit);
    this.tag.position.y = 2.05;
    this.object3d.add(this.tag);
    this.parts = [];
    const pm = { suit, skin, boot: dark };
    for (const p of RAGDOLL_PARTS) {
      let geo;
      if (p.s) geo = new THREE.BoxGeometry(p.s[0] * 2, p.s[1] * 2, p.s[2] * 2);
      else if (p.r) geo = new THREE.SphereGeometry(p.r, 12, 10);
      else geo = new THREE.CapsuleGeometry(p.cap[1], p.cap[0] * 2, 4, 8);
      const m = new THREE.Mesh(geo, pm[p.c]);
      m.castShadow = true;
      m.visible = false;
      this.object3d.add(m);
      this.parts.push(m);
    }
    this.walk = 0;
    this.lastT = performance.now();
  }

  setPose({ pos, yaw = 0, pitch = 0, crouch = 0, speed = 0, holding = null, ragdollParts = null }) {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastT) / 1000);
    this.lastT = now;
    const rag = !!ragdollParts;
    this.body.visible = !rag;
    for (let i = 0; i < this.parts.length; i++) {
      const m = this.parts[i];
      m.visible = rag;
      if (rag && ragdollParts[i]) {
        m.position.copy(ragdollParts[i].pos).sub(pos);
        m.quaternion.copy(ragdollParts[i].quat);
      }
    }
    this.object3d.position.copy(pos);
    this.tag.position.y = rag ? 0.9 : 2.05 - crouch * 0.5;
    if (rag) return;
    this.body.rotation.y = yaw;
    this.body.scale.y = 1 - crouch * 0.3;
    this.head.rotation.x = pitch * 0.6;
    this.walk += dt * Math.min(speed, 7) * 2.2;
    const sw = Math.sin(this.walk) * Math.min(1, speed / 3) * 0.6;
    if (holding) {
      const a = -1.2 - pitch * 0.7;
      this.armL.rotation.x = a;
      this.armR.rotation.x = a;
    } else {
      this.armL.rotation.x = sw;
      this.armR.rotation.x = -sw;
    }
  }

  dispose() {
    this.object3d.removeFromParent();
    this.object3d.traverse((o) => {
      o.geometry?.dispose?.();
      if (o.material?.map) o.material.map.dispose();
      if (o.isSprite) o.material.dispose();
    });
    for (const m of this.mats) m.dispose();
  }
}
