// Rug Rush audio: WebAudio sound bank from manifests, random variants, positional one-shots and loops, UI sounds, music and radio.
import * as THREE from 'three';

const BASE = new URL('../../assets/audio/', import.meta.url).href;
const _v = new THREE.Vector3();
const _f = new THREE.Vector3();

export class Audio {
  constructor() {
    this.ctx = null;
    this.buffers = new Map();
    this.loading = new Map();
    this.manifest = {};
    this.variants = new Map();
    this.loops = new Set();
    this.vol = { master: 0.9, sfx: 0.9, music: 0.55, radio: true };
    this.ready = this.loadManifests();
    this.listener = { pos: new THREE.Vector3(), fwd: new THREE.Vector3(0, 0, -1) };
    this.musicEl = null;
    this.radio = null;
    this.order = 995;
    const unlock = () => {
      this.ensure();
      if (this.ctx?.state === 'suspended') this.ctx.resume();
    };
    addEventListener('pointerdown', unlock, { capture: true });
    addEventListener('keydown', unlock, { capture: true });
  }

  async loadManifests() {
    for (const dir of ['sfx', 'ui', 'music', 'ambience']) {
      try {
        const r = await fetch(`${BASE}${dir}/manifest.json`);
        if (!r.ok) continue;
        const m = await r.json();
        for (const [name, e] of Object.entries(m)) this.manifest[name] = { ...e, url: `${BASE}${dir}/${e.file}`, dir };
      } catch (e) {}
    }
    for (const name of Object.keys(this.manifest)) {
      const m = name.match(/^(.*)_(\d+)$/);
      if (m) {
        if (!this.variants.has(m[1])) this.variants.set(m[1], []);
        this.variants.get(m[1]).push(name);
      }
    }
  }

