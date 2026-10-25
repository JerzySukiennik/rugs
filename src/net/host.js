// Rug Rush host session: accepts peers, runs remote players (capsule, grab, virtual input), and replicates the world, rugs, surfaces, water and economy to clients.
import * as THREE from 'three';
import { Grab } from '../interact/grab.js';
import { RAGDOLL_PARTS } from '../player/ragdoll.js';
import { acceptPeer } from './peer.js';
import { NetInput, NetPlayer, lerpPose } from './players.js';
import { sanitizeLook } from './avatarAdapter.js';
import { networkEntities, describe, liteEval, encodeCloth, coreKey } from './world.js';
import { SurfaceShadow, encodeDelta, encodeFull } from './surfaceSync.js';
import { encodeState, decodePose, MSG_POSE } from './state.js';

const MAX_CLIENTS = 3;
const KEYFRAME_TICKS = 120;
const CLOTH_BUDGET = 6000;
const CODES = new Set(['KeyE', 'KeyQ', 'KeyF', 'KeyR', 'KeyG', 'Space', 'KeyC', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'M0', 'M2']);
const _v = new THREE.Vector3();

function r3(v) {
  return Math.round(v * 1000) / 1000;
}

function r4(v) {
  return Math.round(v * 10000) / 10000;
}

export class HostSession {
  constructor(net, game) {
    this.net = net;
    this.game = game;
    this.isHost = true;
    this.peers = new Map();
    this.closed = false;
    this.connected = false;
    this.tick = 0;
    this.seq = 0;
    this.known = new Map();
    this.shadows = new Map();
    this.lastBodies = new Map();
    this.lastCore = new Map();
    this.clothState = new Map();
    this.itemStates = new Map();
    this.holdKey = '';
    this.money = null;
    this.rollerMsg = null;
    this.streamIds = new Map();
    this.streamDefs = [];
    this.blades = new Map();
    this.fx = [];
    this.evals = new Map();
    this.evalIdx = 0;
    this.surfIdx = 0;
    this.stats = { stateBytes: 0, rates: {} };
    this.sys = { fixedUpdate: (dt) => this.preStep(dt), update: (dt) => this.frame(dt) };
    this.post = { fixedUpdate: (dt) => this.postStep(dt) };
    this.installHooks();
  }

  get live() {
    return !this.closed && [...this.peers.values()].some((e) => e.ready);
  }

  async open(name) {
    const lob = this.net.lobby;
    const id = await lob.createRoom({ name, hostName: this.net.look.name, max: MAX_CLIENTS + 1 });
    this.roomId = id;
    lob.onOffers((peerId, offer, mailbox) => this.accept(peerId, offer, mailbox));
    this.game.engine.add(this.sys, -48);
    this.game.engine.add(this.post, 60);
    for (const c of this.game.carpets?.list ?? []) this.shadowFor(c);
    for (const e of networkEntities(this.game)) this.known.set(e.id, this.sig(e));
    this.connected = true;
    return id;
  }

  installHooks() {
    const g = this.game;
    const F = g.fluids;
    this.unhook = [];
    const rec = (name, enc) => {
      const orig = F?.[name]?.bind(F);
      if (!orig) return;
      F[name] = (...a) => {
        if (this.live) {
          const e = enc(...a);
          if (e) this.fx.push(e);
        }
        return orig(...a);
      };
      this.unhook.push(() => { F[name] = orig; });
    };
    rec('addWater', (x, z, l, o = {}) => (l > 0 ? ['w', r3(x), r3(z), r4(l), r3(o.dirt ?? 0), r3(o.soap ?? 0), r3(o.radius ?? 0.15)] : null));
    rec('addFoam', (x, z, a, r = 0.2) => (a > 0 ? ['f', r3(x), r3(z), r4(a), r3(r)] : null));
    rec('addPowder', (x, z, kg, c = '#ffffff', r = 0.05) => (kg > 0 ? ['p', r3(x), r3(z), r4(kg), String(c).slice(0, 9), r3(r)] : null));
    rec('removeWater', (x, z, r, m = Infinity) => ['r', r3(x), r3(z), r3(r), Number.isFinite(m) ? r4(m) : -1]);
    rec('drip', (p, lps) => (lps > 0 ? ['d', r3(p.x), r3(p.y), r3(p.z), r4(lps)] : null));
    if (F?.squeegee) {
      const orig = F.squeegee.bind(F);
      F.squeegee = (id, a, b) => {
        this.blades.set(id, { id, a: { x: a.x, z: a.z }, b: { x: b.x, z: b.z }, tick: F.tick });
        return orig(id, a, b);
      };
      this.unhook.push(() => { F.squeegee = orig; });
    }
    const toast = g.hud.toast.bind(g.hud);
    g.hud.toast = (text, bad = false, ms = 2600) => {
      if (this.live) this.broadcast({ t: 'toast', text: String(text).slice(0, 200), bad: !!bad, ms });
      return toast(text, bad, ms);
    };
    this.unhook.push(() => { g.hud.toast = toast; });
    const wrapped = g.onRugWrapped;
    g.onRugWrapped = (c, ev, price) => {
      wrapped?.(c, ev, price);
      if (this.live) this.broadcast({ t: 'wrap', id: c.id, ev: liteEval(ev), price });
    };
    this.unhook.push(() => { g.onRugWrapped = wrapped; });
    const spawnF = g.spawnForklift;
    g.spawnForklift = (p) => {
      const f = spawnF(p);
      this.wrapForklift(f);
      return f;
    };
    this.unhook.push(() => { g.spawnForklift = spawnF; });
    for (const f of g.forklifts) this.wrapForklift(f);
  }

