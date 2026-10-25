// Rug Rush rolling machine: floor belt, motorized shaft that winds a dry rug, wraps it in stretch film and prints a graded sticker.
import * as THREE from 'three';
import { R, GROUP, groups } from '../core/physics.js';
import * as K from '../world/kit.js';

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
    const parts = [];
    const P = (geo, col, o = {}) => parts.push(K.paint(geo, col, o));
    const GR = '#30363d', ST = '#cfd4d8', YE = '#f2c230';
    const beltCanvas = document.createElement('canvas');
    beltCanvas.width = 64;
    beltCanvas.height = 64;
    const bg = beltCanvas.getContext('2d');
    bg.fillStyle = '#1e2023';
    bg.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 64; i += 8) {
      bg.fillStyle = '#2c2f33';
      bg.fillRect(0, i, 64, 3);
      bg.fillStyle = '#141517';
      bg.fillRect(0, i + 3, 64, 1);
    }
    for (let i = 0; i < 90; i++) {
      bg.fillStyle = `rgba(255,255,255,${0.02 + K.hash(i, 3) * 0.03})`;
      bg.fillRect(K.hash(i, 1) * 64, K.hash(i, 2) * 64, 2, 1);
    }
    const beltTex = new THREE.CanvasTexture(beltCanvas);
    beltTex.wrapS = beltTex.wrapT = THREE.RepeatWrapping;
    beltTex.repeat.set(10, 10);
    beltTex.anisotropy = 8;
    this.beltTex = beltTex;
    const belt = new THREE.Mesh(new THREE.BoxGeometry(HALF_W * 2, 0.08, BELT_L), new THREE.MeshStandardMaterial({ map: beltTex, roughness: 0.82 }));
    belt.position.set(0, 0.04, -BELT_L / 2);
    belt.receiveShadow = true;
    g.add(belt);
    for (const s of [-1, 1]) {
      P(K.box(0.07, 0.1, BELT_L + 0.1, { x: s * (HALF_W + 0.035), y: 0.05, z: -BELT_L / 2 }), ST, { r: 0.28, m: 0.9 });
      P(K.box(0.012, 0.012, BELT_L, { x: s * (HALF_W + 0.07), y: 0.085, z: -BELT_L / 2 }), YE, { r: 0.5 });
      for (let z = -BELT_L + 0.3; z < 0; z += 1.1) P(K.cyl(0.012, 0.012, 0.01, 8).rotateZ(Math.PI / 2).translate(s * (HALF_W + 0.072), 0.05, z), '#7d848b', { r: 0.4, m: 0.8 });
    }
    const endRoll = K.cyl(0.045, 0.045, HALF_W * 2, 20);
    endRoll.rotateZ(Math.PI / 2);
    P(endRoll.clone().translate(0, 0.045, -BELT_L), '#26282b', { r: 0.8 });
    P(endRoll.clone().translate(0, 0.045, 0.0), '#26282b', { r: 0.8 });
    for (const s of [-1, 1]) {
      const tower = K.roundedBox(0.25, 1.3, 0.9, 0.035, 2);
      tower.translate(s * (HALF_W + 0.2), 0.65, 0.2);
      P(tower, GR, { r: 0.4, m: 0.35 });
      P(K.box(0.255, 0.1, 0.905, { x: s * (HALF_W + 0.2), y: 0.12, z: 0.2 }), YE, { r: 0.5, shade: (x, y, z) => (Math.floor((z + y) / 0.08) % 2 ? 0.15 : 1) });
      for (let i = 0; i < 6; i++) P(K.box(0.01, 0.025, 0.5, { x: s * (HALF_W + 0.33), y: 0.55 + i * 0.07, z: 0.2 }), '#1c2024', { r: 0.6 });
      P(K.box(0.4, 0.015, 1.0, { x: s * (HALF_W + 0.2), y: 0.008, z: 0.2 }), '#4b525a', { r: 0.5, m: 0.5 });
    }
    const beam = K.roundedBox(HALF_W * 2 + 0.65, 0.35, 0.9, 0.04, 2);
    beam.translate(0, 1.45, 0.2);
    P(beam, GR, { r: 0.4, m: 0.35 });
    P(K.box(HALF_W * 2 + 0.4, 0.03, 0.01, { x: 0, y: 1.3, z: -0.255 }), '#7dffb0', { r: 0.3, e: 0.9 });
    P(K.box(HALF_W * 2 + 0.4, 0.03, 0.01, { x: 0, y: 1.3, z: 0.655 }), '#7dffb0', { r: 0.3, e: 0.9 });
    P(K.box(HALF_W * 2, 0.04, 0.06, { x: 0, y: 1.22, z: 0.66 }), ST, { r: 0.3, m: 0.85 });
    const motor = K.roundedBox(0.36, 0.42, 0.55, 0.04, 2);
    motor.translate(HALF_W + 0.5, 0.75, 0.2);
    P(motor, '#2a3036', { r: 0.4, m: 0.4 });
    const mcyl = K.cyl(0.13, 0.13, 0.3, 20);
    mcyl.rotateZ(Math.PI / 2);
    mcyl.translate(HALF_W + 0.83, 0.75, 0.2);
    P(mcyl, '#3b6fb6', { r: 0.35, m: 0.4 });
    for (let i = 0; i < 8; i++) {
      const fin = K.cyl(0.14, 0.14, 0.012, 20);
      fin.rotateZ(Math.PI / 2);
      fin.translate(HALF_W + 0.72 + i * 0.03, 0.75, 0.2);
      P(fin, '#2f5c96', { r: 0.4, m: 0.4 });
    }
    P(K.cyl(0.12, 0.12, 0.03, 20).rotateZ(Math.PI / 2).translate(HALF_W + 0.99, 0.75, 0.2), '#26282b', { r: 0.5 });
    for (let i = 0; i < 5; i++) P(K.box(0.008, 0.02, 0.4, { x: HALF_W + 0.685, y: 0.62 + i * 0.06, z: 0.2 }), '#151719', { r: 0.6 });
    const chute = K.box(HALF_W * 2 + 0.6, 0.04, 0.9, { x: 0, y: 0, z: 0 });
    chute.rotateX(-0.18);
    chute.translate(0, 0.14, 1.0);
    P(chute, '#4d5257', { r: 0.5, m: 0.5 });
    for (let i = 0; i < 7; i++) {
      const rl = K.cyl(0.03, 0.03, HALF_W * 2 + 0.4, 12);
      rl.rotateZ(Math.PI / 2);
      const zz = 0.62 + i * 0.12;
      rl.translate(0, 0.14 + 0.05 - (zz - 1.0) * Math.tan(0.18), zz);
      P(rl, ST, { r: 0.25, m: 0.9 });
    }
    for (const s of [-1, 1]) P(K.box(0.05, 0.12, 0.92, { x: s * (HALF_W + 0.3), y: 0.17, z: 1.0 }).rotateX(0), GR, { r: 0.45, m: 0.3 });
    const px = -HALF_W - 0.8, pz = -0.6;
    P(K.box(0.12, 1.05, 0.12, { x: px, y: 0.525, z: pz }), YE, { r: 0.45, shade: (x, y) => (Math.floor(y / 0.12) % 2 ? 0.15 : 1) });
    P(K.box(0.36, 0.02, 0.3, { x: px, y: 0.01, z: pz }), '#4b525a', { r: 0.5, m: 0.5 });
    const cbox = K.roundedBox(0.44, 0.34, 0.18, 0.025, 2);
    cbox.translate(px, 1.2, pz);
    P(cbox, ST, { r: 0.3, m: 0.85 });
    P(K.box(0.4, 0.26, 0.01, { x: px, y: 1.2, z: pz - 0.093 }), '#1d2126', { r: 0.4 });
    P(K.cyl(0.075, 0.075, 0.02, 24).rotateX(Math.PI / 2).translate(px + 0.1, 1.2, pz - 0.1), YE, { r: 0.45 });
    P(K.cyl(0.02, 0.02, 0.025, 12).rotateX(Math.PI / 2).translate(px - 0.12, 1.16, pz - 0.1), '#d42a20', { r: 0.4 });
    const dback = K.roundedBox(0.48, 0.22, 0.06, 0.02, 2);
    dback.translate(px, 1.6, pz);
    P(dback, '#1d1f24', { r: 0.5 });
    P(K.box(0.04, 0.12, 0.04, { x: px, y: 1.43, z: pz }), '#4b525a', { r: 0.4, m: 0.6 });
    const body = new THREE.Mesh(K.merge(parts), K.vcolorMaterial('rr-roller'));
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);
    const shaftGeo = new THREE.CylinderGeometry(0.05, 0.05, HALF_W * 2 + 0.2, 20);
    shaftGeo.rotateZ(Math.PI / 2);
    this.shaft = new THREE.Mesh(shaftGeo, new THREE.MeshStandardMaterial({ color: '#d8dcdf', roughness: 0.18, metalness: 0.95 }));
    this.shaft.position.set(0, 0.36, 0.2);
    this.shaft.castShadow = true;
    g.add(this.shaft);
    const filmG = K.lathe([[0.072, -0.25], [0.075, -0.24], [0.075, 0.24], [0.072, 0.25]], { segs: 24 });
    this.film = new THREE.Mesh(filmG, new THREE.MeshStandardMaterial({ color: '#cfe8f3', roughness: 0.12, metalness: 0, transparent: true, opacity: 0.72 }));
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.54, 12), new THREE.MeshStandardMaterial({ color: '#b9895a', roughness: 0.8 }));
    this.film.add(core);
    this.film.position.set(HALF_W + 0.45, 0.9, 0.4);
    g.add(this.film);
    const carriageParts = [
      K.paint(K.roundedBox(0.16, 0.08, 0.12, 0.02, 1).translate(0, 0.32, 0.26), '#3b6fb6', { r: 0.4, m: 0.3 }),
      K.paint(K.box(0.04, 0.3, 0.04, { x: 0, y: 0.16, z: 0.26 }), '#9aa1a7', { r: 0.4, m: 0.7 }),
      K.paint(K.box(0.04, 0.04, 0.26, { x: 0, y: 0.0, z: 0.13 }), '#9aa1a7', { r: 0.4, m: 0.7 }),
      K.paint(K.cyl(0.02, 0.02, 0.62, 8, { y: 0 }), '#9aa1a7', { r: 0.4, m: 0.7 }),
    ];
    this.carriage = new THREE.Mesh(K.merge(carriageParts), K.vcolorMaterial('rr-roller-carriage'));
    this.carriage.castShadow = true;
    g.add(this.carriage);
    const panel = new THREE.Group();
    panel.position.set(px, 0, pz);
    g.add(panel);
    const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.045, 24), new THREE.MeshStandardMaterial({ color: '#2fbf55', emissive: '#1a8a3a', emissiveIntensity: 0.6, roughness: 0.3 }));
    btn.rotation.x = Math.PI / 2;
    btn.position.set(0.1, 1.2, -0.12);
    panel.add(btn);
    this.btn = btn;
    const dc = document.createElement('canvas');
    dc.width = 256;
    dc.height = 96;
    this.displayCanvas = dc;
    this.displayTex = new THREE.CanvasTexture(dc);
    this.displayTex.colorSpace = THREE.SRGBColorSpace;
    const disp = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.16), new THREE.MeshBasicMaterial({ map: this.displayTex, toneMapped: false }));
    disp.position.set(0, 1.6, -0.032);
    disp.rotation.y = Math.PI;
    panel.add(disp);
    this.panel = panel;
    this.mesh = g;
    this.game.engine.scene.add(g);
    this.drawDisplay();
    this.update();
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

  update() {
    if (this.carriage) this.carriage.position.set(this.film.position.x, 0.9, 0.4);
  }

  drawDisplay() {
    const g = this.displayCanvas.getContext('2d');
    g.fillStyle = '#07120c';
    g.fillRect(0, 0, 256, 96);
    g.fillStyle = 'rgba(109,255,154,0.06)';
    for (let y = 0; y < 96; y += 3) g.fillRect(0, y, 256, 1);
    const bad = this.message.startsWith('TOO') || this.message.startsWith('NO');
    g.fillStyle = bad ? '#ff6a4d' : '#6dff9a';
    g.font = '600 13px "Helvetica Neue", Arial, sans-serif';
    g.textAlign = 'left';
    g.fillText('ROLL & WRAP', 10, 18);
    g.textAlign = 'right';
    g.fillText(bad ? '● FAULT' : '● OK', 246, 18);
    g.font = 'bold 34px ui-monospace, Menlo, monospace';
    g.textAlign = 'center';
    g.fillText(this.message, 128, 66);
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
