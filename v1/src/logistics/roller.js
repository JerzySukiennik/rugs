// Rug Rush rolling machine: floor belt, motorized shaft that winds a dry rug, wraps it in stretch film and prints a graded sticker.
import * as THREE from 'three';
import { R, GROUP, groups } from '../core/physics.js';

const HALF_W = 2.45;
const BELT_L = 4.6;

function stickerCanvas(job, ev, price, type) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#fffdf6';
  g.fillRect(0, 0, 512, 256);
  g.fillStyle = '#1d1f24';
  g.font = 'bold 30px Helvetica, Arial, sans-serif';
  g.fillText('RUG RUSH · CLEANED', 24, 46);
  g.font = '22px Helvetica, Arial, sans-serif';
  g.fillText(job?.client ?? 'Client', 24, 84);
  g.fillText(type, 24, 114);
  g.fillText(`Clean ${Math.round(ev.clean * 100)}%  ·  Damage ${Math.round(ev.damage * 100)}%`, 24, 150);
  g.font = 'bold 34px Helvetica, Arial, sans-serif';
  g.fillStyle = price < 0 ? '#b3261e' : '#1f8a4c';
  g.fillText(`${price < 0 ? '−' : ''}$${Math.abs(price)}`, 24, 214);
  g.fillStyle = ev.ruined ? '#b3261e' : '#1d1f24';
  g.font = 'bold 150px Helvetica, Arial, sans-serif';
  g.textAlign = 'right';
  g.fillText(ev.grade, 490, 200);
  for (let i = 0; i < 30; i++) {
    g.fillStyle = '#1d1f24';
    g.fillRect(300 + i * 6, 218, i % 3 ? 2 : 4, 26);
  }
  return c;
}

export class Roller {
  constructor(game, { x, z, yaw = 0 }) {
    this.game = game;
    this.kind = 'roller';
    this.origin = new THREE.Vector3(x, 0, z);
    this.yaw = yaw;
    this.q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    this.state = 'idle';
    this.t = 0;
    this.carpet = null;
    this.feedSpeed = 0.45;
    this.message = 'READY';
    this.build();
    const self = this;
    this.api = {
      axisPoint: () => self.local(0, 0.36, 0.2),
      axisDir: () => new THREE.Vector3(1, 0, 0).applyQuaternion(self.q),
      feedSpeed: this.feedSpeed,
    };
  }

  local(x, y, z, out = new THREE.Vector3()) {
    return out.set(x, y, z).applyQuaternion(this.q).add(this.origin);
  }

