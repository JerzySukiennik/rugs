// Rug Rush game assembly: builds every system, wires rugs, chemistry, fluids, trucks and economy, and exposes debug hooks.
import * as THREE from 'three';
import { Engine } from './core/engine.js';
import { Physics, initRapier, R } from './core/physics.js';
import { Input } from './core/input.js';
import { Entities } from './core/entities.js';
import { buildBaseplate } from './world/baseplate.js';
import { buildStations } from './world/stations.js';
import { LAYOUT } from './world/layout.js';
import { CarpetSurface } from './surface/surface.js';
import { Chemistry } from './surface/chemistry.js';
import { CARPET_TYPES, SIZES, rolledRadius } from './data/carpetTypes.js';
import { STORIES, PAINT_COLORS, rngFrom } from './data/jobs.js';
import { Player } from './player/player.js';
import { Ragdoll } from './player/ragdoll.js';
import { Grab } from './interact/grab.js';
import { Hud } from './ui/hud.js';
import { careLabelTexture } from './ui/careLabel.js';
import { Economy, Shop } from './ui/shop.js';
import { Truck } from './logistics/truck.js';
import { Roller } from './logistics/roller.js';
import { Cart, Forklift } from './logistics/vehicles.js';
import { aimDir } from './tools/items.js';
import { Audio } from './audio/audio.js';
import { SoundHooks } from './audio/hooks.js';
import { Radio } from './audio/radio.js';
import { Menu } from './ui/menu.js';
import { loadSettings, applySettings } from './game/settings.js';
import { loadLook, Avatar } from './player/avatar.js';
import { Juice } from './game/juice.js';
import { Clipboard } from './ui/orders.js';
import { StainHint } from './ui/stainHint.js';
import { Briefing } from './game/briefing.js';
import { Assistant } from './ui/assistant.js';
import { Net } from './net/net.js';

const _v = new THREE.Vector3();