  wrapForklift(f) {
    if (f.netWrapped) return;
    f.netWrapped = true;
    const fu = f.fixedUpdate.bind(f), up = f.update.bind(f), it = f.interact.bind(f);
    f.fixedUpdate = (dt) => this.withInput(f.driver, () => fu(dt));
    f.update = (dt, a) => this.withInput(f.driver, () => up(dt, a));
    f.interact = (player, grab) => {
      if (!player?.remote) return it(player, grab);
      const g = this.game, keep = g.grab;
      g.grab = player.grab;
      try {
        it(player, grab);
      } finally {
        g.grab = keep;
      }
    };
  }

  withInput(driver, fn) {
    const inp = driver?.remote ? driver.input : null;
    if (!inp) return fn();
    const g = this.game;
    const keep = g.input;
    g.input = inp;
    try {
      fn();
    } finally {
      g.input = keep;
    }
  }

  async accept(peerId, offer, mailbox) {
    if (this.closed) return mailbox.close();
    const old = this.peers.get(peerId);
    if (old) {
      if (old.slot >= 0) return mailbox.close();
      old.aborted = true;
      old.peer?.close('replaced');
      this.peers.delete(peerId);
    }
    const taken = [...this.peers.values()].filter((e) => e.slot >= 0 || !e.aborted).length;
    if (taken >= MAX_CLIENTS) return mailbox.close();
    const entry = { id: peerId, peer: null, slot: -1, ready: false, rtt: 0, offset: 0, rttSamples: [], youKey: '', lastPoseT: -Infinity };
    this.peers.set(peerId, entry);
    let peer;
    try {
      peer = await acceptPeer(peerId, offer, mailbox);
    } catch (e) {
      if (this.peers.get(peerId) === entry) this.peers.delete(peerId);
      if (!entry.aborted) console.warn('[net] accept failed', e?.message);
      return;
    }
    if (this.closed || entry.aborted) return peer.close('host-closed');
    entry.peer = peer;
    entry.peer.maxRate = 500;
    entry.peer.onMessage = (kind, msg) => this.onMessage(entry, kind, msg);
    entry.peer.onClose = (reason) => this.drop(peerId, reason);
    entry.helloTimer = setTimeout(() => { if (entry.slot < 0) entry.peer.close('hello-timeout'); }, 10000);
  }

  freeSlot() {
    for (let s = 1; s <= MAX_CLIENTS; s++) if (![...this.peers.values()].some((e) => e.slot === s)) return s;
    return -1;
  }

