// Rug Rush dev kit: boots engine, physics and baseplate with an orbit camera for isolated module test pages.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Engine } from '../src/core/engine.js';
import { Physics, initRapier, R } from '../src/core/physics.js';
import { buildBaseplate } from '../src/world/baseplate.js';

export async function boot({ title = 'dev', camera = [6, 5, 6], target = [0, 0, -3] } = {}) {
  document.title = `Rug Rush ${title}`;
  await initRapier();
  const container = document.getElementById('app') ?? document.body;
  const engine = new Engine(container);
  engine.useRoomEnvironment(0.8);
  const physics = new Physics(engine);
  engine.add(physics, 0);
  const base = buildBaseplate(engine, physics);
  engine.camera.position.set(...camera);
  const controls = new OrbitControls(engine.camera, engine.canvas);
  controls.target.set(...target);
  controls.enableDamping = true;
  controls.update();
  engine.add({ update: () => controls.update() }, 900);
  const hud = document.createElement('div');
  hud.style.cssText = 'position:fixed;left:8px;top:8px;font:12px ui-monospace,monospace;color:#fff;background:rgba(0,0,0,.45);padding:4px 7px;border-radius:4px;pointer-events:none;white-space:pre';
  document.body.appendChild(hud);
  let acc = 0;
  engine.add({
    update(dt) {
      acc += dt;
      if (acc < 0.25) return;
      acc = 0;
      const i = engine.renderer.info.render;
      hud.textContent = `${title}  ${engine.fps.toFixed(0)} fps  ${engine.frameMs.toFixed(1)} ms  calls ${i.calls}  tris ${(i.triangles / 1000).toFixed(0)}k${window.RR?.hudExtra ? '\n' + window.RR.hudExtra() : ''}`;
    },
  }, 990);
  window.RR = { THREE, R, engine, physics, base, controls, ready: true };
  engine.start();
  return window.RR;
}