export async function createGame({ container, params = new URLSearchParams(location.search) }) {
  await initRapier();
  const engine = new Engine(container, { pixelRatio: params.has('lowres') ? 1 : undefined });
  if (params.has('prof')) engine.prof = {};
  engine.scene.background = new THREE.Color(0xc4ccd3);
  engine.useRoomEnvironment(0.75);
  engine.loadEnvironment('assets/hdri/warehouse.hdr', { intensity: 0.7 }).catch(() => {});
  const physics = new Physics(engine);
  engine.add(physics, 0);
  const input = new Input(engine.canvas);
  engine.add(input, 1000);
  const entities = new Entities();
  const game = {
    engine, physics, input, entities, params,
    items: [], blowers: [], dryers: [], trucks: [], forklifts: [], carts: [],
    carpets: null, fluids: null, chem: null, hose: null,
    stats: { rugsIn: 0, rugsOut: 0, earned: 0, ruined: 0, unrolls: 0, trips: 0 },
    rnd: rngFrom(params.has('seed') ? +params.get('seed') : (Date.now() & 0xffff)),
  };
  window.RR = game;

  buildBaseplate(engine, physics);
  const hud = new Hud();
  game.hud = hud;
  game.audio = new Audio();
  game.mode = params.has('test') ? 'solo' : 'menu';
  const chem = new Chemistry();
  game.chem = chem;
  engine.add(chem, -25);

  const carpetMod = await import(params.has('mockcarpets') ? '../dev/mockCarpets.js' : './carpet/carpets.js').catch((e) => (console.error('carpet module', e), null));
  const fluidsMod = await import('./fluids/fluids.js').catch((e) => (console.error('fluids module', e), null));
  if (carpetMod) {
    game.carpets = new carpetMod.CarpetSystem(engine, physics);
    engine.add(game.carpets, -20);
  }
  if (fluidsMod) {
    const low = params.has('lowres');
    game.fluids = new fluidsMod.Fluids(engine, physics, low
      ? { entities, simRes: 192, rippleRes: 256, meshSegments: 128, reflections: false, maxParticles: 2048, testsPerStep: 96 }
      : { entities, testsPerStep: 128 });
    game.fluids.floor.readEvery = 30;
    engine.add(game.fluids, -20);
  }
  const carpets = game.carpets, fluids = game.fluids;

  if (fluids) {
    fluids.hitTest = (p0, p1) => {
      if (!carpets) return null;
      const d = _v.copy(p1).sub(p0);
      const len = d.length();
      if (len < 1e-6) return null;
      d.divideScalar(len);
      const h = carpets.raycast(p0, d, len);
      if (!h || h.part === 'label') return null;
      return { point: h.point, normal: h.normal, receiver: { carpet: h.carpet, uv: h.uv } };
    };
    fluids.onDeposit = (hit) => {
      const r = hit.receiver;
      if (r?.carpet && !r.carpet.wrapped) chem.deposit(r.carpet, r.uv, hit.kind, hit.productId, hit.amount);
    };
    chem.onHint = (msg, carpet, bad) => hud.toast(msg, !!bad, 4200);
    chem.onRunoff = (carpet, liters, dirt, soap, u, v) => {
      const w = carpet.uvToWorld?.(u, v);
      if (!w) return;
      const p = w.point;
      if (p.y > 0.35) {
        fluids.drip?.(p, liters / 0.1);
        if (Math.random() < 0.25) game.audio?.play('drip', { pos: p, volume: 0.35 });
      }
      else fluids.addWater(p.x, p.z, liters, { dirt: Math.min(1, dirt), soap: Math.min(1, soap), radius: 0.3 });
    };
    game.hose = fluids.createHose(LAYOUT.hoseBoom, { rate: 0.7 });
    if (game.hose?.stream) Object.assign(game.hose.stream, { size: 0.0105, spread: 0.03, pps: 210 });
    if (game.hose?.body) {
      game.hose.body.setLinearDamping(1.6);
      game.hose.body.setAngularDamping(4.5);
      game.hose.boomDamp = 2.8;
      game.hose.capFree = 55;
    }
    const lance = game.hose?.lance;
    if (lance) {
      const aq = new THREE.Quaternion(), am = new THREE.Matrix4(), ad = new THREE.Vector3();
      lance.hint = () => 'LMB water (aims at the crosshair) · let go and it swings back';
      lance.holdTarget = (p, grab, outPos, outQuat) => {
        outPos.copy(lance.holdPose.pos).applyMatrix4(p.camera.matrixWorld);
        aimDir(game, p, outPos, 4, ad);
        ad.lerp(p.forward, 0.35).normalize();
        lance.smoothDir = (lance.smoothDir ?? ad.clone()).lerp(ad, 0.18).normalize();
        ad.copy(lance.smoothDir);
        am.lookAt(outPos, ad.clone().add(outPos), new THREE.Vector3(0, 1, 0));
        aq.setFromRotationMatrix(am);
        outQuat.copy(aq);
        return true;
      };
    }
  }

  chem.dryBoostFn = (carpet, st) => {
    const G = [4, 6];
    const vals = new Float32Array(G[0] * G[1]);
    let hanging = 0;
    const sources = [];
    for (const b of game.blowers) {
      if (!b.on || b.held) continue;
      const t = b.body.translation();
      const r = b.body.rotation();
      const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(new THREE.Quaternion(r.x, r.y, r.z, r.w));
      if (dir.y < -0.5 || dir.y > 0.5) continue;
      sources.push({ pos: new THREE.Vector3(t.x, t.y + 0.2, t.z), dir, range: 5.5, cos: Math.cos(0.75), power: 6, isBlower: true });
    }
    for (const d of game.dryers) if (d.on) sources.push(d);
    for (let j = 0; j < G[1]; j++) for (let i = 0; i < G[0]; i++) {
      const w = carpet.uvToWorld?.((i + 0.5) / G[0], (j + 0.5) / G[1]);
      if (!w) continue;
      const p = w.point;
      let b = 0;
      if (p.y > 0.35) { b += 0.6; hanging++; }
      for (const s of sources) {
        const d = _v.copy(p).sub(s.pos);
        const dist = d.length();
        if (dist > s.range || dist < 1e-3) continue;
        if (d.divideScalar(dist).dot(s.dir) < s.cos) continue;
        b += s.power * (s.isBlower ? 1 : 1.8) * (1 - dist / s.range);
      }
      vals[j * G[0] + i] = b;
    }
    st.hanging = hanging / (G[0] * G[1]);
    return (u, v) => {
      const x = Math.min(G[0] - 1.001, Math.max(0, u * G[0] - 0.5)), y = Math.min(G[1] - 1.001, Math.max(0, v * G[1] - 0.5));
      const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
      const a = vals[y0 * G[0] + x0], b = vals[y0 * G[0] + x0 + 1], c = vals[(y0 + 1) * G[0] + x0], d = vals[(y0 + 1) * G[0] + x0 + 1];
      return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
    };
  };

  const player = new Player(engine, physics, input, { position: new THREE.Vector3(LAYOUT.spawn.x, 0, LAYOUT.spawn.z), yaw: 0 });
  entities.add(player);
  game.player = player;
  engine.add(player, -50);
  const ragdoll = new Ragdoll(game, player);
  game.ragdoll = ragdoll;
  engine.add(ragdoll, 20);
  const economy = new Economy(game, 150);
  game.economy = economy;
  engine.add(economy, 500);
  const shop = new Shop(game);
  game.shop = shop;
  const grab = new Grab(engine, physics, input, player, {
    carpets,
    hud,
    blocked: () => hud.labelOpen || shop.isOpen || !!game.assistant?.isOpen || !!player.inVehicle || game.eConsumed,
  });
  game.grab = grab;
  engine.add(grab, -40);
  const pickA = new THREE.Vector3(), pickB = new THREE.Vector3(), pickUp = new THREE.Vector3(), pickQ = new THREE.Quaternion();
  grab.extraPick = (origin, dir, max, who) => {
    let best = null;
    for (const it of game.items) {
      if (!it.stick || !it.handleLen || it.held || it.holder) continue;
      const t = it.body.translation(), r = it.body.rotation();
      pickA.set(t.x, t.y, t.z);
      pickUp.set(0, 1, 0).applyQuaternion(pickQ.set(r.x, r.y, r.z, r.w));
      pickB.copy(pickA).addScaledVector(pickUp, it.handleLen);
      const u = pickB.clone().sub(pickA);
      const w0 = origin.clone().sub(pickA);
      const a = dir.dot(dir), b = dir.dot(u), c = u.dot(u), d = dir.dot(w0), e = u.dot(w0);
      const den = a * c - b * b;
      let sc = den > 1e-8 ? (b * e - c * d) / den : 0;
      let tc = den > 1e-8 ? (a * e - b * d) / den : 0;
      tc = Math.max(0, Math.min(1, tc));
      sc = Math.max(0, (tc * b - d) / a);
      if (sc > max) continue;
      const pr = origin.clone().addScaledVector(dir, sc);
      const ps = pickA.clone().addScaledVector(u, tc);
      if (pr.distanceTo(ps) > 0.07) continue;
      if (!best || sc < best.distance) best = { distance: sc, point: pr, normal: dir.clone().negate(), owner: it, carpetHit: null, collider: null };
    }
    return best;
  };

  buildStations(game);
  const roller = new Roller(game, { x: LAYOUT.roller.x, z: LAYOUT.roller.z, yaw: 0 });
  game.roller = roller;
  engine.add(roller, -30);
  for (const [dock, role] of [[LAYOUT.inboundDock, 'in'], [LAYOUT.outboundDock, 'out']]) {
    const t = new Truck(game, { dock, role });
    game.trucks.push(t);
    engine.add(t, -30);
  }
  game.spawnCart = (p) => {
    const c = new Cart(game, p, 0);
    game.carts.push(c);
    return c;
  };
  game.spawnForklift = (p) => {
    const f = new Forklift(game, new THREE.Vector3(p.x, 0, p.z), Math.PI / 2);
    game.forklifts.push(f);
    engine.add(f, -45);
    return f;
  };
  game.spawnCart(new THREE.Vector3(14, 0, -4));
  if (params.has('forklift')) game.spawnForklift(new THREE.Vector3(12, 0, 0));

  game.spawnRug = ({ type, size = 'M', story = null, seed = Math.floor(game.rnd() * 1e6), state = 'rolled', position, yaw = 0, wrapped = false, clean = false, id = null }) => {
    if (!carpets) return null;
    const dims = typeof size === 'string' ? SIZES[size] : size;
    const surface = new CarpetSurface(dims.width, dims.length);
    const job = story ?? STORIES[Math.floor(game.rnd() * STORIES.length)];
    const paintColor = PAINT_COLORS[seed % PAINT_COLORS.length];
    const c = carpets.spawn({ type, width: dims.width, length: dims.length, seed, surface, state, wrapped, position, yaw, paintColor });
    c.job = job;
    c.seed = seed;
    c.sizeName = typeof size === 'string' ? size : '';
    c.displayName = () => `${CARPET_TYPES[type].name} · ${Math.round(dims.width * 100)}×${Math.round(dims.length * 100)}`;
    chem.attach(c, { story: clean ? null : job, seed });
    c.setLabelTexture?.(careLabelTexture(type, { width: dims.width, length: dims.length, client: job.client, seed }));
    c.onUnrollStart = () => {
      game.stats.unrolls++;
      const up = c.body?.translation?.();
      game.audio?.play('rug_unroll', { pos: up ? new THREE.Vector3(up.x, up.y, up.z) : null, volume: 0.7 });
      if (game.rnd() < 0.6) hud.toast(['Oops. It unrolled.', 'That rug had other plans.', 'Unrolled itself. Classic.'][Math.floor(game.rnd() * 3)]);
    };
    c.onImpact = (f) => game.onRugImpact?.(c, f);
    entities.add(c, id);
    return c;
  };

  game.removeCarpet = (c) => {
    if (grab.held && (grab.held.carpet === c || grab.held.owner === c)) grab.release();
    if (c.attachedTo) c.attachedTo.drop?.();
    chem.detach(c);
    carpets?.remove(c);
    entities.map.delete(c.id);
  };

  game.makeJobs = (trip) => {
    const pool = trip < 1 ? ['cut', 'loop'] : trip < 2 ? ['cut', 'loop', 'shag'] : trip < 3 ? ['cut', 'shag', 'persian', 'kilim'] : ['cut', 'loop', 'shag', 'persian', 'kilim', 'sisal', 'silk', 'persian'];
    const n = trip === 0 ? 2 : 1 + Math.floor(game.rnd() * 3);
    const jobs = [];
    for (let i = 0; i < n; i++) {
      const type = pool[Math.floor(game.rnd() * pool.length)];
      const sizes = CARPET_TYPES[type].sizes;
      jobs.push({ type, size: sizes[Math.floor(game.rnd() * sizes.length)] });
    }
    return jobs;
  };

  game.onTruckParked = (truck) => {
    const jobs = game.makeJobs(truck.trips);
    const zs = [-0.68, 0, 0.68];
    jobs.forEach((j, i) => {
      const len = SIZES[j.size].length;
      const r = rolledRadius(j.type, len);
      const p = truck.localToWorld(-1.0, 0.62 + r + 0.03, zs[i]);
      game.spawnRug({ type: j.type, size: j.size, position: p, yaw: truck.yaw, state: 'rolled' });
      game.stats.rugsIn++;
    });
    hud.toast(`Delivery: ${jobs.length} rug${jobs.length > 1 ? 's' : ''} at the inbound dock.`);
  };

  game.onTruckDispatched = (truck, inside) => {
    let total = 0;
    for (const c of inside) {
      if (c.wrapped && c.finalPrice !== undefined) {
        total += c.finalPrice;
        if (c.finalEval?.ruined) game.stats.ruined++;
      } else {
        const pen = -Math.round(CARPET_TYPES[c.type].basePrice * 0.8);
        total += pen;
      }
      game.stats.rugsOut++;
    }
    if (inside.length) {
      economy.add(total, `${inside.length} rug${inside.length > 1 ? 's' : ''} shipped`);
      game.stats.earned += total;
    }
  };

  game.onRugWrapped = (c, ev, price) => {
    hud.toast(`${ev?.grade ?? '?'} · ${ev?.ruined ? 'ruined, client will want compensation' : `worth $${price}`}`, !!ev?.ruined, 3600);
  };

  game.onRagdoll = (reason) => {
    game.stats.trips++;
  };

  player.onHit = (other, force) => {
    if (player.ragdolled || ragdoll.immune) return;
    const b = other?.body;
    if (!b || !b.isDynamic?.() || other === grab.held?.item || b === grab.heldBody()) return;
    const v = b.linvel();
    const rel = new THREE.Vector3(v.x - player.velocity.x, v.y - player.velocity.y, v.z - player.velocity.z);
    const speed = rel.length();
    const t = b.translation();
    const toPlayer = new THREE.Vector3(player.feet.x - t.x, player.feet.y + 0.9 - t.y, player.feet.z - t.z);
    const momentum = b.mass() * speed;
    if (speed > 5 && momentum > 14 && rel.dot(toPlayer) > 0) ragdoll.trigger(rel.multiplyScalar(Math.min(4, momentum * 0.15)), 'hit');
  };

  let trashAcc = 0;
  const logic = {
    fixedUpdate(dt) {
      game.eConsumed = false;
      if (carpets) {
        const f = player.feet;
        const push = player.ragdolled ? [] : [{ a: new THREE.Vector3(f.x, f.y + 0.5, f.z), b: new THREE.Vector3(f.x, f.y + 1.5, f.z), r: 0.26 }];
        carpets.setPushers(push.concat(ragdoll.limbs(), game.net?.pushers() ?? []));
      }
      const sp = Math.hypot(player.velocity.x, player.velocity.z);
      if (!player.ragdolled && !player.inVehicle && !ragdoll.immune && player.grounded && player.sprinting && sp > 4.2) {
        let trip = false;
        for (const c of player.contacts) {
          const low = c.point ? c.point.y < player.feet.y + 0.35 : true;
          if (c.owner?.kind === 'carpet' && c.owner.state === 'rolled' && low && Math.abs(c.normal?.y ?? 1) < 0.6) trip = true;
        }
        if (!trip && carpets) {
          const fx = player.feet.x + (player.velocity.x / sp) * 0.25, fz = player.feet.z + (player.velocity.z / sp) * 0.25;
          const h = carpets.surfaceHeightAt?.(fx, fz);
          const here = carpets.surfaceHeightAt?.(player.feet.x, player.feet.z) ?? 0;
          if (h !== null && h !== undefined && h - here > 0.09 && h < 0.5) trip = true;
        }
        if (trip) ragdoll.trigger(new THREE.Vector3(), 'trip');
      }
      const authority = !game.net?.isClient;
      trashAcc += dt;
      if (authority && trashAcc > 0.5) {
        trashAcc = 0;
        const z = game.trashZone;
        if (z) {
          const inZ = (p) => p.x > z.min.x && p.x < z.max.x && p.z > z.min.z && p.z < z.max.z && p.y < z.max.y;
          for (const it of [...game.items]) {
            if (it.held) continue;
            const t = it.body.translation();
            if (inZ(t)) {
              game.audio?.play('trash_drop', { pos: new THREE.Vector3(t.x, t.y, t.z), volume: 0.7 });
              it.dispose();
              entities.map.delete(it.id);
              game.items.splice(game.items.indexOf(it), 1);
              const bi = game.blowers.indexOf(it);
              if (bi >= 0) game.blowers.splice(bi, 1);
            }
          }
          for (const c of [...(carpets?.list ?? [])]) {
            const p = c.body ? c.body.translation() : c.uvToWorld?.(0.5, 0.5)?.point;
            if (p && inZ(p)) {
              economy.add(-Math.round(CARPET_TYPES[c.type].basePrice * 1.5), 'Rug thrown away · compensation');
              game.removeCarpet(c);
            }
          }
        }
      }
      for (const d of game.dryers) for (const f of d.fans ?? []) f.rotation.z += 0.6;
      const hose = game.hose;
      if (authority && hose?.maxLen) {
        for (const g of [grab, ...(game.net?.remoteGrabs() ?? [])]) {
          if (g.held?.item !== hose.lance) continue;
          const lt = hose.lance.body.translation();
          const pv = hose.pivot;
          if (Math.hypot(lt.x - pv.x, lt.y - pv.y, lt.z - pv.z) > hose.arm + hose.maxLen + 0.3) {
            g.release();
            hud.toast('The hose is not that long.');
          }
        }
      }
    },
    update(dt) {
      if (hud.labelOpen && (input.pressed('KeyE') || input.pressed('Escape'))) {
        hud.hideCareLabel();
        game.eConsumed = true;
      }
      for (const it of game.items) it.update?.(it.holder ?? player, it.holder?.grab ?? grab);
    },
  };
  engine.add(logic, -60);
  engine.add({ update: () => hud.render(game) }, 990);

  game.net = new Net(game);
  setupFlow(game);

  game.report = () => ({
    fps: +engine.fps.toFixed(1),
    frameMs: +engine.frameMs.toFixed(2),
    chemMs: +chem.stats.tickMs.toFixed(2),
    carpets: carpets?.list?.length ?? 0,
    items: game.items.length,
    money: economy.money,
    trucks: game.trucks.map((t) => `${t.role}:${t.state}`),
    roller: roller.state,
    carpetReport: carpets?.report?.(),
    fluidsReport: fluids?.report?.(),
    net: game.net?.report(),
  });
  game.debug = makeDebug(game);
  engine.start();
  game.ready = true;
  return game;
}

