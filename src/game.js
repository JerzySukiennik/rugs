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
      : { entities });
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
    chem.onRunoff = (carpet, liters, dirt, soap, u, v) => {
      const w = carpet.uvToWorld?.(u, v);
      if (!w) return;
      const p = w.point;
      if (p.y > 0.35) fluids.drip?.(p, liters / 0.1);
      else fluids.addWater(p.x, p.z, liters, { dirt: Math.min(1, dirt), soap: Math.min(1, soap), radius: 0.3 });
    };
    game.hose = fluids.createHose(LAYOUT.hoseBoom, { rate: 0.7 });
    if (game.hose?.stream) Object.assign(game.hose.stream, { size: 0.009, spread: 0.03, pps: 300 });
    const lance = game.hose?.lance;
    if (lance) {
      const aq = new THREE.Quaternion(), am = new THREE.Matrix4(), ad = new THREE.Vector3();
      lance.hint = () => 'LMB water (aims at the crosshair) · let go and it swings back';
      lance.holdTarget = (p, grab, outPos, outQuat) => {
        outPos.copy(lance.holdPose.pos).applyMatrix4(p.camera.matrixWorld);
        aimDir(game, p, outPos, 4, ad);
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
      sources.push({ pos: new THREE.Vector3(t.x, t.y + 0.2, t.z), dir, range: 4.5, cos: Math.cos(0.6), power: 4 });
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
        b += s.power * (1 - dist / s.range);
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
    blocked: () => hud.labelOpen || shop.isOpen || !!player.inVehicle || game.eConsumed,
  });
  game.grab = grab;
  engine.add(grab, -40);

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
        const push = player.ragdolled ? [] : [{ a: new THREE.Vector3(f.x, f.y + 0.3, f.z), b: new THREE.Vector3(f.x, f.y + 1.5, f.z), r: 0.3 }];
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

  hud.buildStart(() => input.lock());
  input.onLockChange = (locked) => hud.setStartVisible(!locked && !shop.isOpen && !hud.labelOpen);
  if (params.has('test')) hud.setStartVisible(false);

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
  game.net = new Net(game);
  game.debug = makeDebug(game);
  engine.start();
  game.ready = true;
  return game;
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
