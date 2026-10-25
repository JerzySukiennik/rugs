// Rug Rush stain inspector: with empty hands it names the dirt under the crosshair and outlines the whole connected stain on the rug.
import * as THREE from 'three';

export const STAINS = {
  dust: { name: 'Dust & grit', tip: 'Vacuum it with the upright vac', map: 'dirt0', ch: 0, min: 50 },
  hair: { name: 'Pet hair', tip: 'Rubber brush, then vacuum', map: 'dirt0', ch: 1, min: 40 },
  mud: { name: 'Dried mud', tip: 'Dry stiff brush, then vacuum', map: 'dirt0', ch: 2, min: 25 },
  sticky: { name: 'Sticky soda', tip: 'Shampoo, scrub, then rinse', map: 'dirt0', ch: 3, min: 25 },
  wine: { name: 'Red wine', tip: 'Oxygen spotter or tannin spotter, then rinse', map: 'dirt1', ch: 0, min: 20 },
  coffee: { name: 'Coffee', tip: 'Tannin spotter, scrub, then rinse', map: 'dirt1', ch: 1, min: 20 },
  grease: { name: 'Grease', tip: 'Absorbent powder, wait, then vacuum', map: 'dirt1', ch: 2, min: 20 },
  gum: { name: 'Chewing gum', tip: 'Freeze spray, then scrape it off', map: 'dirt2', ch: 0, min: 20 },
  wax: { name: 'Candle wax', tip: 'Scrape, then iron over brown paper', map: 'dirt2', ch: 1, min: 20 },
  paint: { name: 'Paint', tip: 'Alcohol or white spirit, then scrape', map: 'dirt2', ch: 2, min: 20 },
  mold: { name: 'Mould', tip: 'Anti-mould treatment, let it work, then vacuum', map: 'dirt2', ch: 3, min: 15 },
  powder: { name: 'Cleaning powder', tip: 'Vacuum it up once it has worked', map: 'layer', ch: 1, min: 30, w: 0.5 },
  gel: { name: 'Shampoo', tip: 'Scrub it in, then rinse it out', map: 'layer', ch: 2, min: 30, w: 0.5 },
  bleed: { name: 'Colour run (damage)', tip: 'Permanent. Avoid alkali and soaking on this rug', map: 'damage', ch: 0, min: 60, dmg: true },
  bleach: { name: 'Faded patch (damage)', tip: 'Permanent. Wrong product for this fibre', map: 'damage', ch: 1, min: 60, dmg: true },
  shrink: { name: 'Felted fibres (damage)', tip: 'Permanent. Use a gentler tool', map: 'damage', ch: 2, min: 60, dmg: true },
  burn: { name: 'Scorch mark (damage)', tip: 'Permanent. The iron was too hot', map: 'damage', ch: 3, min: 40, dmg: true },
};

const VERT = `
uniform float uOff;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position + normal * uOff, 1.0);
}
`;

const FRAG = `
uniform sampler2D tMask;
uniform vec2 uTexel;
uniform vec2 uDims;
uniform float uTime;
uniform float uFade;
varying vec2 vUv;
void main() {
  float m = texture2D(tMask, vUv).r;
  vec2 o = uTexel * 1.25;
  float a = texture2D(tMask, vUv + vec2(o.x, 0.0)).r, b = texture2D(tMask, vUv - vec2(o.x, 0.0)).r;
  float c = texture2D(tMask, vUv + vec2(0.0, o.y)).r, d = texture2D(tMask, vUv - vec2(0.0, o.y)).r;
  float edge = smoothstep(0.2, 0.6, max(max(a, b), max(c, d)) - min(min(a, b), min(c, d)));
  vec2 pm = vUv * uDims;
  float ants = step(0.5, fract((pm.x + pm.y) * 9.0 - uTime * 1.6));
  float pulse = 0.5 + 0.5 * sin(uTime * 4.0);
  float fill = smoothstep(0.35, 0.65, m) * (0.12 + 0.1 * pulse);
  vec3 col = mix(vec3(1.0, 0.82, 0.25), vec3(0.11, 0.11, 0.12), ants * edge);
  float alpha = max(edge * 0.95, fill) * uFade;
  if (alpha < 0.01) discard;
  gl_FragColor = vec4(mix(vec3(1.0, 0.82, 0.25), col, edge), alpha);
}
`;

export class StainHint {
  constructor(game) {
    this.game = game;
    this.order = 985;
    this.carpet = null;
    this.kind = null;
    this.t = 0;
    this.time = { value: 0 };
    this.fade = 0;
    this.acc = 1;
    this.queue = null;
  }