  ensure() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    const ctx = new AC();
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.connect(ctx.destination);
    this.sfxBus = ctx.createGain();
    this.uiBus = ctx.createGain();
    this.musicBus = ctx.createGain();
    for (const b of [this.sfxBus, this.uiBus, this.musicBus]) b.connect(this.out);
    this.setVolumes(this.vol);
    return ctx;
  }

  setVolumes(v) {
    this.vol = { ...this.vol, ...v };
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.out.gain.setTargetAtTime(this.vol.master, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.vol.sfx, t, 0.05);
    this.uiBus.gain.setTargetAtTime(this.vol.sfx * 0.9, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.vol.music, t, 0.05);
    if (this.radio) this.radio.setEnabled(this.vol.radio);
  }

  resolve(name) {
    if (this.manifest[name]) return name;
    const v = this.variants.get(name);
    if (v?.length) return v[Math.floor(Math.random() * v.length)];
    return null;
  }

  has(name) {
    return !!this.resolve(name);
  }

  async buffer(name) {
    if (this.buffers.has(name)) return this.buffers.get(name);
    if (this.loading.has(name)) return this.loading.get(name);
    const e = this.manifest[name];
    if (!e || !this.ensure()) return null;
    const p = fetch(e.url).then((r) => r.arrayBuffer()).then((b) => this.ctx.decodeAudioData(b)).then((buf) => {
      this.buffers.set(name, buf);
      return buf;
    }).catch(() => null);
    this.loading.set(name, p);
    return p;
  }

  preload(names) {
    this.ready.then(() => {
      for (const n of names) {
        const list = this.manifest[n] ? [n] : this.variants.get(n) ?? [];
        for (const k of list) this.buffer(k);
      }
    });
  }

  panner(pos, ref = 2.5, max = 40) {
    const p = this.ctx.createPanner();
    p.panningModel = 'equalpower';
    p.distanceModel = 'inverse';
    p.refDistance = ref;
    p.maxDistance = max;
    p.rolloffFactor = 1.2;
    this.setPannerPos(p, pos);
    return p;
  }

  setPannerPos(p, pos) {
    const t = this.ctx.currentTime;
    if (p.positionX) {
      p.positionX.setTargetAtTime(pos.x, t, 0.02);
      p.positionY.setTargetAtTime(pos.y, t, 0.02);
      p.positionZ.setTargetAtTime(pos.z, t, 0.02);
    } else p.setPosition(pos.x, pos.y, pos.z);
  }

  play(name, { pos = null, volume = 1, rate = 1, bus = 'sfx', jitter = 0.06, ref = 2.5 } = {}) {
    if (!this.ensure() || this.ctx.state !== 'running') return null;
    const real = this.resolve(name);
    if (!real) return null;
    const buf = this.buffers.get(real);
    if (!buf) {
      this.buffer(real);
      return null;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate * (1 + (Math.random() * 2 - 1) * jitter);
    const g = this.ctx.createGain();
    g.gain.value = volume;
    src.connect(g);
    let node = g;
    if (pos) {
      const p = this.panner(pos, ref);
      g.connect(p);
      node = p;
    }
    node.connect(bus === 'ui' ? this.uiBus : bus === 'music' ? this.musicBus : this.sfxBus);
    src.start();
    return src;
  }

  ui(name, volume = 0.8) {
    return this.play(name, { bus: 'ui', volume, jitter: 0.03 });
  }

  loop(name, { pos = null, volume = 1, rate = 1, ref = 2.5 } = {}) {
    const a = this;
    const h = {
      name, src: null, gain: null, pan: null, vol: volume, alive: true, pos: pos ? pos.clone() : null,
      async start() {
        if (!a.ensure()) return;
        const real = a.resolve(name);
        if (!real) return;
        const buf = await a.buffer(real);
        if (!buf || !h.alive || h.src) return;
        h.src = a.ctx.createBufferSource();
        h.src.buffer = buf;
        h.src.loop = true;
        h.src.playbackRate.value = rate;
        h.gain = a.ctx.createGain();
        h.gain.gain.value = 0;
        h.src.connect(h.gain);
        let node = h.gain;
        if (h.pos) {
          h.pan = a.panner(h.pos, ref);
          h.gain.connect(h.pan);
          node = h.pan;
        }
        node.connect(a.sfxBus);
        h.src.start(0, Math.random() * buf.duration);
        h.gain.gain.setTargetAtTime(h.vol, a.ctx.currentTime, 0.05);
      },
      setVolume(v) {
        h.vol = v;
        if (h.gain) h.gain.gain.setTargetAtTime(v, a.ctx.currentTime, 0.06);
      },
      setRate(r) {
        if (h.src) h.src.playbackRate.setTargetAtTime(r, a.ctx.currentTime, 0.1);
      },
      setPos(p) {
        h.pos?.copy(p);
        if (h.pan) a.setPannerPos(h.pan, p);
      },
      stop(fade = 0.12) {
        h.alive = false;
        a.loops.delete(h);
        if (!h.src) return;
        const s = h.src, g = h.gain;
        g.gain.setTargetAtTime(0, a.ctx.currentTime, fade / 3);
        setTimeout(() => { try { s.stop(); } catch (e) {} }, fade * 1000 + 60);
      },
    };
    this.loops.add(h);
    this.ready.then(() => h.start());
    return h;
  }

  music(name) {
    this.ready.then(async () => {
      if (!this.ensure()) return;
      const real = this.resolve(name);
      if (this.currentMusic?.name === real) return;
      this.currentMusic?.stop(1.2);
      if (!real) return;
      const buf = await this.buffer(real);
      if (!buf) return;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const g = this.ctx.createGain();
      g.gain.value = 0;
      src.connect(g).connect(this.musicBus);
      src.start();
      g.gain.setTargetAtTime(0.8, this.ctx.currentTime, 0.6);
      this.currentMusic = { name: real, stop: (f) => { g.gain.setTargetAtTime(0, this.ctx.currentTime, f / 3); setTimeout(() => { try { src.stop(); } catch (e) {} }, f * 1000 + 100); } };
    });
  }

  stopMusic() {
    this.currentMusic?.stop(1.0);
    this.currentMusic = null;
  }

  startRadio(pos) {
    if (this.radio) return this.radio;
    const a = this;
    const tracks = () => Object.keys(this.manifest).filter((n) => n.startsWith('radio_'));
    const r = {
      pos: pos.clone(), idx: Math.floor(Math.random() * 4), src: null, gain: null, pan: null, enabled: true,
      async next() {
        const list = tracks();
        if (!list.length || !a.ensure()) return;
        r.idx = (r.idx + 1) % list.length;
        const buf = await a.buffer(list[r.idx]);
        if (!buf) return;
        r.src = a.ctx.createBufferSource();
        r.src.buffer = buf;
        r.gain = r.gain ?? a.ctx.createGain();
        if (!r.pan) {
          r.pan = a.panner(r.pos, 4, 60);
          r.gain.connect(r.pan);
          r.pan.connect(a.musicBus);
        }
        r.gain.gain.value = r.enabled ? 0.55 : 0;
        r.src.connect(r.gain);
        r.src.onended = () => r.next();
        r.src.start();
      },
      setEnabled(on) {
        r.enabled = on;
        if (r.gain) r.gain.gain.setTargetAtTime(on ? 0.55 : 0, a.ctx.currentTime, 0.2);
      },
    };
    this.radio = r;
    this.ready.then(() => {
      const go = () => (this.ctx?.state === 'running' ? r.next() : setTimeout(go, 500));
      go();
    });
    return r;
  }

  update(dt, camera) {
    if (!this.ctx || !camera) return;
    const L = this.ctx.listener;
    camera.getWorldPosition(_v);
    camera.getWorldDirection(_f);
    const t = this.ctx.currentTime;
    if (L.positionX) {
      L.positionX.setTargetAtTime(_v.x, t, 0.02);
      L.positionY.setTargetAtTime(_v.y, t, 0.02);
      L.positionZ.setTargetAtTime(_v.z, t, 0.02);
      L.forwardX.setTargetAtTime(_f.x, t, 0.02);
      L.forwardY.setTargetAtTime(_f.y, t, 0.02);
      L.forwardZ.setTargetAtTime(_f.z, t, 0.02);
      L.upX.value = 0;
      L.upY.value = 1;
      L.upZ.value = 0;
    } else {
      L.setPosition(_v.x, _v.y, _v.z);
      L.setOrientation(_f.x, _f.y, _f.z, 0, 1, 0);
    }
  }
}
