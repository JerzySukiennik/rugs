// Rug Rush rug materials: PBR base, backing, instanced pile shells, deposit shells, liquid film, edge binding and fringe strands.
import * as THREE from 'three';
import { GLSL_COMMON, GLSL_UVLAMP } from './glsl.js';

const VARY = `
varying vec2 vRugUv;
varying vec3 vTanW;
varying vec3 vNrmW;
varying vec3 vWPos;
`;

const VERT_HEAD = `
attribute vec3 aTanU;
uniform float uOffset;
${VARY}
`;

const SURF_UNIFORMS = `
uniform sampler2D tAlbedo;
uniform sampler2D tSurf;
uniform sampler2D tNap;
uniform sampler2D tDetailN;
uniform sampler2D tDetailH;
uniform sampler2D tHair;
uniform sampler2D tDamage;
uniform vec2 uDims;
uniform float uPileKind;
uniform float uMicro;
uniform float uDetailTile;
uniform float uDetailStr;
uniform float uNapK;
uniform float uFiberRough;
uniform float uBaseAO;
uniform float uSheenAmt;
uniform vec3 uYarn[5];
uniform vec4 uYarnW;
uniform vec3 uYarnMean;
`;

const SURF_FUNCS = `
vec3 rrMicro(vec2 pm, out float ao, out vec2 slope) {
  ao = 1.0;
  slope = vec2(0.0);
  vec3 m = vec3(1.0);
  if (uMicro > 0.5 && uMicro < 1.5) {
    vec2 lp = pm / vec2(0.0032, 0.0029);
    vec2 f = fract(lp);
    float fade = 1.0 - smoothstep(0.35, 1.0, length(fwidth(lp)));
    float dome = sin(3.14159 * f.y) * (0.55 + 0.45 * sin(3.14159 * f.x));
    ao = mix(1.0, 0.7 + 0.3 * dome, fade);
    slope = vec2(cos(3.14159 * f.x) * 0.25, cos(3.14159 * f.y) * 0.6) * fade;
  } else if (uMicro > 1.5 && uMicro < 2.5) {
    float cw = 0.0125;
    float pitch = 0.0042;
    float ci = floor(pm.x / cw);
    float s = mod(ci, 2.0) < 0.5 ? 1.0 : -1.0;
    float t = (pm.y + s * pm.x) / pitch;
    float yi = floor(t);
    float ft = fract(t);
    float fade = 1.0 - smoothstep(0.3, 0.9, fwidth(t));
    float tone = rr_h21(vec2(yi, ci) + 3.1);
    float fiber = rr_vnoise(vec2((pm.x - s * pm.y) * 1800.0, t * 2.0 + ci * 7.0));
    vec3 tc = vec3(0.8 + 0.4 * tone) * vec3(1.0, 0.96 + 0.06 * tone, 0.88 + 0.14 * tone) * (0.88 + 0.24 * fiber);
    m = mix(vec3(1.0), tc, fade);
    float prof = sin(3.14159 * ft);
    float fc = fract(pm.x / cw);
    float seam = smoothstep(0.0, 0.07, fc) * smoothstep(1.0, 0.93, fc);
    ao = mix(1.0, (0.42 + 0.58 * prof) * (0.55 + 0.45 * seam), fade);
    slope = vec2(s, 1.0) * cos(3.14159 * ft) * 0.55 * fade;
  } else if (uMicro > 2.5) {
    vec2 rp = pm / vec2(0.0045, 0.0012);
    float fade = 1.0 - smoothstep(0.35, 1.0, fwidth(rp.x));
    float fadeW = 1.0 - smoothstep(0.35, 1.0, fwidth(rp.y));
    float rib = sin(3.14159 * fract(rp.x));
    float weft = sin(3.14159 * fract(rp.y + rr_h11(floor(rp.x)) * 0.5));
    ao = mix(1.0, 0.78 + 0.22 * rib, fade) * mix(1.0, 0.9 + 0.1 * weft, fadeW);
    slope = vec2(cos(3.14159 * fract(rp.x)) * 0.5 * fade, cos(3.14159 * fract(rp.y)) * 0.15 * fadeW);
  }
  return m;
}
vec3 rrHair(vec2 pm, float amt, inout vec3 col) {
  vec4 ht = texture2D(tHair, pm / 0.25);
  float on = step(ht.r, amt * 1.05) * smoothstep(0.3, 0.8, ht.b);
  vec3 hc = ht.g < 0.3 ? vec3(0.045, 0.03, 0.022) : ht.g < 0.7 ? vec3(0.32, 0.3, 0.27) : vec3(0.62, 0.48, 0.28);
  col = mix(col, hc, on);
  return vec3(on);
}
float rrNapShade(vec2 napDir, vec3 T, vec3 B, vec3 wpos) {
  vec3 vd = normalize(wpos - cameraPosition);
  vec2 vt = vec2(dot(vd, T), dot(vd, B));
  float g = length(vt);
  float along = dot(vt, napDir);
  return 1.0 + along * uNapK * (0.4 + 0.6 * g);
}
`;

