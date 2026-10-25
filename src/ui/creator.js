// Rug Rush character creator: sticker-style option chips with a live turntable preview of the hand-scripted avatar.
import * as THREE from 'three';
import { Avatar, LOOK_OPTIONS, randomLook, saveLook } from '../player/avatar.js';
import { el, button } from './theme.js';

const LABELS = {
  hair: { none: 'Bald', buzz: 'Buzz', short: 'Short', swoop: 'Swoop', curly: 'Curly', bun: 'Bun', long: 'Long', mohawk: 'Mohawk' },
  hat: { none: 'None', cap: 'Cap', beanie: 'Beanie', hardhat: 'Hard hat', bucket: 'Bucket', bandana: 'Bandana', headphones: 'Headphones' },
  glasses: { none: 'None', round: 'Round', square: 'Square', goggles: 'Goggles', shades: 'Shades' },
  beard: { none: 'None', stubble: 'Stubble', mustache: 'Mustache', goatee: 'Goatee', full: 'Full' },
};

export class Creator {
  constructor({ look, sfx, onDone }) {
    this.look = { ...look };
    this.sfx = sfx ?? (() => {});
    this.onDone = onDone;
    this.root = el('div', { class: 'rr-screen dim rr-ui' });
    const panel = el('div', { class: 'rr-panel', style: 'display:grid;grid-template-columns:minmax(260px,340px) minmax(280px,1fr);gap:22px;width:min(900px,96vw)' });
    this.root.append(panel);
    const left = el('div', { style: 'position:relative' });
    this.canvas = el('canvas', { style: 'width:100%;aspect-ratio:3/4;border:3px solid var(--ink);border-radius:20px;background:linear-gradient(#bfe7ff,#fff3c4);display:block' });
    left.append(el('h2', {}, 'Your worker'), this.canvas);
    left.append(el('div', { class: 'rr-row', style: 'margin-top:14px' },
      button('Random', { cls: 'cyan small', sfx: this.sfx, onClick: () => this.set(randomLook()) }),
      button('Done', { cls: 'pink', sfx: this.sfx, onClick: () => this.done() }),
    ));
    const right = el('div', { class: 'rr-col', style: 'gap:2px' });
    this.nameInput = el('input', { class: 'rr-input', maxlength: '18', value: this.look.name ?? '' });
    this.nameInput.addEventListener('input', () => this.set({ name: this.nameInput.value.trim() || 'Worker' }, true));
    right.append(el('div', { class: 'rr-label' }, 'Name'), this.nameInput);
    this.groups = {};
    const swatches = (key, label) => {
      const row = el('div', { class: 'rr-row', style: 'gap:8px' });
      for (const v of LOOK_OPTIONS[key]) {
        const none = v === 'none';
        const c = el('button', { class: `rr-chip ${none ? '' : 'rr-swatch'}`, style: none ? '' : `background:${v}`, title: v }, none ? 'None' : '');
        c.addEventListener('click', () => { this.sfx('ui_pop'); this.set({ [key]: v }); });
        row.append(c);
        (this.groups[key] ??= []).push([v, c]);
      }
      right.append(el('div', { class: 'rr-label' }, label), row);
    };
    const chips = (key, label) => {
      const row = el('div', { class: 'rr-row', style: 'gap:8px' });
      for (const v of LOOK_OPTIONS[key]) {
        const c = el('button', { class: 'rr-chip' }, LABELS[key]?.[v] ?? v);
        c.addEventListener('click', () => { this.sfx('ui_pop'); this.set({ [key]: v }); });
        row.append(c);
        (this.groups[key] ??= []).push([v, c]);
      }
      right.append(el('div', { class: 'rr-label' }, label), row);
    };
    swatches('suit', 'Overalls');
    swatches('skin', 'Skin');
    chips('hair', 'Hair');
    swatches('hairColor', 'Hair colour');
    chips('hat', 'Hat');
    chips('glasses', 'Glasses');
    chips('beard', 'Facial hair');
    swatches('gloves', 'Gloves');
    swatches('boots', 'Boots');
    panel.append(left, right);
    document.body.append(this.root);
    this.initPreview();
    this.refresh();
  }

  initPreview() {
    const r = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer = r;
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7a6a, 1.4));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(2, 4, 3);
    this.scene.add(key);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.75, 0.08, 40), new THREE.MeshStandardMaterial({ color: '#ffd23f', roughness: 0.6 }));
    disc.position.y = -0.04;
    this.scene.add(disc);
    this.cam = new THREE.PerspectiveCamera(32, 3 / 4, 0.1, 20);
    this.cam.position.set(0, 1.25, 4.2);
    this.cam.lookAt(0, 1.0, 0);
    this.avatar = new Avatar(this.look, { tag: false });
    this.scene.add(this.avatar.object3d);
    this.spin = Math.PI;
    let last = performance.now();
    const loop = (now) => {
      if (!this.root.isConnected) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      this.spin += dt * 0.6;
      const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
      if (w && (this.canvas.width !== Math.round(w * r.getPixelRatio()))) r.setSize(w, h, false);
      this.avatar.setPose({ pos: new THREE.Vector3(), yaw: this.spin, speed: 0, dt });
      r.render(this.scene, this.cam);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  set(patch, keepName = false) {
    this.look = { ...this.look, ...patch };
    if (!keepName) this.nameInput.value = this.look.name ?? '';
    this.avatar?.setLook(this.look);
    this.refresh();
  }

  refresh() {
    for (const [key, list] of Object.entries(this.groups)) for (const [v, c] of list) c.classList.toggle('on', this.look[key] === v);
  }

  done() {
    saveLook(this.look);
    this.close();
    this.onDone?.(this.look);
  }

  close() {
    this.avatar?.dispose();
    this.renderer?.dispose();
    this.renderer?.forceContextLoss?.();
    this.root.remove();
  }
}
