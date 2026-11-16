// CombatSystem: player weapons and perks, every shot in flight, enemy AI
// (swarm, ranged, bombers, snipers, shielded guardians, hives, sector
// bosses), elites, power-ups, wingmen, the station turret and kill combos.
import { BOSSES, COMBO_WINDOW, ELITE, ENEMIES, PATROL, POWERUPS, POWERUP_DROP, POWERUP_IDS, RESOURCE_IDS, STATION_TURRET } from '../core/config.js';
import { emit, getStats, sectorDef } from '../core/state.js';
import { TAU, angleTo, dist, dist2, len, pickWeighted, rand, randInt, turnToward, wrapAngle } from '../core/math.js';
import { applyDamage } from './MiningSystem.js';
import { damagePlayer } from './PlayerController.js';
import { spawnPickup } from './ResourceManager.js';
import { addXp } from './EconomyManager.js';
import { onEnemyKilled } from './CampaignSystem.js';

const MAX_SHOTS = 500;
const playerAway = (ship) => ship.docked || ship.deadT > 0;

// ------------------------------------------------------------ spawning
export function spawnEnemy(state, kind, x, y, opts = {}) {
  const def = ENEMIES[kind];
  const danger = sectorDef(state).danger;
  let scale = danger * (1 + 0.06 * (state.level - 1));
  const elite = opts.elite ?? (!def.structure && !def.boss && kind !== 'pirate' && state.level >= ELITE.minLevel && Math.random() < ELITE.chance);
  const boss = opts.boss ? BOSSES[opts.boss] : null;
  let hp = (boss ? boss.hp * (1 + 0.04 * (state.level - 1)) : def.hp * scale) * (elite ? ELITE.hp : 1);
  hp = Math.round(hp);
  const e = {
    id: state.nextId++,
    kind,
    x,
    y,
    vx: 0,
    vy: 0,
    angle: Math.random() * TAU,
    hp,
    maxHp: hp,
    r: (boss ? boss.r : def.r) * (elite ? ELITE.size : 1),
    shield: def.shield ? def.shield * scale : 0,
    shieldMax: def.shield ? def.shield * scale : 0,
    shieldCd: 0,
    fireCd: rand(1, 2.5),
    spawnCd: def.spawn ? rand(2, def.spawn) : 0,
    aimT: 0,
    aimAngle: 0,
    orbit: Math.random() < 0.5 ? 1 : -1,
    hitT: 0,
    touchCd: 0,
    steal: 0,
    flee: false,
    elite,
    dmgMult: Math.pow(danger, 0.7) * (elite ? ELITE.dmg : 1),
    phase: Math.random() * TAU,
    parent: opts.parent || 0,
    bossKey: opts.boss || null,
    patT: 3,
    patIdx: 0,
    spiralT: 0,
    burstN: 0,
    burstT: 0,
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

export function packWeights(state) {
  const w = {};
  for (const k in ENEMIES) if (ENEMIES[k].weight && state.level >= ENEMIES[k].minLevel) w[k] = ENEMIES[k].weight;
  return w;
}

export function spawnPack(state, size, at, parent = 0) {
  const w = packWeights(state);
  const c = at || pointAround(state, 380, 470);
  const out = [];
  for (let i = 0; i < size; i++) out.push(spawnEnemy(state, pickWeighted(w), c.x + rand(-40, 40), c.y + rand(-40, 40), { parent }));
  return out;
}

function updatePatrols(state) {
  if (!state.nextPatrolAt) state.nextPatrolAt = state.time + PATROL.first;
  if (state.time < state.nextPatrolAt) return;
  state.nextPatrolAt = state.time + rand(PATROL.gap[0], PATROL.gap[1]) / Math.sqrt(sectorDef(state).danger);
  if (playerAway(state.ship) || state.bossId || state.enemies.filter((e) => e.kind !== 'hive').length > 10) return;
  const size = Math.min(7, 2 + Math.floor(state.level / 3) + Math.floor(sectorDef(state).danger - 1));
  spawnPack(state, size);
  emit(state, 'patrol', { count: size });
}

// ------------------------------------------------------------ weapons
export function fireWeapon(state, stats) {
  const ship = state.ship;
  const w = stats.weapon;
  if (ship.fireCd > 0 || playerAway(ship)) return false;
  ship.fireCd = 1 / w.rate;
  const nose = stats.shipRadius + 3;
  const spread = w.count > 1 ? Math.max(w.spread, 0.07 * w.count) : w.spread;
  for (let i = 0; i < w.count; i++) {
    const off = w.count > 1 ? (i / (w.count - 1) - 0.5) * spread : (Math.random() - 0.5) * spread;
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
      bounces: w.splash || w.pierce ? 0 : stats.ricochet,
      crit: stats.crit,
    });
  }
  emit(state, 'shoot', { weapon: w.id });
  return true;
}

