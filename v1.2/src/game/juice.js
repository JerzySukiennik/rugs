// Rug Rush juice: camera shake, floating world text, confetti bursts and screen flashes reacting to game events.
import * as THREE from 'three';

function textSprite(text, color) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 160;
  const g = c.getContext('2d');
  g.font = '400 96px "Lilita One", Fredoka, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 16;
  g.strokeStyle = '#1b1b1e';
  g.lineJoin = 'round';
  g.strokeText(text, 256, 84);
  g.fillStyle = color;
  g.fillText(text, 256, 84);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false }));
  s.scale.set(1.6, 0.5, 1);
  s.renderOrder = 20;
  return s;
}

export class Juice {
  constructor(game) {
    this.game = game;
    this.order = 860;
    this.shakeAmt = 0;
    this.floaters = [];
    this.flashEl = document.createElement('div');
    this.flashEl.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:4;opacity:0;transition:opacity .35s;background:radial-gradient(ellipse at center,transparent 45%,rgba(255,93,143,.55))';
    document.body.append(this.flashEl);
    this.wire();
  }

  shake(a) {
    this.shakeAmt = Math.min(0.25, this.shakeAmt + a);
  }

  flash(color = 'rgba(255,93,143,.55)') {
    this.flashEl.style.background = `radial-gradient(ellipse at center,transparent 45%,${color})`;
    this.flashEl.style.opacity = '1';
    clearTimeout(this.ft);
    this.ft = setTimeout(() => (this.flashEl.style.opacity = '0'), 160);
  }

  float(text, pos, color = '#52c46b') {
    const s = textSprite(text, color);
    s.position.copy(pos);
    this.game.engine.scene.add(s);
    this.floaters.push({ s, t: 0, base: pos.clone() });
  }

