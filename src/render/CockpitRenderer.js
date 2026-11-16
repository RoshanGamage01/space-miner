// CockpitRenderer: first-person view from inside the ship. The simulation is
// the same 2D world; every object is projected onto the windshield with a
// small per-object elevation, then the cockpit frame and dashboard are drawn
// on top. Uses the main Renderer's canvas, particles and backdrop.
import { BOSSES, POWERUPS, RESOURCES, SECTORS, WEAPONS } from '../core/config.js';
import { cargoUsed } from '../core/state.js';
import { asteroidSprite, enemySprite, mapSprite, stationSprite } from './sprites.js';
import { drawText } from './pixelfont.js';
import { pixelLine } from './Renderer.js';

const FOV = 1.3;
const FAR = 900;
const NEAR = 6;

// Deterministic elevation per object so the field has depth.
const elev = (id, k) => ((((id * 9301 + 49297) % 233280) / 233280) - 0.5) * k;

function tileX(ctx, img, ox, y, W) {
  const w = img.width;
  for (let x = -(((ox % w) + w) % w); x < W; x += w) ctx.drawImage(img, x, y);
}

export class CockpitRenderer {
  constructor(main) {
    this.r = main;
    this.dust = [];
    this.flash = 0;
  }

  setup(state) {
    const { W, H } = this.r;
    this.W = W;
    this.H = H;
    this.f = W / 2 / Math.tan(FOV / 2);
    this.hy = Math.round(H * 0.4); // horizon
    const s = state.ship;
    this.cx = s.x;
    this.cy = s.y;
    this.ca = Math.cos(s.angle);
    this.sa = Math.sin(s.angle);
    this.heading = s.angle;
  }

  // World point -> screen. Returns null when behind the camera.
  project(x, y, e = 0) {
    const dx = x - this.cx;
    const dy = y - this.cy;
    const z = dx * this.ca + dy * this.sa;
    if (z < NEAR) return null;
    const lat = -dx * this.sa + dy * this.ca;
    const k = this.f / z;
    return { x: this.W / 2 + lat * k + this.r.camera.ox, y: this.hy - e * k + this.r.camera.oy, z, k };
  }

  render(state, stats, dt, view) {
    const r = this.r;
    const ctx = r.ctx;
    this.setup(state);
    const { W, H } = this;
    const t = r.time;
    if (this.flash > 0) this.flash -= dt;
    if (r.muzzleT > 0) this.flash = 0.06;

    // Deep space backdrop that pans as you turn.
    ctx.fillStyle = '#04050d';
    ctx.fillRect(0, 0, W, H);
    const pan = Math.round((this.heading / (Math.PI * 2)) * 2048);
    const bg = r.bg;
    for (let i = 0; i < bg.layers.length; i++) {
      const L = bg.layers[i];
      ctx.globalAlpha = L.nebula ? 0.9 : 1;
      const h = L.img.height;
      for (let y = -((Math.round(this.hy * 0.3) % h) + h) % h; y < H; y += h) tileX(ctx, L.img, pan * (0.5 + i * 0.15), y, W);
    }
    ctx.globalAlpha = 1;
    // A distant planet at a fixed bearing.
    const pl = bg.planet.sprite;
    const rel = Math.atan2(Math.sin(1.1 - this.heading), Math.cos(1.1 - this.heading));
    if (Math.abs(rel) < FOV) {
      const px = W / 2 + Math.tan(rel) * this.f;
      ctx.drawImage(pl.img, Math.round(px - pl.size), Math.round(this.hy * 0.55 - pl.size), pl.size * 2, pl.size * 2);
    }

    this.drawDust(state, dt);
    this.drawWorld(state, stats, t);
    this.drawWeaponsFx(state, stats, t);
    r.bloom(view);
    this.drawFrame(state, stats, t, view);
  }

