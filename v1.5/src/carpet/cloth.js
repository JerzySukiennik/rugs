// Rug Rush rug cloth: small-step XPBD grid with bending, floor and collider contacts with friction, pushers, grab handles and roll attachment.
export class Cloth {
  constructor(nx, ny, width, length) {
    this.nx = nx;
    this.ny = ny;
    this.n = nx * ny;
    this.width = width;
    this.length = length;
    this.du = width / (nx - 1);
    this.dv = length / (ny - 1);
    this.x = new Float64Array(this.n * 3);
    this.p = new Float64Array(this.n * 3);
    this.v = new Float64Array(this.n * 3);
    this.prevStep = new Float64Array(this.n * 3);
    this.active = new Uint8Array(this.n);
    this.contact = new Uint8Array(this.n);
    const ci = [], rest = [], kind = [];
    const add = (a, b, r, k) => { ci.push(a, b); rest.push(r); kind.push(k); };
    const id = (i, j) => j * nx + i;
    const dd = Math.hypot(this.du, this.dv);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      if (i + 1 < nx) add(id(i, j), id(i + 1, j), this.du, 0);
      if (j + 1 < ny) add(id(i, j), id(i, j + 1), this.dv, 0);
    }
    for (let j = 0; j + 1 < ny; j++) for (let i = 0; i + 1 < nx; i++) {
      if ((i + j) % 2 === 0) add(id(i, j), id(i + 1, j + 1), dd, 1);
      else add(id(i + 1, j), id(i, j + 1), dd, 1);
    }
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      if (i + 2 < nx) add(id(i, j), id(i + 2, j), this.du * 2, 2);
      if (j + 2 < ny) add(id(i, j), id(i, j + 2), this.dv * 2, 2);
    }
    this.ci = new Int32Array(ci);
    this.rest = new Float64Array(rest);
    this.kind = new Uint8Array(kind);
    this.nc = rest.length;
    this.alpha = new Float64Array(this.nc);
    this.alphaKey = '';
    this.compliance = [0, 2e-7, 1e-4];
    this.friction = 0.85;
    this.damping = 0.9;
    this.radius = 0.0025;
    this.gravity = -9.81;
    this.substeps = 4;
    this.handles = [];
    this.attach = null;
    this.reaction = [0, 0, 0];
    this.reactionPoint = [0, 0, 0];
    this.maxMove = 0;
    this.selfThick = 0;
    this.maxSpeed = 7;
    this.qHead = new Int32Array(4096);
    this.qNext = new Int32Array((nx - 1) * (ny - 1));
    this.qStamp = new Int32Array((nx - 1) * (ny - 1));
    this.stampId = 0;
  }

  setRow(j, on) {
    for (let i = 0; i < this.nx; i++) this.active[j * this.nx + i] = on ? 1 : 0;
  }

  place(i, x, y, z, vx = 0, vy = 0, vz = 0) {
    const k = i * 3;
    this.x[k] = x; this.x[k + 1] = y; this.x[k + 2] = z;
    this.p[k] = x; this.p[k + 1] = y; this.p[k + 2] = z;
    this.prevStep[k] = x; this.prevStep[k + 1] = y; this.prevStep[k + 2] = z;
    this.v[k] = vx; this.v[k + 1] = vy; this.v[k + 2] = vz;
  }

  step(dt, ctx) {
    const { x, p, v, active, contact } = this;
    const n = this.n;
    this.prevStep.set(x);
    const ns = this.substeps;
    const h = dt / ns;
    const g = this.gravity * h;
    const damp = Math.max(0, 1 - (this.damping + (this.maxMove < 0.0015 ? 4 : 0)) * h);
    const ci = this.ci, rest = this.rest, kind = this.kind;
    const key = this.compliance.join(',') + ':' + ns;
    if (key !== this.alphaKey) {
      this.alphaKey = key;
      const a = [this.compliance[0] / (h * h), this.compliance[1] / (h * h), this.compliance[2] / (h * h)];
      for (let c = 0; c < this.nc; c++) this.alpha[c] = 1 / (2 + a[kind[c]]);
    }
    const inv = this.alpha;
    let allActive = true;
    for (let i = 0; i < n; i++) if (!active[i]) { allActive = false; break; }
    const floor = ctx.floor;
    const r = this.radius;
    const mu = this.friction;
    const shapes = ctx.shapes || [];
    const pushers = ctx.pushers || [];
    const handles = this.handles;
    const att = this.attach;
    let rx = 0, ry = 0, rz = 0;
    let maxMove = 0;
    const held = this.heldMask ?? (this.heldMask = new Uint8Array(n));
    held.fill(0);
    for (const hd of handles) if (hd.target) for (const i of hd.idx) held[i] = 1;
    for (let s = 0; s < ns; s++) {
      for (let i = 0; i < n; i++) {
        if (!active[i]) continue;
        const k = i * 3;
        v[k] *= damp; v[k + 1] = v[k + 1] * damp + g; v[k + 2] *= damp;
        p[k] = x[k]; p[k + 1] = x[k + 1]; p[k + 2] = x[k + 2];
        x[k] += v[k] * h; x[k + 1] += v[k + 1] * h; x[k + 2] += v[k + 2] * h;
      }
      const nc = this.nc;
      for (let c = 0; c < nc; c++) {
        const ia = ci[c * 2], ib = ci[c * 2 + 1];
        if (!allActive && (active[ia] & active[ib]) === 0) continue;
        const ka = ia * 3, kb = ib * 3;
        const dx = x[kb] - x[ka], dy = x[kb + 1] - x[ka + 1], dz = x[kb + 2] - x[ka + 2];
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < 1e-18) continue;
        const d = Math.sqrt(d2);
        let C = d - rest[c];
        if (C > 0 && kind[c] === 2) C *= 0.5;
        const f = -C * inv[c] / d;
        x[ka] -= dx * f; x[ka + 1] -= dy * f; x[ka + 2] -= dz * f;
        x[kb] += dx * f; x[kb + 1] += dy * f; x[kb + 2] += dz * f;
      }
      if (att) {
        const ap = att.points, fi = att.free, fr = att.rest, cols = att.cols;
        for (let c = 0; c < cols; c++) {
          const i = fi[c];
          if (i < 0 || !active[i]) continue;
          const k = i * 3;
          for (let pass = 0; pass < 2; pass++) {
            const o = pass === 0 ? c * 3 : (cols + c) * 3;
            const restL = pass === 0 ? fr[c] : fr[c] + att.back;
            const stiff = pass === 0 ? 1 : att.backStiff;
            const dx = x[k] - ap[o], dy = x[k + 1] - ap[o + 1], dz = x[k + 2] - ap[o + 2];
            const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (d < 1e-9) continue;
            let C = d - restL;
            if (C < 0) C *= 0.35;
            const f = (C / d) * stiff;
            x[k] -= dx * f; x[k + 1] -= dy * f; x[k + 2] -= dz * f;
            if (pass === 0 && s === ns - 1 && C > 0) { rx += dx * f; ry += dy * f; rz += dz * f; }
          }
          const i2 = att.free2[c];
          if (i2 >= 0 && active[i2]) {
            const k2 = i2 * 3;
            const dx = x[k2] - ap[c * 3], dy = x[k2 + 1] - ap[c * 3 + 1], dz = x[k2 + 2] - ap[c * 3 + 2];
            const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (d > 1e-9) {
              let C = d - (fr[c] + this.dv);
              if (C > 0) C *= 0.5;
              const f = (C / d) * att.bendStiff;
              x[k2] -= dx * f; x[k2 + 1] -= dy * f; x[k2 + 2] -= dz * f;
            }
          }
        }
      }
      for (const hd of handles) {
        let px = 0, py = 0, pz = 0, ws = 0, w2 = 0;
        let ok = true;
        for (let q = 0; q < hd.idx.length; q++) {
          const i = hd.idx[q];
          if (!active[i]) { ok = false; break; }
          const w = hd.w[q];
          px += x[i * 3] * w; py += x[i * 3 + 1] * w; pz += x[i * 3 + 2] * w;
          ws += w; w2 += w * w;
        }
        if (!ok || ws <= 0 || !hd.target) continue;
        px /= ws; py /= ws; pz /= ws;
        let cx = hd.target.x - px, cy = hd.target.y - py, cz = hd.target.z - pz;
        const cl = Math.sqrt(cx * cx + cy * cy + cz * cz);
        const lim = hd.maxStep * h;
        if (cl > lim) { cx *= lim / cl; cy *= lim / cl; cz *= lim / cl; }
        const ks = 1 - Math.pow(1 - Math.min(0.999, hd.k), 1 / ns);
        for (let q = 0; q < hd.idx.length; q++) {
          const i = hd.idx[q];
          const f = (hd.w[q] * ws / w2) * ks;
          x[i * 3] += cx * f; x[i * 3 + 1] += cy * f; x[i * 3 + 2] += cz * f;
        }
        if (hd.tether) this.tether(hd, h);
      }
      for (let i = 0; i < n; i++) {
        if (!active[i]) continue;
        const k = i * 3;
        let X = x[k], Y = x[k + 1], Z = x[k + 2];
        let touched = 0;
        let nxv = 0, nyv = 0, nzv = 0, pen = 0, svx = 0, svy = 0, svz = 0;
        for (let q = 0; q < pushers.length; q++) {
          const ps = pushers[q];
          if (X < ps.minX || X > ps.maxX || Y < ps.minY || Y > ps.maxY || Z < ps.minZ || Z > ps.maxZ) continue;
          const abx = ps.bx - ps.ax, aby = ps.by - ps.ay, abz = ps.bz - ps.az;
          const ll = abx * abx + aby * aby + abz * abz;
          let t = ll > 1e-12 ? ((X - ps.ax) * abx + (Y - ps.ay) * aby + (Z - ps.az) * abz) / ll : 0;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const qx = X - (ps.ax + abx * t), qy = Y - (ps.ay + aby * t), qz = Z - (ps.az + abz * t);
          const d = Math.sqrt(qx * qx + qy * qy + qz * qz);
          const rr = ps.r + r;
          if (d < rr && d > 1e-6) {
            const m = (rr - d) / d;
            X += qx * m; Y += qy * m; Z += qz * m;
          }
        }
        for (let q = 0; q < shapes.length; q++) {
          const sh = shapes[q];
          if (X < sh.minX || X > sh.maxX || Y < sh.minY || Y > sh.maxY || Z < sh.minZ || Z > sh.maxZ) continue;
          const m = sh.m;
          const ox = X - sh.cx, oy = Y - sh.cy, oz = Z - sh.cz;
          const lx = m[0] * ox + m[1] * oy + m[2] * oz;
          const ly = m[3] * ox + m[4] * oy + m[5] * oz;
          const lz = m[6] * ox + m[7] * oy + m[8] * oz;
          let d, gx, gy, gz;
          if (sh.type === 0) {
            d = Math.sqrt(lx * lx + ly * ly + lz * lz);
            if (d < 1e-9) { gx = 0; gy = 1; gz = 0; } else { gx = lx / d; gy = ly / d; gz = lz / d; }
            d -= sh.r;
          } else if (sh.type === 1) {
            const cy = ly < -sh.hh ? -sh.hh : ly > sh.hh ? sh.hh : ly;
            const qx = lx, qy = ly - cy, qz = lz;
            d = Math.sqrt(qx * qx + qy * qy + qz * qz);
            if (d < 1e-9) { gx = 0; gy = 1; gz = 0; } else { gx = qx / d; gy = qy / d; gz = qz / d; }
            d -= sh.r;
          } else if (sh.type === 2) {
            const rl = Math.sqrt(lx * lx + lz * lz);
            const dr = rl - sh.r, da = Math.abs(ly) - sh.hh;
            const rnx = rl > 1e-9 ? lx / rl : 1, rnz = rl > 1e-9 ? lz / rl : 0;
            if (dr > 0 && da > 0) {
              d = Math.sqrt(dr * dr + da * da);
              gx = rnx * dr / d; gy = Math.sign(ly) * da / d; gz = rnz * dr / d;
            } else if (dr > da) { d = dr; gx = rnx; gy = 0; gz = rnz; }
            else { d = da; gx = 0; gy = Math.sign(ly) || 1; gz = 0; }
          } else {
            const qx = Math.abs(lx) - sh.hx, qy = Math.abs(ly) - sh.hy, qz = Math.abs(lz) - sh.hz;
            if (qx > 0 || qy > 0 || qz > 0) {
              const ex = qx > 0 ? qx : 0, ey = qy > 0 ? qy : 0, ez = qz > 0 ? qz : 0;
              d = Math.sqrt(ex * ex + ey * ey + ez * ez);
              gx = Math.sign(lx) * ex / d; gy = Math.sign(ly) * ey / d; gz = Math.sign(lz) * ez / d;
            } else if (qx > qy && qx > qz) { d = qx; gx = Math.sign(lx) || 1; gy = 0; gz = 0; }
            else if (qy > qz) { d = qy; gx = 0; gy = Math.sign(ly) || 1; gz = 0; }
            else { d = qz; gx = 0; gy = 0; gz = Math.sign(lz) || 1; }
          }
          if (d < r) {
            const wx = m[0] * gx + m[3] * gy + m[6] * gz;
            const wy = m[1] * gx + m[4] * gy + m[7] * gz;
            const wz = m[2] * gx + m[5] * gy + m[8] * gz;
            const push = r - d;
            X += wx * push; Y += wy * push; Z += wz * push;
            if (push > pen) { pen = push; nxv = wx; nyv = wy; nzv = wz; svx = sh.vx; svy = sh.vy; svz = sh.vz; }
            touched = 2;
          }
        }
        const fy = floor(X, Z) + r;
        if (Y < fy) {
          const push = fy - Y;
          Y = fy;
          if (push > pen) { pen = push; nxv = 0; nyv = 1; nzv = 0; svx = 0; svy = 0; svz = 0; }
          touched = touched || 1;
        }
        if (touched && !held[i]) {
          let dx = X - p[k] - svx * h, dy = Y - p[k + 1] - svy * h, dz = Z - p[k + 2] - svz * h;
          const dn = dx * nxv + dy * nyv + dz * nzv;
          dx -= nxv * dn; dy -= nyv * dn; dz -= nzv * dn;
          const dtl = Math.sqrt(dx * dx + dy * dy + dz * dz);
          const lim = mu * (touched === 2 ? pen * 4 + 0.0003 : pen + 0.00004);
          if (dtl < lim) { X -= dx; Y -= dy; Z -= dz; }
          else if (dtl > 1e-12) { const f = lim / dtl; X -= dx * f; Y -= dy * f; Z -= dz * f; }
        }
        contact[i] = touched;
        x[k] = X; x[k + 1] = Y; x[k + 2] = Z;
      }
      if (s === ns - 1 && this.selfThick > 0) this.selfCollide(floor);
      const ih = 1 / h;
      const vm2 = this.maxSpeed * this.maxSpeed;
      for (let i = 0; i < n; i++) {
        if (!active[i]) continue;
        const k = i * 3;
        let vx = (x[k] - p[k]) * ih, vy = (x[k + 1] - p[k + 1]) * ih, vz = (x[k + 2] - p[k + 2]) * ih;
        const s2 = vx * vx + vy * vy + vz * vz;
        if (s2 > vm2) { const f = this.maxSpeed / Math.sqrt(s2); vx *= f; vy *= f; vz *= f; }
        v[k] = vx; v[k + 1] = vy; v[k + 2] = vz;
      }
    }
    const ps = this.prevStep;
    for (let i = 0; i < n; i++) {
      if (!active[i]) continue;
      const k = i * 3;
      const dx = x[k] - ps[k], dy = x[k + 1] - ps[k + 1], dz = x[k + 2] - ps[k + 2];
      const m2 = dx * dx + dy * dy + dz * dz;
      if (m2 > maxMove) maxMove = m2;
    }
    this.maxMove = Math.sqrt(maxMove);
    this.reaction[0] = rx; this.reaction[1] = ry; this.reaction[2] = rz;
  }

  tether(hd, h) {
    const { nx, ny, x, active, du, dv } = this;
    let gi = 0, gj = 0, ws = 0;
    for (let q = 0; q < hd.idx.length; q++) {
      const i = hd.idx[q], w = hd.w[q];
      gi += (i % nx) * w; gj += Math.floor(i / nx) * w;
      ws += w;
    }
    if (ws <= 0) return;
    gi /= ws; gj /= ws;
    const px = hd.target.x, py = hd.target.y, pz = hd.target.z;
    const st = hd.tether, lim = (hd.maxStep ?? 7) * h;
    for (let j = 0; j < ny; j++) {
      const dj = (j - gj) * dv;
      for (let i = 0; i < nx; i++) {
        const id = j * nx + i;
        if (!active[id]) continue;
        const di = (i - gi) * du;
        const rd = Math.sqrt(di * di + dj * dj) * 1.02 + 0.03;
        const k = id * 3;
        const dx = x[k] - px, dy = x[k + 1] - py, dz = x[k + 2] - pz;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d <= rd) continue;
        const m = Math.min((d - rd) * st, lim) / d;
        x[k] -= dx * m; x[k + 1] -= dy * m; x[k + 2] -= dz * m;
      }
    }
  }

  selfCollide(floor) {
    const { nx, ny, x, active } = this;
    const P = this.prevStep;
    const sep = this.selfThick;
    const cs = Math.max(this.du, this.dv) * 1.6;
    const inv = 1 / cs;
    const head = this.qHead, next = this.qNext, stamp = this.qStamp;
    const qx = nx - 1;
    head.fill(-1);
    if (this.stampId > 1e9) { this.stampId = 0; stamp.fill(0); }
    let minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < this.n; i++) {
      if (!active[i]) continue;
      const y = x[i * 3 + 1];
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    if (maxY - minY < sep * 1.2) return;
    const hk = (a, b, c) => ((a * 73856093) ^ (b * 19349663) ^ (c * 83492791)) & 4095;
    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < qx; i++) {
      const q = j * qx + i;
      const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
      if (!(active[a] & active[b] & active[c] & active[d])) { next[q] = -2; continue; }
      const cx = (x[a * 3] + x[b * 3] + x[c * 3] + x[d * 3]) * 0.25;
      const cy = (x[a * 3 + 1] + x[b * 3 + 1] + x[c * 3 + 1] + x[d * 3 + 1]) * 0.25;
      const cz = (x[a * 3 + 2] + x[b * 3 + 2] + x[c * 3 + 2] + x[d * 3 + 2]) * 0.25;
      const h = hk(Math.floor(cx * inv), Math.floor(cy * inv), Math.floor(cz * inv));
      next[q] = head[h];
      head[h] = q;
    }
    const held = this.heldMask;
    let moved = false;
    for (let pj = 0; pj < ny; pj++) for (let pi = 0; pi < nx; pi++) {
      const ip = pj * nx + pi;
      if (!active[ip]) continue;
      const kp = ip * 3;
      const gx = Math.floor(x[kp] * inv), gy = Math.floor(x[kp + 1] * inv), gz = Math.floor(x[kp + 2] * inv);
      const sid = ++this.stampId;
      for (let oz = -1; oz <= 1; oz++) for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        for (let q = head[hk(gx + ox, gy + oy, gz + oz)]; q >= 0; q = next[q]) {
          if (stamp[q] === sid) continue;
          stamp[q] = sid;
          const qi = q % qx, qj = (q - qi) / qx;
          if (pi >= qi - 2 && pi <= qi + 3 && pj >= qj - 2 && pj <= qj + 3) continue;
          const a0 = qj * nx + qi;
          for (let t = 0; t < 2; t++) {
            const ia = t === 0 ? a0 : a0 + 1, ib = t === 0 ? a0 + 1 : a0 + nx + 1, ic = a0 + nx;
            const ka = ia * 3, kb = ib * 3, kc = ic * 3;
            const e1x = x[kb] - x[ka], e1y = x[kb + 1] - x[ka + 1], e1z = x[kb + 2] - x[ka + 2];
            const e2x = x[kc] - x[ka], e2y = x[kc + 1] - x[ka + 1], e2z = x[kc + 2] - x[ka + 2];
            let nX = e1y * e2z - e1z * e2y, nY = e1z * e2x - e1x * e2z, nZ = e1x * e2y - e1y * e2x;
            const nl = Math.sqrt(nX * nX + nY * nY + nZ * nZ);
            if (nl < 1e-9) continue;
            nX /= nl; nY /= nl; nZ /= nl;
            const wx = x[kp] - x[ka], wy = x[kp + 1] - x[ka + 1], wz = x[kp + 2] - x[ka + 2];
            const dist = wx * nX + wy * nY + wz * nZ;
            if (dist > sep * 4 || dist < -sep * 4) continue;
            const px = wx - nX * dist, py = wy - nY * dist, pz = wz - nZ * dist;
            const d00 = e1x * e1x + e1y * e1y + e1z * e1z, d01 = e1x * e2x + e1y * e2y + e1z * e2z, d11 = e2x * e2x + e2y * e2y + e2z * e2z;
            const d20 = px * e1x + py * e1y + pz * e1z, d21 = px * e2x + py * e2y + pz * e2z;
            const den = d00 * d11 - d01 * d01;
            if (den < 1e-12) continue;
            const bv = (d11 * d20 - d01 * d21) / den, bw = (d00 * d21 - d01 * d20) / den, bu = 1 - bv - bw;
            if (bu < -0.04 || bv < -0.04 || bw < -0.04) continue;
            const pd = (P[kp] - P[ka]) * nX + (P[kp + 1] - P[ka + 1]) * nY + (P[kp + 2] - P[ka + 2]) * nZ;
            const side = pd > 1e-6 ? 1 : pd < -1e-6 ? -1 : dist >= 0 ? 1 : -1;
            let C = sep - side * dist;
            if (C <= 0) continue;
            if (C > sep * 3) C = sep * 3;
            const hp = held && held[ip] ? 0.15 : 1;
            const sw = bu * bu + bv * bv + bw * bw;
            const fp = C * 0.5 * side * hp, ft = C * 0.5 * side / sw;
            x[kp] += nX * fp; x[kp + 1] += nY * fp; x[kp + 2] += nZ * fp;
            x[ka] -= nX * ft * bu; x[ka + 1] -= nY * ft * bu; x[ka + 2] -= nZ * ft * bu;
            x[kb] -= nX * ft * bv; x[kb + 1] -= nY * ft * bv; x[kb + 2] -= nZ * ft * bv;
            x[kc] -= nX * ft * bw; x[kc + 1] -= nY * ft * bw; x[kc + 2] -= nZ * ft * bw;
            moved = true;
          }
        }
      }
    }
    if (!moved) return;
    const r = this.radius;
    for (let i = 0; i < this.n; i++) {
      if (!active[i]) continue;
      const k = i * 3;
      const fy = floor(x[k], x[k + 2]) + r;
      if (x[k + 1] < fy) x[k + 1] = fy;
    }
  }

  freeze() {
    this.prevStep.set(this.x);
    this.v.fill(0);
  }
}
