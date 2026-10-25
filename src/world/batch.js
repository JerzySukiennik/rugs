// Rug Rush part batcher: every product and tool part is drawn by three BatchedMeshes (opaque, liquid, clear shell) synced from proxy objects.
import * as THREE from 'three';
import { patchMat } from './kit.js';

const KINDS = ['opaque', 'liquid', 'clear'];
const MAX_INST = { opaque: 2048, liquid: 512, clear: 768 };
const defs = new Map();
const live = [];
let atlas = null;
let state = null;
const _m = new THREE.Matrix4();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _p = new THREE.Vector3();
const _c = new THREE.Vector3();
const _cam = new THREE.Vector3();
const WHITE = new THREE.Color(1, 1, 1);
const LOD_IN = 2.4 * 2.4, LOD_OUT = 3.0 * 3.0;

const FILL_PARS = `
#include <batching_pars_vertex>
float rrFillY() {
#ifdef USE_BATCHING_COLOR
  int id = int( getIndirectIndex( gl_DrawID ) );
  int s = textureSize( batchingColorTexture, 0 ).x;
  return texelFetch( batchingColorTexture, ivec2( id % s, id / s ), 0 ).a;
#else
  return 1e4;
#endif
}
`;

const FILL_NORMAL = `
float rrF = mat.a > 0.5 ? rrFillY() : 1e4;
vec3 objectNormal = position.y > rrF ? vec3( 0.0, 1.0, 0.0 ) : vec3( normal );
#ifdef USE_TANGENT
vec3 objectTangent = vec3( tangent.xyz );
#endif
`;

const FILL_BEGIN = `
vec3 transformed = vec3( position );
if ( transformed.y > rrF ) transformed.y = rrF;
#ifdef USE_ALPHAHASH
vPosition = vec3( position );
#endif
`;

const PREMUL_OUT = `
gl_FragColor = vec4( totalDiffuse * diffuseColor.a + totalSpecular + totalEmissiveRadiance * diffuseColor.a, diffuseColor.a );
`;

const RIM = `
#include <normal_fragment_maps>
{
  float nv = abs( dot( normalize( normal ), normalize( vViewPosition ) ) );
  diffuseColor.a = mix( diffuseColor.a, min( 1.0, diffuseColor.a * 2.4 + 0.06 ), pow( 1.0 - nv, 2.5 ) );
}
`;

function premul(mat) {
  mat.transparent = true;
  mat.blending = THREE.CustomBlending;
  mat.blendEquation = THREE.AddEquation;
  mat.blendSrc = THREE.OneFactor;
  mat.blendDst = THREE.OneMinusSrcAlphaFactor;
  mat.blendSrcAlpha = THREE.OneFactor;
  mat.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
}

function makeMaterial(kind) {
  if (kind === 'opaque') {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 1, map: atlas });
    return patchMat(m, 'rr-batch-opaque');
  }
  if (kind === 'liquid') {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 1, depthWrite: true });
    premul(m);
    return patchMat(m, 'rr-batch-liquid', (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <batching_pars_vertex>', FILL_PARS)
        .replace('#include <beginnormal_vertex>', FILL_NORMAL)
        .replace('#include <begin_vertex>', FILL_BEGIN);
      sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', PREMUL_OUT);
    });
  }
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 1, depthWrite: false, side: THREE.DoubleSide });
  premul(m);
  return patchMat(m, 'rr-batch-clear', (sh) => {
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <normal_fragment_maps>', RIM)
      .replace('#include <opaque_fragment>', PREMUL_OUT);
  });
}

function totals(kind) {
  let v = 0, i = 0;
  for (const d of defs.values()) if (d.kind === kind) {
    v += d.geo.attributes.position.count;
    i += d.geo.index.count;
  }
  return { v, i };
}

