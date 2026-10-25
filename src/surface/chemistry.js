// Rug Rush rug chemistry: per-cell dirt, layered products, reactions, agitation, extraction, drying, damage and grading.
import { PRODUCTS, AGENTS } from '../data/products.js';
import { FIBERS } from '../data/fibers.js';
import { CARPET_TYPES } from '../data/carpetTypes.js';
import { soilRug } from '../data/jobs.js';

export const DIRT = ['dust', 'hair', 'mud', 'sticky', 'wine', 'coffee', 'grease', 'urine', 'gum', 'wax', 'paint', 'mold'];
const DIRT_W = { dust: 0.6, hair: 0.7, mud: 1, sticky: 1, wine: 1.2, coffee: 1, grease: 1, urine: 0.9, gum: 1.6, wax: 1.3, paint: 1.5, mold: 1.4 };
const DMG = ['bleed', 'bleach', 'shrink', 'burn'];
const EXTRA = ['water', 'powder', 'gel', 'foam', 'susp', 'oil', 'frozen', 'agit', 'wetT', 'gelR', 'gelG', 'gelB', 'powR', 'powG', 'powB'];
const FIELDS = [...DIRT, ...DMG, ...EXTRA, ...AGENTS];
const SOLUTES = ['surf', 'alk', 'acid', 'ox', 'enz', 'tannin', 'reducer', 'chlor', 'scent', 'encap', 'fix', 'fungi'];

const L_WATER = 1.6;
const L_GEL = 0.35;
const KG_POWDER = 0.45;
const FOAM_EXPANSION = 20;
const FOAM_PER_LAYER = 12;
const L_MIST = 0.12;
const SLICES = 12;

function b8(v) {
  return v <= 0 ? 0 : v >= 1 ? 255 : (v * 255 + 0.5) | 0;
}

function hexRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export class RugState {
  constructor(carpet, surface, type, seed) {
    this.carpet = carpet;
    this.surface = surface;
    this.type = type;
    this.fiber = FIBERS[type];
    this.W = surface.W;
    this.H = surface.H;
    this.N = surface.N;
    this.widthM = surface.widthM;
    this.lengthM = surface.lengthM;
    this.cellArea = 1 / (surface.cellsPerM * surface.cellsPerM);
    this.f = {};
    for (const k of FIELDS) this.f[k] = new Float32Array(this.N);
    this.f.powR.fill(1); this.f.powG.fill(1); this.f.powB.fill(1);
    this.f.gelR.fill(0.5); this.f.gelG.fill(0.75); this.f.gelB.fill(0.9);
    this.active = new Uint8Array(this.N);
    this.initialDirt = 0;
    this.seed = seed;
    this.runoff = { liters: 0, dirt: 0, soap: 0, u: 0.5, v: 0.5 };
    this.dryBoost = null;
    this.hanging = 0;
    this.time = 0;
  }
}

export class Chemistry {
  constructor() {
    this.rugs = new Map();
    this.onRunoff = null;
    this.dryBoostFn = null;
    this.stats = { tickMs: 0 };
  }

  attach(carpet, { story = null, seed = 1 } = {}) {
    const st = new RugState(carpet, carpet.surface, carpet.type, seed);
    if (story) soilRug(st, story, seed);
    st.initialDirt = this.dirtSum(st);
    for (let i = 0; i < st.N; i++) this.syncCell(st, i);
    st.surface.markAllDirty();
    this.rugs.set(carpet, st);
    carpet.chem = st;
    return st;
  }

  detach(carpet) {
    this.rugs.delete(carpet);
  }

  state(carpet) {
    return this.rugs.get(carpet) ?? null;
  }

  dirtSum(st) {
    let s = 0;
    for (const d of DIRT) {
      const a = st.f[d], w = DIRT_W[d];
      for (let i = 0; i < st.N; i++) s += a[i] * w;
    }
    return s / st.N;
  }

  splat(st, uv, radius, fn) {
    const s = st.surface;
    let total = 0;
    s.forEachInRadius(uv.u, uv.v, radius, (x, y, w) => (total += w));
    if (total <= 0) {
      const c = s.uvToCell(uv.u, uv.v);
      const i = c.y * st.W + c.x;
      fn(i, 1, 1);
      st.active[i] = 1;
      this.syncCell(st, i);
      return;
    }
    s.forEachInRadius(uv.u, uv.v, radius, (x, y, w) => {
      const i = y * st.W + x;
      fn(i, w / total, w);
      st.active[i] = 1;
      this.syncCell(st, i);
    });
  }

