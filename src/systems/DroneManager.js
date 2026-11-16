// DroneManager: autonomous mining drones. Each drone finds rock near its
// home (the station, or the player in escort mode), mines it, vacuums the
// fragments and hauls them home.
import { ASTEROID_TYPES, RESOURCE_IDS } from '../core/config.js';
import { cargoUsed, emit, sectorDef } from '../core/state.js';
import { TAU, dist2, len } from '../core/math.js';
import { addToBag, recordCollected } from './ResourceManager.js';
import { applyDamage } from './MiningSystem.js';

const MINE_GAP = 10;

export function droneHome(state, d) {
  if (d.mode === 'escort' && !d.forceStation && state.research.escort && !state.ship.docked) return { x: state.ship.x, y: state.ship.y, escort: true };
  return { x: 0, y: 0, escort: false };
}

export function updateDrones(state, dt, stats) {
  const claims = new Map();
  for (const d of state.drones) if (d.target) claims.set(d.target, (claims.get(d.target) || 0) + 1);
  for (const d of state.drones) updateDrone(state, d, dt, stats, claims);
}

function findTarget(state, d, home, stats, claims) {
  const range2 = stats.droneRange * stats.droneRange;
  let best = null;
  let bestD = Infinity;
  // Loose fragments first: they are free money.
  for (const p of state.pickups) {
    if (p.type === 'credits') continue;
    if (dist2(p.x, p.y, home.x, home.y) > range2) continue;
    const dd = dist2(p.x, p.y, d.x, d.y) * 0.5;
    if (dd < bestD && (claims.get(p.id) || 0) < 1) {
      bestD = dd;
      best = p;
    }
  }
  if (best) return { id: best.id, kind: 'pickup' };
  for (const a of state.asteroids) {
    if (a.meteor) continue;
    if (dist2(a.x, a.y, home.x, home.y) > range2) continue;
    const dd = dist2(a.x, a.y, d.x, d.y) / (a.type === 'iron' ? 1 : 1 + ASTEROID_TYPES[a.type].xp * 0.08);
    if (dd < bestD && (claims.get(a.id) || 0) < 2) {
      bestD = dd;
      best = a;
    }
  }
  return best ? { id: best.id, kind: 'rock' } : null;
}

function steer(d, tx, ty, speed, dt, arrive = 20) {
  const dx = tx - d.x;
  const dy = ty - d.y;
  const dd = len(dx, dy) || 1;
  const want = Math.min(speed, (dd / arrive) * speed);
  const k = 1 - Math.exp(-4 * dt);
  d.vx += ((dx / dd) * want - d.vx) * k;
  d.vy += ((dy / dd) * want - d.vy) * k;
  d.x += d.vx * dt;
  d.y += d.vy * dt;
  if (len(d.vx, d.vy) > 4) d.angle = Math.atan2(d.vy, d.vx);
  return dd;
}

function updateDrone(state, d, dt, stats, claims) {
  const home = droneHome(state, d);
  d.beam = null;
  d.load = cargoUsed(d.cargo);
  const full = d.load >= stats.droneCargo;
  d.think -= dt;

  if (full && d.task !== 'return' && d.task !== 'waiting') {
    d.task = 'return';
    d.target = 0;
  }

  if (d.task === 'waiting') {
    // Silo full: retry now and then (the player may have sold).
    if (d.think <= 0) {
      d.think = 2;
      d.task = 'return';
    }
    return;
  }

  if (d.task === 'return') {
    const dd = steer(d, home.x, home.y, stats.droneSpeed, dt, 30);
    if (dd < (home.escort ? 26 : 34)) unload(state, d, home, stats);
    return;
  }

  if (d.think <= 0 || !d.target) {
    d.think = 0.6;
    const t = findTarget(state, d, home, stats, claims);
    if (t) {
      d.target = t.id;
      d.targetKind = t.kind;
      d.task = t.kind === 'pickup' ? 'fetch' : 'mine';
    } else if (d.load > 0) {
      d.task = 'return';
      d.target = 0;
    } else {
      d.task = 'idle';
      d.target = 0;
    }
  }

  // Vacuum any fragments the drone passes over.
  for (let i = state.pickups.length - 1; i >= 0 && !full; i--) {
    const p = state.pickups[i];
    if (p.type === 'credits') continue;
    if (dist2(p.x, p.y, d.x, d.y) < 15 * 15) {
      let want = p.qty;
      for (let k = 0; k < p.qty; k++) if (Math.random() < stats.droneBonus) want++;
      const add = addToBag(d.cargo, p.type, want, stats.droneCargo);
      if (add <= 0) break;
      recordCollected(state, p.type, add);
      if (add >= p.qty) state.pickups.splice(i, 1);
      else p.qty -= add;
      if (p.id === d.target) d.target = 0;
    }
  }

  if (d.task === 'idle') {
    d.orbit = (d.orbit || d.id) + dt * 0.6;
    const r = home.escort ? 34 : 70;
    steer(d, home.x + Math.cos(d.orbit + d.id) * r, home.y + Math.sin(d.orbit + d.id) * r, stats.droneSpeed * 0.6, dt);
    return;
  }

  if (d.task === 'fetch') {
    const p = state.pickups.find((q) => q.id === d.target);
    if (!p) {
      d.target = 0;
      return;
    }
    steer(d, p.x, p.y, stats.droneSpeed, dt, 8);
    return;
  }

  if (d.task === 'mine') {
    const a = state.asteroids.find((q) => q.id === d.target);
    if (!a) {
      d.target = 0;
      d.think = 0;
      return;
    }
    const ang = Math.atan2(d.y - a.y, d.x - a.x);
    const standoff = a.r + MINE_GAP;
    const tx = a.x + Math.cos(ang) * standoff;
    const ty = a.y + Math.sin(ang) * standoff;
    const dd = steer(d, tx, ty, stats.droneSpeed, dt, 16);
    if (dd < 12) {
      d.angle = ang + Math.PI;
      d.beam = { x1: a.x + Math.cos(ang) * a.r * 0.7, y1: a.y + Math.sin(ang) * a.r * 0.7, type: a.type };
      applyDamage(state, a, stats.droneDps * dt, 1, 'drone');
    }
  }
}