function createBatch(kind, minV, minI) {
  const t = totals(kind);
  const v = Math.max(minV, Math.ceil(t.v * 1.25) + 4096);
  const i = Math.max(minI, Math.ceil(t.i * 1.25) + 12288);
  const b = new THREE.BatchedMesh(MAX_INST[kind], v, i, makeMaterial(kind));
  b.name = `itemBatch:${kind}`;
  b.frustumCulled = false;
  b.perObjectFrustumCulled = true;
  b.sortObjects = kind !== 'opaque';
  b.castShadow = kind === 'opaque';
  b.receiveShadow = true;
  b.renderOrder = kind === 'liquid' ? 1 : kind === 'clear' ? 2 : 0;
  b.userData.rbKind = kind;
  b.userData.cap = { v, i };
  if (kind === 'liquid') b.setColorAt(0, WHITE);
  return b;
}

function geoId(kind, d) {
  const b = state.batches[kind];
  if (d.id >= 0 && d.batch === b) return d.id;
  try {
    d.id = b.addGeometry(d.geo);
    d.batch = b;
  } catch (e) {
    rebuild(kind);
    return geoId(kind, d);
  }
  return d.id;
}

function rebuild(kind) {
  const old = state.batches[kind];
  const cap = old.userData.cap;
  const nb = createBatch(kind, cap.v * 2, cap.i * 2);
  state.scene.add(nb);
  state.batches[kind] = nb;
  old.removeFromParent();
  old.dispose();
  for (const d of defs.values()) if (d.kind === kind) d.id = -1;
  for (const o of live) {
    const u = o.userData;
    if (u.rbKind !== kind) continue;
    const d = defs.get(u.rbPart);
    u.rbInst = nb.addInstance(geoId(kind, d));
    u.rbLodLvl = 0;
    u.rbBatch = nb;
    u.rbPrev = null;
    u.rbFillW = null;
  }
}

function ensure(scene) {
  if (state) return;
  state = { scene, batches: {} };
  for (const k of KINDS) {
    state.batches[k] = createBatch(k, 0, 0);
    scene.add(state.batches[k]);
  }
  const prev = scene.onBeforeRender;
  scene.onBeforeRender = function (renderer, sc, camera, target) {
    sync(camera);
    return prev.call(this, renderer, sc, camera, target);
  };
}

function sceneOf(o) {
  let s = o;
  while (s.parent) s = s.parent;
  return s.isScene ? s : null;
}

function onAdded(ev) {
  const root = ev.target;
  const scene = sceneOf(root);
  if (!scene) return;
  ensure(scene);
  root.traverse((o) => {
    const u = o.userData;
    if (!u.rbPart || u.rbInst !== undefined && u.rbInst !== null) return;
    const d = defs.get(u.rbPart);
    if (!d) return;
    const b = state.batches[d.kind];
    u.rbKind = d.kind;
    u.rbInst = b.addInstance(geoId(d.kind, d));
    u.rbLodLvl = 0;
    const lo = u.rbLod ? defs.get(u.rbLod) : null;
    u.rbLoDef = lo && lo.kind === d.kind ? lo : null;
    u.rbBatch = state.batches[d.kind];
    u.rbRoot = root;
    u.rbPrev = null;
    u.rbFillW = null;
    u.rbLive = live.length;
    live.push(o);
  });
}

function onRemoved(ev) {
  const root = ev.target;
  root.traverse((o) => {
    const u = o.userData;
    if (u.rbInst === undefined || u.rbInst === null) return;
    u.rbBatch.deleteInstance(u.rbInst);
    u.rbInst = null;
    const i = u.rbLive;
    const last = live.pop();
    if (last !== o) {
      live[i] = last;
      last.userData.rbLive = i;
    }
    u.rbLive = -1;
  });
}