  deposit(carpet, uv, kind, productId, amount, radius = null) {
    const st = this.rugs.get(carpet);
    if (!st || !(amount > 0)) return;
    const p = productId ? PRODUCTS[productId] : null;
    const f = st.f;
    const ca = st.cellArea;
    const r = radius ?? { water: 0.1, mist: 0.07, foam: 0.08, powder: 0.06, gel: 0.06 }[kind] ?? 0.06;
    const col = p ? hexRgb(p.color) : null;
    this.splat(st, uv, r, (i, share) => {
      const perM2 = (amount * share) / ca;
      if (kind === 'water') {
        const d = perM2 / L_WATER;
        this.flushCell(st, i, Math.min(0.85, d * 2.5), d * 0.45, uv);
        f.water[i] += d * 0.55;
      } else if (kind === 'mist') {
        f.water[i] += perM2 / L_WATER;
        this.addAgents(f, i, p, perM2 / L_MIST);
      } else if (kind === 'gel') {
        const d = perM2 / L_GEL;
        const g0 = f.gel[i];
        f.gel[i] = g0 + d;
        if (col) {
          const t = d / (g0 + d);
          f.gelR[i] += (col[0] - f.gelR[i]) * t;
          f.gelG[i] += (col[1] - f.gelG[i]) * t;
          f.gelB[i] += (col[2] - f.gelB[i]) * t;
        }
        this.addAgents(f, i, p, d);
      } else if (kind === 'foam') {
        const liquid = perM2 / FOAM_EXPANSION;
        f.foam[i] += perM2 / FOAM_PER_LAYER;
        f.water[i] += (liquid / L_WATER) * 0.6;
        this.addAgents(f, i, p, liquid / L_MIST);
      } else if (kind === 'powder') {
        const d = perM2 / KG_POWDER;
        const p0 = f.powder[i];
        f.powder[i] = p0 + d;
        if (col) {
          const t = d / (p0 + d);
          f.powR[i] += (col[0] - f.powR[i]) * t;
          f.powG[i] += (col[1] - f.powG[i]) * t;
          f.powB[i] += (col[2] - f.powB[i]) * t;
        }
        this.addAgents(f, i, p, d);
      }
      if (f.gel[i] > 3) f.gel[i] = 3;
      if (f.powder[i] > 3) f.powder[i] = 3;
      if (f.foam[i] > 1.6) f.foam[i] = 1.6;
      if (p) for (const a in p.agents) if (f[a][i] > 6) f[a][i] = 6;
      if (f.water[i] > 1) this.runoffCell(st, i, uv);
    });
  }

  addAgents(f, i, p, units) {
    if (!p) return;
    const fo = p.foaminess ?? 1;
    for (const [a, c] of Object.entries(p.agents)) f[a][i] += c * units * (a === 'surf' ? fo : 1);
  }

  flushCell(st, i, k, passUnits, uv) {
    const f = st.f;
    let soap = 0;
    for (const a of SOLUTES) {
      const rem = f[a][i] * k;
      f[a][i] -= rem;
      if (a === 'surf') soap += rem;
    }
    const remSusp = f.susp[i] * k;
    f.susp[i] -= remSusp;
    const remGel = f.gel[i] * k;
    f.gel[i] -= remGel;
    f.foam[i] -= f.foam[i] * Math.min(1, k * 1.3);
    if (f.water[i] > 0.25) {
      f.powder[i] -= f.powder[i] * k * 0.7;
      f.oil[i] -= f.oil[i] * k * 0.7;
    }
    const ro = st.runoff;
    ro.liters += passUnits * L_WATER * st.cellArea;
    ro.dirt += remSusp * st.cellArea * 4;
    ro.soap += (soap + remGel) * st.cellArea * 4;
    ro.u = uv.u;
    ro.v = uv.v;
  }

  runoffCell(st, i, uv) {
    const f = st.f;
    const w = f.water[i];
    const excess = w - 1;
    if (excess <= 0) return;
    const k = Math.min(0.9, (excess / w) * 2.5);
    let soap = 0;
    for (const a of SOLUTES) {
      const rem = f[a][i] * k;
      f[a][i] -= rem;
      if (a === 'surf') soap += rem;
    }
    const remSusp = f.susp[i] * k;
    f.susp[i] -= remSusp;
    const remGel = f.gel[i] * k * 0.9;
    f.gel[i] -= remGel;
    f.foam[i] -= f.foam[i] * Math.min(1, k * 1.4);
    if (f.water[i] > 0.3) {
      const rp = f.powder[i] * k * 0.6;
      f.powder[i] -= rp;
      f.oil[i] -= f.oil[i] * k * 0.6;
    }
    f.water[i] = 1;
    const liters = excess * L_WATER * st.cellArea;
    const ro = st.runoff;
    ro.liters += liters;
    ro.dirt += remSusp * st.cellArea * 4;
    ro.soap += (soap + remGel) * st.cellArea * 4;
    ro.u = uv.u;
    ro.v = uv.v;
  }

