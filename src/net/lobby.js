// Rug Rush lobby: Firebase anonymous auth, the public room list with heartbeat and stale cleanup, and SDP/ICE mailboxes for WebRTC.
const SDK = 'https://www.gstatic.com/firebasejs/10.12.2';
const ROOT = 'rugRush';

export const FIREBASE = {
  apiKey: 'AIzaSyAaTuELH_mToxH3hRJ4WPIVTECSH7Z8-FY',
  authDomain: 'gzowos-games.firebaseapp.com',
  databaseURL: 'https://gzowos-games-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'gzowos-games',
  storageBucket: 'gzowos-games.firebasestorage.app',
  messagingSenderId: '658227201482',
  appId: '1:658227201482:web:627b44e3c4c2988bc4bb33',
};

export const BEAT_MS = 5000;
export const STALE_MS = 30000;
const MAX_ICE = 64;

let fbPromise = null;

export function connectFirebase() {
  if (fbPromise) return fbPromise;
  fbPromise = (async () => {
    const [app, db, auth] = await Promise.all([
      import(`${SDK}/firebase-app.js`),
      import(`${SDK}/firebase-database.js`),
      import(`${SDK}/firebase-auth.js`),
    ]);
    const a = app.getApps().find((x) => x.name === 'rugrush') ?? app.initializeApp(FIREBASE, 'rugrush');
    const database = db.getDatabase(a);
    const au = auth.getAuth(a);
    await auth.setPersistence(au, auth.inMemoryPersistence).catch(() => {});
    if (!au.currentUser) await auth.signInAnonymously(au);
    const fb = { ...db, db: database, uid: au.currentUser.uid, offset: 0 };
    db.onValue(db.ref(database, '.info/serverTimeOffset'), (s) => { fb.offset = s.val() || 0; });
    return fb;
  })();
  fbPromise.catch(() => { fbPromise = null; });
  return fbPromise;
}

function iceJson(c) {
  const j = c.toJSON ? c.toJSON() : c;
  const out = { candidate: String(j.candidate ?? '') };
  if (typeof j.sdpMid === 'string') out.sdpMid = j.sdpMid;
  if (typeof j.sdpMLineIndex === 'number') out.sdpMLineIndex = j.sdpMLineIndex;
  if (typeof j.usernameFragment === 'string') out.usernameFragment = j.usernameFragment;
  return out;
}

export class Lobby {
  constructor(version) {
    this.version = version;
    this.fb = null;
    this.room = null;
  }

  async ready() {
    this.fb = await connectFirebase();
    return this.fb;
  }

  get uid() {
    return this.fb?.uid ?? null;
  }

  now() {
    return Date.now() + (this.fb?.offset ?? 0);
  }

  ref(path) {
    return this.fb.ref(this.fb.db, `${ROOT}/${path}`);
  }

  listRooms(cb) {
    let off = null;
    let rooms = {};
    let stopped = false;
    const emit = () => {
      const now = this.now();
      const out = [];
      for (const [id, r] of Object.entries(rooms)) {
        if (!r || typeof r.beat !== 'number') continue;
        if (now - r.beat > STALE_MS) {
          if (now - r.beat > STALE_MS + 2000) this.cleanup(id);
          continue;
        }
        out.push({ id, name: r.name, hostName: r.hostName, players: r.players, max: r.max, version: r.version, compatible: r.version === this.version, full: r.players >= r.max, age: now - (r.created ?? now) });
      }
      out.sort((a, b) => a.age - b.age);
      cb(out);
    };
    const timer = setInterval(emit, 2000);
    this.ready().then(({ onValue, query, orderByChild, limitToLast }) => {
      if (stopped) return;
      off = onValue(query(this.ref('rooms'), orderByChild('beat'), limitToLast(60)), (snap) => {
        rooms = snap.val() ?? {};
        emit();
      }, (e) => console.warn('[net] room list', e?.message));
    }).catch((e) => console.warn('[net] firebase', e?.message));
    return () => {
      stopped = true;
      clearInterval(timer);
      off?.();
    };
  }

  cleanup(id) {
    const { remove } = this.fb;
    remove(this.ref(`rooms/${id}`)).then(() => remove(this.ref(`signal/${id}`))).catch(() => {});
  }

