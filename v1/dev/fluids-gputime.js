// Rug Rush fluids GPU timing probe: paste into the dev page (or pass to shot.mjs) to time main render and sim passes with timer queries.
(async () => {
  const r = RR.engine.renderer, gl = r.getContext(), ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  if (!ext) return 'no timer query';
  const f = RR.fluids, fl = f.floor, scene = RR.engine.scene;
  const pending = [], acc = {};
  const begin = () => { const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); return q; };
  const end = (q, key) => { gl.endQuery(ext.TIME_ELAPSED_EXT); pending.push([q, key]); };
  let label = 'x', active = false;
  const origRender = r.render.bind(r);
  r.render = (s, c) => {
    if (s === scene && !active) { active = true; const q = begin(); origRender(s, c); end(q, 'render:' + label); active = false; return; }
    return origRender(s, c);
  };
  const origStep = fl.step.bind(fl);
  fl.step = (dt, tick) => { if (active) return origStep(dt, tick); active = true; const q = begin(); origStep(dt, tick); end(q, 'sim'); active = false; };
  const poll = () => {
    for (let i = pending.length - 1; i >= 0; i--) {
      const [q, key] = pending[i];
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) continue;
      if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) { const ns = gl.getQueryParameter(q, gl.QUERY_RESULT); const a = acc[key] ?? (acc[key] = []); a.push(ns / 1e6); }
      gl.deleteQuery(q); pending.splice(i, 1);
    }
  };
  const iv = setInterval(poll, 5);
  const w = (ms) => new Promise((res) => setTimeout(res, ms));
  const phases = window.__PHASES ?? [['water+refl', () => { fl.surface.mesh.visible = true; f.setReflections(true); }], ['water', () => { fl.surface.mesh.visible = true; f.setReflections(false); }], ['nowater', () => { fl.surface.mesh.visible = false; f.setReflections(false); }]];
  for (const [name, fn] of phases) { fn(); await w(300); label = name; await w(2000); label = 'x'; }
  await w(200); clearInterval(iv); poll();
  const med = (a) => { const s = [...a].sort((x, y) => x - y); return +s[Math.floor(s.length / 2)].toFixed(3); };
  return Object.fromEntries(Object.entries(acc).filter(([k]) => !k.endsWith(':x')).map(([k, a]) => [k, { n: a.length, median: med(a), avg: +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(3) }]));
})()
