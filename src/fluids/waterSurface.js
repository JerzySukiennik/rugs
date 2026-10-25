// Rug Rush fluids: floor-water surface material (physical lighting, screen refraction, grout film, foam, flecks, wet tiles).
import * as THREE from 'three';
import { BAY, TILE, GROUT_W, floorBaseHeightAt } from '../world/layout.js';

const VERT_PARS = `
uniform sampler2D tA;
uniform vec2 uBayMin;
uniform float uBaySize;
uniform vec4 uTrench;
uniform mat4 uReflMatrix;
varying vec2 vWPos;
varying vec2 vWUv;
varying vec4 vReflCoord;
`;

const VERT_BEGIN = `
vec3 transformed = vec3(position);
vWPos = position.xz;
vWUv = (position.xz - uBayMin) / uBaySize;
float trV = step(abs(position.z - uTrench.y), uTrench.w + 0.01) * step(abs(position.x - uTrench.x), uTrench.z + 0.01);
transformed.y += max(texture2D(tA, vWUv).r, 0.0) * 0.001 * (1.0 - trV);
vReflCoord = uReflMatrix * vec4(transformed, 1.0);
`;

const FRAG_PARS = `
uniform sampler2D tA;
uniform sampler2D tW;
uniform sampler2D tP;
uniform sampler2D tRip;
uniform sampler2D tScreen;
uniform sampler2D tNoise;
uniform sampler2D tBubble;
uniform sampler2D tGrain;
uniform sampler2D tMask;
uniform vec2 uBayMin;
uniform float uBaySize;
uniform float uTexel;
uniform float uRipTexel;
uniform float uCell;
uniform float uTime;
uniform float uRefr;
uniform vec2 uScreenSize;
uniform vec4 uTrench;
uniform float uTile;
uniform float uGroutHalf;
uniform float uDebug;
uniform sampler2D tRefl;
uniform float uReflOn;
uniform float uReflDistort;
varying vec2 vWPos;
varying vec2 vWUv;
varying vec4 vReflCoord;
vec3 wN;
float wRough;
float wSpec;
vec3 wTrans;
float wCov;
float wDepth;
float bubbleLayer(vec4 b, float dens, out vec2 grad, out float edge) {
  vec2 v = b.rg * 2.0 - 1.0;
  float d = length(v);
  float id = b.a;
  float pres = smoothstep(id - 0.1, id + 0.1, dens);
  float rad = mix(0.38, 0.6, fract(id * 7.31));
  float m = smoothstep(rad + 0.07, rad - 0.05, d) * pres;
  grad = v / rad * m * 0.9;
  edge = smoothstep(0.18, 0.0, b.b) * pres;
  return m;
}
vec4 bicubic(sampler2D t, vec2 uv, float res) {
  vec2 st = uv * res - 0.5;
  vec2 i = floor(st);
  vec2 f = st - i;
  vec2 f2 = f * f;
  vec2 f3 = f2 * f;
  vec2 w0 = (-f3 + 3.0 * f2 - 3.0 * f + 1.0) / 6.0;
  vec2 w1 = (3.0 * f3 - 6.0 * f2 + 4.0) / 6.0;
  vec2 w2 = (-3.0 * f3 + 3.0 * f2 + 3.0 * f + 1.0) / 6.0;
  vec2 w3 = f3 / 6.0;
  vec2 g0 = w0 + w1;
  vec2 g1 = w2 + w3;
  vec2 h0 = (i - 1.0 + w1 / g0 + 0.5) / res;
  vec2 h1 = (i + 1.0 + w3 / g1 + 0.5) / res;
  return g0.y * (g0.x * texture2D(t, h0) + g1.x * texture2D(t, vec2(h1.x, h0.y))) + g1.y * (g0.x * texture2D(t, vec2(h0.x, h1.y)) + g1.x * texture2D(t, h1));
}
`;

