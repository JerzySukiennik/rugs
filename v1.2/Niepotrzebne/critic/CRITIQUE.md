# Rug Rush: critic report

Build reviewed: git `119dc27` (working tree clean), served from the local tree on 127.0.0.1:8963. `src/game.js` hash matches the live `https://rugs.gzowo.fun`, so the findings apply to live.
Hardware for all numbers: Intel i9-9880H, AMD Radeon Pro 5500M, 16-inch Retina (the target class), headless Chrome with ANGLE/Metal. Game files were not modified. Everything I wrote lives in `Niepotrzebne/critic/`.

## Verdict

1. The loop is complete and readable: trucks, unroll, care label, products, rinse, squeegee, dry, roller, outbound truck and payout all work end to end, and the HUD tells you what is still dirty.
2. The cleaning core is broken for sticky and grease-type soils. Scrubbing stops doing anything once the foam is spent (removal plateaus near 60% and never moves past 40 s), so the method the game teaches ("shampoo + scrub + rinse") leaves a rug at grade E.
3. Wrong products barely hurt: bleach on silk, a max-heat iron on silk and shampoo on wool all end at grade A or A+. The "don't ruin the silk" promise is not delivered.
4. Pacing is too slow: one realistic rug takes about 5 minutes at bot speed, so a 15-minute shift is about 1 to 2 rugs for a human (estimate). The care label is nearly impossible to hit (1.7% of aim rays), and mould grows silently while you wait for drying.
5. Performance is fine at idle but drops to 47 to 59 fps on the target Mac at Retina scale while hosing or vacuuming (fluid CPU 3.5 to 6.6 ms per step against a 1.5 ms budget). Co-op pouring did not reproduce in my harness and needs a real-mouse check on two machines.

## Scores (1 to 10)

| # | Area | Score | Basis |
|---|---|---|---|
| 1 | First-time clarity | 6 | Checklist ticks itself, HUD inspection names the still-dirty soils with the right tool. Care label is nearly unhittable (P0-2) and the advised scrub does not work (P0-1). |
| 2 | Cleaning satisfaction and pacing | 3 | Vacuum feels good (dust -72% in ~17 s). Scrub plateau, ~5 min per rug at bot speed, 1 to 2 rugs per shift, 157 s of drying. |
| 3 | Realism of rugs, products, water | 6 | Shag pile, stains with tide lines and foam read well (screens in `shots/visual`). Chemistry is not realistic: dry bleach is inert and misuse damage is tiny. Standing-water gloss not judged closely. |
| 4 | Physics feel and chaos | 6 | Thrown rolls spring open mid-air and skid. Items thrown 8 m stop at the back wall (4 trials, no tunnelling). Rug-trip ragdoll not reproduced (test inconclusive). |
| 5 | UI/UX and friendslop style | 7 | Sticker chips, stamped report, creator turntable, title with save sticker, pause. Minus: "0.0 L/kg of product" unit bug, favicon 404, tiny label hit target. |
| 6 | Audio hookup (code review, not listened) | 6 | Broad coverage for tools, trucks, roller, forklift, cash, UI. Heavy rug drag is silent; splash, drip, trash-drop and join/leave assets are never triggered. |
| 7 | Performance | 4 | Idle 4 to 8 ms (60 fps). Retina with hose or vacuum: frames 13 to 33 ms, 47 to 59 fps. DPR 1 is fine (7 to 11 ms with hose). |
| 8 | Multiplayer robustness | 5 | Host and join through the real menus, room list, RTT 27 ms, peer-leave detected, ~115 KB downloaded per client in a session. Client pour did not change the bottle or the rug in 3 tries (P0-3). |
| 9 | Bugs and crashes | 6 | No uncaught game exception in ~25 min of scripted play (all PAGEERRORs were my harness). Confirmed bugs: P0-1 plateau, report units, sisal "keep dry" label not enforced. |
| 10 | Economy and progression | 4 | Payouts make sense (A+ cut M = $59, ruined = -1.5x base, start $150, save/restore works). Unfinished dirty rugs still pay at shift end. Throughput too low for a 15-minute shift. |

## P0 (blockers)

### P0-1 Scrubbing silently stops working once the foam is spent