  onHello(entry, msg) {
    if (entry.slot >= 0) return;
    clearTimeout(entry.helloTimer);
    if (msg.version !== this.net.version) {
      entry.peer.sendNow({ t: 'reject', reason: `Version mismatch (host ${this.net.version}, you ${msg.version})` });
      return setTimeout(() => entry.peer.close('version'), 300);
    }
    const slot = this.freeSlot();
    if (slot < 0) {
      entry.peer.sendNow({ t: 'reject', reason: 'Room is full' });
      return setTimeout(() => entry.peer.close('full'), 300);
    }
    const g = this.game;
    entry.slot = slot;
    entry.look = sanitizeLook(msg.look);
    const rp = new NetPlayer(g, { slot, peerId: entry.id, look: entry.look, physical: true, controller: true });
    const input = new NetInput();
    g.engine.add(input, 1000);
    rp.input = input;
    rp.onHit = (other, force) => this.onRemoteHit(entry, other, force);
    rp.onTeleport = (pos, yaw) => {
      entry.peer.send({ t: 'tele', p: [r3(pos.x), r3(pos.y), r3(pos.z)], yaw: r3(yaw) });
      rp.track.s.length = 0;
      rp.ignoreUntil = performance.now() + 400;
    };
    const grab = new Grab(g.engine, g.physics, input, rp, {
      carpets: g.carpets,
      hud: null,
      blocked: () => !!rp.inVehicle,
      canInteract: (o) => o.kind !== 'computer' && !o.localInteract,
    });
    g.engine.add(grab, -40);
    grab.aimFix = (aim) => this.fixAim(rp, aim);
    rp.grab = grab;
    entry.player = rp;
    if (!this.live) this.resyncShadows();
    this.syncEntities();
    entry.peer.send({ t: 'welcome', slot, room: this.roomId, version: this.net.version, h: performance.now(), name: this.net.look.name });
    this.sendSnapshot(entry);
    entry.ready = true;
    entry.peer.send({ t: 'ping', h: performance.now() });
    this.broadcastPeers();
    this.net.lobby.setPlayers(1 + [...this.peers.values()].filter((e) => e.slot > 0).length);
    this.net.emit('peer-join', this.peerInfo(entry));
  }

  peerInfo(e) {
    return { id: e.id, slot: e.slot, name: e.look?.name ?? '?', look: e.look, ping: Math.round(e.rtt) };
  }

  peerList() {
    return [...this.peers.values()].filter((e) => e.slot > 0).map((e) => this.peerInfo(e));
  }

  broadcastPeers() {
    const list = [{ id: this.net.lobby.uid, slot: 0, name: this.net.look.name, look: this.net.look, ping: 0 }, ...this.peerList()];
    this.broadcast({ t: 'peers', list });
  }

  broadcastPings() {
    this.broadcast({ t: 'pings', p: this.peerList().map((p) => [p.slot, p.ping]) });
  }

  drop(peerId, reason = 'closed') {
    const e = this.peers.get(peerId);
    if (!e) return;
    this.peers.delete(peerId);
    clearTimeout(e.helloTimer);
    e.peer?.close(reason);
    if (e.player) {
      for (const f of this.game.forklifts) if (f.driver === e.player) {
        f.driver = null;
        f.speed = 0;
      }
      e.player.dispose();
    }
    if (e.slot > 0) {
      this.broadcastPeers();
      this.net.lobby.setPlayers(1 + [...this.peers.values()].filter((x) => x.slot > 0).length);
      this.net.emit('peer-leave', { ...this.peerInfo(e), reason });
    }
  }

  onMessage(entry, kind, msg) {
    if (msg instanceof ArrayBuffer) {
      const type = new Uint8Array(msg, 0, 1)[0];
      if (type === MSG_POSE && entry.player) {
        const pk = decodePose(msg);
        if (!pk) return;
        this.applyPose(entry, pk.v, pk.t);
      }
      return;
    }
    if (!msg || typeof msg.t !== 'string') return;
    switch (msg.t) {
      case 'hello': return this.onHello(entry, msg);
      case 'in': return this.onInput(entry, msg);
      case 'ping': return entry.peer.send({ t: 'pong', c: msg.c, h: performance.now() });
      case 'pong': return this.onPong(entry, msg);
      case 'order': return this.onOrder(entry, msg);
      case 'needSurf': return this.sendFullSurface(entry, msg.id);
      case 'insp':
        if (Number.isFinite(msg.id)) (this.inspect ??= new Set()).add(msg.id);
        return;
      case 'bye': return this.drop(entry.id, 'left');
    }
  }

  applyPose(entry, v, ct) {
    const rp = entry.player;
    if (!rp || ct <= entry.lastPoseT) return;
    if (performance.now() < (rp.ignoreUntil ?? 0)) return;
    entry.lastPoseT = ct;
    if (v.flags & 2 && !rp.inVehicle) v.flags &= ~2;
    rp.applyPose(v);
    rp.track.push(ct - entry.offset, v);
  }

