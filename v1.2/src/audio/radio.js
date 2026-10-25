// Rug Rush warehouse radio: a carryable boombox that plays the radio tracks positionally; LMB toggles it, RMB skips a track.
import * as THREE from 'three';
import { Item } from '../tools/items.js';

function boomboxModel() {
  const g = new THREE.Group();
  const m = (c, r = 0.5, me = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: me, flatShading: true });
  const add = (geo, mat, x, y, z) => {
    const o = new THREE.Mesh(geo, mat);
    o.position.set(x, y, z);
    o.castShadow = true;
    g.add(o);
    return o;
  };
  add(new THREE.BoxGeometry(0.46, 0.22, 0.13), m('#ff5d8f', 0.45), 0, 0.11, 0);
  const grill = m('#1b1b1e', 0.8);
  for (const x of [-0.14, 0.14]) {
    const s = add(new THREE.CylinderGeometry(0.075, 0.075, 0.02, 18), grill, x, 0.11, -0.066);
    s.rotation.x = Math.PI / 2;
    const c = add(new THREE.CylinderGeometry(0.03, 0.03, 0.025, 12), m('#ffd23f', 0.4), x, 0.11, -0.07);
    c.rotation.x = Math.PI / 2;
  }
  add(new THREE.BoxGeometry(0.1, 0.05, 0.02), m('#3bceac', 0.3), 0, 0.15, -0.066);
  const led = add(new THREE.BoxGeometry(0.04, 0.012, 0.012), new THREE.MeshStandardMaterial({ color: '#52c46b', emissive: '#52c46b', emissiveIntensity: 2 }), 0, 0.07, -0.068);
  led.name = 'led';
  const h = add(new THREE.TorusGeometry(0.12, 0.012, 6, 16, Math.PI), m('#c3c7cb', 0.3, 0.8), 0, 0.22, 0);
  h.name = 'handle';
  return g;
}

export class Radio extends Item {
  constructor(game, position, yaw = 0) {
    const group = boomboxModel();
    super(game, { label: 'Warehouse radio', group, shape: { type: 'box', x: 0.23, y: 0.11, z: 0.065, cy: 0.11 }, mass: 2.2, position, yaw, holdPose: { pos: new THREE.Vector3(0.22, -0.32, -0.55), rot: new THREE.Euler(0, Math.PI, 0) } });
    this.on = true;
    this.persistent = true;
    this.led = group.getObjectByName('led');
    game.items?.push(this);
    this.radio = game.audio?.startRadio(new THREE.Vector3(position.x, position.y, position.z));
  }

  hint() {
    return 'LMB on/off · RMB next track';
  }

  info() {
    return this.on ? 'Playing' : 'Off';
  }

  useStart() {
    this.on = !this.on;
    this.radio?.setEnabled(this.on && this.game.settings?.radio !== false);
  }

  altStart() {
    if (!this.radio?.src) return;
    try {
      this.radio.src.onended = null;
      this.radio.src.stop();
    } catch (e) {}
    this.radio.next();
  }

  update() {
    const p = this.mesh.position;
    if (this.radio?.pan && this.game.audio?.ctx) this.game.audio.setPannerPos(this.radio.pan, p);
    if (this.led) this.led.material.emissiveIntensity = this.on ? 1.5 + Math.sin(performance.now() / 120) * 0.8 : 0;
  }
}