function followMatrix(o, out) {
  const f = o.userData.rbFollow;
  const t = f.target;
  const e = t.matrixWorld.elements;
  _a.set(e[4], e[5], e[6]);
  const len = _a.length() || 1;
  _a.divideScalar(len);
  _p.set(e[12], e[13], e[14]);
  const end = f.at === 'top' ? 0.5 : -0.5;
  _p.addScaledVector(_a, end * len + (f.at === 'top' ? -f.offset : f.offset));
  _b.set(e[0], e[1], e[2]).normalize();
  _c.crossVectors(_b, _a).normalize();
  out.set(
    _b.x, _a.x, _c.x, _p.x,
    _b.y, _a.y, _c.y, _p.y,
    _b.z, _a.z, _c.z, _p.z,
    0, 0, 0, 1,
  );
  return out;
}

function visibleChain(o, root) {
  for (let p = o; p; p = p.parent) {
    if (!p.visible) return false;
    if (p === root) return true;
  }
  return true;
}

function sync(camera) {
  if (camera) _cam.setFromMatrixPosition(camera.matrixWorld);
  for (let k = 0; k < live.length; k++) {
    const o = live[k];
    const u = o.userData;
    const b = u.rbBatch;
    if (u.fillFn) u.fillY = u.fillFn(o);
    const vis = visibleChain(o, u.rbRoot);
    if (b.getVisibleAt(u.rbInst) !== vis) b.setVisibleAt(u.rbInst, vis);
    if (!vis) continue;
    const m = u.rbFollow ? followMatrix(o, _m) : o.matrixWorld;
    const e = m.elements;
    if (u.rbLoDef && camera) {
      const dx = e[12] - _cam.x, dy = e[13] - _cam.y, dz = e[14] - _cam.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      const want = u.rbLodLvl === 0 ? (d2 > LOD_OUT ? 1 : 0) : (d2 < LOD_IN ? 0 : 1);
      if (want !== u.rbLodLvl) {
        const dd = want ? u.rbLoDef : defs.get(u.rbPart);
        b.setGeometryIdAt(u.rbInst, geoId(u.rbKind, dd));
        u.rbLodLvl = want;
      }
    }
    const tex = b._matricesTexture;
    const arr = tex.image.data;
    const off = u.rbInst * 16;
    let diff = false;
    for (let i = 0; i < 16; i++) if (arr[off + i] !== e[i]) { diff = true; break; }
    if (diff) {
      for (let i = 0; i < 16; i++) arr[off + i] = e[i];
      tex.needsUpdate = true;
    }
    if (u.rbKind === 'liquid') {
      const f = u.fillY ?? 1e4;
      if (u.rbFillW !== f) {
        const ct = b._colorsTexture;
        ct.image.data[u.rbInst * 4 + 3] = f;
        ct.needsUpdate = true;
        u.rbFillW = f;
      }
    }
  }
}

export function setAtlas(tex) {
  atlas = tex;
  if (state) {
    state.batches.opaque.material.map = tex;
    state.batches.opaque.material.needsUpdate = true;
  }
}

export function define(key, kind, geo) {
  if (!defs.has(key)) {
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    defs.set(key, { key, kind, geo, id: -1, batch: null });
  }
  return key;
}

export function has(key) {
  return defs.has(key);
}

export function bounds(key) {
  return defs.get(key)?.geo.boundingBox ?? null;
}

export function part(key, name = '') {
  const o = new THREE.Object3D();
  o.name = name;
  o.userData.rbPart = key;
  return o;
}

export function follower(key, target, at = 'base', offset = 0) {
  const o = part(key);
  o.userData.rbFollow = { target, at, offset };
  return o;
}

export function track(root) {
  root.addEventListener('added', onAdded);
  root.addEventListener('removed', onRemoved);
  return root;
}

export function setFill(proxy, y) {
  proxy.userData.fillY = y;
}

export function batchStats() {
  if (!state) return null;
  const out = {};
  for (const k of KINDS) {
    const b = state.batches[k];
    out[k] = { instances: b.instanceCount, geometries: b._geometryCount, verts: b._nextVertexStart, cap: b.userData.cap };
  }
  out.live = live.length;
  return out;
}