function setupFlow(game) {
  const { engine, input, player, hud, shop, ragdoll, trucks } = game;
  game.settings = loadSettings();
  game.look = loadLook();
  try {
    localStorage.removeItem('rugrush.save.v1');
  } catch (e) {}
  const menu = new Menu(game);
  game.menu = menu;
  engine.add(new SoundHooks(game), 996);
  game.juice = new Juice(game);
  engine.add(game.juice, 860);
  game.flags = {};
  game.clipboard = new Clipboard(game);
  engine.add(game.clipboard, 991);
  engine.add(new StainHint(game), 985);
  const wr0 = game.onRugWrapped;
  game.onRugWrapped = (c, ev, price) => {
    wr0?.(c, ev, price);
    game.flags.wrapped = true;
  };
  const dp0 = game.onTruckDispatched;
  game.onTruckDispatched = (t, inside) => {
    dp0?.(t, inside);
    if (inside.some((c) => c.wrapped)) game.flags.shipped = true;
  };
  game.briefing = new Briefing(game);
  engine.add(game.briefing, 988);
  game.assistant = new Assistant(game);
  engine.add(game.assistant, 992);
  game.radio = new Radio(game, new THREE.Vector3(-8.6, 1.0, 1.85), Math.PI / 2);
  let selfAv = null;
  const buildSelf = (look) => {
    selfAv?.dispose();
    selfAv = new Avatar(look, { tag: false });
    selfAv.parts.torso.visible = false;
    for (const c of selfAv.parts.hips.children) if (c.isMesh) c.visible = false;
    engine.scene.add(selfAv.object3d);
  };
  engine.add({
    update(dt) {
      if (!selfAv) return;
      const show = game.mode !== 'menu' && !player.ragdolled && !player.inVehicle;
      selfAv.object3d.visible = show;
      if (!show) return;
      const sp = Math.hypot(player.velocity.x, player.velocity.z);
      const back = new THREE.Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw)).multiplyScalar(0.16);
      selfAv.setPose({ pos: player.feet.clone().add(back), yaw: player.yaw, pitch: 0, crouch: player.crouch, speed: player.grounded ? sp : 0, dt });
    },
  }, 70);
  const applyLook = (look) => {
    buildSelf(look);
    game.look = look;
    ragdoll.colors = { suit: look.suit, skin: look.skin, boot: look.boots };
    game.net?.setLook?.(look);
  };
  applyLook(game.look);
  game.onLookChanged = applyLook;
  applySettings(game, game.settings);
  const resetWorld = () => {
    if (game.grab.held) game.grab.release();
    for (const c of [...(game.carpets?.list ?? [])]) game.removeCarpet(c);
    for (const t of trucks) {
      t.state = 'away';
      t.wait = t.role === 'in' ? 2 : 7;
      t.door = 0;
      t.ramp = 0;
      t.deployRamp?.(false);
      t.visible(false);
      t.trips = 0;
    }
    game.flags = {};
    const dk = LAYOUT.inboundDock;
    player.teleport(new THREE.Vector3(LAYOUT.spawn.x, 0, LAYOUT.spawn.z), Math.atan2(-(dk.x - LAYOUT.spawn.x), -(dk.z - LAYOUT.spawn.z)));
    player.pitch = -0.05;
  };
  game.resetWorld = resetWorld;
  const enterPlay = (mode) => {
    game.mode = mode;
    menu.hide();
    player.frozen = false;
    input.autoLock = true;
    input.lock();
    game.audio.stopMusic();
    hud.toast('The trucks are on their way');
  };
  game.startSolo = () => {
    resetWorld();
    enterPlay('solo');
  };
  game.startHost = async (name) => {
    if (!game.net) throw new Error('Multiplayer is not available.');
    resetWorld();
    await game.net.host({ name, look: game.look });
    enterPlay('host');
  };
  game.joinRoom = async (id) => {
    if (!game.net) throw new Error('Multiplayer is not available.');
    resetWorld();
    await game.net.join(id, { look: game.look });
    enterPlay('client');
  };
  game.toMenu = () => {
    game.mode = 'menu';
    player.frozen = true;
    input.autoLock = false;
    input.unlock();
    menu.title();
    game.audio.music('menu_loop');
  };
  game.leaveToMenu = () => {
    engine.paused = false;
    const wasClient = game.mode === 'client';
    game.net?.leave?.();
    if (wasClient) return location.reload();
    resetWorld();
    game.toMenu();
  };
  game.resume = () => {
    engine.paused = false;
    menu.hide();
    input.autoLock = true;
    input.lock();
  };
  input.onLockChange = (locked) => {
    if (locked || game.mode === 'menu' || shop.isOpen || game.assistant?.isOpen || hud.labelOpen || menu.open || document.querySelector('.rr-screen')) return;
    menu.pause();
  };
  let orbit = 0;
  engine.add({
    fixedUpdate() {
      const busy = (game.carpets?.list ?? []).filter((c) => !c.wrapped).length >= 4;
      for (const t of trucks) if (t.state === 'away' && (game.mode === 'menu' || (t.role === 'in' && busy))) t.wait = Math.max(t.wait, 0.5);
    },
    lateUpdate(dt) {
      if (game.mode !== 'menu') return;
      orbit += dt * 0.05;
      const cam = engine.camera;
      cam.position.set(Math.cos(orbit) * 17, 7.5, -2 + Math.sin(orbit) * 13);
      cam.lookAt(0, 0.5, -2);
      cam.updateMatrixWorld();
    },
  }, 850);
  game.net?.on?.('peer-join', (p) => {
    game.audio?.ui('ui_join', 0.8);
    hud.toast(`${p?.name ?? 'Someone'} joined the warehouse`);
  });
  game.net?.on?.('peer-leave', (p) => {
    game.audio?.ui('ui_leave', 0.7);
    hud.toast(`${p?.name ?? 'Someone'} left`);
  });
  game.net?.on?.('host-left', () => {
    if (game.mode !== 'client') return;
    menu.message('Host left', 'The host closed the warehouse. Back to the menu!', () => location.reload());
    input.autoLock = false;
    input.unlock();
  });
  let lowT = 0, highT = 0, cool = 0;
  engine.add({
    update(dt) {
      if (game.mode === 'menu' || engine.paused || dt <= 0) return;
      const r = engine.renderer;
      const q = game.settings.quality;
      const cap = q === 'low' ? 1 : q === 'medium' ? Math.min(devicePixelRatio, 1.25) : Math.min(devicePixelRatio, 1.5);
      const floor = Math.min(cap, 0.85);
      cool -= dt;
      const fps = engine.fps;
      lowT = fps < 53 ? lowT + dt : 0;
      highT = fps > 58.5 && engine.frameMs < 9 ? highT + dt : 0;
      const pr = r.getPixelRatio();
      if (cool <= 0 && lowT > 1.5 && pr > floor + 0.01) {
        r.setPixelRatio(Math.max(floor, pr - 0.2));
        engine.onResize();
        cool = 4;
        lowT = 0;
      } else if (cool <= 0 && highT > 8 && pr < cap - 0.01) {
        r.setPixelRatio(Math.min(cap, pr + 0.1));
        engine.onResize();
        cool = 6;
        highT = 0;
      }
    },
  }, 997);
  if (game.mode === 'menu') game.toMenu();
  else player.frozen = false;
}

