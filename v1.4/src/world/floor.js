// Rug Rush hall floor: bevelled 3D ceramic tiles near the camera (instanced sliding window), an analytic tile shader beyond, grout bed and the stainless trench drain.
import * as THREE from 'three';
import { BAY, TILE, GROUT_W, GROUT_DEPTH, floorBaseHeightAt } from './layout.js';
import * as K from './kit.js';

const A = (TILE - GROUT_W) / 2;
const BEV_W = 0.0026, BEV_D = 0.0015;
const TILE_COLOR = new THREE.Color('#f1f2ef');
const GROUT_COLOR = new THREE.Color('#a7aaa6');
const WIN = 30;
const FRAME = 0.011;
const _f = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _n = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

function tileGeometry() {
  const pos = [], nor = [], idx = [];
  const steps = [];
  for (let k = 0; k <= 2; k++) {
    const phi = (k / 2) * (Math.PI / 2);
    steps.push({ inset: BEV_W * (1 - Math.sin(phi)), y: -BEV_D * (1 - Math.cos(phi)), nh: BEV_D * Math.sin(phi), nv: BEV_W * Math.cos(phi) });
  }
  steps.push({ inset: 0, y: -GROUT_DEPTH - 0.0007, nh: 1, nv: 0 });
  const sides = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  for (const [dx, dz] of sides) {
    const tx = -dz, tz = dx;
    const base = pos.length / 3;
    for (const s of steps) {
      const e = A - s.inset;
      const l = Math.hypot(s.nh, s.nv) || 1;
      for (const sgn of [-1, 1]) {
        const off = A - s.inset;
        pos.push(dx * e + tx * off * sgn, s.y, dz * e + tz * off * sgn);
        nor.push((dx * s.nh) / l, s.nv / l, (dz * s.nh) / l);
      }
    }
    for (let r = 0; r < steps.length - 1; r++) {
      const a = base + r * 2, b = a + 1, c = a + 2, d = a + 3;
      idx.push(a, b, d, a, d, c);
    }
  }
  const t = pos.length / 3;
  const e0 = A - BEV_W;
  pos.push(-e0, 0, -e0, e0, 0, -e0, e0, 0, e0, -e0, 0, e0);
  for (let i = 0; i < 4; i++) nor.push(0, 1, 0);
  idx.push(t, t + 2, t + 1, t, t + 3, t + 2);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  const P = g.attributes.position, N = g.attributes.normal;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < idx.length; i += 3) {
    a.fromBufferAttribute(P, idx[i]);
    b.fromBufferAttribute(P, idx[i + 1]);
    c.fromBufferAttribute(P, idx[i + 2]);
    const fn = b.sub(a).cross(c.sub(a));
    n.fromBufferAttribute(N, idx[i]).add(_n.fromBufferAttribute(N, idx[i + 1])).add(_n.fromBufferAttribute(N, idx[i + 2]));
    if (fn.dot(n) < 0) {
      const tmp = idx[i + 1];
      idx[i + 1] = idx[i + 2];
      idx[i + 2] = tmp;
    }
  }
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

function trenchRect() {
  const tr = BAY.trench;
  return { x0: BAY.cx - tr.halfLen, x1: BAY.cx + tr.halfLen, z0: BAY.cz - tr.halfW - FRAME, z1: BAY.cz + tr.halfW + FRAME };
}

function slabGeometry(hall, dy) {
  const parts = [];
  const bx0 = BAY.cx - BAY.half, bx1 = BAY.cx + BAY.half, bz0 = BAY.cz - BAY.half, bz1 = BAY.cz + BAY.half;
  const quads = [
    [hall.minX, hall.maxX, hall.minZ, bz0],
    [hall.minX, hall.maxX, bz1, hall.maxZ],
    [hall.minX, bx0, bz0, bz1],
    [bx1, hall.maxX, bz0, bz1],
  ];
  for (const [x0, x1, z0, z1] of quads) {
    const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
    g.rotateX(-Math.PI / 2);
    g.translate((x0 + x1) / 2, dy, (z0 + z1) / 2);
    parts.push(g);
  }
  const n = Math.round((BAY.half * 2) / TILE);
  const g = new THREE.PlaneGeometry(BAY.half * 2, BAY.half * 2, n, n);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + BAY.cx, z = p.getZ(i) + BAY.cz;
    p.setXYZ(i, x, floorBaseHeightAt(x, z) + dy, z);
  }
  g.computeVertexNormals();
  parts.push(g);
  const m = K.mergeRaw(parts);
  m.computeBoundingSphere();
  return m;
}