  build() {
    const g = new THREE.Group();
    g.position.copy(this.origin);
    g.quaternion.copy(this.q);
    const m = (c, r = 0.5, me = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: me });
    const add = (geo, mat, x, y, z) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      g.add(mesh);
      return mesh;
    };
    const beltCanvas = document.createElement('canvas');
    beltCanvas.width = 64;
    beltCanvas.height = 64;
    const bg = beltCanvas.getContext('2d');
    bg.fillStyle = '#26282b';
    bg.fillRect(0, 0, 64, 64);
    bg.fillStyle = '#34373b';
    for (let i = 0; i < 64; i += 8) bg.fillRect(0, i, 64, 3);
    const beltTex = new THREE.CanvasTexture(beltCanvas);
    beltTex.wrapS = beltTex.wrapT = THREE.RepeatWrapping;
    beltTex.repeat.set(10, 10);
    this.beltTex = beltTex;
    add(new THREE.BoxGeometry(HALF_W * 2, 0.08, BELT_L), new THREE.MeshStandardMaterial({ map: beltTex, roughness: 0.85 }), 0, 0.04, -BELT_L / 2);
    const yellow = m('#f2b630', 0.45);
    add(new THREE.BoxGeometry(0.06, 0.09, BELT_L), yellow, HALF_W + 0.03, 0.045, -BELT_L / 2);
    add(new THREE.BoxGeometry(0.06, 0.09, BELT_L), yellow, -HALF_W - 0.03, 0.045, -BELT_L / 2);
    const frame = m('#3b6fb6', 0.4, 0.3);
    add(new THREE.BoxGeometry(0.25, 1.3, 0.9), frame, HALF_W + 0.2, 0.65, 0.2);
    add(new THREE.BoxGeometry(0.25, 1.3, 0.9), frame, -HALF_W - 0.2, 0.65, 0.2);
    add(new THREE.BoxGeometry(HALF_W * 2 + 0.65, 0.35, 0.9), frame, 0, 1.45, 0.2);
    const shaftGeo = new THREE.CylinderGeometry(0.05, 0.05, HALF_W * 2 + 0.2, 16);
    shaftGeo.rotateZ(Math.PI / 2);
    this.shaft = add(shaftGeo, m('#c3c7cb', 0.25, 0.9), 0, 0.36, 0.2);
    const filmGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.5, 16);
    this.film = add(filmGeo, m('#dfeff7', 0.15, 0), HALF_W + 0.45, 0.9, 0.4);
    add(new THREE.BoxGeometry(HALF_W * 2 + 0.6, 0.06, 0.9), m('#4d5257', 0.6, 0.2), 0, 0.16, 1.0).rotation.x = -0.18;
    const panel = new THREE.Group();
    panel.position.set(-HALF_W - 0.8, 0, -0.6);
    g.add(panel);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.1, 0.12), frame);
    post.position.y = 0.55;
    panel.add(post);
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.32, 0.16), m('#e9ecef', 0.5));
    box.position.y = 1.2;
    panel.add(box);
    const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 20), new THREE.MeshStandardMaterial({ color: '#2fbf55', emissive: '#1a8a3a', emissiveIntensity: 0.6 }));
    btn.rotation.x = Math.PI / 2;
    btn.position.set(0.1, 1.2, -0.09);
    panel.add(btn);
    this.btn = btn;
    const dc = document.createElement('canvas');
    dc.width = 256;
    dc.height = 96;
    this.displayCanvas = dc;
    this.displayTex = new THREE.CanvasTexture(dc);
    this.displayTex.colorSpace = THREE.SRGBColorSpace;
    const disp = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.16), new THREE.MeshBasicMaterial({ map: this.displayTex, toneMapped: false }));
    disp.position.set(0, 1.62, 0);
    disp.rotation.y = Math.PI;
    const dispBack = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.2, 0.05), m('#1d1f24', 0.5));
    dispBack.position.set(0, 1.62, 0.03);
    panel.add(dispBack, disp);
    panel.rotation.y = Math.PI;
    this.panel = panel;
    this.mesh = g;
    this.game.engine.scene.add(g);
    this.drawDisplay();
    const ph = this.game.physics;
    const qy = { x: this.q.x, y: this.q.y, z: this.q.z, w: this.q.w };
    const coll = (hx, hy, hz, x, y, z, owner = null) => {
      const p = this.local(x, y, z);
      return ph.addCollider(R.ColliderDesc.cuboid(hx, hy, hz).setTranslation(p.x, p.y, p.z).setRotation(qy).setFriction(0.9).setCollisionGroups(groups(GROUP.STATIC)), null, owner);
    };
    coll(HALF_W, 0.04, BELT_L / 2, 0, 0.04, -BELT_L / 2);
    coll(0.125, 0.65, 0.45, HALF_W + 0.2, 0.65, 0.2);
    coll(0.125, 0.65, 0.45, -HALF_W - 0.2, 0.65, 0.2);
    coll(HALF_W + 0.3, 0.17, 0.45, 0, 1.45, 0.2);
    const btnOwner = {
      kind: 'button',
      label: 'Roller: roll & wrap',
      interactVerb: 'start',
      interact: () => this.press(),
    };
    coll(0.25, 0.55, 0.15, -HALF_W - 0.8, 0.85, -0.6, btnOwner);
  }

  drawDisplay() {
    const g = this.displayCanvas.getContext('2d');
    g.fillStyle = '#0d1a12';
    g.fillRect(0, 0, 256, 96);
    g.fillStyle = this.message.startsWith('TOO') || this.message.startsWith('NO') ? '#ff6a4d' : '#6dff9a';
    g.font = 'bold 34px ui-monospace, Menlo, monospace';
    g.textAlign = 'center';
    g.fillText(this.message, 128, 60);
    this.displayTex.needsUpdate = true;
  }

  say(msg) {
    if (msg === this.message) return;
    this.message = msg;
    this.drawDisplay();
  }

  onBelt(c) {
    if (c.state === 'rolled' || c.wrapped) return false;
    const p = c.uvToWorld?.(0.5, 0.5)?.point;
    if (!p) return false;
    const l = p.clone().sub(this.origin).applyQuaternion(this.q.clone().invert());
    return Math.abs(l.x) < HALF_W + 0.3 && l.z < 0.3 && l.z > -BELT_L - 0.3 && l.y < 1.0;
  }

  press() {
    if (this.state !== 'idle') return;
    const g = this.game;
    const c = (g.carpets?.list ?? []).find((k) => this.onBelt(k));
    if (!c) {
      this.say('NO RUG');
      g.hud?.toast('Lay a rug flat on the belt first.');
      return;
    }
    const ev = g.chem?.evaluate(c);
    if (ev && !ev.dryEnough) {
      this.say(`TOO WET ${Math.round(ev.wet * 100)}%`);
      g.hud?.toast(`Too wet to roll (${Math.round(ev.wet * 100)}% moisture). Dry it first.`, true);
      return;
    }
    if (c.width > HALF_W * 2 + 0.1) {
      this.say('TOO WIDE');
      return;
    }
    this.carpet = c;
    this.ev = ev;
    this.price = ev ? g.chem.price(c, ev) : 0;
    c.attachToRoller(this.api);
    this.state = 'rolling';
    this.t = 0;
    this.say('ROLLING');
  }

  fixedUpdate(dt) {
    this.t += dt;
    const c = this.carpet;
    if (this.state === 'rolling') {
      this.shaft.rotation.x -= dt * 6;
      this.beltTex.offset.y -= dt * this.feedSpeed * 2;
      this.say(`ROLLING ${Math.round((c.rollerProgress ?? 0) * 100)}%`);
      if ((c.rollerProgress ?? 0) >= 1 || this.t > 30) {
        this.state = 'wrapping';
        this.t = 0;
        this.say('WRAPPING');
      }
    } else if (this.state === 'wrapping') {
      this.shaft.rotation.x -= dt * 9;
      this.film.rotation.y += dt * 14;
      this.film.position.x = HALF_W + 0.45 - Math.min(1, this.t / 2.4) * (HALF_W * 2 + 0.9);
      if (this.t > 2.4) {
        const cv = stickerCanvas(c.job, this.ev ?? { clean: 0, damage: 0, grade: '?', ruined: false }, this.price, c.displayName?.() ?? c.type);
        const tex = new THREE.CanvasTexture(cv);
        tex.colorSpace = THREE.SRGBColorSpace;
        c.setWrapped(true, tex);
        c.finalEval = this.ev;
        c.finalPrice = this.price;
        c.releaseFromRoller();
        const out = new THREE.Vector3(0, 0, 1).applyQuaternion(this.q);
        if (c.body) c.body.applyImpulse({ x: out.x * c.mass * 0.6, y: c.mass * 0.4, z: out.z * c.mass * 0.6 }, true);
        this.game.onRugWrapped?.(c, this.ev, this.price);
        this.say(`DONE ${this.ev?.grade ?? ''}`);
        this.state = 'cooldown';
        this.t = 0;
        this.film.position.x = HALF_W + 0.45;
      }
    } else if (this.state === 'cooldown') {
      if (this.t > 2) {
        this.state = 'idle';
        this.carpet = null;
        this.say('READY');
      }
    }
    this.btn.material.emissiveIntensity = this.state === 'idle' ? 0.6 + Math.sin(performance.now() / 300) * 0.3 : 0.1;
  }
}
