// Rug Rush client session: connects to a host, turns the local world into a mirror (kinematic bodies, no rug/chemistry/truck logic), forwards input and replays host state.
import * as THREE from 'three';
import { STORIES } from '../data/jobs.js';
import { connectToHost } from './peer.js';
import { NetPlayer, Track, lerpPose } from './players.js';
import { sanitizeLook } from './avatarAdapter.js';
import { spawnEntity, despawnEntity, sameEntity, makeKinematic, applyWrap, applyCore, applyClothFrames, decodeCloth, MSG_CLOTH } from './world.js';
import { applySurfaceMessage, surfaceHash, MSG_SURF, MSG_SURF_FULL } from './surfaceSync.js';
import { decodeState, encodePose, MSG_STATE } from './state.js';
import { applyTruck, applyRoller, applyForklift, forkliftSeat } from './mirror.js';
import { RAGDOLL_PARTS } from '../player/ragdoll.js';
import { LAYOUT } from '../world/layout.js';
import { slerpArr } from './codec.js';
import { GROUP, groups } from '../core/physics.js';

const DELAY = 100;
const FORWARD = ['KeyE', 'KeyQ', 'KeyF', 'KeyR', 'KeyG', 'Space', 'KeyC', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft'];
const noop = () => {};
const _p = [0, 0, 0];
const _q = [0, 0, 0, 1];
const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
const _hv = new THREE.Vector3();

export class ClientSession {
  constructor(net, game) {
    this.net = net;
    this.game = game;
    this.isHost = false;
    this.peer = null;
    this.connected = false;
    this.closed = false;
    this.mirroring = false;
    this.slot = -1;
    this.offset = 0;
    this.rttSamples = [];
    this.rtt = 0;
    this.rx = Promise.resolve();
    this.bodyTracks = new Map();
    this.coreTracks = new Map();
    this.cloth = new Map();
    this.truckTracks = [];
    this.hoseTrack = new Track(8);
    this.roller = null;
    this.forkTracks = new Map();
    this.streams = new Map();
    this.blades = new Map();
    this.remotes = new Map();
    this.peerInfo = [];
    this.evals = new Map();
    this.holds = new Map();
    this.consumed = new Set();
    this.vehicle = null;
    this.hostSpeedMul = 1;
    this.tick = 0;
    this.lastStateT = 0;
    this.stats = { states: 0, cloth: 0, surf: 0, surfBytes: 0 };
    this.proxy = { consume: (code) => this.consumed.add(code) };
    this.apply = { fixedUpdate: (dt) => this.applyStep(dt), update: (dt) => this.frame(dt) };
    this.late = { fixedUpdate: () => this.hoseStep() };
    this.send = { fixedUpdate: () => this.sendStep(), update: () => this.forwardInput() };
  }

  hostNow() {
    return performance.now() + this.offset;
  }

  async connect(roomId) {
    const lob = this.net.lobby;
    await lob.ready();
    const info = await lob.roomInfo(roomId);
    if (!info) throw new Error('That room does not exist any more.');
    if (info.version !== this.net.version) throw new Error(`Version mismatch: room runs ${info.version}, you run ${this.net.version}. Reload to update.`);
    if (info.players >= info.max) throw new Error('That room is full.');
    if (Date.now() + lob.fb.offset - info.beat > 30000) throw new Error('That room stopped responding.');
    this.roomId = roomId;
    let peer = null;
    for (let attempt = 0; !peer; attempt++) {
      try {
        peer = await connectToHost(lob, roomId);
      } catch (e) {
        if (attempt >= 1 || this.closed) throw e;
        console.warn('[net] retrying connection', e?.message);
      }
    }
    this.peer = peer;
    peer.onClose = (reason) => this.onClosed(reason);
    peer.onMessage = (kind, msg) => this.onMessage(kind, msg);
    this.ready = new Promise((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
      setTimeout(() => reject(new Error('The host did not send the world in time.')), 45000);
    });
    peer.send({ t: 'hello', version: this.net.version, look: this.net.look });
    this.pingTimer = setInterval(() => peer.send({ t: 'ping', c: performance.now() }), 1000);
    peer.send({ t: 'ping', c: performance.now() });
    await this.ready;
    this.connected = true;
  }

  onMessage(kind, msg) {
    if (msg instanceof ArrayBuffer) {
      const type = new Uint8Array(msg, 0, 1)[0];
      if (type === MSG_STATE) return this.onState(msg);
      if (type === MSG_CLOTH && kind === 'state') return this.onCloth(decodeCloth(msg));
    }
    this.rx = this.rx.then(() => this.onControl(msg)).catch((e) => console.warn('[net] control', e));
  }

  async onControl(msg) {
    if (this.closed) return;
    if (msg instanceof ArrayBuffer) {
      const type = new Uint8Array(msg, 0, 1)[0];
      if (type === MSG_CLOTH) return this.onCloth(decodeCloth(msg));
      if (type === MSG_SURF || type === MSG_SURF_FULL) {
        this.stats.surf++;
        this.stats.surfBytes += msg.byteLength;
        const r = await applySurfaceMessage(msg, (id) => {
          const c = this.game.entities.get(id);
          return c?.kind === 'carpet' ? c.surface : null;
        });
        if (!r.ok && this.game.entities.get(r.id)) this.peer.send({ t: 'needSurf', id: r.id });
        return;
      }
      return;
    }
    const g = this.game;
    switch (msg.t) {
      case 'welcome':
        this.slot = msg.slot;
        this.offset = msg.h - performance.now();
        this.hostName = msg.name;
        return this.enterMirror();
      case 'reject':
        this.rejectReady?.(new Error(msg.reason ?? 'Rejected by host'));
        return this.peer.close('rejected');
      case 'snap': return this.onSnapshot(msg);
      case 'snapEnd':
        this.snapshotDone = true;
        this.resolveReady?.();
        return this.net.emit('snapshot', { entities: g.entities.map.size, carpets: g.carpets?.list.length ?? 0 });
      case 'spawn': return this.onSpawn(msg.e);
      case 'despawn':
        for (const id of msg.ids ?? []) {
          const e = g.entities.get(id);
          if (e && e.kind !== 'player' && e.kind !== 'hoseLance') despawnEntity(g, e);
          this.bodyTracks.delete(id);
          this.coreTracks.delete(id);
          this.cloth.delete(id);
        }
        return;
      case 'holds': return this.onHolds(msg.h);
      case 'items': return this.onItems(msg.s);
      case 'money':
        g.economy.money = msg.v;
        if (msg.stats) Object.assign(g.stats, msg.stats);
        if (g.shop?.isOpen) g.shop.render();
        return;
      case 'toast': return g.hud.toast(msg.text, msg.bad, msg.ms);
      case 'roller':
        if (msg.msg) g.roller?.say(msg.msg);
        return;
      case 'wrap': {
        const c = g.entities.get(msg.id);
        if (c?.kind === 'carpet') applyWrap(c, msg.ev, msg.price);
        return;
      }
      case 'tele': return this.onTeleport(msg);
      case 'you': return this.onYou(msg);
      case 'rag':
        if (Array.isArray(msg.imp)) g.ragdoll?.trigger(new THREE.Vector3(msg.imp[0], msg.imp[1], msg.imp[2]), msg.reason ?? 'hit');
        return;
      case 'fx': return this.onFx(msg.e);
      case 'eval':
        this.evals.set(msg.id, msg.ev);
        return;
      case 'sdef': return this.onStreamDefs(msg.s);
      case 'peers': return this.onPeers(msg.list);
      case 'pings':
        for (const [slot, ping] of msg.p ?? []) {
          const p = this.peerInfo.find((x) => x.slot === slot);
          if (p) p.ping = ping;
        }
        return;
      case 'ping': return this.peer.send({ t: 'pong', h: msg.h, c: performance.now() });
      case 'pong': return this.onPong(msg);
      case 'bye': return this.onClosed('host-left');
    }
  }

  enterMirror() {
    if (this.mirroring) return;
    const g = this.game;
    this.mirroring = true;
    if (g.grab.held) g.grab.release();
    g.grab.proxy = this.proxy;
    g.entities.nextId = Math.max(g.entities.nextId, 100000);
    g.chem.fixedUpdate = noop;
    g.chem.onRunoff = null;
    g.chem.evaluate = (c) => {
      const now = performance.now();
      if (now - (this.inspAt?.get(c.id) ?? 0) > 450) {
        (this.inspAt ??= new Map()).set(c.id, now);
        this.peer?.send({ t: 'insp', id: c.id });
      }
      return this.evals.get(c.id) ?? null;
    };
    if (g.carpets) {
      g.carpets.fixedUpdate = noop;
      const sl = g.physics.stepListeners;
      const i = sl.indexOf(g.carpets.onStep);
      if (i >= 0) sl.splice(i, 1);
    }
    for (const t of g.trucks) t.fixedUpdate = noop;
    if (g.roller) g.roller.fixedUpdate = noop;
    g.economy.fixedUpdate = noop;
    for (const f of g.forklifts) f.fixedUpdate = noop;
    if (g.fluids) g.fluids.onDeposit = null;
    const spawnF = g.spawnForklift;
    g.spawnForklift = (p) => {
      const f = spawnF(p);
      f.fixedUpdate = noop;
      return f;
    };
    this.makeAllKinematic();
    const sp = LAYOUT.spawn;
    g.player.teleport(new THREE.Vector3(sp.x + [0, 1.2, -1.2, 2.4][this.slot % 4], 0, sp.z + 0.8), g.player.yaw);
    g.engine.add(this.apply, -46);
    g.engine.add(this.late, -19);
    g.engine.add(this.send, 60);
    this.net.setMode('client');
  }

  makeAllKinematic() {
    const g = this.game;
    for (const e of g.entities.map.values()) {
      if (e.kind === 'carpet') {
        if (e.body) e.setBodyMode('kinematic');
      } else if (e.kind !== 'player' && e.body) makeKinematic(e.body);
    }
  }

  onSnapshot(msg) {
    const g = this.game;
    const want = new Map(msg.ents.map((d) => [d.id, d]));
    for (const e of [...g.entities.map.values()]) {
      if (e.kind === 'player' || e.kind === 'hoseLance') continue;
      if (e.kind !== 'item' && e.kind !== 'cart' && e.kind !== 'carpet' && e.kind !== 'forklift') continue;
      if (!sameEntity(e, want.get(e.id) ?? {})) despawnEntity(g, e);
    }
    for (const d of msg.ents) {
      const e = g.entities.get(d.id);
      if (e && sameEntity(e, d)) {
        if (d.kind === 'carpet' && d.wrap) applyWrap(e, d.wrap.ev, d.wrap.price);
        if (d.kind === 'carpet' && e.job !== STORIES[d.story]) e.job = STORIES[d.story] ?? e.job;
        continue;
      }
      if (e) despawnEntity(g, e);
      spawnEntity(g, d);
    }
    this.makeAllKinematic();
    g.economy.money = msg.money;
    if (msg.stats) Object.assign(g.stats, msg.stats);
    if (msg.roller) g.roller?.say(msg.roller);
    this.onItems(msg.items);
    this.onStreamDefs(msg.sdefs ?? []);
    for (const [id, ev] of msg.evals ?? []) this.evals.set(id, ev);
    this.onHolds(msg.holds);
  }

  onSpawn(list) {
    const g = this.game;
    for (const d of list ?? []) {
      const e = g.entities.get(d.id);
      if (e && sameEntity(e, d)) continue;
      if (e) despawnEntity(g, e);
      const ent = spawnEntity(g, d);
      if (ent?.kind === 'carpet' && d.hash !== undefined && surfaceHash(ent.surface) !== d.hash) this.peer.send({ t: 'needSurf', id: d.id });
    }
  }

  playerForSlot(slot) {
    if (slot === this.slot) return this.game.player;
    return this.remotes.get(slot) ?? null;
  }

  setHeldGroups(ent, on) {
    const b = ent?.body;
    if (!b) return;
    const n = b.numColliders();
    if (on && !ent.netSavedGroups) {
      ent.netSavedGroups = [];
      for (let i = 0; i < n; i++) {
        ent.netSavedGroups.push(b.collider(i).collisionGroups());
        b.collider(i).setCollisionGroups(groups(GROUP.HELD, GROUP.ALL & ~GROUP.PLAYER));
      }
    } else if (!on && ent.netSavedGroups) {
      for (let i = 0; i < n; i++) b.collider(i).setCollisionGroups(ent.netSavedGroups[i] ?? groups(GROUP.DYNAMIC));
      ent.netSavedGroups = null;
    }
  }

  onHolds(list) {
    const g = this.game;
    const next = new Map();
    for (const [slot, kind, id] of list ?? []) next.set(slot, { kind, id });
    const heldItems = new Set();
    for (const v of next.values()) if (v.kind === 'item') heldItems.add(v.id);
    for (const [, v] of this.holds) if (v.kind === 'item' && !heldItems.has(v.id)) this.setHeldGroups(g.entities.get(v.id), false);
    for (const id of heldItems) this.setHeldGroups(g.entities.get(id), true);
    for (const it of g.items) {
      const h = [...next.entries()].find(([, v]) => v.id === it.id);
      if (h) {
        it.held = true;
        it.holder = this.playerForSlot(h[0]);
      } else if (it.held) {
        it.held = false;
        it.holder = null;
        if (it.stream) it.stream.active = false;
      }
    }
    for (const [slot, rp] of this.remotes) {
      const h = next.get(slot);
      rp.holding = h ? { kind: h.kind, id: h.id } : null;
    }
    const mine = next.get(this.slot);
    const gr = g.grab;
    if (!mine) {
      if (gr.held) {
        const it = gr.held.item;
        if (it?.stream) it.stream.active = false;
        if (it === g.hose?.lance) g.hose.flowing = false;
        gr.held = null;
        g.player.speedMul = 1;
      }
    } else {
      const ent = g.entities.get(mine.id);
      if (ent) {
        const cur = gr.held;
        const same = cur && cur.kind === mine.kind && (cur.item ?? cur.owner ?? cur.carpet) === ent;
        if (!same) {
          if (mine.kind === 'item') gr.held = { kind: 'item', item: ent, body: ent.body };
          else gr.held = { kind: mine.kind, owner: ent, carpet: ent.kind === 'carpet' ? ent : null, body: ent.body ?? null };
        }
      }
    }
    this.holds = next;
  }

  onItems(list) {
    const g = this.game;
    const mine = g.grab.held?.item;
    for (const s of list ?? []) {
      const it = g.entities.get(s[0]);
      if (!it || it.kind !== 'item') continue;
      if (s[1] >= 0 && it.fill !== undefined) it.fill = s[1];
      if (it.on !== undefined) it.on = !!s[2];
      if (it.beater !== undefined) it.beater = !!s[3];
      if (it.dots !== undefined) it.dots = s[4];
      if (it.tank !== undefined) it.tank = s[5];
      if (it !== mine) it.using = !!s[6];
    }
  }

  onStreamDefs(list) {
    const F = this.game.fluids;
    if (!F) return;
    for (const d of list) {
      if (this.streams.has(d.sid)) continue;
      const s = F.createStream(d.kind, { color: d.color, rate: d.rate, speed: d.speed, spread: d.spread, size: d.size, pps: d.pps, productId: d.productId });
      s.active = false;
      this.streams.set(d.sid, { s, track: new Track(8), item: d.sid });
    }
  }

  onFx(list) {
    const F = this.game.fluids;
    if (!F || !Array.isArray(list)) return;
    for (const e of list) {
      if (!Array.isArray(e)) continue;
      const k = e[0];
      if (k === 'w') F.addWater(e[1], e[2], e[3], { dirt: e[4], soap: e[5], radius: e[6] });
      else if (k === 'f') F.addFoam(e[1], e[2], e[3], e[4]);
      else if (k === 'p') F.addPowder(e[1], e[2], e[3], e[4], e[5]);
      else if (k === 'r') F.removeWater(e[1], e[2], e[3], e[4] < 0 ? Infinity : e[4]);
      else if (k === 'd') F.drip(new THREE.Vector3(e[1], e[2], e[3]), e[4]);
    }
  }

  onPeers(list) {
    const g = this.game;
    const before = new Map(this.peerInfo.map((p) => [p.slot, p]));
    this.peerInfo = list.map((p) => ({ ...p, look: sanitizeLook(p.look) }));
    const seen = new Set();
    for (const p of this.peerInfo) {
      if (p.slot === this.slot) continue;
      seen.add(p.slot);
      if (!this.remotes.has(p.slot)) {
        const rp = new NetPlayer(g, { slot: p.slot, peerId: p.id, look: p.look, physical: true, controller: false });
        this.remotes.set(p.slot, rp);
        if (this.snapshotDone || before.size) this.net.emit('peer-join', { id: p.id, slot: p.slot, name: p.name, look: p.look, ping: p.ping });
      }
    }
    for (const [slot, rp] of [...this.remotes]) {
      if (seen.has(slot)) continue;
      rp.dispose();
      this.remotes.delete(slot);
      const p = before.get(slot);
      this.net.emit('peer-leave', { id: p?.id, slot, name: p?.name, look: p?.look });
    }
  }

  onPong(msg) {
    const now = performance.now();
    if (!Number.isFinite(msg.c) || !Number.isFinite(msg.h)) return;
    const rtt = now - msg.c;
    this.rttSamples.push({ rtt, off: msg.h + rtt / 2 - now });
    if (this.rttSamples.length > 10) this.rttSamples.shift();
    const best = this.rttSamples.reduce((a, b) => (b.rtt < a.rtt ? b : a));
    this.offset = best.off;
    this.rtt = this.rtt ? this.rtt * 0.7 + rtt * 0.3 : rtt;
  }

  onTeleport(msg) {
    const g = this.game;
    const p = g.player;
    if (this.vehicle) {
      this.vehicle = null;
      p.inVehicle = null;
      p.frozen = false;
      p.setEnabled(true);
    }
    p.teleport(new THREE.Vector3(msg.p[0], msg.p[1], msg.p[2]), msg.yaw);
  }

  onYou(msg) {
    const g = this.game;
    const p = g.player;
    this.hostSpeedMul = msg.speedMul ?? 1;
    const veh = msg.veh ? g.entities.get(msg.veh) : null;
    if (veh && veh !== this.vehicle) {
      this.vehicle = veh;
      p.inVehicle = veh;
      p.frozen = true;
      p.setEnabled(false);
      g.hud.toast('W/S drive · A/D steer · Space/C ram up/down · G drop roll · E exit');
    } else if (!veh && this.vehicle) {
      this.vehicle = null;
      p.inVehicle = null;
      p.frozen = false;
      p.setEnabled(true);
    }
  }

  onState(buf) {
    if (!this.mirroring) return;
    const s = decodeState(buf);
    this.stats.states++;
    this.lastStateT = performance.now();
    const t = s.t;
    for (const { slot, v } of s.players) {
      if (slot === this.slot) continue;
      this.remotes.get(slot)?.track.push(t, v);
    }
    for (const b of s.bodies) {
      let tr = this.bodyTracks.get(b.id);
      if (!tr) this.bodyTracks.set(b.id, (tr = new Track(8)));
      tr.push(t, { p: b.p, q: b.q });
    }
    for (const c of s.carpets) {
      let tr = this.coreTracks.get(c.id);
      if (!tr) this.coreTracks.set(c.id, (tr = new Track(8)));
      tr.push(t, c);
    }
    s.trucks.forEach((v, i) => {
      const tr = this.truckTracks[i] ?? (this.truckTracks[i] = new Track(8));
      tr.push(t, v);
    });
    if (s.hose) this.hoseTrack.push(t, s.hose);
    this.roller = s.roller;
    for (const f of s.forklifts) {
      let tr = this.forkTracks.get(f.id);
      if (!tr) this.forkTracks.set(f.id, (tr = new Track(8)));
      tr.push(t, f);
    }
    for (const st of s.streams) {
      const m = this.streams.get(st.sid);
      if (!m) continue;
      m.track.push(t, st);
      m.lastT = t;
    }
    for (const b of s.blades) this.blades.set(b.id, { ...b, t });
  }

  onCloth(f) {
    if (!this.mirroring) return;
    this.stats.cloth++;
    let list = this.cloth.get(f.id);
    if (!list) this.cloth.set(f.id, (list = []));
    if (f.settle) {
      const later = list.filter((x) => x.t > f.t);
      list.length = 0;
      list.push(f, ...later);
    } else {
      let i = list.length;
      while (i > 0 && list[i - 1].t > f.t) i--;
      list.splice(i, 0, f);
    }
    while (list.length > 5) list.shift();
  }

  applyStep(dt) {
    if (!this.mirroring || this.closed) return;
    const g = this.game;
    const rt = this.hostNow() - DELAY;
    const mine = g.grab.held;
    const mineBody = mine?.kind === 'item' ? mine.body : null;
    for (const [id, tr] of this.bodyTracks) {
      const e = id === g.hose?.lance?.id ? g.hose.lance : g.entities.get(id);
      const body = e?.body;
      if (!body || body === mineBody) continue;
      const b = tr.bracket(rt);
      if (!b) continue;
      const a = b.a, c = b.b, k = b.k;
      for (let i = 0; i < 3; i++) _p[i] = a.p[i] + (c.p[i] - a.p[i]) * k;
      slerpArr(a.q, c.q, k, _q);
      if (!body.isKinematic()) makeKinematic(body);
      const t = body.translation();
      if (Math.abs(t.x - _p[0]) + Math.abs(t.y - _p[1]) + Math.abs(t.z - _p[2]) > 4) {
        body.setTranslation({ x: _p[0], y: _p[1], z: _p[2] }, true);
        body.setRotation({ x: _q[0], y: _q[1], z: _q[2], w: _q[3] }, true);
        g.physics.teleportBinding(body);
      }
      body.setNextKinematicTranslation({ x: _p[0], y: _p[1], z: _p[2] });
      body.setNextKinematicRotation({ x: _q[0], y: _q[1], z: _q[2], w: _q[3] });
    }
    for (const c of g.carpets?.list ?? []) this.applyCarpet(c, rt);
    this.truckTracks.forEach((tr, i) => {
      const t = g.trucks[i];
      const b = tr.bracket(rt);
      if (t && b) applyTruck(t, b.a, b.b, b.k);
    });
    if (this.roller) applyRoller(g, g.roller, this.roller);
    for (const [id, tr] of this.forkTracks) {
      const f = g.entities.get(id);
      const b = tr.bracket(rt);
      if (f?.kind === 'forklift' && b) applyForklift(f, b.a, b.b, b.k);
    }
    for (const rp of this.remotes.values()) {
      const b = rp.track.bracket(rt);
      if (!b) continue;
      rp.applyPose(lerpPose(b.a, b.b, b.k, rp.view.step ??= {}));
      rp.moveBody(dt);
    }
    this.emitStreams(rt);
    this.predictHeld(dt);
    const now = this.hostNow();
    for (const [id, bl] of this.blades) {
      if (now - bl.t > 160) {
        this.blades.delete(id);
        continue;
      }
      g.fluids?.squeegee(id, { x: bl.a[0], z: bl.a[1] }, { x: bl.b[0], z: bl.b[1] });
    }
    if (this.vehicle) {
      const p = g.player;
      const seat = forkliftSeat(this.vehicle);
      p.p0.copy(p.p1);
      p.p1.copy(seat);
      p.body.setNextKinematicTranslation({ x: seat.x, y: seat.y + 0.85, z: seat.z });
    }
  }

  applyCarpet(c, rt) {
    let changed = false;
    const tr = this.coreTracks.get(c.id);
    if (tr) {
      const b = tr.bracket(rt);
      if (b) {
        const a = b.a, d = b.b, k = b.k;
        const v = k < 0.5 ? a : d;
        const same = a.hasBody === d.hasBody;
        const core = { ...v, rolledLen: same ? a.rolledLen + (d.rolledLen - a.rolledLen) * k : v.rolledLen };
        if (v.hasBody) {
          if (same && a.p && d.p) {
            core.p = [a.p[0] + (d.p[0] - a.p[0]) * k, a.p[1] + (d.p[1] - a.p[1]) * k, a.p[2] + (d.p[2] - a.p[2]) * k];
            core.q = slerpArr(a.q, d.q, k, [0, 0, 0, 1]);
          }
        }
        changed = applyCore(this.game, c, core) || changed;
      }
    }
    const list = this.cloth.get(c.id);
    if (list?.length) {
      let A = list[0], B = list[0], k = 0;
      if (rt >= list[list.length - 1].t) {
        A = B = list[list.length - 1];
      } else {
        for (let i = list.length - 1; i > 0; i--) {
          if (rt >= list[i - 1].t) {
            A = list[i - 1];
            B = list[i];
            k = (rt - A.t) / Math.max(1e-3, B.t - A.t);
            break;
          }
        }
      }
      const key = A === B ? B : null;
      if (key && c.netClothKey === key) {
        if (c.netClothFresh) {
          c.cloth.prevStep.set(c.cloth.x);
          c.netClothFresh = false;
        }
      } else {
        c.netClothKey = key;
        c.netClothFresh = true;
        changed = applyClothFrames(c, A, B, k) || changed;
      }
    }
    if (changed) {
      c.asleep = false;
      c.renderMoving = true;
      c.forceRender = Math.max(c.forceRender, 1);
      c.netStill = 0;
    } else if ((c.netStill = (c.netStill ?? 0) + 1) > 30 && !c.asleep) {
      c.asleep = true;
      c.cloth.prevStep.set(c.cloth.x);
      c.forceRender = 1;
    }
  }

  emitStreams(rt) {
    const g = this.game;
    const mine = g.grab.held?.item;
    const now = this.hostNow();
    for (const m of this.streams.values()) {
      const s = m.s;
      const recent = m.lastT !== undefined && now - m.lastT < 160;
      if (!recent || (mine && mine.id === m.item)) {
        s.active = false;
        continue;
      }
      const b = m.track.bracket(rt);
      if (!b) continue;
      const a = b.a, c = b.b, k = b.k;
      _o.set(a.origin[0] + (c.origin[0] - a.origin[0]) * k, a.origin[1] + (c.origin[1] - a.origin[1]) * k, a.origin[2] + (c.origin[2] - a.origin[2]) * k);
      _d.set(a.dir[0] + (c.dir[0] - a.dir[0]) * k, a.dir[1] + (c.dir[1] - a.dir[1]) * k, a.dir[2] + (c.dir[2] - a.dir[2]) * k).normalize();
      _hv.set(c.hv[0], c.hv[1], c.hv[2]);
      s.active = true;
      s.emit(_o, _d, _hv);
    }
  }

  predictHeld(dt) {
    const g = this.game;
    const p = g.player;
    const h = g.grab.held;
    const inp = g.input;
    const lmb = inp.locked && inp.mouseDown[0] && !g.grab.blocked?.();
    if (h?.kind !== 'item') {
      p.speedMul = h ? this.hostSpeedMul : 1;
      return;
    }
    const it = h.item;
    if (it === g.hose?.lance) {
      g.hose.held = true;
      g.hose.flowing = lmb;
      return;
    }
    if (it.productId) {
      it.using = lmb;
      const s = it.ensureStream?.();
      if (!s) return;
      if (lmb) it.t = (it.t ?? 0) + dt;
      const flowing = lmb && it.flowing;
      s.active = flowing;
      if (!flowing) return;
      const origin = it.worldOf(it.nozzle, _o);
      const dir = it.flowDir(p, origin, _d);
      s.emit(origin, dir, p.velocity);
    } else if (it.toolId) {
      if (!['uvlamp', 'blower'].includes(it.def?.kind)) it.using = lmb;
    }
  }

  hoseStep() {
    const g = this.game;
    const h = g.hose;
    if (!h || !this.mirroring) return;
    const b = this.hoseTrack.bracket(this.hostNow() - DELAY);
    if (!b) return;
    const th = b.a.theta + Math.atan2(Math.sin(b.b.theta - b.a.theta), Math.cos(b.b.theta - b.a.theta)) * b.k;
    h.thetaPrev = h.theta;
    h.theta = th;
    h.omega = 0;
    if (g.grab.held?.item !== h.lance) {
      h.held = b.b.held;
      h.flowing = b.b.flowing;
    }
  }

  frame() {
    if (!this.mirroring) return;
    const rt = this.hostNow() - DELAY;
    for (const rp of this.remotes.values()) {
      const b = rp.track.bracket(rt);
      if (!b) {
        if (rp.avatar) rp.avatar.object3d.visible = false;
        continue;
      }
      rp.renderAvatar(lerpPose(b.a, b.b, b.k, rp.view.frame ??= {}));
    }
  }

  sendStep() {
    if (!this.mirroring || this.closed || !this.peer?.open) return;
    if (++this.tick % 2) return;
    const g = this.game;
    const p = g.player;
    const act = p.ragdolled ? g.ragdoll?.active : null;
    let parts = null;
    if (act) {
      parts = RAGDOLL_PARTS.map((pp) => {
        const b = act.bodies[pp.n];
        const t = b.translation(), r = b.rotation();
        return { p: [t.x, t.y, t.z], q: [r.x, r.y, r.z, r.w] };
      });
    }
    const v = {
      pos: [p.p1.x, p.p1.y, p.p1.z], yaw: p.yaw, pitch: p.pitch, crouch: p.crouch, eyeH: p.eyeH,
      speed: Math.hypot(p.velocity.x, p.velocity.z), vel: [p.velocity.x, p.velocity.y, p.velocity.z],
      flags: (act ? 1 : 0) | (p.inVehicle ? 2 : 0) | (p.sprinting ? 4 : 0) | (p.grounded ? 8 : 0), parts,
    };
    this.peer.sendState(encodePose(performance.now(), v));
  }

  forwardInput() {
    if (!this.mirroring || this.closed || !this.peer?.open) return;
    const g = this.game;
    const inp = g.input;
    const ev = [];
    const blocked = !inp.locked || !!g.hud.labelOpen || !!g.shop?.isOpen;
    if (g.eConsumed) this.consumed.add('KeyE');
    for (const code of FORWARD) {
      if (inp.pressed(code) && !blocked && !this.consumed.has(code)) ev.push([code, 1]);
      if (inp.released(code)) ev.push([code, 0]);
    }
    for (const b of [0, 2]) {
      if (inp.mousePressed[b] && !blocked) ev.push([`M${b}`, 1]);
      if (inp.mouseReleased[b]) ev.push([`M${b}`, 0]);
    }
    if (!inp.locked && this.wasLocked) {
      for (const code of FORWARD) ev.push([code, 0]);
      ev.push(['M0', 0], ['M2', 0]);
    }
    this.wasLocked = inp.locked;
    this.consumed.clear();
    const w = inp.locked && !blocked ? inp.wheel : 0;
    if (!ev.length && !w) return;
    const p = g.player;
    const msg = { t: 'in', e: ev, w, p: [p.p1.x, p.p1.y, p.p1.z, p.yaw, p.pitch, p.eyeH].map((x) => Math.round(x * 10000) / 10000) };
    const aim = g.grab.aim;
    if (aim?.owner?.id !== undefined && Number.isFinite(aim.owner.id) && ev.some((e) => e[1] && (e[0] === 'KeyE' || e[0] === 'KeyR'))) msg.a = [aim.owner.id, +aim.point.x.toFixed(3), +aim.point.y.toFixed(3), +aim.point.z.toFixed(3)];
    this.peer.send(msg);
  }

  peerList() {
    return this.peerInfo.filter((p) => p.slot !== this.slot).map((p) => ({ id: p.id, slot: p.slot, name: p.name, look: p.look, ping: p.slot === 0 ? Math.round(this.rtt) : p.ping }));
  }

  pushers() {
    return [];
  }

  remoteGrabs() {
    return [];
  }

  report() {
    const pr = this.peer;
    const now = performance.now();
    const dt = (now - (this.lastReport?.t ?? now - 1000)) / 1000;
    const recv = pr ? pr.recv.control + pr.recv.state : 0, sent = pr ? pr.sent.control + pr.sent.state : 0;
    const prev = this.lastReport ?? { recv, sent };
    this.lastReport = { t: now, recv, sent };
    return {
      slot: this.slot, rtt: Math.round(this.rtt), offset: Math.round(this.offset), downKBs: +((recv - prev.recv) / 1024 / Math.max(0.001, dt)).toFixed(1),
      upKBs: +((sent - prev.sent) / 1024 / Math.max(0.001, dt)).toFixed(1), totalDownKB: Math.round(recv / 1024), ...this.stats,
    };
  }

  onClosed(reason) {
    if (this.closed) return;
    this.closed = true;
    this.connected = false;
    clearInterval(this.pingTimer);
    this.peer?.close(reason);
    if (!this.snapshotDone) this.rejectReady?.(new Error(reason === 'host-left' ? 'The host closed the room.' : `Connection lost (${reason}).`));
    for (const rp of this.remotes.values()) rp.dispose();
    this.remotes.clear();
    for (const m of this.streams.values()) m.s.active = false;
    const g = this.game;
    if (g.grab.held) g.grab.held = null;
    if (this.vehicle) this.onYou({ veh: 0 });
    if (this.silent) return;
    if (this.leaving) this.net.emit('left', { reason });
    else this.net.emit('host-left', { reason });
  }

  close() {
    if (this.closed) return;
    this.leaving = true;
    this.peer?.sendNow?.({ t: 'bye' });
    setTimeout(() => this.onClosed('left'), 60);
  }
}