function makeDebug(game) {
  const { player, grab, input } = game;
  return {
    teleport(x, z, yaw = player.yaw, pitch = player.pitch) {
      player.teleport(new THREE.Vector3(x, 0, z), yaw);
      player.pitch = pitch;
    },
    look(x, y, z) {
      const e = player.eye;
      const dx = x - e.x, dy = y - e.y, dz = z - e.z;
      player.yaw = Math.atan2(-dx, -dz);
      player.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    },
    hold(match) {
      const it = game.items.find((i) => i.label.toLowerCase().includes(match.toLowerCase()) || i.productId === match || i.toolId === match);
      if (!it) return null;
      if (grab.held) grab.release();
      const t = player.eye.clone().addScaledVector(player.forward, 0.6);
      it.body.setTranslation({ x: t.x, y: t.y, z: t.z }, true);
      game.physics.teleportBinding(it.body);
      grab.tryGrab({ owner: it, point: t });
      return it.label;
    },
    holdHose() {
      const l = game.hose?.lance;
      if (!l) return null;
      if (grab.held) grab.release();
      grab.tryGrab({ owner: l, point: player.eye.clone() });
      return l.label;
    },
    lmb(down) {
      input.locked = true;
      input.simulateMouse(0, down);
    },
    key(code, down) {
      input.locked = true;
      input.simulate(code, down);
    },
    rugFlat(type = 'persian', size = 'M', x = 0, z = -3, yaw = 0, clean = false) {
      return game.spawnRug({ type, size, state: 'flat', position: new THREE.Vector3(x, 0.05, z), yaw, clean });
    },
    rugRolled(type = 'cut', size = 'M', x = 2, z = 2, yaw = 0) {
      return game.spawnRug({ type, size, state: 'rolled', position: new THREE.Vector3(x, 0.4, z), yaw });
    },
    eval(c) {
      return game.chem.evaluate(c);
    },
  };
}
