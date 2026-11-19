// Input: keyboard + pointer-locked mouse look. Presses are latched until read.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.dx = 0;
    this.dy = 0;
    this.lmb = false;
    this.rmb = false;
    this.wheel = 0;
    this.enabled = true;
    addEventListener('keydown', (e) => {
      if (/INPUT|TEXTAREA|SELECT/.test(e.target?.tagName || '')) return;
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => {
      this.keys.clear();
      this.lmb = this.rmb = false;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (document.pointerLockElement !== canvas && this.enabled) canvas.requestPointerLock?.();
      if (e.button === 0) this.lmb = true;
      if (e.button === 2) this.rmb = true;
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.lmb = false;
      if (e.button === 2) this.rmb = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === canvas) {
        this.dx += e.movementX || 0;
        this.dy += e.movementY || 0;
      }
    });
    canvas.addEventListener('wheel', (e) => (this.wheel += Math.sign(e.deltaY)), { passive: true });
  }

  get locked() {
    return this.forceLock || document.pointerLockElement === this.canvas;
  }

  release() {
    if (this.locked) document.exitPointerLock?.();
    this.lmb = this.rmb = false;
  }

  down(code) {
    return this.enabled && this.keys.has(code);
  }

  // True once per key press.
  hit(code) {
    if (!this.pressed.has(code)) return false;
    this.pressed.delete(code);
    return this.enabled;
  }

  axis(neg, pos) {
    return (this.down(pos) ? 1 : 0) - (this.down(neg) ? 1 : 0);
  }

  // Mouse movement since the last call.
  look() {
    const d = { x: this.enabled ? this.dx : 0, y: this.enabled ? this.dy : 0 };
    this.dx = this.dy = 0;
    return d;
  }

  endFrame() {
    this.pressed.clear();
    this.wheel = 0;
  }
}
