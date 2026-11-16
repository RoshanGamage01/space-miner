// CombatSystem: player weapons, every shot in flight, enemy AI (aliens,
// pirates, the mothership boss), ambient alien patrols, the station's
// defense turret and kill combos.
import { COMBO_WINDOW, ENEMIES, PATROL, RESOURCE_IDS, STATION_TURRET } from '../core/config.js';
import { emit, sectorDef } from '../core/state.js';
import { TAU, angleTo, dist, dist2, len, pickWeighted, rand, randInt, turnToward, wrapAngle } from '../core/math.js';
import { applyDamage } from './MiningSystem.js';
import { damagePlayer } from './PlayerController.js';
import { spawnPickup } from './ResourceManager.js';
import { addXp } from './EconomyManager.js';

const MAX_SHOTS = 400;

// ------------------------------------------------------------ spawning
export function spawnEnemy(state, kind, x, y) {
  const def = ENEMIES[kind];
  const danger = sectorDef(state).danger;
  const scale = danger * (1 + 0.06 * (state.level - 1));
  const e = {
    id: state.nextId++,
    kind,
    x,
    y,
    vx: 0,
    vy: 0,
    angle: Math.random() * TAU,
    hp: Math.round(def.hp * scale),
    maxHp: Math.round(def.hp * scale),
    r: def.r,
    fireCd: rand(1, 2.5),
    spawnCd: def.spawn || 0,
    orbit: Math.random() < 0.5 ? 1 : -1,
    hitT: 0,
    touchCd: 0,
    steal: 0,
    flee: false,
    dmgMult: Math.pow(danger, 0.7),
    phase: Math.random() * TAU,
  };
  state.enemies.push(e);
  return e;
}

export function pointAround(state, minD, maxD) {
  const R = sectorDef(state).radius;
  const s = state.ship;
  for (let i = 0; i < 20; i++) {
    const a = Math.random() * TAU;
    const d = rand(minD, maxD);
    const x = s.x + Math.cos(a) * d;
    const y = s.y + Math.sin(a) * d;
    if (len(x, y) < R && len(x, y) > STATION_TURRET.range + 40) return { x, y };
  }
  const a = Math.random() * TAU;
  return { x: Math.cos(a) * (STATION_TURRET.range + 300), y: Math.sin(a) * (STATION_TURRET.range + 300) };
}

// A pack of aliens appears near the player, scaled to level and sector.
export function spawnPack(state, size) {
  const L = state.level;
  const w = { swarmer: 5, spitter: L >= 2 ? 3 : 0, brute: L >= 5 ? 1.2 : 0 };
  const c = pointAround(state, 380, 470);
  const out = [];
  for (let i = 0; i < size; i++) out.push(spawnEnemy(state, pickWeighted(w), c.x + rand(-40, 40), c.y + rand(-40, 40)));
  return out;
}

function updatePatrols(state) {
  if (!state.nextPatrolAt) state.nextPatrolAt = state.time + PATROL.first;
  if (state.time < state.nextPatrolAt) return;
  state.nextPatrolAt = state.time + rand(PATROL.gap[0], PATROL.gap[1]) / Math.sqrt(sectorDef(state).danger);
  if (state.ship.docked || state.enemies.length > 10) return;
  const size = Math.min(7, 2 + Math.floor(state.level / 3) + Math.floor(sectorDef(state).danger - 1));
  spawnPack(state, size);
  emit(state, 'patrol', { count: size });
}

// ------------------------------------------------------------ weapons
export function fireWeapon(state, stats) {
  const ship = state.ship;
  const w = stats.weapon;
  if (ship.fireCd > 0 || ship.docked) return false;
  ship.fireCd = 1 / w.rate;
  const nose = stats.shipRadius + 3;
  for (let i = 0; i < w.count; i++) {
    const off = w.count > 1 ? (i / (w.count - 1) - 0.5) * w.spread : (Math.random() - 0.5) * w.spread;
    const a = ship.angle + off;
    addShot(state, {
      team: 'player',
      kind: w.id,
      x: ship.x + Math.cos(ship.angle) * nose,
      y: ship.y + Math.sin(ship.angle) * nose,
      vx: Math.cos(a) * w.speed + ship.vx * 0.5,
      vy: Math.sin(a) * w.speed + ship.vy * 0.5,
      life: w.life,
      dmg: w.dmg,
      color: w.color,
      homing: !!w.homing,
      splash: w.splash || 0,
      pierce: !!w.pierce,
    });
  }
  emit(state, 'shoot', { weapon: w.id });
  return true;
}

