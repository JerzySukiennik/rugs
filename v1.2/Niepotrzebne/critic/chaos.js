(async () => {
  const W = (ms) => new Promise((r) => setTimeout(r, ms));
  const L = { ev: [], shotReq: [] }; RR.report = () => L;
  const T0 = performance.now();
  const ev = (s) => L.ev.push(`[${((performance.now() - T0) / 1000).toFixed(1)}s] ${s}`);
  const sleepFrames = (n) => W(n * 17);
  // A: throw a rolled rug at speed, see it bounce and stay in the bay; check no NaN and no escape through floor
  const r1 = RR.debug.rugRolled('cut', 'M', 6, 0, 0); await W(900);
  const tr = () => { const t = r1.body.translation(); return [t.x, t.y, t.z].map((v) => +v.toFixed(2)); };
  ev(`A rug rolled at ${tr()} state ${r1.state}`);
  r1.body.setLinvel({ x: -9, y: 3, z: -4 }, true); r1.body.setAngvel({ x: 0, y: 4, z: 0 }, true);
  for (let k = 0; k < 6; k++) { await W(700); ev(`A t+${(k + 1) * 0.7}s pos ${tr()} state ${r1.state} rolledLen ${r1.rolledLen?.toFixed?.(2)}`); }
  L.shotReq.push('chaos/01-thrown-roll.png');
  // B: a rolled rug dropped from 4 m onto a standing player nearby (ragdoll trigger)
  RR.debug.teleport(-3, -1, 0, 0);
  await W(300);
  const r2 = RR.debug.rugRolled('shag', 'M', -3, 0.2, 0); await W(300);
  r2.body.setTranslation({ x: -3, y: 4.0, z: 0.2 }, true); RR.physics.teleportBinding(r2.body);
  const rag0 = RR.stats.trips;
  await W(2500);
  ev(`B shag roll dropped on player: trips ${RR.stats.trips - rag0}, ragdolled=${RR.player.ragdolled}, roll pos ${JSON.stringify(r2.body.translation()).slice(0,70)}`);
  await W(3000);
  ev(`B later: ragdolled=${RR.player.ragdolled}, player feet ${[RR.player.feet.x, RR.player.feet.y, RR.player.feet.z].map((v) => +v.toFixed(2))}`);
  L.shotReq.push('chaos/02-roll-drop-player.png');
  // C: trip: sprint into a flat rolled rug edge
  RR.debug.teleport(3, -6, Math.PI, 0); await W(200);
  const fl = RR.debug.rugFlat('loop', 'M', 3, -4.2, 0, true); await W(600);
  RR.debug.teleport(3, -6.8, Math.PI * 0, 0); await W(200);
  RR.debug.key('KeyW', true); RR.debug.key('ShiftLeft', true);
  await W(1600);
  RR.debug.key('KeyW', false); RR.debug.key('ShiftLeft', false);
  ev(`C sprint into flat rug: ragdolled=${RR.player.ragdolled} trips total ${RR.stats.trips}`);
  await W(3000);
  // D: drop a bottle from shoulder height onto the tiles (should break? item bounce only). Spawn 6 products high
  const pts = [];
  for (let k = 0; k < 6; k++) { const it = RR.items[k]; if (!it) continue; pts.push(it.label); }
  // D: throw product on the rug
  RR.debug.hold('lathera'); await W(300);
  RR.grab.throw?.();
  await W(1200);
  const lat = RR.items.find((i) => i.productId === 'lathera');
  ev(`D thrown shampoo at ${lat ? [lat.body.translation().x, lat.body.translation().y, lat.body.translation().z].map((v) => +v.toFixed(2)) : 'n/a'} held=${!!lat?.held}`);
  // E: NaN sanity over all bodies
  let bad = 0; for (const it of RR.items) { const t = it.body.translation(); if (![t.x, t.y, t.z].every(Number.isFinite)) bad++; }
  ev(`E items=${RR.items.length} nonfinite=${bad} carpets=${RR.carpets.list.length}`);
  // F: spam 200 throws of sweep/vacuum with lots of rugs (stability)
  L.done = true;
})();