  agitate(carpet, uv, radius, tool, dirU = 0, dirV = 1, dt = 1 / 60) {
    const st = this.rugs.get(carpet);
    if (!st) return;
    const f = st.f, fb = st.fiber;
    const s = (tool.strength ?? 0.6) * Math.min(3, dt * 60);
    const shag = st.type === 'shag';
    let dryHits = 0;
    st.surface.forEachInRadius(uv.u, uv.v, radius, (x, y, w0) => {
      const i = y * st.W + x;
      const w = Math.min(1, w0 * 2.5) * s;
      const surf = f.surf[i], alk = f.alk[i];
      const film = f.water[i] + f.gel[i] * 0.8 + f.foam[i] * 0.3;
      const wet = Math.max(film, surf > 0.25 ? 0.4 : 0);
      f.agit[i] = Math.min(1.5, f.agit[i] + w * 0.25);
      if (film < 0.05 && surf < 0.05 && f.sticky[i] + f.grease[i] > 0.05) dryHits++;
      if (wet < 0.2) {
        const d = f.mud[i] * 0.12 * w;
        f.mud[i] -= d;
        f.dust[i] = Math.min(1.2, f.dust[i] + d * 0.8);
      } else {
        const d = f.mud[i] * 0.06 * w * (0.4 + surf + alk * 0.5);
        f.mud[i] -= d;
        f.susp[i] += d;
      }
      if (wet > 0.1) {
        const k = Math.min(1, wet) * (0.25 + surf + alk * 0.35);
        const ds = f.sticky[i] * 0.08 * w * k;
        f.sticky[i] -= ds;
        f.susp[i] += ds;
        if (wet > 0.2 || surf > 0.2) {
          const dd = f.dust[i] * 0.06 * w * (0.3 + surf);
          f.dust[i] -= dd;
          f.susp[i] += dd;
        }
        const ks = 0.02 * w * Math.min(1.5, surf);
        const dwn = f.wine[i] * ks, dcf = f.coffee[i] * ks;
        f.wine[i] -= dwn;
        f.coffee[i] -= dcf;
        f.susp[i] += (dwn + dcf) * 0.5;
        const dg = f.grease[i] * 0.03 * w * (surf * 0.4 + alk);
        f.grease[i] -= dg;
        f.susp[i] += dg;
        const gd = f.gel[i] * 0.03 * w;
        f.gel[i] -= gd;
        f.foam[i] = Math.min(1.6, f.foam[i] + gd * 1.5);
        if (surf > 0.03) {
          f.foam[i] = Math.min(1.6, f.foam[i] + 0.12 * w * Math.min(1.5, surf) * Math.min(1, wet * 1.6));
        }
        if (f.powder[i] > 0.02) f.powder[i] -= f.powder[i] * 0.02 * w;
      }
      if (f.dryc[i] > 0.05) {
        const k = 0.06 * w * Math.min(1, f.dryc[i]);
        for (const d of ['dust', 'sticky', 'grease', 'coffee', 'mud', 'wine']) {
          const t = f[d][i] * k * (d === 'wine' ? 0.4 : 1);
          f[d][i] -= t;
          f.oil[i] += t * 0.5;
        }
      }
      if (tool.rubber) f.hair[i] -= f.hair[i] * 0.15 * w;
      else if (tool.rake) f.hair[i] -= f.hair[i] * 0.08 * w;
      else f.hair[i] -= f.hair[i] * 0.015 * w;
      if (fb.felting && wet > 0.4 && (alk > fb.alkTol || tool.strength > 0.8)) f.shrink[i] += 0.0015 * w * (tool.strength > 0.8 ? 2.5 : 1);
      if (!fb.stiff && tool.strength > 0.8 && !tool.rubber && !tool.rake) f.shrink[i] += 0.0012 * w;
      if (tool.rubber && !fb.rubber) f.shrink[i] += 0.0008 * w;
      if (tool.rake && !fb.rake) f.shrink[i] += 0.0016 * w;
      if (st.type === 'silk' && wet > 0.2) f.bleach[i] += 0.001 * w;
      st.active[i] = 1;
      this.syncCell(st, i);
    });
    if (dryHits > 4 && !tool.rake && !tool.rubber) {
      const now = performance.now();
      if (now - (this.lastDryHint ?? 0) > 9000) {
        this.lastDryHint = now;
        this.onHint?.('Scrubbing it dry does little. Wet it with the hose or add shampoo first.', carpet);
      }
    }
    const sf = st.surface;
    sf.napStroke(uv.u, uv.v, dirU, dirV, radius, tool.rake ? 0.5 : 0.3 * (tool.strength ?? 0.6));
    if (tool.rake) {
      sf.stamp('nap.fluff', uv.u, uv.v, radius, 0.05 * s, 'add');
      sf.stamp('nap.crush', uv.u, uv.v, radius, 0.12 * s, 'sub');
    } else if (shag) {
      const c = sf.uvToCell(uv.u, uv.v);
      sf.stamp('nap.fluff', uv.u, uv.v, radius, (f.water[c.y * st.W + c.x] > 0.3 ? 0.012 : 0.004) * s, 'sub');
    }
  }

