// Rug Rush carpet dev page: all rug types flat, dropped rolls, drying rack drape, fake roller and mouse/keyboard tools for testing.
import * as THREE from 'three';
import { boot } from './devkit.js';
import { CarpetSystem } from '../src/carpet/carpets.js';
import { CarpetSurface } from '../src/surface/surface.js';
import { SIZES } from '../src/data/carpetTypes.js';
import { GROUP, groups } from '../src/core/physics.js';

export async function start() {
  const params = new URLSearchParams(location.search);
  const test = params.get('test');
  const rr = await boot({ title: 'carpets', camera: [0, 4.2, 7.5], target: [0, 0, -0.8] });
  rr.ready = false;
  const { R, engine, physics, controls } = rr;
  const scene = engine.scene;
  const carpets = new CarpetSystem(engine, physics);
  engine.add(carpets, -20);
  engine.add({ update() { for (const c of carpets.list) c.surface.upload(); } }, -25);
  const steel = new THREE.MeshStandardMaterial({ color: 0x9aa1a8, metalness: 0.9, roughness: 0.35 });
  const spawned = {};
  const surf = (w, l, fill) => {
    const s = new CarpetSurface(w, l);
    if (fill) s.debugFill(fill);
    return s;
  };
  const flatRow = [];
  let roller = null;
  const only = params.get('only');
  if (only) {
    const fill = +(params.get('fill') ?? 0);
    const size = SIZES[params.get('size') ?? 'M'];
    const type = only;
    spawned.one = carpets.spawn({ type, width: size.width, length: size.length, seed: +(params.get('seed') ?? 5), surface: surf(size.width, size.length, fill), state: params.get('state') ?? 'flat', position: new THREE.Vector3(0, +(params.get('y') ?? 0), 5), yaw: 0, paintColor: '#2f62b5' });
    flatRow.push(spawned.one);
    engine.camera.position.set(0, 1.6, 7.4);
    controls.target.set(0, 0, 5);
  } else if (test === 'big') {
    const s = surf(3, 4, 3);
    spawned.big = carpets.spawn({ type: 'persian', width: 3, length: 4, seed: 11, surface: s, state: 'flat', position: new THREE.Vector3(0, 0, 4.5), yaw: 0, paintColor: '#2f7d4a' });
    flatRow.push(spawned.big);
    engine.camera.position.set(0, 3.4, 7.3);
    controls.target.set(0, 0, 4.2);
  } else {
    const row = [
      ['loop', 'M', 1], ['cut', 'M', 0], ['shag', 'S', 2], ['persian', 'M', 3], ['silk', 'S', 0], ['sisal', 'M', 0], ['kilim', 'S', 4],
    ];
    const widths = row.map(([, s]) => SIZES[s].width);
    const total = widths.reduce((a, b) => a + b, 0) + 0.35 * (row.length - 1);
    let x = -total / 2;
    row.forEach(([type, size, fill], i) => {
      const d = SIZES[size];
      const c = carpets.spawn({ type, width: d.width, length: d.length, seed: 3 + i * 7, surface: surf(d.width, d.length, fill), state: 'flat', position: new THREE.Vector3(x + d.width / 2, 0, -0.9), yaw: 0, paintColor: ['#3a6ea5', '#c23b22', '#2f7d4a', '#d9a521'][i % 4] });
      flatRow.push(c);
      spawned[type] = c;
      x += d.width + 0.35;
    });
    spawned.rollA = carpets.spawn({ type: 'persian', width: 2, length: 3, seed: 21, state: 'rolled', position: new THREE.Vector3(-3.2, 1.5, 6.2), yaw: 0.15 });
    spawned.rollB = carpets.spawn({ type: 'kilim', width: 1.2, length: 1.8, seed: 22, state: 'rolled', position: new THREE.Vector3(0, 1.6, 6.4), yaw: -0.3 });
    spawned.rollC = carpets.spawn({ type: 'sisal', width: 2, length: 3, seed: 23, state: 'rolled', wrapped: true, position: new THREE.Vector3(3.2, 1.5, 6.2), yaw: 0.05 });
    const barY = 1.4, barX = -9.2, barZ = -6.2, barLen = 3.2;
    physics.addCollider(R.ColliderDesc.cylinder(barLen / 2, 0.022).setTranslation(barX, barY, barZ).setRotation({ x: 0, y: 0, z: -Math.SQRT1_2, w: Math.SQRT1_2 }).setFriction(0.9).setCollisionGroups(groups(GROUP.STATIC)));
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, barLen, 24), steel);
    bar.rotation.z = Math.PI / 2;
    bar.position.set(barX, barY, barZ);
    bar.castShadow = true;
    scene.add(bar);
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.05, barY, 0.05), steel);
      post.position.set(barX + s * barLen / 2, barY / 2, barZ);
      post.castShadow = true;
      scene.add(post);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.8), steel);
      foot.position.set(barX + s * barLen / 2, 0.02, barZ);
      scene.add(foot);
      physics.staticBox(0.025, barY / 2, 0.025, { x: barX + s * barLen / 2, y: barY / 2, z: barZ });
    }
    spawned.drape = carpets.spawn({ type: 'kilim', width: 1.2, length: 1.8, seed: 31, surface: surf(1.2, 1.8, 0), state: 'flat', position: new THREE.Vector3(barX, 1.62, barZ + 0.05), yaw: 0 });
    const shaftY = 0.32, shaftX = 9.3, shaftZ = -6.4;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.8, 24), steel);
    shaft.rotation.z = Math.PI / 2;
    shaft.position.set(shaftX, shaftY, shaftZ);
    shaft.castShadow = true;
    scene.add(shaft);
    for (const s of [-1, 1]) {
      const st = new THREE.Mesh(new THREE.BoxGeometry(0.08, shaftY + 0.05, 0.12), new THREE.MeshStandardMaterial({ color: 0xd8a326, roughness: 0.5 }));
      st.position.set(shaftX + s * 1.45, (shaftY + 0.05) / 2, shaftZ);
      st.castShadow = true;
      scene.add(st);
    }
    roller = {
      feedSpeed: 0.35,
      mesh: shaft,
      axisPoint: () => new THREE.Vector3(shaftX, shaftY, shaftZ),
      axisDir: () => new THREE.Vector3(1, 0, 0),
    };
    spawned.feed = carpets.spawn({ type: 'cut', width: 2, length: 3, seed: 41, surface: surf(2, 3, 0), state: 'flat', position: new THREE.Vector3(shaftX, 0, shaftZ + 1.85), yaw: 0 });
  }
  const ray = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  const keys = new Set();
  let grab = null;
  let brush = null;
  let uvOn = false;
  let handRoll = null;
  const setMouse = (e) => {
    const r = engine.canvas.getBoundingClientRect();
    mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(mouse, engine.camera);
  };
  const plane = new THREE.Plane();
  const tmp = new THREE.Vector3();
  engine.canvas.addEventListener('pointerdown', (e) => {
    setMouse(e);
    if (e.shiftKey) {
      const h = carpets.raycast(ray.ray.origin, ray.ray.direction, 100);
      if (!h) return;
      const g = h.carpet.grabAt(h);
      if (!g) return;
      controls.enabled = false;
      plane.setFromNormalAndCoplanarPoint(engine.camera.getWorldDirection(tmp).negate(), h.point);
      grab = { g, carpet: h.carpet, target: h.point.clone() };
      if (g.kind === 'cloth') g.setTarget(h.point, 0.35);
    } else if (keys.has('KeyB')) {
      const h = carpets.raycast(ray.ray.origin, ray.ray.direction, 100);
      if (!h) return;
      controls.enabled = false;
      brush = { carpet: h.carpet, uv: h.uv };
    }
  });
  addEventListener('pointermove', (e) => {
    if (!grab && !brush) return;
    setMouse(e);
    if (grab) {
      const p = ray.ray.intersectPlane(plane, tmp);
      if (p) {
        grab.target.copy(p);
        if (grab.g.kind === 'cloth') grab.g.setTarget(p, 0.35);
      }
    } else if (brush) {
      const h = brush.carpet.raycast(ray.ray.origin, ray.ray.direction, 100);
      if (!h) return;
      const du = (h.uv.u - brush.uv.u) * brush.carpet.width, dv = (h.uv.v - brush.uv.v) * brush.carpet.length;
      if (Math.hypot(du, dv) > 0.005) {
        brush.carpet.surface.napStroke(h.uv.u, h.uv.v, du, dv, 0.09, 0.7);
        brush.uv = h.uv;
      }
    }
  });
  addEventListener('pointerup', () => {
    if (grab?.g.kind === 'cloth') grab.g.release();
    grab = null;
    brush = null;
    controls.enabled = true;
  });
  engine.add({
    fixedUpdate(dt) {
      if (grab && grab.g.kind === 'body') {
        const b = grab.g.body;
        const t = b.translation(), r = b.rotation();
        const q = new THREE.Quaternion(r.x, r.y, r.z, r.w);
        const wp = grab.g.localPoint.clone().applyQuaternion(q).add(new THREE.Vector3(t.x, t.y, t.z));
        const v = physics.bodyVelocityAt(b, wp);
        const f = grab.target.clone().sub(wp).multiplyScalar(60).sub(v.multiplyScalar(8)).multiplyScalar(b.mass() * dt * 0.5);
        b.applyImpulseAtPoint(f, wp, true);
      }
      if (handRoll) {
        if (handRoll.state === 'rolled' || handRoll.state === 'flat') handRoll = null;
        else handRoll.pushRoll(0.7 * dt);
      }
    },
    update() {
      if (uvOn) carpets.setUvLamp({ on: true, position: engine.camera.position, direction: engine.camera.getWorldDirection(tmp), angle: 0.42 });
      if (roller) roller.mesh.rotation.x -= roller.active ? 0.35 / 0.025 / 60 : 0;
    },
  }, -30);
  const nearestFlat = () => {
    let best = null, bd = 1e9;
    for (const c of carpets.list) {
      if (c.state !== 'flat' || c === spawned.feed) continue;
      const d = c.geoTop.boundingSphere.center.distanceTo(controls.target);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  };
  const rolledOne = (wrappedOk = false) => carpets.list.find((c) => c.state === 'rolled' && c.body && (wrappedOk || !c.wrapped) && !c.roller);
  const actions = {
    KeyU: () => {
      uvOn = !uvOn;
      if (!uvOn) carpets.setUvLamp({ on: false });
    },
    KeyR: () => {
      const c = nearestFlat();
      if (c && c.startRoll('v0')) handRoll = c;
    },
    KeyM: () => {
      if (!roller || !spawned.feed) return;
      if (spawned.feed.roller) {
        spawned.feed.releaseFromRoller();
        roller.active = false;
      } else {
        spawned.feed.attachToRoller(roller);
        roller.active = true;
      }
    },
    KeyK: () => {
      let best = null, bd = 1e9;
      for (const c of carpets.list) {
        if (!c.body || c.wrapped || c.roller || c.state === 'flat') continue;
        const t = c.body.translation();
        const d = Math.hypot(t.x - controls.target.x, t.z - controls.target.z);
        if (d < bd) { bd = d; best = c; }
      }
      if (best) best.unroll(engine.camera.getWorldDirection(new THREE.Vector3()));
    },
    KeyW: () => {
      const c = rolledOne();
      if (c) c.setWrapped(true);
    },
    KeyT: () => {
      const c = rolledOne(true);
      if (!c) return;
      const f = engine.camera.getWorldDirection(new THREE.Vector3());
      f.y = 0;
      f.normalize();
      c.body.setLinvel({ x: f.x * 4.5, y: 2.8, z: f.z * 4.5 }, true);
      c.body.setAngvel({ x: (Math.random() - 0.5) * 6, y: (Math.random() - 0.5) * 2, z: (Math.random() - 0.5) * 6 }, true);
    },
  };
  addEventListener('keydown', (e) => {
    if (e.repeat) return;
    keys.add(e.code);
    actions[e.code]?.();
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  const views = {
    row: [[0, 4.2, 7.5], [0, 0, -0.8]],
    rowLow: [[0, 1.6, 4.8], [0, 0, -1.2]],
    persian: [[0.6, 1.5, 1.6], [0.6, 0, -0.9]],
    persianClose: [[0.9, 0.55, 0.0], [0.6, 0, -0.9]],
    shag: [[-1.35, 0.8, 0.5], [-1.4, 0, -0.9]],
    shagClose: [[-1.4, 0.32, -0.15], [-1.45, 0, -0.75]],
    tweed: [[-5.6, 1.4, 1.2], [-5.6, 0, -0.9]],
    modern: [[-3.3, 1.6, 1.4], [-3.3, 0, -0.9]],
    silk: [[2.3, 1.1, 0.8], [2.3, 0, -0.9]],
    sisal: [[4.2, 1.4, 1.2], [4.2, 0, -0.9]],
    kilim: [[6.2, 1.2, 0.9], [6.2, 0, -0.9]],
    rolled: [[0, 2.2, 10.5], [0, 0.2, 6.2]],
    rack: [[-6.4, 2.0, -3.2], [-9.2, 0.9, -6.2]],
    roller: [[7.3, 2.0, -1.5], [9.3, 0.3, -5]],
  };
  const gl = engine.renderer.getContext();
  const tq = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const gpu = { ms: 0, samples: [], pending: [] };
  if (tq) {
    const render = engine.renderer.render.bind(engine.renderer);
    let depth = 0;
    engine.renderer.render = (s, c) => {
      if (depth > 0 || s !== scene) return render(s, c);
      depth++;
      const q = gl.createQuery();
      gl.beginQuery(tq.TIME_ELAPSED_EXT, q);
      render(s, c);
      gl.endQuery(tq.TIME_ELAPSED_EXT);
      gpu.pending.push(q);
      depth--;
      while (gpu.pending.length) {
        const p = gpu.pending[0];
        if (!gl.getQueryParameter(p, gl.QUERY_RESULT_AVAILABLE)) break;
        gpu.pending.shift();
        if (!gl.getParameter(tq.GPU_DISJOINT_EXT)) {
          const ms = gl.getQueryParameter(p, gl.QUERY_RESULT) / 1e6;
          gpu.samples.push(ms);
          if (gpu.samples.length > 120) gpu.samples.shift();
          gpu.ms = gpu.samples.reduce((a, b) => a + b, 0) / gpu.samples.length;
        }
        gl.deleteQuery(p);
      }
    };
  }
  const stress = +(params.get('stress') ?? 1);
  if (stress > 1) engine.add({ afterRender() { for (let i = 1; i < stress; i++) engine.renderer.render(scene, engine.camera); } }, 995);
  const r2 = window.RR;
  Object.assign(r2, {
    carpets,
    spawned,
    roller,
    actions,
    view(name) {
      const v = views[name];
      if (!v) return false;
      engine.camera.position.set(...v[0]);
      controls.target.set(...v[1]);
      controls.update();
      return true;
    },
    focus(key, dx = 0, dy = 1.4, dz = 2.2, ty = 0) {
      const c = spawned[key];
      if (!c) return false;
      const p = c.geoTop.boundingSphere.center;
      engine.camera.position.set(p.x + dx, p.y + dy, p.z + dz);
      controls.target.set(p.x, ty, p.z);
      controls.update();
      return true;
    },
    cam(px, py, pz, tx, ty, tz) {
      engine.camera.position.set(px, py, pz);
      controls.target.set(tx, ty, tz);
      controls.update();
    },
    uv(on = true) {
      uvOn = on;
      if (!on) carpets.setUvLamp({ on: false });
    },
    press(code) {
      actions[code]?.();
    },
    gpu,
    report() {
      return { fps: +engine.fps.toFixed(1), frameMs: +engine.frameMs.toFixed(2), gpuMs: +gpu.ms.toFixed(2), ...carpets.report() };
    },
    hudExtra() {
      const r = carpets.report();
      return `carpets step ${r.stepMs.toFixed(2)} ms (max ${r.stepMaxMs.toFixed(2)})  frame ${r.frameMs.toFixed(2)} ms  gpu ${gpu.ms.toFixed(2)} ms`;
    },
  });
  r2.ready = true;
}