const FAR_PARS = `
uniform vec4 uNear;
uniform vec4 uTrench;
uniform sampler2D uTileData;
uniform vec2 uTileOrigin;
uniform vec3 uGroutCol;
varying vec3 vWp;
`;

const FAR_MAIN = `
if ( vWp.x > uNear.x && vWp.x < uNear.z && vWp.z > uNear.y && vWp.z < uNear.w ) discard;
if ( vWp.x > uTrench.x && vWp.x < uTrench.z && vWp.z > uTrench.y && vWp.z < uTrench.w ) discard;
vec2 tc = vWp.xz / ${TILE.toFixed(4)};
vec2 tid = floor( tc );
vec2 fr = fract( tc ) - 0.5;
vec2 ed = ( 0.5 - abs( fr ) ) * ${TILE.toFixed(4)};
float gd = min( ed.x, ed.y );
float fw = max( length( fwidth( vWp.xz ) ), 1e-5 );
float gw = ${(GROUT_W / 2).toFixed(5)};
float gwe = gw + ${(BEV_W * 0.55).toFixed(5)};
float grout = fw < 2.0 * gwe ? 1.0 - smoothstep( gwe - fw * 0.5, gwe + fw * 0.5, gd ) : clamp( 2.0 * gwe / fw, 0.0, 1.0 ) * ( 1.0 - smoothstep( fw * 0.5, fw, gd ) );
float farK = clamp( ( fw - ${TILE.toFixed(4)} * 0.12 ) / ( ${TILE.toFixed(4)} * 0.25 ), 0.0, 1.0 );
grout = mix( grout, 2.0 * gwe / ${TILE.toFixed(4)}, farK );
vec4 td = texelFetch( uTileData, ivec2( tid - uTileOrigin ), 0 );
float cv = ( td.r - 0.5 ) * 0.06;
vec3 tileCol = diffuse * ( 1.0 + cv );
float bev = clamp( 1.0 - ( gd - gw ) / ${BEV_W.toFixed(5)}, 0.0, 1.0 ) * ( 1.0 - farK ) * step( fw, gw * 2.0 );
vec2 bdir = ed.x < ed.y ? vec2( sign( fr.x ), 0.0 ) : vec2( 0.0, sign( fr.y ) );
vec2 rrTilt = -( td.gb - 0.5 ) * 0.0012 * ( 1.0 - grout );
vec2 rrGrad = bdir * bev * 0.9 + rrTilt;
diffuseColor.rgb = mix( tileCol, uGroutCol, grout );
float rrRough = mix( 0.2 + td.a * 0.06, 0.92, grout );
`;

const FAR_NORMAL = `
#include <normal_fragment_begin>
{
  vec3 nW = inverseTransformDirection( normal, viewMatrix );
  nW = normalize( nW + vec3( rrGrad.x, 0.0, rrGrad.y ) );
  normal = normalize( ( viewMatrix * vec4( nW, 0.0 ) ).xyz );
}
`;

const GROUT_MAIN = `
if ( vWp.x > uTrench.x && vWp.x < uTrench.z && vWp.z > uTrench.y && vWp.z < uTrench.w ) discard;
`;

function worldPosVertex(sh) {
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vWp;')
    .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWp = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
}