- **Seen:** A stationary scrub with `lathera` shampoo then `brushStiff` on a sticky soda spot removes 35% after 5 s, 41% after 10 s, 38% after 20 s and 39% after 40 s. The spot is at 0.18 from 10 s on, and nothing moves after that. On a whole rug in the full run, shampoo plus two brush passes took sticky from 0.038 to 0.035 (-8%). The HUD still says "sticky soda (shampoo + scrub + rinse)".
- **Repro:** `cd "…/Rug Rush/Niepotrzebne/critic" && node run-bot.mjs ./sticky.js sticky 400` (writes the table to stdout; the run took 94 s). Whole-shift version: `node stream-run.mjs ./full2.js full2 1000 full-log.json` (events in `full2-run.out`, lines `SNAP after shampoo+scrub` and `SNAP after rinse`).
- **Evidence:** `out/sticky.out`, `full2-run.out`.
- **Likely cause:** `src/surface/chemistry.js:250` `if (wet > 0.1)` gates all wet scrubbing. The wetness that gate reads is `max(water, gel*0.6)` (see `agitate()`), and scrubbing eats the gel (`chemistry.js:268`, `gd`) faster than the brush can use it. Once gel is about 0.07, `wet` is below 0.1 and `ds` (`chemistry.js:252`) never runs. Surfactant then sits at about 1.3 with nothing to do.
- **Fix:** Scrub against the effective film (water + gel + foam), or let a brushing stroke keep a minimum film. Add a visible cue such as "dry patch: hose it or add shampoo". Acceptance test: stationary scrub for 20 s must remove more than 80% of sticky soda.

### P0-2 The care label tag is nearly impossible to hit

- **Seen:** Tutorial step 3 says "E on the tag at a corner". I scanned 1,681 aim rays over the rug end: 28 hit the label (1.7%). The label is a strip about 4 cm wide, at the far end of the rug near u ≈ 0.08 (x ≈ -0.85, z at the rug end). The default look point on the rug corner hits "top" carpet, so the prompt never appears.
- **Repro:** `node run-bot2.mjs ./label.js label 120 test out/label.json`.
- **Evidence:** `out/label.json` (`labelFraction 0.017`, `aimAtDefault.part = top`), `shots/full/05-care-label.png` (shows no label, the player was elsewhere, but the miss is confirmed by the scan).
- **Likely cause:** `src/carpet/fringe.js:225` `raycastLabel` tests a zero-thickness strip (`LK = 4` nodes, `seg = 0.1/(LK-1)`, `fringe.js:8` and `:83`).
- **Fix:** Make the tag a pickable box about 12 to 15 cm across (invisible hit volume is fine), show the "E read label" prompt within about 0.3 m, and keep the rug-list fallback (Hold Tab) that already exists.

### P0-3 Co-op: a client's pour did not change the bottle or the host rug (unverified, may be my harness)

- **Seen:** Host spawns a clean cut M rug, client joins through the real menu, client holds `lathera` and holds LMB for 4 s aimed at the rug. Bottle stays at 5.000 L on both machines, and the host rug stays at surf 0 and gel 0. Diagnostics on the client: `grab.proxy = true`, `tilt = 0` while LMB is down, and `grab.aim` is null while the bottle is held (the rug is visible on the client, see `shots/coop/10-client-pour-check.png`). Three attempts, same result.
- **Repro:** host and client in two processes: `node coop2.mjs` (pour check) and `node coop3.mjs` (diagnostics, prints the flags).
- **Evidence:** `out/coop2.out`, `out/coop3.out` (diagnostic lines in the task output), `shots/coop/09-host-pour-check.png`, `shots/coop/10-client-pour-check.png`.
- **Caveat:** my harness drives input with `RR.debug.lmb()` (`simulateMouse`), not real DOM mouse events. The client forwards real input edges (`src/net/client.js`, `forwardInput()`, which reads `mousePressed`), so my synthetic click may simply not be forwarded. Treat this as a P0 candidate until a human tests it with a real mouse on two machines.
- **Suggested check:** `src/interact/grab.js:103` returns from `update()` through `proxyUpdate()` before the item logic. Confirm that the client's `aim` is computed in proxy mode, then re-run with real clicks.

## P1 (major)

### P1-1 Frame rate drops at Retina scale during hose and vacuum

- **Seen (Retina, viewport 1536x960, DPR 2, pixel ratio 1.5 = 2304x1440 back buffer, 3 rugs in view):** idle frames 4.5 to 7.8 ms. Hose on: frame 13 to 19 ms, 52 to 59 fps, `Fluids.fixed` 3.5 to 6.6 ms per fixed step. Vacuum on: frame 23 to 33 ms, 47 to 49 fps, `CarpetSystem.update` 0.9 to 2.3 ms, render 9.4 ms average. The ARCHITECTURE budget for fluids is 1.5 ms per step.
- **Same scene at DPR 1:** idle 4 to 5 ms, hose 7 to 11 ms, fluids 2.4 to 3.1 ms per step. So the fill rate is the main cost.
- **Repro:** `W=1536 H=960 DPR=2 node run-bot2.mjs ./perf.js perf-retina 200 "test&prof" out/perf-retina.json`.
- **Evidence:** `out/perf-retina.json` (samples and `prof` table), `out/perf.out` (DPR 1).
- **Likely causes:** `src/core/engine.js:12` and `src/game/settings.js:38` render at `min(devicePixelRatio, 1.5)` with no adaptive fallback. `src/fluids/floor.js:153` reads back the whole 256x256 float RGBA buffer every 12 steps (about 1 MB, `floor.js:447`), and `floor.js:496` then walks all 262k floats on the CPU. `particles.js:552` runs up to 192 ray tests per step.
- **Fix:** Adaptive pixel ratio (drop to 1.0 while frame > 14 ms), do the wet-cell sum on the GPU or read every 30 steps, and cap hose particles at about 150 per second. Re-measure with the same script.