export function makeUniforms(rug, global) {
  const t = rug.surface.textures;
  const ty = rug.typeDef;
  const u = {
    tAlbedo: { value: rug.targets.albedo.texture },
    tSurf: { value: rug.targets.params.textures[0] },
    tDep: { value: rug.targets.params.textures[1] },
    tPattern: { value: rug.patternRT.texture },
    tNap: { value: t.nap },
    tDamage: { value: t.damage },
    tLayer: { value: t.layer },
    tDirt0: { value: t.dirt0 },
    tDirt2: { value: t.dirt2 },
    tTintGel: { value: t.tintGel },
    tTintPowder: { value: t.tintPowder },
    tDetailN: { value: rug.detail.normal },
    tDetailH: { value: rug.heightTex },
    uHTile: { value: rug.look.hTile ?? rug.look.tile },
    tHair: { value: global.hair },
    uDims: { value: new THREE.Vector2(rug.width, rug.length) },
    uBacking: { value: ty.backing },
    uPileH: { value: ty.pile.height },
    uPileMax: { value: rug.pileMax },
    uPileKind: { value: rug.pileKind },
    uMicro: { value: rug.spec.micro },
    uDetailTile: { value: rug.look.tile },
    uDetailStr: { value: rug.look.detailStr },
    uNapK: { value: rug.look.napK },
    uFiberRough: { value: rug.look.rough },
    uBaseAO: { value: rug.look.baseAO },
    uSheenAmt: { value: rug.look.sheen },
    uYarn: { value: rug.spec.yarn ? rug.spec.yarn.colors.map((c) => c.clone()) : [0, 1, 2, 3, 4].map(() => new THREE.Vector3(1, 1, 1)) },
    uYarnW: { value: new THREE.Vector4(1, 1, 1, 1) },
    uYarnMean: { value: rug.spec.yarn ? rug.spec.yarn.mean.clone() : new THREE.Vector3(1, 1, 1) },
    uMinSteps: { value: 6 },
    uMaxSteps: { value: 40 },
    uOverhang: { value: rug.pileKind === 4 ? rug.pileMax * 0.45 : rug.pileKind === 2 ? rug.pileMax * 0.25 : 0 },
    uLean: { value: rug.look.lean },
    uAoMin: { value: rug.look.aoMin },
    uHRemap: { value: new THREE.Vector2(rug.look.hLo, rug.look.hHi) },
    uSpec: { value: rug.look.spec },
    uDepH: { value: 0.048 },
    uDepTexel: { value: rug.targets.params.width / rug.width },
    uPileTop: { value: rug.pileMax },
    uKnots: { value: new THREE.Vector2(rug.spec.cells[0], rug.spec.cells[1]) },
    uBackKind: { value: rug.look.backKind },
    uBackCol: { value: rug.look.backCol.clone() },
    uPaint: { value: rug.paintLinear },
    uSeedOff: { value: rug.seedOff },
    uEdgeH: { value: 0.01 },
    uUvOn: global.uv.uUvOn,
    uUvPos: global.uv.uUvPos,
    uUvDir: global.uv.uUvDir,
    uUvCos: global.uv.uUvCos,
  };
  if (rug.spec.yarn) {
    let acc = 0;
    const w = rug.spec.yarn.weights;
    const cum = w.map((x) => (acc += x));
    u.uYarnW.value.set(cum[0], cum[1], cum[2], cum[3]);
  }
  return u;
}

function patch(mat, u, key, vertBegin, fragHead, repl, extraPhysical = null) {
  mat.onBeforeCompile = (sh) => {
    for (const k in u) sh.uniforms[k] = u[k];
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\n${VERT_HEAD}`).replace('#include <begin_vertex>', vertBegin)
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    let fs = sh.fragmentShader.replace('#include <common>', `#include <common>\n${VARY}\n${GLSL_COMMON}\n${GLSL_UVLAMP}\n${fragHead}`);
    if (extraPhysical) fs = fs.replace('#include <lights_physical_pars_fragment>', extraPhysical);
    for (const [a, b] of repl) fs = fs.replace(a, b);
    sh.fragmentShader = fs;
  };
  mat.customProgramCacheKey = () => key;
}

