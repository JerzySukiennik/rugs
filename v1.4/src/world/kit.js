// Rug Rush geometry kit: painted vertex attributes (color + roughness/metal/emissive), lofts, ribbed rings, tubes, extrusions and merging.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const WHITE_UV = [0.992, 0.008];
const KEEP = ['position', 'normal', 'uv'];

function srgbBytes(hex) {
  const c = new THREE.Color(hex).convertLinearToSRGB();
  return [Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255)];
}

export function indexify(geo) {
  const g = geo.clone();
  for (const k of Object.keys(g.attributes)) if (!KEEP.includes(k)) g.deleteAttribute(k);
  if (!g.index) {
    const n = g.attributes.position.count;
    const idx = new Uint32Array(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    g.setIndex(new THREE.BufferAttribute(idx, 1));
  }
  g.clearGroups();
  return g;
}

export function paint(src, color = '#ffffff', { r = 0.5, m = 0, e = 0, a = 1, liquid = false, uvRect = null, uvFn = null, shade = null } = {}) {
  const geo = indexify(src);
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const n = geo.attributes.position.count;
  const pos = geo.attributes.position;
  const suv = geo.attributes.uv;
  const uv = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    if (uvFn) {
      const q = uvFn(pos.getX(i), pos.getY(i), pos.getZ(i), suv ? suv.getX(i) : 0, suv ? suv.getY(i) : 0);
      uv[i * 2] = q[0];
      uv[i * 2 + 1] = q[1];
    } else if (uvRect && suv) {
      uv[i * 2] = uvRect[0] + suv.getX(i) * uvRect[2];
      uv[i * 2 + 1] = uvRect[1] + suv.getY(i) * uvRect[3];
    } else {
      uv[i * 2] = WHITE_UV[0];
      uv[i * 2 + 1] = WHITE_UV[1];
    }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  const col = new Uint8Array(n * 4);
  const base = srgbBytes(color);
  for (let i = 0; i < n; i++) {
    const k = shade ? shade(pos.getX(i), pos.getY(i), pos.getZ(i)) : 1;
    col[i * 4] = Math.max(0, Math.min(255, base[0] * k));
    col[i * 4 + 1] = Math.max(0, Math.min(255, base[1] * k));
    col[i * 4 + 2] = Math.max(0, Math.min(255, base[2] * k));
    col[i * 4 + 3] = Math.round(a * 255);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 4, true));
  const mt = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    mt[i * 4] = Math.round(Math.max(0, Math.min(1, r)) * 255);
    mt[i * 4 + 1] = Math.round(Math.max(0, Math.min(1, m)) * 255);
    mt[i * 4 + 2] = Math.round(Math.max(0, Math.min(1, e)) * 255);
    mt[i * 4 + 3] = liquid ? 255 : 0;
  }
  geo.setAttribute('mat', new THREE.BufferAttribute(mt, 4, true));
  return geo;
}

export function merge(list) {
  const parts = list.filter(Boolean).map((g) => {
    const c = g.index ? g.clone() : indexify(g);
    c.clearGroups();
    return c;
  });
  const names = Object.keys(parts[0].attributes);
  for (const p of parts) for (const k of Object.keys(p.attributes)) if (!names.includes(k)) p.deleteAttribute(k);
  const m = mergeGeometries(parts, false);
  m.computeBoundingBox();
  m.computeBoundingSphere();
  return m;
}

export function mergeRaw(list) {
  return mergeGeometries(list.map((g) => indexify(g)), false);
}

export function place(geo, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, order = 'XYZ' } = {}) {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, order)), new THREE.Vector3(sx, sy, sz));
  geo.applyMatrix4(m);
  return geo;
}