function addShot(state, s) {
  if (state.shots.length >= MAX_SHOTS) state.shots.shift();
  s.hits = s.pierce ? [] : null;
  state.shots.push(s);
}

// ------------------------------------------------------------ damage
export function damageEnemy(state, e, amount, source = 'player') {
  if (e.dead) return;
  e.hp -= amount;
  e.hitT = 0.08;
  if (e.hp > 0) return;
  e.dead = true;
  const i = state.enemies.indexOf(e);
  if (i >= 0) state.enemies.splice(i, 1);
  const def = ENEMIES[e.kind];
  const danger = sectorDef(state).danger;
  // Combo: quick kills pay more.
  const c = state.combo;
  c.count = c.t > 0 ? c.count + 1 : 1;
  c.t = COMBO_WINDOW;
  state.stats.bestCombo = Math.max(state.stats.bestCombo, c.count);
  const mult = Math.min(3, 1 + 0.25 * (c.count - 1));
  const credits = Math.round(def.credits * danger * mult);
  spawnPickup(state, e.x, e.y, 'credits', credits, e.r);
  if (def.boss) {
    for (let k = 0; k < 6; k++) spawnPickup(state, e.x, e.y, 'crystal', randInt(2, 4), 30);
    state.stats.bosses++;
  } else if (e.loot) {
    for (const r in e.loot) spawnPickup(state, e.x, e.y, r, e.loot[r], 10);
  } else if (Math.random() < 0.3) {
    spawnPickup(state, e.x, e.y, pickWeighted({ silicon: 3, nickel: 2, crystal: 0.5 }), randInt(1, 3), 6);
  }
  state.stats.kills++;
  if (def.alien) state.stats.aliens++;
  if (e.kind === 'pirate') state.stats.pirates++;
  addXp(state, def.xp * danger, e.x, e.y);
  emit(state, 'kill', { x: e.x, y: e.y, kind: e.kind, r: e.r, combo: c.count, boss: !!def.boss, source });
}

function explodeAt(state, x, y, radius, dmg) {
  for (const e of [...state.enemies]) if (dist(e.x, e.y, x, y) < radius + e.r) damageEnemy(state, e, dmg);
  for (const a of [...state.asteroids]) if (dist(a.x, a.y, x, y) < radius + a.r) applyDamage(state, a, dmg * 0.5, 1, 'player');
  emit(state, 'blast', { x, y, r: radius });
}

// ------------------------------------------------------------ update
export function updateCombat(state, dt, input, stats) {
  const ship = state.ship;
  if (ship.fireCd > 0) ship.fireCd -= dt;
  if (input.shoot && !input.menuOpen && !ship.docked) fireWeapon(state, stats);
  if (state.combo.t > 0) {
    state.combo.t -= dt;
    if (state.combo.t <= 0) state.combo.count = 0;
  }
  updatePatrols(state);
  updateEnemies(state, dt, stats);
  updateShots(state, dt, stats);
  updateTurret(state, dt);
}

function enemyShot(state, e, angle, def) {
  addShot(state, {
    team: 'enemy',
    kind: def.alien ? 'plasma' : 'bolt',
    x: e.x + Math.cos(angle) * (e.r + 2),
    y: e.y + Math.sin(angle) * (e.r + 2),
    vx: Math.cos(angle) * def.shotSpeed,
    vy: Math.sin(angle) * def.shotSpeed,
    life: 3,
    dmg: def.shot * e.dmgMult,
    color: def.alien ? '#9dff4a' : '#ff6a3d',
  });
}

