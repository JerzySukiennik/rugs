// Rug Rush engine: renderer, scene, camera, fixed-step simulation loop and system registry.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

export const FIXED_DT = 1 / 60;
const MAX_STEPS = 4;

export class Engine {
  constructor(container, opts = {}) {
    this.container = container;
    this.quality = { pixelRatio: opts.pixelRatio ?? Math.min(devicePixelRatio, 1.5), shadows: opts.shadows ?? true };
    const r = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', stencil: false });
    r.setPixelRatio(this.quality.pixelRatio);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = this.quality.shadows;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(r.domElement);
    this.renderer = r;
    this.canvas = r.domElement;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xb9c3cc);
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.03, 400);
    this.systems = [];
    this.time = 0;
    this.tick = 0;
    this.accum = 0;
    this.alpha = 0;
    this.fps = 60;
    this.frameMs = 16;
    this.paused = false;
    this.last = performance.now();
    this.pmrem = new THREE.PMREMGenerator(r);
    this.onResize = this.onResize.bind(this);
    addEventListener('resize', this.onResize);
    this.onResize();
  }

  onResize() {
    const w = this.container.clientWidth || innerWidth;
    const h = this.container.clientHeight || innerHeight;
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    for (const s of this.systems) s.resize?.(w, h);
  }

  add(system, order = system.order ?? 0) {
    system.order = order;
    this.systems.push(system);
    this.systems.sort((a, b) => a.order - b.order);
    return system;
  }

  remove(system) {
    const i = this.systems.indexOf(system);
    if (i >= 0) this.systems.splice(i, 1);
  }

  useRoomEnvironment(intensity = 1) {
    const env = this.pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = env;
    this.scene.environmentIntensity = intensity;
    return env;
  }

  async loadEnvironment(url, { background = false, intensity = 1, blur = 0 } = {}) {
    const hdr = await new RGBELoader().loadAsync(url);
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    const env = this.pmrem.fromEquirectangular(hdr).texture;
    this.scene.environment = env;
    this.scene.environmentIntensity = intensity;
    if (background) {
      this.scene.background = hdr;
      this.scene.backgroundBlurriness = blur;
    } else hdr.dispose();
    return env;
  }

  start() {
    const loop = (now) => {
      this.raf = requestAnimationFrame(loop);
      this.frame(now);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    cancelAnimationFrame(this.raf);
  }

  step(n = 1) {
    for (let i = 0; i < n; i++) this.fixedStep();
  }

  timed(s, fn, key) {
    const t0 = performance.now();
    fn();
    const name = (s.profName ??= s.constructor?.name !== 'Object' ? s.constructor.name : `sys${this.systems.indexOf(s)}`) + key;
    const p = this.prof;
    p[name] = (p[name] ?? 0) * 0.95 + (performance.now() - t0) * 0.05;
  }

  fixedStep() {
    if (this.prof) {
      for (const s of this.systems) if (s.fixedUpdate) this.timed(s, () => s.fixedUpdate(FIXED_DT, this.tick), '.fixed');
      this.tick++;
      this.time += FIXED_DT;
      return;
    }
    for (const s of this.systems) s.fixedUpdate?.(FIXED_DT, this.tick);
    this.tick++;
    this.time += FIXED_DT;
  }

  frame(now) {
    const t0 = performance.now();
    const dt = Math.min((now - this.last) / 1000, 0.1);
    this.last = now;
    if (!this.paused) {
      this.accum += dt;
      let steps = 0;
      while (this.accum >= FIXED_DT && steps < MAX_STEPS) {
        this.fixedStep();
        this.accum -= FIXED_DT;
        steps++;
      }
      if (steps === MAX_STEPS) this.accum = 0;
      this.alpha = this.accum / FIXED_DT;
    }
    if (this.prof) {
      for (const s of this.systems) if (s.update) this.timed(s, () => s.update(dt, this.alpha), '.update');
      for (const s of this.systems) if (s.lateUpdate) this.timed(s, () => s.lateUpdate(dt), '.late');
      this.timed({ profName: 'render' }, () => this.renderer.render(this.scene, this.camera), '');
    } else {
      for (const s of this.systems) s.update?.(dt, this.alpha);
      for (const s of this.systems) s.lateUpdate?.(dt);
      this.renderer.render(this.scene, this.camera);
    }
    for (const s of this.systems) s.afterRender?.(dt);
    if (dt > 0) this.fps += (1 / dt - this.fps) * 0.05;
    this.frameMs += (performance.now() - t0 - this.frameMs) * 0.05;
  }
}