function addShot(state, s) {
  if (state.shots.length >= MAX_SHOTS) state.shots.shift();
  s.hits = s.pierce || s.bounces ? [] : null;
  state.shots.push(s);
}

// ------------------------------------------------------------ power-ups
export function applyPowerup(state, id) {
  const def = POWERUPS[id];
  if (!def) return;
  const stats = getStats(state);
  if (id === 'repair') state.ship.hull = Math.min(stats.hullMax, state.ship.hull + stats.hullMax * 0.5);
  else if (id === 'nuke') {
    const s = state.ship;
    for (const e of [...state.enemies]) if (dist(e.x, e.y, s.x, s.y) < 420) damageEnemy(state, e, ENEMIES[e.kind].boss || ENEMIES[e.kind].structure ? 300 * stats.gunMult : 1e6);
    state.shots = state.shots.filter((q) => q.team !== 'enemy');
  } else state.powerups[id] = def.time;
  emit(state, 'powerup', { id, name: def.name, color: def.color });
}

// ------------------------------------------------------------ damage
export function damageEnemy(state, e, amount, opts = {}) {
  if (e.dead) return;
  e.hitT = 0.08;
  if (e.shield > 0) {
    const a = Math.min(e.shield, amount);
    e.shield -= a;
    amount -= a;
    e.shieldCd = 3;
    if (amount <= 0) return;
  }
  e.hp -= amount;
  if (e.hp > 0) return;
  e.dead = true;
  const i = state.enemies.indexOf(e);
  if (i >= 0) state.enemies.splice(i, 1);
  const def = ENEMIES[e.kind];
  const danger = sectorDef(state).danger;
  const stats = getStats(state);
  const c = state.combo;
  c.count = c.t > 0 ? c.count + 1 : 1;
  c.t = COMBO_WINDOW;
  state.stats.bestCombo = Math.max(state.stats.bestCombo, c.count);
  const mult = Math.min(3, 1 + 0.25 * (c.count - 1));
  const credits = Math.round(def.credits * danger * mult * stats.greed * (e.elite ? ELITE.credits : 1));
  spawnPickup(state, e.x, e.y, 'credits', credits, e.r);
  if (def.boss || def.structure) {
    for (let k = 0; k < (def.boss ? 8 : 3); k++) spawnPickup(state, e.x, e.y, 'crystal', randInt(2, 4), 30);
    spawnPickup(state, e.x, e.y, `pow_${def.boss ? 'repair' : POWERUP_IDS[randInt(0, POWERUP_IDS.length - 1)]}`, 1, 20);
  } else if (e.loot) {
    for (const r in e.loot) spawnPickup(state, e.x, e.y, r, e.loot[r], 10);
  } else if (Math.random() < 0.3) {
    spawnPickup(state, e.x, e.y, pickWeighted({ silicon: 3, nickel: 2, crystal: 0.5 }), randInt(1, 3), 6);
  }
  if (e.elite || (!def.boss && !def.structure && Math.random() < POWERUP_DROP)) spawnPickup(state, e.x, e.y, `pow_${POWERUP_IDS[randInt(0, POWERUP_IDS.length - 1)]}`, 1, 8);
  state.stats.kills++;
  if (def.alien) state.stats.aliens++;
  if (e.elite) state.stats.elites++;
  if (e.kind === 'pirate') state.stats.pirates++;
  if (stats.vampire && state.ship.deadT <= 0) state.ship.hull = Math.min(stats.hullMax, state.ship.hull + stats.vampire);
  addXp(state, def.xp * danger * (e.elite ? 3 : 1), e.x, e.y);
  emit(state, 'kill', { x: e.x, y: e.y, kind: e.kind, r: e.r, combo: c.count, boss: !!def.boss, big: !!def.structure || e.elite, color: e.bossKey ? BOSSES[e.bossKey].color : null });
  // Bombers blow up; Volatile Kills makes everything blow up.
  if (def.blast && !opts.silent) {
    emit(state, 'blast', { x: e.x, y: e.y, r: def.blast });
    if (dist(e.x, e.y, state.ship.x, state.ship.y) < def.blast + stats.shipRadius) damagePlayer(state, def.blastDmg * e.dmgMult, stats);
    for (const o of [...state.enemies]) if (dist(o.x, o.y, e.x, e.y) < def.blast) damageEnemy(state, o, def.blastDmg * 2);
  }
  if (stats.killBlast && !def.blast) {
    const R = 36 + 8 * stats.killBlast;
    emit(state, 'blast', { x: e.x, y: e.y, r: R, small: true });
    for (const o of [...state.enemies]) if (dist(o.x, o.y, e.x, e.y) < R + o.r) damageEnemy(state, o, 14 * stats.killBlast * stats.gunMult);
  }
  onEnemyKilled(state, e);
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
  if (input.shoot && !input.menuOpen && !playerAway(ship)) fireWeapon(state, stats);
  if (state.combo.t > 0) {
    state.combo.t -= dt;
    if (state.combo.t <= 0) state.combo.count = 0;
  }
  for (const id in state.powerups) {
    if (state.powerups[id] > 0) {
      state.powerups[id] -= dt;
      if (state.powerups[id] <= 0) delete state.powerups[id];
    }
  }
  updatePatrols(state);
  updateEnemies(state, dt, stats);
  updateWingmen(state, dt, stats);
  updateShots(state, dt, stats);
  updateTurret(state, dt);
}

