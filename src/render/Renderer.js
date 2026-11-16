// Renderer: draws the world at a low internal resolution and lets CSS scale
// it up with nearest-neighbour filtering, so every rotation, beam and
// explosion reads as chunky pixel art. It only reads simulation state.
import { RESOURCES, STATION, SECTORS } from '../core/config.js';
import { dist, len } from '../core/math.js';
import { asteroidSprite, mapSprite, shade, stationHub } from './sprites.js';
import { createBackground, drawBackground, drawDebris } from './background.js';
import { ParticlePool } from './particles.js';
import { drawText } from './pixelfont.js';

const LASER = { core: '#ffffff', mid: '#5ef1ff', glow: '#2a9dff' };

export function pixelScale(w, h) {
  return Math.max(2, Math.min(4, Math.round(Math.min(w / 600, h / 350))));
}

export class Renderer {
  constructor(canvas, camera) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.camera = camera;
    this.fx = new ParticlePool();
    this.time = 0;
    this.bgSector = null;
    this.hurtT = 0;
    this.flashT = 0;
    this.levelT = 0;
    this.warpT = 0;
    this.sparkT = 0;
    this.trailT = 0;
    this.resize();
  }

  resize() {
    const w = this.canvas.clientWidth || innerWidth;
    const h = this.canvas.clientHeight || innerHeight;
    this.PX = pixelScale(w, h);
    this.W = Math.ceil(w / this.PX);
    this.H = Math.ceil(h / this.PX);
    this.canvas.width = this.W;
    this.canvas.height = this.H;
    this.ctx.imageSmoothingEnabled = false;
    this.camera.resize(this.W, this.H);
  }

  // CSS pixel on the canvas -> world position.
  toWorld(cx, cy) {
    return this.camera.toWorld(cx / this.PX, cy / this.PX);
  }

  handleFx(events, state) {
    const P = this.fx;
    const cam = this.camera;
    const ship = state.ship;
    for (const e of events) {
      switch (e.type) {
        case 'explode': {
          const rock = shade(RESOURCES[e.res]?.color || '#888888', -0.45);
          const n = Math.round(10 + e.r * 1.2) * (e.special ? 2 : 1);
          P.burst(e.x, e.y, n, rock, 50 + e.r * 3, 0.9, 3, 0);
          P.burst(e.x, e.y, n, e.color, 90 + e.r * 4, 0.6, 1, 1);
          P.burst(e.x, e.y, 8, '#ffe8b0', 40, 0.35, 2, 2);
          const ring = P.spawn(e.x, e.y, 0, 0, 0.45, e.color, e.r * 0.6, 3, 0, e.r * 4);
          if (ring) ring.drag = 0;
          if (dist(e.x, e.y, ship.x, ship.y) < 260) cam.shake(e.r > 20 ? 3 : 1.5, 0.25);
          break;
        }
        case 'dmg':
          if (e.amount >= 1) P.text(e.x, e.y, String(Math.round(e.amount)), '#ffe9a8', 1, 0.7);
          break;
        case 'collect':
          if (e.res === 'credits') P.text(ship.x, ship.y - 16, `+${e.qty}C`, '#ffd23e', 1, 1.2);
          else if (e.qty > 0) P.text(ship.x, ship.y - 16, `+${e.qty} ${RESOURCES[e.res].name.split(' ').pop()}`, RESOURCES[e.res].glow, 1, 1.1);
          P.burst(e.x, e.y, 5, e.res === 'credits' ? '#ffd23e' : RESOURCES[e.res].color, 30, 0.4, 1, 2);
          break;
        case 'xp':
          if (e.amount >= 10) P.text(e.x, e.y - 8, `+${e.amount} XP`, '#b99bff', 1, 1.2);
          break;
        case 'deposit':
          P.text(e.x, e.y - 8, `+${e.qty}`, e.escort ? '#7dffb0' : '#5ef1ff', 1, 1);
          break;
        case 'hurt':
          this.hurtT = 0.35;
          cam.shake(e.shield ? 1.5 : 3, 0.25);
          break;
        case 'bump':
          P.burst(e.x, e.y, 10, '#ffd9a0', 70, 0.4, 1, 1);
          break;
        case 'pulse': {
          for (let i = 0; i < 3; i++) {
            const r = P.spawn(e.x, e.y, 0, 0, 0.5 + i * 0.12, i ? '#9b7dff' : '#5ef1ff', 6, 3, 0, e.r * (2.4 - i * 0.4));
            if (r) r.drag = 0;
          }
          P.burst(e.x, e.y, 40, '#9fe8ff', 160, 0.5, 1, 1);
          cam.shake(4, 0.35);
          this.flashT = 0.12;
          break;
        }
        case 'pirateDown':
          P.burst(e.x, e.y, 30, '#ff6a3d', 120, 0.7, 1, 1);
          P.burst(e.x, e.y, 18, '#3a1520', 50, 0.9, 3, 0);
          P.burst(e.x, e.y, 10, '#fff1a8', 40, 0.4, 3, 2);
          cam.shake(3, 0.3);
          break;
        case 'shipDestroyed':
          P.burst(e.x, e.y, 60, '#ff8c42', 160, 1, 1, 1);
          P.burst(e.x, e.y, 30, '#7f8fc4', 80, 1.2, 3, 0);
          cam.shake(6, 0.6);
          this.flashT = 0.3;
          break;
        case 'boltHit':
          P.burst(e.x, e.y, 6, '#ff6a3d', 50, 0.3, 1, 1);
          break;
        case 'stolen':
          P.text(e.x, e.y - 10, `-${e.qty} ${RESOURCES[e.res].name.split(' ').pop()}`, '#ff4d6d', 1, 1.4);
          break;
        case 'salvage':
          P.burst(e.x, e.y, 40, '#7dffb0', 100, 0.9, 1, 1);
          P.text(e.x, e.y - 14, `+${e.credits}C`, '#ffd23e', 1, 1.6);
          break;
        case 'levelUp': {
          this.levelT = 1.2;
          const r = P.spawn(ship.x, ship.y, 0, 0, 0.8, '#ffd23e', 8, 3, 0, 120);
          if (r) r.drag = 0;
          P.burst(ship.x, ship.y, 30, '#ffd23e', 90, 0.9, 1, 1);
          break;
        }
        case 'warp':
          this.warpT = 0.8;
          this.flashT = 0.4;
          cam.snap(ship.x, ship.y);
          break;
        case 'pirateShot':
          P.burst(e.x, e.y, 3, '#ff6a3d', 30, 0.2, 1, 2);
          break;
        case 'discover':
          P.text(ship.x, ship.y - 28, 'RARE CRYSTAL!', '#f3c6ff', 1, 2);
          break;
        case 'cargoFull':
          P.text(ship.x, ship.y - 24, 'CARGO FULL', '#ff4d6d', 1, 1.4);
          break;
        case 'explore':
          if (e.rp) P.text(ship.x, ship.y - 30, '+1 RESEARCH', '#7dffb0', 1, 1.6);
          break;
      }
    }
  }

  render(state, stats, dt, view) {
    const { ctx, W, H, camera: cam } = this;
    this.time += dt;
    if (this.bgSector !== state.sector) {
      this.bg = createBackground(state.sector);
      this.bgSector = state.sector;
    }
    this.fx.update(dt);
    for (const k of ['hurtT', 'flashT', 'levelT', 'warpT']) if (this[k] > 0) this[k] -= dt;
    const ox = cam.left;
    const oy = cam.top;
    const ship = state.ship;
    const t = this.time;

    ctx.fillStyle = '#05060f';
    ctx.fillRect(0, 0, W, H);
    drawBackground(ctx, this.bg, { x: cam.x + cam.ox, y: cam.y + cam.oy }, W, H, t);

    this.drawBoundary(state, ox, oy);
    this.drawStation(state, ox, oy, view);
    for (const d of state.derelicts) this.drawDerelict(d, ox, oy, view);

    // Asteroids.
    let hover = null;
    for (const a of state.asteroids) {
      const sx = a.x - ox;
      const sy = a.y - oy;
      if (sx < -a.r - 20 || sy < -a.r - 20 || sx > W + a.r + 20 || sy > H + a.r + 20) continue;
      this.drawAsteroid(a, sx, sy, t);
      if (view.aim && dist(view.aim.x, view.aim.y, a.x, a.y) < a.r + 4) hover = a;
    }
    this.drawPickups(state, ox, oy, t);
    for (const d of state.drones) this.drawDrone(d, ox, oy, t);
    for (const p of state.pirates) this.drawPirate(p, ox, oy, t, ship);
    for (const b of state.projectiles) {
      const x = Math.round(b.x - ox);
      const y = Math.round(b.y - oy);
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = '#ff6a3d';
      ctx.fillRect(x - 2, y - 1, 4, 3);
      ctx.fillStyle = '#ffe2a0';
      ctx.fillRect(x - 1, y, 2, 1);
      ctx.globalCompositeOperation = 'source-over';
    }
    this.drawShip(state, stats, ox, oy, t, dt);

    this.fx.draw(ctx, ox, oy, W, H);
    drawDebris(ctx, this.bg, { x: cam.x, y: cam.y }, W, H);

    // Readouts for the asteroid under the cursor (scanner identification).
    const focus = hover || (ship.laser?.hit && ship.laser.kind === 'rock' ? state.asteroids.find((a) => dist(a.x, a.y, ship.laser.x1, ship.laser.y1) < a.r + 2) : null);
    if (focus) this.drawAsteroidInfo(focus, stats, ox, oy, view);

    this.drawPrompts(state, ox, oy, view);
    this.drawIndicators(state, stats, ox, oy, view);
    this.drawOverlays(state, stats, t);
  }

  drawBoundary(state, ox, oy) {
    const R = SECTORS[state.sector].radius + 150;
    const ship = state.ship;
    if (len(ship.x, ship.y) < R - 420) return;
    const ctx = this.ctx;
    ctx.fillStyle = '#ff4d6d';
    for (let i = 0; i < 720; i++) {
      if (i % 6 > 2) continue;
      const a = (i / 720) * Math.PI * 2;
      const x = Math.round(Math.cos(a) * R - ox);
      const y = Math.round(Math.sin(a) * R - oy);
      if (x < 0 || y < 0 || x > this.W || y > this.H) continue;
      ctx.globalAlpha = 0.6;
      ctx.fillRect(x, y, 2, 2);
    }
    ctx.globalAlpha = 1;
  }

  drawStation(state, ox, oy, view) {
    const ctx = this.ctx;
    const cx = Math.round(-ox);
    const cy = Math.round(-oy);
    if (cx < -120 || cy < -120 || cx > this.W + 120 || cy > this.H + 120) return;
    const t = this.time;
    // Solar arms.
    for (let k = 0; k < 4; k++) {
      const a = Math.PI / 4 + (k * Math.PI) / 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      for (let d = 18; d < 52; d++) {
        ctx.fillStyle = d > 34 ? (d % 3 === 0 ? '#1d2c5e' : '#2f56a8') : '#3b456e';
        const w = d > 34 ? 3 : 1;
        for (let o = -w; o <= w; o++) ctx.fillRect(Math.round(cx + ca * d - sa * o), Math.round(cy + sa * d + ca * o), 1, 1);
      }
    }
    // Rotating habitat ring.
    const n = 28;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + t * 0.15;
      const x = Math.round(cx + Math.cos(a) * 30);
      const y = Math.round(cy + Math.sin(a) * 30);
      ctx.fillStyle = i % 7 === 0 ? '#ff8c42' : i % 2 ? '#56669e' : '#7f8fc4';
      ctx.fillRect(x - 1, y - 1, 3, 3);
      if (i % 4 === 0 && Math.sin(t * 3 + i) > 0.6) {
        ctx.fillStyle = '#c9fbff';
        ctx.fillRect(x, y, 1, 1);
      }
    }
    const hub = stationHub();
    ctx.drawImage(hub.img, cx - hub.size / 2, cy - hub.size / 2);
    // Docking berth beacon.
    const pulse = 0.5 + 0.5 * Math.sin(t * 4);
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = view.canDock ? '#7dffb0' : '#5ef1ff';
    ctx.globalAlpha = 0.35 + pulse * 0.5;
    ctx.fillRect(cx - 7, cy + 52, 3, 2);
    ctx.fillRect(cx + 5, cy + 52, 3, 2);
    ctx.fillRect(cx - 7, cy + 68, 3, 2);
    ctx.fillRect(cx + 5, cy + 68, 3, 2);
    // Station core glow.
    const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, 22);
    g.addColorStop(0, 'rgba(94,241,255,0.35)');
    g.addColorStop(1, 'rgba(94,241,255,0)');
    ctx.globalAlpha = 0.7 + pulse * 0.3;
    ctx.fillStyle = g;
    ctx.fillRect(cx - 22, cy - 22, 44, 44);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    // Dock radius hint when nearby.
    const d = len(state.ship.x, state.ship.y);
    if (d < STATION.dockRadius + 120 && !state.ship.docked) {
      ctx.fillStyle = view.canDock ? '#7dffb0' : '#5ef1ff';
      ctx.globalAlpha = 0.35;
      const R = STATION.dockRadius;
      for (let i = 0; i < 96; i += 2) {
        const a = (i / 96) * Math.PI * 2 - t * 0.2;
        ctx.fillRect(Math.round(cx + Math.cos(a) * R), Math.round(cy + Math.sin(a) * R), 1, 1);
      }
      ctx.globalAlpha = 1;
    }
    drawText(ctx, 'STATION', cx, cy - 58, '#9fe8ff');
  }

  drawAsteroid(a, sx, sy, t) {
    const ctx = this.ctx;
    const s = asteroidSprite(a);
    if (a.special || a.type === 'crystal') {
      const col = RESOURCES.crystal.color;
      ctx.globalCompositeOperation = 'lighter';
      const r = a.r * (a.special ? 2.2 : 1.5);
      const g = ctx.createRadialGradient(sx, sy, a.r * 0.4, sx, sy, r);
      g.addColorStop(0, col + (a.special ? '66' : '33'));
      g.addColorStop(1, col + '00');
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 2.5 + a.id);
      ctx.fillStyle = g;
      ctx.fillRect(sx - r, sy - r, r * 2, r * 2);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    if (a.meteor) {
      // Burning trail.
      const sp = len(a.vx, a.vy) || 1;
      for (let i = 1; i < 10; i++) {
        ctx.fillStyle = i < 3 ? '#ffe2a0' : i < 6 ? '#ff8c42' : '#a8322a';
        ctx.globalAlpha = 1 - i / 10;
        const w = Math.max(1, 4 - i * 0.35);
        ctx.fillRect(Math.round(sx - (a.vx / sp) * i * 2.2 - w / 2), Math.round(sy - (a.vy / sp) * i * 2.2 - w / 2), w, w);
      }
      ctx.globalAlpha = 1;
    }
    ctx.save();
    ctx.translate(Math.round(sx), Math.round(sy));
    ctx.rotate(Math.round(a.angle * 16) / 16);
    ctx.drawImage(s.img, -s.size / 2, -s.size / 2);
    if (a.hitT > 0 && Math.sin(t * 45 + a.id) > 0.2) {
      ctx.globalAlpha = 0.4;
      ctx.drawImage(s.flash, -s.size / 2, -s.size / 2);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    if (a.hp < a.maxHp) {
      const w = Math.round(Math.max(10, a.r * 1.3));
      const x = Math.round(sx - w / 2);
      const y = Math.round(sy + a.r + 4);
      ctx.fillStyle = '#05060f';
      ctx.fillRect(x - 1, y - 1, w + 2, 4);
      ctx.fillStyle = '#3a2030';
      ctx.fillRect(x, y, w, 2);
      ctx.fillStyle = a.hp / a.maxHp > 0.5 ? '#7dffb0' : a.hp / a.maxHp > 0.25 ? '#ffd23e' : '#ff4d6d';
      ctx.fillRect(x, y, Math.max(1, Math.round((w * a.hp) / a.maxHp)), 2);
    }
  }

  drawAsteroidInfo(a, stats, ox, oy, view) {
    const ctx = this.ctx;
    const sx = a.x - ox;
    const sy = a.y - oy - a.r - 9;
    const res = RESOURCES[a.type];
    const lines = [];
    lines.push([a.special ? 'MOTHERLODE' : res.name.toUpperCase(), stats.ident >= 1 ? res.glow : '#c8d0e6']);
    if (stats.ident >= 2) lines.push([`YIELD ${a.yield}`, '#e6eaf5']);
    if (stats.ident >= 3) lines.push([`~${Math.round(a.yield * view.priceOf(a.type))}C`, '#ffd23e']);
    lines.reverse().forEach(([txt, col], i) => drawText(ctx, txt, sx, sy - i * 7, col));
  }

  drawPickups(state, ox, oy, t) {
    const ctx = this.ctx;
    for (const p of state.pickups) {
      const x = Math.round(p.x - ox);
      const y = Math.round(p.y - oy + Math.sin(t * 3 + p.phase) * 1.2);
      if (x < -8 || y < -8 || x > this.W + 8 || y > this.H + 8) continue;
      if (p.life < 6 && Math.sin(t * 18) > 0) continue;
      const credits = p.type === 'credits';
      const col = credits ? '#ffd23e' : RESOURCES[p.type].color;
      const hi = credits ? '#fff6c2' : RESOURCES[p.type].glow;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.35 + 0.2 * Math.sin(t * 5 + p.phase);
      ctx.fillStyle = col;
      ctx.fillRect(x - 3, y - 1, 7, 3);
      ctx.fillRect(x - 1, y - 3, 3, 7);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      const big = p.qty >= 3;
      ctx.fillStyle = '#05060f';
      ctx.fillRect(x - 2, y - 1, 5, 3);
      ctx.fillRect(x - 1, y - 2, 3, 5);
      ctx.fillStyle = col;
      ctx.fillRect(x - 1, y - 1, 3, 3);
      if (big) {
        ctx.fillRect(x - 2, y, 5, 1);
        ctx.fillRect(x, y - 2, 1, 5);
      }
      ctx.fillStyle = hi;
      ctx.fillRect(x - 1, y - 1, 1, 1);
      if (p.type === 'crystal' && Math.sin(t * 7 + p.phase) > 0.85) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x + 2, y - 3, 1, 1);
      }
    }
  }

  drawFlame(x, y, angle, size, boosting, palette = ['#fff4c2', '#ffb347', '#ff6a3d']) {
    const ctx = this.ctx;
    const ca = Math.cos(angle);
    const sa = Math.sin(angle);
    const L = size * (0.7 + Math.random() * 0.5) * (boosting ? 1.8 : 1);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < L; i++) {
      const k = i / L;
      const w = Math.max(1, Math.round((1 - k) * (size * 0.45 + (boosting ? 1 : 0))));
      ctx.fillStyle = k < 0.25 ? (boosting ? '#c9fbff' : palette[0]) : k < 0.6 ? (boosting ? '#5ef1ff' : palette[1]) : boosting ? '#2a6dff' : palette[2];
      ctx.globalAlpha = 1 - k * 0.7;
      ctx.fillRect(Math.round(x - ca * i - w / 2), Math.round(y - sa * i - w / 2), w, w);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  drawShip(state, stats, ox, oy, t, dt) {
    const ctx = this.ctx;
    const ship = state.ship;
    const spr = mapSprite(state.shipId, 'player');
    const sx = Math.round(ship.x - ox);
    const sy = Math.round(ship.y - oy);
    const back = spr.w / 2 - 1;
    const ex = sx - Math.cos(ship.angle) * back;
    const ey = sy - Math.sin(ship.angle) * back;
    if (ship.thrusting > 0 && ship.fuel > 0) {
      this.drawFlame(ex, ey, ship.angle, 3 + spr.h * 0.25, ship.boosting);
      this.trailT -= dt;
      if (this.trailT <= 0) {
        this.trailT = ship.boosting ? 0.015 : 0.04;
        const a = ship.angle + Math.PI + (Math.random() - 0.5) * 0.5;
        this.fx.spawn(ship.x - Math.cos(ship.angle) * back, ship.y - Math.sin(ship.angle) * back, Math.cos(a) * 60 + ship.vx * 0.3, Math.sin(a) * 60 + ship.vy * 0.3, 0.35, ship.boosting ? '#5ef1ff' : '#ff8c42', 1, 2, 2);
      }
    } else if (!ship.docked) {
      this.drawFlame(ex, ey, ship.angle, 2, false, ['#9fe8ff', '#3b6fd6', '#1d2c5e']);
    }
    // Laser beam under the ship nose.
    if (ship.laser) this.drawLaser(ship.laser, ox, oy, t, dt);

    const blink = ship.invuln > 0 && Math.sin(t * 30) > 0;
    if (!blink) {
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(Math.round(ship.angle * 16) / 16);
      ctx.drawImage(spr.img, -Math.floor(spr.w / 2), -Math.floor(spr.h / 2));
      if (this.hurtT > 0) {
        ctx.globalAlpha = this.hurtT * 2;
        ctx.drawImage(spr.flash, -Math.floor(spr.w / 2), -Math.floor(spr.h / 2));
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    }
    // Shield bubble flickers when hit, faint while charged.
    if (ship.shield > 1 && !ship.docked) {
      const R = stats.shipRadius + 6;
      const strong = this.hurtT > 0;
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = state.event?.id === 'anomaly' ? '#b99bff' : '#5ef1ff';
      const n = 40;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + t;
        const on = strong ? 0.7 : (Math.sin(a * 3 - t * 4) + 1) * 0.06;
        if (on < 0.02) continue;
        ctx.globalAlpha = on;
        ctx.fillRect(Math.round(sx + Math.cos(a) * R), Math.round(sy + Math.sin(a) * R), 1, 1);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    if (this.levelT > 0) drawText(ctx, 'LEVEL UP!', sx, sy - 26 - (1.2 - this.levelT) * 10, '#ffd23e', 1, 'center', Math.min(1, this.levelT * 2));
  }

  drawLaser(L, ox, oy, t, dt) {
    const ctx = this.ctx;
    const x0 = L.x0 - ox;
    const y0 = L.y0 - oy;
    const x1 = L.x1 - ox;
    const y1 = L.y1 - oy;
    const wob = Math.sin(t * 60) > 0 ? 1 : 0;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.25;
    pixelLine(ctx, x0, y0, x1, y1, 5 + wob, LASER.glow);
    ctx.globalAlpha = 0.85;
    pixelLine(ctx, x0, y0, x1, y1, 2 + wob, LASER.mid);
    ctx.globalAlpha = 1;
    pixelLine(ctx, x0, y0, x1, y1, 1, LASER.core);
    // Impact flare.
    const r = L.hit ? 4 + wob * 2 : 2;
    ctx.fillStyle = L.hit ? '#ffffff' : LASER.mid;
    ctx.globalAlpha = 0.9;
    ctx.fillRect(Math.round(x1 - r / 2), Math.round(y1 - r / 2), r, r);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    if (L.hit) {
      this.sparkT -= dt;
      if (this.sparkT <= 0) {
        this.sparkT = 0.03;
        const col = L.kind === 'pirate' ? '#ff6a3d' : RESOURCES[L.type]?.color || '#ffffff';
        const back = Math.atan2(y0 - y1, x0 - x1);
        for (let i = 0; i < 2; i++) {
          const a = back + (Math.random() - 0.5) * 2.2;
          const s = 40 + Math.random() * 70;
          this.fx.spawn(L.x1, L.y1, Math.cos(a) * s, Math.sin(a) * s, 0.35, i ? '#ffe9a8' : col, 1, 1, 3);
        }
        if (Math.random() < 0.35) this.fx.spawn(L.x1, L.y1, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, 0.6, shade(col, -0.5), 2, 0, 2);
      }
    }
  }

  drawDrone(d, ox, oy, t) {
    const ctx = this.ctx;
    const x = Math.round(d.x - ox);
    const y = Math.round(d.y - oy);
    if (x < -20 || y < -20 || x > this.W + 20 || y > this.H + 20) return;
    if (d.beam) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.3;
      pixelLine(ctx, x, y, d.beam.x1 - ox, d.beam.y1 - oy, 3, '#2bd99a');
      ctx.globalAlpha = 0.9;
      pixelLine(ctx, x, y, d.beam.x1 - ox, d.beam.y1 - oy, 1, '#a8ffd9');
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      if (Math.random() < 0.3) this.fx.spawn(d.beam.x1, d.beam.y1, (Math.random() - 0.5) * 50, (Math.random() - 0.5) * 50, 0.3, RESOURCES[d.beam.type].color, 1, 1, 3);
    }
    const spr = mapSprite('drone', 'drone');
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.round(d.angle * 8) / 8);
    ctx.drawImage(spr.img, -Math.floor(spr.w / 2), -Math.floor(spr.h / 2));
    ctx.restore();
    // Rotor ring and status light.
    const a = t * 8 + d.id;
    ctx.fillStyle = '#9fe8ff';
    ctx.globalAlpha = 0.6;
    ctx.fillRect(Math.round(x + Math.cos(a) * 6), Math.round(y + Math.sin(a) * 6), 1, 1);
    ctx.fillRect(Math.round(x - Math.cos(a) * 6), Math.round(y - Math.sin(a) * 6), 1, 1);
    ctx.globalAlpha = 1;
    if (Math.sin(t * 5 + d.id) > 0) {
      ctx.fillStyle = d.mode === 'escort' ? '#7dffb0' : d.task === 'waiting' ? '#ff4d6d' : '#ffd23e';
      ctx.fillRect(x, y - 5, 1, 1);
    }
    if (d.load > 0) {
      ctx.fillStyle = '#5ef1ff';
      ctx.fillRect(x - 3, y + 6, Math.max(1, Math.round(Math.min(1, d.load / 20) * 7)), 1);
    }
  }

  drawPirate(p, ox, oy, t, ship) {
    const ctx = this.ctx;
    const x = Math.round(p.x - ox);
    const y = Math.round(p.y - oy);
    if (x < -30 || y < -30 || x > this.W + 30 || y > this.H + 30) return;
    const spr = mapSprite('pirate', 'pirate');
    const back = spr.w / 2 - 1;
    this.drawFlame(x - Math.cos(p.angle) * back, y - Math.sin(p.angle) * back, p.angle, 4, p.flee, ['#ffd0a0', '#ff4d3d', '#7a1020']);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.round(p.angle * 16) / 16);
    ctx.drawImage(spr.img, -Math.floor(spr.w / 2), -Math.floor(spr.h / 2));
    if (p.hitT > 0) {
      ctx.globalAlpha = 0.7;
      ctx.drawImage(spr.flash, -Math.floor(spr.w / 2), -Math.floor(spr.h / 2));
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    const w = 14;
    ctx.fillStyle = '#05060f';
    ctx.fillRect(x - w / 2 - 1, y + 10, w + 2, 3);
    ctx.fillStyle = '#ff4d6d';
    ctx.fillRect(x - w / 2, y + 11, Math.max(1, Math.round((w * p.hp) / p.maxHp)), 1);
    if (p.steal > 0.2) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.5;
      pixelLine(ctx, x, y, ship.x - ox, ship.y - oy, 1, '#ff4d6d');
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  drawDerelict(d, ox, oy, view) {
    const ctx = this.ctx;
    const x = Math.round(d.x - ox);
    const y = Math.round(d.y - oy);
    if (x < -40 || y < -40 || x > this.W + 40 || y > this.H + 40) return;
    const spr = mapSprite('derelict', 'derelict');
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.round(d.angle * 16) / 16);
    ctx.drawImage(spr.img, -Math.floor(spr.w / 2), -Math.floor(spr.h / 2));
    ctx.restore();
    if (Math.sin(this.time * 4) > 0) {
      ctx.fillStyle = '#7dffb0';
      ctx.fillRect(x, y - 10, 1, 1);
    }
    drawText(ctx, 'DERELICT', x, y - 18, '#7dffb0');
  }

  drawPrompts(state, ox, oy, view) {
    const ship = state.ship;
    const sx = ship.x - ox;
    const sy = ship.y - oy;
    const pulse = 0.65 + 0.35 * Math.sin(this.time * 6);
    if (view.canDock) drawText(this.ctx, 'PRESS E TO DOCK', sx, sy + 22, '#7dffb0', 1, 'center', pulse);
    else if (view.canSalvage) drawText(this.ctx, 'PRESS E TO SALVAGE', sx, sy + 22, '#7dffb0', 1, 'center', pulse);
    if (ship.fuel <= 0 && !ship.docked) drawText(this.ctx, 'OUT OF FUEL - RETURN TO STATION', sx, sy + 30, '#ff4d6d', 1, 'center', pulse);
    else if (ship.overheat) drawText(this.ctx, 'LASER OVERHEATED', sx, sy + 30, '#ff8c42', 1, 'center', pulse);
  }

  // Edge-of-screen arrows for things worth flying to.
  drawIndicators(state, stats, ox, oy, view) {
    const targets = [];
    const ship = state.ship;
    const hold = view.cargoPct;
    targets.push({ x: 0, y: 0, color: hold >= 0.8 ? '#ffd23e' : '#5ef1ff', label: hold >= 1 ? 'SELL' : 'STATION' });
    const ev = state.event;
    if (ev?.id === 'rare') {
      const a = state.asteroids.find((q) => q.id === ev.target);
      if (a) targets.push({ x: a.x, y: a.y, color: '#d66bff', label: 'RARE' });
    }
    for (const d of state.derelicts) targets.push({ x: d.x, y: d.y, color: '#7dffb0', label: 'SALVAGE' });
    for (const p of state.pirates) if (dist(p.x, p.y, ship.x, ship.y) < 800) targets.push({ x: p.x, y: p.y, color: '#ff4d6d', label: '' });
    const W = this.W;
    const H = this.H;
    const cx = ship.x - ox;
    const cy = ship.y - oy;
    const ctx = this.ctx;
    for (const tg of targets) {
      const sx = tg.x - ox;
      const sy = tg.y - oy;
      if (sx > -30 && sy > -30 && sx < W + 30 && sy < H + 30) continue;
      const a = Math.atan2(sy - cy, sx - cx);
      const m = 16;
      // Intersect the ray from the ship with the inset screen rect.
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      // Keep clear of the top bar and the radar / nav cluster at the bottom.
      const bottom = H - Math.round(250 / this.PX);
      const top = Math.round(60 / this.PX);
      const tx = ca > 0 ? (W - m - cx) / ca : (m - cx) / ca;
      const ty = sa > 0 ? (bottom - cy) / sa : (top - cy) / sa;
      const k = Math.min(Math.abs(tx), Math.abs(ty));
      const px = Math.round(cx + ca * k);
      const py = Math.round(cy + sa * k);
      ctx.fillStyle = tg.color;
      ctx.globalAlpha = 0.85 + 0.15 * Math.sin(this.time * 5);
      for (let i = 0; i < 5; i++) {
        const w = 5 - i;
        for (let j = -w; j <= w; j++) ctx.fillRect(Math.round(px + ca * i - sa * j * 0.5), Math.round(py + sa * i + ca * j * 0.5), 1, 1);
      }
      ctx.globalAlpha = 1;
      if (tg.label) {
        const d = Math.round(dist(tg.x, tg.y, ship.x, ship.y) / 10) * 10;
        drawText(ctx, `${tg.label} ${d}`, Math.max(28, Math.min(W - 28, px - ca * 16)), Math.max(top, Math.min(bottom, py - sa * 10)), tg.color);
      }
    }
  }

  drawOverlays(state, stats, t) {
    const ctx = this.ctx;
    const { W, H } = this;
    const ev = state.event?.id;
    if (ev === 'storm') {
      ctx.fillStyle = '#ffb347';
      ctx.globalAlpha = 0.07 + 0.03 * Math.sin(t * 9);
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 0.25;
      for (let i = 0; i < 6; i++) {
        const y = Math.floor(((t * 140 + i * 97) % (H + 40)) - 20);
        ctx.fillStyle = i % 2 ? '#ffe2a0' : '#ff8c42';
        ctx.fillRect(0, y, W, 1);
      }
      ctx.globalAlpha = 1;
    }
    const vignette = (color, strength) => {
      const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.7);
      g.addColorStop(0, color + '00');
      g.addColorStop(1, color + strength);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    };
    if (ev === 'anomaly') vignette('#9b7dff', Math.sin(t * 3) > 0 ? '55' : '40');
    const hullPct = state.ship.hull / stats.hullMax;
    if (hullPct < 0.3 && !state.ship.docked) vignette('#ff1f3d', Math.sin(t * 5) > 0 ? '66' : '33');
    if (this.hurtT > 0) vignette('#ff1f3d', '44');
    if (this.flashT > 0) {
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = Math.min(0.8, this.flashT * 2.5);
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    if (this.warpT > 0) {
      ctx.fillStyle = '#c9fbff';
      ctx.globalAlpha = 0.6;
      for (let i = 0; i < 50; i++) {
        const a = (i / 50) * Math.PI * 2;
        const r0 = (0.8 - this.warpT) * 300 + (i % 5) * 20;
        for (let k = 0; k < 12; k++) ctx.fillRect(Math.round(W / 2 + Math.cos(a) * (r0 + k * 3)), Math.round(H / 2 + Math.sin(a) * (r0 + k * 3)), 1, 1);
      }
      ctx.globalAlpha = 1;
    }
  }
}

export function pixelLine(ctx, x0, y0, x1, y1, w, color) {
  ctx.fillStyle = color;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
  const off = Math.floor(w / 2);
  for (let i = 0; i <= n; i++) {
    const x = Math.round(x0 + (dx * i) / n) - off;
    const y = Math.round(y0 + (dy * i) / n) - off;
    ctx.fillRect(x, y, w, w);
  }
}