function rawPoint(hw, hd, cr, t, out) {
  cr = Math.max(1e-6, Math.min(cr, hw, hd));
  const ex = hw - cr, ez = hd - cr;
  const q = (Math.PI * cr) / 2;
  const L = [ez, q, 2 * ex, q, 2 * ez, q, 2 * ex, q, ez];
  const per = 4 * ex + 4 * ez + 2 * Math.PI * cr;
  let s = ((((t % 1) + 1) % 1)) * per;
  let i = 0;
  while (i < L.length - 1 && s > L[i]) { s -= L[i]; i++; }
  let x, z;
  if (i === 0) { x = hw; z = s; }
  else if (i === 1) { const a = s / cr; x = ex + Math.cos(a) * cr; z = ez + Math.sin(a) * cr; }
  else if (i === 2) { x = ex - s; z = hd; }
  else if (i === 3) { const a = Math.PI / 2 + s / cr; x = -ex + Math.cos(a) * cr; z = ez + Math.sin(a) * cr; }
  else if (i === 4) { x = -hw; z = ez - s; }
  else if (i === 5) { const a = Math.PI + s / cr; x = -ex + Math.cos(a) * cr; z = -ez + Math.sin(a) * cr; }
  else if (i === 6) { x = -ex + s; z = -hd; }
  else if (i === 7) { const a = 1.5 * Math.PI + s / cr; x = ex + Math.cos(a) * cr; z = -ez + Math.sin(a) * cr; }
  else { x = hw; z = -ez + s; }
  out[0] = x;
  out[1] = z;
  return out;
}

export function ringPoint(R, t, out = [0, 0]) {
  rawPoint(R.hw, R.hd, R.cr ?? Math.min(R.hw, R.hd), 0.5 - t, out);
  out[0] += R.x ?? 0;
  out[1] += R.z ?? 0;
  return out;
}

function angleT(R, th) {
  const tmp = [0, 0];
  let best = 0, bd = 1e9;
  for (let k = 0; k <= 1440; k++) {
    const t = k / 1440;
    rawPoint(R.hw, R.hd, R.cr ?? Math.min(R.hw, R.hd), 0.5 - t, tmp);
    const a = Math.atan2(tmp[0], tmp[1]);
    const d = Math.abs(((a - th + Math.PI * 5) % (Math.PI * 2)) - Math.PI);
    if (d < bd) { bd = d; best = t; }
  }
  return best;
}

export function ringPerimeter(R) {
  const cr = Math.min(R.cr ?? Math.min(R.hw, R.hd), R.hw, R.hd);
  return 4 * (R.hw - cr) + 4 * (R.hd - cr) + 2 * Math.PI * cr;
}

export function arcLength(R, th0, th1) {
  const t0 = angleT(R, th0);
  let t1 = angleT(R, th1);
  if (t1 <= t0) t1 += 1;
  return (t1 - t0) * ringPerimeter(R);
}

export function uAngle(x, z) {
  const th = Math.atan2(x, z);
  return ((((th + Math.PI / 2) / (Math.PI * 2)) % 1) + 1) % 1;
}

