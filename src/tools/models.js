// Rug Rush phase-1 quick models for product containers and tools, with canvas brand labels.
import * as THREE from 'three';

const cache = new Map();
function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!cache.has(key)) cache.set(key, new THREE.MeshStandardMaterial({ color, roughness: opts.r ?? 0.45, metalness: opts.m ?? 0, ...(opts.extra ?? {}) }));
  return cache.get(key);
}

function shade(hex, k) {
  const c = new THREE.Color(hex);
  return c.multiplyScalar(k).getStyle();
}

export function labelTexture(p) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = p.color;
  g.fillRect(0, 0, 512, 256);
  g.fillStyle = 'rgba(255,255,255,0.92)';
  g.fillRect(0, 40, 512, 176);
  g.fillStyle = shade(p.color, 0.45);
  g.font = 'bold 64px Helvetica, Arial, sans-serif';
  g.textAlign = 'center';
  g.fillText(p.brand, 256, 112);
  g.fillStyle = '#222';
  g.font = '24px Helvetica, Arial, sans-serif';
  const words = p.name.split(' ');
  let line = '', y = 152;
  for (const w of words) {
    if (g.measureText(line + w).width > 440) {
      g.fillText(line.trim(), 256, y);
      line = '';
      y += 28;
    }
    line += w + ' ';
  }
  g.fillText(line.trim(), 256, y);
  g.fillStyle = shade(p.color, 0.6);
  g.fillRect(0, 216, 512, 40);
  g.fillStyle = '#fff';
  g.font = 'bold 18px Helvetica, Arial, sans-serif';
  g.fillText(p.form === 'powder' ? 'POWDER' : p.form === 'foam' ? 'FOAM' : p.form === 'mist' ? 'SPRAY' : 'CONCENTRATE', 256, 242);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function cyl(r, h, color, opts) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 20), mat(color, opts));
  m.castShadow = true;
  return m;
}

function box(x, y, z, color, opts) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(x, y, z), mat(color, opts));
  m.castShadow = true;
  return m;
}

function labelBand(r, h, tex, y = 0) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.01, r * 1.01, h, 24, 1, true, -Math.PI * 0.55, Math.PI * 1.1), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 }));
  m.position.y = y;
  m.rotation.y = Math.PI;
  return m;
}