  drawDust(state, dt) {
    const ctx = this.r.ctx;
    const s = state.ship;
    while (this.dust.length < 70) this.dust.push(this.newDust(s, true));
    ctx.fillStyle = '#9aa8d8';
    for (let i = 0; i < this.dust.length; i++) {
      const d = this.dust[i];
      const p = this.project(d.x, d.y, d.e);
      if (!p || p.z > 260 || Math.hypot(d.x - s.x, d.y - s.y) > 280) {
        this.dust[i] = this.newDust(s, false);
        continue;
      }
      const prev = d.p;
      d.p = p;
      ctx.globalAlpha = Math.min(1, (260 - p.z) / 120) * 0.8;
      if (prev && Math.hypot(p.x - prev.x, p.y - prev.y) > 1.5) pixelLine(ctx, prev.x, prev.y, p.x, p.y, 1, '#9aa8d8');
      else ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
    }
    ctx.globalAlpha = 1;
  }

  newDust(s, anywhere) {
    const a = s.angle + (Math.random() - 0.5) * (anywhere ? Math.PI * 2 : FOV * 1.2);
    const d = anywhere ? 20 + Math.random() * 240 : 200 + Math.random() * 60;
    return { x: s.x + Math.cos(a) * d, y: s.y + Math.sin(a) * d, e: (Math.random() - 0.5) * 120, p: null };
  }