function updateEnemies(state, dt, stats) {
  const ship = state.ship;
  const list = state.enemies;
  for (let i = list.length - 1; i >= 0; i--) {
    const e = list[i];
    const def = ENEMIES[e.kind];
    if (e.hitT > 0) e.hitT -= dt;
    if (e.touchCd > 0) e.touchCd -= dt;
    e.phase += dt;
    const d = dist(e.x, e.y, ship.x, ship.y);
    if (d > PATROL.despawn) {
      list.splice(i, 1);
      continue;
    }
    const toShip = angleTo(e.x, e.y, ship.x, ship.y);
    // Aliens avoid the station's guns; everyone backs off when you dock.
    const nearStation = len(e.x, e.y) < STATION_TURRET.range + 30;
    let want;
    if (e.flee || ship.docked) want = toShip + Math.PI;
    else if (nearStation && !def.boss) want = Math.atan2(e.y, e.x);
    else if (!def.keep || d > def.keep + 30) want = toShip + (def.keep ? 0 : Math.sin(e.phase * 3) * 0.4);
    else if (d < def.keep - 40) want = toShip + Math.PI;
    else want = toShip + (Math.PI / 2) * e.orbit;
    if (e.flee && d > 900) {
      list.splice(i, 1);
      continue;
    }
    e.angle = def.keep ? turnToward(e.angle, toShip, 4 * dt) : Math.atan2(e.vy || 0.01, e.vx || 0.01);
    e.vx += Math.cos(want) * def.accel * dt;
    e.vy += Math.sin(want) * def.accel * dt;
    const drag = Math.exp(-1.1 * dt);
    e.vx *= drag;
    e.vy *= drag;
    const sp = len(e.vx, e.vy);
    const max = def.speed * (e.flee ? 1.6 : 1);
    if (sp > max) {
      e.vx *= max / sp;
      e.vy *= max / sp;
    }
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    if (e.flee || ship.docked) continue;

    // Ramming.
    if (def.touch && d < e.r + stats.shipRadius && e.touchCd <= 0) {
      e.touchCd = 0.8;
      damagePlayer(state, def.touch * e.dmgMult, stats);
      e.vx = -Math.cos(toShip) * 220;
      e.vy = -Math.sin(toShip) * 220;
      emit(state, 'bump', { x: (e.x + ship.x) / 2, y: (e.y + ship.y) / 2, impact: 80 });
    }

    // Shooting.
    if (def.fire) {
      e.fireCd -= dt;
      if (e.fireCd <= 0 && d < 360) {
        e.fireCd = def.fire * rand(0.85, 1.15);
        if (def.ring) {
          const off = e.phase;
          for (let k = 0; k < def.ring; k++) enemyShot(state, e, off + (k / def.ring) * TAU, def);
        } else if (def.spread) {
          for (let k = 0; k < def.spread; k++) enemyShot(state, e, toShip + (k - (def.spread - 1) / 2) * 0.25, def);
        } else {
          enemyShot(state, e, toShip + rand(-0.1, 0.1), def);
        }
        emit(state, 'enemyShot', { x: e.x, y: e.y, boss: !!def.boss });
      }
    }
    // The mothership launches swarmers.
    if (def.spawn) {
      e.spawnCd -= dt;
      if (e.spawnCd <= 0 && state.enemies.length < 18) {
        e.spawnCd = def.spawn;
        for (let k = 0; k < 2; k++) spawnEnemy(state, 'swarmer', e.x + rand(-20, 20), e.y + rand(-20, 20));
      }
    }
    // Pirates tractor-steal cargo when glued to you.
    if (def.steals) {
      if (d < 55) {
        e.steal += dt;
        if (e.steal > 1.6) {
          e.steal = 0;
          stealCargo(state, e);
        }
      } else e.steal = Math.max(0, e.steal - dt);
    }
  }
}

function stealCargo(state, e) {
  const held = RESOURCE_IDS.filter((r) => state.cargo[r] > 0);
  if (!held.length) return;
  const r = held[randInt(0, held.length - 1)];
  const q = Math.max(1, Math.ceil(state.cargo[r] * 0.2));
  state.cargo[r] -= q;
  e.loot = e.loot || {};
  e.loot[r] = (e.loot[r] || 0) + q;
  emit(state, 'stolen', { res: r, qty: q, x: e.x, y: e.y });
}