function enemyShot(state, e, angle, def, speedMult = 1, dmgMult = 1) {
  const speed = def.shotSpeed * speedMult;
  addShot(state, {
    team: 'enemy',
    kind: def.aim ? 'beam' : 'plasma',
    x: e.x + Math.cos(angle) * (e.r + 2),
    y: e.y + Math.sin(angle) * (e.r + 2),
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    life: def.aim ? 0.9 : 3.2,
    dmg: def.shot * e.dmgMult * dmgMult,
    color: e.bossKey ? BOSSES[e.bossKey].color : def.alien ? (def.aim ? '#ff4df0' : '#9dff4a') : '#ff6a3d',
  });
}

function updateBoss(state, e, dt, d, toShip) {
  const b = BOSSES[e.bossKey];
  const def = ENEMIES.boss;
  const enraged = e.hp < e.maxHp * 0.5;
  if (enraged && !e.enraged) {
    e.enraged = true;
    emit(state, 'enrage', { x: e.x, y: e.y, name: b.name });
  }
  if (e.spiralT > 0) {
    e.spiralT -= dt;
    e.burstT -= dt;
    if (e.burstT <= 0) {
      e.burstT = enraged ? 0.05 : 0.08;
      e.spiralA = (e.spiralA || 0) + 0.42;
      enemyShot(state, e, e.spiralA, def);
      if (enraged) enemyShot(state, e, e.spiralA + Math.PI, def);
    }
  } else if (e.burstN > 0) {
    e.burstT -= dt;
    if (e.burstT <= 0) {
      e.burstT = 0.28;
      e.burstN--;
      for (let k = -2; k <= 2; k++) enemyShot(state, e, toShip + k * 0.14, def, 1.5);
      emit(state, 'enemyShot', { x: e.x, y: e.y, boss: true });
    }
  }
  e.patT -= dt;
  if (e.patT > 0 || d > 700) return;
  e.patT = enraged ? 1.9 : 2.8;
  const pat = b.patterns[e.patIdx++ % b.patterns.length];
  if (pat === 'ring') {
    const n = enraged ? 20 : 14;
    for (let k = 0; k < n; k++) enemyShot(state, e, e.phase + (k / n) * TAU, def);
  } else if (pat === 'spiral') {
    e.spiralT = 1.6;
    e.burstT = 0;
  } else if (pat === 'burst') {
    e.burstN = enraged ? 4 : 3;
    e.burstT = 0;
  } else if (pat === 'cross') {
    for (let arm = 0; arm < 4; arm++) for (let k = 0; k < 6; k++) enemyShot(state, e, e.phase + (arm * Math.PI) / 2, def, 0.6 + k * 0.22);
  } else if (pat === 'spawn' && state.enemies.length < 16) {
    for (let k = 0; k < (enraged ? 4 : 3); k++) spawnEnemy(state, k === 0 ? b.minion : 'swarmer', e.x + rand(-30, 30), e.y + rand(-30, 30), { elite: false });
  }
  emit(state, 'enemyShot', { x: e.x, y: e.y, boss: true });
}