  drawWorld(state, stats, t) {
    const r = this.r;
    const ctx = r.ctx;
    const items = [];
    const add = (o, x, y, e, kind) => {
      const p = this.project(x, y, e);
      if (!p || p.z > FAR) return;
      if (p.x < -200 || p.x > this.W + 200) return;
      items.push({ o, p, kind });
    };
    for (const a of state.asteroids) add(a, a.x, a.y, elev(a.id, 70), 'rock');
    for (const e of state.enemies) add(e, e.x, e.y, elev(e.id, 50), 'enemy');
    for (const q of state.pickups) add(q, q.x, q.y, 0, 'pickup');
    for (const d of state.drones) add(d, d.x, d.y, 10, 'drone');
    for (const d of state.derelicts) add(d, d.x, d.y, 0, 'derelict');
    add({ id: 0 }, 0, 0, 0, 'station');
    items.sort((a, b) => b.p.z - a.p.z);
    this.targets = [];
    for (const it of items) {
      const { o, p } = it;
      const fade = Math.min(1, (FAR - p.z) / 250);
      ctx.globalAlpha = fade;
      if (it.kind === 'rock') {
        const spr = asteroidSprite(o);
        const size = Math.max(1, spr.size * p.k);
        if (size > 900) continue;
        ctx.save();
        ctx.translate(Math.round(p.x), Math.round(p.y));
        ctx.rotate(Math.round(o.angle * 16) / 16);
        ctx.drawImage(o.hitT > 0 && Math.sin(t * 45) > 0 ? spr.flash : spr.img, -size / 2, -size / 2, size, size);
        ctx.restore();
        if (o.special) this.bracket(p.x, p.y, size / 2 + 3, '#d66bff');
      } else if (it.kind === 'enemy') {
        const { spr, k } = enemySprite(o, BOSSES);
        const big = o.kind === 'boss' || o.kind === 'hive';
        const w = spr.w * k * p.k * (big ? 1.2 : 1.1);
        const h = spr.h * k * p.k * (big ? 0.7 : 1.1);
        if (w > this.W * 3) continue;
        ctx.save();
        ctx.translate(Math.round(p.x), Math.round(p.y));
        if (!big) ctx.rotate(Math.sin(t * 2 + o.id) * 0.15);
        ctx.drawImage(o.hitT > 0 && Math.sin(t * 50) > 0 ? spr.flash : spr.img, -w / 2, -h / 2, w, h);
        ctx.restore();
        this.targets.push({ x: p.x, y: p.y, w, h, o });
        if (o.aimT > 0) {
          // Sniper lock-on warning.
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = o.aimT < 0.25 ? 1 : 0.4;
          pixelLine(ctx, p.x, p.y, this.W / 2, this.H * 0.72, 1, o.aimT < 0.25 ? '#ffffff' : '#ff4df0');
          ctx.globalCompositeOperation = 'source-over';
        }
      } else if (it.kind === 'pickup') {
        if (p.z < 25) continue;
        const s = Math.max(1, Math.min(5, Math.round(4 * p.k)));
        const pow = o.type.startsWith('pow_');
        const col = pow ? POWERUPS[o.type.slice(4)].color : o.type === 'credits' ? '#ffd23e' : RESOURCES[o.type].color;
        if (pow) this.bracket(p.x, p.y, 5, col);
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = col;
        ctx.fillRect(Math.round(p.x - s), Math.round(p.y - s / 2), s * 2, s);
        ctx.fillRect(Math.round(p.x - s / 2), Math.round(p.y - s), s, s * 2);
        ctx.globalCompositeOperation = 'source-over';
      } else if (it.kind === 'drone') {
        const spr = mapSprite('drone', 'drone');
        const w = spr.w * p.k * 1.3;
        ctx.drawImage(spr.img, p.x - w / 2, p.y - w / 2, w, w);
      } else if (it.kind === 'derelict') {
        const spr = mapSprite('derelict', 'derelict');
        const w = spr.w * p.k * 1.3;
        ctx.drawImage(spr.img, p.x - w / 2, p.y - (spr.h * p.k * 1.3) / 2, w, spr.h * p.k * 1.3);
        this.bracket(p.x, p.y, w / 2 + 3, '#7dffb0');
      } else if (it.kind === 'station') {
        const spr = stationSprite();
        const w = spr.size * p.k * 1.6;
        if (w > this.W * 2.5) continue;
        const h = w * 0.45; // a disc seen at a shallow angle
        ctx.drawImage(spr.img, Math.round(p.x - w / 2), Math.round(p.y - h / 2), Math.round(w), Math.round(h));
        if (Math.sin(t * 4) > 0) {
          ctx.fillStyle = '#7dffb0';
          ctx.fillRect(Math.round(p.x), Math.round(p.y + h / 2 + 2), 2, 2);
        }
      }
      ctx.globalAlpha = 1;
    }

    // Shots and particles, projected.
    ctx.globalCompositeOperation = 'lighter';
    for (const s of state.shots) {
      const p = this.project(s.x, s.y, s.team === 'enemy' ? 0 : -4);
      if (!p || p.z > FAR || (s.team !== 'enemy' && p.z < 40)) continue;
      const size = Math.max(1, Math.min(s.team === 'enemy' ? 8 : 3, Math.round((s.team === 'enemy' ? 5 : 2) * p.k)));
      ctx.fillStyle = s.color;
      ctx.globalAlpha = 0.45;
      ctx.fillRect(Math.round(p.x - size), Math.round(p.y - size), size * 2, size * 2);
      ctx.globalAlpha = 1;
      ctx.fillRect(Math.round(p.x - size / 2), Math.round(p.y - size / 2), size, size);
    }
    for (const q of r.fx.items) {
      if (!q.on) continue;
      const p = this.project(q.x, q.y, 0);
      if (!p || p.z > FAR) continue;
      if (p.z < 15) continue;
      const size = Math.max(1, Math.min(6, Math.round(q.size * p.k * 0.8)));
      ctx.globalAlpha = Math.min(1, (q.life / q.max) * 1.5);
      ctx.fillStyle = q.color;
      if (q.kind === 3) continue;
      ctx.fillRect(Math.round(p.x - size / 2), Math.round(p.y - size / 2), size, size);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    // Target brackets on hostiles.
    for (const tg of this.targets) {
      const col = tg.o.kind === 'pirate' ? '#ff8c42' : tg.o.elite ? '#ffd23e' : tg.o.bossKey ? BOSSES[tg.o.bossKey].color : tg.o.kind === 'hive' ? '#ff4df0' : '#9dff4a';
      this.bracket(tg.x, tg.y, Math.max(4, Math.max(tg.w, tg.h) / 2 + 2), col);
      if (tg.o.hp < tg.o.maxHp && tg.o.kind !== 'boss') {
        const w = Math.max(8, tg.w);
        ctx.fillStyle = '#05060f';
        ctx.fillRect(Math.round(tg.x - w / 2), Math.round(tg.y - tg.h / 2 - 5), Math.round(w), 2);
        ctx.fillStyle = col;
        ctx.fillRect(Math.round(tg.x - w / 2), Math.round(tg.y - tg.h / 2 - 5), Math.round((w * tg.o.hp) / tg.o.maxHp), 2);
      }
    }
  }

  bracket(x, y, r, color) {
    const ctx = this.r.ctx;
    x = Math.round(x);
    y = Math.round(y);
    r = Math.round(r);
    const L = Math.max(2, Math.round(r * 0.4));
    ctx.fillStyle = color;
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      ctx.fillRect(x + sx * r - (sx > 0 ? L - 1 : 0), y + sy * r, L, 1);
      ctx.fillRect(x + sx * r, y + sy * r - (sy > 0 ? L - 1 : 0), 1, L);
    }
  }

