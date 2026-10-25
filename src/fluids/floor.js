// Rug Rush fluids: GPU floor water over the wash bay (virtual pipes) with tracers, wetness, flecks, ripples, squeegee and readback.
import * as THREE from 'three';
import { BAY, floorHeightAt, inTrench } from '../world/layout.js';
import * as SH from './simShaders.js';
import { createWaterSurface } from './waterSurface.js';
import { PlanarReflection } from './reflection.js';

const MAX_SPLATS = 1024;
const MAX_REMOVES = 8;
const MAX_BLADES = 4;

function target(size, type, linear) {
  const f = linear ? THREE.LinearFilter : THREE.NearestFilter;
  return new THREE.WebGLRenderTarget(size, size, {
    type, format: THREE.RGBAFormat, minFilter: f, magFilter: f,
    depthBuffer: false, stencilBuffer: false, generateMipmaps: false,
  });
}

function pair(size, type, linear) {
  return [target(size, type, linear), target(size, type, linear)];
}

function hash2(x, z) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function valueNoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const fx = x - xi, fz = z - zi;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hash2(xi, zi), b = hash2(xi + 1, zi), c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

class SplatBatch {
  constructor(material, max = MAX_SPLATS) {
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    this.splat = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.value = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aSplat', this.splat);
    g.setAttribute('aValue', this.value);
    g.instanceCount = 0;
    this.geo = g;
    this.max = max;
    this.count = 0;
    this.mesh = new THREE.Mesh(g, material);
    this.mesh.frustumCulled = false;
  }

  push(u, v, ru, a, b, c, d) {
    if (this.count >= this.max) return false;
    const i = this.count++ * 4;
    const s = this.splat.array, w = this.value.array;
    s[i] = u; s[i + 1] = v; s[i + 2] = ru; s[i + 3] = ru;
    w[i] = a; w[i + 1] = b; w[i + 2] = c; w[i + 3] = d;
    return true;
  }

  commit() {
    const n = this.count;
    for (const at of [this.splat, this.value]) {
      at.clearUpdateRanges();
      at.addUpdateRange(0, n * 4);
      at.needsUpdate = true;
    }
    this.geo.instanceCount = n;
    this.count = 0;
    return n;
  }
}