  onInput(entry, msg) {
    const rp = entry.player;
    if (!rp) return;
    if (Array.isArray(msg.p) && msg.p.length === 6 && msg.p.every(Number.isFinite) && performance.now() >= (rp.ignoreUntil ?? 0)) {
      rp.feet.set(msg.p[0], msg.p[1], msg.p[2]);
      rp.yaw = msg.p[3];
      rp.pitch = msg.p[4];
      rp.eyeH = msg.p[5];
      rp.updateCamera();
    }
    if (Array.isArray(msg.a) && msg.a.length === 4 && msg.a.every(Number.isFinite)) rp.aimHint = { id: msg.a[0], p: new THREE.Vector3(msg.a[1], msg.a[2], msg.a[3]), until: performance.now() + 300 };
    if (Array.isArray(msg.e)) for (const ev of msg.e.slice(0, 32)) {
      if (Array.isArray(ev) && CODES.has(ev[0])) rp.input.apply(ev[0], !!ev[1]);
    }
    if (Number.isFinite(msg.w)) rp.input.wheel += Math.max(-10, Math.min(10, msg.w));
  }

  fixAim(rp, aim) {
    const h = rp.aimHint;
    if (!h || performance.now() > h.until) return aim;
    const ent = h.id === this.game.hose?.lance?.id ? this.game.hose.lance : this.game.entities.get(h.id);
    if (!ent || aim?.owner === ent) return aim;
    const eye = rp.eye;
    if (ent.kind === 'carpet') {
      const dir = h.p.clone().sub(eye);
      const len = dir.length();
      if (len > 3.2) return aim;
      const hit = ent.raycast(eye, dir.normalize(), 3.4);
      if (!hit) return aim;
      return { distance: hit.distance, point: hit.point.clone(), normal: hit.normal.clone(), owner: ent, carpetHit: { ...hit, carpet: ent }, collider: null };
    }
    const b = ent.body;
    if (!b) return aim;
    const t = b.translation();
    const point = new THREE.Vector3(t.x, t.y, t.z);
    if (h.p.distanceTo(point) > 0.8 || point.distanceTo(eye) > 3.2) return aim;
    return { distance: point.distanceTo(eye), point: h.p.clone(), normal: new THREE.Vector3(0, 1, 0), owner: ent, carpetHit: null, collider: null };
  }

  onPong(entry, msg) {
    const now = performance.now();
    if (!Number.isFinite(msg.h) || !Number.isFinite(msg.c)) return;
    const rtt = now - msg.h;
    entry.rttSamples.push({ rtt, off: msg.c + rtt / 2 - now });
    if (entry.rttSamples.length > 10) entry.rttSamples.shift();
    const best = entry.rttSamples.reduce((a, b) => (b.rtt < a.rtt ? b : a));
    entry.offset = best.off;
    entry.rtt = entry.rtt ? entry.rtt * 0.7 + rtt * 0.3 : rtt;
  }

  onOrder(entry, msg) {
    const shop = this.game.shop;
    const it = shop?.catalog().find((c) => !c.sec && c.kind === msg.kind && c.id === msg.id);
    if (it) shop.buy(it);
  }

  onRemoteHit(entry, other, force) {
    const rp = entry.player;
    const now = performance.now();
    if (!rp || rp.ragdolled || now < rp.immuneUntil) return;
    const b = other?.body;
    if (!b || !b.isDynamic?.() || other === rp.grab?.held?.item || b === rp.grab?.heldBody()) return;
    const v = b.linvel();
    const rel = new THREE.Vector3(v.x - rp.velocity.x, v.y - rp.velocity.y, v.z - rp.velocity.z);
    const speed = rel.length();
    const t = b.translation();
    const toPlayer = new THREE.Vector3(rp.feet.x - t.x, rp.feet.y + 0.9 - t.y, rp.feet.z - t.z);
    const momentum = b.mass() * speed;
    if (speed > 5 && momentum > 14 && rel.dot(toPlayer) > 0) {
      rel.multiplyScalar(Math.min(4, momentum * 0.15));
      rp.immuneUntil = now + 4000;
      entry.peer.send({ t: 'rag', imp: [r3(rel.x), r3(rel.y), r3(rel.z)], reason: 'hit' });
    }
  }

