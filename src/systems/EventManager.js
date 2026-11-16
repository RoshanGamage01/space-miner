// EventManager: random events (meteor showers, rare finds, solar storms,
// pirate raids, derelicts, energy anomalies), pirate AI and salvage.
import { EVENTS, EVENT_GAP, EVENT_IDS, FIRST_EVENT_AT, RESOURCE_IDS } from '../core/config.js';
import { emit, sectorDef } from '../core/state.js';
import { TAU, angleTo, dist, dist2, len, pickWeighted, rand, randInt, turnToward } from '../core/math.js';
import { spawnAsteroid } from './AsteroidManager.js';
import { addToBag, recordCollected, spawnPickup } from './ResourceManager.js';
import { addCredits, addXp } from './EconomyManager.js';
import { damagePlayer } from './PlayerController.js';

const pointNear = (state, minD, maxD) => {
  const R = sectorDef(state).radius;
  for (let i = 0; i < 20; i++) {
    const a = Math.random() * TAU;
    const d = rand(minD, maxD);
    const x = state.ship.x + Math.cos(a) * d;
    const y = state.ship.y + Math.sin(a) * d;
    if (len(x, y) < R - 60 && len(x, y) > 200) return { x, y };
  }
  const a = Math.random() * TAU;
  return { x: Math.cos(a) * 600, y: Math.sin(a) * 600 };
};

export function scheduleNextEvent(state) {
  state.nextEventAt = state.time + rand(EVENT_GAP[0], EVENT_GAP[1]);
}

export function startEvent(state, id) {
  const def = EVENTS[id];
  if (!def) return { ok: false, reason: 'Unknown event' };
  if (state.event) endEvent(state);
  const ev = { id, t: def.duration, dur: def.duration, spawnT: 0, target: 0 };
  state.event = ev;
  state.stats.events++;
  const danger = sectorDef(state).danger;
  if (id === 'rare') {
    const p = pointNear(state, 450, 850);
    const a = spawnAsteroid(state, { x: p.x, y: p.y, type: 'crystal', size: 'large', special: true, vx: 0, vy: 0 });
    ev.target = a.id;
  } else if (id === 'pirates') {
    const n = Math.min(4, 1 + Math.floor(danger) + (state.level >= 8 ? 1 : 0));
    for (let i = 0; i < n; i++) {
      const p = pointNear(state, 420, 560);
      state.pirates.push({ id: state.nextId++, x: p.x, y: p.y, vx: 0, vy: 0, angle: 0, hp: 50 * danger, maxHp: 50 * danger, fireCd: rand(1.5, 3), steal: 0, flee: false, hitT: 0, orbit: rand(-1, 1) > 0 ? 1 : -1 });
    }
  } else if (id === 'derelict') {
    const p = pointNear(state, 500, 900);
    state.derelicts.push({ id: state.nextId++, x: p.x, y: p.y, angle: rand(0, TAU), spin: rand(-0.2, 0.2) });
  }
  emit(state, 'eventStart', { id, name: def.name, desc: def.desc });
  return { ok: true };
}

export function endEvent(state) {
  const ev = state.event;
  if (!ev) return;
  if (ev.id === 'pirates') for (const p of state.pirates) p.flee = true;
  if (ev.id === 'derelict') state.derelicts.length = 0;
  if (ev.id === 'rare') {
    const a = state.asteroids.find((q) => q.id === ev.target);
    if (a) a.special = false; // it stays, just no longer beaconed
  }
  state.event = null;
  scheduleNextEvent(state);
  emit(state, 'eventEnd', { id: ev.id, name: EVENTS[ev.id].name });
}

export function updateEvents(state, dt, stats) {
  if (!state.nextEventAt) state.nextEventAt = state.time + FIRST_EVENT_AT;
  const ev = state.event;
  if (!ev) {
    if (state.time >= state.nextEventAt && !state.ship.docked) {
      const w = {};
      for (const id of EVENT_IDS) if (state.level >= EVENTS[id].minLevel) w[id] = EVENTS[id].weight;
      startEvent(state, pickWeighted(w));
    }
  } else {
    ev.t -= dt;
    if (ev.id === 'meteors') {
      ev.spawnT -= dt;
      if (ev.spawnT <= 0) {
        ev.spawnT = rand(0.35, 0.7);
        spawnMeteor(state);
      }
    }
    if (ev.id === 'rare' && !state.asteroids.some((a) => a.id === ev.target)) ev.t = Math.min(ev.t, 0);
    if (ev.id === 'pirates' && state.pirates.length === 0) ev.t = Math.min(ev.t, 0);
    if (ev.id === 'derelict' && state.derelicts.length === 0) ev.t = Math.min(ev.t, 0);
    if (ev.t <= 0) endEvent(state);
  }
  updatePirates(state, dt, stats);
  updateProjectiles(state, dt, stats);
  for (const d of state.derelicts) d.angle += d.spin * dt;
}

function spawnMeteor(state) {
  const ship = state.ship;
  const a = Math.random() * TAU;
  const x = ship.x + Math.cos(a) * 380;
  const y = ship.y + Math.sin(a) * 380;
  // Aim roughly across the player's view.
  const aim = angleTo(x, y, ship.x + rand(-160, 160), ship.y + rand(-160, 160));
  const sp = rand(55, 110);
  spawnAsteroid(state, {
    x,
    y,
    vx: Math.cos(aim) * sp,
    vy: Math.sin(aim) * sp,
    type: Math.random() < 0.6 ? 'iron' : Math.random() < 0.7 ? 'nickel' : 'silicon',
    size: 'small',
    meteor: true,
    life: 14,
  });
}