  vacuum(carpet, uv, radius, tool, dirU = 0, dirV = 1) {
    const st = this.rugs.get(carpet);
    if (!st) return { liters: 0, kg: 0 };
    const f = st.f, fb = st.fiber;
    let liters = 0, kg = 0, dirt = 0;
    st.surface.forEachInRadius(uv.u, uv.v, radius, (x, y, w0) => {
      const i = y * st.W + x;
      const w = Math.min(1, w0 * 1.6);
      const wet = f.water[i];
      if (tool.wet) {
        const dw = Math.max(0, wet - 0.12) * 0.22 * w;
        const frac = wet > 0 ? dw / wet : 0;
        f.water[i] -= dw;
        liters += dw * L_WATER * st.cellArea;
        for (const a of SOLUTES) f[a][i] -= f[a][i] * frac;
        const ds = f.susp[i] * Math.min(1, frac * 1.3);
        f.susp[i] -= ds;
        dirt += ds;
        f.foam[i] -= f.foam[i] * 0.35 * w;
        f.gel[i] -= f.gel[i] * 0.15 * w;
        if (wet > 0.3) f.powder[i] -= f.powder[i] * 0.12 * w;
      }
      const eff = wet > 0.35 ? (tool.wet ? 0.6 : 0.15) : 1;
      f.dust[i] -= f.dust[i] * 0.3 * w * eff;
      f.hair[i] -= f.hair[i] * (tool.beater ? 0.22 : 0.1) * w * eff;
      if (wet < 0.3) {
        const rp = f.powder[i] * 0.35 * w;
        if (rp > 0) {
          const fr = rp / f.powder[i];
          f.powder[i] -= rp;
          kg += rp * KG_POWDER * st.cellArea;
          f.oil[i] -= f.oil[i] * fr;
          f.absorb[i] -= f.absorb[i] * fr;
          f.dryc[i] -= f.dryc[i] * fr;
          f.encap[i] -= f.encap[i] * fr;
          const ds = f.susp[i] * fr;
          f.susp[i] -= ds;
        }
        if (f.encap[i] > 0.05 && f.water[i] < 0.12) {
          f.surf[i] -= f.surf[i] * 0.2 * w;
          f.encap[i] -= f.encap[i] * 0.2 * w;
        }
        f.mold[i] -= f.mold[i] * 0.06 * w * (f.fungi[i] > 0.15 ? 2.5 : 0.6);
      }
      if (tool.beater && !fb.beater) f.shrink[i] += 0.0025 * w;
      st.active[i] = 1;
      this.syncCell(st, i);
    });
    st.surface.napStroke(uv.u, uv.v, dirU, dirV, radius, 0.35);
    st.surface.stamp('nap.crush', uv.u, uv.v, radius, 0.04, 'sub');
    return { liters, kg, dirt };
  }

  squeegee(carpet, uv, radius, dirU = 0, dirV = 1) {
    const st = this.rugs.get(carpet);
    if (!st) return { liters: 0, dirt: 0, soap: 0 };
    const f = st.f;
    let liters = 0, dirt = 0, soap = 0;
    st.surface.forEachInRadius(uv.u, uv.v, radius, (x, y, w0) => {
      const i = y * st.W + x;
      const w = Math.min(1, w0 * 2.2);
      const wet = f.water[i];
      const dw = Math.max(0, wet - 0.07) * 0.7 * w;
      if (dw <= 0 && f.foam[i] < 0.01) return;
      const frac = wet > 0 ? dw / wet : 0;
      f.water[i] -= dw;
      liters += dw * L_WATER * st.cellArea;
      for (const a of SOLUTES) {
        const rem = f[a][i] * frac;
        f[a][i] -= rem;
        if (a === 'surf') soap += rem * st.cellArea * 4;
      }
      const ds = f.susp[i] * Math.min(1, frac * 1.2);
      f.susp[i] -= ds;
      dirt += ds * st.cellArea * 4;
      const df = f.foam[i] * 0.85 * w;
      f.foam[i] -= df;
      soap += df * st.cellArea * 2;
      f.gel[i] -= f.gel[i] * 0.5 * w;
      st.active[i] = 1;
      this.syncCell(st, i);
    });
    st.surface.napStroke(uv.u, uv.v, dirU, dirV, radius, 0.4);
    return { liters, dirt, soap };
  }

