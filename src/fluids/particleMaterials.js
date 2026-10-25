// Rug Rush fluids: instanced particle materials (droplets, jets, foam blobs, powder grains, mist and dust sprites).
import * as THREE from 'three';

function premultiplied(m) {
  m.transparent = true;
  m.depthWrite = false;
  m.blending = THREE.CustomBlending;
  m.blendEquation = THREE.AddEquation;
  m.blendSrc = THREE.OneFactor;
  m.blendDst = THREE.OneMinusSrcAlphaFactor;
  return m;
}

const DROP_VERT_PARS = `
attribute vec4 iA;
attribute vec4 iB;
attribute vec3 iC;
uniform float uBlur;
varying float vAlpha;
varying vec3 vTint;
`;

const DROP_NORMAL = `
vec3 dv = iB.xyz;
float dsp = length(dv);
vec3 dw = dsp > 1e-4 ? dv / dsp : vec3(0.0, 1.0, 0.0);
vec3 du = normalize(abs(dw.y) < 0.95 ? cross(dw, vec3(0.0, 1.0, 0.0)) : cross(dw, vec3(1.0, 0.0, 0.0)));
vec3 dt2 = cross(dw, du);
float dst = 1.0 + dsp * uBlur / max(iA.w, 1e-4);
vec3 objectNormal = normalize(du * normal.x + dt2 * normal.y + dw * normal.z / dst);
`;

const DROP_BEGIN = `
vec3 transformed = iA.xyz + (du * position.x + dt2 * position.y) * iA.w + dw * position.z * iA.w * dst;
vAlpha = iB.w;
vTint = iC;
`;

const DROP_FRAG_PARS = `
uniform float uBody;
uniform vec3 uTint;
uniform float uInstanced;
varying float vAlpha;
varying vec3 vTint;
`;

const DROP_OUT = `
float NoVd = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
float fres = pow(1.0 - NoVd, 2.2);
float va = uInstanced > 0.5 ? vAlpha : 1.0;
float a = clamp(mix(mix(0.24, 0.78, fres), 0.9, uBody) * va, 0.0, 1.0);
vec3 body = totalDiffuse * mix(0.45, 1.0, uBody) * vec3(0.82, 0.9, 0.97);
gl_FragColor = vec4(body * a + totalSpecular * va * mix(1.6, 0.8, uBody), a);
`;

export function dropMaterial({ body = 0, instanced = true, tint = 0xdfeef6, blur = 0.0045 } = {}) {
  const m = premultiplied(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.03, metalness: 0, envMapIntensity: 1.3 }));
  const u = { uBlur: { value: blur }, uBody: { value: body }, uTint: { value: new THREE.Color(tint) }, uInstanced: { value: instanced ? 1 : 0 } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    if (instanced) {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\n' + DROP_VERT_PARS)
        .replace('#include <beginnormal_vertex>', DROP_NORMAL)
        .replace('#include <begin_vertex>', DROP_BEGIN);
    } else {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vAlpha;\nvarying vec3 vTint;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAlpha = 1.0;\nvTint = vec3(1.0);');
    }
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + DROP_FRAG_PARS)
      .replace('#include <color_fragment>', 'diffuseColor.rgb = uInstanced > 0.5 ? vTint : uTint;')
      .replace('#include <opaque_fragment>', DROP_OUT);
  };
  m.customProgramCacheKey = () => `rr-drop-${instanced ? 1 : 0}`;
  m.userData.u = u;
  return m;
}