function updateEnemies(state, dt, stats) {
  const ship = state.ship;
  const away = playerAway(ship);
  const list = state.enemies;
  for (let i = list.length - 1; i >= 0; i--) {
    const e = list[i];
    const def = ENEMIES[e.kind];
    if (e.hitT > 0) e.hitT -= dt;
    if (e.touchCd > 0) e.touchCd -= dt;
    if (e.shieldMax) {
      if (e.shieldCd > 0) e.shieldCd -= dt;
      else e.shield = Math.min(e.shieldMax, e.shield + e.shieldMax * 0.4 * dt);
    }
    e.phase += dt;
    const d = dist(e.x, e.y, ship.x, ship.y);
    const toShip = angleTo(e.x, e.y, ship.x, ship.y);

    if (def.structure) {
      // Hives: spawn defenders and pulse rings when the player comes close.
      if (away) continue;
      e.spawnCd -= dt;
      if (e.spawnCd <= 0 && d < 650) {
        e.spawnCd = def.spawn;
        if (list.filter((o) => o.parent === e.id).length < 5) spawnPack(state, 2, { x: e.x, y: e.y }, e.id);
      }
      e.fireCd -= dt;
      if (e.fireCd <= 0 && d < 380) {
        e.fireCd = def.fire;
        for (let k = 0; k < def.ring; k++) enemyShot(state, e, e.phase + (k / def.ring) * TAU, def);
        emit(state, 'enemyShot', { x: e.x, y: e.y, boss: true });
      }
      continue;
    }

    if (d > PATROL.despawn && !def.boss) {
      list.splice(i, 1);
      continue;
    }
    const nearStation = len(e.x, e.y) < STATION_TURRET.range + 30;
    const keep = def.keep;
    let want;
    if (e.flee || away) want = toShip + Math.PI;
    else if (nearStation && !def.boss) want = Math.atan2(e.y, e.x);
    else if (!keep || d > keep + 30) want = toShip + (keep ? 0 : Math.sin(e.phase * 3) * 0.4);
    else if (d < keep - 40) want = toShip + Math.PI;
    else want = toShip + (Math.PI / 2) * e.orbit;
    if (e.flee && d > 900) {
      list.splice(i, 1);
      continue;
    }
    e.angle = keep ? turnToward(e.angle, toShip, 4 * dt) : Math.atan2(e.vy || 0.01, e.vx || 0.01);
    const boss = e.bossKey ? BOSSES[e.bossKey] : null;
    const accel = e.aimT > 0 ? 0 : def.accel;
    e.vx += Math.cos(want) * accel * dt;
    e.vy += Math.sin(want) * accel * dt;
    const drag = Math.exp(-1.1 * dt);
    e.vx *= drag;
    e.vy *= drag;
    const sp = len(e.vx, e.vy);
    const max = (boss ? boss.speed : def.speed) * (e.flee ? 1.6 : 1) * (away && def.boss ? 0.3 : 1);
    if (sp > max) {
      e.vx *= max / sp;
      e.vy *= max / sp;
    }
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    if (e.flee || away) continue;

    if (def.boss) {
      updateBoss(state, e, dt, d, toShip);
      if (d < e.r + stats.shipRadius && e.touchCd <= 0) {
        e.touchCd = 0.6;
        damagePlayer(state, 20 * e.dmgMult, stats);
      }
      continue;
    }
    // Ramming.
    if (def.touch && d < e.r + stats.shipRadius && e.touchCd <= 0) {
      e.touchCd = 0.8;
      damagePlayer(state, def.touch * e.dmgMult, stats);
      e.vx = -Math.cos(toShip) * 220;
      e.vy = -Math.sin(toShip) * 220;
      emit(state, 'bump', { x: (e.x + ship.x) / 2, y: (e.y + ship.y) / 2, impact: 80 });
    }
    // Bombers detonate on contact.
    if (def.blast && d < e.r + stats.shipRadius + 8) {
      damageEnemy(state, e, 1e6);
      continue;
    }
    // Snipers telegraph, then fire a fast lance.
    if (def.aim) {
      if (e.aimT > 0) {
        e.aimT -= dt;
        if (e.aimT > 0.25) e.aimAngle = toShip;
        if (e.aimT <= 0) {
          enemyShot(state, e, e.aimAngle, def);
          emit(state, 'enemyShot', { x: e.x, y: e.y, sniper: true });
        }
      } else {
        e.fireCd -= dt;
        if (e.fireCd <= 0 && d < 430) {
          e.fireCd = def.fire * rand(0.85, 1.15);
          e.aimT = def.aim;
          e.aimAngle = toShip;
        }
      }
    } else if (def.fire) {
      e.fireCd -= dt;
      if (e.fireCd <= 0 && d < 360) {
        e.fireCd = def.fire * rand(0.85, 1.15);
        if (def.spread) for (let k = 0; k < def.spread; k++) enemyShot(state, e, toShip + (k - (def.spread - 1) / 2) * 0.25, def);
        else enemyShot(state, e, toShip + rand(-0.1, 0.1), def);
        emit(state, 'enemyShot', { x: e.x, y: e.y });
      }
    }
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

function nearestEnemy(state, x, y, maxD, exclude) {
  let best = null;
  let bd = maxD * maxD;
  for (const e of state.enemies) {
    if (exclude && exclude.includes(e.id)) continue;
    const d2 = dist2(e.x, e.y, x, y);
    if (d2 < bd) {
      bd = d2;
      best = e;
    }
  }
  return best;
}

// Wingmen orbit the ship and shoot the nearest hostile.
function updateWingmen(state, dt, stats) {
  const ship = state.ship;
  const list = state.wingmen;
  while (list.length < stats.wingmen) list.push({ x: ship.x, y: ship.y, cd: Math.random(), angle: 0 });
  list.length = Math.min(list.length, stats.wingmen);
  if (playerAway(ship)) return;
  list.forEach((w, i) => {
    const a = state.time * 1.6 + (i / list.length) * TAU;
    const tx = ship.x + Math.cos(a) * 26;
    const ty = ship.y + Math.sin(a) * 26;
    w.x += (tx - w.x) * Math.min(1, dt * 8);
    w.y += (ty - w.y) * Math.min(1, dt * 8);
    w.cd -= dt;
    const t = nearestEnemy(state, w.x, w.y, 280);
    if (t) w.angle = angleTo(w.x, w.y, t.x, t.y);
    else w.angle = ship.angle;
    if (t && w.cd <= 0) {
      w.cd = 0.45;
      addShot(state, { team: 'player', kind: 'wing', x: w.x, y: w.y, vx: Math.cos(w.angle) * 420, vy: Math.sin(w.angle) * 420, life: 0.7, dmg: 6 * stats.gunMult, color: '#7dffb0', crit: stats.crit });
    }
  });
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
      if (ship.deadT <= 0 && dist2(s.x, s.y, ship.x, ship.y) < (stats.shipRadius + 3) ** 2) {
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
            const crit = s.crit && Math.random() < s.crit;
            const dmg = s.dmg * (crit ? 2.5 : 1);
            emit(state, 'enemyHit', { x: e.x, y: e.y - e.r, dmg, crit, shield: e.shield > 0 });
            damageEnemy(state, e, dmg);
            if (s.hits) s.hits.push(e.id);
            if (s.bounces > 0) {
              // Ricochet toward another target.
              const t = nearestEnemy(state, s.x, s.y, 240, s.hits);
              if (t) {
                const sp = len(s.vx, s.vy);
                const a = angleTo(s.x, s.y, t.x, t.y);
                s.vx = Math.cos(a) * sp;
                s.vy = Math.sin(a) * sp;
                s.life = Math.max(s.life, 0.45);
                s.bounces--;
              } else dead = true;
            } else if (!s.pierce) dead = true;
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
          if (s.pierce && s.team === 'player') s.hits.push(a.id);
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
