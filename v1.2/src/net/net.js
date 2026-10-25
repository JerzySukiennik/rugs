// Rug Rush networking facade for the lobby UI: public room list, host/join/leave, peers and events; solo play is untouched until host() or join().
import { Lobby } from './lobby.js';
import { HostSession } from './host.js';
import { ClientSession } from './client.js';
import { loadLook, sanitizeLook } from './avatarAdapter.js';

export const NET_VERSION = 'rr2-1';
export const MAX_PLAYERS = 4;

export class Net {
  constructor(game) {
    this.game = game;
    this.version = NET_VERSION;
    this.maxPlayers = MAX_PLAYERS;
    this.lobby = new Lobby(NET_VERSION);
    this.mode = 'solo';
    this.session = null;
    this.handlers = new Map();
    this.look = loadLook();
    this.roomId = null;
    addEventListener('pagehide', () => this.leave());
  }

  get isHost() {
    return this.mode === 'host';
  }

  get isClient() {
    return this.mode === 'client';
  }

  get connected() {
    return !!this.session?.connected;
  }

  get peers() {
    return this.session?.peerList() ?? [];
  }

  get selfId() {
    return this.lobby.uid;
  }

  get slot() {
    return this.mode === 'client' ? this.session?.slot ?? -1 : 0;
  }

  on(evt, fn) {
    if (!this.handlers.has(evt)) this.handlers.set(evt, new Set());
    this.handlers.get(evt).add(fn);
    return () => this.off(evt, fn);
  }

  off(evt, fn) {
    this.handlers.get(evt)?.delete(fn);
  }

  emit(evt, data) {
    for (const fn of this.handlers.get(evt) ?? []) {
      try {
        fn(data);
      } catch (e) {
        console.error(`[net] ${evt} handler`, e);
      }
    }
  }

  setMode(m) {
    this.mode = m;
  }

  listRooms(cb) {
    return this.lobby.listRooms(cb);
  }

  setLook(look) {
    this.look = sanitizeLook(look);
    try {
      localStorage.setItem('rugrush.look', JSON.stringify(this.look));
    } catch {}
    return this.look;
  }

  async host({ name, look } = {}) {
    if (this.session) throw new Error('Already in an online session. Call leave() first.');
    if (look) this.look = sanitizeLook(look);
    const roomName = String(name ?? '').trim() || `${this.look.name}'s warehouse`;
    const s = new HostSession(this, this.game);
    this.session = s;
    this.mode = 'host';
    try {
      this.roomId = await s.open(roomName);
    } catch (e) {
      s.close();
      this.session = null;
      this.mode = 'solo';
      this.emit('error', e);
      throw e;
    }
    return { roomId: this.roomId, name: roomName };
  }

  async join(roomId, { look } = {}) {
    if (this.session) throw new Error('Already in an online session. Call leave() first.');
    if (look) this.look = sanitizeLook(look);
    const s = new ClientSession(this, this.game);
    this.session = s;
    try {
      await s.connect(roomId);
    } catch (e) {
      s.silent = true;
      s.onClosed?.('join-failed');
      s.peer?.close('join-failed');
      this.session = null;
      if (!s.mirroring) this.mode = 'solo';
      this.emit('error', e);
      throw e;
    }
    this.roomId = roomId;
    return { roomId, slot: s.slot, host: s.hostName };
  }

  leave() {
    const s = this.session;
    if (!s) return;
    s.close();
    this.session = null;
    this.roomId = null;
    if (this.mode === 'host') this.mode = 'solo';
  }

  order(kind, id) {
    if (this.isClient) this.session?.peer?.send({ t: 'order', kind, id });
  }

  pushers() {
    return this.session?.pushers() ?? [];
  }

  remoteGrabs() {
    return this.session?.remoteGrabs() ?? [];
  }

  report() {
    return { mode: this.mode, room: this.roomId, connected: this.connected, ...(this.session?.report() ?? {}) };
  }
}
