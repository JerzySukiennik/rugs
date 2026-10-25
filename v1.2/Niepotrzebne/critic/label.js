(async () => {
  const w = (ms) => new Promise((r) => setTimeout(r, ms));
  const log = { res: {} }; RR.report = () => log;
  const c = RR.debug.rugFlat('cut', 'M', 0, -3.5, 0, false); await w(700);
  // scan rays from above-front onto the rug end near the label (u 0..0.2, v 0.9..1.0+) and count label hits
  const hits = { label: 0, rug: 0, none: 0 }; let n = 0; const labelPts = [];
  const origin = (p) => ({ x: p.x, y: p.y + 0.9, z: p.z + 0.35 });
  for (let i = 0; i <= 40; i++) for (let j = 0; j <= 40; j++) {
    const u = i / 40 * 0.2, v = 0.9 + j / 40 * 0.12;
    const p = c.uvToWorld(Math.min(1, u), Math.min(1, v)).point;
    const o = origin(p);
    const d = { x: p.x - o.x, y: p.y - o.y, z: p.z - o.z }; const L = Math.hypot(d.x, d.y, d.z); d.x /= L; d.y /= L; d.z /= L;
    const h = RR.carpets.raycast(o, d, 3);
    n++;
    if (!h) hits.none++; else if (h.part === 'label') { hits.label++; labelPts.push([+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)]); } else hits.rug++;
  }
  log.res.scan = { samples: n, hits, labelFraction: +(hits.label / n).toFixed(3), labelBBox: labelPts.length ? [Math.min(...labelPts.map((q) => q[0])), Math.max(...labelPts.map((q) => q[0])), Math.min(...labelPts.map((q) => q[2])), Math.max(...labelPts.map((q) => q[2]))] : null };
  // what the default look-at point hits
  const lp = c.uvToWorld(0.08, 0.97).point;
  RR.debug.teleport(lp.x, lp.z + 1.0, 0, -0.8); await w(250); RR.debug.look(lp.x, lp.y + 0.01, lp.z); await w(150);
  log.res.aimAtDefault = { part: RR.grab.aim?.carpetHit?.part ?? null, owner: RR.grab.aim?.owner?.kind ?? null };
  RR.removeCarpet(c);
  log.done = true;
})();