  scrape(carpet, uv, radius) {
    const st = this.rugs.get(carpet);
    if (!st) return;
    const f = st.f;
    st.surface.forEachInRadius(uv.u, uv.v, radius, (x, y, w) => {
      const i = y * st.W + x;
      const frozen = f.frozen[i] > 0.3;
      f.gum[i] -= f.gum[i] * (frozen ? 0.22 : 0.02) * w;
      if (!frozen && f.gum[i] > 0.2) f.shrink[i] += 0.0006 * w;
      if (f.wax[i] > 0.3) f.wax[i] -= (f.wax[i] - 0.3) * (frozen ? 0.25 : 0.12) * w;
      f.mud[i] -= f.mud[i] * 0.06 * w;
      if (f.solv[i] > 0.2) f.paint[i] -= f.paint[i] * 0.07 * w;
      else f.paint[i] -= f.paint[i] * 0.008 * w;
      st.active[i] = 1;
      this.syncCell(st, i);
    });
  }

  iron(carpet, uv, radius, dots, dt) {
    const st = this.rugs.get(carpet);
    if (!st) return;
    const f = st.f, fb = st.fiber;
    st.surface.forEachInRadius(uv.u, uv.v, radius, (x, y, w) => {
      const i = y * st.W + x;
      f.wax[i] -= f.wax[i] * 0.9 * dots * dt * w;
      f.water[i] = Math.max(0, f.water[i] - 0.25 * dots * dt * w);
      if (dots > fb.ironMax) f.burn[i] += 1.0 * (dots - fb.ironMax) * dt * w;
      if (f.burn[i] > 0.3) st.alertDmg = 'burn';
      if (f.gum[i] > 0.1) f.gum[i] = Math.min(1, f.gum[i] + 0.02 * dt * w);
      f.frozen[i] = 0;
      st.active[i] = 1;
      this.syncCell(st, i);
    });
    st.surface.stamp('nap.crush', uv.u, uv.v, radius, 0.4 * dt, 'add');
  }

  fixedUpdate(dt) {
    const t0 = performance.now();
    for (const st of this.rugs.values()) {
      const k = st.slice ?? 0;
      if (k === 0) {
        st.time += SLICES * dt;
        if (this.dryBoostFn) st.dryBoost = this.dryBoostFn(st.carpet, st);
      }
      this.tick(st, SLICES * dt, Math.floor((k * st.N) / SLICES), Math.floor(((k + 1) * st.N) / SLICES));
      st.slice = (k + 1) % SLICES;
      this.alerts(st);
      const ro = st.runoff;
      if (ro.liters > 0.02) {
        this.onRunoff?.(st.carpet, ro.liters, ro.dirt / ro.liters, ro.soap / ro.liters, ro.u, ro.v);
        ro.liters = 0; ro.dirt = 0; ro.soap = 0;
      }
    }
    const ms = performance.now() - t0;
    this.stats.tickMs += (ms - this.stats.tickMs) * 0.1;
  }

  alerts(st) {
    const now = st.time;
    const name = { persian: 'wool', silk: 'silk', sisal: 'sisal', kilim: 'cotton', shag: 'shag', cut: 'rug', loop: 'carpet' }[st.type] ?? 'rug';
    if (st.alertDmg && now - (st.lastDmgAlert ?? -99) > 8) {
      const msg = {
        bleach: st.type === 'sisal' ? 'Water marks on the sisal! Keep it dry.' : `The ${name} is going pale! Wrong product for this rug.`,
        bleed: st.type === 'sisal' ? 'The sisal is browning! It hates water.' : 'Colours are running! Too much alkali or water for this rug.',
        shrink: `The ${name} fibres are felting and twisting. Go gentler!`,
        burn: `Scorch! The iron is too hot for ${name}.`,
      }[st.alertDmg];
      this.onHint?.(msg, st.carpet, true);
      st.lastDmgAlert = now;
    }
    st.alertDmg = null;
    if (st.alertDamp && now - (st.lastDampAlert ?? -99) > 30) {
      this.onHint?.('This rug has been soaking for a minute. Squeegee and dry it soon or it will go mouldy.', st.carpet, false);
      st.lastDampAlert = now;
    }
    st.alertDamp = false;
  }

  update() {
    for (const st of this.rugs.values()) {
      if (st.vis) {
        this.touch(st);
        st.vis = false;
      }
      st.surface.upload();
    }
  }