function nearestEnemy(state, x, y, maxD) {
  let best = null;
  let bd = maxD * maxD;
  for (const e of state.enemies) {
    const d2 = dist2(e.x, e.y, x, y);
    if (d2 < bd) {
      bd = d2;
      best = e;
    }
  }
  return best;
}

function updateShots(state, dt, stats) {
  const ship = state.ship;
  const list = state.shots;
  for (let i = list.length - 1; i >= 0; i--) {
    const s = list[i];
    s.life -= dt;
    if (s.homing) {
      const t = nearestEnemy(state, s.x, s.y, 320);
      if (t) {
        const sp = len(s.vx, s.vy);
        const cur = Math.atan2(s.vy, s.vx);
        const a = cur + Math.max(-4 * dt, Math.min(4 * dt, wrapAngle(angleTo(s.x, s.y, t.x, t.y) - cur)));
        s.vx = Math.cos(a) * sp;
        s.vy = Math.sin(a) * sp;
      }
    }
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    let dead = s.life <= 0;
    if (!dead && s.team === 'enemy') {
      if (dist2(s.x, s.y, ship.x, ship.y) < (stats.shipRadius + 3) ** 2) {
        damagePlayer(state, s.dmg, stats);
        emit(state, 'shotHit', { x: s.x, y: s.y, color: s.color });
        dead = true;
      }
    } else if (!dead) {
      for (const e of state.enemies) {
        if (s.hits && s.hits.includes(e.id)) continue;
        if (dist2(s.x, s.y, e.x, e.y) < (e.r + 3) ** 2) {
          emit(state, 'shotHit', { x: s.x, y: s.y, color: s.color });
          if (s.splash) {
            explodeAt(state, s.x, s.y, s.splash, s.dmg);
            dead = true;
          } else {
            damageEnemy(state, e, s.dmg);
            if (s.hits) s.hits.push(e.id);
            else dead = true;
          }
          break;
        }
      }
    }
    // Every shot also chips rock (player shots mine, a little).
    if (!dead) {
      for (const a of state.asteroids) {
        if (s.hits && s.hits.includes(a.id)) continue;
        if (Math.abs(a.x - s.x) > a.r || Math.abs(a.y - s.y) > a.r) continue;
        if (dist2(s.x, s.y, a.x, a.y) < a.r * a.r * 0.7) {
          emit(state, 'shotHit', { x: s.x, y: s.y, color: s.color });
          if (s.team === 'player') {
            if (s.splash) explodeAt(state, s.x, s.y, s.splash, s.dmg);
            else applyDamage(state, a, s.dmg * 0.5, 1, 'player');
          }
          if (s.hits && s.team === 'player') s.hits.push(a.id);
          else dead = true;
          break;
        }
      }
    }
    if (dead) list.splice(i, 1);
  }
}

function updateTurret(state, dt) {
  state.turretCd -= dt;
  if (state.turretCd > 0) return;
  const t = nearestEnemy(state, 0, 0, STATION_TURRET.range);
  if (!t) return;
  state.turretCd = 1 / STATION_TURRET.rate;
  const a = angleTo(0, 0, t.x, t.y);
  addShot(state, { team: 'player', kind: 'turret', x: Math.cos(a) * 20, y: Math.sin(a) * 20, vx: Math.cos(a) * 520, vy: Math.sin(a) * 520, life: 0.7, dmg: STATION_TURRET.dmg * sectorDef(state).danger, color: '#7dffb0' });
}

// Laser and pulse hit enemies through these.
export function enemyAlongRay(state, ox, oy, dx, dy, range, rayCircle) {
  let best = range;
  let target = null;
  for (const e of state.enemies) {
    const t = rayCircle(ox, oy, dx, dy, e.x, e.y, e.r + 1);
    if (t >= 0 && t < best) {
      best = t;
      target = e;
    }
  }
  return { target, t: best };
}