const FIBER_LIGHT = THREE.ShaderChunk.lights_physical_pars_fragment.replace(/#define RE_Direct\s+RE_Direct_Physical/, '#define RE_Direct RE_Direct_Fiber') + `
vec3 rrFiberT;
float rrSelfShadow = 1.0;
float rrFiberAmt;
float rrSpecAmt;
float rrWrap;
vec3 rrSpecTint;
void RE_Direct_Fiber(const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
  float dotNL = dot(geometryNormal, directLight.direction);
  float wrapNL = saturate((dotNL + rrWrap) / (1.0 + rrWrap)) * rrSelfShadow;
  float TL = dot(rrFiberT, directLight.direction);
  float kk = sqrt(max(0.0, 1.0 - TL * TL));
  float diff = mix(wrapNL, kk * saturate(dotNL * 0.6 + 0.4) * rrSelfShadow, rrFiberAmt);
  reflectedLight.directDiffuse += diff * directLight.color * BRDF_Lambert(material.diffuseColor);
  vec3 H = normalize(directLight.direction + geometryViewDir);
  float TH = dot(rrFiberT, H);
  float sTH = sqrt(max(0.0, 1.0 - TH * TH));
  float spec = (pow(sTH, 80.0) * 0.6 + pow(sTH, 12.0) * 0.25) * rrSpecAmt * saturate(dotNL + 0.25) * rrSelfShadow;
  reflectedLight.directSpecular += directLight.color * spec * rrSpecTint;
  reflectedLight.directSpecular += saturate(dotNL) * directLight.color * BRDF_GGX(directLight.direction, geometryViewDir, geometryNormal, material) * 0.3;
}
`;

const CHEAP_IBL = `
#if defined( RE_IndirectDiffuse ) && defined( USE_ENVMAP ) && defined( STANDARD ) && defined( ENVMAP_TYPE_CUBE_UV )
iblIrradiance += getIBLIrradiance( geometryNormal );
#endif
#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
radiance += iblIrradiance * 0.3;
#endif
`;

const VB_SURF = `
vec3 transformed = position + normal * uOffset;
vRugUv = uv;
vTanW = aTanU;
vNrmW = normal;
`;

const BASE_FRAG_MAP = `
vec4 rrAlb = texture2D(tAlbedo, vRugUv);
vec4 rrSurf = texture2D(tSurf, vRugUv);
vec4 rrNap = texture2D(tNap, vRugUv);
vec2 rrPm = vRugUv * uDims;
vec3 rrN = normalize(vNrmW);
vec3 rrT = normalize(vTanW - rrN * dot(vTanW, rrN));
vec3 rrB = cross(rrN, rrT);
float rrMicroAo;
vec2 rrSlope;
vec3 rrMul = rrMicro(rrPm, rrMicroAo, rrSlope);
vec3 rrCol = rr_toLin(rrAlb.rgb) * rrMul * rrMicroAo;
float rrCrush = rrNap.w;
vec2 rrNapDir = rrNap.xy * 2.0 - 1.0;
rrCol *= rrNapShade(rrNapDir, rrT, rrB, vWPos) * (1.0 - rrCrush * 0.35 * step(0.5, uPileKind));
rrCol *= uBaseAO;
if (rrAlb.a > 0.003) rrHair(rrPm, rrAlb.a, rrCol);
float rrWet = rrSurf.r;
float rrGloss = rrSurf.g;
float rrDust = rrSurf.b;
float rrGrain = step(0.985 - rrDust * 0.02, rr_h21(floor(rrPm * 2200.0))) * smoothstep(0.1, 0.5, rrDust);
diffuseColor.rgb = rrCol;
float rrRough = mix(uFiberRough, 0.22, rrGloss) * (1.0 - rrWet * 0.45);
rrRough = mix(rrRough, 0.12, rrGrain);
`;

const BASE_FRAG_NORMAL = `
vec3 rrNd = texture2D(tDetailN, rrPm / uDetailTile).xyz * 2.0 - 1.0;
rrNd.xy *= uDetailStr * (1.0 - smoothstep(0.3, 0.9, rrWet) * 0.6);
vec4 rrDmg = texture2D(tDamage, vRugUv);
vec2 rrWr = vec2(0.0);
if (rrDmg.b > 0.01) rrWr = (vec2(rr_vnoise(rrPm * 22.0), rr_vnoise(rrPm * 22.0 + 7.3)) - 0.5) * rrDmg.b * 1.6;
vec3 rrNt = normalize(vec3(rrNd.xy - rrSlope - rrWr, max(rrNd.z, 0.2)));
vec3 rrNw = normalize(rrT * rrNt.x + rrB * rrNt.y + rrN * rrNt.z);
normal = normalize((viewMatrix * vec4(rrNw, 0.0)).xyz);
`;

const BASE_FRAG_PHYS = `
#include <lights_physical_fragment>
#ifdef USE_CLEARCOAT
material.clearcoat = max(rrGloss * 0.85, smoothstep(0.1, 0.8, rrWet) * 0.55);
material.clearcoatRoughness = mix(0.4, 0.05, max(rrGloss, rrWet));
#endif
#ifdef USE_SHEEN
material.sheenColor = mix(vec3(0.6), rrCol * 2.2, 0.5) * uSheenAmt * (1.0 - rrWet * 0.7);
#endif
`;

const UV_OUT = (urine, bright) => `
outgoingLight = rr_uvApply(outgoingLight, diffuseColor.rgb, rr_uvCone(vWPos), ${urine}, ${bright});
#include <opaque_fragment>
`;

export function baseMaterial(rug, u) {
  const look = rug.look;
  const m = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: look.rough,
    metalness: 0,
    sheen: look.sheen > 0 ? 1 : 0,
    sheenRoughness: look.sheenRough,
    sheenColor: new THREE.Color(1, 1, 1),
    clearcoat: 1,
    clearcoatRoughness: 0.3,
    anisotropy: look.aniso,
    anisotropyRotation: Math.PI / 2,
    ior: 1.45,
    specularIntensity: look.specInt,
  });
  m.userData.u = u;
  patch(m, Object.assign({ uOffset: { value: rug.typeDef.backing } }, u), `rug-base-${look.aniso > 0 ? 'a' : 'n'}-${look.sheen > 0 ? 's' : 'n'}`, VB_SURF, SURF_UNIFORMS + SURF_FUNCS, [
    ['#include <map_fragment>', BASE_FRAG_MAP],
    ['#include <roughnessmap_fragment>', 'float roughnessFactor = rrRough;'],
    ['#include <normal_fragment_maps>', BASE_FRAG_NORMAL],
    ['#include <lights_physical_fragment>', BASE_FRAG_PHYS],
    ['#include <opaque_fragment>', UV_OUT('rrSurf.a * (0.6 + 0.4 * rrMicroAo)', 'rrGrain * 0.2')],
  ]);
  return m;
}

const UNDER_FRAG_MAP = `
vec2 rrPm = vRugUv * uDims;
vec4 rrAlb = texture2D(tAlbedo, vRugUv);
vec4 rrSurf = texture2D(tSurf, vRugUv);
vec3 rrCol;
float rrRough = 0.9;
float rrK = uBackKind;
vec3 rrNt = vec3(0.0, 0.0, 1.0);
if (rrK < 0.5) {
  vec2 g = rrPm / 0.006;
  vec2 f = fract(g);
  float line = max(smoothstep(0.85, 0.95, f.x), smoothstep(0.85, 0.95, f.y)) * (1.0 - smoothstep(0.5, 1.0, length(fwidth(g))));
  rrCol = mix(uBackCol, uBackCol * 3.2, line * 0.5);
} else if (rrK < 1.5) {
  rrCol = uBackCol * (0.85 + 0.3 * rr_vnoise(rrPm * 300.0));
  vec3 nd = texture2D(tDetailN, rrPm / 0.12).xyz * 2.0 - 1.0;
  rrNt = normalize(vec3(nd.xy * 1.2, nd.z));
} else if (rrK < 2.5) {
  vec2 g = rrPm / vec2(0.0045, 0.004);
  vec2 f = fract(g);
  float st = smoothstep(0.45, 0.2, abs(f.x - 0.5)) * smoothstep(0.5, 0.3, abs(f.y - 0.5)) * (1.0 - smoothstep(0.4, 1.0, length(fwidth(g))));
  rrCol = mix(uBackCol, rr_toLin(rrAlb.rgb) * 0.8, st * 0.85 + 0.1);
} else if (rrK < 3.5) {
  vec2 g = vRugUv * uKnots;
  vec2 f = fract(g);
  float fade = 1.0 - smoothstep(0.3, 0.9, length(fwidth(g)));
  float knot = smoothstep(0.0, 0.18, f.x) * smoothstep(1.0, 0.82, f.x) * smoothstep(0.0, 0.2, f.y) * smoothstep(1.0, 0.8, f.y);
  float pair = 0.85 + 0.15 * sin(f.x * 6.28318 * 2.0);
  rrCol = rr_sat(rr_toLin(rrAlb.rgb), 0.85) * 0.8 * mix(1.0, (0.55 + 0.45 * knot) * pair, fade);
  rrNt = normalize(vec3(vec2(cos(f.x * 6.28318 * 2.0) * 0.2, cos(f.y * 6.28318) * 0.3) * fade, 1.0));
} else if (rrK < 4.5) {
  rrCol = rr_toLin(rrAlb.rgb) * 0.92;
  float rib = sin(3.14159 * fract(rrPm.x / 0.0045));
  rrCol *= mix(1.0, 0.82 + 0.18 * rib, 1.0 - smoothstep(0.35, 1.0, fwidth(rrPm.x / 0.0045)));
} else {
  rrCol = uBackCol * (0.9 + 0.2 * rr_vnoise(rrPm * 200.0));
  rrRough = 0.75;
}
float rrWet = rrSurf.r;
rrCol *= 1.0 - rrWet * 0.35;
diffuseColor.rgb = rrCol;
`;

export function underMaterial(rug, u) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0, side: THREE.BackSide });
  patch(m, Object.assign({ uOffset: { value: 0 } }, u), 'rug-under', VB_SURF, SURF_UNIFORMS + `uniform vec2 uKnots;\nuniform float uBackKind;\nuniform vec3 uBackCol;\n`, [
    ['#include <map_fragment>', UNDER_FRAG_MAP],
    ['#include <roughnessmap_fragment>', 'float roughnessFactor = rrRough;'],
    ['#include <normal_fragment_maps>', `
vec3 rrN = normalize(vNrmW);
vec3 rrT = normalize(vTanW - rrN * dot(vTanW, rrN));
vec3 rrB = cross(rrN, rrT);
vec3 rrNw = normalize(rrT * rrNt.x - rrB * rrNt.y - rrN * rrNt.z);
normal = normalize((viewMatrix * vec4(rrNw, 0.0)).xyz);
`],
    ['#include <opaque_fragment>', UV_OUT('rrSurf.a * 0.5', '0.0')],
  ]);
  return m;
}

const VOL_VERT = `
vec3 rrNv = normalize(normal);
vec3 rrTv = normalize(aTanU - rrNv * dot(aTanU, rrNv));
vec3 rrBv = cross(rrNv, rrTv);
vec2 rrE = vec2(uv.x < 0.0001 ? -1.0 : (uv.x > 0.9999 ? 1.0 : 0.0), uv.y < 0.0001 ? -1.0 : (uv.y > 0.9999 ? 1.0 : 0.0));
vec3 transformed = position + normal * (uOffset + uPileMax) + (rrTv * rrE.x + rrBv * rrE.y) * uOverhang;
vRugUv = uv + rrE * uOverhang / uDims;
vTanW = aTanU;
vNrmW = normal;
`;

const VOL_FUNCS = `
float rrLod;
float rrAa;
void pileMask(vec2 pb, float th, out float m) {
  float hf = textureLod(tDetailH, pb / uHTile, rrLod).r;
  hf = clamp((hf - uHRemap.x) / (uHRemap.y - uHRemap.x), 0.0, 1.0);
  vec2 o = max(max(-pb, pb - uDims), 0.0);
  float out1 = max(o.x, o.y);
  if (out1 > 0.0) hf *= 1.0 - smoothstep(0.0, uOverhang + 1e-4, out1 * (1.2 + 0.8 * rr_vnoise(pb * 90.0)));
  m = hf - th;
}
`;

const VOL_FRAG_MAP = `
vec3 rrN = normalize(vNrmW);
vec3 rrT = normalize(vTanW - rrN * dot(vTanW, rrN));
vec3 rrB = cross(rrN, rrT);
vec3 rrVd = normalize(vWPos - cameraPosition);
vec3 rrD = vec3(dot(rrVd, rrT), dot(rrVd, rrB), dot(rrVd, rrN));
float rrDz = min(rrD.z, -0.1);
vec2 rrSl = rrD.xy / -rrDz;
vec2 rrUv0 = clamp(vRugUv, 0.0, 1.0);
vec4 rrNap = texture2D(tNap, rrUv0);
float rrFluff = rrNap.z;
float rrCrush = rrNap.w;
bool rrShag = uPileKind > 3.5;
float rrHl = (rrShag ? mix(0.5, 1.33, rrFluff) : mix(0.86, 1.1, rrFluff)) * (1.0 - rrCrush * (rrShag ? 0.72 : 0.55)) * uPileH;
vec2 rrNapDir = rrNap.xy * 2.0 - 1.0;
float rrLeanF = uLean + rrCrush * 0.9 + (rrShag ? (1.0 - rrFluff) * 0.35 : 0.0);
vec2 rrLeanV = rrNapDir * rrLeanF * rrHl;
vec2 rrP0 = vRugUv * uDims;
vec2 rrFw = fwidth(rrP0);
vec2 rrTd = rrFw / uHTile * 1024.0;
rrLod = max(0.0, log2(max(max(rrTd.x, rrTd.y), 1e-4)) - 0.5);
float rrLayer = rrShag ? 0.55 : 1.0;
float rrHbot = rrHl * (1.0 - rrLayer);
float rrHtop = uPileMax;
float rrSpan = rrHtop - rrHbot;
float rrStepXY = rrShag ? 0.0018 : 0.0012;
float rrNf = clamp(ceil(rrSpan * length(rrSl) / rrStepXY) + uMinSteps, uMinSteps, uMaxSteps);
int rrNs = int(rrNf);
float rrDh = rrSpan / rrNf;
float rrH = rrHtop - rrDh * rr_h21(floor(gl_FragCoord.xy));
vec2 rrP = rrP0 + rrSl * (rrHtop - rrH);
bool rrHit = false;
float rrPrevM = -1.0;
float rrPrevH = rrH;
vec2 rrPrevP = rrP;
for (int i = 0; i < 64; i++) {
  if (i >= rrNs) break;
  float hf = rrH / rrHl;
  float m;
  pileMask(rrP - rrLeanV * min(hf, 1.0) * min(hf, 1.0), (rrH - rrHbot) / (rrHl * rrLayer), m);
  if (m > 0.0) {
    float f = rrPrevM < 0.0 ? clamp(-rrPrevM / max(m - rrPrevM, 1e-4), 0.0, 1.0) : 0.0;
    rrP = mix(rrPrevP, rrP, f);
    rrH = mix(rrPrevH, rrH, f);
    rrHit = true;
    break;
  }
  rrPrevM = m;
  rrPrevH = rrH;
  rrPrevP = rrP;
  rrH -= rrDh;
  rrP += rrSl * rrDh;
}
float rrTh = clamp(rrH / max(rrHl, 1e-4), 0.0, 1.0);
vec2 rrHitUv = rrP / uDims;
bool rrOut = rrHitUv.x < 0.0 || rrHitUv.y < 0.0 || rrHitUv.x > 1.0 || rrHitUv.y > 1.0;
if (!rrHit && rrOut) discard;
float rrShade = 1.0;
vec3 rrTile = vec3(0.5, 0.5, 1.0);
vec3 rrHn = vec3(0.0, 0.0, 1.0);
rrSelfShadow = 1.0;
if (rrHit) {
  vec2 pl = (rrP - rrLeanV * rrTh * rrTh) / uHTile;
  float te = exp2(rrLod) / 1024.0;
  float hx = textureLod(tDetailH, pl + vec2(te, 0.0), rrLod).r - textureLod(tDetailH, pl - vec2(te, 0.0), rrLod).r;
  float hy = textureLod(tDetailH, pl + vec2(0.0, te), rrLod).r - textureLod(tDetailH, pl - vec2(0.0, te), rrLod).r;
  float hs = rrHl * rrLayer / (uHRemap.y - uHRemap.x) / (2.0 * te * uHTile);
  rrHn = normalize(vec3(-hx * hs, -hy * hs, 1.0));
#if NUM_DIR_LIGHTS > 0
  vec3 rrLw = normalize((vec4(directionalLights[0].direction, 0.0) * viewMatrix).xyz);
  vec3 rrLt = vec3(dot(rrLw, rrT), dot(rrLw, rrB), max(dot(rrLw, rrN), 0.15));
  vec2 rrLs = rrLt.xy / rrLt.z;
  float occ = 0.0;
  for (int j = 1; j <= 5; j++) {
    float dzh = rrHl * rrLayer * 0.12 * float(j);
    float hr = rrH + dzh;
    if (hr > rrHtop) break;
    float hf = hr / rrHl;
    float m;
    pileMask(rrP + rrLs * dzh - rrLeanV * min(hf, 1.0) * min(hf, 1.0), (hr - rrHbot) / (rrHl * rrLayer), m);
    occ = max(occ, clamp(m * 8.0, 0.0, 1.0) * (1.0 - float(j) * 0.1));
  }
  rrSelfShadow = 1.0 - occ * 0.85;
#endif
  if (rrShag) {
    vec4 tl = textureLod(tDetailH, pl, rrLod);
    rrTile = tl.gba;
    rrShade = (0.8 + 0.4 * tl.g) * mix(0.5, 1.0, pow(tl.a, 1.5));
  } else {
    rrShade = 0.82 + 0.3 * rrTh;
  }
  rrShade *= mix(1.0, 0.62, smoothstep(0.35, 0.95, 1.0 - rrHn.z));
}
rrHitUv = clamp(rrHitUv, 0.0, 1.0);
vec4 rrAlb = texture2D(tAlbedo, rrHitUv);
vec4 rrSurf = texture2D(tSurf, rrHitUv);
vec2 rrPm = rrHitUv * uDims;
float rrMicroAo;
vec2 rrSlope;
vec3 rrMul = rrMicro(rrPm, rrMicroAo, rrSlope);
vec3 rrCol = rr_toLin(rrAlb.rgb) * rrMul * rrMicroAo * (rrShag ? 0.8 : 1.0);
float rrHabs = clamp(rrH / max(uPileH * (rrShag ? 1.15 : 1.0), 1e-4), 0.0, 1.0);
float rrAo = rrHit ? mix(uAoMin, 1.0, pow(rrHabs, rrShag ? 1.6 : 0.8)) * rrShade : uAoMin * 0.6;
rrCol *= rrAo;
float rrDust = rrSurf.b;
rrCol = mix(rrCol, vec3(0.26, 0.235, 0.2) * rrAo, rrDust * (1.0 - rrTh) * 0.35);
rrCol *= rrNapShade(rrNapDir, rrT, rrB, vWPos) * (1.0 - rrCrush * 0.38);
if (rrAlb.a > 0.003 && rrTh > 0.7) rrHair(rrPm, rrAlb.a, rrCol);
diffuseColor.rgb = rrCol;
float rrWet = rrSurf.r;
float rrRough = mix(uFiberRough, 0.3, max(rrSurf.g, rrWet * 0.6));
vec3 rrHnV = normalize((viewMatrix * vec4(normalize(rrT * rrHn.x + rrB * rrHn.y + rrN * rrHn.z), 0.0)).xyz);
vec3 rrLeanW = rrT * rrNapDir.x + rrB * rrNapDir.y;
float rrFa = rrTile.y * 3.14159;
vec3 rrFt = rrShag ? (rrT * cos(rrFa) + rrB * sin(rrFa)) * 0.9 + rrN * 0.3 : rrN + rrLeanW * rrLeanF * 2.0 * rrTh + (rrT * (rr_h21(floor(rrPm * 400.0)) - 0.5) + rrB * (rr_h21(floor(rrPm * 400.0) + 3.7) - 0.5)) * 0.7;
rrFiberT = normalize((viewMatrix * vec4(normalize(rrFt), 0.0)).xyz);
rrFiberAmt = rrHit ? (rrShag ? 0.6 : 0.45) : 0.0;
rrSpecAmt = rrHit ? uSpec * (1.0 + rrWet * 1.5) * rrAo : 0.0;
rrWrap = rrShag ? 0.35 : 0.25;
rrSpecTint = mix(vec3(1.0), rrCol * 3.0, 0.35);
`;

export function volumeMaterial(rug, u, global) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0 });
  patch(m, Object.assign({ uOffset: { value: rug.typeDef.backing }, uTime: global.time }, u), 'rug-volume', VOL_VERT, SURF_UNIFORMS + SURF_FUNCS + `
uniform float uPileMax;
uniform float uPileH;
uniform float uLean;
uniform float uAoMin;
uniform vec2 uHRemap;
uniform float uSpec;
uniform float uMinSteps;
uniform float uMaxSteps;
uniform float uHTile;
uniform float uOverhang;
` + VOL_FUNCS, [
    ['#include <map_fragment>', VOL_FRAG_MAP],
    ['#include <roughnessmap_fragment>', 'float roughnessFactor = rrRough;'],
    ['#include <normal_fragment_maps>', 'normal = rrHnV;'],
    ['#include <lights_fragment_maps>', CHEAP_IBL],
    ['#include <opaque_fragment>', UV_OUT('rrSurf.a * (0.35 + 0.65 * rrAo)', 'smoothstep(0.75, 0.95, rr_luma(rrCol)) * 0.3')],
  ], FIBER_LIGHT);
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh) => {
    prev(sh);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uPileMax;\nuniform float uOverhang;\nuniform vec2 uDims;');
  };
  return m;
}

const DEP_VERT = `
vec3 transformed = position + normal * (uOffset + uPileTop + uDepH);
vRugUv = uv;
vTanW = aTanU;
vNrmW = normal;
`;

const DEP_FRAG_MAP = `
vec3 rrN0 = normalize(vNrmW);
vec3 rrT0 = normalize(vTanW - rrN0 * dot(vTanW, rrN0));
vec3 rrB0 = cross(rrN0, rrT0);
vec3 rrVd = normalize(vWPos - cameraPosition);
vec3 rrDv = vec3(dot(rrVd, rrT0), dot(rrVd, rrB0), dot(rrVd, rrN0));
float rrDz = min(rrDv.z, -0.12);
vec2 rrSl = rrDv.xy / -rrDz;
vec2 rrUvSl = rrSl / uDims;
float rrTravel = uDepH * length(rrSl);
vec4 rrCoarse = textureLod(tDep, vRugUv + rrUvSl * uDepH * 0.5, log2(max(rrTravel * uDepTexel, 1.0)) + 1.5);
if (rrCoarse.r + rrCoarse.g < 0.0004) discard;
float rrNf = clamp(ceil(rrTravel / 0.0035) + 8.0, 8.0, 32.0);
int rrNs = int(rrNf);
float rrDh = uDepH / rrNf;
float vDepH = uDepH - rrDh * rr_h21(floor(gl_FragCoord.xy));
vec2 rrUvH = vRugUv + rrUvSl * (uDepH - vDepH);
float rrPrevD = -1.0;
float rrPrevH = vDepH;
vec2 rrPrevUv = rrUvH;
bool rrHitD = false;
for (int i = 0; i < 40; i++) {
  if (i >= rrNs) break;
  vec4 dp = textureLod(tDep, rrUvH, 0.0);
  float hm = max(dp.r * 0.016, dp.g * 0.04 * (0.74 + 0.5 * rr_vnoise(rrUvH * uDims * 38.0 + uSeedOff)) * smoothstep(0.0, 0.16, dp.g));
  float d = hm - vDepH;
  if (d >= 0.0) {
    float f = rrPrevD < 0.0 ? clamp(-rrPrevD / max(d - rrPrevD, 1e-5), 0.0, 1.0) : 0.0;
    vDepH = mix(rrPrevH, vDepH, f);
    rrUvH = mix(rrPrevUv, rrUvH, f);
    rrHitD = true;
    break;
  }
  rrPrevD = d;
  rrPrevH = vDepH;
  rrPrevUv = rrUvH;
  vDepH -= rrDh;
  rrUvH += rrUvSl * rrDh;
}
if (!rrHitD || rrUvH.x < 0.0 || rrUvH.y < 0.0 || rrUvH.x > 1.0 || rrUvH.y > 1.0) discard;
vec4 rrDep = texture2D(tDep, rrUvH);
float rrSolid = rrDep.r * 0.016;
float rrFoamA = rrDep.g;
vec2 rrPm = rrUvH * uDims;
vec4 d0 = texture2D(tDirt0, rrUvH);
vec4 d2 = texture2D(tDirt2, rrUvH);
vec4 ly = texture2D(tLayer, rrUvH);
float rrWetP = smoothstep(0.25, 0.75, ly.r);
vec3 rrVo = rr_voronoi(rrPm / 0.013 + uSeedOff);
float rrCrack = smoothstep(0.09, 0.0, rrVo.y - rrVo.x);
float rrMudH = smoothstep(0.06, 0.55, d0.b) * 0.010 * (0.7 + 0.35 * rrVo.z) * (1.0 - rrCrack * 0.6) * (0.85 + 0.3 * rr_vnoise(rrPm * 220.0));
float rrGumH = smoothstep(0.15, 0.5, d2.r) * 0.0032;
float rrWaxH = smoothstep(0.12, 0.5, d2.g) * 0.0042 * (0.85 + 0.3 * rr_vnoise(rrPm * 160.0));
float rrGwH = max(rrGumH, rrWaxH);
float rrPH = smoothstep(0.3, 0.6, d2.b) * 0.0006;
float rrGrainN = rr_h21(floor(rrPm * 2600.0));
float rrPowH = ly.g * 0.0065 * (1.0 - 0.3 * rrWetP) * (0.88 + 0.24 * mix(rr_vnoise(rrPm * 700.0), 0.5, rrWetP));
float rrSolidH = rrMudH + rrGwH + rrPH + rrPowH;
float rrFoamH = 0.0;
vec2 rrBubN = vec2(0.0);
float rrRim = 0.0;
float rrBubV = 0.5;
if (rrFoamA > 0.004) {
  vec2 bp = rrPm / 0.0042 + uSeedOff;
  vec2 n = floor(bp);
  vec2 f = fract(bp);
  float d1 = 8.0;
  float d2b = 8.0;
  vec2 o1 = vec2(0.0);
  vec2 id1 = n;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 o = rr_h22(n + g);
    vec2 r = g + o - f;
    float d = dot(r, r);
    if (d < d1) { d2b = d1; d1 = d; o1 = r; id1 = n + g; } else if (d < d2b) { d2b = d; }
  }
  float dd = sqrt(d1);
  float edge = sqrt(d2b) - dd;
  rrRim = smoothstep(0.16, 0.0, edge);
  rrBubV = rr_h21(id1);
  float dome = sqrt(max(0.0, 1.0 - dd * dd * 1.3));
  vec2 sp = rrPm / 0.0016 + uSeedOff * 3.0;
  vec2 sf = fract(sp) - 0.5;
  float small = smoothstep(0.32, 0.18, length(sf + (rr_h22(floor(sp)) - 0.5) * 0.3));
  rrBubN = -o1 * 1.1 * dome + sf * small * 0.5;
  float big = rr_vnoise(rrPm * 38.0 + uSeedOff);
  float clumps = rr_vnoise(rrPm * 14.0 + uSeedOff.yx);
  rrFoamH = rrFoamA * 0.04 * (0.8 + 0.2 * dome) * (0.7 + 0.6 * big) * smoothstep(0.0, 0.2, rrFoamA * (0.6 + 0.8 * clumps));
}
vec3 rrCol;
float rrRough;
vec2 rrMicroN = vec2(0.0);
float rrBright = 0.0;
float rrAo = 1.0;
float rrHs = clamp(vDepH * rrSolidH / max(rrSolid, 1e-5), 0.0, rrSolidH);
float rrC1 = rrMudH, rrC2 = rrC1 + rrGwH, rrC3 = rrC2 + rrPH;
int rrLayer = (rrMudH > 1e-6 && rrHs <= rrC1 + 1e-6) ? 0 : (rrGwH > 1e-6 && rrHs <= rrC2 + 1e-6) ? 1 : (rrPH > 1e-6 && rrHs <= rrC3 + 1e-6) ? 2 : rrPowH > 1e-6 ? 3 : rrGwH > 1e-6 ? 1 : rrMudH > 1e-6 ? 0 : 2;
if (rrFoamA > 0.004 && vDepH > rrSolid * 0.97) {
  vec4 tg = texture2D(tTintGel, rrUvH);
  float dirt = tg.a * (0.65 + 0.35 * rr_vnoise(rrPm * 30.0));
  rrCol = mix(vec3(0.74, 0.75, 0.76), vec3(0.33, 0.28, 0.21), dirt) * (0.86 + 0.18 * rrBubV);
  rrCol *= 1.0 - rrRim * 0.55;
  rrAo = mix(0.42, 1.0, smoothstep(0.0, max(rrFoamH, 1e-4), vDepH + 0.003));
  rrCol *= rrAo;
  rrRough = 0.1 + rrRim * 0.6;
  rrMicroN = rrBubN;
  rrBright = (1.0 - dirt) * 0.6;
} else if (rrLayer == 0) {
  rrCol = vec3(0.085, 0.056, 0.034) * (0.88 + 0.24 * rrVo.z) * (0.9 + 0.2 * rr_vnoise(rrPm * 90.0)) * (1.0 - rrCrack * 0.85);
  rrCol = mix(rrCol, rrCol * 1.35 + 0.01, smoothstep(0.3, 1.0, rrHs / max(rrMudH, 1e-4)));
  rrRough = mix(0.97, 0.55, rrWetP);
  rrCol *= mix(1.0, 0.7, rrWetP);
  rrMicroN = (vec2(rr_vnoise(rrPm * 900.0), rr_vnoise(rrPm * 900.0 + 3.1)) - 0.5) * 1.4 + (rrVo.xy - 0.5) * 0.0;
  rrAo = mix(0.65, 1.0, smoothstep(0.0, max(rrMudH, 1e-4), rrHs + 0.002));
  rrCol *= rrAo;
} else if (rrLayer == 1) {
  bool gum = rrGumH > rrWaxH;
  rrCol = gum ? vec3(0.55, 0.38, 0.41) * (0.8 + 0.25 * rr_vnoise(rrPm * 200.0)) : vec3(0.8, 0.76, 0.64) * (0.92 + 0.12 * rr_vnoise(rrPm * 120.0));
  rrRough = gum ? 0.42 : 0.16;
  rrBright = gum ? 0.0 : 0.15;
  rrMicroN = (vec2(rr_vnoise(rrPm * 300.0), rr_vnoise(rrPm * 300.0 + 1.7)) - 0.5) * (gum ? 0.6 : 0.25);
} else if (rrLayer == 2) {
  rrCol = uPaint;
  rrRough = 0.38;
} else {
  vec4 tp = texture2D(tTintPowder, rrUvH);
  rrCol = rr_toLin(tp.rgb) * mix(0.72 + 0.4 * rrGrainN, 0.62, rrWetP) * 0.92;
  rrRough = mix(0.95, 0.28, rrWetP);
  rrMicroN = (vec2(rr_h21(floor(rrPm * 2600.0) + 1.3), rr_h21(floor(rrPm * 2600.0) + 4.1)) - 0.5) * mix(1.6, 0.25, rrWetP);
  rrBright = (1.0 - rrWetP) * 0.8;
  rrAo = mix(0.7, 1.0, smoothstep(0.0, max(rrSolidH, 1e-4), rrHs + 0.001));
  rrCol *= rrAo;
}
diffuseColor.rgb = rrCol;
diffuseColor.a = 1.0;
`;

export function depositMaterial(rug, u) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0 });
  patch(m, Object.assign({ uOffset: { value: rug.typeDef.backing } }, u), 'rug-deposit', DEP_VERT, `