function updatePirates(state, dt, stats) {
  const ship = state.ship;
  const list = state.pirates;
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i];
    if (p.hitT > 0) p.hitT -= dt;
    const d = dist(p.x, p.y, ship.x, ship.y);
    const toShip = angleTo(p.x, p.y, ship.x, ship.y);
    let want;
    if (p.flee || ship.docked) {
      want = toShip + Math.PI;
      if (d > 900) {
        list.splice(i, 1);
        continue;
      }
    } else if (d > 150) {
      want = toShip;
    } else {
      want = toShip + (Math.PI / 2) * p.orbit; // circle-strafe
    }
    p.angle = turnToward(p.angle, toShip, 4 * dt);
    const acc = p.flee ? 220 : 170;
    p.vx += Math.cos(want) * acc * dt;
    p.vy += Math.sin(want) * acc * dt;
    const drag = Math.exp(-1.1 * dt);
    p.vx *= drag;
    p.vy *= drag;
    const sp = len(p.vx, p.vy);
    const max = p.flee ? 200 : 125;
    if (sp > max) {
      p.vx *= max / sp;
      p.vy *= max / sp;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.flee || ship.docked) continue;

    // Fire plasma bolts.
    p.fireCd -= dt;
    if (p.fireCd <= 0 && d < 330) {
      p.fireCd = rand(1.4, 2.2);
      const a = toShip + rand(-0.12, 0.12);
      state.projectiles.push({ x: p.x + Math.cos(a) * 10, y: p.y + Math.sin(a) * 10, vx: Math.cos(a) * 230 + p.vx * 0.3, vy: Math.sin(a) * 230 + p.vy * 0.3, life: 2.2, dmg: 7 * sectorDef(state).danger });
      emit(state, 'pirateShot', { x: p.x, y: p.y });
    }
    // Tractor-steal cargo when glued to you.
    if (d < 55) {
      p.steal += dt;
      if (p.steal > 1.6) {
        p.steal = 0;
        stealCargo(state, p);
      }
    } else p.steal = Math.max(0, p.steal - dt);
  }
}

function stealCargo(state, p) {
  const held = RESOURCE_IDS.filter((r) => state.cargo[r] > 0);
  if (!held.length) return;
  const r = held[randInt(0, held.length - 1)];
  const q = Math.max(1, Math.ceil(state.cargo[r] * 0.2));
  state.cargo[r] -= q;
  p.loot = p.loot || {};
  p.loot[r] = (p.loot[r] || 0) + q;
  emit(state, 'stolen', { res: r, qty: q, x: p.x, y: p.y });
}

function updateProjectiles(state, dt, stats) {
  const ship = state.ship;
  const list = state.projectiles;
  for (let i = list.length - 1; i >= 0; i--) {
    const b = list[i];
    b.life -= dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    let dead = b.life <= 0;
    if (!dead && dist2(b.x, b.y, ship.x, ship.y) < (stats.shipRadius + 3) ** 2) {
      damagePlayer(state, b.dmg, stats);
      emit(state, 'boltHit', { x: b.x, y: b.y });
      dead = true;
    }
    if (!dead) {
      for (const a of state.asteroids) {
        if (dist2(b.x, b.y, a.x, a.y) < a.r * a.r * 0.7) {
          emit(state, 'boltHit', { x: b.x, y: b.y });
          dead = true;
          break;
        }
      }
    }
    if (dead) list.splice(i, 1);
  }
}

export function damagePirate(state, p, amount) {
  p.hp -= amount;
  p.hitT = 0.08;
  if (p.hp > 0) return;
  const i = state.pirates.indexOf(p);
  if (i >= 0) state.pirates.splice(i, 1);
  state.stats.pirates++;
  const danger = sectorDef(state).danger;
  spawnPickup(state, p.x, p.y, 'credits', Math.round(rand(60, 140) * danger), 6);
  spawnPickup(state, p.x, p.y, 'nickel', randInt(2, 4), 6);
  if (p.loot) for (const r in p.loot) spawnPickup(state, p.x, p.y, r, p.loot[r], 10);
  addXp(state, 40 * danger, p.x, p.y);
  emit(state, 'pirateDown', { x: p.x, y: p.y });
}

// Salvage a derelict within reach. Returns null if none is close enough.
export function nearbyDerelict(state, reach = 55) {
  return state.derelicts.find((d) => dist(d.x, d.y, state.ship.x, state.ship.y) < reach) || null;
}

export function salvage(state, stats) {
  const d = nearbyDerelict(state);
  if (!d) return { ok: false, reason: 'Nothing to salvage here' };
  state.derelicts.splice(state.derelicts.indexOf(d), 1);
  const sec = sectorDef(state);
  const credits = Math.round(rand(150, 450) * sec.yield * (1 + state.level * 0.15));
  addCredits(state, credits);
  const rp = randInt(1, 2);
  state.rp += rp;
  const res = pickWeighted({ silicon: 3, nickel: 2, crystal: 1 });
  const qty = Math.round(randInt(6, 12) * sec.yield);
  const add = addToBag(state.cargo, res, qty, stats.cargoCap);
  recordCollected(state, res, add);
  if (qty - add > 0) spawnPickup(state, d.x, d.y, res, qty - add, 12);
  addXp(state, 60 * sec.danger, d.x, d.y);
  emit(state, 'salvage', { x: d.x, y: d.y, credits, rp, res, qty });
  return { ok: true };
}