export function buildFloor(root, hall) {
  const i0 = Math.floor(hall.minX / TILE), i1 = Math.ceil(hall.maxX / TILE) - 1;
  const j0 = Math.floor(hall.minZ / TILE), j1 = Math.ceil(hall.maxZ / TILE) - 1;
  const NI = i1 - i0 + 1, NJ = j1 - j0 + 1;
  const tr = trenchRect();
  const data = new Uint8Array(NI * NJ * 4);
  const mats = new Float32Array(NI * NJ * 16);
  const cols = new Float32Array(NI * NJ * 3);
  const has = new Uint8Array(NI * NJ);
  for (let j = 0; j < NJ; j++) for (let i = 0; i < NI; i++) {
    const k = j * NI + i;
    const ti = i + i0, tj = j + j0;
    const cv = K.hash(ti, tj, 1), tx = K.hash(ti, tj, 2), tz = K.hash(ti, tj, 3), hr = K.hash(ti, tj, 4), rg = K.hash(ti, tj, 5);
    data[k * 4] = Math.round(cv * 255);
    data[k * 4 + 1] = Math.round(tx * 255);
    data[k * 4 + 2] = Math.round(tz * 255);
    data[k * 4 + 3] = Math.round(rg * 255);
    let x0 = ti * TILE, x1 = x0 + TILE, z0 = tj * TILE, z1 = z0 + TILE;
    let gx0 = GROUT_W / 2, gx1 = GROUT_W / 2, gz0 = GROUT_W / 2, gz1 = GROUT_W / 2;
    if (x0 < hall.minX) { x0 = hall.minX; gx0 = 0.001; }
    if (x1 > hall.maxX) { x1 = hall.maxX; gx1 = 0.001; }
    if (z0 < hall.minZ) { z0 = hall.minZ; gz0 = 0.001; }
    if (z1 > hall.maxZ) { z1 = hall.maxZ; gz1 = 0.001; }
    const overX = x1 > tr.x0 && x0 < tr.x1;
    if (overX && z1 > tr.z0 && z0 < tr.z1) {
      if (z0 >= tr.z0 && z1 <= tr.z1) continue;
      if (z0 < tr.z0) { z1 = tr.z0; gz1 = 0.0004; }
      else { z0 = tr.z1; gz0 = 0.0004; }
    }
    const ex0 = x0 + gx0, ex1 = x1 - gx1, ez0 = z0 + gz0, ez1 = z1 - gz1;
    if (ex1 - ex0 < 0.01 || ez1 - ez0 < 0.01) continue;
    const cx = (ex0 + ex1) / 2, cz = (ez0 + ez1) / 2;
    const h00 = floorBaseHeightAt(ex0, ez0), h10 = floorBaseHeightAt(ex1, ez0), h01 = floorBaseHeightAt(ex0, ez1), h11 = floorBaseHeightAt(ex1, ez1);
    const hc = (h00 + h10 + h01 + h11) / 4;
    const dhdx = (h10 + h11 - h00 - h01) / (2 * (ex1 - ex0));
    const dhdz = (h01 + h11 - h00 - h10) / (2 * (ez1 - ez0));
    _n.set(-dhdx + (tx - 0.5) * 0.0012, 1, -dhdz + (tz - 0.5) * 0.0012).normalize();
    _q.setFromUnitVectors(UP, _n);
    _s.set((ex1 - ex0) / (2 * A), 1, (ez1 - ez0) / (2 * A));
    _p.set(cx, hc + (hr - 0.5) * 0.0002, cz);
    _m.compose(_p, _q, _s);
    _m.toArray(mats, k * 16);
    const c = 1 + (cv - 0.5) * 0.06;
    cols[k * 3] = c;
    cols[k * 3 + 1] = c;
    cols[k * 3 + 2] = c;
    has[k] = 1;
  }
  const tileTex = new THREE.DataTexture(data, NI, NJ, THREE.RGBAFormat, THREE.UnsignedByteType);
  tileTex.needsUpdate = true;
  const nearRect = new THREE.Vector4(0, 0, 0, 0);
  const trenchV = new THREE.Vector4(tr.x0, tr.z0, tr.x1, tr.z1);

  const farMat = new THREE.MeshStandardMaterial({ color: TILE_COLOR, roughness: 1, metalness: 0 });
  farMat.onBeforeCompile = (sh) => {
    sh.uniforms.uNear = { value: nearRect };
    sh.uniforms.uTrench = { value: trenchV };
    sh.uniforms.uTileData = { value: tileTex };
    sh.uniforms.uTileOrigin = { value: new THREE.Vector2(i0, j0) };
    sh.uniforms.uGroutCol = { value: GROUT_COLOR };
    worldPosVertex(sh);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FAR_PARS)
      .replace('#include <map_fragment>', FAR_MAIN)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = rrRough;')
      .replace('#include <normal_fragment_begin>', FAR_NORMAL);
  };
  farMat.customProgramCacheKey = () => 'rr-floor-far';
  const far = new THREE.Mesh(slabGeometry(hall, 0), farMat);
  far.name = 'hallFloorFar';
  far.receiveShadow = true;
  root.add(far);

  const groutMat = new THREE.MeshStandardMaterial({ color: GROUT_COLOR, roughness: 0.94, metalness: 0 });
  groutMat.onBeforeCompile = (sh) => {
    sh.uniforms.uNear = { value: nearRect };
    sh.uniforms.uTrench = { value: trenchV };
    worldPosVertex(sh);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec4 uNear;\nuniform vec4 uTrench;\nvarying vec3 vWp;')
      .replace('#include <map_fragment>', GROUT_MAIN);
  };
  groutMat.customProgramCacheKey = () => 'rr-floor-grout';
  const groutGeo = new THREE.PlaneGeometry(WIN * TILE, WIN * TILE, WIN, WIN);
  groutGeo.rotateX(-Math.PI / 2);
  groutGeo.attributes.position.setUsage(THREE.DynamicDrawUsage);
  const grout = new THREE.Mesh(groutGeo, groutMat);
  grout.frustumCulled = false;
  grout.name = 'hallFloorGrout';
  grout.receiveShadow = true;
  root.add(grout);

  const tileMat = new THREE.MeshStandardMaterial({ color: TILE_COLOR, roughness: 0.22, metalness: 0 });
  const cap = WIN * WIN;
  const near = new THREE.InstancedMesh(tileGeometry(), tileMat, cap);
  near.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  near.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
  near.instanceColor.setUsage(THREE.DynamicDrawUsage);
  near.count = 0;
  near.frustumCulled = false;
  near.receiveShadow = true;
  near.name = 'hallFloorTiles';
  root.add(near);

  const trench = buildTrench();
  root.add(trench);

  let ci = null, cj = null;
  const update = (camera) => {
    camera.getWorldDirection(_f);
    _f.y = 0;
    if (_f.lengthSq() < 1e-6) _f.set(0, 0, -1);
    _f.normalize();
    const px = camera.position.x + _f.x * 2.2, pz = camera.position.z + _f.z * 2.2;
    const wi = Math.round(px / TILE) - WIN / 2, wj = Math.round(pz / TILE) - WIN / 2;
    if (ci !== null && Math.abs(wi - ci) < 2 && Math.abs(wj - cj) < 2) return;
    ci = wi;
    cj = wj;
    const im = near.instanceMatrix.array, ic = near.instanceColor.array;
    let n = 0;
    for (let j = wj; j < wj + WIN; j++) {
      const lj = j - j0;
      if (lj < 0 || lj >= NJ) continue;
      for (let i = wi; i < wi + WIN; i++) {
        const li = i - i0;
        if (li < 0 || li >= NI) continue;
        const k = lj * NI + li;
        if (!has[k]) continue;
        for (let q = 0; q < 16; q++) im[n * 16 + q] = mats[k * 16 + q];
        ic[n * 3] = cols[k * 3];
        ic[n * 3 + 1] = cols[k * 3 + 1];
        ic[n * 3 + 2] = cols[k * 3 + 2];
        n++;
      }
    }
    near.count = n;
    near.instanceMatrix.clearUpdateRanges();
    near.instanceMatrix.addUpdateRange(0, n * 16);
    near.instanceMatrix.needsUpdate = true;
    near.instanceColor.clearUpdateRanges();
    near.instanceColor.addUpdateRange(0, n * 3);
    near.instanceColor.needsUpdate = true;
    nearRect.set(wi * TILE, wj * TILE, (wi + WIN) * TILE, (wj + WIN) * TILE);
    const gp = groutGeo.attributes.position;
    for (let k = 0; k < gp.count; k++) {
      const ix = k % (WIN + 1), jz = Math.floor(k / (WIN + 1));
      const x = Math.min(hall.maxX, Math.max(hall.minX, (wi + ix) * TILE)), z = Math.min(hall.maxZ, Math.max(hall.minZ, (wj + jz) * TILE));
      gp.setXYZ(k, x, floorBaseHeightAt(x, z) - GROUT_DEPTH, z);
    }
    gp.needsUpdate = true;
  };
  return { near, far, grout, trench, update, meshes: [near, far, grout] };
}

