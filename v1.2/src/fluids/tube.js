// Rug Rush fluids: dynamic multi-chain tube mesh with parallel-transport frames for the hose, jets and gel ropes.
import * as THREE from 'three';

const _t = new THREE.Vector3();
const _n = new THREE.Vector3();
const _b = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _x = new THREE.Vector3(1, 0, 0);

export function catmull(src, n, sub, out, rIn = null, rOut = null) {
  if (n < 2) return 0;
  let k = 0;
  for (let i = 0; i < n - 1; i++) {
    const i0 = Math.max(0, i - 1), i2 = i + 1, i3 = Math.min(n - 1, i + 2);
    for (let s = 0; s < sub; s++) {
      const t = s / sub, t2 = t * t, t3 = t2 * t;
      const a = -0.5 * t3 + t2 - 0.5 * t, b = 1.5 * t3 - 2.5 * t2 + 1, c = -1.5 * t3 + 2 * t2 + 0.5 * t, d = 0.5 * t3 - 0.5 * t2;
      for (let j = 0; j < 3; j++) out[k * 3 + j] = a * src[i0 * 3 + j] + b * src[i * 3 + j] + c * src[i2 * 3 + j] + d * src[i3 * 3 + j];
      if (rIn) rOut[k] = rIn[i] + (rIn[i2] - rIn[i]) * t;
      k++;
    }
  }
  for (let j = 0; j < 3; j++) out[k * 3 + j] = src[(n - 1) * 3 + j];
  if (rIn) rOut[k] = rIn[n - 1];
  return k + 1;
}

export class TubeMesh {
  constructor(maxRings, radial, material, { colors = false } = {}) {
    this.maxRings = maxRings;
    this.radial = radial;
    const vc = maxRings * radial;
    this.pos = new Float32Array(vc * 3);
    this.nor = new Float32Array(vc * 3);
    this.col = colors ? new Float32Array(vc * 3) : null;
    const geo = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aNor = new THREE.BufferAttribute(this.nor, 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.aPos);
    geo.setAttribute('normal', this.aNor);
    if (colors) {
      this.aCol = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('color', this.aCol);
    }
    const idx = vc > 65535 ? new Uint32Array((maxRings - 1) * radial * 6) : new Uint16Array((maxRings - 1) * radial * 6);
    let k = 0;
    for (let r = 0; r < maxRings - 1; r++) for (let s = 0; s < radial; s++) {
      const a = r * radial + s, b = r * radial + ((s + 1) % radial), c = a + radial, d = b + radial;
      idx[k++] = a; idx[k++] = b; idx[k++] = c;
      idx[k++] = b; idx[k++] = d; idx[k++] = c;
    }
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.setDrawRange(0, 0);
    this.geo = geo;
    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.frustumCulled = false;
    this.rings = 0;
    this.cos = new Float32Array(radial);
    this.sin = new Float32Array(radial);
    for (let s = 0; s < radial; s++) {
      this.cos[s] = Math.cos((s / radial) * Math.PI * 2);
      this.sin[s] = Math.sin((s / radial) * Math.PI * 2);
    }
  }

  begin() {
    this.rings = 0;
  }

  ring(px, py, pz, r, nx, ny, nz, color, capSign) {
    const R = this.radial, base = this.rings * R;
    for (let s = 0; s < R; s++) {
      const c = this.cos[s], si = this.sin[s];
      const dx = _n.x * c + _b.x * si, dy = _n.y * c + _b.y * si, dz = _n.z * c + _b.z * si;
      const o = (base + s) * 3;
      this.pos[o] = px + dx * r;
      this.pos[o + 1] = py + dy * r;
      this.pos[o + 2] = pz + dz * r;
      if (capSign !== 0) {
        this.nor[o] = nx * capSign;
        this.nor[o + 1] = ny * capSign;
        this.nor[o + 2] = nz * capSign;
      } else {
        this.nor[o] = dx;
        this.nor[o + 1] = dy;
        this.nor[o + 2] = dz;
      }
      if (this.col && color) {
        this.col[o] = color.r;
        this.col[o + 1] = color.g;
        this.col[o + 2] = color.b;
      }
    }
    this.rings++;
  }

  chain(pts, n, radii, color = null) {
    if (n < 2) return;
    const room = this.maxRings - this.rings - 2;
    if (room < 2) return;
    if (n > room) n = room;
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
      _t.set(pts[b * 3] - pts[a * 3], pts[b * 3 + 1] - pts[a * 3 + 1], pts[b * 3 + 2] - pts[a * 3 + 2]);
      const tl = _t.length();
      if (tl < 1e-7) _t.set(0, 1, 0);
      else _t.multiplyScalar(1 / tl);
      if (i === 0) {
        _n.crossVectors(_t, Math.abs(_t.y) < 0.9 ? _up : _x).normalize();
      } else {
        _n.addScaledVector(_t, -_n.dot(_t));
        const nl = _n.length();
        if (nl < 1e-5) _n.crossVectors(_t, Math.abs(_t.y) < 0.9 ? _up : _x).normalize();
        else _n.multiplyScalar(1 / nl);
      }
      _b.crossVectors(_t, _n);
      const px = pts[i * 3], py = pts[i * 3 + 1], pz = pts[i * 3 + 2];
      if (i === 0) this.ring(px, py, pz, 0, _t.x, _t.y, _t.z, color, -1);
      this.ring(px, py, pz, radii[i], 0, 0, 0, color, 0);
      if (i === n - 1) this.ring(px, py, pz, 0, _t.x, _t.y, _t.z, color, 1);
    }
  }

  end() {
    const n = this.rings * this.radial * 3;
    for (const at of [this.aPos, this.aNor, this.aCol]) {
      if (!at) continue;
      at.clearUpdateRanges();
      at.addUpdateRange(0, Math.max(n, 3));
      at.needsUpdate = true;
    }
    this.geo.setDrawRange(0, Math.max(0, this.rings - 1) * this.radial * 6);
    this.mesh.visible = this.rings > 1;
  }

  dispose() {
    this.geo.dispose();
  }
}

