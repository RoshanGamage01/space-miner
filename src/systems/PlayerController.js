// PlayerController: ship flight model (thrust, inertia, boost), rotation
// toward the aim point (or cockpit turning), collisions, hull and shield.
import { emit, sectorDef } from '../core/state.js';
import { RESOURCE_IDS } from '../core/config.js';
import { angleTo, len, turnToward } from '../core/math.js';
import { spawnPickup } from './ResourceManager.js';

const TURN_RATE = 3.2; // rad/s in cockpit view

export function updatePlayer(state, dt, input, stats) {
  const ship = state.ship;
  if (ship.pulseCd > 0) ship.pulseCd = Math.max(0, ship.pulseCd - dt);
  if (ship.invuln > 0) ship.invuln -= dt;

  if (ship.shieldDelay > 0) ship.shieldDelay -= dt;
  else ship.shield = Math.min(stats.shieldMax, ship.shield + stats.shieldRegen * dt);
  ship.shield = Math.min(ship.shield, stats.shieldMax);
  ship.hull = Math.min(ship.hull, stats.hullMax);

  if (ship.docked) {
    // Docked: free repairs, held in the berth.
    ship.hull = Math.min(stats.hullMax, ship.hull + stats.hullMax * 0.5 * dt);
    ship.shield = Math.min(stats.shieldMax, ship.shield + stats.shieldMax * dt);
    ship.vx = ship.vy = 0;
    ship.thrusting = 0;
    ship.boosting = false;
    ship.x += (0 - ship.x) * Math.min(1, dt * 3);
    ship.y += (60 - ship.y) * Math.min(1, dt * 3);
    ship.angle = turnToward(ship.angle, Math.PI / 2, dt * 4);
    return;
  }

  if (!input.menuOpen) {
    if (input.turn !== undefined) ship.angle += (input.turn || 0) * TURN_RATE * dt + (input.turnDelta || 0);
    else if (input.aimX !== undefined) ship.angle = turnToward(ship.angle, angleTo(ship.x, ship.y, input.aimX, input.aimY), 11 * dt);
  }

  let mx = input.menuOpen ? 0 : input.mx || 0;
  let my = input.menuOpen ? 0 : input.my || 0;
  const m = len(mx, my);
  if (m > 1) {
    mx /= m;
    my /= m;
  }
  const amount = Math.min(1, m);
  let thrust = stats.thrust;
  let maxSpeed = stats.maxSpeed;
  ship.boosting = false;
  if (input.boost && amount > 0 && ship.boost > 0) {
    ship.boosting = true;
    ship.boost = Math.max(0, ship.boost - dt);
    thrust *= 1.9;
    maxSpeed *= 1.65;
  } else if (!input.boost) {
    ship.boost = Math.min(stats.boostMax, ship.boost + stats.boostRegen * dt);
  }

  ship.vx += mx * thrust * dt;
  ship.vy += my * thrust * dt;
  ship.thrusting = amount;

  const drag = Math.exp(-(amount > 0 ? 0.6 : 1.4) * dt);
  ship.vx *= drag;
  ship.vy *= drag;
  const sp = len(ship.vx, ship.vy);
  if (sp > maxSpeed) {
    const k = Math.max(maxSpeed / sp, Math.exp(-4 * dt));
    ship.vx *= k;
    ship.vy *= k;
  }
  ship.x += ship.vx * dt;
  ship.y += ship.vy * dt;

  const R = sectorDef(state).radius + 150;
  const d = len(ship.x, ship.y);
  if (d > R) {
    ship.vx -= (ship.x / d) * 400 * dt;
    ship.vy -= (ship.y / d) * 400 * dt;
  }

  collide(state, stats);
}

function collide(state, stats) {
  const ship = state.ship;
  const sr = stats.shipRadius;
  for (const a of state.asteroids) {
    const rr = a.r * 0.85 + sr;
    const dx = ship.x - a.x;
    const dy = ship.y - a.y;
    if (Math.abs(dx) > rr || Math.abs(dy) > rr) continue;
    const d2 = dx * dx + dy * dy;
    if (d2 >= rr * rr) continue;
    const d = Math.sqrt(d2) || 1;
    const nx = dx / d;
    const ny = dy / d;
    ship.x = a.x + nx * rr;
    ship.y = a.y + ny * rr;
    const rel = (ship.vx - a.vx) * nx + (ship.vy - a.vy) * ny;
    if (rel < 0) {
      const impact = -rel;
      ship.vx -= 1.45 * rel * nx;
      ship.vy -= 1.45 * rel * ny;
      const mass = a.r / 16;
      a.vx -= (nx * impact * 0.25) / mass;
      a.vy -= (ny * impact * 0.25) / mass;
      if (impact > 45) {
        damagePlayer(state, (impact - 45) * 0.22 * (a.meteor ? 2 : 1) * stats.collisionMult, stats);
        emit(state, 'bump', { x: ship.x - nx * sr, y: ship.y - ny * sr, impact });
      }
    }
  }
}

export function damagePlayer(state, amount, stats) {
  const ship = state.ship;
  if (amount <= 0 || ship.docked || ship.invuln > 0) return;
  ship.shieldDelay = stats.shieldDelay;
  const absorbed = Math.min(ship.shield, amount);
  ship.shield -= absorbed;
  const rest = amount - absorbed;
  if (rest > 0) ship.hull -= rest;
  emit(state, 'hurt', { amount, shield: absorbed > 0 && rest <= 0 });
  if (ship.hull <= 0) shipDestroyed(state, stats);
}

// Losing the ship spills half the hold into space and tows you home.
function shipDestroyed(state, stats) {
  const ship = state.ship;
  for (const r of RESOURCE_IDS) {
    const lost = Math.floor(state.cargo[r] / 2);
    if (lost > 0) {
      state.cargo[r] -= lost;
      spawnPickup(state, ship.x, ship.y, r, lost, 20);
    }
  }
  emit(state, 'shipDestroyed', { x: ship.x, y: ship.y });
  ship.x = 0;
  ship.y = 120;
  ship.vx = ship.vy = 0;
  ship.hull = stats.hullMax * 0.6;
  ship.shield = 0;
  ship.invuln = 3;
  state.combo.count = 0;
}