uniform sampler2D tDep;
uniform sampler2D tDirt0;
uniform sampler2D tDirt2;
uniform sampler2D tLayer;
uniform sampler2D tTintGel;
uniform sampler2D tTintPowder;
uniform vec2 uDims;
uniform vec3 uPaint;
uniform vec2 uSeedOff;
uniform float uDepH;
uniform float uDepTexel;
`, [
    ['#include <map_fragment>', DEP_FRAG_MAP],
    ['#include <roughnessmap_fragment>', 'float roughnessFactor = rrRough;'],
    ['#include <normal_fragment_maps>', `
vec2 rrMacro = (rrDep.ba - 0.5) * 4.0;
vec3 rrNt = normalize(vec3(-rrMacro + rrMicroN, 1.0));
vec3 rrNw = normalize(rrT0 * rrNt.x + rrB0 * rrNt.y + rrN0 * rrNt.z);
normal = normalize((viewMatrix * vec4(rrNw, 0.0)).xyz);
`],
    ['#include <emissivemap_fragment>', 'totalEmissiveRadiance += rrCol * 0.04;'],
    ['#include <opaque_fragment>', UV_OUT('0.0', 'rrBright')],
  ]);
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh) => {
    prev(sh);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uDepH;\nuniform float uPileTop;');
  };
  return m;
}

const FILM_VERT = `
vec3 transformed = position + normal * (uOffset + uPileTop + 0.0012);
vRugUv = uv;
vTanW = aTanU;
vNrmW = normal;
`;

const FILM_FRAG_MAP = `
vec4 rrLy = texture2D(tLayer, vRugUv);
float rrWa = smoothstep(0.78, 0.93, rrLy.r);
float rrGa = smoothstep(0.02, 0.3, rrLy.b);
if (rrWa + rrGa < 0.01) discard;
vec4 rrTg = texture2D(tTintGel, vRugUv);
vec4 rrTp = texture2D(tTintPowder, vRugUv);
vec3 rrWaterC = mix(vec3(0.05, 0.06, 0.065), vec3(0.2, 0.15, 0.08), rrTp.a);
vec3 rrGelC = rr_toLin(rrTg.rgb) * 0.8;
float rrGf = rrGa / (rrWa + rrGa);
diffuseColor.rgb = mix(rrWaterC, rrGelC, rrGf);
float rrBaseA = mix(0.12 + rrTp.a * 0.5, 0.5, rrGf) * max(rrWa, rrGa);
vec2 rrPm = vRugUv * uDims;
vec2 e = vec2(0.012) / uDims;
float gx = texture2D(tLayer, vRugUv + vec2(e.x, 0.0)).b - texture2D(tLayer, vRugUv - vec2(e.x, 0.0)).b;
float gy = texture2D(tLayer, vRugUv + vec2(0.0, e.y)).b - texture2D(tLayer, vRugUv - vec2(0.0, e.y)).b;
vec2 rrFilmSlope = vec2(gx, gy) * 0.35 * rrGf + ((vec2(rr_vnoise(rrPm * 40.0 + uTime * 0.3), rr_vnoise(rrPm * 40.0 + 9.0 - uTime * 0.25)) - 0.5) * 0.08 + (vec2(rr_vnoise(rrPm * 260.0), rr_vnoise(rrPm * 260.0 + 4.0)) - 0.5) * 0.12) * (1.0 - rrGf);
`;

export function filmMaterial(rug, u, global) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.04, metalness: 0, transparent: true, depthWrite: false });
  patch(m, Object.assign({ uOffset: { value: rug.typeDef.backing }, uTime: global.time }, u), 'rug-film', FILM_VERT, `