  tick(st, dt, i0 = 0, i1 = st.N) {
    const f = st.f, fb = st.fiber;
    const boost = st.dryBoost;
    const baseDry = 0.006 * fb.dryRate * (1 + st.hanging * 1.2);
    const W = st.W, H = st.H, active = st.active;
    const water = f.water, gel = f.gel, agit = f.agit, fix = f.fix, ox = f.ox, wine = f.wine, coffee = f.coffee, urine = f.urine;
    const mold = f.mold, sticky = f.sticky, bleach = f.bleach, bleed = f.bleed, enz = f.enz, tannin = f.tannin, reducer = f.reducer;
    const chlor = f.chlor, shrink = f.shrink, alk = f.alk, solv = f.solv, grease = f.grease, paint = f.paint, gum = f.gum, wax = f.wax;
    const absorb = f.absorb, powder = f.powder, oil = f.oil, dryc = f.dryc, fungi = f.fungi, acid = f.acid, cold = f.cold, frozen = f.frozen;
    const foam = f.foam, wetT = f.wetT, susp = f.susp, dust = f.dust;
    const oxTol = fb.oxTol, enzTol = fb.enzTol, chlorTol = fb.chlorTol, alkTol = fb.alkTol, solvTol = fb.solvTol, waterTol = fb.waterTol;
    const browning = fb.browning, bleedAlk = fb.bleedAlk, bleedWet = fb.bleedWet, waterMarks = fb.waterMarks;
    const protein = st.type === 'persian' || st.type === 'silk';
    const silk = st.type === 'silk';
    const agitDecay = Math.min(1, 1.5 * dt);
    const moldK = 0.003 * dt * (browning ? 2 : 1);
    for (let i = i0; i < i1; i++) {
      if (!active[i]) continue;
      const wet = water[i];
      const m = 1 + 3 * agit[i];
      const fixK = 1 / (1 + 6 * fix[i]);
      if (wet > 0.15 && gel[i] > 0) gel[i] -= gel[i] * 0.22 * dt * (wet < 1 ? wet : 1);
      const liq = wet + gel[i] * 0.8 + foam[i] * 0.15;
      if (liq > 0.05) {
        const o = ox[i];
        if (o > 0.001) {
          const r = o * 0.06 * m * dt;
          wine[i] -= wine[i] * r;
          coffee[i] -= coffee[i] * r * 0.7;
          urine[i] -= urine[i] * r * 0.25;
          mold[i] -= mold[i] * r * 0.4;
          sticky[i] -= sticky[i] * r * 0.2;
          ox[i] = o - o * 0.02 * dt;
          const ex = o - oxTol;
          if (ex > 0) {
            bleach[i] += ex * 0.05 * dt;
            if (browning) bleed[i] += ex * browning * 0.01 * dt;
          }
        }
        const e = enz[i];
        if (e > 0.001) {
          urine[i] -= urine[i] * e * 0.05 * dt;
          enz[i] = e - e * 0.01 * dt;
          if (enzTol < 0.5) bleach[i] += e * (0.5 - enzTol) * 0.05 * dt;
        }
        const tn = tannin[i];
        if (tn > 0.001) {
          coffee[i] -= coffee[i] * tn * 0.09 * m * dt;
          wine[i] -= wine[i] * tn * 0.03 * m * dt;
          tannin[i] = tn - tn * 0.02 * dt;
        }
        const rd = reducer[i];
        if (rd > 0.001) {
          wine[i] -= wine[i] * rd * 0.15 * dt;
          coffee[i] -= coffee[i] * rd * 0.05 * dt;
          bleach[i] += rd * (protein ? 0.06 : 0.03) * dt;
          reducer[i] = rd - rd * 0.03 * dt;
        }
        const ch = chlor[i];
        if (ch > 0.001) {
          const r = 1 - ch * 0.25 * dt;
          wine[i] *= r; coffee[i] *= r; urine[i] *= r; mold[i] *= r; sticky[i] *= r;
          if (ch > chlorTol) bleach[i] += (ch - chlorTol) * 0.6 * dt;
          if (enzTol === 0) shrink[i] += ch * 0.25 * dt;
          chlor[i] = ch - ch * 0.03 * dt;
        }
        const exA = alk[i] - alkTol;
        if (exA > 0) {
          bleed[i] += exA * bleedAlk * 0.12 * dt * fixK;
          if (silk) bleach[i] += exA * 0.1 * dt;
          if (browning) bleed[i] += exA * 0.02 * dt;
        }
        const exW = wet - waterTol;
        if (exW > 0) {
          if (waterMarks) bleach[i] += exW * 0.08 * waterMarks * dt;
          bleed[i] += exW * bleedWet * 0.02 * dt * fixK;
        }
        if (bleedWet > 0.3 && wet > 0.7) bleed[i] += (wet - 0.7) * bleedWet * 0.006 * dt * fixK;
      }
      const sv = solv[i];
      if (sv > 0.001) {
        grease[i] -= grease[i] * sv * 0.08 * m * dt;
        paint[i] -= paint[i] * sv * 0.035 * m * dt;
        gum[i] -= gum[i] * sv * 0.02 * m * dt;
        wax[i] -= wax[i] * sv * 0.025 * dt;
        solv[i] = sv - sv * 0.05 * dt;
        if (sv > solvTol) bleed[i] += (sv - solvTol) * 0.03 * dt * fixK;
      }
      const ab = absorb[i];
      if (ab > 0.01 && powder[i] > 0.04) {
        const t = grease[i] * ab * 0.06 * dt;
        grease[i] -= t;
        oil[i] += t;
        wine[i] -= wine[i] * ab * 0.006 * dt;
        urine[i] -= urine[i] * ab * 0.004 * dt;
      }
      if (browning && dryc[i] > 0.05 && powder[i] > 0.05) bleed[i] += dryc[i] * 0.0003 * dt;
      const fu = fungi[i];
      if (fu > 0.001) {
        mold[i] -= mold[i] * fu * 0.04 * dt;
        fungi[i] = fu - fu * 0.005 * dt;
      }
      const ac = acid[i];
      if (ac > 0.001) {
        const n = (ac < alk[i] ? ac : alk[i]) * 0.6 * dt;
        alk[i] -= n;
        acid[i] = ac - n - ac * 0.01 * dt;
        coffee[i] -= coffee[i] * ac * 0.006 * dt;
        fix[i] += ac * 0.002 * dt;
      }
      const cd = cold[i];
      if (cd > 0.001) {
        const fz = cd * 2 > 1 ? 1 : cd * 2;
        if (fz > frozen[i]) frozen[i] = fz;
        cold[i] = cd - cd * 0.5 * dt;
      }
      if (frozen[i] > 0) frozen[i] = frozen[i] > 0.06 * dt ? frozen[i] - 0.06 * dt : 0;
      agit[i] -= agit[i] * agitDecay;
      if (wet > 0) {
        let rate = baseDry;
        if (boost) rate *= 1 + boost(((i % W) + 0.5) / W, (((i / W) | 0) + 0.5) / H);
        const nw = wet - rate * dt;
        water[i] = nw > 0 ? nw : 0;
      }
      if (foam[i] > 0) {
        const nf = foam[i] - (0.003 + (wet < 0.2 ? 0.02 : 0)) * dt;
        foam[i] = nf > 0 ? nf : 0;
      }
      if (wet > 0.45) wetT[i] += dt;
      else if (wetT[i] > 0) wetT[i] = wetT[i] > dt * 0.5 ? wetT[i] - dt * 0.5 : 0;
      if (wetT[i] > 90 && fungi[i] < 0.1 && mold[i] < 1) mold[i] += moldK;
      if (browning && wetT[i] > 25) bleed[i] += browning * 0.004 * dt;
      if (wet < 0.06 && susp[i] > 0.001) {
        const back = susp[i] * 0.5;
        dust[i] = Math.min(1.2, dust[i] + back * 0.6);
        sticky[i] = Math.min(1, sticky[i] + back * 0.2);
        susp[i] -= back;
      }
      if (!st.alertDmg && (bleach[i] > 0.3 || bleed[i] > 0.3 || shrink[i] > 0.3)) st.alertDmg = bleach[i] > 0.3 ? 'bleach' : bleed[i] > 0.3 ? 'bleed' : 'shrink';
      if (wetT[i] > 55 && fungi[i] < 0.1 && mold[i] < 0.05) st.alertDamp = true;
      if (bleed[i] > 1) bleed[i] = 1;
      if (bleach[i] > 1) bleach[i] = 1;
      if (shrink[i] > 1) shrink[i] = 1;
      const live = water[i] > 0.001 || foam[i] > 0.001 || frozen[i] > 0 || agit[i] > 0.01 || gel[i] > 0.001 || wetT[i] > 0 ||
        ox[i] + enz[i] + tannin[i] + reducer[i] + chlor[i] + solv[i] + fungi[i] + acid[i] + cold[i] + absorb[i] * grease[i] > 0.001;
      this.syncCell(st, i);
      if (!live) active[i] = 0;
    }
  }