  sig(e) {
    if (e.kind === 'item') return `item:${e.productId ?? e.toolId}`;
    if (e.kind === 'carpet') return `carpet:${e.type}:${e.seed}`;
    return e.kind;
  }

  shadowFor(c) {
    let s = this.shadows.get(c);
    if (!s) {
      s = new SurfaceShadow(c.surface);
      s.lastScan = 0;
      this.shadows.set(c, s);
    }
    return s;
  }

  resyncShadows() {
    for (const [c, sh] of this.shadows) {
      for (const n of Object.keys(sh.data)) sh.data[n].set(c.surface.data[n]);
      sh.pending.clear();
      c.surface.netDirty.clear();
      sh.hash = sh.checksum();
    }
  }

  syncEntities() {
    const g = this.game;
    const cur = new Map();
    for (const e of networkEntities(g)) cur.set(e.id, e);
    const spawns = [], despawns = [];
    for (const [id, sig] of this.known) {
      const e = cur.get(id);
      if (!e || this.sig(e) !== sig) {
        despawns.push(id);
        this.known.delete(id);
        this.lastBodies.delete(id);
        this.itemStates.delete(id);
        this.evals.delete(id);
      }
    }
    for (const [id, e] of cur) {
      if (this.known.has(id)) continue;
      this.known.set(id, this.sig(e));
      const d = describe(g, e);
      if (!d) continue;
      if (e.kind === 'carpet') d.hash = this.shadowFor(e).hash;
      spawns.push(d);
    }
    for (const c of [...this.shadows.keys()]) if (!cur.has(c.id) || cur.get(c.id) !== c) this.shadows.delete(c);
    if (despawns.length) this.broadcast({ t: 'despawn', ids: despawns });
    if (spawns.length) this.broadcast({ t: 'spawn', e: spawns });
  }

  holdList() {
    const out = [];
    const add = (slot, gr) => {
      const h = gr?.held;
      if (!h) return;
      const ent = h.item ?? h.owner ?? h.carpet;
      if (ent?.id === undefined) return;
      out.push([slot, h.kind, ent.id]);
    };
    add(0, this.game.grab);
    for (const e of this.peers.values()) if (e.player) add(e.slot, e.player.grab);
    return out;
  }

  itemState(it) {
    return [it.id, r3(it.fill ?? -1), it.on ? 1 : 0, it.beater ? 1 : 0, it.dots ?? 0, Math.round((it.tank ?? 0) * 100) / 100, it.using ? 1 : 0];
  }

  sendSnapshot(entry) {
    const g = this.game;
    const now = performance.now();
    const ents = [];
    for (const e of networkEntities(g)) {
      const d = describe(g, e);
      if (d) ents.push(d);
    }
    const items = g.items.map((it) => this.itemState(it));
    const p = entry.peer;
    p.send({
      t: 'snap', ents, items, holds: this.holdList(), money: g.economy.money, roller: g.roller?.message ?? null,
      sdefs: this.streamDefs, evals: [...this.evals.entries()], stats: g.stats,
    });
    for (const c of g.carpets?.list ?? []) {
      p.send(encodeCloth(c, now, true));
      p.send(encodeFull(c.id, this.shadowFor(c)));
    }
    p.send({ t: 'snapEnd' });
  }

  sendFullSurface(entry, id) {
    const c = this.game.entities.get(id);
    if (!c || c.kind !== 'carpet') return;
    entry.peer.send(encodeCloth(c, performance.now(), true));
    entry.peer.send(encodeFull(c.id, this.shadowFor(c)));
  }

  broadcast(msg) {
    for (const e of this.peers.values()) if (e.ready && e.peer && !e.peer.closed) e.peer.send(msg);
  }

  broadcastState(buf) {
    for (const e of this.peers.values()) if (e.ready && e.peer && !e.peer.closed) e.peer.sendState(buf);
  }

  slotOf(player) {
    if (player === this.game.player) return 0;
    return player?.slot ?? -1;
  }

  localPose() {
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
    return {
      pos: [p.p1.x, p.p1.y, p.p1.z], yaw: p.yaw, pitch: p.pitch, crouch: p.crouch, eyeH: p.eyeH,
      speed: Math.hypot(p.velocity.x, p.velocity.z), vel: [p.velocity.x, p.velocity.y, p.velocity.z],
      flags: (act ? 1 : 0) | (p.inVehicle ? 2 : 0) | (p.sprinting ? 4 : 0) | (p.grounded ? 8 : 0), parts,
    };
  }