uniform sampler2D tLayer;
uniform sampler2D tTintGel;
uniform sampler2D tTintPowder;
uniform vec2 uDims;
uniform float uTime;
`, [
    ['#include <map_fragment>', FILM_FRAG_MAP],
    ['#include <normal_fragment_maps>', `
vec3 rrN = normalize(vNrmW);
vec3 rrT = normalize(vTanW - rrN * dot(vTanW, rrN));
vec3 rrB = cross(rrN, rrT);
vec3 rrNw = normalize(rrN - rrT * rrFilmSlope.x - rrB * rrFilmSlope.y);
normal = normalize((viewMatrix * vec4(rrNw, 0.0)).xyz);
float rrFres = pow(1.0 - saturate(abs(dot(normal, normalize(vViewPosition)))), 4.0);
diffuseColor.a = clamp(rrBaseA + rrFres * 0.55 * max(rrWa, rrGa), 0.0, 0.85);
`],
    ['#include <opaque_fragment>', UV_OUT('0.0', '0.0')],
  ]);
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh) => {
    prev(sh);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uPileTop;');
  };
  return m;
}

export function edgeMaterial(rug, u) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    for (const k of ['tAlbedo', 'uDims', 'uUvOn', 'uUvPos', 'uUvDir', 'uUvCos']) sh.uniforms[k] = u[k];
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 aEdge;\nvarying vec3 vEdge;\nvarying vec3 vWPos;\nvarying vec2 vRugUv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEdge = aEdge;\nvRugUv = uv;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\n${GLSL_COMMON}\n${GLSL_UVLAMP}\nuniform sampler2D tAlbedo;\nuniform vec2 uDims;\nvarying vec3 vEdge;\nvarying vec3 vWPos;\nvarying vec2 vRugUv;`)
      .replace('#include <map_fragment>', `
vec3 rrC = rr_toLin(textureLod(tAlbedo, vRugUv, 2.0).rgb);
float rrS = vEdge.x / 0.0028 + vEdge.y * 2.0;
float rrWrapS = 0.75 + 0.25 * sin(rrS * 6.28318);
float rrFade = 1.0 - smoothstep(0.3, 1.0, fwidth(rrS));
diffuseColor.rgb = rrC * 0.78 * mix(1.0, rrWrapS, rrFade) * (0.7 + 0.3 * vEdge.z);
`)
      .replace('#include <opaque_fragment>', UV_OUT('0.0', '0.0'));
  };
  m.customProgramCacheKey = () => 'rug-edge';
  return m;
}

