// Pooled particles and floating texts: allocated once, recycled forever, so
// long sessions never churn the garbage collector.
import { drawText } from './pixelfont.js';

const MAX = 1800;

export class ParticlePool {
  constructor() {
    this.items = [];
    for (let i = 0; i < MAX; i++) this.items.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 1, color: '#fff', drag: 0, kind: 0, grow: 0 });
    this.cursor = 0;
    this.texts = [];
    for (let i = 0; i < 70; i++) this.texts.push({ on: false, x: 0, y: 0, vy: 0, life: 0, max: 1, text: '', color: '#fff', scale: 1 });
  }

  // kind: 0 square, 1 spark (additive streak), 2 glow dot (additive), 3 ring
  spawn(x, y, vx, vy, life, color, size = 1, kind = 0, drag = 1.5, grow = 0) {
    const n = this.items.length;
    for (let k = 0; k < n; k++) {
      const p = this.items[this.cursor];
      this.cursor = (this.cursor + 1) % n;
      if (p.on && k < n - 1) continue;
      p.on = true;
      p.x = x;
      p.y = y;
      p.vx = vx;
      p.vy = vy;
      p.life = p.max = life;
      p.color = color;
      p.size = size;
      p.kind = kind;
      p.drag = drag;
      p.grow = grow;
      return p;
    }
    return null;
  }

  burst(x, y, count, color, speed = 60, life = 0.6, size = 1, kind = 0) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.3 + Math.random() * 0.7);
      this.spawn(x, y, Math.cos(a) * s, Math.sin(a) * s, life * (0.6 + Math.random() * 0.6), color, size, kind);
    }
  }

  text(x, y, text, color, scale = 1, life = 1.1) {
    let t = this.texts.find((q) => !q.on);
    if (!t) t = this.texts.reduce((a, b) => (a.life < b.life ? a : b));
    t.on = true;
    t.x = x + (Math.random() - 0.5) * 6;
    t.y = y;
    t.vy = -22;
    t.life = t.max = life;
    t.text = text;
    t.color = color;
    t.scale = scale;
  }

  update(dt) {
    for (const p of this.items) {
      if (!p.on) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.on = false;
        continue;
      }
      const d = Math.exp(-p.drag * dt);
      p.vx *= d;
      p.vy *= d;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.size += p.grow * dt;
    }
    for (const t of this.texts) {
      if (!t.on) continue;
      t.life -= dt;
      if (t.life <= 0) t.on = false;
      t.y += t.vy * dt;
      t.vy *= Math.exp(-2 * dt);
    }
  }

  draw(ctx, ox, oy, W, H) {
    // Normal pass, then additive glow pass.
    for (let pass = 0; pass < 2; pass++) {
      if (pass === 1) ctx.globalCompositeOperation = 'lighter';
      for (const p of this.items) {
        if (!p.on) continue;
        const additive = p.kind === 1 || p.kind === 2;
        if (additive !== (pass === 1) && p.kind !== 3) continue;
        if (p.kind === 3 && pass === 0) continue;
        const x = p.x - ox;
        const y = p.y - oy;
        if (x < -40 || y < -40 || x > W + 40 || y > H + 40) continue;
        const t = p.life / p.max;
        ctx.globalAlpha = Math.min(1, t * 1.5);
        ctx.fillStyle = p.color;
        if (p.kind === 1) {
          // Streak along velocity.
          const len = Math.min(6, Math.hypot(p.vx, p.vy) * 0.04 + 1);
          const a = Math.atan2(p.vy, p.vx);
          for (let i = 0; i < len; i++) ctx.fillRect(Math.round(x - Math.cos(a) * i), Math.round(y - Math.sin(a) * i), 1, 1);
        } else if (p.kind === 3) {
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(Math.round(x), Math.round(y), Math.max(0.5, p.size), 0, Math.PI * 2);
          ctx.stroke();
        } else {
          const s = Math.max(1, Math.round(p.size * (p.kind === 2 ? 1 : 0.5 + t * 0.5)));
          ctx.fillRect(Math.round(x - s / 2), Math.round(y - s / 2), s, s);
        }
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    for (const t of this.texts) {
      if (!t.on) continue;
      const k = t.life / t.max;
      drawText(ctx, t.text, t.x - ox, t.y - oy, t.color, t.scale, 'center', Math.min(1, k * 2.5));
    }
  }
}
