// InputController: keyboard, mouse and touch, turned into one input snapshot
// per frame. One-shot presses (E, Space) are latched until consumed.
const MOVE = {
  KeyW: [0, -1],
  ArrowUp: [0, -1],
  KeyS: [0, 1],
  ArrowDown: [0, 1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};

export class InputController {
  constructor(canvas, { onHotkey } = {}) {
    this.canvas = canvas;
    this.keys = new Set();
    this.mouse = { x: 0, y: 0, down: false, inside: false };
    this.touch = null;
    this.latched = { interact: false, ability: false };
    this.onHotkey = onHotkey;
    this.enabled = true;
    this.usedTouch = false;

    addEventListener('keydown', (e) => {
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if (this.onHotkey && this.onHotkey(e)) {
        e.preventDefault();
        return;
      }
      if (e.code === 'Space' || e.code.startsWith('Arrow') || e.code === 'Tab') e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'KeyE') this.latched.interact = true;
      if (e.code === 'Space') this.latched.ability = true;
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => {
      this.keys.clear();
      this.mouse.down = false;
    });

    canvas.addEventListener('mousemove', (e) => this.setMouse(e));
    canvas.addEventListener('mousedown', (e) => {
      this.setMouse(e);
      if (e.button === 0) this.mouse.down = true;
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.down = false;
    });
    canvas.addEventListener('mouseleave', () => (this.mouse.inside = false));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // Touch: the ship flies toward your finger and auto-fires at nearby rock.
    const t = (e) => {
      e.preventDefault();
      this.usedTouch = true;
      const p = e.touches[0];
      if (!p) {
        this.touch = null;
        return;
      }
      const r = canvas.getBoundingClientRect();
      this.touch = { x: p.clientX - r.left, y: p.clientY - r.top, boost: e.touches.length > 1 };
    };
    canvas.addEventListener('touchstart', t, { passive: false });
    canvas.addEventListener('touchmove', t, { passive: false });
    canvas.addEventListener('touchend', t, { passive: false });
    canvas.addEventListener('touchcancel', () => (this.touch = null));
  }

  setMouse(e) {
    const r = this.canvas.getBoundingClientRect();
    this.mouse.x = e.clientX - r.left;
    this.mouse.y = e.clientY - r.top;
    this.mouse.inside = true;
  }

  // Build the snapshot the simulation consumes. `toWorld` converts CSS
  // pixels on the canvas to world coordinates.
  snapshot(toWorld, ship, menuOpen) {
    let mx = 0;
    let my = 0;
    for (const k of this.keys) {
      const m = MOVE[k];
      if (m) {
        mx += m[0];
        my += m[1];
      }
    }
    const input = {
      mx: Math.sign(mx),
      my: Math.sign(my),
      fire: this.mouse.down,
      boost: this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'),
      interact: this.latched.interact,
      ability: this.latched.ability,
      menuOpen,
      touchAim: false,
    };
    this.latched.interact = false;
    this.latched.ability = false;
    if (this.touch) {
      const w = toWorld(this.touch.x, this.touch.y);
      const dx = w.x - ship.x;
      const dy = w.y - ship.y;
      const d = Math.hypot(dx, dy);
      if (d > 26) {
        input.mx = dx / d;
        input.my = dy / d;
      }
      input.boost = this.touch.boost;
      input.touchAim = true;
      input.aimX = w.x;
      input.aimY = w.y;
    } else {
      const w = toWorld(this.mouse.x, this.mouse.y);
      input.aimX = w.x;
      input.aimY = w.y;
    }
    return input;
  }
}
