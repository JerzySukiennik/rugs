// Rug Rush holdable items: product containers (spray, pour, shake, foam) and surface tools (vacuums, brushes, squeegee, scraper, iron, UV, blower).
import * as THREE from 'three';
import { R, GROUP, groups } from '../core/physics.js';
import { PRODUCTS, TOOLS } from '../data/products.js';
import { containerModel, toolModel } from './models.js';

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const UP = new THREE.Vector3(0, 1, 0);

function colliderFor(shape, mass) {
  let d;
  if (shape.type === 'box') d = R.ColliderDesc.cuboid(shape.x, shape.y, shape.z);
  else {
    d = R.ColliderDesc.cylinder(shape.h / 2, shape.r);
    if (shape.axis === 'z') d.setRotation({ x: Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2 });
  }
  d.setTranslation(0, shape.cy ?? 0, 0).setMass(mass).setFriction(0.7).setRestitution(0.15);
  d.setCollisionGroups(groups(GROUP.DYNAMIC));
  d.setActiveEvents(R.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(60);
  return d;
}

export function aimDir(game, p, origin, speed, out = new THREE.Vector3()) {
  const aim = (p.grab ?? game.grab)?.aim;
  const target = aim && aim.distance < 7 ? aim.point : _z.copy(p.eye).addScaledVector(p.forward, 4);
  out.copy(target).sub(origin);
  const d = out.length();
  if (d < 0.05) return out.copy(p.forward);
  const t = d / Math.max(0.5, speed);
  out.y += Math.min(d * 0.35, 4.9 * t * t * 0.45);
  return out.normalize();
}

export class Item {
  constructor(game, { label, group, shape, mass, position, yaw = 0, holdPose }) {
    this.game = game;
    this.kind = 'item';
    this.grabbable = true;
    this.holdStyle = 'tool';
    this.label = label;
    this.mesh = group;
    this.shape = shape;
    this.baseMass = mass;
    this.holdPose = holdPose ?? { pos: new THREE.Vector3(0.26, -0.26, -0.6), rot: new THREE.Euler(0, 0, 0) };
    this.held = false;
    this.using = false;
    game.engine.scene.add(group);
    const q = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
    this.body = game.physics.createBody(
      R.RigidBodyDesc.dynamic().setTranslation(position.x, position.y, position.z).setRotation(q).setCcdEnabled(true).setLinearDamping(0.05).setAngularDamping(0.3),
      [colliderFor(shape, mass)],
      this,
    );
    game.physics.bind(this.body, group);
    group.traverse((o) => { o.userData.item = this; });
    game.entities?.add(this);
  }

  onGrab(p) {
    this.held = true;
    this.holder = p ?? null;
  }

  onRelease() {
    this.held = false;
    this.using = false;
    this.holder = null;
  }

  worldOf(obj, out = new THREE.Vector3()) {
    obj.updateWorldMatrix(true, false);
    return out.setFromMatrixPosition(obj.matrixWorld);
  }

  serialize() {
    const t = this.body.translation(), r = this.body.rotation();
    return { label: this.label, p: [t.x, t.y, t.z], q: [r.x, r.y, r.z, r.w] };
  }

  dispose() {
    this.game.physics.unbind(this.mesh);
    this.game.physics.removeBody(this.body);
    this.mesh.removeFromParent();
  }
}

export const FOAM_EXPANSION = 20;

const STREAM = {
  mist: { kind: 'mist', speed: 6, spread: 0.25 },
  foam: { kind: 'foam', speed: 3.6, spread: 0.1 },
  gel: { kind: 'gel', speed: 0.6, spread: 0.02 },
  powder: { kind: 'powder', speed: 0.7, spread: 0.4 },
};

export class Container extends Item {
  constructor(game, productId, position, yaw = 0) {
    const p = PRODUCTS[productId];
    const m = containerModel(p);
    const pose = p.container === 'jerrycan'
      ? { pos: new THREE.Vector3(0.24, -0.34, -0.62), rot: new THREE.Euler(0, 0, 0) }
      : p.container === 'foamer'
        ? { pos: new THREE.Vector3(0.3, -0.46, -0.62), rot: new THREE.Euler(0, 0, 0) }
        : { pos: new THREE.Vector3(0.24, -0.26, -0.55), rot: new THREE.Euler(0, 0, 0) };
    super(game, { label: `${p.brand} ${p.name}`, group: m.group, shape: m.shape, mass: 0.25 + p.capacity * 1.05, position, yaw, holdPose: pose });
    this.productId = productId;
    this.product = p;
    this.nozzle = m.nozzle;
    this.trigger = m.group.getObjectByName('trigger');
    this.fill = p.capacity;
    this.tilt = 0;
    this.stream = null;
    this.t = 0;
    this.mode = p.form === 'gel' ? 'pour' : p.form === 'powder' ? 'shake' : 'spray';
  }

  get fillFrac() {
    return this.fill / this.product.capacity;
  }

  info() {
    return `${Math.round(this.fillFrac * 100)}% · ${this.product.blurb}`;
  }

  hint() {
    return this.mode === 'spray' ? 'LMB spray where you look' : this.mode === 'pour' ? 'LMB tilt and pour' : 'LMB shake out';
  }

  ensureStream() {
    if (this.stream || !this.game.fluids) return this.stream;
    const p = this.product;
    const s = STREAM[p.form];
    this.stream = this.game.fluids.createStream(s.kind, { color: p.color, rate: p.rate * (s.kind === 'foam' ? FOAM_EXPANSION : 1), speed: s.speed, spread: s.spread, productId: this.productId });
    return this.stream;
  }

  useStart() {
    this.using = true;
  }

  useEnd() {
    this.using = false;
    if (this.stream) this.stream.active = false;
  }

  directDeposit(origin, dir, amount) {
    const g = this.game;
    const d = this.mode === 'spray' ? dir : _x.set(dir.x * 0.3, -1, dir.z * 0.3).normalize();
    const h = g.carpets?.raycast(origin, d, 3);
    if (h && h.part !== 'label') g.chem.deposit(h.carpet, h.uv, STREAM[this.product.form].kind, this.productId, amount);
  }

  holdTarget(p, grab, outPos, outQuat) {
    const hp = this.holdPose;
    const target = this.using ? 1 : 0;
    this.tilt += (target - this.tilt) * 0.12;
    _e.copy(hp.rot);
    _v.copy(hp.pos);
    if (this.mode === 'pour') {
      _e.x -= this.tilt * 1.9;
      _v.y += this.tilt * 0.08;
    } else if (this.mode === 'shake') {
      _e.x -= this.tilt * 2.3;
      _v.y += this.tilt * 0.1 + (this.using ? Math.sin(this.t * 48) * 0.025 : 0);
    } else if (this.product.container === 'trigger' && this.trigger) {
      this.trigger.rotation.x = this.using ? -0.35 : 0;
    }
    outPos.copy(_v).applyMatrix4(p.camera.matrixWorld);
    outQuat.setFromEuler(_e).premultiply(p.camera.quaternion);
    if (this.mode !== 'spray' && this.tilt > 0.02) {
      const aim = grab.aim;
      if (aim && aim.distance < 2.8 && aim.normal.y > 0.5) {
        _w.copy(aim.point);
        _w.y += 0.38;
        const flat = _x.copy(p.forward).setY(0).normalize();
        _w.addScaledVector(flat, -0.12);
        outPos.lerp(_w, Math.min(1, this.tilt * 1.2));
      }
    }
    return true;
  }

  get flowing() {
    return this.fill > 0 && (this.mode === 'spray' || this.tilt > 0.55);
  }

  flowDir(p, origin, out) {
    if (this.mode === 'spray') return aimDir(this.game, p, origin, STREAM[this.product.form].speed, out);
    this.nozzle.updateWorldMatrix(true, false);
    out.set(0, 1, 0).transformDirection(this.mesh.matrixWorld).multiplyScalar(-0.1).add(_x.copy(p.forward).multiplyScalar(0.6));
    out.y = Math.min(out.y, -0.25);
    return out.normalize();
  }

  useHold(p, dt) {
    this.t += dt;
    const s = this.ensureStream();
    const flowing = this.flowing;
    if (s) s.active = flowing;
    if (!flowing) return;
    const origin = this.worldOf(this.nozzle, _w);
    const dir = this.flowDir(p, origin, _v);
    if (s) s.emit(origin, dir, p.velocity);
    else this.directDeposit(origin, dir, this.product.rate * dt * (this.product.form === 'foam' ? FOAM_EXPANSION : 1));
    this.fill = Math.max(0, this.fill - this.product.rate * dt);
  }
}

export class Tool extends Item {
  constructor(game, toolId, position, yaw = 0) {
    const def = TOOLS[toolId];
    const m = toolModel(def);
    const mass = { vacuum: 7, brush: 0.4, squeegee: 1.2, scraper: 0.1, iron: 1.4, uvlamp: 0.3, blower: 11 }[def.kind] ?? 1;
    super(game, { label: def.name, group: m.group, shape: m.shape, mass, position, yaw });
    this.toolId = toolId;
    this.def = def;
    this.headObj = m.head;
    this.stick = m.stick;
    this.tipObj = m.tip;
    this.handleLen = m.handleLen;
    this.reach = m.handleLen > 0 ? 2.5 : 1.7;
    this.lift = (m.shape.y ?? 0.03) - (m.shape.cy ?? 0) + 0.004;
    this.beater = !!def.beater;
    this.dots = 1;
    this.on = def.kind === 'blower';
    this.tank = 0;
    this.load = { liters: 0, dirt: 0, soap: 0 };
    this.prevHead = null;
    this.prevUv = null;
    this.t = 0;
    this.hit = null;
    this.uvLight = null;
    if (def.kind === 'uvlamp') {
      const l = new THREE.SpotLight(0x7a3cff, 0, 7, 0.42, 0.5, 1.4);
      l.position.set(0, 0, -0.09);
      l.target.position.set(0, 0, -2);
      this.headObj.add(l, l.target);
      this.uvLight = l;
    }
    if (def.kind === 'blower') this.holdPose = { pos: new THREE.Vector3(0.1, -0.75, -0.75), rot: new THREE.Euler(0, 0, 0) };
    if (def.kind === 'uvlamp') this.holdPose = { pos: new THREE.Vector3(0.22, -0.22, -0.45), rot: new THREE.Euler(0, 0, 0) };
    if (game.blowers && def.kind === 'blower') game.blowers.push(this);
  }

  hint() {
    const k = this.def.kind;
    if (k === 'vacuum') return this.def.wet ? 'LMB suck up water · RMB empty tank (over the drain!)' : 'LMB vacuum · RMB beater bar';
    if (k === 'brush') return this.def.rake ? 'LMB rake the pile' : 'LMB scrub (move your aim)';
    if (k === 'squeegee') return 'LMB push water off the rug and into the drain';
    if (k === 'scraper') return 'LMB scrape (freeze gum first)';
    if (k === 'iron') return 'LMB press on wax · RMB heat';
    if (k === 'uvlamp') return 'LMB on/off · shows urine';
    if (k === 'blower') return 'LMB on/off · set it down facing a wet rug';
    return 'LMB use';
  }

  get surfaceTool() {
    return ['vacuum', 'brush', 'squeegee', 'scraper', 'iron'].includes(this.def.kind);
  }

  info() {
    const k = this.def.kind;
    if (k === 'vacuum') return this.def.wet ? `Tank ${this.tank.toFixed(1)} / ${this.def.tank} L · RMB empty tank` : `Beater bar ${this.beater ? 'ON' : 'OFF'} · RMB toggle`;
    if (k === 'iron') return `Heat ${'●'.repeat(this.dots)}${'○'.repeat(3 - this.dots)} · RMB change`;
    if (k === 'uvlamp' || k === 'blower') return this.on ? 'ON · LMB toggle' : 'OFF · LMB toggle';
    return '';
  }

  useStart() {
    const k = this.def.kind;
    if (k === 'uvlamp' || k === 'blower') this.on = !this.on;
    else this.using = true;
  }

  useEnd() {
    this.using = false;
    this.prevUv = null;
  }

  altStart(p) {
    const k = this.def.kind;
    if (k === 'vacuum' && !this.def.wet) this.beater = !this.beater;
    if (k === 'iron') this.dots = (this.dots % 3) + 1;
    if (k === 'vacuum' && this.def.wet && this.tank > 0.05) {
      const at = this.worldOf(this.headObj, _w);
      this.game.fluids?.addWater(at.x, at.z, this.tank, { dirt: Math.min(1, this.load.dirt), soap: Math.min(1, this.load.soap), radius: 0.25 });
      this.tank = 0;
      this.load.dirt = 0;
      this.load.soap = 0;
    }
  }

  holdTarget(p, grab, outPos, outQuat) {
    if (!this.surfaceTool) {
      if (this.def.kind === 'blower') {
        outPos.copy(this.holdPose.pos).applyMatrix4(p.camera.matrixWorld);
        outQuat.setFromAxisAngle(UP, p.yaw);
        return true;
      }
      return false;
    }
    const hit = grab.surfaceAim(this.reach);
    this.hit = hit;
    if (!hit || hit.normal.y < 0.35) return false;
    _y.copy(hit.normal);
    _z.copy(p.forward).addScaledVector(_y, -p.forward.dot(_y));
    if (_z.lengthSq() < 1e-4) _z.set(0, 0, -1);
    _z.normalize().negate();
    _x.crossVectors(_y, _z).normalize();
    _z.crossVectors(_x, _y);
    _m.makeBasis(_x, _y, _z);
    outQuat.setFromRotationMatrix(_m);
    outPos.copy(hit.point).addScaledVector(_y, this.lift);
    if (this.using && this.def.kind === 'brush' && !this.def.rake) {
      this.t += 1 / 60;
      outPos.addScaledVector(_z, Math.sin(this.t * 31) * 0.055);
    }
    return true;
  }

  headUnder() {
    const g = this.game;
    const head = this.worldOf(this.headObj, _w);
    const up = _v.set(0, 1, 0).applyQuaternion(this.mesh.quaternion);
    const from = head.clone().addScaledVector(up, 0.25);
    const ch = g.carpets?.raycast(from, up.clone().negate(), 0.45);
    return { head: head.clone(), up: up.clone(), carpetHit: ch ?? null };
  }

  useHold(p, dt) {
    const k = this.def.kind;
    const g = this.game;
    if (!this.surfaceTool || !this.hit) return;
    const { head, up, carpetHit } = this.headUnder();
    const prev = this.prevHead ?? head;
    const move = _x.copy(head).sub(prev);
    this.prevHead = head;
    let dirU = 0, dirV = 1;
    if (carpetHit) {
      dirU = move.dot(carpetHit.tangentU);
      dirV = move.dot(carpetHit.tangentV);
      if (Math.hypot(dirU, dirV) < 1e-4) {
        const f = p.forward;
        dirU = -f.dot(carpetHit.tangentU);
        dirV = -f.dot(carpetHit.tangentV);
      }
    }
    const c = carpetHit?.carpet;
    const uvs = [];
    if (c) {
      const uv = carpetHit.uv;
      if (this.prevUv && this.prevUv.c === c) {
        const du = uv.u - this.prevUv.u, dv = uv.v - this.prevUv.v;
        const distM = Math.hypot(du * c.width, dv * c.length);
        const steps = Math.min(8, Math.floor(distM / 0.03));
        for (let s = 1; s <= steps; s++) uvs.push({ u: this.prevUv.u + (du * s) / (steps + 1), v: this.prevUv.v + (dv * s) / (steps + 1) });
      }
      uvs.push(uv);
      this.prevUv = { c, u: uv.u, v: uv.v };
    } else this.prevUv = null;
    const share = 1 / Math.max(1, uvs.length);
    if (k === 'vacuum') {
      if (c) {
        for (const uv of uvs) {
          const r = g.chem.vacuum(c, uv, this.def.radius, { beater: this.beater, wet: this.def.wet }, dirU, dirV);
          if (this.def.wet) this.absorb(r.liters, r.dirt, 0);
        }
      } else if (this.def.wet && g.fluids) {
        const got = g.fluids.removeWater(head.x, head.z, this.def.radius * 1.2, Math.min(0.8 * dt, this.def.tank - this.tank));
        this.absorb(got, 0.3 * got, 0);
      }
    } else if (k === 'brush') {
      if (c) for (const uv of uvs) g.chem.agitate(c, uv, this.def.radius, this.def, dirU, dirV, dt * share);
    } else if (k === 'squeegee') {
      const side = _y.crossVectors(up, _z.set(0, 0, -1).applyQuaternion(this.mesh.quaternion)).normalize();
      const a = head.clone().addScaledVector(side, this.def.width / 2);
      const b = head.clone().addScaledVector(side, -this.def.width / 2);
      if (c) {
        let lit = 0, dirt = 0, soap = 0;
        for (const uv of uvs) {
          for (let o = -1; o <= 1; o++) {
            const off = (o * this.def.width) / 3;
            const ou = uv.u + (off * side.dot(carpetHit.tangentU)) / c.width;
            const ov = uv.v + (off * side.dot(carpetHit.tangentV)) / c.length;
            const r = g.chem.squeegee(c, { u: ou, v: ov }, this.def.width / 6, dirU, dirV);
            lit += r.liters; dirt += r.dirt; soap += r.soap;
          }
        }
        if (lit > 0.0005 && g.fluids) {
          const ahead = head.clone().add(move.clone().setY(0).normalize().multiplyScalar(0.08));
          g.fluids.addWater(ahead.x, ahead.z, lit, { dirt: Math.min(1, dirt / lit), soap: Math.min(1, soap / lit), radius: 0.18 });
        }
      } else g.fluids?.squeegee(this.id, a, b);
    } else if (k === 'scraper') {
      if (c) for (const uv of uvs) g.chem.scrape(c, uv, this.def.radius);
    } else if (k === 'iron') {
      if (c) g.chem.iron(c, carpetHit.uv, this.def.radius, this.dots, dt);
    }
  }

  absorb(liters, dirt, soap) {
    if (!(liters > 0)) return;
    const room = this.def.tank - this.tank;
    const l = Math.min(room, liters);
    this.tank += l;
    this.load.dirt += dirt;
    this.load.soap += soap;
  }

  update(p) {
    if (this.stick && this.held) {
      const hand = _v.set(0.22, -0.32, -0.32).applyMatrix4(p.camera.matrixWorld);
      this.updateStick(hand);
    } else if (this.stick) {
      const top = this.worldOf(this.headObj, _w).clone().add(_v.set(0, 1, 0).applyQuaternion(this.mesh.quaternion).multiplyScalar(this.handleLen));
      this.updateStick(top);
    }
    if (this.uvLight) {
      this.uvLight.intensity = this.on ? 6 : 0;
      const lens = this.headObj.getObjectByName('lens');
      if (lens) lens.material.emissiveIntensity = this.on ? 3 : 0.2;
      if (this.on) {
        const pos = this.worldOf(this.tipObj, new THREE.Vector3());
        const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.mesh.quaternion);
        this.game.carpets?.setUvLamp({ on: true, position: pos, direction: dir, angle: 0.42 });
        this.game.uvLampOwner = this;
      } else if (this.game.uvLampOwner === this) {
        this.game.carpets?.setUvLamp({ on: false });
        this.game.uvLampOwner = null;
      }
    }
  }

  updateStick(handWorld) {
    const base = this.worldOf(this.headObj, _w).clone();
    base.y += this.def.kind === 'vacuum' ? 0.08 : 0.05;
    const inv = _m.copy(this.mesh.matrixWorld).invert();
    const a = base.applyMatrix4(inv);
    const b = handWorld.clone().applyMatrix4(inv);
    const d = b.clone().sub(a);
    const len = Math.min(this.handleLen, d.length());
    d.setLength(len);
    this.stick.position.copy(a).addScaledVector(d, 0.5);
    this.stick.scale.set(1, len, 1);
    this.stick.quaternion.setFromUnitVectors(UP, d.clone().normalize());
  }
}

export function spawnProduct(game, productId, position, yaw = 0) {
  const it = new Container(game, productId, position, yaw);
  game.items?.push(it);
  return it;
}

export function spawnTool(game, toolId, position, yaw = 0) {
  const it = new Tool(game, toolId, position, yaw);
  game.items?.push(it);
  return it;
}
