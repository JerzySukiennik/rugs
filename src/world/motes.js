// Rug Rush air motes: faint dust specks drifting around the camera so the bright hall feels lived in.
import * as THREE from 'three';

const N = 360;
const R = 7;

export class Motes {
  constructor(engine) {
    this.engine = engine;
    this.order = 870;
    const pos = new Float32Array(N * 3);
    const seed = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() * 2 - 1) * R;
      pos[i * 3 + 1] = Math.random() * 5.5 + 0.2;
      pos[i * 3 + 2] = (Math.random() * 2 - 1) * R;
      seed[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    this.uniforms = { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uPx: { value: 1 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: `attribute float seed; uniform float uTime; uniform vec3 uCam; uniform float uPx; varying float vA;
void main(){
  vec3 p = position;
  p.x += sin(uTime * (0.07 + seed * 0.05) + seed * 31.0) * 0.6 + uTime * 0.03;
  p.y += sin(uTime * (0.05 + seed * 0.04) + seed * 17.0) * 0.35 - uTime * 0.012 * (0.3 + seed);
  p.z += cos(uTime * (0.06 + seed * 0.05) + seed * 11.0) * 0.6;
  vec3 rel = mod(p - uCam + vec3(${R}.0), vec3(${R * 2}.0)) - vec3(${R}.0);
  vec3 w = uCam + rel;
  w.y = 0.2 + mod(p.y, 5.6);
  vec4 mv = modelViewMatrix * vec4(w, 1.0);
  gl_Position = projectionMatrix * mv;
  float d = length(rel.xz);
  vA = smoothstep(${R}.0, ${R - 2}.0, d) * smoothstep(0.25, 1.2, -mv.z) * (0.35 + 0.65 * fract(seed * 7.13)) * (0.6 + 0.4 * sin(uTime * (0.8 + seed) + seed * 50.0));
  gl_PointSize = (1.6 + seed * 2.2) * uPx * 6.0 / max(1.0, -mv.z);
}`,
      fragmentShader: `varying float vA;
void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d) * vA * 0.55; if (a < 0.01) discard; gl_FragColor = vec4(1.0, 0.97, 0.9, a); }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    engine.scene.add(this.points);
  }

  update(dt) {
    const u = this.uniforms;
    u.uTime.value += dt;
    u.uCam.value.copy(this.engine.camera.position);
    u.uPx.value = this.engine.renderer.getPixelRatio();
  }
}