  remotePose(rp) {
    const at = rp.inVehicle ? rp.p1 : rp.feet;
    return {
      pos: [at.x, at.y, at.z], yaw: rp.yaw, pitch: rp.pitch, crouch: rp.crouch, eyeH: rp.eyeH, speed: rp.speed,
      vel: [rp.velocity.x, rp.velocity.y, rp.velocity.z], flags: (rp.flags & ~2) | (rp.inVehicle ? 2 : 0), parts: rp.parts,
    };
  }

  collectStreams() {
    const g = this.game;
    const parts = g.fluids?.particles;
    if (!parts) return [];
    const owner = new Map();
    for (const it of g.items) if (it.stream) owner.set(it.stream, it.id);
    const out = [];
    const tick = g.fluids.tick;
    for (const s of parts.streams) {
      if (s === g.hose?.stream) continue;
      const id = owner.get(s);
      if (id === undefined) continue;
      if (!this.streamIds.has(s)) {
        this.streamIds.set(s, id);
        const def = { sid: id, kind: s.kind, color: s.colorHex, rate: s.rate, speed: s.speed, spread: s.spread, size: s.size, pps: s.pps, productId: s.productId };
        this.streamDefs = this.streamDefs.filter((d) => d.sid !== id);
        this.streamDefs.push(def);
        this.broadcast({ t: 'sdef', s: [def] });
      }
      if (!s.active || s.lastTick < tick - 2) continue;
      out.push({ sid: id, kind: s.kind, origin: s.origin, dir: s.dir, hv: null });
    }
    return out;
  }

  collectBlades() {
    const tick = this.game.fluids?.tick ?? 0;
    const out = [];
    for (const [id, b] of this.blades) {
      if (tick - b.tick > 2) {
        if (tick - b.tick > 120) this.blades.delete(id);
        continue;
      }
      out.push(b);
    }
    return out;
  }

  buildState(key) {
    const g = this.game;
    const now = performance.now();
    const players = [[0, this.localPose()]];
    for (const e of this.peers.values()) if (e.player?.hasPose) players.push([e.slot, this.remotePose(e.player)]);
    const bodies = [];
    const consider = (id, b) => {
      if (!b) return;
      const t = b.translation(), r = b.rotation();
      let last = this.lastBodies.get(id);
      const moved = !last || Math.abs(last.v[0] - t.x) + Math.abs(last.v[1] - t.y) + Math.abs(last.v[2] - t.z) > 0.0006 ||
        Math.abs(last.v[3] - r.x) + Math.abs(last.v[4] - r.y) + Math.abs(last.v[5] - r.z) + Math.abs(last.v[6] - r.w) > 0.0008;
      if (moved) {
        last = { v: [t.x, t.y, t.z, r.x, r.y, r.z, r.w], at: now };
        this.lastBodies.set(id, last);
      }
      if (key || moved || now - last.at < 350) bodies.push({ id, p: t, q: r });
    };
    for (const e of networkEntities(g)) if (e.kind === 'item' || e.kind === 'cart') consider(e.id, e.body);
    if (g.hose?.lance?.id !== undefined) consider(g.hose.lance.id, g.hose.lance.body);
    const carpets = [];
    for (const c of g.carpets?.list ?? []) {
      const k = coreKey(c);
      let last = this.lastCore.get(c);
      if (!last || last.k !== k) {
        last = { k, at: now };
        this.lastCore.set(c, last);
      }
      if (key || now - last.at < 350) carpets.push(c);
    }
    let hoseSlot = 255;
    if (g.hose) {
      if (g.grab.held?.item === g.hose.lance) hoseSlot = 0;
      for (const e of this.peers.values()) if (e.player?.grab?.held?.item === g.hose.lance) hoseSlot = e.slot;
    }
    return encodeState({
      t: now, seq: this.seq++, key, players, bodies, carpets, trucks: g.trucks, hose: g.hose, hoseSlot, roller: g.roller,
      forklifts: g.forklifts, slotOf: (p) => this.slotOf(p), streams: this.collectStreams(), blades: this.collectBlades(),
    });
  }

