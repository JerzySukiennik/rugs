// Rug Rush fluids: reduced-resolution planar reflection for floor water (mirrored camera, oblique clip, mipmapped HDR target).
import * as THREE from 'three';

const _rp = new THREE.Vector3();
const _cp = new THREE.Vector3();
const _n = new THREE.Vector3(0, 1, 0);
const _rot = new THREE.Matrix4();
const _look = new THREE.Vector3();
const _view = new THREE.Vector3();
const _target = new THREE.Vector3();
const _plane = new THREE.Plane();
const _clip = new THREE.Vector4();
const _q = new THREE.Vector4();
const _size = new THREE.Vector2();

export class PlanarReflection {
  constructor(renderer, scene, { scale = 0.5, planeY = -0.02 } = {}) {
    this.renderer = renderer;
    this.scene = scene;
    this.scale = scale;
    this.planeY = planeY;
    this.enabled = true;
    this.rt = new THREE.WebGLRenderTarget(4, 4, {
      type: THREE.HalfFloatType,
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
    });
    this.cam = new THREE.PerspectiveCamera();
    this.matrix = new THREE.Matrix4();
    this.valid = false;
    this.hidden = [];
    this.renders = 0;
  }

  update(camera, hide = []) {
    const r = this.renderer;
    if (!this.enabled) {
      this.valid = false;
      return;
    }
    r.getDrawingBufferSize(_size);
    const w = Math.max(16, Math.floor(_size.x * this.scale)), h = Math.max(16, Math.floor(_size.y * this.scale));
    if (this.rt.width !== w || this.rt.height !== h) this.rt.setSize(w, h);
    _cp.setFromMatrixPosition(camera.matrixWorld);
    _rp.set(_cp.x, this.planeY, _cp.z);
    _view.subVectors(_rp, _cp);
    if (_view.dot(_n) > 0) {
      this.valid = false;
      return;
    }
    _view.reflect(_n).negate().add(_rp);
    _rot.extractRotation(camera.matrixWorld);
    _look.set(0, 0, -1).applyMatrix4(_rot).add(_cp);
    _target.subVectors(_rp, _look).reflect(_n).negate().add(_rp);
    const vc = this.cam;
    vc.position.copy(_view);
    vc.up.set(0, 1, 0).applyMatrix4(_rot).reflect(_n);
    vc.lookAt(_target);
    vc.far = camera.far;
    vc.near = camera.near;
    vc.updateMatrixWorld();
    vc.projectionMatrix.copy(camera.projectionMatrix);
    this.matrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.matrix.multiply(vc.projectionMatrix).multiply(vc.matrixWorldInverse);
    _plane.setFromNormalAndCoplanarPoint(_n, _rp).applyMatrix4(vc.matrixWorldInverse);
    _clip.set(_plane.normal.x, _plane.normal.y, _plane.normal.z, _plane.constant);
    const e = vc.projectionMatrix.elements;
    _q.x = (Math.sign(_clip.x) + e[8]) / e[0];
    _q.y = (Math.sign(_clip.y) + e[9]) / e[5];
    _q.z = -1;
    _q.w = (1 + e[10]) / e[14];
    _clip.multiplyScalar(2 / _clip.dot(_q));
    e[2] = _clip.x;
    e[6] = _clip.y;
    e[10] = _clip.z + 1;
    e[14] = _clip.w;
    vc.projectionMatrixInverse.copy(vc.projectionMatrix).invert();
    const prevTarget = r.getRenderTarget();
    const prevXr = r.xr.enabled;
    const prevShadow = r.shadowMap.autoUpdate;
    const prevAuto = r.autoClear;
    const vis = hide.map((o) => o.visible);
    for (const o of hide) o.visible = false;
    r.xr.enabled = false;
    r.shadowMap.autoUpdate = false;
    r.autoClear = true;
    r.setRenderTarget(this.rt);
    r.state.buffers.depth.setMask(true);
    r.render(this.scene, vc);
    r.setRenderTarget(prevTarget);
    r.xr.enabled = prevXr;
    r.shadowMap.autoUpdate = prevShadow;
    r.autoClear = prevAuto;
    hide.forEach((o, i) => { o.visible = vis[i]; });
    const vp = camera.viewport;
    if (vp !== undefined) r.state.viewport(vp);
    this.valid = true;
    this.renders++;
  }

  dispose() {
    this.rt.dispose();
  }
}
