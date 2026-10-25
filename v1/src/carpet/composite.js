// Rug Rush surface compositor: bakes pattern plus every CarpetSurface channel into albedo, surface and deposit textures on change.
import * as THREE from 'three';
import { GLSL_COMMON } from './glsl.js';

const VERT = `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const HEADER = `
varying vec2 vUv;
uniform sampler2D tPattern;
uniform sampler2D tDirt0;
uniform sampler2D tDirt1;
uniform sampler2D tDirt2;
uniform sampler2D tLayer;
uniform sampler2D tTintGel;
uniform sampler2D tTintPowder;
uniform sampler2D tDamage;
uniform vec3 uPaint;
uniform vec2 uDims;
uniform vec2 uCells;
uniform vec2 uSeed;
${GLSL_COMMON}
`;

const ALBEDO_FRAG = `${HEADER}
void main() {
  vec2 uv = vUv;
  vec2 pm = uv * uDims;
  vec4 pat = texture2D(tPattern, uv);
  vec3 c = rr_toLin(pat.rgb);
  vec4 d0 = texture2D(tDirt0, uv);
  vec4 d1 = texture2D(tDirt1, uv);
  vec4 d2 = texture2D(tDirt2, uv);
  vec4 ly = texture2D(tLayer, uv);
  vec4 tg = texture2D(tTintGel, uv);
  vec4 tp = texture2D(tTintPowder, uv);
  vec4 dm = texture2D(tDamage, uv);
  float n1 = rr_vnoise(pm * 60.0 + uSeed);
  float n2 = rr_fbm3(pm * 14.0 + uSeed.yx);
  if (dm.r > 0.004) {
    vec2 flow = vec2((rr_vnoise(pm * 3.0 + uSeed) - 0.5) * 0.03, -0.035) / uDims;
    vec3 b = rr_toLin(textureLod(tPattern, uv + flow, 4.5).rgb) * 0.5 + rr_toLin(textureLod(tPattern, uv + flow * 2.0, 5.0).rgb) * 0.3 + rr_toLin(textureLod(tPattern, uv, 3.5).rgb) * 0.2;
    vec3 run = rr_sat(rr_hue(b, -0.08), 1.25) * vec3(1.0, 0.8, 0.86);
    float k = smoothstep(0.0, 1.0, dm.r) * (0.75 + 0.25 * n2);
    c = mix(c, run, k * 0.85);
  }
  float dust = d0.r;
  if (dust > 0.003) {
    float g = rr_h21(floor(pm * 1400.0) + uSeed);
    vec3 dc = vec3(0.28, 0.25, 0.205) * (0.75 + 0.5 * g);
    c = mix(rr_sat(c, 1.0 - dust * 0.45) * (1.0 - dust * 0.12), dc, dust * (0.22 + 0.18 * n2) * (0.6 + 0.8 * g));
  }
  float mud = d0.b;
  if (mud > 0.003) c = mix(c, vec3(0.1, 0.066, 0.04) * (0.8 + 0.4 * n2), smoothstep(0.02, 0.45, mud) * 0.85);
  float sticky = d0.a;
  if (sticky > 0.003) c *= mix(vec3(1.0), vec3(0.62, 0.42, 0.19), smoothstep(0.0, 0.6, sticky) * 0.8);
  float wine = d1.r;
  if (wine > 0.003) {
    float wb = textureLod(tDirt1, uv, 2.0).r;
    float rim = smoothstep(0.04, 0.25, wine - wb) * smoothstep(0.05, 0.3, wine);
    c *= mix(vec3(1.0), vec3(0.34, 0.035, 0.11) * (0.85 + 0.3 * n2), smoothstep(0.0, 0.7, wine) * 0.92);
    c *= 1.0 - rim * 0.45;
  }
  float cof = d1.g;
  if (cof > 0.003) {
    float cb = textureLod(tDirt1, uv, 2.0).g;
    float rim = smoothstep(0.03, 0.2, cof - cb) * smoothstep(0.05, 0.3, cof);
    c *= mix(vec3(1.0), vec3(0.5, 0.29, 0.12) * (0.9 + 0.2 * n2), smoothstep(0.0, 0.7, cof) * 0.88);
    c *= mix(vec3(1.0), vec3(0.42, 0.25, 0.12), rim * 0.8);
  }
  float grease = d1.b;
  if (grease > 0.003) c *= mix(vec3(1.0), vec3(0.36, 0.32, 0.24), smoothstep(0.0, 0.7, grease) * 0.88);
  float urine = d1.a;
  if (urine > 0.7) c *= mix(vec3(1.0), vec3(1.0, 0.92, 0.66), smoothstep(0.75, 1.0, urine) * 0.35);
  float paint = d2.b;
  if (paint > 0.003) {
    float sp = rr_fbm3(pm * 30.0 + uSeed);
    float drops = step(0.82, rr_vnoise(pm * 180.0 + uSeed)) * smoothstep(0.02, 0.3, paint);
    float m = max(smoothstep(0.42, 0.52, paint + (sp - 0.5) * 0.55 * (1.0 - paint)), drops);
    c = mix(c, uPaint * (0.92 + 0.12 * n1), m);
  }
  float mold = d2.a;
  if (mold > 0.003) {
    vec3 vo = rr_voronoi(pm * 90.0 + uSeed);
    float col = smoothstep(0.55, 0.15, vo.x) * step(1.0 - mold * 1.15, vo.z);
    float halo = smoothstep(0.9, 0.3, vo.x) * step(1.0 - mold * 1.3, vo.z);
    c = mix(c, vec3(0.12, 0.17, 0.07), halo * 0.55);
    c = mix(c, vec3(0.025, 0.035, 0.02), col);
    float fuzz = step(0.93, rr_h21(floor(pm * 600.0))) * col;
    c = mix(c, vec3(0.55, 0.58, 0.5), fuzz * 0.7);
  }
  float bleach = dm.g;
  if (bleach > 0.003) {
    float l = rr_luma(c);
    vec3 pale = mix(vec3(l), c, 0.28) * 1.55 + 0.1;
    float edge = bleach * (1.0 - bleach) * 4.0;
    pale *= mix(vec3(1.0), vec3(1.0, 0.95, 0.78), edge * 0.6);
    c = mix(c, min(pale, vec3(0.92)), smoothstep(0.0, 0.8, bleach) * (0.85 + 0.15 * n2));
  }
  float burn = dm.a;
  if (burn > 0.003) {
    c = mix(c, vec3(0.2, 0.09, 0.035) * (0.8 + 0.4 * n2), smoothstep(0.0, 0.45, burn));
    c = mix(c, vec3(0.03, 0.02, 0.012), smoothstep(0.4, 0.85, burn + (n1 - 0.5) * 0.2));
  }
  float water = ly.r;
  if (water > 0.003) {
    c = pow(max(c, 0.0), vec3(1.0 + 0.55 * water)) * (1.0 - 0.26 * water);
    float wd = tp.a * smoothstep(0.03, 0.4, water);
    c = mix(c, c * vec3(0.62, 0.5, 0.36) + vec3(0.03, 0.022, 0.012), wd * 0.85);
  }
  float powder = ly.g;
  if (powder > 0.003) c = mix(c, rr_toLin(tp.rgb) * (1.0 - 0.3 * smoothstep(0.2, 0.7, water)), smoothstep(0.0, 0.5, powder) * 0.4);
  float foam = ly.a;
  if (foam > 0.003) c = mix(c, vec3(0.8, 0.8, 0.78), foam * 0.25);
  gl_FragColor = vec4(rr_toSrgb(c), d0.g);
}
`;

const PARAM_FRAG = `${HEADER}
layout(location = 1) out vec4 outDep;
float solidH(vec2 uv, vec4 d0, vec4 d2, vec4 ly) {
  float mud = smoothstep(0.08, 0.6, d0.b) * 0.010;
  float gum = smoothstep(0.15, 0.5, d2.r) * 0.0032;
  float wax = smoothstep(0.12, 0.5, d2.g) * 0.0042;
  float paint = smoothstep(0.3, 0.6, d2.b) * 0.0006;
  float pw = ly.g * 0.0065 * (1.0 - 0.3 * smoothstep(0.3, 0.8, ly.r));
  return mud + max(gum, wax) + paint + pw;
}
float totalH(vec2 uv) {
  vec4 d0 = texture2D(tDirt0, uv);
  vec4 d2 = texture2D(tDirt2, uv);
  vec4 ly = texture2D(tLayer, uv);
  return max(solidH(uv, d0, d2, ly), ly.a * 0.04);
}
void main() {
  vec2 uv = vUv;
  vec4 d0 = texture2D(tDirt0, uv);
  vec4 d1 = texture2D(tDirt1, uv);
  vec4 d2 = texture2D(tDirt2, uv);
  vec4 ly = texture2D(tLayer, uv);
  vec4 dm = texture2D(tDamage, uv);
  float gloss = max(max(d1.b * 0.65, d0.a * 0.9), max(smoothstep(0.3, 0.8, dm.a) * 0.75, ly.b * 0.5));
  gl_FragColor = vec4(ly.r, gloss, d0.r, d1.a);
  float s = solidH(uv, d0, d2, ly);
  vec2 e = 1.0 / uCells;
  float hx = totalH(uv + vec2(e.x, 0.0)) - totalH(uv - vec2(e.x, 0.0));
  float hy = totalH(uv + vec2(0.0, e.y)) - totalH(uv - vec2(0.0, e.y));
  vec2 slope = vec2(hx / (2.0 * e.x * uDims.x), hy / (2.0 * e.y * uDims.y));
  outDep = vec4(clamp(s / 0.016, 0.0, 1.0), ly.a, clamp(slope * 0.25 + 0.5, 0.0, 1.0));
}
`;

export class SurfaceCompositor {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
    const uniforms = () => ({
      tPattern: { value: null }, tDirt0: { value: null }, tDirt1: { value: null }, tDirt2: { value: null }, tLayer: { value: null },
      tTintGel: { value: null }, tTintPowder: { value: null }, tDamage: { value: null },
      uPaint: { value: new THREE.Color() }, uDims: { value: new THREE.Vector2() }, uCells: { value: new THREE.Vector2() }, uSeed: { value: new THREE.Vector2() },
    });
    this.albedoMat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: ALBEDO_FRAG, uniforms: uniforms(), depthTest: false, depthWrite: false });
    this.paramMat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: PARAM_FRAG, uniforms: uniforms(), depthTest: false, depthWrite: false, glslVersion: THREE.GLSL3 });
    this.paramMat.fragmentShader = this.paramMat.fragmentShader.replace(/gl_FragColor/g, 'outSurf').replace('layout(location = 1) out vec4 outDep;', 'layout(location = 0) out vec4 outSurf;\nlayout(location = 1) out vec4 outDep;').replace(/texture2D\(/g, 'texture(');
  }

  createTargets(pattern, surface) {
    const pw = pattern.texture.image.width, ph = pattern.texture.image.height;
    const albedo = new THREE.WebGLRenderTarget(pw, ph, {
      minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: true, depthBuffer: false, anisotropy: 8,
    });
    const k = Math.min(4, Math.max(1, Math.floor(1024 / Math.max(surface.W, surface.H))));
    const params = new THREE.WebGLRenderTarget(surface.W * k, surface.H * k, {
      count: 2, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: true, depthBuffer: false,
    });
    return { albedo, params };
  }

  setUniforms(mat, rug) {
    const u = mat.uniforms;
    const t = rug.surface.textures;
    u.tPattern.value = rug.patternRT.texture;
    u.tDirt0.value = t.dirt0; u.tDirt1.value = t.dirt1; u.tDirt2.value = t.dirt2; u.tLayer.value = t.layer;
    u.tTintGel.value = t.tintGel; u.tTintPowder.value = t.tintPowder; u.tDamage.value = t.damage;
    u.uPaint.value.copy(rug.paintLinear);
    u.uDims.value.set(rug.width, rug.length);
    u.uCells.value.set(rug.surface.W, rug.surface.H);
    u.uSeed.value.copy(rug.seedOff);
  }

  run(rug) {
    const r = this.renderer;
    const prev = r.getRenderTarget();
    const prevAuto = r.autoClear;
    r.autoClear = false;
    this.setUniforms(this.albedoMat, rug);
    this.quad.material = this.albedoMat;
    r.setRenderTarget(rug.targets.albedo);
    r.render(this.scene, this.camera);
    this.setUniforms(this.paramMat, rug);
    this.quad.material = this.paramMat;
    r.setRenderTarget(rug.targets.params);
    r.render(this.scene, this.camera);
    r.setRenderTarget(prev);
    r.autoClear = prevAuto;
  }

  dispose() {
    this.albedoMat.dispose();
    this.paramMat.dispose();
    this.quad.geometry.dispose();
  }
}
