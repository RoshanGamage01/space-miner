// Radar (around the ship) and the sector exploration map, drawn on small
// DOM canvases at device resolution.
import { RESOURCES } from '../core/config.js';

function fit(canvas) {
  const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

export function drawRadar(canvas, state, stats, time) {
  const { ctx, w, h } = fit(canvas);
  if (!w) return;
  const R = Math.min(w, h) / 2 - 2;
  const cx = w / 2;
  const cy = h / 2;
  const ship = state.ship;
  const range = 900;
  const k = R / range;
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(6,14,30,0.82)';
  ctx.fill();
  ctx.clip();
  // Rings and sweep.
  ctx.strokeStyle = 'rgba(94,241,255,0.15)';
  ctx.lineWidth = 1;
  for (const f of [0.33, 0.66]) {
    ctx.beginPath();
    ctx.arc(cx, cy, R * f, 0, Math.PI * 2);
    ctx.stroke();
  }
  const sweep = (time * 1.6) % (Math.PI * 2);
  const g = ctx.createConicGradient ? ctx.createConicGradient(sweep - 0.6, cx, cy) : null;
  if (g) {
    g.addColorStop(0, 'rgba(94,241,255,0)');
    g.addColorStop(0.09, 'rgba(94,241,255,0.18)');
    g.addColorStop(0.1, 'rgba(94,241,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  const plot = (x, y, size, color, glow) => {
    const px = cx + (x - ship.x) * k;
    const py = cy + (y - ship.y) * k;
    if ((px - cx) ** 2 + (py - cy) ** 2 > R * R) return false;
    if (glow) {
      ctx.fillStyle = glow;
      ctx.fillRect(Math.round(px - size), Math.round(py - size), size * 2 + 1, size * 2 + 1);
    }
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(px - size / 2), Math.round(py - size / 2), size, size);
    return true;
  };
  for (const a of state.asteroids) {
    const dx = a.x - ship.x;
    const dy = a.y - ship.y;
    if (dx * dx + dy * dy > range * range) continue;
    const s = a.size === 'large' ? 3 : 2;
    if (a.special) {
      const pulse = 0.5 + 0.5 * Math.sin(time * 6);
      plot(a.x, a.y, 4, '#f3c6ff', `rgba(214,107,255,${0.3 + pulse * 0.4})`);
    } else {
      plot(a.x, a.y, s, a.type === 'crystal' ? RESOURCES.crystal.color : 'rgba(170,182,200,0.55)');
    }
  }
  for (const d of state.derelicts) plot(d.x, d.y, 4, '#7dffb0', 'rgba(125,255,176,0.3)');
  for (const e of state.enemies) plot(e.x, e.y, e.kind === 'mothership' ? 6 : 3, e.kind === 'pirate' ? '#ff8c42' : '#9dff4a', e.kind === 'pirate' ? 'rgba(255,140,66,0.3)' : 'rgba(157,255,74,0.3)');
  for (const d of state.drones) plot(d.x, d.y, 2, '#ffd23e');
  // Station: clamp to edge if out of range.
  let sx = (0 - ship.x) * k;
  let sy = (0 - ship.y) * k;
  const sd = Math.hypot(sx, sy);
  if (sd > R - 5) {
    sx = (sx / sd) * (R - 5);
    sy = (sy / sd) * (R - 5);
  }
  ctx.fillStyle = 'rgba(94,241,255,0.35)';
  ctx.fillRect(Math.round(cx + sx - 4), Math.round(cy + sy - 4), 9, 9);
  ctx.fillStyle = '#5ef1ff';
  ctx.fillRect(Math.round(cx + sx - 2), Math.round(cy + sy - 2), 5, 5);
  // Ship arrow.
  ctx.translate(cx, cy);
  ctx.rotate(ship.angle);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(6, 0);
  ctx.lineTo(-4, -4);
  ctx.lineTo(-2, 0);
  ctx.lineTo(-4, 4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = 'rgba(94,241,255,0.55)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.stroke();
}
