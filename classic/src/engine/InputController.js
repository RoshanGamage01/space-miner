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
    this.mouse = { x: 0, y: 0, down: false, right: false, inside: false };
    this.touch = null;
    this.latched = { interact: false, ability: false, dash: false, weapon: null, cycle: false };
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
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.latched.dash = true;
      const n = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3 }[e.code];
      if (n !== undefined) this.latched.weapon = n;
      if (e.code === 'KeyQ') this.latched.cycle = true;
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => {
      this.keys.clear();
      this.mouse.down = false;
      this.mouse.right = false;
    });

    // Cockpit mouselook: pointer lock, horizontal movement turns the ship.
    this.lookDX = 0;
    this.cockpit = false;
    canvas.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === canvas) this.lookDX += e.movementX || 0;
      else this.setMouse(e);
    });
    canvas.addEventListener('mousedown', (e) => {
      this.setMouse(e);
      if (e.button === 0) this.mouse.down = true;
      if (e.button === 2) this.mouse.right = true;
      if (this.cockpit && document.pointerLockElement !== canvas) canvas.requestPointerLock?.();
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.down = false;
      if (e.button === 2) this.mouse.right = false;
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
  // pixels on the canvas to world coordinates. In cockpit view W/S thrust
  // along the nose and A/D (or the mouse) turn.
  snapshot(toWorld, ship, menuOpen, cockpit, weaponIds) {
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
      shoot: this.mouse.right || this.keys.has('KeyF'),
      boost: this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'),
      interact: this.latched.interact,
      ability: this.latched.ability,
      dash: this.latched.dash,
      menuOpen,
      touchAim: false,
    };
    if (this.latched.weapon !== null) input.weapon = weaponIds[this.latched.weapon];
    if (this.latched.cycle) {
      const i = weaponIds.indexOf(this.currentWeapon);
      input.weapon = weaponIds[(i + 1) % weaponIds.length];
    }
    this.latched.interact = false;
    this.latched.ability = false;
    this.latched.dash = false;
    this.latched.weapon = null;
    this.latched.cycle = false;

    if (cockpit) {
      const fwd = -Math.sign(my) * (my > 0 ? 0.5 : 1);
      input.turn = Math.sign(mx);
      input.turnDelta = this.lookDX * 0.0035;
      this.lookDX = 0;
      input.mx = Math.cos(ship.angle) * fwd;
      input.my = Math.sin(ship.angle) * fwd;
      return input;
    }
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

  setCockpit(on) {
    this.cockpit = on;
    if (!on && document.pointerLockElement === this.canvas) document.exitPointerLock?.();
  }
}
