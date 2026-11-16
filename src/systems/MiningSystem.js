// MiningSystem: the player's mining laser, drone beams' damage model and the
// Pulse Blast special ability.
import { emit } from '../core/state.js';
import { dist, rayCircle } from '../core/math.js';
import { destroyAsteroid } from './AsteroidManager.js';
import { damagePirate } from './EventManager.js';

// Applies mining damage after resistance. Returns true if the rock broke.
export function applyDamage(state, a, raw, resistMult, by = 'player') {
  const dmg = raw * (1 - a.resist * resistMult);
  a.hp -= dmg;
  a.hitT = 0.08;
  a.dmgAcc += dmg;
  if (a.dmgT <= 0) a.dmgT = 0.35;
  if (a.hp <= 0) {
    if (a.dmgAcc > 0) emit(state, 'dmg', { x: a.x, y: a.y - a.r, amount: a.dmgAcc });
    destroyAsteroid(state, a, by);
    return true;
  }
  return false;
}

export function updateLaser(state, dt, input, stats) {
  const ship = state.ship;
  if (ship.overheat && ship.energy >= stats.energyMax * 0.3) ship.overheat = false;
  const firing = input.fire && !ship.docked && !ship.overheat && !input.menuOpen;
  if (!firing) {
    ship.laser = null;
    ship.energy = Math.min(stats.energyMax, ship.energy + stats.energyRegen * dt);
    return;
  }
  ship.energy -= stats.energyDrain * dt;
  if (ship.energy <= 0) {
    ship.energy = 0;
    ship.overheat = true;
    emit(state, 'overheat', {});
  }
  const dx = Math.cos(ship.angle);
  const dy = Math.sin(ship.angle);
  const nose = stats.shipRadius + 2;
  const ox = ship.x + dx * nose;
  const oy = ship.y + dy * nose;
  const range = stats.laserRange;

  // First thing along the beam takes the hit: asteroid or pirate.
  let best = range;
  let target = null;
  let kind = null;
  for (const a of state.asteroids) {
    if (Math.abs(a.x - ox) > range + a.r || Math.abs(a.y - oy) > range + a.r) continue;
    const t = rayCircle(ox, oy, dx, dy, a.x, a.y, a.r * 0.85);
    if (t >= 0 && t < best) {
      best = t;
      target = a;
      kind = 'rock';
    }
  }
  for (const p of state.pirates) {
    const t = rayCircle(ox, oy, dx, dy, p.x, p.y, 9);
    if (t >= 0 && t < best) {
      best = t;
      target = p;
      kind = 'pirate';
    }
  }
  ship.laser = { x0: ox, y0: oy, x1: ox + dx * best, y1: oy + dy * best, hit: !!target, kind, type: target?.type };
  if (kind === 'rock') applyDamage(state, target, stats.laserDps * dt, stats.resistMult, 'player');
  else if (kind === 'pirate') damagePirate(state, target, stats.laserDps * dt * 1.2);
}

export function usePulse(state, stats) {
  const ship = state.ship;
  if (ship.docked) return { ok: false, reason: 'Undock first' };
  if (ship.pulseCd > 0) return { ok: false, reason: `Pulse recharging (${Math.ceil(ship.pulseCd)}s)` };
  ship.pulseCd = stats.pulseCooldown;
  const R = stats.pulseRadius;
  const dmg = stats.laserDps * 3 + 40;
  emit(state, 'pulse', { x: ship.x, y: ship.y, r: R });
  for (const a of [...state.asteroids]) {
    const d = dist(a.x, a.y, ship.x, ship.y);
    if (d < R + a.r) {
      const f = 1 - Math.min(1, d / (R + a.r)) * 0.5;
      applyDamage(state, a, dmg * f, stats.resistMult, 'player');
      if (a.hp > 0) {
        a.vx += ((a.x - ship.x) / (d || 1)) * 30;
        a.vy += ((a.y - ship.y) / (d || 1)) * 30;
      }
    }
  }
  for (const p of [...state.pirates]) {
    const d = dist(p.x, p.y, ship.x, ship.y);
    if (d < R) {
      p.vx += ((p.x - ship.x) / (d || 1)) * 260;
      p.vy += ((p.y - ship.y) / (d || 1)) * 260;
      damagePirate(state, p, dmg * 0.5);
    }
  }
  // Tractor everything nearby toward the ship.
  for (const p of state.pickups) {
    const d = dist(p.x, p.y, ship.x, ship.y);
    if (d < R * 1.6) {
      p.vx += ((ship.x - p.x) / (d || 1)) * 160;
      p.vy += ((ship.y - p.y) / (d || 1)) * 160;
    }
  }
  return { ok: true };
}