  sendCloth(now) {
    const list = [...(this.game.carpets?.list ?? [])];
    list.sort((a, b) => (this.clothState.get(a)?.at ?? 0) - (this.clothState.get(b)?.at ?? 0));
    let budget = CLOTH_BUDGET;
    for (const c of list) {
      const st = this.clothState.get(c) ?? { moving: false, at: 0, len: c.rolledLen };
      const moving = !c.asleep || c.forceRender > 0 || Math.abs(st.len - c.rolledLen) > 1e-6;
      if (moving) {
        if (budget <= 0 && now - st.at < 400) continue;
        const buf = encodeCloth(c, now);
        budget -= buf.byteLength;
        this.broadcastState(buf);
        st.moving = true;
        st.at = now;
      } else if (st.moving || now - st.at > 10000) {
        this.broadcast(encodeCloth(c, now, true));
        st.moving = false;
        st.at = now;
      }
      st.len = c.rolledLen;
      this.clothState.set(c, st);
    }
  }

  syncSlow() {
    const g = this.game;
    this.syncEntities();
    const items = [];
    for (const it of g.items) {
      const s = this.itemState(it);
      const k = s.join(',');
      if (this.itemStates.get(it.id) !== k) {
        this.itemStates.set(it.id, k);
        items.push(s);
      }
    }
    if (items.length) this.broadcast({ t: 'items', s: items });
    if (g.economy.money !== this.money) {
      this.money = g.economy.money;
      this.broadcast({ t: 'money', v: this.money, stats: g.stats });
    }
    const sh = g.shift;
    if (sh) {
      const k = `${sh.day}|${sh.ended}|${Math.floor(sh.t / 2)}`;
      if (k !== this.shiftKey) {
        const endedNow = sh.ended && !this.shiftEnded;
        this.shiftKey = k;
        this.shiftEnded = sh.ended;
        this.broadcast({ t: 'shift', day: sh.day, time: sh.t, ended: sh.ended, running: sh.running });
        if (endedNow) this.broadcast({ t: 'report', day: sh.day, s: sh.stats });
      }
    }
    const msg = g.roller?.message ?? null;
    if (msg !== this.rollerMsg) {
      this.rollerMsg = msg;
      this.broadcast({ t: 'roller', msg });
    }
  }

  syncHolds() {
    const holds = this.holdList();
    const hk = JSON.stringify(holds);
    if (hk !== this.holdKey) {
      this.holdKey = hk;
      this.broadcast({ t: 'holds', h: holds });
    }
  }

  syncYou() {
    for (const e of this.peers.values()) {
      const rp = e.player;
      if (!e.ready || !rp) continue;
      const veh = rp.inVehicle?.id ?? 0;
      const sm = Math.round(rp.speedMul * 20) / 20;
      const k = `${veh}|${sm}`;
      if (k !== e.youKey) {
        e.youKey = k;
        e.peer.send({ t: 'you', veh, speedMul: sm });
      }
    }
  }

  syncSurfaces(now) {
    const list = this.game.carpets?.list ?? [];
    if (!list.length) return;
    for (let n = 0; n < list.length; n++) {
      const c = list[(this.surfIdx + n) % list.length];
      const sh = this.shadowFor(c);
      if (now - sh.lastScan < 190) continue;
      this.surfIdx = (this.surfIdx + n + 1) % list.length;
      sh.lastScan = now;
      const entries = sh.collect(now);
      if (entries) this.broadcast(encodeDelta(c.id, sh, entries));
      return;
    }
  }

  syncEval() {
    const g = this.game;
    const ids = [...(this.inspect ?? [])];
    if (!ids.length) return;
    const id = ids[this.evalIdx++ % ids.length];
    this.inspect.delete(id);
    const c = g.entities.get(id);
    if (c?.kind !== 'carpet') return;
    const ev = liteEval(g.chem.evaluate(c));
    if (!ev) return;
    const k = JSON.stringify(ev);
    if (this.evalKeys?.get(c.id) === k) return;
    (this.evalKeys ??= new Map()).set(c.id, k);
    this.evals.set(c.id, ev);
    this.broadcast({ t: 'eval', id: c.id, ev });
  }

  preStep(dt) {
    const t0 = performance.now();
    for (const e of this.peers.values()) e.player?.moveBody(dt);
    this.cost(performance.now() - t0);
  }

  timed(k, fn) {
    const t0 = performance.now();
    fn();
    const s = (this.stats.sec ??= {});
    s[k] = (s[k] ?? 0) + performance.now() - t0;
  }

  cost(ms) {
    const s = this.stats;
    s.acc = (s.acc ?? 0) + ms;
  }