  confetti(n = 70) {
    const colors = ['#ffd23f', '#ff5d8f', '#3bceac', '#3a86ff', '#ff8c42', '#8338ec', '#52c46b'];
    const layer = document.createElement('div');
    layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:30;overflow:hidden';
    for (let i = 0; i < n; i++) {
      const p = document.createElement('i');
      const x = 30 + Math.random() * 40;
      const dx = (Math.random() - 0.5) * 70;
      const rot = (Math.random() - 0.5) * 1440;
      const dur = 1.2 + Math.random() * 1.2;
      p.style.cssText = `position:absolute;left:${x}vw;top:42vh;width:${8 + Math.random() * 8}px;height:${12 + Math.random() * 10}px;background:${colors[i % colors.length]};border:2px solid #1b1b1e;border-radius:3px`;
      p.animate([
        { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
        { transform: `translate(${dx * 0.6}vw,${-30 - Math.random() * 25}vh) rotate(${rot * 0.4}deg)`, opacity: 1, offset: 0.35 },
        { transform: `translate(${dx}vw,${60 + Math.random() * 20}vh) rotate(${rot}deg)`, opacity: 0.2 },
      ], { duration: dur * 1000, easing: 'cubic-bezier(.2,.6,.4,1)', fill: 'forwards' });
      layer.append(p);
    }
    document.body.append(layer);
    setTimeout(() => layer.remove(), 2600);
  }

  wire() {
    const g = this.game;
    const rag = g.onRagdoll;
    g.onRagdoll = (reason) => {
      rag?.(reason);
      this.shake(0.18);
      this.flash();
    };
    const wr = g.onRugWrapped;
    g.onRugWrapped = (c, ev, price) => {
      wr?.(c, ev, price);
      const t = c.body?.translation?.();
      const p = t ? new THREE.Vector3(t.x, t.y + 0.9, t.z) : g.roller.origin.clone().setY(1.6);
      this.float(ev?.grade ?? '?', p, ev?.ruined ? '#ef3e36' : ev?.grade?.startsWith('A') ? '#52c46b' : '#ffd23f');
      if (ev?.grade === 'A+') this.confetti(60);
    };
    const disp = g.onTruckDispatched;
    g.onTruckDispatched = (truck, inside) => {
      disp?.(truck, inside);
      let total = 0;
      for (const c of inside) total += c.wrapped && c.finalPrice !== undefined ? c.finalPrice : 0;
      if (inside.length) this.float(`${total >= 0 ? '+' : '−'}$${Math.abs(total)}`, truck.pos.clone().setY(3.2), total >= 0 ? '#52c46b' : '#ef3e36');
    };
    const imp = g.onRugImpact;
    g.onRugImpact = (c, f) => {
      imp?.(c, f);
      const t = c.body?.translation?.();
      if (!t) return;
      const d = g.player.feet.distanceTo(new THREE.Vector3(t.x, t.y, t.z));
      if (f > 400 && d < 6) this.shake(Math.min(0.08, f / 20000) * (1 - d / 6));
    };
    const end = g.onShiftEnd;
    g.onShiftEnd = (day, s) => {
      end?.(day, s);
      setTimeout(() => this.confetti(90), 300);
    };
  }

  marker(text, color) {
    const s = textSprite(text, color);
    s.material.depthTest = false;
    s.scale.set(1.9, 0.6, 1);
    this.game.engine.scene.add(s);
    return s;
  }

  update(dt) {
    const g = this.game;
    const t = g.trucks?.find((k) => k.role === 'in');
    const out = g.trucks?.find((k) => k.role === 'out');
    const playing = g.mode && g.mode !== 'menu';
    const rugsIn = playing && t?.isOpen && t.carpetsInside().length > 0;
    if (!this.inMark) this.inMark = this.marker('\u2193 RUGS', '#ffd23f');
    this.inMark.visible = !!rugsIn;
    const cam = g.engine.camera.position;
    const fit = (m) => {
      const k = Math.min(4, Math.max(1, m.position.distanceTo(cam) * 0.09));
      m.scale.set(1.9 * k, 0.6 * k, 1);
    };
    if (rugsIn) {
      this.inMark.position.copy(t.localToWorld(-3.4, 3.5 + Math.sin(performance.now() / 260) * 0.15, 0));
      fit(this.inMark);
    }
    const wrapped = playing && (g.carpets?.list ?? []).some((c) => c.wrapped && !out?.carpetsInside().includes(c));
    if (!this.outMark) this.outMark = this.marker('\u2193 LOAD', '#52c46b');
    this.outMark.visible = !!(wrapped && out?.isOpen);
    if (this.outMark.visible) {
      this.outMark.position.copy(out.localToWorld(-3.4, 3.5 + Math.sin(performance.now() / 260 + 1) * 0.15, 0));
      fit(this.outMark);
    }
  }

  lateUpdate(dt) {
    const cam = this.game.engine.camera;
    if (this.shakeAmt > 0.001 && this.game.mode !== 'menu') {
      const a = this.shakeAmt;
      const t = performance.now() / 1000;
      cam.position.x += (Math.sin(t * 47) + Math.sin(t * 31)) * 0.5 * a * 0.15;
      cam.position.y += (Math.sin(t * 53) + Math.sin(t * 29)) * 0.5 * a * 0.15;
      cam.rotation.z += Math.sin(t * 41) * a * 0.08;
      cam.updateMatrixWorld();
      this.shakeAmt *= Math.exp(-dt * 6);
    }
    for (const f of [...this.floaters]) {
      f.t += dt;
      const k = f.t / 1.6;
      f.s.position.copy(f.base).add(new THREE.Vector3(0, k * 1.2, 0));
      const sc = Math.min(1, f.t * 6) * (1 + Math.max(0, 0.25 - f.t) * 1.6);
      f.s.scale.set(1.6 * sc, 0.5 * sc, 1);
      f.s.material.opacity = 1 - Math.max(0, k - 0.6) / 0.4;
      if (k >= 1) {
        f.s.removeFromParent();
        f.s.material.map.dispose();
        f.s.material.dispose();
        this.floaters.splice(this.floaters.indexOf(f), 1);
      }
    }
  }
}