  sample(c, u, v) {
    const s = c.surface;
    if (!s?.data) return null;
    const x = Math.min(s.W - 1, Math.max(0, Math.floor(u * s.W)));
    const y = Math.min(s.H - 1, Math.max(0, Math.floor(v * s.H)));
    const o = (y * s.W + x) * 4;
    let best = null, bv = 0;
    for (const [k, d] of Object.entries(STAINS)) {
      const val = s.data[d.map][o + d.ch];
      if (val < d.min) continue;
      const score = val * (d.w ?? (d.dmg ? 0.7 : 1));
      if (score > bv) {
        bv = score;
        best = k;
      }
    }
    return best ? { kind: best, x, y, val: s.data[STAINS[best].map][o + STAINS[best].ch] } : null;
  }

  flood(c, hit) {
    const s = c.surface, W = s.W, H = s.H, N = W * H;
    const d = STAINS[hit.kind];
    const arr = s.data[d.map], ch = d.ch;
    const th = Math.max(d.min * 0.6, hit.val * 0.18);
    const vis = c.stainHL;
    const m = vis.mask;
    m.fill(0);
    if (!this.queue || this.queue.length < N) this.queue = new Int32Array(N);
    const q = this.queue;
    let h = 0, t = 0, n = 0;
    const s0 = hit.y * W + hit.x;
    m[s0] = 255;
    q[t++] = s0;
    while (h < t) {
      const i = q[h++];
      n++;
      const x = i % W, y = (i - x) / W;
      if (x > 0 && !m[i - 1] && arr[(i - 1) * 4 + ch] >= th) { m[i - 1] = 255; q[t++] = i - 1; }
      if (x < W - 1 && !m[i + 1] && arr[(i + 1) * 4 + ch] >= th) { m[i + 1] = 255; q[t++] = i + 1; }
      if (y > 0 && !m[i - W] && arr[(i - W) * 4 + ch] >= th) { m[i - W] = 255; q[t++] = i - W; }
      if (y < H - 1 && !m[i + W] && arr[(i + W) * 4 + ch] >= th) { m[i + W] = 255; q[t++] = i + W; }
    }
    vis.tex.needsUpdate = true;
    return n / N;
  }

  overlay(c) {
    if (c.stainHL) return c.stainHL;
    const s = c.surface;
    const mask = new Uint8Array(s.W * s.H);
    const tex = new THREE.DataTexture(mask, s.W, s.H, THREE.RedFormat, THREE.UnsignedByteType);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        tMask: { value: tex },
        uTexel: { value: new THREE.Vector2(1 / s.W, 1 / s.H) },
        uDims: { value: new THREE.Vector2(c.width, c.length) },
        uTime: this.time,
        uFade: { value: 0 },
        uOff: { value: (c.typeDef?.backing ?? 0.004) + (c.pileTop ?? 0) + 0.004 },
      },
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const mesh = new THREE.Mesh(c.geoFilm, mat);
    mesh.renderOrder = 4;
    mesh.frustumCulled = false;
    mesh.visible = false;
    c.group.add(mesh);
    const prev = c.dispose?.bind(c);
    c.dispose = () => {
      mesh.removeFromParent();
      mat.dispose();
      tex.dispose();
      prev?.();
    };
    c.stainHL = { mask, tex, mat, mesh };
    return c.stainHL;
  }

  update(dt) {
    const g = this.game;
    this.time.value += dt;
    const grab = g.grab;
    const aim = grab?.aim;
    const ch = aim?.carpetHit;
    let target = null;
    if (g.mode !== 'menu' && !grab?.held && aim?.owner?.kind === 'carpet' && ch?.part === 'top' && aim.owner.state !== 'rolled' && !aim.owner.wrapped && !g.hud?.labelOpen) {
      target = aim.owner;
    }
    this.acc += dt;
    let hit = null;
    if (target) hit = this.sample(target, ch.uv.u, ch.uv.v);
    if (hit) {
      const vis = this.overlay(target);
      const inside = vis.mask[hit.y * target.surface.W + hit.x] > 0;
      if (target !== this.carpet || hit.kind !== this.kind || !inside || this.acc > 0.35) {
        if (this.carpet && this.carpet !== target && this.carpet.stainHL) this.carpet.stainHL.mesh.visible = false;
        this.flood(target, hit);
        this.carpet = target;
        this.kind = hit.kind;
        this.acc = 0;
      }
      this.fade = Math.min(1, this.fade + dt * 8);
    } else this.fade = Math.max(0, this.fade - dt * 6);
    const c = this.carpet;
    if (c?.stainHL) {
      c.stainHL.mat.uniforms.uFade.value = this.fade;
      c.stainHL.mesh.visible = this.fade > 0.01 && !c.wrapped;
      if (this.fade <= 0.01) {
        this.carpet = null;
        this.kind = null;
      }
    }
    g.stainHover = hit && this.kind ? { kind: this.kind, ...STAINS[this.kind] } : null;
  }
}
