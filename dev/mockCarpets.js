// Rug Rush mock carpet system for lead-side integration tests: flat debug planes and rigid rolls with the real carpet API surface.
import * as THREE from 'three';
import { R, GROUP, groups } from '../src/core/physics.js';
import { rolledRadius, carpetMass } from '../src/data/carpetTypes.js';

const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }';
const FS = `
uniform sampler2D dirt0, dirt1, dirt2, layer, damage, tintGel, tintPowder;
varying vec2 vUv;
void main(){
  vec2 uv = vec2(vUv.x, vUv.y);
  vec4 d0 = texture2D(dirt0, uv), d1 = texture2D(dirt1, uv), d2 = texture2D(dirt2, uv), ly = texture2D(layer, uv), dm = texture2D(damage, uv);
  vec4 tg = texture2D(tintGel, uv), tp = texture2D(tintPowder, uv);
  vec3 base = mix(vec3(0.55,0.12,0.12), vec3(0.85,0.75,0.55), step(0.5, fract(uv.x*6.0+uv.y*4.0)));
  base = mix(base, vec3(0.55,0.5,0.42), d0.r*0.8);
  base = mix(base, vec3(0.2,0.15,0.1), d0.g*0.7);
  base = mix(base, vec3(0.35,0.25,0.15), d0.b);
  base = mix(base, vec3(0.6,0.4,0.1), d0.a*0.7);
  base = mix(base, vec3(0.4,0.02,0.15), d1.r);
  base = mix(base, vec3(0.3,0.18,0.08), d1.g);
  base = mix(base, base*0.5, d1.b);
  base = mix(base, vec3(0.9,0.6,0.7), d2.r);
  base = mix(base, vec3(0.95,0.95,0.85), d2.g);
  base = mix(base, vec3(0.1,0.4,0.9), d2.b);
  base = mix(base, vec3(0.1,0.25,0.1), d2.a);
  base *= 1.0 - ly.r*0.4;
  base = mix(base, mix(vec3(0.6,0.5,0.4), base, 0.5), tp.a*0.6);
  base = mix(base, tp.rgb, clamp(ly.g*1.2,0.0,1.0));
  base = mix(base, tg.rgb, clamp(ly.b,0.0,0.85));
  base = mix(base, mix(vec3(1.0), vec3(0.45,0.38,0.3), tg.a), clamp(ly.a*1.3,0.0,1.0));
  base = mix(base, base.gbr, dm.r*0.6);
  base = mix(base, vec3(0.92), dm.g*0.7);
  base = mix(base, vec3(0.1,0.05,0.02), dm.a);
  gl_FragColor = vec4(base, 1.0);
}`;

export class CarpetSystem {
  constructor(engine, physics) {
    this.engine = engine;
    this.physics = physics;
    this.list = [];
    this.order = -20;
  }

  spawn(o) {
    const c = new MockCarpet(this, o);
    this.list.push(c);
    return c;
  }

  remove(c) {
    this.list.splice(this.list.indexOf(c), 1);
    c.dispose();
  }

  raycast(origin, dir, max) {
    let best = null;
    for (const c of this.list) {
      const h = c.raycast(origin, dir, max);
      if (h && (!best || h.distance < best.distance)) best = { ...h, carpet: c };
    }
    return best;
  }

  surfaceHeightAt(x, z) {
    return null;
  }

  setPushers() {}
  setUvLamp() {}

  fixedUpdate() {}
  update() {}
  report() {
    return { mock: this.list.length };
  }
}

class MockCarpet {
  constructor(sys, o) {
    this.sys = sys;
    this.kind = 'carpet';
    Object.assign(this, { type: o.type, width: o.width, length: o.length, surface: o.surface, wrapped: !!o.wrapped });
    this.state = o.state;
    this.rolledFraction = o.state === 'rolled' ? 1 : 0;
    this.mass = carpetMass(o.type, { width: o.width, length: o.length });
    const s = o.surface.textures;
    this.mat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, uniforms: Object.fromEntries(Object.entries(s).map(([k, t]) => [k, { value: t }])), side: THREE.DoubleSide });
    this.ray = new THREE.Raycaster();
    if (this.state === 'rolled') this.makeRoll(o.position, o.yaw);
    else this.makeFlat(o.position, o.yaw);
  }

  makeFlat(p, yaw) {
    const g = new THREE.PlaneGeometry(this.width, this.length);
    g.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.position.set(p.x, 0.012, p.z);
    this.mesh.rotation.y = yaw;
    this.mesh.updateMatrixWorld();
    this.sys.engine.scene.add(this.mesh);
    this.body = null;
  }

  makeRoll(p, yaw) {
    const r = rolledRadius(this.type, this.length);
    const g = new THREE.CylinderGeometry(r, r, this.width, 20);
    g.rotateZ(Math.PI / 2);
    this.mesh = new THREE.Mesh(g, this.mat);
    this.sys.engine.scene.add(this.mesh);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    this.body = this.sys.physics.createBody(R.RigidBodyDesc.dynamic().setTranslation(p.x, p.y, p.z).setRotation(q), [
      R.ColliderDesc.cylinder(this.width / 2, r).setRotation({ x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 }).setMass(this.mass).setFriction(0.8).setCollisionGroups(groups(GROUP.CARPET)),
    ], this);
    this.sys.physics.bind(this.body, this.mesh);
  }

  raycast(origin, dir, max) {
    this.ray.set(origin, dir);
    this.ray.far = max;
    const h = this.ray.intersectObject(this.mesh, false)[0];
    if (!h) return null;
    const tU = new THREE.Vector3(1, 0, 0).applyQuaternion(this.mesh.quaternion);
    const tV = new THREE.Vector3(0, 0, -1).applyQuaternion(this.mesh.quaternion);
    return { distance: h.distance, point: h.point, normal: h.face.normal.clone().transformDirection(this.mesh.matrixWorld), uv: { u: h.uv.x, v: h.uv.y }, tangentU: tU, tangentV: tV, part: this.body ? 'roll' : 'top' };
  }

  uvToWorld(u, v) {
    if (this.body) {
      const t = this.body.translation();
      return { point: new THREE.Vector3(t.x, t.y, t.z), normal: new THREE.Vector3(0, 1, 0) };
    }
    const p = new THREE.Vector3((u - 0.5) * this.width, 0.012, -(v - 0.5) * this.length).applyMatrix4(this.mesh.matrixWorld);
    return { point: p, normal: new THREE.Vector3(0, 1, 0) };
  }

  surfaceHeightAt() {
    return null;
  }

  grabAt(hit) {
    if (!this.body) return null;
    const t = this.body.translation(), r = this.body.rotation();
    const inv = new THREE.Quaternion(r.x, r.y, r.z, r.w).invert();
    return { kind: 'body', body: this.body, localPoint: hit.point.clone().sub(new THREE.Vector3(t.x, t.y, t.z)).applyQuaternion(inv) };
  }

  setWrapped(on) {
    this.wrapped = on;
  }

  setLabelTexture() {}

  dispose() {
    if (this.body) this.sys.physics.removeBody(this.body);
    this.mesh.removeFromParent();
  }
}