  touch(st) {
    const d = st.surface.dirty;
    d.add('dirt0'); d.add('dirt1'); d.add('dirt2'); d.add('layer'); d.add('tintGel'); d.add('tintPowder'); d.add('damage');
  }

  syncCell(st, i) {
    st.vis = true;
    const s = st.surface.data, f = st.f, o = i * 4;
    s.dirt0[o] = b8(f.dust[i]); s.dirt0[o + 1] = b8(f.hair[i]); s.dirt0[o + 2] = b8(f.mud[i]); s.dirt0[o + 3] = b8(f.sticky[i]);
    s.dirt1[o] = b8(f.wine[i]); s.dirt1[o + 1] = b8(f.coffee[i]); s.dirt1[o + 2] = b8(f.grease[i] + (f.powder[i] < 0.05 ? f.oil[i] : 0)); s.dirt1[o + 3] = b8(f.urine[i]);
    s.dirt2[o] = b8(f.gum[i]); s.dirt2[o + 1] = b8(f.wax[i]); s.dirt2[o + 2] = b8(f.paint[i]); s.dirt2[o + 3] = b8(f.mold[i]);
    const foam = f.foam[i], water = f.water[i], pw = f.powder[i], susp = f.susp[i];
    s.layer[o] = b8(water * 0.8); s.layer[o + 1] = b8(pw); s.layer[o + 2] = b8(f.gel[i]); s.layer[o + 3] = b8(foam * 0.8333);
    s.tintGel[o] = b8(f.gelR[i]); s.tintGel[o + 1] = b8(f.gelG[i]); s.tintGel[o + 2] = b8(f.gelB[i]);
    s.tintGel[o + 3] = foam > 0.01 ? b8((susp * 2.2) / (foam + 0.25)) : 0;
    const dp = pw > 0.02 ? Math.min(0.75, f.oil[i] / (pw + 0.1)) : 0;
    s.tintPowder[o] = b8(f.powR[i] * (1 - dp) + 0.35 * dp);
    s.tintPowder[o + 1] = b8(f.powG[i] * (1 - dp) + 0.3 * dp);
    s.tintPowder[o + 2] = b8(f.powB[i] * (1 - dp) + 0.25 * dp);
    s.tintPowder[o + 3] = water > 0.02 ? b8((susp * 2.5) / (water + 0.2)) : 0;
    s.damage[o] = b8(f.bleed[i]); s.damage[o + 1] = b8(f.bleach[i]); s.damage[o + 2] = b8(f.shrink[i]); s.damage[o + 3] = b8(f.burn[i]);
  }