export class FloorWater {
  constructor(fluids, { res = 256, rippleRes = 512, meshSegments = 192, reflections = true, reflectionScale = 0.5 } = {}) {
    this.fluids = fluids;
    this.renderer = fluids.renderer;
    this.res = res;
    this.rippleRes = rippleRes;
    this.size = BAY.half * 2;
    this.cell = this.size / res;
    this.x0 = BAY.cx - BAY.half;
    this.z0 = BAY.cz - BAY.half;
    this.params = {
      g: 9.81, film: 0.0007, bladeFilm: 0.00005, wetTh: 0.00006, pinDry: 0.0016, pinWet: 0.0004,
      fricBase: 0.35, fricVisc: 7.5e-5, drain: 7, evap: 3.5e-6, foamDecay: 1 / 55, foamDecayDry: 1 / 70,
      foamGen: 60, dissolve: 0.35, soapPerKg: fluids.units.powder.soapLitersPerKg, dryRate: 1 / 80, powderLife: 120,
      rippleC: 0.32, rippleDamp: 0.965,
    };
    this.passCount = 0;
    this.time = 0;
    this.cam = new THREE.Camera();
    const half = THREE.HalfFloatType, flt = THREE.FloatType;
    this.state = pair(res, flt, false);
    this.flux = pair(res, flt, false);
    this.wet = pair(res, half, true);
    this.powder = pair(res, half, true);
    this.rip = pair(rippleRes, half, true);
    this.src = target(res, half, false);
    this.psrc = target(res, half, false);
    this.ripSrc = target(rippleRes, half, true);
    this.renderA = target(res, half, true);
    this.maskBlock = 4;
    this.maskRT = new THREE.WebGLRenderTarget(res / this.maskBlock, res / this.maskBlock, {
      type: THREE.UnsignedByteType, format: THREE.RGBAFormat, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
      depthBuffer: false, stencilBuffer: false, generateMipmaps: false,
    });
    this.readRT = target(res, flt, false);
    this.zero = new THREE.DataTexture(new Float32Array(4), 1, 1, THREE.RGBAFormat, THREE.FloatType);
    this.zero.needsUpdate = true;
    this.terrain = this.buildTerrain();
    this.tri = new THREE.BufferGeometry();
    this.tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    const p = this.params;
    this.passes = {
      flux: this.pass(SH.FLUX_FRAG, {
        tState: null, tFlux: null, tTerrain: this.terrain, tWet: null, uCell: this.cell, uDt: 1 / 60, uG: p.g,
        uFilm: p.film, uBladeFilm: p.bladeFilm, uWetTh: p.wetTh, uPinDry: p.pinDry, uPinWet: p.pinWet,
        uFricBase: p.fricBase, uFricVisc: p.fricVisc, uBlades: 0,
        uBladeSeg: Array.from({ length: MAX_BLADES }, () => new THREE.Vector4()),
        uBladeVel: Array.from({ length: MAX_BLADES }, () => new THREE.Vector4()),
      }),
      depth: this.pass(SH.DEPTH_FRAG, {
        tState: null, tFlux: null, tTerrain: this.terrain, tSrc: null, tPowder: null, tRipSrc: null, uHasSrc: 0, uHasRip: 0, uCell: this.cell, uDt: 1 / 60,
        uDrain: p.drain, uEvap: p.evap, uFoamDecay: p.foamDecay, uFoamDecayDry: p.foamDecayDry, uFoamGen: p.foamGen,
        uDissolve: p.dissolve, uSoapPerKg: p.soapPerKg, uRemoves: 0,
        uRemove: Array.from({ length: MAX_REMOVES }, () => new THREE.Vector4()),
      }),
      wet: this.pass(SH.WET_FRAG, { tState: null, tFlux: null, tWet: null, tTerrain: this.terrain, uCell: this.cell, uDt: 1 / 60, uDryRate: p.dryRate, uWetTh: p.wetTh }),
      powder: this.pass(SH.POWDER_FRAG, { tPowder: null, tPsrc: null, tState: null, uHasSrc: 0, uDt: 1 / 60, uLife: p.powderLife, uDissolve: p.dissolve }),
      ripple: this.pass(SH.RIPPLE_FRAG, { tRip: null, tRipSrc: null, tA: this.renderA.texture, uHasSrc: 0, uC2: 0, uDamp: p.rippleDamp }),
      pack: this.pass(SH.PACK_FRAG, { tState: null, tWet: null, uMode: 0 }),
      mask: this.pass(SH.MASK_FRAG, { tState: null, tWet: null, tPowder: null, uBlock: this.maskBlock }),
    };
    const splatMat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: SH.SPLAT_VERT, fragmentShader: SH.SPLAT_FRAG,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
      depthTest: false, depthWrite: false,
    });
    this.splats = new SplatBatch(splatMat);
    this.psplats = new SplatBatch(splatMat);
    this.rsplats = new SplatBatch(splatMat, 512);
    this.removes = [];
    this.blades = new Map();
    this.cpu = new Float32Array(res * res * 4);
    this.readBuf = new Float32Array(res * res * 4);
    this.readPending = false;
    this.sync = null;
    this.pbo = null;
    this.postReq = [];
    this.readEvery = 12;
    this.stepCount = 0;
    this.liters = 0;
    this.addedLiters = 0;
    this.removedLiters = 0;
    this.lastRead = 0;
    this.reflection = new PlanarReflection(this.renderer, fluids.scene, { scale: reflectionScale, planeY: -BAY.depth * 0.45 });
    this.reflection.enabled = reflections;
    this.reflectionHide = [];
    this.maxWet = 0;
    this.surface = createWaterSurface(this, fluids.textures, meshSegments, this.reflection);
    fluids.scene.add(this.surface.mesh);
    this._c = new THREE.Color();
  }

  pass(frag, uniforms) {
    const u = {};
    for (const k in uniforms) u[k] = { value: uniforms[k] };
    const material = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: SH.PASS_VERT, fragmentShader: frag, uniforms: u,
      depthTest: false, depthWrite: false, blending: THREE.NoBlending,
    });
    const mesh = new THREE.Mesh(this.tri, material);
    mesh.frustumCulled = false;
    return { mesh, u };
  }

  buildTerrain() {
    const n = this.res;
    const data = new Float32Array(n * n * 4);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = this.x0 + (i + 0.5) * this.cell, z = this.z0 + (j + 0.5) * this.cell;
      const tr = inTrench(x, z);
      const bump = (valueNoise(x * 1.1, z * 1.1) - 0.5) * 0.0022 + (valueNoise(x * 3.3 + 7, z * 3.3 - 3) - 0.5) * 0.0008;
      const k = (j * n + i) * 4;
      data[k] = floorHeightAt(x, z, { grout: false, trench: true }) + (tr ? 0 : bump);
      data[k + 1] = tr ? 1 : 0;
      data[k + 2] = 0.55 + valueNoise(x * 2.7 - 11, z * 2.7 + 5) * 0.9;
    }
    const t = new THREE.DataTexture(data, n, n, THREE.RGBAFormat, THREE.FloatType);
    t.minFilter = t.magFilter = THREE.NearestFilter;
    t.needsUpdate = true;
    return t;
  }

  anyWater() {
    return this.liters > 0.01 || this.maxWet > 0.02 || this.stepCount < 30;
  }

  toUV(x, z) {
    return [(x - this.x0) / this.size, (z - this.z0) / this.size];
  }

  covers(x, z, r = 0) {
    return x > this.x0 - r && x < this.x0 + this.size + r && z > this.z0 - r && z < this.z0 + this.size + r;
  }

  splatRadius(radius, res) {
    return Math.max(radius, (1.6 * this.size) / res);
  }

  addWater(x, z, liters, { dirt = 0, soap = 0, radius = 0.15 } = {}) {
    if (!(liters > 0) || !this.covers(x, z, radius)) return false;
    const R = this.splatRadius(radius, this.res);
    const amp = (3 * liters * 0.001) / (Math.PI * R * R) * 1000;
    const [u, v] = this.toUV(x, z);
    this.addedLiters += liters;
    return this.splats.push(u, v, R / this.size, amp, amp * Math.min(Math.max(dirt, 0), 1), 0, amp * Math.min(Math.max(soap, 0), 1));
  }

  addFoam(x, z, amount, radius = 0.2) {
    if (!(amount > 0) || !this.covers(x, z, radius)) return false;
    const R = this.splatRadius(radius, this.res);
    const amp = (3 * amount * this.fluids.units.foam.floorPerUnit) / (Math.PI * R * R);
    const [u, v] = this.toUV(x, z);
    return this.splats.push(u, v, R / this.size, 0, 0, amp, 0);
  }

  addPowder(x, z, kg, color, radius = 0.05) {
    if (!(kg > 0) || !this.covers(x, z, radius)) return false;
    const R = this.splatRadius(radius, this.res);
    const amp = (3 * kg * this.fluids.units.powder.floorPerUnit) / (Math.PI * R * R);
    const [u, v] = this.toUV(x, z);
    const c = this._c.set(color);
    return this.psplats.push(u, v, R / this.size, c.r * amp, c.g * amp, c.b * amp, amp);
  }

  addRipple(x, z, strength, radius = 0.025) {
    if (!this.covers(x, z)) return false;
    const R = this.splatRadius(radius, this.rippleRes);
    const [u, v] = this.toUV(x, z);
    return this.rsplats.push(u, v, R / this.size, -strength, 0, 0, 0);
  }

  removeWater(x, z, radius, maxLiters = Infinity) {
    if (!this.covers(x, z, radius) || !(radius > 0)) return 0;
    const n = this.res, c = this.cell, cpu = this.cpu;
    const i0 = Math.max(0, Math.floor((x - radius - this.x0) / c)), i1 = Math.min(n - 1, Math.ceil((x + radius - this.x0) / c));
    const j0 = Math.max(0, Math.floor((z - radius - this.z0) / c)), j1 = Math.min(n - 1, Math.ceil((z + radius - this.z0) / c));
    let avail = 0;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const dx = this.x0 + (i + 0.5) * c - x, dz = this.z0 + (j + 0.5) * c - z;
      const d = Math.hypot(dx, dz) / radius;
      if (d >= 1) continue;
      const w = (1 - d * d) ** 2;
      avail += cpu[(j * n + i) * 4] * w * c * c;
    }
    const availL = avail * 1000;
    if (availL <= 1e-6) return 0;
    const take = Math.min(availL, maxLiters);
    const frac = take / availL;
    this.applyCpuRemoval(x, z, radius, frac);
    if (this.readPending) this.postReq.push({ x, z, radius, frac });
    const [u, v] = this.toUV(x, z);
    const ex = this.removes.find((r) => Math.abs(r.u - u) < 1e-6 && Math.abs(r.v - v) < 1e-6 && Math.abs(r.r - radius / this.size) < 1e-6);
    if (ex) ex.f = 1 - (1 - ex.f) * (1 - frac);
    else if (this.removes.length < MAX_REMOVES) this.removes.push({ u, v, r: radius / this.size, f: frac });
    else return 0;
    this.removedLiters += take;
    this.liters = Math.max(0, this.liters - take);
    return take;
  }

  applyCpuRemoval(x, z, radius, frac) {
    const n = this.res, c = this.cell, cpu = this.cpu;
    const i0 = Math.max(0, Math.floor((x - radius - this.x0) / c)), i1 = Math.min(n - 1, Math.ceil((x + radius - this.x0) / c));
    const j0 = Math.max(0, Math.floor((z - radius - this.z0) / c)), j1 = Math.min(n - 1, Math.ceil((z + radius - this.z0) / c));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const dx = this.x0 + (i + 0.5) * c - x, dz = this.z0 + (j + 0.5) * c - z;
      const d = Math.hypot(dx, dz) / radius;
      if (d >= 1) continue;
      const w = (1 - d * d) ** 2;
      cpu[(j * n + i) * 4] *= 1 - frac * w;
    }
  }

  sample(x, z, ch) {
    const n = this.res;
    const fx = (x - this.x0) / this.cell - 0.5, fz = (z - this.z0) / this.cell - 0.5;
    if (fx < -0.5 || fz < -0.5 || fx > n - 0.5 || fz > n - 0.5) return 0;
    const i = Math.max(0, Math.min(n - 2, Math.floor(fx))), j = Math.max(0, Math.min(n - 2, Math.floor(fz)));
    const tx = Math.max(0, Math.min(1, fx - i)), tz = Math.max(0, Math.min(1, fz - j));
    const c = this.cpu;
    const a = c[(j * n + i) * 4 + ch], b = c[(j * n + i + 1) * 4 + ch];
    const d = c[((j + 1) * n + i) * 4 + ch], e = c[((j + 1) * n + i + 1) * 4 + ch];
    return (a * (1 - tx) + b * tx) * (1 - tz) + (d * (1 - tx) + e * tx) * tz;
  }

  depthAt(x, z) {
    return this.sample(x, z, 0);
  }

  wetnessAt(x, z) {
    return this.sample(x, z, 1);
  }

  dirtAt(x, z) {
    return this.sample(x, z, 2);
  }

  foamAt(x, z) {
    return this.sample(x, z, 3);
  }

  squeegee(id, a, b, tick) {
    let bl = this.blades.get(id);
    const ax = a.x - this.x0, az = a.z - this.z0, bx = b.x - this.x0, bz = b.z - this.z0;
    if (!bl || tick - bl.tick > 2) {
      bl = { a: [ax, az], b: [bx, bz], pa: [ax, az], pb: [bx, bz], tick, steps: 1, used: -1 };
      this.blades.set(id, bl);
      return;
    }
    if (tick !== bl.tick) {
      bl.pa = bl.a;
      bl.pb = bl.b;
      bl.steps = tick - bl.tick;
      bl.tick = tick;
    }
    bl.a = [ax, az];
    bl.b = [bx, bz];
  }

  activeBlades(tick) {
    const out = [];
    for (const [id, bl] of this.blades) {
      if (tick - bl.tick > 1) {
        if (tick - bl.tick > 120) this.blades.delete(id);
        continue;
      }
      out.push(bl);
      if (out.length >= MAX_BLADES) break;
    }
    return out;
  }

  run(p, out) {
    this.renderer.setRenderTarget(out);
    this.renderer.render(p.mesh, this.cam);
    this.passCount++;
  }

  drawSplats(batch, rtOut) {
    const n = batch.commit();
    if (!n) return false;
    const r = this.renderer;
    r.setRenderTarget(rtOut);
    r.setClearColor(0x000000, 0);
    r.clear(true, false, false);
    r.render(batch.mesh, this.cam);
    this.passCount++;
    return true;
  }

  saveInfo() {
    const i = this.renderer.info.render;
    this._info = [i.calls, i.triangles, i.points, i.lines];
  }

  restoreInfo() {
    const i = this.renderer.info.render, s = this._info;
    i.calls = s[0]; i.triangles = s[1]; i.points = s[2]; i.lines = s[3];
  }

  step(dt, tick) {
    const r = this.renderer;
    this.saveInfo();
    const prevTarget = r.getRenderTarget();
    const prevAuto = r.autoClear;
    const prevClear = r.getClearColor(new THREE.Color());
    const prevAlpha = r.getClearAlpha();
    r.autoClear = false;
    this.passCount = 0;
    const P = this.passes;
    const hasSrc = this.drawSplats(this.splats, this.src);
    const hasP = this.drawSplats(this.psplats, this.psrc);
    const hasR = this.drawSplats(this.rsplats, this.ripSrc);
    const blades = this.activeBlades(tick);
    const fu = P.flux.u;
    fu.uDt.value = dt;
    fu.tState.value = this.state[0].texture;
    fu.tFlux.value = this.flux[0].texture;
    fu.tWet.value = this.wet[0].texture;
    fu.uBlades.value = blades.length;
    for (let i = 0; i < blades.length; i++) {
      const bl = blades[i];
      const k = bl.used !== bl.tick ? 1 / (dt * Math.max(1, bl.steps)) : 0;
      bl.used = bl.tick;
      fu.uBladeSeg.value[i].set(bl.a[0], bl.a[1], bl.b[0], bl.b[1]);
      fu.uBladeVel.value[i].set((bl.a[0] - bl.pa[0]) * k, (bl.a[1] - bl.pa[1]) * k, (bl.b[0] - bl.pb[0]) * k, (bl.b[1] - bl.pb[1]) * k);
    }
    this.run(P.flux, this.flux[1]);
    const du = P.depth.u;
    du.uDt.value = dt;
    du.tState.value = this.state[0].texture;
    du.tFlux.value = this.flux[1].texture;
    du.tSrc.value = hasSrc ? this.src.texture : this.zero;
    du.uHasSrc.value = hasSrc ? 1 : 0;
    du.uHasRip.value = hasR ? 1 : 0;
    du.tPowder.value = this.powder[0].texture;
    du.tRipSrc.value = hasR ? this.ripSrc.texture : this.zero;
    du.uRemoves.value = this.removes.length;
    for (let i = 0; i < this.removes.length; i++) {
      const rm = this.removes[i];
      du.uRemove.value[i].set(rm.u, rm.v, rm.r, rm.f);
    }
    this.removes.length = 0;
    this.run(P.depth, this.state[1]);
    const wu = P.wet.u;
    wu.uDt.value = dt;
    wu.tState.value = this.state[1].texture;
    wu.tFlux.value = this.flux[1].texture;
    wu.tWet.value = this.wet[0].texture;
    this.run(P.wet, this.wet[1]);
    const pu = P.powder.u;
    pu.uDt.value = dt;
    pu.tPowder.value = this.powder[0].texture;
    pu.tPsrc.value = hasP ? this.psrc.texture : this.zero;
    pu.uHasSrc.value = hasP ? 1 : 0;
    pu.tState.value = this.state[1].texture;
    this.run(P.powder, this.powder[1]);
    const ru = P.ripple.u;
    const c = this.params.rippleC * dt / (this.size / this.rippleRes);
    ru.uC2.value = Math.min(c * c, 0.45);
    ru.tRip.value = this.rip[0].texture;
    ru.tRipSrc.value = hasR ? this.ripSrc.texture : this.zero;
    ru.uHasSrc.value = hasR ? 1 : 0;
    this.run(P.ripple, this.rip[1]);
    this.state.reverse();
    this.flux.reverse();
    this.wet.reverse();
    this.powder.reverse();
    this.rip.reverse();
    this.stepCount++;
    this.pollRead();
    if (this.stepCount % this.readEvery === 0 && !this.readPending) this.requestRead();
    r.setRenderTarget(prevTarget);
    r.autoClear = prevAuto;
    r.setClearColor(prevClear, prevAlpha);
    this.restoreInfo();
    this.time += dt;
  }

  requestRead() {
    const pk = this.passes.pack;
    pk.u.tState.value = this.state[0].texture;
    pk.u.tWet.value = this.wet[0].texture;
    pk.u.uMode.value = 1;
    this.run(pk, this.readRT);
    const r = this.renderer, gl = r.getContext(), st = r.state;
    const fb = r.properties.get(this.readRT).__webglFramebuffer;
    if (!fb) return;
    st.bindFramebuffer(gl.FRAMEBUFFER, fb);
    if (!this.pbo) this.pbo = gl.createBuffer();
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.pbo);
    gl.bufferData(gl.PIXEL_PACK_BUFFER, this.readBuf.byteLength, gl.STREAM_READ);
    gl.readPixels(0, 0, this.res, this.res, gl.RGBA, gl.FLOAT, 0);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    const cur = r.getRenderTarget();
    st.bindFramebuffer(gl.FRAMEBUFFER, cur ? r.properties.get(cur).__webglFramebuffer : null);
    this.sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    this.readPending = true;
    this.readT0 = performance.now();
    this.postReq = [];
  }

  pollRead() {
    if (!this.sync) return;
    const gl = this.renderer.getContext();
    const status = gl.clientWaitSync(this.sync, 0, 0);
    if (status === gl.TIMEOUT_EXPIRED) return;
    gl.deleteSync(this.sync);
    this.sync = null;
    this.readPending = false;
    if (status === gl.WAIT_FAILED) return;
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.pbo);
    gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, this.readBuf);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    this.cpu.set(this.readBuf);
    for (const rm of this.postReq) this.applyCpuRemoval(rm.x, rm.z, rm.radius, rm.frac);
    this.lastRead = performance.now() - this.readT0;
    let sum = 0, mw = 0;
    const b = this.cpu;
    for (let i = 0; i < b.length; i += 4) {
      sum += b[i];
      if (b[i + 1] > mw) mw = b[i + 1];
    }
    this.liters = sum * this.cell * this.cell * 1000;
    this.maxWet = mw;
  }

  frame(dt, camera) {
    const r = this.renderer;
    this.saveInfo();
    const prevTarget = r.getRenderTarget();
    const pk = this.passes.pack;
    pk.u.tState.value = this.state[0].texture;
    pk.u.tWet.value = this.wet[0].texture;
    pk.u.uMode.value = 0;
    r.setRenderTarget(this.renderA);
    r.render(pk.mesh, this.cam);
    const mk = this.passes.mask;
    mk.u.tState.value = this.state[0].texture;
    mk.u.tWet.value = this.wet[0].texture;
    mk.u.tPowder.value = this.powder[0].texture;
    r.setRenderTarget(this.maskRT);
    r.render(mk.mesh, this.cam);
    r.setRenderTarget(prevTarget);
    this.restoreInfo();
    this.surface.update(dt, camera);
  }

  dispose() {
    for (const t of [...this.state, ...this.flux, ...this.wet, ...this.powder, ...this.rip, this.src, this.psrc, this.ripSrc, this.renderA, this.readRT, this.maskRT]) t.dispose();
    this.terrain.dispose();
    this.surface.dispose();
    this.reflection.dispose();
    const gl = this.renderer.getContext();
    if (this.sync) gl.deleteSync(this.sync);
    if (this.pbo) gl.deleteBuffer(this.pbo);
  }
}
