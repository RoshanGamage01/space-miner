// MiningSystem: the mining laser (left mouse), the drones' damage model and
// the Shockwave special (Space).
import { emit } from '../core/state.js';
import { dist, rayCircle } from '../core/math.js';
import { destroyAsteroid } from './AsteroidManager.js';
import { damageEnemy, enemyAlongRay } from './CombatSystem.js';

// Applies mining damage after resistance. Returns true if the rock broke.
export function applyDamage(state, a, raw, resistMult, by = 'player') {
  const dmg = raw * (1 - a.resist * resistMult);
  a.hp -= dmg;
  a.hitT = 0.08;
  a.dmgAcc += dmg;
  if (a.dmgT <= 0) a.dmgT = 0.35;
  if (a.hp <= 0) {
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

  let best = range;
  let target = null;
  for (const a of state.asteroids) {
    if (Math.abs(a.x - ox) > range + a.r || Math.abs(a.y - oy) > range + a.r) continue;
    const t = rayCircle(ox, oy, dx, dy, a.x, a.y, a.r * 0.85);
    if (t >= 0 && t < best) {
      best = t;
      target = a;
    }
  }
  const hitE = enemyAlongRay(state, ox, oy, dx, dy, best, rayCircle);
  if (hitE.target) {
    best = hitE.t;
    target = null;
  }
  ship.laser = { x0: ox, y0: oy, x1: ox + dx * best, y1: oy + dy * best, hit: !!(target || hitE.target), kind: hitE.target ? 'enemy' : 'rock', type: target?.type, targetId: (target || hitE.target)?.id };
  if (target) applyDamage(state, target, stats.laserDps * dt, stats.resistMult, 'player');
  else if (hitE.target) damageEnemy(state, hitE.target, stats.laserDps * dt * 0.6);
}

export function usePulse(state, stats) {
  const ship = state.ship;
  if (ship.docked) return { ok: false, reason: 'Undock first' };
  if (ship.pulseCd > 0) return { ok: false, reason: `Shockwave in ${Math.ceil(ship.pulseCd)}s` };
  ship.pulseCd = 18;
  const R = 150;
  const dmg = stats.laserDps * 3 + 60 * stats.gunMult;
  emit(state, 'pulse', { x: ship.x, y: ship.y, r: R });
  for (const a of [...state.asteroids]) {
    const d = dist(a.x, a.y, ship.x, ship.y);
    if (d < R + a.r) {
      applyDamage(state, a, dmg * (1 - Math.min(1, d / (R + a.r)) * 0.5), stats.resistMult, 'player');
      if (a.hp > 0) {
        a.vx += ((a.x - ship.x) / (d || 1)) * 30;
        a.vy += ((a.y - ship.y) / (d || 1)) * 30;
      }
    }
  }
  for (const e of [...state.enemies]) {
    const d = dist(e.x, e.y, ship.x, ship.y);
    if (d < R + e.r) {
      e.vx += ((e.x - ship.x) / (d || 1)) * 300;
      e.vy += ((e.y - ship.y) / (d || 1)) * 300;
      damageEnemy(state, e, dmg);
    }
  }
  // Wipe enemy shots and pull loot in.
  state.shots = state.shots.filter((s) => s.team !== 'enemy' || dist(s.x, s.y, ship.x, ship.y) > R);
  for (const p of state.pickups) {
    const d = dist(p.x, p.y, ship.x, ship.y);
    if (d < R * 1.6) {
      p.vx += ((ship.x - p.x) / (d || 1)) * 160;
      p.vy += ((ship.y - p.y) / (d || 1)) * 160;
    }
  }
  return { ok: true };
}
