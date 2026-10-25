// Rug Rush stretch-wrap film: crinkled glossy shrink film around a rolled rug with gathered ends and an optional sticker.
import * as THREE from 'three';
import { crinkleNormal, defaultStickerTexture, filmAlpha } from './detail.js';

export class WrapFilm {
  constructor(parent, width, radius, core, stickerTex) {
    this.group = new THREE.Group();
    parent.add(this.group);
    const half = width / 2, over = 0.07;
    const ax = 30, rad = 48;
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= ax; i++) {
      const x = -half - over + (i / ax) * (width + over * 2);
      const e = Math.max(0, Math.abs(x) - half) / over;
      const k = e * e * (3 - 2 * e);
      const r = radius + 0.004 + (core * 1.4 - radius) * k * 0.85;
      const pinch = 1 + 0.08 * k;
      for (let j = 0; j <= rad; j++) {
        const a = (j / rad) * Math.PI * 2;
        const wob = 1 + 0.012 * Math.sin(a * 7 + i * 1.3) * (0.3 + k);
        pos.push(x * (e > 0 ? 1 : 1), r * wob * Math.cos(a) / pinch, r * wob * Math.sin(a));
        uv.push(x / 0.25, (a * radius) / 0.25);
      }
    }
    for (let i = 0; i < ax; i++) for (let j = 0; j < rad; j++) {
      const a = i * (rad + 1) + j, b = a + 1, c = a + rad + 1, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
    const g = new THREE.BufferGeometry();
    g.setIndex(idx);
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    this.mat = new THREE.MeshPhysicalMaterial({
      color: 0xf1f5f8, transparent: true, opacity: 1, alphaMap: filmAlpha(), roughness: 0.08, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.04,
      normalMap: crinkleNormal(), normalScale: new THREE.Vector2(1.1, 1.1), side: THREE.DoubleSide, depthWrite: false, specularIntensity: 1, ior: 1.5, envMapIntensity: 2.5,
    });
    this.mat.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <alphamap_fragment>', '#include <alphamap_fragment>\nfloat rrFr = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition))), 3.0);\ndiffuseColor.a = clamp(diffuseColor.a * 1.1 + rrFr * 0.55, 0.0, 0.9);');
    };
    this.film = new THREE.Mesh(g, this.mat);
    this.film.renderOrder = 3;
    this.film.castShadow = false;
    this.film.receiveShadow = true;
    this.group.add(this.film);
    const sw = Math.min(0.24, width * 0.4), span = 0.12 / (radius + 0.006);
    const sg = new THREE.BufferGeometry();
    const sp = [], su = [], si = [];
    const nx = 6, ny = 8;
    for (let i = 0; i <= nx; i++) for (let j = 0; j <= ny; j++) {
      const x = -sw / 2 + (i / nx) * sw;
      const a = Math.PI / 2 - span / 2 + (j / ny) * span;
      const r = radius + 0.0055;
      sp.push(x, r * Math.cos(a), r * Math.sin(a));
      su.push(i / nx, 1 - j / ny);
    }
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
      const a = i * (ny + 1) + j, b = a + 1, c = a + ny + 1, d = c + 1;
      si.push(a, c, b, b, c, d);
    }
    sg.setIndex(si);
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    sg.setAttribute('uv', new THREE.Float32BufferAttribute(su, 2));
    sg.computeVertexNormals();
    this.stickerMat = new THREE.MeshStandardMaterial({ map: stickerTex ?? defaultStickerTexture(), roughness: 0.45, metalness: 0, side: THREE.DoubleSide });
    this.sticker = new THREE.Mesh(sg, this.stickerMat);
    this.sticker.castShadow = false;
    this.sticker.receiveShadow = true;
    this.group.add(this.sticker);
  }

  dispose() {
    this.group.parent?.remove(this.group);
    this.film.geometry.dispose();
    this.sticker.geometry.dispose();
    this.mat.dispose();
    this.stickerMat.dispose();
  }
}