export function loft(rings, { segs = 40, capTop = true, capBottom = true, theta0 = null, theta1 = null } = {}) {
  const partial = theta0 !== null;
  const cols = segs + 1;
  const pos = [], uv = [], idx = [];
  const tmp = [0, 0];
  for (let j = 0; j < rings.length; j++) {
    const R = rings[j];
    let t0 = 0, t1 = 1;
    if (partial) {
      t0 = angleT(R, theta0);
      t1 = angleT(R, theta1);
      if (t1 <= t0) t1 += 1;
    }
    for (let i = 0; i < cols; i++) {
      const t = t0 + ((t1 - t0) * i) / segs;
      ringPoint(R, t, tmp);
      pos.push(tmp[0], R.y, tmp[1]);
      uv.push(i / segs, R.v ?? j / Math.max(1, rings.length - 1));
    }
  }
  for (let j = 0; j < rings.length - 1; j++) for (let i = 0; i < cols - 1; i++) {
    const a = j * cols + i, b = a + 1, c = a + cols, d = c + 1;
    idx.push(a, b, d, a, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  if (!partial) {
    const n = g.attributes.normal;
    for (let j = 0; j < rings.length; j++) {
      const a = j * cols, b = j * cols + cols - 1;
      const x = n.getX(a) + n.getX(b), y = n.getY(a) + n.getY(b), z = n.getZ(a) + n.getZ(b);
      const l = Math.hypot(x, y, z) || 1;
      n.setXYZ(a, x / l, y / l, z / l);
      n.setXYZ(b, x / l, y / l, z / l);
    }
  }
  const parts = [g];
  if (!partial && capBottom) parts.push(capGeo(rings[0], segs, -1));
  if (!partial && capTop) parts.push(capGeo(rings[rings.length - 1], segs, 1));
  return parts.length === 1 ? g : mergeRaw(parts);
}

function capGeo(R, segs, dir) {
  const cx = R.x ?? 0, cz = R.z ?? 0;
  const pos = [cx, R.y, cz], nor = [0, dir, 0], uv = [0.5, 0.5], idx = [];
  const tmp = [0, 0];
  for (let i = 0; i <= segs; i++) {
    ringPoint(R, i / segs, tmp);
    pos.push(tmp[0], R.y, tmp[1]);
    nor.push(0, dir, 0);
    uv.push(0.5 + (tmp[0] - cx) / (2 * R.hw), 0.5 + (tmp[1] - cz) / (2 * R.hd));
  }
  for (let i = 1; i <= segs; i++) {
    if (dir > 0) idx.push(0, i, i + 1);
    else idx.push(0, i + 1, i);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

export function lathe(profile, opts = {}) {
  return loft(profile.map(([r, y]) => ({ y, hw: Math.max(r, 1e-5), hd: Math.max(r, 1e-5), cr: Math.max(r, 1e-5) })), { capTop: false, capBottom: false, ...opts });
}

export function inset(rings, d, y0, y1) {
  return rings.filter((R) => R.y >= y0 - 1e-9 && R.y <= y1 + 1e-9).map((R) => ({ ...R, hw: Math.max(1e-4, R.hw - d), hd: Math.max(1e-4, R.hd - d), cr: Math.max(1e-4, (R.cr ?? Math.min(R.hw, R.hd)) - d) }));
}

export function ringAt(rings, y) {
  for (let i = 0; i < rings.length - 1; i++) {
    const a = rings[i], b = rings[i + 1];
    if (y >= a.y && y <= b.y) {
      const t = b.y - a.y > 1e-9 ? (y - a.y) / (b.y - a.y) : 0;
      const L = (p, q) => p + (q - p) * t;
      return { y, hw: L(a.hw, b.hw), hd: L(a.hd, b.hd), cr: L(a.cr ?? Math.min(a.hw, a.hd), b.cr ?? Math.min(b.hw, b.hd)), x: L(a.x ?? 0, b.x ?? 0), z: L(a.z ?? 0, b.z ?? 0) };
    }
  }
  return { ...rings[rings.length - 1], y };
}

export function band(rings, y0, y1, out = 0.0005, { theta0 = null, theta1 = null, segs = 48, rows = 6 } = {}) {
  const rs = [];
  for (let k = 0; k <= rows; k++) {
    const y = y0 + ((y1 - y0) * k) / rows;
    const R = ringAt(rings, y);
    rs.push({ ...R, hw: R.hw + out, hd: R.hd + out, cr: R.cr + out, v: k / rows });
  }
  return loft(rs, { segs, theta0, theta1, capTop: false, capBottom: false });
}

export function ribbedRing(r, h, ribs = 36, depth = 0.0006, y = 0) {
  const n = ribs * 2;
  const g = new THREE.CylinderGeometry(r, r, h, n, 1, false);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const l = Math.hypot(x, z);
    if (l > r * 0.98) {
      const a = Math.atan2(x, z);
      const k = Math.round(((a / (Math.PI * 2)) * n + n * 2)) % n;
      const rr = r - (k % 2 ? depth : 0);
      p.setX(i, (x / l) * rr);
      p.setZ(i, (z / l) * rr);
    }
    p.setY(i, p.getY(i) + y);
  }
  g.computeVertexNormals();
  return g;
}

export function tube(points, radius, { segs = 24, radial = 10, closed = false, tension = 0.5 } = {}) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p[0], p[1], p[2])), closed, 'catmullrom', tension);
  return new THREE.TubeGeometry(curve, segs, radius, radial, closed);
}

