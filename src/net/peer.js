// Rug Rush WebRTC transport: one peer connection with a reliable ordered control channel and an unreliable state channel, chunking, ordered async sends and byte counters.
export const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];
const CHUNK = 16000;
const STATE_BUFFER_LIMIT = 192 * 1024;
const JSON_BIN = 254;
const CHUNK_BIN = 255;

export class Peer {
  constructor(id, pc) {
    this.id = id;
    this.pc = pc;
    this.control = null;
    this.state = null;
    this.handler = null;
    this.backlog = [];
    this.onClose = null;
    this.closed = false;
    this.queue = Promise.resolve();
    this.chunks = new Map();
    this.chunkId = 1;
    this.sent = { control: 0, state: 0 };
    this.tally = new Map();
    this.recv = { control: 0, state: 0 };
    this.dropped = 0;
    this.msgWindow = 0;
    this.msgCount = 0;
    this.maxRate = Infinity;
    pc.addEventListener('connectionstatechange', () => {
      const s = pc.connectionState;
      if (s === 'failed' || s === 'closed') this.close(s);
      if (s === 'disconnected') {
        clearTimeout(this.dcTimer);
        this.dcTimer = setTimeout(() => { if (pc.connectionState === 'disconnected') this.close('disconnected'); }, 8000);
      }
    });
  }

  set onMessage(fn) {
    this.handler = fn;
    const q = this.backlog.splice(0);
    for (const [k, m] of q) fn(k, m);
  }

  get onMessage() {
    return this.handler;
  }

  deliver(kind, msg) {
    if (this.handler) this.handler(kind, msg);
    else if (this.backlog.length < 2000) this.backlog.push([kind, msg]);
  }

  bind(ch) {
    ch.binaryType = 'arraybuffer';
    if (ch.label === 'control') this.control = ch;
    else if (ch.label === 'state') this.state = ch;
    else return ch.close();
    ch.onmessage = (e) => this.receive(ch.label, e.data);
    ch.onclose = () => this.close('channel-closed');
  }

  get open() {
    return !this.closed && this.control?.readyState === 'open' && this.state?.readyState === 'open';
  }

  waitOpen(timeout = 20000) {
    return new Promise((resolve, reject) => {
      const t0 = performance.now();
      const check = () => {
        if (this.open) return resolve();
        if (this.closed) return reject(new Error('Connection closed'));
        if (performance.now() - t0 > timeout) return reject(new Error('Connection timed out (no route between peers, TURN is not configured)'));
        setTimeout(check, 50);
      };
      check();
    });
  }

  receive(kind, data) {
    const size = typeof data === 'string' ? data.length : data.byteLength;
    this.recv[kind] += size;
    const now = performance.now();
    if (now - this.msgWindow > 1000) {
      this.msgWindow = now;
      this.msgCount = 0;
    }
    if (++this.msgCount > this.maxRate) {
      this.dropped++;
      return;
    }
    this.dispatch(kind, data);
  }

  dispatch(kind, data) {
    if (typeof data === 'string') {
      let msg = null;
      try { msg = JSON.parse(data); } catch { return; }
      return this.deliver(kind, msg);
    }
    if (data.byteLength < 1) return;
    const type = new Uint8Array(data, 0, 1)[0];
    if (type === CHUNK_BIN) return this.chunk(kind, data);
    if (type === JSON_BIN) {
      let msg = null;
      try { msg = JSON.parse(new TextDecoder().decode(new Uint8Array(data, 1))); } catch { return; }
      return this.deliver(kind, msg);
    }
    this.deliver(kind, data);
  }

  chunk(kind, data) {
    const dv = new DataView(data);
    const id = dv.getUint32(1, true), idx = dv.getUint16(5, true), n = dv.getUint16(7, true);
    if (n > 4096) return;
    let c = this.chunks.get(id);
    if (!c) {
      c = { parts: new Array(n), got: 0, t: performance.now() };
      this.chunks.set(id, c);
    }
    if (!c.parts[idx]) {
      c.parts[idx] = new Uint8Array(data, 9);
      c.got++;
    }
    if (c.got < n) return;
    this.chunks.delete(id);
    let len = 0;
    for (const p of c.parts) len += p.length;
    const out = new Uint8Array(len);
    let o = 0;
    for (const p of c.parts) { out.set(p, o); o += p.length; }
    this.dispatch(kind, out.buffer);
  }

  raw(ch, data) {
    if (!ch || ch.readyState !== 'open') return false;
    try {
      ch.send(data);
      const n = typeof data === 'string' ? data.length : data.byteLength;
      this.sent[ch.label] += n;
      const k = typeof data === 'string' ? (data.slice(6, data.indexOf('"', 6)) || 'json') : `b${new Uint8Array(data, 0, 1)[0] === 255 ? new Uint8Array(data, 9, 1)[0] : new Uint8Array(data, 0, 1)[0]}`;
      this.tally.set(k, (this.tally.get(k) ?? 0) + n);
      return true;
    } catch (e) {
      console.warn('[net] send', e?.message);
      return false;
    }
  }

