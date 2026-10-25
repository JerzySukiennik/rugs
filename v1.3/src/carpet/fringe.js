// Rug Rush rug fringes and care label: verlet chains rooted at the rug ends driving GPU-instanced knotted strands and a fabric flap.
import * as THREE from 'three';
import { floorBaseHeightAt } from '../world/layout.js';
import { fringeMaterials } from './materials.js';
import { defaultLabelTexture } from './detail.js';

const K = 6;
const LK = 4;
const RINGS = 7;
const SIDES = 3;

function strandGeometry(count, ends, rnd) {
  const g = new THREE.InstancedBufferGeometry();
  const ring = [], pos = [], idx = [];
  for (let r = 0; r < RINGS; r++) for (let s = 0; s < SIDES; s++) {
    ring.push(r / (RINGS - 1), s / SIDES);
    pos.push(0, 0, 0);
  }
  for (let r = 0; r < RINGS - 1; r++) for (let s = 0; s < SIDES; s++) {
    const a = r * SIDES + s, b = r * SIDES + ((s + 1) % SIDES), c = a + SIDES, d = b + SIDES;
    idx.push(a, c, b, b, c, d);
  }
  g.setIndex(idx);
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aRing', new THREE.Float32BufferAttribute(ring, 2));
  const inst = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    inst[i * 4] = (i + 0.5) / count;
    inst[i * 4 + 1] = ends;
    inst[i * 4 + 2] = 0.86 + rnd() * 0.18;
    inst[i * 4 + 3] = rnd();
  }
  g.setAttribute('iStrand', new THREE.InstancedBufferAttribute(inst, 4));
  g.instanceCount = count;
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  return g;
}

export class Fringe {
  constructor(rug, { enabled, color, length, spacing, radius, knotted }, rnd) {
    this.rug = rug;
    this.enabled = enabled;
    this.length = length;
    this.chains = Math.max(6, Math.round(rug.width / 0.06));
    this.seg = length / (K - 1);
    const total = this.chains * 2;
    this.nodes = new Float32Array(total * K * 3);
    this.prev = new Float32Array(total * K * 3);
    this.ready = [false, false];
    this.visible = [true, true];
    this.texData = new Float32Array((K + 1) * total * 4);
    this.tex = new THREE.DataTexture(this.texData, K + 1, total, THREE.RGBAFormat, THREE.FloatType);
    this.tex.minFilter = this.tex.magFilter = THREE.NearestFilter;
    this.tex.needsUpdate = true;
    this.meshes = [];
    if (enabled) {
      const uniforms = {
        tChains: { value: this.tex },
        uChainDims: { value: new THREE.Vector2(K + 1, total) },
        uChains: { value: this.chains },
        uStrandR: { value: radius },
        uKnotted: { value: knotted ? 1 : 0 },
      };
      const { material, depth } = fringeMaterials(color, uniforms);
      this.material = material;
      this.depth = depth;
      const count = Math.round(rug.width / spacing);
      for (let e = 0; e < 2; e++) {
        const m = new THREE.Mesh(strandGeometry(count, e, rnd), material);
        m.customDepthMaterial = depth;
        m.castShadow = true;
        m.receiveShadow = true;
        m.frustumCulled = false;
        rug.group.add(m);
        this.meshes.push(m);
      }
    }
    this.label = {
      nodes: new Float32Array(2 * LK * 3),
      prev: new Float32Array(2 * LK * 3),
      ready: false,
      seg: 0.1 / (LK - 1),
      u: [Math.max(0.01, 0.08 - 0.03 / rug.width), Math.min(0.99, 0.08 + 0.03 / rug.width)],
    };
    const lg = new THREE.BufferGeometry();
    this.labelPos = new Float32Array(2 * LK * 3);
    const luv = [];
    for (let k = 0; k < LK; k++) luv.push(0, 1 - k / (LK - 1), 1, 1 - k / (LK - 1));
    const lidx = [];
    for (let k = 0; k < LK - 1; k++) {
      const a = k * 2, b = a + 1, c = a + 2, d = a + 3;
      lidx.push(a, c, b, b, c, d);
    }
    lg.setIndex(lidx);
    lg.setAttribute('position', new THREE.BufferAttribute(this.labelPos, 3).setUsage(THREE.DynamicDrawUsage));
    lg.setAttribute('uv', new THREE.Float32BufferAttribute(luv, 2));
    lg.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.labelGeo = lg;
    this.labelMat = new THREE.MeshStandardMaterial({ map: defaultLabelTexture(), roughness: 0.75, metalness: 0, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1 });
    this.labelMesh = new THREE.Mesh(lg, this.labelMat);
    this.labelMesh.castShadow = true;
    this.labelMesh.receiveShadow = true;
    this.labelMesh.frustumCulled = false;
    rug.group.add(this.labelMesh);
    this.tmp = { p: new THREE.Vector3(), d: new THREE.Vector3(), n: new THREE.Vector3() };
  }

