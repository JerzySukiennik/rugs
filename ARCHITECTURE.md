# Rug Rush architecture (phase 1)

Co-op (phase 2) first-person browser game about cleaning rugs in a warehouse. Phase 1 = solo game on a
baseplate with every mechanic working: realistic rugs (physical, rollable, cloth), many cleaning products
layered on the rug, realistic water on the wash-bay floor, a hanging hose, drying, a rolling/wrapping machine,
inbound and outbound trucks, carts, a forklift and money. Everything except rugs, cleaning products and water
is a quick placeholder model in phase 1.

## Stack and rules

- three.js 0.170.0 + Rapier `@dimforge/rapier3d-compat` 0.14.0 as ES modules from jsDelivr via an import map
  (see `dev/base.html`). No build step, no npm packages in the game.
- Code, identifiers and docs in English. Each file starts with ONE short header comment line; no other comments.
- Always write whole files. 2-space indent, semicolons, ES classes.
- Performance target: Intel MacBook Pro 2019 (AMD GPU) in Chrome/Safari at 60 fps. Budget per fixed step
  (60 Hz): carpets ≤ 2 ms total for 3 active carpets, fluids ≤ 1.5 ms CPU. GPU: the scene must stay smooth
  with 3 carpets and water on screen. Use LOD and quality knobs instead of dropping features.
- Multiplayer comes in phase 2 (host-authoritative over WebRTC). Keep simulation state in plain fields that can be
  serialized, give every entity an id (`src/core/entities.js`), drive everything from the fixed step.