export function containerModel(p) {
  const g = new THREE.Group();
  const tex = labelTexture(p);
  let shape, nozzle = new THREE.Object3D(), half;
  const plastic = { r: 0.35 };
  if (p.container === 'trigger') {
    const b = cyl(0.038, 0.2, p.color, plastic);
    g.add(b, labelBand(0.038, 0.11, tex, -0.02));
    const neck = cyl(0.016, 0.03, '#f4f4f4');
    neck.position.y = 0.115;
    const head = box(0.035, 0.045, 0.085, '#f4f4f4');
    head.position.set(0, 0.15, -0.02);
    const trig = box(0.012, 0.05, 0.012, '#e8e8e8');
    trig.position.set(0, 0.11, -0.045);
    trig.name = 'trigger';
    g.add(neck, head, trig);
    nozzle.position.set(0, 0.155, -0.065);
    shape = { type: 'cylinder', r: 0.04, h: 0.29, cy: 0.04 };
    half = 0.145;
  } else if (p.container === 'aerosol') {
    const b = cyl(0.033, 0.19, '#c9ced3', { r: 0.25, m: 0.8 });
    g.add(b, labelBand(0.033, 0.12, tex));
    const cap = cyl(0.028, 0.03, p.color === '#ffffff' ? '#5aa9e6' : p.color, plastic);
    cap.position.y = 0.11;
    g.add(cap);
    nozzle.position.set(0, 0.12, -0.02);
    shape = { type: 'cylinder', r: 0.034, h: 0.25, cy: 0.02 };
    half = 0.125;
  } else if (p.container === 'jug') {
    const b = cyl(0.058, 0.22, p.color, { r: 0.3, extra: { transparent: true, opacity: 0.92 } });
    g.add(b, labelBand(0.058, 0.12, tex, -0.02));
    const cap = cyl(0.022, 0.035, '#ffffff');
    cap.position.y = 0.13;
    const handle = box(0.02, 0.12, 0.03, p.color, plastic);
    handle.position.set(0, 0.03, 0.07);
    g.add(cap, handle);
    nozzle.position.set(0, 0.15, 0);
    shape = { type: 'cylinder', r: 0.06, h: 0.26, cy: 0.02 };
    half = 0.13;
  } else if (p.container === 'jerrycan') {
    const b = box(0.12, 0.3, 0.2, p.color, plastic);
    g.add(b);
    const lab = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.12), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 }));
    lab.position.set(0.0605, -0.02, 0);
    lab.rotation.y = Math.PI / 2;
    const lab2 = lab.clone();
    lab2.position.x = -0.0605;
    lab2.rotation.y = -Math.PI / 2;
    const handle = box(0.03, 0.04, 0.12, shade(p.color, 0.8), plastic);
    handle.position.set(0, 0.17, 0.02);
    const spout = cyl(0.02, 0.05, '#222');
    spout.position.set(0, 0.165, -0.075);
    g.add(lab, lab2, handle, spout);
    nozzle.position.set(0, 0.19, -0.075);
    shape = { type: 'box', x: 0.06, y: 0.17, z: 0.1, cy: 0.02 };
    half = 0.17;
  } else if (p.container === 'tub') {
    const b = cyl(0.085, 0.15, '#f7f7f2', plastic);
    g.add(b, labelBand(0.085, 0.1, tex));
    const lid = cyl(0.088, 0.025, p.color === '#ffffff' ? '#3d8fe0' : shade(p.color, 0.85), plastic);
    lid.position.y = 0.085;
    g.add(lid);
    nozzle.position.set(0, 0.1, 0);
    shape = { type: 'cylinder', r: 0.088, h: 0.175, cy: 0.012 };
    half = 0.09;
  } else if (p.container === 'shaker') {
    const b = cyl(0.045, 0.17, '#f2efe6', plastic);
    g.add(b, labelBand(0.045, 0.12, tex));
    const cap = cyl(0.047, 0.02, '#9aa3a8', { r: 0.3, m: 0.6 });
    cap.position.y = 0.095;
    g.add(cap);
    nozzle.position.set(0, 0.11, 0);
    shape = { type: 'cylinder', r: 0.047, h: 0.19, cy: 0.01 };
    half = 0.095;
  } else {
    const b = cyl(0.08, 0.3, '#ffffff', plastic);
    g.add(b, labelBand(0.08, 0.14, tex));
    const pump = cyl(0.012, 0.12, '#e94f37');
    pump.position.y = 0.2;
    const knob = box(0.08, 0.025, 0.025, '#e94f37');
    knob.position.y = 0.26;
    const wand = cyl(0.008, 0.35, '#333');
    wand.rotation.x = Math.PI / 2;
    wand.position.set(0.09, 0.05, -0.15);
    const tip = cyl(0.018, 0.05, '#e94f37');
    tip.rotation.x = Math.PI / 2;
    tip.position.set(0.09, 0.05, -0.33);
    g.add(pump, knob, wand, tip);
    nozzle.position.set(0.09, 0.05, -0.36);
    shape = { type: 'cylinder', r: 0.08, h: 0.3, cy: 0 };
    half = 0.15;
  }
  g.add(nozzle);
  return { group: g, nozzle, shape, half };
}