  evaluate(carpet) {
    const st = this.rugs.get(carpet);
    if (!st) return null;
    const f = st.f, N = st.N;
    let res = 0, dmg = 0, peak = 0, wet = 0, wetHi = 0, lumps = 0;
    const per = {};
    for (const d of DIRT) {
      let s = 0;
      const a = f[d];
      for (let i = 0; i < N; i++) s += a[i];
      per[d] = s / N;
    }
    for (let i = 0; i < N; i++) {
      res += f.gel[i] + f.surf[i] * 0.35 + f.encap[i] * 0.3 + f.powder[i] + f.foam[i] * 0.5 + f.oil[i] + f.susp[i];
      const dm = f.bleed[i] + f.bleach[i] + f.shrink[i] * 0.8 + f.burn[i] * 1.5;
      dmg += dm;
      if (dm > 0.5) peak++;
      wet += f.water[i];
      if (f.water[i] > 0.4) wetHi++;
      if (f.gum[i] > 0.4 || f.wax[i] > 0.45 || f.paint[i] > 0.4) lumps++;
    }
    let dirt = 0;
    for (const d of DIRT) dirt += per[d] * DIRT_W[d];
    const clean = st.initialDirt > 0.002 ? Math.max(0, Math.min(1, 1 - dirt / st.initialDirt)) : Math.max(0, 1 - dirt * 10);
    const r = {
      clean,
      dirt,
      residue: res / N,
      damage: dmg / N,
      damagePeak: peak / N,
      wet: wet / N,
      wetHigh: wetHi / N,
      lumps: lumps / N,
      per,
    };
    r.dryEnough = r.wet < 0.12 && r.wetHigh < 0.05;
    r.ruined = r.damage > 0.06 || r.damagePeak > 0.1;
    const score = clean * (1 - Math.min(1, r.residue * 2.5) * 0.35) * (1 - Math.min(1, r.damage * 6)) * (1 - Math.min(0.7, r.damagePeak * 8)) * (r.lumps > 0.002 ? 0.8 : 1);
    r.score = Math.max(0, score);
    let grade = r.ruined ? 'F' : score > 0.93 ? 'A+' : score > 0.85 ? 'A' : score > 0.72 ? 'B' : score > 0.55 ? 'C' : score > 0.35 ? 'D' : 'E';
    const order = ['A+', 'A', 'B', 'C', 'D', 'E', 'F'];
    const cap = r.damagePeak > 0.04 ? 'D' : r.damagePeak > 0.01 ? 'C' : null;
    if (cap && order.indexOf(grade) < order.indexOf(cap)) grade = cap;
    r.grade = grade;
    return r;
  }

  price(carpet, ev = this.evaluate(carpet)) {
    const t = CARPET_TYPES[carpet.type];
    const area = carpet.width * carpet.length;
    const base = t.basePrice * (0.6 + area * 0.12);
    if (ev.ruined) return -Math.round(base * 1.5);
    return Math.round(base * (0.15 + 0.85 * ev.score * ev.score));
  }
}