const FRINGE_VERT_HEAD = `
uniform sampler2D tChains;
uniform vec2 uChainDims;
uniform float uChains;
uniform float uStrandR;
uniform float uKnotted;
attribute vec2 aRing;
attribute vec4 iStrand;
varying float vFt;
varying float vFr;
vec3 chainNode(float c, float k) { return texelFetch(tChains, ivec2(int(k), int(c)), 0).xyz; }
vec3 chainAt(float s, float endRow, float t, out vec3 tang, out vec3 nrm) {
  float cf = clamp(s, 0.0, 1.0) * (uChains - 1.0);
  float c0 = floor(cf);
  float c1 = min(c0 + 1.0, uChains - 1.0);
  float fc = cf - c0;
  float kmax = uChainDims.x - 2.0;
  float kf = clamp(t, 0.0, 1.0) * kmax;
  float k0 = min(floor(kf), kmax - 1.0);
  float fk = kf - k0;
  vec3 a0 = chainNode(endRow + c0, k0), a1 = chainNode(endRow + c0, k0 + 1.0);
  vec3 b0 = chainNode(endRow + c1, k0), b1 = chainNode(endRow + c1, k0 + 1.0);
  tang = normalize(mix(a1 - a0, b1 - b0, fc) + vec3(1e-6));
  nrm = normalize(mix(chainNode(endRow + c0, kmax + 1.0), chainNode(endRow + c1, kmax + 1.0), fc) + vec3(1e-6));
  return mix(mix(a0, a1, fk), mix(b0, b1, fk), fc);
}
`;