### P1-2 Wrong products and heat barely hurt

- **Seen (state-checked, `misuse2.js`):**
  - Silk, chlorine bleach poured 4 s: the bottle drops from 1.0 to 0.73 L, chlorine on the rug reaches 0.157 average (max 6), bleach stays at 0 for the next 2 s, damage 0, grade A.
  - Silk, iron at max heat (3 dots) for 4 s: burn max 2.67 in one cell, average 0.012, damage 1.8%, grade A.
  - Silk, hose for 6 s: damage 1.7%, grade A.
  - Hand-knotted wool, synthetic shampoo (pH 9.5 against a tolerance of 0.22) for 5 s, then hose for 6 s: damage 0.09%, grade A+.
  - Hand-knotted wool, enzyme for 3 s and 15 s dwell: damage 0, grade A+.
  - Ruined needs average damage above 8% or more than 12% of cells above 0.5. Nothing short of a long soak reaches it.
- **Repro:** `node run-bot2.mjs ./misuse2.js misuse2 200 test out/misuse2.json`; earlier misuse matrix in `out/misuse.out`.
- **Likely causes:** `src/surface/chemistry.js:477` `if (wet > 0.05)` gates the chlorine, reductant and alkali block, so dry bleach does nothing at all. Iron burn reaches 2.67 in the spot (`chemistry.js:416`, `0.35 * (dots - ironMax) * dt * w` per step), but `evaluate()` averages damage over every cell, so one scorched spot (about 0.07 m² of a 2.2 m² rug) never reaches the ruin thresholds at `chemistry.js:661`.
- **Fix:** Let chlorine and alkali act without water (they are liquids). Raise burn and bleach rates for the spot under the tool. Show an immediate toast when a rug crosses a damage threshold ("Bleach! Silk is going pale"). Make the grade cap at B or C for any visible scorch.

### P1-3 Pacing: one rug takes about five minutes of play, so a shift is one or two rugs

- **Seen (bot timeline, `full2-run.out`, bay start, no unloading):** vacuum 2 passes about 17 s; shampoo and brush about 25 s; hose rinse about 15 s; squeegee about 9 s; drying 157 s with two air movers (wet 0.135 at 75 s, 0.037 at 219 s, `dryEnough` at 228 s); roller press to wrap about 12 s; dispatch about 10 s. Total about 5 minutes at bot speed. With real aiming, walking and unloading, expect 8 to 12 minutes per rug.
- **Impact:** A 15-minute shift yields 1 to 2 rugs. Drying is the largest single block of dead time, and the scrub plateau (P0-1) forces repeats.
- **Fix:** Faster drying (two movers at the same power as the dryer, or a visible dryer station used during the walk), a drying progress readout, and shorter scrub-to-clean ratios once P0-1 is fixed.

### P1-4 Mould grows silently while the rug dries

- **Seen:** In the full run the rug was wet for several minutes. After drying, `mould 0.02` appeared, and the clean score fell from 0.42 to 0.22 (grade E). No toast, no HUD note.
- **Cause:** `src/surface/chemistry.js:584` grows mould once `wetT > 90` seconds at wet > 0.45.
- **Fix:** Add a "damp too long" warning at about 60 s, make the mould visible in the still-dirty list before it grows, or raise the threshold.

### P1-5 Audio: heavy drags are silent and several assets never play

- **Seen (code review, not listened):**
  - `assets/audio/sfx/rug_drag_loop.mp3` is in the sfx manifest but never referenced.
  - `water_splash` appears only in the preload list (`src/audio/hooks.js:21`). Floor splashes (`src/fluids/particles.js` `impactFloor`) never call audio.
  - `drip_1..3` are in the manifest, but `fluids.drip()` (`fluids/particles.js:301`) plays nothing.
  - `trash_drop` is preloaded (`hooks.js:24`), but the dumpster deletion at `src/game.js:326` to `:345` plays nothing and only applies the compensation.
  - `ui_join`, `ui_leave`, `ui_success`, `ui_back`, `ui_type` and `cardboard_drop` are never played.
- **Fix:** Loop `rug_drag_loop` with volume tied to speed while a cloth or heavy item moves. Play `water_splash` on floor impacts above a threshold, `drip` from `particles.drip()`, `trash_drop` in the dumpster branch, and join and leave in the net layer.