  drawWeaponsFx(state, stats, t) {
    const ctx = this.r.ctx;
    const { W, H } = this;
    const ship = state.ship;
    const gunL = { x: Math.round(W * 0.3), y: Math.round(H * 0.72) };
    const gunR = { x: Math.round(W * 0.7), y: Math.round(H * 0.72) };
    if (ship.laser && !(ship.deadT > 0)) {
      const L = ship.laser;
      const tgt = L.hit ? state.asteroids.find((a) => a.id === L.targetId) || state.enemies.find((e) => e.id === L.targetId) : null;
      const e = tgt ? elev(tgt.id, tgt.kind ? 50 : 70) : 0;
      const p = this.project(L.x1, L.y1, e) || { x: W / 2, y: this.hy };
      const wob = Math.sin(t * 60) > 0 ? 1 : 0;
      ctx.globalCompositeOperation = 'lighter';
      for (const g of [gunL, gunR]) {
        ctx.globalAlpha = 0.3;
        pixelLine(ctx, g.x, g.y, p.x, p.y, 4 + wob, '#2a9dff');
        ctx.globalAlpha = 0.9;
        pixelLine(ctx, g.x, g.y, p.x, p.y, 2, '#5ef1ff');
        ctx.globalAlpha = 1;
        pixelLine(ctx, g.x, g.y, p.x, p.y, 1, '#ffffff');
      }
      if (L.hit) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(Math.round(p.x - 2 - wob), Math.round(p.y - 2 - wob), 4 + wob * 2, 4 + wob * 2);
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    if (this.flash > 0) {
      const col = WEAPONS[state.weapon]?.color || '#5ef1ff';
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = col;
      for (const g of [gunL, gunR]) {
        ctx.globalAlpha = 0.5;
        ctx.fillRect(g.x - 5, g.y - 5, 10, 10);
        ctx.globalAlpha = 1;
        ctx.fillRect(g.x - 2, g.y - 2, 4, 4);
      }
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  drawFrame(state, stats, t, view) {
    const ctx = this.r.ctx;
    const { W, H } = this;
    const ship = state.ship;
    const ox = Math.round(this.r.camera.ox * 0.4);
    const oy = Math.round(this.r.camera.oy * 0.4);
    const metal = '#0e1328';
    const edge = '#2a3466';
    const hi = '#4a5aa0';

    // Crosshair.
    const cx = Math.round(W / 2);
    const cy = this.hy;
    const locked = this.targets.some((tg) => Math.abs(tg.x - cx) < tg.w / 2 + 2 && Math.abs(tg.y - cy) < tg.h / 2 + 6);
    ctx.fillStyle = locked ? '#ff4d6d' : '#9fe8ff';
    ctx.fillRect(cx - 7, cy, 4, 1);
    ctx.fillRect(cx + 4, cy, 4, 1);
    ctx.fillRect(cx, cy - 7, 1, 4);
    ctx.fillRect(cx, cy + 4, 1, 4);
    ctx.fillRect(cx, cy, 1, 1);

    // Canopy: top bar and two pillars.
    const poly = (pts, fill) => {
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.moveTo(pts[0][0] + ox, pts[0][1] + oy);
      for (const p of pts.slice(1)) ctx.lineTo(p[0] + ox, p[1] + oy);
      ctx.closePath();
      ctx.fill();
    };
    const top = Math.round(H * 0.07);
    const dash = Math.round(H * 0.7);
    poly([[-10, -10], [W + 10, -10], [W + 10, top], [W * 0.78, top + 4], [W * 0.22, top + 4], [-10, top]], metal);
    ctx.fillStyle = edge;
    ctx.fillRect(Math.round(W * 0.22) + ox, top + 4 + oy, Math.round(W * 0.56), 1);
    poly([[-10, top], [W * 0.1, top + 2], [W * 0.17, dash], [-10, dash + 10]], metal);
    poly([[W + 10, top], [W * 0.9, top + 2], [W * 0.83, dash], [W + 10, dash + 10]], metal);
    ctx.globalAlpha = 0.9;
    pixelLine(ctx, W * 0.1 + ox, top + 2 + oy, W * 0.17 + ox, dash + oy, 1, edge);
    pixelLine(ctx, W * 0.9 + ox, top + 2 + oy, W * 0.83 + ox, dash + oy, 1, edge);
    ctx.globalAlpha = 1;
    // Rivets.
    ctx.fillStyle = hi;
    for (let i = 1; i < 12; i++) ctx.fillRect(Math.round((W * i) / 12) + ox, Math.round(top / 2) + oy, 1, 1);

    // Dashboard.
    poly([[-10, dash + 6], [W * 0.17, dash], [W * 0.38, dash - 6], [W * 0.62, dash - 6], [W * 0.83, dash], [W + 10, dash + 6], [W + 10, H + 10], [-10, H + 10]], '#141a33');
    ctx.globalAlpha = 0.9;
    pixelLine(ctx, W * 0.17 + ox, dash + oy, W * 0.38 + ox, dash - 6 + oy, 1, hi);
    pixelLine(ctx, W * 0.38 + ox, dash - 6 + oy, W * 0.62 + ox, dash - 6 + oy, 1, hi);
    pixelLine(ctx, W * 0.62 + ox, dash - 6 + oy, W * 0.83 + ox, dash + oy, 1, hi);
    ctx.globalAlpha = 1;

    // Left screen: hull / shield / energy.
    const screen = (x, y, w, h) => {
      ctx.fillStyle = '#05080f';
      ctx.fillRect(x + ox, y + oy, w, h);
      ctx.fillStyle = edge;
      ctx.fillRect(x + ox, y + oy, w, 1);
      ctx.fillRect(x + ox, y + h - 1 + oy, w, 1);
    };
    const lx = Math.round(W * 0.08);
    const ly = Math.round(H * 0.755);
    const lw = Math.round(W * 0.22);
    screen(lx, ly, lw, 30);
    const bars = [
      ['HULL', ship.hull / stats.hullMax, '#ff6a6a'],
      ['SHLD', ship.shield / stats.shieldMax, '#7aa8ff'],
      ['LASR', ship.energy / stats.energyMax, ship.overheat ? '#ff8c42' : '#5ef1ff'],
    ];
    bars.forEach(([label, v, col], i) => {
      const y = ly + 5 + i * 8;
      drawText(ctx, label, lx + 4 + ox, y + 2 + oy, '#8a95b8', 1, 'left');
      const bx = lx + 22;
      const bw = lw - 28;
      ctx.fillStyle = '#1a2038';
      ctx.fillRect(bx + ox, y + oy, bw, 4);
      ctx.fillStyle = col;
      ctx.fillRect(bx + ox, y + oy, Math.round(bw * Math.max(0, Math.min(1, v))), 4);
    });

    // Centre: scope radar, forward is up.
    const rx = Math.round(W / 2) + ox;
    const ry = Math.round(H * 0.81) + oy;
    const R = Math.round(H * 0.075);
    ctx.fillStyle = '#05080f';
    ctx.beginPath();
    ctx.arc(rx, ry, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = edge;
    ctx.lineWidth = 1;
    ctx.stroke();
    const scale = R / 600;
    const dot = (x, y, col, s = 1) => {
      const dx = x - ship.x;
      const dy = y - ship.y;
      const fw = dx * this.ca + dy * this.sa;
      const lat = -dx * this.sa + dy * this.ca;
      const px = rx + lat * scale;
      const py = ry - fw * scale;
      if ((px - rx) ** 2 + (py - ry) ** 2 > (R - 2) ** 2) return;
      ctx.fillStyle = col;
      ctx.fillRect(Math.round(px), Math.round(py), s, s);
    };
    for (const a of state.asteroids) if (Math.abs(a.x - ship.x) < 600 && Math.abs(a.y - ship.y) < 600) dot(a.x, a.y, '#4a5270');
    for (const e of state.enemies) dot(e.x, e.y, e.kind === 'pirate' ? '#ff8c42' : '#9dff4a', 2);
    dot(0, 0, '#5ef1ff', 2);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(rx, ry - 1, 1, 3);

    // Right screen: weapon, cargo, combo.
    const qx = Math.round(W * 0.7);
    screen(qx, ly, lw, 30);
    const wd = WEAPONS[state.weapon];
    drawText(ctx, `${wd.name} L${state.weapons[state.weapon]}`, qx + 4 + ox, ly + 7 + oy, wd.color, 1, 'left');
    const used = cargoUsed(state.cargo);
    drawText(ctx, `CARGO ${used}/${stats.cargoCap}`, qx + 4 + ox, ly + 15 + oy, used >= stats.cargoCap ? '#ff4d6d' : '#ffd23e', 1, 'left');
    drawText(ctx, SECTORS[state.sector].name, qx + 4 + ox, ly + 23 + oy, '#8a95b8', 1, 'left');

    // Warning lights.
    const danger = ship.hull / stats.hullMax < 0.3 || state.enemies.some((e) => Math.hypot(e.x - ship.x, e.y - ship.y) < 220);
    for (let i = 0; i < 6; i++) {
      const on = danger ? Math.sin(t * 10) > 0 : Math.sin(t * 2 + i) > 0.6;
      ctx.fillStyle = danger ? (on ? '#ff4d6d' : '#401018') : on ? '#7dffb0' : '#163322';
      ctx.fillRect(Math.round(W * 0.38 + i * 6) + ox, Math.round(H * 0.715) + oy, 3, 2);
      ctx.fillRect(Math.round(W * 0.62 - 3 - i * 6) + ox, Math.round(H * 0.715) + oy, 3, 2);
    }
    if (view.canDock) drawText(ctx, 'E  DOCK', cx, Math.round(H * 0.64), '#7dffb0', 1, 'center', 0.6 + 0.4 * Math.sin(t * 6));
    else if (view.canSalvage) drawText(ctx, 'E  SALVAGE', cx, Math.round(H * 0.64), '#7dffb0', 1, 'center', 0.6 + 0.4 * Math.sin(t * 6));

    // Glass glare.
    ctx.globalAlpha = 0.035;
    poly([[W * 0.3, top], [W * 0.38, top], [W * 0.22, dash], [W * 0.14, dash]], '#ffffff');
    ctx.globalAlpha = 1;
  }
}