export function toolModel(def) {
  const g = new THREE.Group();
  const head = new THREE.Group();
  g.add(head);
  let shape, stick = null, tip = new THREE.Object3D(), handleLen = 0;
  const k = def.kind;
  if (k === 'vacuum') {
    const col = def.wet ? '#2c7bd1' : '#d33a2c';
    const h = box(0.36, 0.08, 0.24, '#2b2d30', { r: 0.6 });
    const hood = box(0.3, 0.06, 0.16, col, { r: 0.35 });
    hood.position.set(0, 0.06, 0.02);
    head.add(h, hood);
    if (def.wet) {
      const tank = cyl(0.11, 0.3, col, { r: 0.35 });
      tank.position.set(0, 0.35, 0.12);
      head.add(tank);
    } else {
      const bag = box(0.2, 0.42, 0.14, col, { r: 0.4 });
      bag.position.set(0, 0.42, 0.13);
      head.add(bag);
    }
    handleLen = 1.05;
    shape = { type: 'box', x: 0.18, y: 0.04, z: 0.12, cy: 0 };
  } else if (k === 'brush') {
    const col = def.rubber ? '#e5542e' : def.rake ? '#9aa1a6' : def.strength > 0.8 ? '#2f6db5' : '#c9a35f';
    if (def.rake) {
      const bar = box(0.42, 0.03, 0.05, col, { r: 0.3, m: 0.7 });
      bar.position.y = 0.06;
      head.add(bar);
      const tines = new THREE.InstancedMesh(new THREE.BoxGeometry(0.006, 0.06, 0.006), mat('#b8bec2', { r: 0.25, m: 0.9 }), 30);
      const m4 = new THREE.Matrix4();
      for (let i = 0; i < 30; i++) tines.setMatrixAt(i, m4.makeTranslation(-0.2 + i * 0.0138, 0.02, 0));
      head.add(tines);
      handleLen = 1.3;
      shape = { type: 'box', x: 0.21, y: 0.04, z: 0.03, cy: 0.04 };
    } else {
      const blk = box(0.2, 0.035, 0.08, def.rubber ? '#e5542e' : '#7a5230', { r: 0.6 });
      blk.position.y = 0.045;
      const br = box(0.19, 0.03, 0.07, def.rubber ? '#c4441f' : col, { r: 0.9 });
      br.position.y = 0.015;
      const hd = box(0.12, 0.025, 0.035, def.rubber ? '#e5542e' : '#7a5230', { r: 0.6 });
      hd.position.y = 0.078;
      head.add(blk, br, hd);
      shape = { type: 'box', x: 0.1, y: 0.045, z: 0.04, cy: 0.045 };
    }
  } else if (k === 'squeegee') {
    const frame = box(0.56, 0.04, 0.035, '#f2c230', { r: 0.4 });
    frame.position.y = 0.05;
    const blade = box(0.55, 0.04, 0.008, '#151515', { r: 0.8 });
    blade.position.y = 0.015;
    head.add(frame, blade);
    handleLen = 1.3;
    shape = { type: 'box', x: 0.28, y: 0.035, z: 0.02, cy: 0.035 };
  } else if (k === 'scraper') {
    const bl = box(0.06, 0.004, 0.1, '#efe6d2', { r: 0.4 });
    bl.position.y = 0.004;
    const hd = box(0.03, 0.02, 0.1, '#5a3a22', { r: 0.6 });
    hd.position.set(0, 0.015, 0.1);
    head.add(bl, hd);
    shape = { type: 'box', x: 0.03, y: 0.015, z: 0.1, cy: 0.012 };
  } else if (k === 'iron') {
    const paper = box(0.3, 0.002, 0.24, '#a77d4f', { r: 0.95 });
    paper.position.y = 0.001;
    const sole = box(0.13, 0.02, 0.24, '#b9bec4', { r: 0.2, m: 0.9 });
    sole.position.y = 0.014;
    const bod = box(0.12, 0.06, 0.2, '#3a7bd5', { r: 0.35 });
    bod.position.set(0, 0.05, 0.01);
    const hdl = box(0.03, 0.03, 0.14, '#222', { r: 0.6 });
    hdl.position.set(0, 0.1, 0.02);
    head.add(paper, sole, bod, hdl);
    shape = { type: 'box', x: 0.07, y: 0.05, z: 0.12, cy: 0.05 };
  } else if (k === 'uvlamp') {
    const b = cyl(0.022, 0.16, '#222', { r: 0.4, m: 0.5 });
    b.rotation.x = Math.PI / 2;
    const lens = cyl(0.026, 0.01, '#7d3cff', { extra: { emissive: new THREE.Color('#5a1cff'), emissiveIntensity: 0.3 } });
    lens.rotation.x = Math.PI / 2;
    lens.position.z = -0.085;
    lens.name = 'lens';
    head.add(b, lens);
    tip.position.z = -0.09;
    shape = { type: 'cylinder', r: 0.026, h: 0.17, cy: 0, axis: 'z' };
  } else if (k === 'blower') {
    const shell = cyl(0.26, 0.3, '#d83c2c', { r: 0.4 });
    shell.rotation.z = Math.PI / 2;
    shell.position.y = 0.3;
    const grill = cyl(0.2, 0.31, '#222', { r: 0.7 });
    grill.rotation.z = Math.PI / 2;
    grill.position.y = 0.3;
    grill.scale.set(1, 1.01, 1);
    const outlet = box(0.3, 0.12, 0.2, '#b52e21', { r: 0.4 });
    outlet.position.set(0, 0.1, -0.24);
    const feet = box(0.36, 0.04, 0.5, '#333', { r: 0.8 });
    feet.position.y = 0.02;
    head.add(shell, grill, outlet, feet);
    tip.position.set(0, 0.12, -0.36);
    shape = { type: 'box', x: 0.18, y: 0.28, z: 0.27, cy: 0.28 };
  }
  if (handleLen > 0) {
    stick = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 1, 8), mat('#6b6f73', { r: 0.4, m: 0.6 }));
    stick.castShadow = true;
    g.add(stick);
  }
  g.add(tip);
  return { group: g, head, stick, tip, shape, handleLen };
}
