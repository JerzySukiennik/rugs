// Rug Rush cleaning progress: finds every stain on each rug, tracks how much of it is left and celebrates each one that comes out.
import * as THREE from 'three';
import { STAINS } from '../ui/stainHint.js';

const SPOT_KINDS = ['mud', 'sticky', 'wine', 'coffee', 'grease', 'urine', 'gum', 'wax', 'paint', 'mold'];
const LAYER_KINDS = ['dust', 'hair'];
const HIDDEN = { urine: { name: 'Pet urine', map: 'dirt1', ch: 3, min: 25 } };
export const stainDef = (kind) => STAINS[kind] ?? HIDDEN[kind];
const COLORS = { mud: '#c98b4a', sticky: '#ff8c42', wine: '#ff5d8f', coffee: '#d9a066', grease: '#ffd23f', urine: '#fff07a', gum: '#ff9ad5', wax: '#fff2c4', paint: '#3a86ff', mold: '#8fdc7a', dust: '#e8e2d6', hair: '#d8c3a5' };

export class Progress {
  constructor(game) {
    this.game = game;
    this.order = 984;
    this.rugs = new Map();
    this.acc = 0;
  }

  scan(c) {
    const s = c.surface;
    if (!s?.data) return null;
    const W = s.W, H = s.H, N = W * H;
    const seen = new Uint8Array(N);
    const q = new Int32Array(N);
    const spots = [];
    let any = 0;
    for (const kind of SPOT_KINDS) {
      const d = stainDef(kind);
      const arr = s.data[d.map], ch = d.ch;
      const th = Math.max(d.min, 36);
      seen.fill(0);
      for (let i0 = 0; i0 < N; i0++) {
        if (seen[i0] || arr[i0 * 4 + ch] < th) continue;
        let h = 0, t = 0, sum = 0, su = 0, sv = 0;
        seen[i0] = 1;
        q[t++] = i0;
        while (h < t) {
          const i = q[h++];
          const v = arr[i * 4 + ch];
          sum += v;
          const x = i % W, y = (i - x) / W;
          su += x * v;
          sv += y * v;
          if (x > 0 && !seen[i - 1] && arr[(i - 1) * 4 + ch] >= th) { seen[i - 1] = 1; q[t++] = i - 1; }
          if (x < W - 1 && !seen[i + 1] && arr[(i + 1) * 4 + ch] >= th) { seen[i + 1] = 1; q[t++] = i + 1; }
          if (y > 0 && !seen[i - W] && arr[(i - W) * 4 + ch] >= th) { seen[i - W] = 1; q[t++] = i - W; }
          if (y < H - 1 && !seen[i + W] && arr[(i + W) * 4 + ch] >= th) { seen[i + W] = 1; q[t++] = i + W; }
        }
        any += sum;
        if (t < 30) continue;
        spots.push({ kind, cells: q.slice(0, t), init: sum, frac: 1, done: false, u: (su / sum + 0.5) / W, v: (sv / sum + 0.5) / H, hidden: kind === 'urine' });
      }
    }
    const layers = [];
    for (const kind of LAYER_KINDS) {
      const d = stainDef(kind);
      const arr = s.data[d.map], ch = d.ch;
      let sum = 0;
      for (let i = 0; i < N; i++) sum += arr[i * 4 + ch];
      any += sum;
      if (sum / N > 6) layers.push({ kind, init: sum, frac: 1, done: false });
    }
    return any > 0 ? { spots, layers, spotless: false, total: spots.filter((x) => !x.hidden).length } : null;
  }

  measure(c, r) {
    const s = c.surface;
    for (const sp of r.spots) {
      if (sp.done) continue;
      const d = stainDef(sp.kind);
      const arr = s.data[d.map], ch = d.ch;
      let sum = 0;
      for (let k = 0; k < sp.cells.length; k++) sum += arr[sp.cells[k] * 4 + ch];
      sp.frac = sum / sp.init;
      if (sp.frac < 0.07) {
        sp.done = true;
        this.celebrate(c, sp);
      }
    }
    for (const ly of r.layers) {
      if (ly.done) continue;
      const d = stainDef(ly.kind);
      const arr = s.data[d.map], ch = d.ch;
      let sum = 0;
      for (let i = 0; i < s.N; i++) sum += arr[i * 4 + ch];
      ly.frac = sum / ly.init;
      if (ly.frac < 0.12) {
        ly.done = true;
        this.celebrate(c, ly);
      }
    }
    if (!r.spotless && r.spots.every((x) => x.done) && r.layers.every((x) => x.done)) {
      const ev = this.game.chem?.evaluate(c);
      if (ev && !ev.ruined && ev.clean > 0.95) {
        r.spotless = true;
        this.finale(c);
      }
    }
  }

  near(p) {
    return this.game.player.feet.distanceTo(p) < 14;
  }

  celebrate(c, sp) {
    const g = this.game;
    const layer = sp.u === undefined;
    const w = layer ? c.uvToWorld?.(0.5, 0.5)?.point : c.uvToWorld?.(sp.u, sp.v)?.point;
    if (!w) return;
    const p = w.clone().add(new THREE.Vector3(0, 0.08, 0));
    if (!this.near(p)) return;
    g.juice?.sparkle(p, COLORS[sp.kind] ?? '#fff6c8', 64, layer ? 1.8 : 1);
    g.juice?.float(`${stainDef(sp.kind).name} gone!`, p.clone().add(new THREE.Vector3(0, 0.3, 0)), '#52c46b', 0.5);
    g.audio?.ui(layer ? 'ui_ding' : 'ui_sparkle', 0.75);
  }

  finale(c) {
    const g = this.game;
    const w = c.uvToWorld?.(0.5, 0.5)?.point;
    if (!w || !this.near(w)) return;
    const p = w.clone().add(new THREE.Vector3(0, 0.6, 0));
    g.juice?.float('SPOTLESS!', p, '#ffd23f', 1.2);
    for (const [u, v] of [[0.2, 0.2], [0.8, 0.2], [0.5, 0.5], [0.2, 0.8], [0.8, 0.8]]) {
      const q = c.uvToWorld?.(u, v)?.point;
      if (q) g.juice?.sparkle(q.clone().add(new THREE.Vector3(0, 0.05, 0)), '#fff2a8', 64, 1.4);
    }
    g.juice?.confetti(70);
    g.audio?.ui('ui_spotless', 0.8);
    g.hud?.toast(`${c.displayName?.() ?? 'Rug'} is spotless! Dry it and wrap it.`);
  }

  info(c) {
    return this.rugs.get(c) ?? null;
  }

  fixedUpdate(dt) {
    const g = this.game;
    if (g.mode === 'menu') return;
    this.acc += dt;
    if (this.acc < 0.3) return;
    this.acc = 0;
    const list = g.carpets?.list ?? [];
    for (const c of [...this.rugs.keys()]) if (!list.includes(c)) this.rugs.delete(c);
    for (const c of list) {
      if (c.wrapped) continue;
      let r = this.rugs.get(c);
      if (!r) {
        if (c.state === 'rolled') continue;
        r = this.scan(c);
        if (!r) continue;
        this.rugs.set(c, r);
      }
      this.measure(c, r);
    }
  }
}
