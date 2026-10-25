(async () => {
  const w = (ms) => new Promise((r) => setTimeout(r, ms));
  const log = { samples: [] }; RR.report = () => log;
  const sample = (tag) => log.samples.push({ tag, fps: +RR.engine.fps.toFixed(1), frameMs: +RR.engine.frameMs.toFixed(2), calls: RR.engine.renderer.info.render.calls, tris: RR.engine.renderer.info.render.triangles, chemMs: +RR.chem.stats.tickMs.toFixed(2), carpet: RR.carpets.report().stepMs, fluids: RR.fluids.report().cpuMsPerStep, particles: RR.fluids.report().particles });
  // three rugs visible from the spawn-side view, two of them with story dirt
  const a = RR.debug.rugFlat('cut', 'L', -1.8, -3.5, 0, false);
  const b = RR.debug.rugFlat('persian', 'M', 1.8, -3.5, 0.3, false);
  const c = RR.debug.rugFlat('shag', 'M', 0, -6.5, 0, true);
  await w(1500);
  RR.debug.teleport(0, -0.6, 0, -0.5); await w(800);
  sample('idle, 3 rugs in view');
  await w(2000); sample('idle +2s');
  // hose on rug a for 6 s
  RR.debug.holdHose(); await w(400);
  RR.debug.look(-1.8, 0.05, -3.5); RR.debug.lmb(true);
  for (let k = 0; k < 6; k++) { await w(1000); sample(`hose ${k + 1}s`); }
  RR.debug.lmb(false);
  await w(3000); sample('after hose +3s');
  // vacuum on rug b (chem heavy) for 5 s
  RR.grab.release?.();
  RR.debug.hold('vacuum'); await w(300); RR.debug.look(1.8, 0.05, -3.5); RR.debug.lmb(true);
  for (let k = 0; k < 4; k++) { await w(1000); sample(`vacuum ${k + 1}s`); }
  RR.debug.lmb(false);
  log.prof = Object.entries(RR.engine.prof ?? {}).map(([k, v]) => [k, +v.toFixed(3)]).sort((x, y) => y[1] - x[1]).slice(0, 18);
  log.done = true;
})();
