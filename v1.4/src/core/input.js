// Rug Rush input: keyboard and mouse state, per-frame edges, pointer lock and mouse look deltas.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.down = new Set();
    this.pressedSet = new Set();
    this.releasedSet = new Set();
    this.mouseDown = [false, false, false];
    this.mousePressed = [false, false, false];
    this.mouseReleased = [false, false, false];
    this.dx = 0;
    this.dy = 0;
    this.wheel = 0;
    this.locked = false;
    this.enabled = true;
    this.order = 1000;
    this.sensitivity = 0.0022;
    addEventListener('keydown', (e) => {
      if (!this.enabled || e.repeat) return;
      if (e.target?.closest?.('input,textarea,select')) return;
      this.down.add(e.code);
      this.pressedSet.add(e.code);
      if (['Space', 'Tab', 'F3'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => {
      this.down.delete(e.code);
      this.releasedSet.add(e.code);
    });
    addEventListener('blur', () => {
      this.down.clear();
      this.mouseDown.fill(false);
    });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      if (!this.locked && this.autoLock !== false) {
        this.lock();
        return;
      }
      this.mouseDown[e.button] = true;
      this.mousePressed[e.button] = true;
    });
    addEventListener('mouseup', (e) => {
      if (this.mouseDown[e.button]) this.mouseReleased[e.button] = true;
      this.mouseDown[e.button] = false;
    });
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.dx += e.movementX;
      this.dy += e.movementY;
    });
    addEventListener('wheel', (e) => {
      if (this.locked) this.wheel += Math.sign(e.deltaY);
    }, { passive: true });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) this.mouseDown.fill(false);
      this.onLockChange?.(this.locked);
    });
  }

  lock() {
    this.canvas.requestPointerLock?.()?.catch?.(() => {});
  }

  unlock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  held(code) {
    return this.down.has(code);
  }

  pressed(code) {
    return this.pressedSet.has(code);
  }

  released(code) {
    return this.releasedSet.has(code);
  }

  axis(neg, pos) {
    return (this.down.has(pos) ? 1 : 0) - (this.down.has(neg) ? 1 : 0);
  }

  takeLook() {
    const d = { x: this.dx * this.sensitivity, y: this.dy * this.sensitivity * (this.invertY ? -1 : 1) };
    this.dx = 0;
    this.dy = 0;
    return d;
  }

  lateUpdate() {
    this.pressedSet.clear();
    this.releasedSet.clear();
    this.mousePressed.fill(false);
    this.mouseReleased.fill(false);
    this.wheel = 0;
  }

  simulate(code, isDown) {
    if (isDown) {
      this.down.add(code);
      this.pressedSet.add(code);
    } else {
      this.down.delete(code);
      this.releasedSet.add(code);
    }
  }

  simulateMouse(button, isDown) {
    if (isDown) {
      this.mouseDown[button] = true;
      this.mousePressed[button] = true;
    } else {
      this.mouseDown[button] = false;
      this.mouseReleased[button] = true;
    }
  }
}
