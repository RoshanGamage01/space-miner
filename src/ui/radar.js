// Radar (around the ship) and the sector exploration map, drawn on small
// DOM canvases at device resolution.
import { EXPLORE_CELL, RESOURCES, SECTORS } from '../core/config.js';

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
  const range = stats.radarRange;
  const k = R / range;
  const storm = state.event?.id === 'storm';
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
    let px = cx + (x - ship.x) * k;
    let py = cy + (y - ship.y) * k;
    if (storm) {
      px += (Math.random() - 0.5) * 6;
      py += (Math.random() - 0.5) * 6;
    }
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
    const rare = a.type === 'crystal';
    if (a.special) {
      const pulse = 0.5 + 0.5 * Math.sin(time * 6);
      plot(a.x, a.y, 4, '#f3c6ff', `rgba(214,107,255,${0.3 + pulse * 0.4})`);
    } else if (rare && stats.rareMult > 1) {
      plot(a.x, a.y, s + 1, RESOURCES.crystal.color, 'rgba(214,107,255,0.25)');
    } else {
      plot(a.x, a.y, s, stats.ident >= 1 ? RESOURCES[a.type].color : 'rgba(170,182,200,0.65)');
    }
  }
  for (const d of state.derelicts) plot(d.x, d.y, 4, '#7dffb0', 'rgba(125,255,176,0.3)');
  for (const p of state.pirates) plot(p.x, p.y, 3, '#ff4d6d', 'rgba(255,77,109,0.3)');
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

export function drawMap(canvas, state, time) {
  const { ctx, w, h } = fit(canvas);
  if (!w) return;
  const sec = SECTORS[state.sector];
  const R = sec.radius;
  const scale = (Math.min(w, h) / 2 - 6) / R;
  const cx = w / 2;
  const cy = h / 2;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(6,14,30,0.9)';
  ctx.beginPath();
  ctx.arc(cx, cy, R * scale + 3, 0, Math.PI * 2);
  ctx.fill();
  const map = state.explored[state.sector] || {};
  const cell = EXPLORE_CELL * scale;
  const n = Math.ceil(R / EXPLORE_CELL) + 1;
  for (let i = -n; i < n; i++)
    for (let j = -n; j < n; j++) {
      const mx = (i + 0.5) * EXPLORE_CELL;
      const my = (j + 0.5) * EXPLORE_CELL;
      if (mx * mx + my * my > R * R) continue;
      const seen = map[`${i},${j}`];
      ctx.fillStyle = seen ? 'rgba(94,241,255,0.28)' : 'rgba(120,130,170,0.08)';
      ctx.fillRect(cx + i * cell + 0.5, cy + j * cell + 0.5, cell - 1, cell - 1);
    }
  ctx.strokeStyle = 'rgba(94,241,255,0.4)';
  ctx.beginPath();
  ctx.arc(cx, cy, R * scale, 0, Math.PI * 2);
  ctx.stroke();
  const ev = state.event;
  if (ev?.id === 'rare') {
    const a = state.asteroids.find((q) => q.id === ev.target);
    if (a) {
      ctx.fillStyle = Math.sin(time * 6) > 0 ? '#f3c6ff' : '#d66bff';
      ctx.fillRect(cx + a.x * scale - 3, cy + a.y * scale - 3, 6, 6);
    }
  }
  for (const d of state.derelicts) {
    ctx.fillStyle = '#7dffb0';
    ctx.fillRect(cx + d.x * scale - 3, cy + d.y * scale - 3, 6, 6);
  }
  ctx.fillStyle = '#5ef1ff';
  ctx.fillRect(cx - 3, cy - 3, 6, 6);
  ctx.fillStyle = '#ffd23e';
  for (const d of state.drones) ctx.fillRect(cx + d.x * scale - 1, cy + d.y * scale - 1, 2, 2);
  const sx = cx + state.ship.x * scale;
  const sy = cy + state.ship.y * scale;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(sx, sy, 3 + Math.sin(time * 5), 0, Math.PI * 2);
  ctx.fill();
}