  sendNow(data) {
    let bin = data;
    if (typeof data !== 'string' && !(data instanceof ArrayBuffer)) {
      const s = JSON.stringify(data);
      if (s.length <= CHUNK) return this.raw(this.control, s);
      const b = new TextEncoder().encode(s);
      const u = new Uint8Array(b.length + 1);
      u[0] = JSON_BIN;
      u.set(b, 1);
      bin = u.buffer;
    }
    if (typeof bin === 'string' || bin.byteLength <= CHUNK) return this.raw(this.control, bin);
    const u8 = new Uint8Array(bin);
    const n = Math.ceil(u8.length / CHUNK);
    const id = this.chunkId++;
    for (let i = 0; i < n; i++) {
      const part = u8.subarray(i * CHUNK, Math.min(u8.length, (i + 1) * CHUNK));
      const m = new Uint8Array(part.length + 9);
      const dv = new DataView(m.buffer);
      m[0] = CHUNK_BIN;
      dv.setUint32(1, id, true);
      dv.setUint16(5, i, true);
      dv.setUint16(7, n, true);
      m.set(part, 9);
      this.raw(this.control, m.buffer);
    }
    return true;
  }

  send(msg) {
    if (this.closed) return;
    if (msg instanceof Promise) {
      this.queue = this.queue.then(() => msg).then((m) => { if (m) this.sendNow(m); }).catch((e) => console.warn('[net] queued send', e?.message));
    } else {
      this.queue = this.queue.then(() => { this.sendNow(msg); });
    }
  }

  sendState(buf) {
    const ch = this.state;
    if (!ch || ch.readyState !== 'open') return false;
    if (ch.bufferedAmount > STATE_BUFFER_LIMIT) {
      this.dropped++;
      return false;
    }
    return this.raw(ch, buf);
  }

  get controlBuffered() {
    return this.control?.bufferedAmount ?? 0;
  }

  close(reason = 'closed') {
    if (this.closed) return;
    this.closed = true;
    clearTimeout(this.dcTimer);
    try { this.control?.close(); } catch {}
    try { this.state?.close(); } catch {}
    try { this.pc.close(); } catch {}
    this.onClose?.(reason);
  }
}

class CandidateGate {
  constructor(pc) {
    this.pc = pc;
    this.queue = [];
  }

  async add(c) {
    if (!c?.candidate) return;
    if (!this.pc.remoteDescription) {
      if (this.queue.length < 128) this.queue.push(c);
      return;
    }
    await this.pc.addIceCandidate(c).catch((e) => console.warn('[net] ice', e?.message));
  }

  async flush() {
    while (this.queue.length) await this.pc.addIceCandidate(this.queue.shift()).catch(() => {});
  }
}

export async function acceptPeer(id, offer, mailbox) {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  const peer = new Peer(id, pc);
  const gate = new CandidateGate(pc);
  pc.ondatachannel = (e) => peer.bind(e.channel);
  pc.onicecandidate = (e) => { if (e.candidate) mailbox.ice(e.candidate).catch((err) => console.warn('[net] host ice', err?.message)); };
  mailbox.onIce((c) => gate.add(c));
  try {
    await pc.setRemoteDescription(offer);
    await gate.flush();
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await mailbox.answer(pc.localDescription);
    await peer.waitOpen(20000);
  } catch (e) {
    peer.close('accept-failed');
    mailbox.close();
    throw e;
  }
  setTimeout(() => mailbox.close(), 1500);
  return peer;
}

export async function connectToHost(lobby, roomId) {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  const peer = new Peer('host', pc);
  peer.bind(pc.createDataChannel('control', { ordered: true }));
  peer.bind(pc.createDataChannel('state', { ordered: false, maxRetransmits: 0 }));
  const gate = new CandidateGate(pc);
  const early = [];
  let mb = null;
  pc.onicecandidate = (e) => {
    if (!e.candidate) return;
    if (mb) mb.ice(e.candidate).catch(() => {});
    else early.push(e.candidate);
  };
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  let answered = false;
  try {
    mb = await lobby.guestMailbox(roomId, pc.localDescription, async (ans) => {
      if (answered || pc.signalingState !== 'have-local-offer') return;
      answered = true;
      try {
        await pc.setRemoteDescription(ans);
        await gate.flush();
      } catch (e) {
        console.warn('[net] answer', e?.message);
      }
    }, (c) => gate.add(c));
    for (const c of early) await mb.ice(c).catch(() => {});
    await peer.waitOpen(20000);
  } catch (e) {
    peer.close('connect-failed');
    await mb?.close();
    throw e;
  }
  mb.close();
  return peer;
}