const FRINGE_BEGIN = `
float rrT = aRing.x * iStrand.z;
float rrEnd = iStrand.y * uChains;
float rrBundles = max(1.0, floor(uChains * 1.6));
float rrBc = (floor(iStrand.x * rrBundles) + 0.5) / rrBundles;
float rrKw = uKnotted * smoothstep(0.03, 0.16, rrT) * (1.0 - 0.28 * smoothstep(0.25, 0.8, rrT));
float rrS = mix(iStrand.x, rrBc, rrKw);
vec3 rrTan, rrNrm;
vec3 rrP = chainAt(rrS, rrEnd, rrT, rrTan, rrNrm);
vec3 rrS1 = normalize(cross(rrTan, rrNrm) + vec3(1e-5, 0.0, 0.0));
vec3 rrS2 = normalize(cross(rrS1, rrTan));
float rrCurl = sin(rrT * 9.0 + iStrand.w * 6.28) * 0.0016 * rrT;
float rrBulge = 1.0 + uKnotted * 1.4 * exp(-pow((rrT - 0.16) / 0.035, 2.0));
float rrR = uStrandR * rrBulge * (1.0 - 0.35 * rrT);
float rrA = aRing.y * 6.28318;
vec3 rrRad = rrS1 * cos(rrA) + rrS2 * sin(rrA);
vec3 transformed = rrP + rrS1 * rrCurl + rrRad * rrR;
vec3 objectNormal = rrRad;
vFt = rrT;
vFr = iStrand.w;
`;