function buildPath(p, pts) {
  p.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    const q = pts[i];
    if (q.length === 4) p.quadraticCurveTo(q[0], q[1], q[2], q[3]);
    else if (q.length === 6) p.bezierCurveTo(q[0], q[1], q[2], q[3], q[4], q[5]);
    else p.lineTo(q[0], q[1]);
  }
  p.closePath();
}

export function extrude(pts, depth, { bevel = 0.002, bevelSegs = 2, curveSegs = 8, holes = [] } = {}) {
  const s = new THREE.Shape();
  buildPath(s, pts);
  for (const h of holes) {
    const p = new THREE.Path();
    buildPath(p, h);
    s.holes.push(p);
  }
  const core = Math.max(1e-4, depth - bevel * 2);
  const g = new THREE.ExtrudeGeometry(s, { depth: core, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: bevelSegs, curveSegments: curveSegs });
  g.translate(0, 0, -core / 2);
  return g;
}

export function roundedBox(w, h, d, r = 0.004, segs = 2) {
  r = Math.max(0, Math.min(r, w / 2 - 1e-5, h / 2 - 1e-5, d / 2 - 1e-5));
  if (r <= 1e-5) return new THREE.BoxGeometry(w, h, d);
  const s = new THREE.Shape();
  const x = w / 2 - r, y = h / 2 - r, c = Math.min(r * 0.6, x * 0.9, y * 0.9);
  s.moveTo(-x + c, -y);
  s.lineTo(x - c, -y);
  s.quadraticCurveTo(x, -y, x, -y + c);
  s.lineTo(x, y - c);
  s.quadraticCurveTo(x, y, x - c, y);
  s.lineTo(-x + c, y);
  s.quadraticCurveTo(-x, y, -x, y - c);
  s.lineTo(-x, -y + c);
  s.quadraticCurveTo(-x, -y, -x + c, -y);
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(1e-4, d - 2 * r), bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: segs, curveSegments: 3 });
  g.translate(0, 0, -(d - 2 * r) / 2);
  return g;
}

export function cyl(rt, rb, h, segs = 24, { open = false, x = 0, y = 0, z = 0 } = {}) {
  const g = new THREE.CylinderGeometry(rt, rb, h, segs, 1, open);
  g.translate(x, y, z);
  return g;
}

export function box(w, h, d, { x = 0, y = 0, z = 0 } = {}) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

export function bend(geo, fn) {
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    fn(v);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

export function hash(i, j = 0, k = 0) {
  let h = (Math.imul(i | 0, 374761393) + Math.imul(j | 0, 668265263) + Math.imul(k | 0, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function patchMat(mat, key, extra = null) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 mat;\nvarying vec4 vMat;')
      .replace('#include <color_vertex>', '#include <color_vertex>\nvMat = mat;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec4 vMat;')
      .replace('#include <color_fragment>', '#if defined( USE_COLOR_ALPHA )\ndiffuseColor *= vec4( pow( vColor.rgb, vec3( 2.2 ) ), vColor.a );\n#elif defined( USE_COLOR )\ndiffuseColor.rgb *= pow( vColor.rgb, vec3( 2.2 ) );\n#endif')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = roughness * max( vMat.r, 0.03 );\n#ifdef USE_ROUGHNESSMAP\nroughnessFactor *= texture2D( roughnessMap, vRoughnessMapUv ).g;\n#endif')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = metalness * vMat.g;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vMat.b * 4.0;');
    extra?.(sh);
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}

export function vcolorMaterial(key = 'rr-vcol', opts = {}) {
  return patchMat(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 1, ...opts }), key);
}