### P1-6 Dirty rugs pay at shift end

- **Seen:** `src/game/shift.js` `end()` pays `chem.price(c, ev) * 0.5` for every unfinished rug. A cut M that was never touched pays about $5 (59 base value x 0.15 x 0.5) and is listed as "Picked up as is". A rug left wet and dirty earns more than nothing, which is backwards.
- **Fix:** Pay zero (or a small fixed fee) for unfinished rugs, and keep the ruin penalty.

## P2 (polish)

- **P2-1 Report units:** "0.0 L/kg of product" (`src/ui/report.js:35`) adds litres of liquid and kilograms of powder (`src/game/shift.js:63`). Split into "L of product" and "kg of powder", or drop the stat.
- **P2-2 Favicon 404:** Each page load requests `/favicon.ico` and gets a 404 (`index.html` has no icon). Add an inline SVG icon.
- **P2-3 Sisal "KEEP DRY" is not enforced:** `src/data/fibers.js:28` to `:30` sets `waterTol 0.12` but `bleedWet 0` and `waterMarks 0`, so water costs nothing until browning starts after about 25 s of wetness (`chemistry.js` `wetT` and `browning`). Add an immediate water mark.
- **P2-4 First-time arrival:** The player spawns facing the wash bay. The inbound dock is behind, and the toast "Delivery: 2 rugs at the inbound dock" gives no direction (`shots/play/03-truck-arrived.png`). Add a waypoint or spawn the player facing the dock.

## Not verified (limits)

- Real mouse and keyboard play, and any judgement by ear. Audio is judged from code only.
- A 15-minute shift with a human pace. All timings above are scripted and fast.
- Forklift, cart, dryer station, Tab rug list, settings sliders and the creator at 1280x720 beyond the first screen.
- Co-op over the internet (only local, two headless pages).
- Phone layout (the game is pointer-lock desktop).

## What is genuinely good

- The first-day checklist ticks itself from real events, and the HUD inspection line ("Clean 0% · Wet 3% · Still dirty: …") is the best piece of guidance in the game.
- The right product works well. Wine with the oxygen spotter (6 s mist, 20 s dwell, rinse) drops from 0.30 to 0.05 average (83%). Coffee with the tannin spotter drops from 0.30 to 0.015 (95%). Vacuum takes 72% of dust in one pass pair.
- Rolling, wrapping and shipping work: press to wrap about 12 s, grade A+ at $59, outbound dispatch by button (interact distance 0.95 m) pays out $59 (money 150 to 209).
- Care label: ISO-style symbols and fibre notes that match the rule tables.
- Friendslop UI: stamped report, sticker chips, creator turntable, title with "Day 2 · $150 in the bank" sticker. Save and reload restore day, money and 40 items.
- Foam, stains and fluffy shag read well at close range (`shots/visual/01-foam-soap.png`, `03-closeup-wet.png`).
- Physics: thrown rolls spring open and skid; thrown items stop at walls.
- Co-op plumbing: room list, join through the menu, peer join and leave events, RTT 27 ms, small state payloads.
- Engineering: fixed-step chemistry in slices (chem tick about 0.1 ms per frame), profiler hook (`?prof`), clear budgets in ARCHITECTURE.md.

## Evidence index

All paths are under `/Users/jurek/Downloads/Claude/Projects/Rug Rush/Niepotrzebne/critic/`.

- Scripts: `h.mjs` (harness), `run-bot.mjs`, `run-bot2.mjs` (env W, H, DPR), `stream-run.mjs` (live log and screenshots), `full.js`, `full2.js` (bay-start full shift), `sticky.js`, `label.js`, `misuse.js`, `misuse2.js`, `chaos.js`, `perf.js`, `throw.js`, `hosecover.js`, `ship.js`, `visual.js`, `ui.mjs` / `ui3.mjs` (menus, save, reload), `coop.mjs`, `coop2.mjs`, `coop3.mjs`.
- Logs: `full2-run.out` (bay-start shift, stopped after drying when my bot threw on a flat rug, see note), `full-run.out` (first shift, unload and drag path, my route went through the yard), `ship-run.out`, `out/*.out` and `out/*.json`.
- Screenshots: `shots/01-menu-initial.png`, `shots/play/03-truck-arrived.png`, `shots/full/*.png`, `shots/misuse/*`, `shots/visual/*.png`, `shots/ui/*.png` (report `05-report.png` shows "0.0 L/kg"), `shots/coop/*.png`.
- Note on the scripted shift: my first bot dragged the inbound roll through the dock door and it landed on the yard apron, and a later bot call assumed a body on a flat rug (`rugFlat` has no physics body). Both are harness mistakes, fixed in `full2.js` and `ship.js`. No game exception was seen.