const FRAG_MAIN = `
float texRes = 1.0 / uTexel;
float maskv = texture2D(tMask, vWUv).r;
vec4 A = bicubic(tA, vWUv, texRes);
float hmm = max(A.r, 0.0);
vec2 dpx = dFdx(vWPos);
vec2 dpy = dFdy(vWPos);
float det = dpx.x * dpy.y - dpx.y * dpy.x;
det = sign(det) * max(abs(det), 1e-12);
float dhx = dFdx(hmm), dhy = dFdy(hmm);
vec2 gh = vec2(dpy.y * dhx - dpx.y * dhy, -dpy.x * dhx + dpx.x * dhy) / det * 0.001;
float eh = max((abs(dhx) + abs(dhy)) * 1.2, 0.025);
float px = max(length(abs(dpx) + abs(dpy)), 1e-5);
vec4 dts = texture2D(tGrain, vWPos * 1.25 + 0.37);
float ddx = dFdx(dts.r), ddy = dFdy(dts.r);
vec2 dotGrad = vec2(dpy.y * ddx - dpx.y * ddy, -dpy.x * ddx + dpx.x * ddy) / det;
float dotAA = max(abs(ddx) + abs(ddy), 0.02);
if (maskv < 0.5) discard;
vec4 W = bicubic(tW, vWUv, texRes);
float dirtC = clamp(A.g, 0.0, 1.0);
float foam = max(A.b, 0.0);
vec2 vel = texture2D(tW, vWUv).gb;
float spd = length(vel);
float trench = step(abs(vWPos.y - uTrench.y), uTrench.w) * step(abs(vWPos.x - uTrench.x), uTrench.z);
vec2 gq = (0.5 - abs(fract(vWPos / uTile) - 0.5)) * uTile;
float gd = min(gq.x, gq.y);
float gaa = px * 0.6;
float grout = (1.0 - smoothstep(uGroutHalf - gaa, uGroutHalf + gaa, gd)) * (1.0 - trench);
float nz = texture2D(tNoise, vWPos * 0.55).a;
float thr = mix(0.25, 1.25, nz) - 0.22 * exp(-gd * 110.0);
float covT = smoothstep(thr - eh, thr + eh, hmm) * (1.0 - trench);
float gFill = smoothstep(0.01, 0.1, hmm);
float gW = uGroutHalf + min(hmm, 1.2) * 0.0016;
float grW = (1.0 - smoothstep(gW - gaa, gW + gaa, gd)) * (1.0 - trench);
float drainI = clamp(W.a, 0.0, 6.0);
float trCov = trench * smoothstep(0.02, 0.35, drainI);
float wet = W.r;
float film = clamp(hmm / 0.5, 0.0, 1.0) * (1.0 - trench) * (1.0 - smoothstep(0.4, 1.0, covT));
float dsel = smoothstep(dts.g - 0.06, dts.g + 0.06, film * 0.7 + 0.02) * step(0.02, film);
float dfar = clamp(px * 300.0 - 1.0, 0.0, 1.0);
float dots = smoothstep(0.6 - dotAA, 0.6 + dotAA, dts.r) * dsel * (1.0 - dfar);
float cov = max(max(max(covT, grW * gFill), trCov), dots);
float wetT = smoothstep(0.45, 0.95, wet + (nz - 0.5) * 0.85);
float wetG = smoothstep(0.02, 0.3, wet);
float wetVis = max(wetT, grout * wetG) * (1.0 - trench);
float period = 2.6;
float ph = fract(uTime / period);
float ph2 = fract(uTime / period + 0.5);
float fw = abs(ph * 2.0 - 1.0);
vec2 avel = spd > 0.07 ? vel * (0.07 / spd) : vel;
vec2 fp1 = vWPos - avel * ph * period;
vec2 fp2 = vWPos - avel * ph2 * period;
float far = clamp(px * 260.0 - 0.3, 0.0, 1.0);
float fc = 1.0 - exp(-foam * 2.2);
float Df = 0.0;
float fm = 0.0;
vec2 fg = vec2(0.0);
vec3 fAlb = vec3(0.94);
if (fc > 0.003) {
  float pn = mix(texture2D(tNoise, fp1 * 2.6).b, texture2D(tNoise, fp2 * 2.6 + 0.37).b, fw);
  float pn2 = mix(texture2D(tNoise, fp1 * 7.5 + 0.11).b, texture2D(tNoise, fp2 * 7.5 + 0.61).b, fw);
  float patchv = fc * 1.2 + (pn - 0.5) * 0.9 + (pn2 - 0.5) * 0.42 - 0.1;
  float body = smoothstep(0.44, 0.6, patchv);
  float dens = clamp((patchv - 0.2) * 2.4, 0.0, 1.0);
  vec2 bg1; vec2 bg2; vec2 bg3; float be1; float be2; float be3;
  float m1 = bubbleLayer(texture2D(tBubble, fp1 * 15.0), dens, bg1, be1);
  float m2 = bubbleLayer(texture2D(tBubble, fp2 * 15.0 + 0.5), dens, bg2, be2);
  float m3 = bubbleLayer(texture2D(tBubble, fp1 * 5.0 + 0.21), dens * 0.8, bg3, be3);
  fm = mix(m1, m2, fw);
  fg = mix(bg1, bg2, fw) + bg3 * 0.6;
  float fe = mix(be1, be2, fw);
  Df = mix(max(body, max(fm, m3 * 0.95)), max(body, smoothstep(0.3, 0.6, patchv) * 0.6), far);
  float rimAO = smoothstep(0.42, 0.8, patchv);
  fAlb = mix(vec3(0.94, 0.95, 0.96), vec3(0.66, 0.68, 0.7), fe * 0.5 * (1.0 - far)) * mix(0.8, 1.0, rimAO);
  fAlb = mix(fAlb, vec3(0.52, 0.46, 0.38), dirtC * 0.6);
}
float pa = max(texture2D(tP, vWUv).a, 0.0);
float Dp = 0.0;
vec3 pcol = vec3(1.0);
float grSpark = 0.0;
if (pa > 0.0005) {
  vec4 PW = texture2D(tP, vWUv);
  pcol = PW.rgb / max(PW.a, 1e-5);
  vec4 gr = texture2D(tGrain, vWPos * 1.9);
  float pcov = 1.0 - exp(-pa * 1.4);
  float gsel = smoothstep(gr.g - 0.03, gr.g + 0.03, pcov * 1.05);
  float pfar = clamp(px * 240.0 - 0.9, 0.0, 1.0);
  Dp = mix(gr.r * gsel + smoothstep(0.65, 1.0, pcov) * 0.8 * (1.0 - gr.r), pcov * 0.7, pfar);
  pcol *= mix(gr.a, 1.0, pfar);
  grSpark = gr.b;
}
float Dw = 0.0;
vec2 tsn = vec2(0.0);
if (trCov > 0.0) {
  float tz = abs(vWPos.y - uTrench.y) / uTrench.w;
  vec2 su = vec2(vWPos.x * 7.0, tz * 1.2 - uTime * 1.6);
  tsn = texture2D(tNoise, su).rg * 2.0 - 1.0;
  float wn = texture2D(tNoise, vec2(vWPos.x * 13.0 + 0.3, tz * 2.5 - uTime * 2.2)).b;
  Dw = smoothstep(0.55, 0.85, wn + clamp(drainI * 0.06, 0.0, 0.25)) * smoothstep(0.1, 1.2, drainI) * trCov * 0.85;
}
float Dm = (1.0 - exp(-dirtC * hmm * 0.3)) * cov;
vec3 murk = vec3(0.3, 0.25, 0.18);
float Dp2 = Dp * (1.0 - Df);
float Dm2 = Dm * (1.0 - Df) * (1.0 - Dp2);
float Dw2 = Dw * (1.0 - Df);
float D = clamp(Df + Dp2 + Dm2 + Dw2, 0.0, 1.0);
if (cov < 0.002 && wetVis < 0.002 && D < 0.002) discard;
vec3 alb = (fAlb * Df + pcol * Dp2 + murk * Dm2 + mix(vec3(0.85, 0.87, 0.88), murk * 1.6, dirtC * 0.5) * Dw2) / max(D, 1e-4);
diffuseColor = vec4(alb * D, 1.0);
vec2 g = gh * cov;
float edgeM = max(covT * (1.0 - covT) * 4.0, dots * (1.0 - dots) * 4.0);
float ghl = length(gh);
g += (ghl > 1e-7 ? gh / ghl : vec2(0.0)) * covT * (1.0 - covT) * 0.8;
g -= dotGrad * dsel * (1.0 - dfar) * 0.004 * smoothstep(0.1, 0.9, dts.r);
if (cov > 0.005) {
  vec4 rp = texture2D(tRip, vWUv);
  g += rp.ba / (uBaySize * uRipTexel) * cov;
  vec2 n1 = texture2D(tNoise, fp1 * 2.9).rg * 2.0 - 1.0;
  vec2 n2 = texture2D(tNoise, fp2 * 2.9 + 0.5).rg * 2.0 - 1.0;
  vec2 n3 = texture2D(tNoise, vWPos * 1.3 + vec2(uTime * 0.011, -uTime * 0.009)).rg * 2.0 - 1.0;
  float famp = clamp(spd * 0.8, 0.0, 0.14) * smoothstep(0.3, 2.5, hmm);
  g -= (mix(n1, n2, fw) * famp + n3 * 0.012) * cov;
}
if (trCov > 0.0) {
  float side = sign(vWPos.y - uTrench.y);
  g -= vec2(tsn.x * 0.18, tsn.y * 0.45 - side * 0.35) * trCov;
}
g += fg * Df * (1.0 - far) * 0.8;
wN = normalize(vec3(-g.x, 1.0, -g.y));
wRough = mix(0.12, 0.02, cov);
wRough = mix(wRough, mix(0.32, 0.12, fm), Df);
wRough = mix(wRough, mix(0.62, 0.12, grSpark), Dp2 * (1.0 - cov));
wSpec = max(cov, wetVis * 0.4);
wSpec = max(wSpec, Df * 0.75);
wSpec = max(wSpec, Dp2 * mix(0.25, 1.0, grSpark));
float dkT = mix(1.0, 0.975, wetT);
float dkG = mix(1.0, 0.74, wetG);
float dk = mix(dkT, dkG, grout) * mix(1.0, 0.985, cov) * (1.0 - 0.2 * edgeM * (1.0 - trench));
dk = mix(dk, dk * 0.55, trCov);
vec3 absb = exp(-hmm * vec3(0.0011, 0.0004, 0.0003));
wTrans = dk * absb * (1.0 - D);
wCov = max(cov, wetVis * 0.6);
wDepth = hmm;
`;

