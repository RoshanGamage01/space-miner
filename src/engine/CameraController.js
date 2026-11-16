// CameraController: smooth follow with velocity look-ahead and screen shake.
export class CameraController {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.shakeT = 0;
    this.shakeMag = 0;
    this.ox = 0;
    this.oy = 0;
    this.W = 640;
    this.H = 360;
  }

  resize(W, H) {
    this.W = W;
    this.H = H;
  }

  snap(x, y) {
    this.x = x;
    this.y = y;
  }

  shake(mag, time = 0.3) {
    this.shakeMag = Math.max(this.shakeMag, mag);
    this.shakeT = Math.max(this.shakeT, time);
  }

  update(dt, ship) {
    const lookX = ship.vx * 0.35;
    const lookY = ship.vy * 0.35;
    const k = 1 - Math.exp(-4.5 * dt);
    this.x += (ship.x + lookX - this.x) * k;
    this.y += (ship.y + lookY - this.y) * k;
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const m = this.shakeMag * Math.min(1, this.shakeT * 4);
      this.ox = (Math.random() - 0.5) * 2 * m;
      this.oy = (Math.random() - 0.5) * 2 * m;
      if (this.shakeT <= 0) this.shakeMag = 0;
    } else {
      this.ox = this.oy = 0;
    }
  }

  // Top-left corner of the view in world units (integer for crisp pixels).
  get left() {
    return Math.round(this.x + this.ox - this.W / 2);
  }
  get top() {
    return Math.round(this.y + this.oy - this.H / 2);
  }

  toWorld(sx, sy) {
    return { x: sx + this.left, y: sy + this.top };
  }

  onScreen(x, y, margin = 0) {
    const l = this.left;
    const t = this.top;
    return x > l - margin && x < l + this.W + margin && y > t - margin && y < t + this.H + margin;
  }
}