export function fringeMaterials(colorHex, uniforms) {
  const m = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.82, metalness: 0 });
  const vtx = (sh) => {
    for (const k in uniforms) sh.uniforms[k] = uniforms[k];
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\n${FRINGE_VERT_HEAD}`)
      .replace('#include <beginnormal_vertex>', '')
      .replace('#include <begin_vertex>', FRINGE_BEGIN)
      .replace('#include <defaultnormal_vertex>', '')
      .replace('#include <normal_vertex>', '')
      .replace('#include <project_vertex>', `
vec3 transformedNormal = normalMatrix * objectNormal;
#ifndef FLAT_SHADED
vNormal = normalize(transformedNormal);
#endif
#include <project_vertex>
`);
  };
  m.onBeforeCompile = (sh) => {
    vtx(sh);
    sh.vertexShader = sh.vertexShader.replace('#include <beginnormal_vertex>', '');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vFt;\nvarying float vFr;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= (0.78 + 0.3 * vFr) * mix(0.72, 1.0, smoothstep(0.0, 0.25, vFt)) * mix(1.0, 0.86, smoothstep(0.7, 1.0, vFt));');
  };
  m.customProgramCacheKey = () => 'rug-fringe';
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depth.onBeforeCompile = (sh) => {
    for (const k in uniforms) sh.uniforms[k] = uniforms[k];
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\n${FRINGE_VERT_HEAD}`)
      .replace('#include <begin_vertex>', FRINGE_BEGIN);
  };
  depth.customProgramCacheKey = () => 'rug-fringe-depth';
  return { material: m, depth };
}