export function foamMaterial(bubbleTex) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0 });
  const u = { tBubble: { value: bubbleTex } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec4 iA;
attribute vec4 iB;
attribute vec3 iC;
varying vec3 vOP;
varying vec3 vTint;
varying float vSeed;`)
      .replace('#include <beginnormal_vertex>', `
float fs = iB.z * 6.2831;
vec3 lp = normal;
vec3 d1 = normalize(vec3(sin(fs * 1.3), cos(fs * 2.1), sin(fs * 3.7 + 1.0)));
vec3 d2 = normalize(vec3(cos(fs * 2.9 + 2.0), sin(fs * 1.7 + 0.5), cos(fs * 1.1)));
vec3 d3 = normalize(vec3(sin(fs * 4.1 + 3.0), -0.4, cos(fs * 3.3 + 1.5)));
float lump = 0.82 + 0.38 * pow(max(dot(lp, d1), 0.0), 3.0) + 0.3 * pow(max(dot(lp, d2), 0.0), 4.0) + 0.24 * pow(max(dot(lp, d3), 0.0), 3.0);
lump += 0.05 * sin(lp.x * 13.0 + fs) * sin(lp.y * 11.0 - fs) * sin(lp.z * 12.0 + fs * 2.0);
vec3 sc = vec3(iB.x, iB.y, iB.x);
vec3 objectNormal = normalize(normal / sc);`)
      .replace('#include <begin_vertex>', `
vec3 transformed = iA.xyz + position * lump * iA.w * sc;
vOP = position * lump + vec3(iB.z * 3.7, iB.z * 1.3, iB.z * 5.1);
vTint = iC;
vSeed = iB.z;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D tBubble;
varying vec3 vOP;
varying vec3 vTint;
varying float vSeed;
float fEdge;
vec2 fGrad;`)
      .replace('#include <color_fragment>', `
vec3 an = abs(normalize(vOP));
vec4 bA = texture2D(tBubble, vOP.yz * 1.6);
vec4 bB = texture2D(tBubble, vOP.xz * 1.6 + 0.3);
vec4 bC = texture2D(tBubble, vOP.xy * 1.6 + 0.6);
vec3 wgt = an / (an.x + an.y + an.z);
vec4 bb = bA * wgt.x + bB * wgt.y + bC * wgt.z;
fEdge = smoothstep(0.2, 0.0, bb.b);
fGrad = (bb.rg * 2.0 - 1.0);
diffuseColor.rgb = vTint * (0.97 - fEdge * 0.2);`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix(0.14, 0.5, fEdge);')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
normal = normalize(normal + vec3(fGrad.x, fGrad.y, 0.0) * 0.55);`);
  };
  m.customProgramCacheKey = () => 'rr-foam-blob';
  return m;
}

export function grainMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec4 iA;
attribute vec4 iB;
attribute vec3 iC;
varying vec3 vTint;
varying float vSpark;
mat3 grainRot(float s) {
  float a = s * 6.2831, b = fract(s * 13.7) * 6.2831;
  float ca = cos(a), sa = sin(a), cb = cos(b), sb = sin(b);
  return mat3(ca, 0.0, -sa, 0.0, 1.0, 0.0, sa, 0.0, ca) * mat3(1.0, 0.0, 0.0, 0.0, cb, sb, 0.0, -sb, cb);
}`)
      .replace('#include <beginnormal_vertex>', `
mat3 gR = grainRot(iB.x);
vec3 objectNormal = gR * normal;`)
      .replace('#include <begin_vertex>', `
vec3 transformed = iA.xyz + gR * (position * vec3(1.0, 0.7 + fract(iB.x * 7.1) * 0.5, 1.0)) * iA.w;
vTint = iC;
vSpark = iB.y;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTint;\nvarying float vSpark;')
      .replace('#include <color_fragment>', 'diffuseColor.rgb = vTint;')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix(0.62, 0.1, vSpark);');
  };
  m.customProgramCacheKey = () => 'rr-grain';
  return m;
}

export function spriteMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uLight: { value: 1.0 } },
    vertexShader: `
attribute vec4 iA;
attribute vec4 iB;
varying vec2 vQ;
varying vec4 vCol;
void main() {
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 wp = iA.xyz + (right * position.x + up * position.y) * iA.w;
  vQ = position.xy;
  vCol = iB;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`,
    fragmentShader: `
uniform float uLight;
varying vec2 vQ;
varying vec4 vCol;
void main() {
  float r2 = dot(vQ, vQ);
  if (r2 > 1.0) discard;
  float a = 1.0 - r2;
  a *= a;
  gl_FragColor = vec4(vCol.rgb * uLight, a * vCol.a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,
    transparent: true,
    depthWrite: false,
  });
}

export function gelTubeMaterial() {
  const m = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.05, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03, transparent: true, opacity: 0.86 });
  m.depthWrite = true;
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
float gNoV = clamp(dot(normalize(vNormal), normalize(vViewPosition)), 0.0, 1.0);
totalEmissiveRadiance += vColor.rgb * (0.12 + 0.28 * gNoV);`);
  };
  m.customProgramCacheKey = () => 'rr-gel-tube';
  return m;
}

export function hoseMaterial() {
  return new THREE.MeshStandardMaterial({ color: 0x17191c, roughness: 0.42, metalness: 0.05 });
}