function buildTrench() {
  const t = BAY.trench;
  const y0 = -BAY.depth;
  const yTop = floorBaseHeightAt(BAY.cx, BAY.cz + t.halfW + FRAME * 0.5);
  const L = t.halfLen * 2;
  const parts = [];
  const steel = '#c3c8cc';
  for (const s of [-1, 1]) {
    const flange = K.box(L, 0.0025, FRAME, { x: BAY.cx, y: yTop - 0.00125, z: BAY.cz + s * (t.halfW + FRAME / 2) });
    parts.push(K.paint(flange, steel, { r: 0.22, m: 0.95 }));
    const leg = K.box(L, t.depth, 0.002, { x: BAY.cx, y: y0 - t.depth / 2, z: BAY.cz + s * (t.halfW - 0.001) });
    parts.push(K.paint(leg, '#9ea4a9', { r: 0.4, m: 0.85, shade: (x, y) => 0.45 + 0.55 * Math.max(0, Math.min(1, (y - (y0 - t.depth)) / t.depth)) }));
    const bearer = K.box(L - 0.004, 0.02, 0.004, { x: BAY.cx, y: yTop - 0.0005 - 0.01, z: BAY.cz + s * (t.halfW - 0.006) });
    parts.push(K.paint(bearer, steel, { r: 0.3, m: 0.9 }));
  }
  const bottom = K.box(L, 0.002, t.halfW * 2, { x: BAY.cx, y: y0 - t.depth, z: BAY.cz });
  parts.push(K.paint(bottom, '#2b2e30', { r: 0.6, m: 0.5 }));
  for (const s of [-1, 1]) {
    const end = K.box(0.004, t.depth + 0.002, t.halfW * 2 + FRAME * 2, { x: BAY.cx + s * (t.halfLen + 0.002), y: y0 - t.depth / 2 + 0.001, z: BAY.cz });
    parts.push(K.paint(end, steel, { r: 0.3, m: 0.9 }));
  }
  const pitch = 0.013, n = Math.floor((L - 0.02) / pitch);
  const bars = [];
  for (let i = 0; i < n; i++) {
    const x = BAY.cx - t.halfLen + 0.01 + (i + 0.5) * pitch;
    bars.push(K.box(0.0035, 0.018, t.halfW * 2 - 0.004, { x, y: yTop - 0.0005 - 0.009, z: BAY.cz }));
  }
  parts.push(K.paint(K.mergeRaw(bars), steel, { r: 0.26, m: 0.95 }));
  const sump = K.cyl(0.05, 0.05, 0.004, 28, { x: BAY.cx + t.halfLen - 0.12, y: y0 - t.depth + 0.003, z: BAY.cz });
  parts.push(K.paint(sump, '#141516', { r: 0.7 }));
  const mesh = new THREE.Mesh(K.merge(parts), K.vcolorMaterial('rr-trench'));
  mesh.name = 'trenchDrain';
  mesh.receiveShadow = true;
  return mesh;
}