const REFL_INJECT = `
#include <lights_fragment_maps>
if (uReflOn > 0.5) {
  vec2 ruv = vReflCoord.xy / vReflCoord.w + vec2(wN.x, wN.z) * uReflDistort;
  float lod = clamp(log2(1.0 + max(wRough - 0.03, 0.0) * 90.0), 0.0, 6.0);
  vec3 rc = textureLod(tRefl, ruv, lod).rgb;
  vec2 ed = min(ruv, 1.0 - ruv);
  float inside = smoothstep(0.0, 0.03, min(ed.x, ed.y));
  radiance = mix(radiance, rc, inside);
}
`;

const FRAG_COMPOSITE = `
#include <colorspace_fragment>
{
  vec2 suv = gl_FragCoord.xy / uScreenSize;
  vec2 off = clamp(normal.xy * uRefr * (0.25 + min(wDepth, 10.0) * 0.4) * wCov, vec2(-0.012), vec2(0.012));
  vec3 scr = texture2D(tScreen, clamp(suv + off, vec2(0.001), vec2(0.999))).rgb;
  float NoV = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
  float Fr = 0.02 + 0.98 * pow(1.0 - NoV, 5.0);
  vec3 tr = scr * wTrans * (1.0 - Fr * wCov);
  if (uDebug > 0.5 && uDebug < 1.5) gl_FragColor.rgb = tr;
  else if (uDebug > 1.5 && uDebug < 2.5) gl_FragColor.rgb = gl_FragColor.rgb;
  else if (uDebug > 2.5) gl_FragColor.rgb = vec3(wTrans.x, wCov, wSpec);
  else gl_FragColor.rgb = gl_FragColor.rgb + tr * (1.0 - clamp(gl_FragColor.rgb, 0.0, 1.0));
  gl_FragColor.a = 1.0;
}
`;

