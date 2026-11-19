// AsteroidManager: procedural asteroid placement, drift, respawning and
// destruction. Better rock sits further from the station.
import { ASTEROID_SIZES, ASTEROID_TYPES, RESOURCES } from '../core/config.js';
import { emit, getStats, sectorDef } from '../core/state.js';
import { TAU, dist2, len, pickWeighted, rand, randInt } from '../core/math.js';
import { spawnDrops } from './ResourceManager.js';
import { addXp } from './EconomyManager.js';

const SAFE_RADIUS = 130; // keep the station approach clear
const VARIANTS = 6;

export function pickType(state, distance, rareMult = 1) {
  const sec = sectorDef(state);
  const band = sec.bands.find((b) => distance < b.r) || sec.bands[sec.bands.length - 1];
  const w = { ...band.w };
  w.crystal *= rareMult;
  return pickWeighted(w);
}

export function pickSize() {
  const w = {};
  for (const k in ASTEROID_SIZES) w[k] = ASTEROID_SIZES[k].weight;
  return pickWeighted(w);
}

export function spawnAsteroid(state, opts = {}) {
  const sec = sectorDef(state);
  let x = opts.x;
  let y = opts.y;
  if (x === undefined) {
    // Inside a random cluster, away from the camera when asked.
    const clusters = state.clusters?.length ? state.clusters : [{ x: 0, y: 0, r: sec.radius }];
    for (let tries = 0; tries < 30; tries++) {
      const c = clusters[Math.floor(Math.random() * clusters.length)];
      const a = Math.random() * TAU;
      const d = Math.sqrt(Math.random()) * c.r;
      x = c.x + Math.cos(a) * d;
      y = c.y + Math.sin(a) * d;
      if (x * x + y * y < SAFE_RADIUS * SAFE_RADIUS) continue;
      if (!opts.awayFrom || dist2(x, y, opts.awayFrom.x, opts.awayFrom.y) > opts.awayFrom.r * opts.awayFrom.r) break;
    }
  }
  const stats = opts.stats || getStats(state);
  const type = opts.type || pickType(state, len(x, y));
  const size = opts.size || pickSize();
  const t = ASTEROID_TYPES[type];
  const s = ASTEROID_SIZES[size];
  const special = !!opts.special;
  const hp = Math.round(t.hp * s.hp * sec.hp * (special ? 2.5 : 1));
  let qty = randInt(t.yield[0], t.yield[1]) * s.yield * sec.yield * (special ? 3.5 : 1);
  const a = {
    id: state.nextId++,
    type,
    size,
    x,
    y,
    vx: opts.vx ?? rand(-4, 4),
    vy: opts.vy ?? rand(-4, 4),
    r: s.r * (special ? 1.5 : 1),
    angle: Math.random() * TAU,
    spin: rand(-0.4, 0.4),
    hp,
    maxHp: hp,
    resist: t.resist,
    yield: Math.max(1, Math.round(qty)),
    variant: randInt(0, VARIANTS - 1),
    hitT: 0,
    dmgAcc: 0,
    dmgT: 0,
    special,
    meteor: !!opts.meteor,
    life: opts.life || 0,
  };
  state.asteroids.push(a);
  return a;
}

// Fresh asteroid field for the current sector. Also seeds a friendly starter
// cluster right next to the station so mining starts within seconds.
export function generateSector(state) {
  state.asteroids.length = 0;
  state.pickups.length = 0;
  state.enemies.length = 0;
  state.shots.length = 0;
  state.derelicts.length = 0;
  const sec = sectorDef(state);
  const stats = getStats(state);
  // Asteroid fields: a few clusters within drone range of the station, the
  // rest scattered across the sector with empty space between them.
  const clusters = [];
  const inner = [[300, 150], [330, 140], [520, 180], [600, 190]];
  inner.forEach(([d, r], i) => {
    const a = (i / inner.length) * TAU + 0.6 + Math.random() * 0.5;
    clusters.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, r });
  });
  const n = Math.round(sec.radius / 85);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU;
    const d = 450 + Math.sqrt(Math.random()) * (sec.radius - 550);
    clusters.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, r: rand(140, 280) });
  }
  state.clusters = clusters;
  for (let i = 0; i < sec.asteroids; i++) spawnAsteroid(state, { stats });
  // Starter cluster just below the spawn point, in view from frame one.
  const starter = state.sector === 'kepler' ? ['iron', 'iron', 'copper', 'iron', 'copper', 'iron', 'silicon'] : [];
  const spots = [[-95, 235], [10, 265], [115, 230], [-205, 290], [215, 300], [-30, 360], [120, 380]];
  spots.forEach(([x, y], i) => {
    spawnAsteroid(state, {
      stats,
      x,
      y,
      type: starter[i],
      size: i === 1 || i === 5 ? 'large' : 'medium',
      vx: 0,
      vy: 0,
    });
  });
}

export function updateAsteroids(state, dt) {
  const sec = sectorDef(state);
  const R = sec.radius;
  const list = state.asteroids;
  for (let i = list.length - 1; i >= 0; i--) {
    const a = list[i];
    a.x += a.vx * dt;
    a.y += a.vy * dt;
    a.angle += a.spin * dt;
    if (a.hitT > 0) a.hitT -= dt;
    if (a.dmgT > 0) {
      a.dmgT -= dt;
      if (a.dmgT <= 0 && a.dmgAcc > 0) {
        emit(state, 'dmg', { x: a.x, y: a.y - a.r, amount: a.dmgAcc });
        a.dmgAcc = 0;
      }
    }
    if (a.meteor) {
      a.life -= dt;
      if (a.life <= 0) list.splice(i, 1);
      continue;
    }
    // Soft sector boundary: drift back in.
    const d2 = a.x * a.x + a.y * a.y;
    if (d2 > R * R) {
      const d = Math.sqrt(d2);
      a.vx -= (a.x / d) * 6 * dt;
      a.vy -= (a.y / d) * 6 * dt;
    }
    // Rocks drifting into the station approach get nudged away.
    if (d2 < SAFE_RADIUS * SAFE_RADIUS * 0.6) {
      const d = Math.sqrt(d2) || 1;
      a.vx += (a.x / d) * 10 * dt;
      a.vy += (a.y / d) * 10 * dt;
    }
  }

  // Keep the field full: respawn out of the player's sight.
  state.respawnTimer -= dt;
  if (state.respawnTimer <= 0) {
    state.respawnTimer = 1.2;
    let count = 0;
    for (const a of list) if (!a.meteor && !a.special) count++;
    if (count < sec.asteroids + 6) {
      spawnAsteroid(state, { awayFrom: { x: state.ship.x, y: state.ship.y, r: 520 } });
    }
  }
}

export function removeAsteroid(state, a) {
  const i = state.asteroids.indexOf(a);
  if (i >= 0) state.asteroids.splice(i, 1);
}

export function destroyAsteroid(state, a, by = 'player') {
  removeAsteroid(state, a);
  const t = ASTEROID_TYPES[a.type];
  const s = ASTEROID_SIZES[a.size];
  spawnDrops(state, a.x, a.y, a.type, a.yield, a.r);
  state.stats.asteroids++;
  const xp = Math.round(t.xp * (0.6 + s.yield * 0.6) * (a.special ? 5 : 1));
  addXp(state, xp, a.x, a.y);
  emit(state, 'explode', { x: a.x, y: a.y, r: a.r, res: a.type, color: RESOURCES[a.type].color, by, special: a.special });
}