  setLabelTexture(tex) {
    if (this.labelMat.map && this.labelMat.map !== tex && this.labelMat.map.userData?.own !== false) this.labelMat.map.dispose();
    this.labelMat.map = tex;
    this.labelMat.needsUpdate = true;
  }

  simChain(arr, prv, base, count, root, dir, nrm, seg, bend, dt, reset) {
    const g = -9.81 * dt * dt;
    if (reset) {
      for (let k = 0; k < count; k++) {
        const o = base + k * 3;
        arr[o] = root.x + dir.x * seg * k;
        arr[o + 1] = Math.max(root.y + dir.y * seg * k, floorBaseHeightAt(arr[o], arr[o + 2]) + 0.0015);
        arr[o + 2] = root.z + dir.z * seg * k;
        prv[o] = arr[o]; prv[o + 1] = arr[o + 1]; prv[o + 2] = arr[o + 2];
      }
      return;
    }
    for (let k = 1; k < count; k++) {
      const o = base + k * 3;
      const x = arr[o], y = arr[o + 1], z = arr[o + 2];
      arr[o] += (x - prv[o]) * 0.96;
      arr[o + 1] += (y - prv[o + 1]) * 0.96 + g;
      arr[o + 2] += (z - prv[o + 2]) * 0.96;
      prv[o] = x; prv[o + 1] = y; prv[o + 2] = z;
    }
    arr[base] = root.x; arr[base + 1] = root.y; arr[base + 2] = root.z;
    for (let it = 0; it < 3; it++) {
      const o1 = base + 3;
      const tx = root.x + dir.x * seg, ty = root.y + dir.y * seg, tz = root.z + dir.z * seg;
      arr[o1] += (tx - arr[o1]) * 0.45; arr[o1 + 1] += (ty - arr[o1 + 1]) * 0.45; arr[o1 + 2] += (tz - arr[o1 + 2]) * 0.45;
      for (let k = 0; k < count - 1; k++) {
        const a = base + k * 3, b = a + 3;
        const dx = arr[b] - arr[a], dy = arr[b + 1] - arr[a + 1], dz = arr[b + 2] - arr[a + 2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        const f = (d - seg) / d;
        if (k === 0) { arr[b] -= dx * f; arr[b + 1] -= dy * f; arr[b + 2] -= dz * f; }
        else {
          arr[a] += dx * f * 0.5; arr[a + 1] += dy * f * 0.5; arr[a + 2] += dz * f * 0.5;
          arr[b] -= dx * f * 0.5; arr[b + 1] -= dy * f * 0.5; arr[b + 2] -= dz * f * 0.5;
        }
        if (k > 0 && bend > 0) {
          const pa = a - 3;
          let ex = arr[a] - arr[pa], ey = arr[a + 1] - arr[pa + 1], ez = arr[a + 2] - arr[pa + 2];
          const el = Math.sqrt(ex * ex + ey * ey + ez * ez) || 1e-6;
          const px = arr[a] + ex / el * seg, py = arr[a + 1] + ey / el * seg, pz = arr[a + 2] + ez / el * seg;
          arr[b] += (px - arr[b]) * bend; arr[b + 1] += (py - arr[b + 1]) * bend; arr[b + 2] += (pz - arr[b + 2]) * bend;
        }
      }
      for (let k = 1; k < count; k++) {
        const o = base + k * 3;
        const fy = floorBaseHeightAt(arr[o], arr[o + 2]) + 0.0015;
        if (arr[o + 1] < fy) {
          arr[o + 1] = fy;
          prv[o] += (arr[o] - prv[o]) * 0.5;
          prv[o + 2] += (arr[o + 2] - prv[o + 2]) * 0.5;
        }
      }
    }
  }

  update(dt, force) {
    const rug = this.rug;
    const steps = Math.min(3, Math.max(1, Math.ceil(dt / (1 / 60))));
    const h = Math.min(dt, 0.05) / steps;
    const { p, d, n } = this.tmp;
    const endsVisible = [rug.endVisible(0), rug.endVisible(1)];
    if (this.enabled) {
      for (let e = 0; e < 2; e++) {
        this.meshes[e].visible = endsVisible[e];
        if (!endsVisible[e]) { this.ready[e] = false; continue; }
        for (let c = 0; c < this.chains; c++) {
          const u = c / (this.chains - 1);
          rug.edgeFrame(u, e, p, d, n);
          const base = (e * this.chains + c) * K * 3;
          const reset = !this.ready[e] || Math.hypot(this.nodes[base] - p.x, this.nodes[base + 1] - p.y, this.nodes[base + 2] - p.z) > 0.4;
          if (!force && !reset && !rug.renderMoving && this.settled > 90) continue;
          for (let s = 0; s < (reset ? 1 : steps); s++) this.simChain(this.nodes, this.prev, base, K, p, d, n, this.seg, 0.06, h, reset);
          const row = e * this.chains + c;
          for (let k = 0; k < K; k++) {
            const o = base + k * 3, t = (row * (K + 1) + k) * 4;
            this.texData[t] = this.nodes[o]; this.texData[t + 1] = this.nodes[o + 1]; this.texData[t + 2] = this.nodes[o + 2];
          }
          const t = (row * (K + 1) + K) * 4;
          this.texData[t] = n.x; this.texData[t + 1] = n.y; this.texData[t + 2] = n.z;
        }
        this.ready[e] = true;
      }
      this.tex.needsUpdate = true;
    }
    this.settled = rug.renderMoving || force ? 0 : (this.settled || 0) + 1;
    const L = this.label;
    for (let c = 0; c < 2; c++) {
      rug.edgeFrame(L.u[c], 1, p, d, n);
      p.addScaledVector(n, -0.0015);
      const base = c * LK * 3;
      const reset = !L.ready || Math.hypot(L.nodes[base] - p.x, L.nodes[base + 1] - p.y, L.nodes[base + 2] - p.z) > 0.4;
      for (let s = 0; s < (reset ? 1 : steps); s++) this.simChain(L.nodes, L.prev, base, LK, p, d, n, L.seg, 0.35, h, reset);
    }
    for (let k = 1; k < LK; k++) {
      const a = k * 3, b = (LK + k) * 3;
      const dx = L.nodes[b] - L.nodes[a], dy = L.nodes[b + 1] - L.nodes[a + 1], dz = L.nodes[b + 2] - L.nodes[a + 2];
      const dl = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
      const w = Math.abs(L.u[1] - L.u[0]) * rug.width;
      const f = (dl - w) / dl * 0.5;
      L.nodes[a] += dx * f; L.nodes[a + 1] += dy * f; L.nodes[a + 2] += dz * f;
      L.nodes[b] -= dx * f; L.nodes[b + 1] -= dy * f; L.nodes[b + 2] -= dz * f;
    }
    L.ready = true;
    for (let k = 0; k < LK; k++) for (let c = 0; c < 2; c++) {
      const src = (c * LK + k) * 3, dst = (k * 2 + c) * 3;
      this.labelPos[dst] = L.nodes[src]; this.labelPos[dst + 1] = L.nodes[src + 1]; this.labelPos[dst + 2] = L.nodes[src + 2];
    }
    this.labelGeo.attributes.position.needsUpdate = true;
    this.labelGeo.computeVertexNormals();
  }

  raycastLabel(origin, dir, maxDist, generous = false) {
    const P = this.labelPos;
    let best = null;
    const tri = (a, b, c) => {
      const ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2];
      const e1x = P[b * 3] - ax, e1y = P[b * 3 + 1] - ay, e1z = P[b * 3 + 2] - az;
      const e2x = P[c * 3] - ax, e2y = P[c * 3 + 1] - ay, e2z = P[c * 3 + 2] - az;
      const px = dir.y * e2z - dir.z * e2y, py = dir.z * e2x - dir.x * e2z, pz = dir.x * e2y - dir.y * e2x;
      const det = e1x * px + e1y * py + e1z * pz;
      if (Math.abs(det) < 1e-12) return;
      const inv = 1 / det;
      const tx = origin.x - ax, ty = origin.y - ay, tz = origin.z - az;
      const u = (tx * px + ty * py + tz * pz) * inv;
      if (u < 0 || u > 1) return;
      const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
      const v = (dir.x * qx + dir.y * qy + dir.z * qz) * inv;
      if (v < 0 || u + v > 1) return;
      const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
      if (t < 0 || t > maxDist || (best && t >= best.distance)) return;
      const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
      const nl = Math.hypot(nx, ny, nz) || 1;
      const s = nx * dir.x + ny * dir.y + nz * dir.z > 0 ? -1 : 1;
      best = { distance: t, normal: new THREE.Vector3(nx * s / nl, ny * s / nl, nz * s / nl) };
    };
    for (let k = 0; k < LK - 1; k++) {
      const a = k * 2;
      tri(a, a + 2, a + 1);
      tri(a + 1, a + 2, a + 3);
    }
    if (best || !generous) return best;
    let cx = 0, cy = 0, cz = 0;
    const n = P.length / 3;
    for (let i = 0; i < n; i++) {
      cx += P[i * 3];
      cy += P[i * 3 + 1];
      cz += P[i * 3 + 2];
    }
    cx /= n; cy /= n; cz /= n;
    const R = 0.1;
    const ox = origin.x - cx, oy = origin.y - cy, oz = origin.z - cz;
    const b = ox * dir.x + oy * dir.y + oz * dir.z;
    const c = ox * ox + oy * oy + oz * oz - R * R;
    const disc = b * b - c;
    if (disc < 0) return null;
    const t = -b - Math.sqrt(disc);
    if (t < 0 || t > maxDist) return null;
    return { distance: t, normal: new THREE.Vector3(-dir.x, -dir.y, -dir.z) };
  }

  dispose() {
    for (const m of this.meshes) m.geometry.dispose();
    this.material?.dispose();
    this.depth?.dispose();
    this.tex.dispose();
    this.labelGeo.dispose();
    this.labelMat.dispose();
  }
}