export function createWaterSurface(floor, tex, segs = 192, reflection = null) {
  const size = floor.size;
  const geo = new THREE.PlaneGeometry(size, size, segs, segs);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + BAY.cx, z = pos.getZ(i) + BAY.cz;
    pos.setXYZ(i, x, floorBaseHeightAt(x, z) + 0.0006, z);
  }
  geo.computeBoundingBox();
  geo.boundingBox.max.y += 0.2;
  geo.computeBoundingSphere();
  let screen = new THREE.FramebufferTexture(4, 4);
  screen.minFilter = screen.magFilter = THREE.LinearFilter;
  const uniforms = {
    tA: { value: floor.renderA.texture },
    tW: { value: floor.wet[0].texture },
    tP: { value: floor.powder[0].texture },
    tRip: { value: floor.rip[0].texture },
    tScreen: { value: screen },
    tNoise: { value: tex.normal },
    tBubble: { value: tex.bubble },
    tGrain: { value: tex.grain },
    tMask: { value: floor.maskRT.texture },
    uBayMin: { value: new THREE.Vector2(floor.x0, floor.z0) },
    uBaySize: { value: size },
    uTexel: { value: 1 / floor.res },
    uRipTexel: { value: 1 / floor.rippleRes },
    uCell: { value: floor.cell },
    uTime: { value: 0 },
    uRefr: { value: 0.006 },
    uScreenSize: { value: new THREE.Vector2(1, 1) },
    uTrench: { value: new THREE.Vector4(BAY.cx, BAY.cz, BAY.trench.halfLen, BAY.trench.halfW) },
    uTile: { value: TILE },
    uGroutHalf: { value: GROUT_W / 2 },
    uDebug: { value: 0 },
    tRefl: { value: null },
    uReflOn: { value: 0 },
    uReflDistort: { value: 0.06 },
    uReflMatrix: { value: new THREE.Matrix4() },
  };
  const mat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, metalness: 0, ior: 1.333, specularIntensity: 1 });
  mat.transparent = true;
  mat.depthWrite = false;
  mat.blending = THREE.CustomBlending;
  mat.blendEquation = THREE.AddEquation;
  mat.blendSrc = THREE.OneFactor;
  mat.blendDst = THREE.OneMinusSrcAlphaFactor;
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = -1;
  mat.polygonOffsetUnits = -4;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_PARS)
      .replace('#include <begin_vertex>', VERT_BEGIN);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <clipping_planes_pars_fragment>', '#include <clipping_planes_pars_fragment>\n' + FRAG_PARS)
      .replace('#include <map_fragment>', FRAG_MAIN)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = wRough;')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize((viewMatrix * vec4(wN, 0.0)).xyz);')
      .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\nmaterial.specularColor *= wSpec;\nmaterial.specularF90 *= wSpec;')
      .replace('#include <lights_fragment_maps>', REFL_INJECT)
      .replace('#include <colorspace_fragment>', FRAG_COMPOSITE);
  };
  mat.customProgramCacheKey = () => 'rr-floor-water-5';
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'floorWater';
  mesh.renderOrder = -10;
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  const drawSize = new THREE.Vector2();
  let lastFrame = -1;
  mesh.onBeforeRender = (renderer, scene, camera) => {
    if (reflection && reflection.enabled && floor.anyWater() && renderer.getRenderTarget() === null) {
      const inf = renderer.info.render;
      const saved = [inf.calls, inf.triangles, inf.points, inf.lines];
      reflection.update(camera, [mesh, ...floor.reflectionHide]);
      inf.calls += saved[0]; inf.triangles += saved[1]; inf.points += saved[2]; inf.lines += saved[3];
      uniforms.tRefl.value = reflection.rt.texture;
      uniforms.uReflMatrix.value.copy(reflection.matrix);
      uniforms.uReflOn.value = reflection.valid ? 1 : 0;
    } else uniforms.uReflOn.value = 0;
    const tgt = renderer.getRenderTarget();
    if (tgt) drawSize.set(tgt.width, tgt.height);
    else renderer.getDrawingBufferSize(drawSize);
    const w = Math.max(1, Math.floor(drawSize.x)), h = Math.max(1, Math.floor(drawSize.y));
    if (screen.image.width !== w || screen.image.height !== h) {
      screen.dispose();
      screen = new THREE.FramebufferTexture(w, h);
      screen.minFilter = screen.magFilter = THREE.LinearFilter;
      uniforms.tScreen.value = screen;
    }
    const f = renderer.info.render.frame;
    if (f !== lastFrame) {
      renderer.copyFramebufferToTexture(screen);
      lastFrame = f;
    }
    uniforms.uScreenSize.value.set(w, h);
  };
  return {
    mesh,
    uniforms,
    update(dt) {
      uniforms.uTime.value += dt;
      uniforms.tW.value = floor.wet[0].texture;
      uniforms.tP.value = floor.powder[0].texture;
      uniforms.tRip.value = floor.rip[0].texture;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
      screen.dispose();
    },
  };
}