- Dev server: `python3 Niepotrzebne/tools/serve.py 8960` (no-cache static server, usually already running at
  http://localhost:8960). Headless GPU screenshots + console + fps:
  `node Niepotrzebne/tools/shot.mjs <url> <out.png> [setupJS] [waitMs] [w] [h]` (waits for `window.RR.ready`,
  prints `window.RR.report()` if defined).

## Coordinates and units

- Meters, kilograms, seconds, liters. Y up. Floor of the hall is y = 0.
- The wash bay is a shallow sloped basin, 12 x 12 m, centered at (BAY.cx, BAY.cz) = (0, -3), sloping 6 cm down to a
  linear trench drain along X through the bay center. `src/world/layout.js` is the single source of truth:
  `floorBaseHeightAt(x,z)` (smooth floor, used for collisions), `floorHeightAt(x,z)` (adds 2 mm grout lines every
  0.30 m and the 12 cm trench), `inBay`, `inTrench`, `BAY`, `LAYOUT` (station positions).
- Floor tiles: 0.30 m white tiles, 4 mm grout.

## Core modules (owned by the lead, do not edit; ask in your report if you need a change)

- `src/core/engine.js` `Engine`: renderer (ACES, sRGB, PCF soft shadows), `scene`, `camera`, fixed-step loop.
  Systems are plain objects added with `engine.add(system, order)`; hooks: `fixedUpdate(dt, tick)` at 60 Hz,
  `update(dt, alpha)` per frame, `lateUpdate(dt)`, `afterRender(dt)`. `FIXED_DT = 1/60`.
  Order convention: input/player -50, grab -40, tools -30, carpets/fluids -20, physics 0, post-physics 10..50,
  camera 800, HUD 990.
- `src/core/physics.js` `Physics` (system, order 0): `world` (Rapier), `R` (Rapier namespace, after `initRapier()`),
  `GROUP` + `groups(membership, filter)` collision masks, `createBody(desc, colliderDescs, owner)`,
  `addCollider(desc, body, owner)`, `ownerOf(collider)`, `bind(body, object3d)` (interpolated mesh sync),
  `raycast(origin, dir, max, {exclude, groupsMask, predicate})`, `staticBox(...)`, `stepListeners` (called after each
  world step), contact-force callbacks: an owner object may implement `onContactForce(otherOwner, maxForce)` and
  `onCollision(otherOwner, started)` (enable `ActiveEvents` on its colliders).
- `src/core/input.js` `Input`, `src/core/entities.js` `Entities`.
- `src/world/baseplate.js` builds ground, bay floor (visual + trimesh collider), trench drain, sun + hemi light.
- `src/surface/surface.js` `CarpetSurface` (data model of everything ON a rug, see below).
- `src/data/carpetTypes.js` rug types, sizes, `rolledRadius`, `carpetMass`.
- `dev/devkit.js` `boot()` gives a dev page with engine, physics, baseplate, orbit camera, fps HUD, `window.RR`.

## CarpetSurface (data contract between gameplay and rug rendering)

One `CarpetSurface` per rug, created by gameplay: `new CarpetSurface(widthM, lengthM)` → grid `W x H` cells at
50 cells/m. Cell (x, y) ↔ rug UV: `u = (x+0.5)/W` across the WIDTH, `v = (y+0.5)/H` along the LENGTH (the rolling
direction; v = 0 is the inner end of the roll = rolled first, v = 1 is the outer end that flaps open).
Eight `THREE.DataTexture`s (RGBA8, raw data, `NoColorSpace`, `flipY=false`, linear filtered, mipmapped) in
`surface.textures`; gameplay calls `surface.upload()` once per frame after changing data. All values 0..1:

| texture | R | G | B | A |
|---|---|---|---|---|
| `dirt0` | dust/sand/crumbs | pet hair | dried mud | sticky soda/juice |
| `dirt1` | red wine | coffee | grease/oil | pet urine (invisible except under UV lamp) |
| `dirt2` | chewing gum | candle wax | paint | mold |
| `layer` | water (fiber wetness; >0.8 = standing water) | powder layer | gel/liquid soap layer | foam layer |
| `tintGel` | gel color R (sRGB) | gel G | gel B | foam dirtiness (0 white → 1 brown-grey) |
| `tintPowder` | powder color R (sRGB) | powder G | powder B | dirty-water tint (0 clear → 1 muddy) |
| `damage` | dye bleed (colors run) | bleach spots | shrink/wrinkle | burn/melt |
| `nap` | pile direction X across width (0..1 → -1..1) | pile direction Y along length | fluff (0 matted → 1 fully fluffed) | crush (footprints/pressure) |

Expected look (rug renderer must make every channel readable and good-looking):
- dust: grey-beige fine particles settled deep in the pile, dulls colors; sand/crumbs sparkle slightly.
- hair: individual dark/blonde strands lying on top of the pile (strand pattern, not a smudge).
- mud: brown crusty clumps with height that sit on top, matte, cracked.
- sticky: glossy darker amber film, fibers clumped.
- wine: purple-red stain wicked into fibers with darker rim. coffee: brown stain with darker tide-line rim.
- grease: dark translucent shiny patch, darkens base color. urine: invisible (maybe a hint of yellow at 1.0)
  but glows yellow-green when lit by the UV lamp (uniforms below).
- gum: pinkish-grey flattened blobs with height. wax: off-white/colored glossy lumps. paint: opaque colored
  splatter (use a per-rug paint color uniform). mold: green-black speckled colonies.
- water: darker, more saturated color, specular sheen; above 0.8 visible standing-water film with reflections.
- powder: white/colored granular layer sitting ON TOP of the pile (tint from `tintPowder`), visibly grainy,
  thick where amount is high; turns into darker wet paste where water is also present.
- gel: glossy translucent colored liquid (tint from `tintGel`) pooled on top, bright specular.
- foam: thick white bubbly layer that rises ABOVE the pile proportional to amount (up to ~4 cm at 1.0), with
  bubble detail, soft shadowing; tinted toward brown-grey by `foamDirt`. This is the most satisfying part: piling
  powder + gel + foam on a rug and scrubbing must look great.
- dirty-water tint: brownish murky tone added to wet areas.
- damage: bleed = dye smears and runs into neighbouring colors (soft blur + hue shift of the pattern),
  bleach = pale desaturated blotches, shrink = puckered wrinkles (normal/height) and slightly pulled-in edges,
  burn = brown/black melted glossy fibers.
- nap: the pile leans in the given direction; on cut and shag rugs this changes color/sheen like velvet (brushing
  one way is lighter, the other way darker), footprints (crush) show as darker pressed areas. Fluff makes shag
  taller and airier; matted (low fluff) shag looks flat and clumpy.

## Holdable interface (consumed by the lead's grab system, `src/interact/grab.js`)

Anything a player can pick up exposes:

```js
{
  id, kind, label,                 // label is shown in the HUD ("Hose lance")
  body,                            // Rapier dynamic rigid body
  holdStyle: 'tool' | 'heavy',     // tool: follows the hand pose firmly; heavy: spring at the grab point, can drag
  holdPose: { pos: THREE.Vector3, rot: THREE.Euler },   // tool style: offset in CAMERA space
  useStart(player), useHold(player, dt), useEnd(player),  // left mouse, all optional
  altStart(player), altEnd(player),                       // right mouse, optional
  onGrab(player, pointWorld), onRelease(player),          // optional
}
```

`player` gives `player.camera`, `player.eye` (Vector3), `player.forward` (Vector3), `player.velocity` (Vector3),
`player.id`. The grab system drives held bodies by velocity with a force limit, so a held object can be yanked
away (for example when the hose is pulled taut).

## Module ownership in phase 1

- Lead: core, player, grab, tools and products, chemistry (`src/surface/chemistry.js`), logistics (trucks, roller
  machine, carts, forklift, economy), ragdoll, HUD, integration in `src/main.js` + `index.html`.
- Carpet agent: `src/carpet/**` + `dev/carpet.html`.
- Fluids agent: `src/fluids/**` + `dev/fluids.html`.
Agents only create/edit files inside their own folders and dev page. Anything else goes in their final report.

## Networking (phase 2, `src/net/**`)

Online co-op for 1-4 players, host-authoritative, WebRTC star (host ↔ each client). Solo is untouched until
`game.net.host()` or `game.net.join()` is called; nothing loads Firebase before that.

- `lobby.js`: Firebase JS SDK 10.12.2 (gstatic), anonymous auth, shared project `gzowos-games`. RTDB is used ONLY for
  `rugRush/rooms/$id` (public list, heartbeat every 5 s, rooms without heartbeat for 30 s are hidden and deleted by
  whoever lists them, host `onDisconnect` removes its room) and `rugRush/signal/$room/$uid` (SDP offer/answer and
  trickled ICE, deleted as soon as the channels open). Rules: `Niepotrzebne/rtdb-block.json`, deployed only through
  `tools/rtdb-rules.sh merge rugRush ...` + `deploy`.
- `peer.js`: one `RTCPeerConnection` per client with `control` (reliable, ordered: JSON + binary, chunked at 16 KB,
  sends are queued in order even when they wait for compression) and `state` (unordered, `maxRetransmits: 0`).
  Google STUN only, no TURN: peers behind symmetric NAT / strict corporate firewalls cannot connect.
- `host.js` (`HostSession`): every client is a `NetPlayer` on the host with a kinematic capsule moved by its own
  character controller toward the client-reported pose (pushes carts/rolls like a local player, contact forces →
  hit → the client is told to ragdoll), a `NetInput` fed by forwarded key/mouse edges and its own `Grab` instance,
  so all item/rug/tool logic runs on the host exactly as in solo. Forklifts driven by a remote player read that
  player's `NetInput`.
- `client.js` (`ClientSession`): turns the local world into a mirror: chemistry, rug cloth simulation, trucks,
  roller, economy and forklift logic are switched off, every replicated body becomes kinematic and follows
  snapshots interpolated 100 ms in the past (host clock estimated from ping/pong). The local player still moves,
  collides, trips and ragdolls locally and sends its pose at 30 Hz. The held tool/bottle/lance is predicted
  locally (hand pose, spray stream, hose flow) so it never lags behind the camera; the host replays the same
  input a few ms later.
- Rug surfaces: chemistry only on the host. `surfaceSync.js` diffs the eight RGBA8 grids against a "sent" shadow in
  16x16 tiles (5 Hz per rug, tiles that changed by < 6/255 are batched every 1.5 s) and ships byte deltas,
  `deflate-raw` compressed, on `control`. A joining client gets each rug's full grids once.
- Rug shape: core (rolled length, roll body pose, wrap) in every 20 Hz snapshot while it changes, cloth particles
  quantized to u16 inside the rug's bounding box at 10 Hz only while the rug moves, plus a reliable settle frame.
- Water: the GPU floor sim is never serialized. Inputs that do not come from particles (runoff, drips, wet-vac,
  vacuum tank dumps, squeegee blades) are replayed on clients; streams (bottles) are mirrored as emitters; the
  hose stream is driven by the replicated `flowing` flag. Client particles never deposit chemistry.
- Lobby UI API (`game.net`, also `window.RR.net`): `listRooms(cb) → unsubscribe` (cb gets
  `[{ id, name, hostName, players, max, version, compatible, full, age }]` on every change and every 2 s),
  `await host({ name, look })` (room name defaults to "<look.name>'s warehouse"), `await join(roomId, { look })`
  (resolves after the full world snapshot is applied, throws an `Error` with a readable message), `leave()`,
  `isHost`, `isClient`, `mode`, `connected`, `roomId`, `slot`, `peers` (`[{ id, slot, name, look, ping }]`),
  `look` / `setLook(look)` (persists `rugrush.look`), `on(evt, fn) → off` for `peer-join`, `peer-leave`,
  `host-left`, `left`, `error`, `snapshot`, and `report()` (rates, rtt, host cost). A client world cannot turn back
  into a solo world: after `host-left` or `leave()` as a client, reload the page.
- Avatars: `src/net/avatarAdapter.js` loads `src/player/avatar.js` (`new Avatar(look)`, `object3d`,
  `setPose({ pos, yaw, pitch, crouch, speed, holding, ragdollParts })`, `dispose()`); `pos` is the feet position,
  `holding` is `{ kind: 'item' | 'heavy' | 'cloth', id } | null`, `ragdollParts` is `null` or
  `[{ name, pos, quat }]` in `RAGDOLL_PARTS` order. Without that file it uses a coloured capsule with a name tag.