  async createRoom({ name, hostName, max = 4 }) {
    const { push, set, onDisconnect } = await this.ready();
    const r = push(this.ref('rooms'));
    const now = Math.round(this.now());
    const room = { host: this.uid, hostName: clip(hostName, 24, 'Host'), name: clip(name, 40, 'Warehouse'), players: 1, max, version: this.version, created: now, beat: now };
    await set(r, room);
    await onDisconnect(this.ref(`signal/${r.key}`)).remove();
    await onDisconnect(r).remove();
    this.room = { id: r.key, ref: r, data: room, lastBeat: now, pending: null, timer: null };
    this.room.timer = setInterval(() => this.beat(), BEAT_MS);
    return r.key;
  }

  setPlayers(n) {
    if (!this.room) return;
    this.room.data.players = n;
    this.beat();
  }

  beat() {
    const rm = this.room;
    if (!rm || rm.busy) return;
    const now = Math.round(this.now());
    const beat = Math.max(now, rm.lastBeat + 1000);
    if (beat > now + 1500) {
      clearTimeout(rm.pending);
      rm.pending = setTimeout(() => this.beat(), beat - now);
      return;
    }
    rm.busy = true;
    rm.lastBeat = beat;
    this.fb.update(rm.ref, { beat, players: rm.data.players }).catch((e) => console.warn('[net] beat', e?.message)).finally(() => { rm.busy = false; });
  }

  async closeRoom() {
    const rm = this.room;
    if (!rm) return;
    this.room = null;
    clearInterval(rm.timer);
    clearTimeout(rm.pending);
    const { remove, onDisconnect } = this.fb;
    for (const off of rm.listeners ?? []) off();
    await remove(this.ref(`signal/${rm.id}`)).catch(() => {});
    await remove(rm.ref).catch(() => {});
    onDisconnect(rm.ref).cancel().catch(() => {});
    onDisconnect(this.ref(`signal/${rm.id}`)).cancel().catch(() => {});
  }

  onOffers(cb) {
    const rm = this.room;
    const { onChildAdded } = this.fb;
    const seen = new Set();
    const off = onChildAdded(this.ref(`signal/${rm.id}`), (snap) => {
      const peer = snap.key, v = snap.val();
      if (!v?.offer || seen.has(peer)) return;
      seen.add(peer);
      cb(peer, v.offer, this.hostMailbox(rm.id, peer, () => seen.delete(peer)));
    }, (e) => console.warn('[net] offers', e?.message));
    (rm.listeners ??= []).push(off);
  }

  hostMailbox(roomId, peer, onClose) {
    const { set, remove, onChildAdded } = this.fb;
    const base = `signal/${roomId}/${peer}`;
    let n = 0;
    let off = null;
    return {
      answer: (desc) => set(this.ref(`${base}/answer`), { type: 'answer', sdp: desc.sdp }),
      ice: (c) => (n < MAX_ICE ? set(this.ref(`${base}/hostIce/${n++}`), iceJson(c)) : Promise.resolve()),
      onIce: (fn) => { off = onChildAdded(this.ref(`${base}/guestIce`), (s) => fn(s.val())); },
      close: () => {
        off?.();
        off = null;
        onClose?.();
        return remove(this.ref(base)).catch(() => {});
      },
    };
  }

  async guestMailbox(roomId, offer, onAnswer, onIce) {
    const { set, remove, onValue, onChildAdded, onDisconnect } = await this.ready();
    const base = `signal/${roomId}/${this.uid}`;
    const mb = this.ref(base);
    await remove(mb).catch(() => {});
    await set(mb, { offer: { type: 'offer', sdp: offer.sdp }, joinedAt: Math.round(this.now()) });
    await onDisconnect(mb).remove();
    const offA = onValue(this.ref(`${base}/answer`), (s) => { if (s.exists()) onAnswer(s.val()); });
    const offI = onChildAdded(this.ref(`${base}/hostIce`), (s) => onIce(s.val()));
    let n = 0;
    return {
      ice: (c) => (n < MAX_ICE ? set(this.ref(`${base}/guestIce/${n++}`), iceJson(c)) : Promise.resolve()),
      close: async () => {
        offA();
        offI();
        await remove(mb).catch(() => {});
        onDisconnect(mb).cancel().catch(() => {});
      },
    };
  }

  async roomInfo(id) {
    const { get } = await this.ready();
    const s = await get(this.ref(`rooms/${id}`));
    return s.exists() ? s.val() : null;
  }
}

function clip(s, n, fallback) {
  const t = String(s ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, n);
  return t || fallback;
}