function unload(state, d, home, stats) {
  if (d.load <= 0) {
    d.task = 'idle';
    d.think = 0;
    return;
  }
  let moved = 0;
  const into = home.escort ? state.cargo : state.storage;
  const cap = home.escort ? stats.cargoCap : stats.storageCap;
  for (const r of RESOURCE_IDS) {
    if (!d.cargo[r]) continue;
    const add = addToBag(into, r, d.cargo[r], cap);
    d.cargo[r] -= add;
    moved += add;
  }
  if (moved > 0) emit(state, 'deposit', { x: d.x, y: d.y, qty: moved, escort: home.escort });
  d.load = cargoUsed(d.cargo);
  if (d.load > 0) {
    // Destination full. Escorts fall back to the station; station drones wait.
    if (home.escort) {
      d.task = 'return';
      d.forceStation = true;
    } else {
      d.task = 'waiting';
      d.think = 2;
      if (!state.storageFullWarned) {
        state.storageFullWarned = true;
        emit(state, 'storageFull', {});
      }
    }
  } else {
    d.task = 'idle';
    d.think = 0;
    if (!home.escort) d.forceStation = false;
    state.storageFullWarned = false;
  }
}

export function setDroneMode(state, id, mode) {
  const d = state.drones.find((x) => x.id === id);
  if (!d) return { ok: false, reason: 'No such drone' };
  if (mode === 'escort' && !state.research.escort) return { ok: false, reason: 'Research Escort Protocol first' };
  if (mode !== 'escort' && mode !== 'station') return { ok: false, reason: 'Unknown mode' };
  d.mode = mode;
  d.task = d.load > 0 ? 'return' : 'idle';
  d.target = 0;
  return { ok: true };
}

export function droneStatus(d) {
  switch (d.task) {
    case 'mine':
      return 'Mining';
    case 'fetch':
      return 'Collecting';
    case 'return':
      return 'Hauling';
    case 'waiting':
      return 'Silo full';
    default:
      return 'Searching';
  }
}

// Expected units/second of all drones, used for offline progress. A mining
// cycle is: fly out, chew through enough rock to fill the pods, fly back.
export function droneRate(state, stats) {
  const sec = sectorDef(state);
  const avgHp = 45 * sec.hp;
  const avgYield = 3.6 * sec.yield;
  const travel = stats.droneRange * 0.55;
  const rocks = stats.droneCargo / avgYield;
  const cycle = (2 * travel) / stats.droneSpeed + (rocks * avgHp) / (stats.droneDps * 0.85) + rocks * 3;
  const perDrone = (stats.droneCargo * (1 + stats.droneBonus * 0.5)) / cycle;
  // Mix of minerals the drones find near the station.
  const w = sec.bands[0].w;
  const w2 = sec.bands[1].w;
  const mix = {};
  let tot = 0;
  for (const r of RESOURCE_IDS) {
    mix[r] = w[r] * 0.6 + w2[r] * 0.4;
    tot += mix[r];
  }
  for (const r of RESOURCE_IDS) mix[r] /= tot || 1;
  return { perSecond: perDrone * state.drones.length, mix };
}

export const droneAngleSpread = (i, n) => (i / Math.max(1, n)) * TAU;