  postStep() {
    const t0 = performance.now();
    this.postStepInner();
    this.cost(performance.now() - t0);
  }

  postStepInner() {
    if (this.closed) return;
    const t = ++this.tick;
    const now = performance.now();
    if (!this.live) {
      this.fx.length = 0;
      if (t % 12 === 0) this.syncEntities();
      return;
    }
    if (t % 3 === 0) this.timed('state', () => {
      this.syncHolds();
      const buf = this.buildState(t % KEYFRAME_TICKS === 0);
      this.stats.stateBytes = buf.byteLength;
      this.broadcastState(buf);
      this.syncYou();
      if (this.fx.length) {
        this.broadcast({ t: 'fx', e: this.fx.splice(0, 400) });
      }
    });
    if (t % 6 === 0) this.timed('cloth', () => this.sendCloth(now));
    if (t % 12 === 0) this.timed('slow', () => this.syncSlow());
    if (t % 20 === 0) this.timed('eval', () => this.syncEval());
    this.timed('surface', () => this.syncSurfaces(now));
    if (t % 60 === 0) {
      for (const e of this.peers.values()) if (e.ready) e.peer.send({ t: 'ping', h: now });
      if (t % 300 === 0) this.broadcastPings();
      this.measure(now);
    }
  }

  measure(now) {
    const dt = (now - (this.lastMeasure ?? now - 1000)) / 1000;
    this.lastMeasure = now;
    this.stats.msPerSec = (this.stats.acc ?? 0) / dt;
    this.stats.acc = 0;
    this.stats.split = Object.fromEntries(Object.entries(this.stats.sec ?? {}).map(([k, v]) => [k, +(v / dt).toFixed(1)]));
    this.stats.sec = {};
    for (const e of this.peers.values()) {
      if (!e.peer) continue;
      const sent = e.peer.sent.control + e.peer.sent.state, recv = e.peer.recv.control + e.peer.recv.state;
      const prev = e.lastBytes ?? { sent, recv };
      e.rate = { upKBs: (sent - prev.sent) / 1024 / dt, downKBs: (recv - prev.recv) / 1024 / dt, controlBuffered: e.peer.controlBuffered, dropped: e.peer.dropped };
      e.lastBytes = { sent, recv };
    }
  }

  frame() {
    const now = performance.now();
    for (const e of this.peers.values()) {
      const rp = e.player;
      if (!rp?.avatar) continue;
      if (!rp.hasPose) {
        rp.avatar.object3d.visible = false;
        continue;
      }
      const h = rp.grab?.held;
      rp.holding = h ? { kind: h.kind, id: (h.item ?? h.owner ?? h.carpet)?.id ?? null } : null;
      if (rp.inVehicle) {
        rp.renderAvatar({ pos: [rp.p1.x, rp.p1.y, rp.p1.z], yaw: rp.yaw, pitch: rp.pitch, crouch: 0, speed: 0, parts: null });
        continue;
      }
      const b = e.rttSamples.length ? rp.track.bracket(now - 80) : null;
      const last = rp.track.last?.v;
      if (!b && !last) continue;
      rp.renderAvatar(b ? lerpPose(b.a, b.b, b.k, rp.view.pose ??= {}) : last);
    }
  }

  pushers() {
    const out = [];
    for (const e of this.peers.values()) if (e.player) out.push(...e.player.pushers());
    return out;
  }

  remoteGrabs() {
    const out = [];
    for (const e of this.peers.values()) if (e.player?.grab) out.push(e.player.grab);
    return out;
  }

  report() {
    return {
      room: this.roomId,
      stateBytes: this.stats.stateBytes,
      netMsPerSec: +(this.stats.msPerSec ?? 0).toFixed(2),
      netSplit: this.stats.split,
      peers: [...this.peers.values()].map((e) => ({ slot: e.slot, name: e.look?.name, rtt: Math.round(e.rtt), ...(e.rate ?? {}) })),
    };
  }

  close() {
    if (this.closed) return;
    for (const e of this.peers.values()) e.peer?.sendNow?.({ t: 'bye' });
    this.closed = true;
    this.connected = false;
    const g = this.game;
    for (const e of [...this.peers.values()]) this.drop(e.id, 'host-closed');
    g.engine.remove(this.sys);
    g.engine.remove(this.post);
    for (const u of this.unhook ?? []) u();
    this.net.lobby.closeRoom();
  }
}
