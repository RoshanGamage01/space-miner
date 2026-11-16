// EventManager: big moments. Alien invasions (3 waves), the mothership
// boss, pirate raids, meteor showers, crystal motherlodes, derelicts and
// power surges.
import { EVENTS, EVENT_GAP, EVENT_IDS, FIRST_EVENT_AT } from '../core/config.js';
import { emit, sectorDef } from '../core/state.js';
import { TAU, angleTo, dist, pickWeighted, rand, randInt } from '../core/math.js';
import { spawnAsteroid } from './AsteroidManager.js';
import { addToBag, recordCollected, spawnPickup } from './ResourceManager.js';
import { addCredits, addXp } from './EconomyManager.js';
import { pointAround, spawnEnemy, spawnPack } from './CombatSystem.js';

export function scheduleNextEvent(state) {
  state.nextEventAt = state.time + rand(EVENT_GAP[0], EVENT_GAP[1]);
}

export function startEvent(state, id) {
  const def = EVENTS[id];
  if (!def) return { ok: false, reason: 'Unknown event' };
  if (state.event) endEvent(state, false);
  const ev = { id, t: def.duration, dur: def.duration, spawnT: 0, target: 0, wave: 0, ids: [] };
  state.event = ev;
  state.stats.events++;
  if (id === 'invasion') nextWave(state, ev);
  else if (id === 'mothership') {
    const p = pointAround(state, 480, 560);
    ev.target = spawnEnemy(state, 'mothership', p.x, p.y).id;
  } else if (id === 'pirates') {
    const n = Math.min(4, 2 + Math.floor(state.level / 5));
    const c = pointAround(state, 420, 520);
    for (let i = 0; i < n; i++) ev.ids.push(spawnEnemy(state, 'pirate', c.x + rand(-40, 40), c.y + rand(-40, 40)).id);
  } else if (id === 'rare') {
    const p = pointAround(state, 450, 850);
    ev.target = spawnAsteroid(state, { x: p.x, y: p.y, type: 'crystal', size: 'large', special: true, vx: 0, vy: 0 }).id;
  } else if (id === 'derelict') {
    const p = pointAround(state, 500, 900);
    state.derelicts.push({ id: state.nextId++, x: p.x, y: p.y, angle: rand(0, TAU), spin: rand(-0.2, 0.2) });
  }
  emit(state, 'eventStart', { id, name: def.name, desc: def.desc });
  return { ok: true };
}

function nextWave(state, ev) {
  ev.wave++;
  const size = 3 + ev.wave * 2 + Math.floor(state.level / 3);
  ev.ids = spawnPack(state, size).map((e) => e.id);
  if (ev.wave === 3 && state.level >= 4) {
    const p = pointAround(state, 420, 480);
    ev.ids.push(spawnEnemy(state, 'brute', p.x, p.y).id);
  }
  ev.waveT = 25;
  emit(state, 'wave', { wave: ev.wave });
}

export function endEvent(state, natural = true) {
  const ev = state.event;
  if (!ev) return;
  if (ev.id === 'pirates' || ev.id === 'mothership') for (const e of state.enemies) if (e.kind === 'pirate' || e.kind === 'mothership') e.flee = true;
  if (ev.id === 'derelict') state.derelicts.length = 0;
  if (ev.id === 'rare') {
    const a = state.asteroids.find((q) => q.id === ev.target);
    if (a) a.special = false;
  }
  state.event = null;
  scheduleNextEvent(state);
  emit(state, 'eventEnd', { id: ev.id, name: EVENTS[ev.id].name, won: natural && ev.won });
}

const alive = (state, ids) => ids.some((id) => state.enemies.some((e) => e.id === id));

export function updateEvents(state, dt) {
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
    if (ev.id === 'invasion') {
      ev.waveT -= dt;
      if (!alive(state, ev.ids) || ev.waveT <= 0) {
        if (ev.wave < 3) nextWave(state, ev);
        else if (!alive(state, ev.ids)) {
          const bonus = 250 * state.level * sectorDef(state).danger;
          addCredits(state, bonus);
          addXp(state, 80 * state.level);
          ev.won = true;
          emit(state, 'victory', { name: 'Invasion repelled', credits: Math.round(bonus) });
          ev.t = 0;
        }
      }
    }
    if (ev.id === 'mothership' && !alive(state, [ev.target])) {
      ev.won = true;
      ev.t = 0;
      emit(state, 'victory', { name: 'Mothership destroyed', credits: 0 });
    }
    if (ev.id === 'pirates' && !alive(state, ev.ids)) ev.t = 0;
    if (ev.id === 'meteors') {
      ev.spawnT -= dt;
      if (ev.spawnT <= 0) {
        ev.spawnT = rand(0.35, 0.7);
        spawnMeteor(state);
      }
    }
    if (ev.id === 'rare' && !state.asteroids.some((a) => a.id === ev.target)) ev.t = 0;
    if (ev.id === 'derelict' && state.derelicts.length === 0) ev.t = 0;
    if (ev.t <= 0) endEvent(state);
  }
  for (const d of state.derelicts) d.angle += d.spin * dt;
}

function spawnMeteor(state) {
  const ship = state.ship;
  const a = Math.random() * TAU;
  const x = ship.x + Math.cos(a) * 380;
  const y = ship.y + Math.sin(a) * 380;
  const aim = angleTo(x, y, ship.x + rand(-160, 160), ship.y + rand(-160, 160));
  const sp = rand(55, 110);
  spawnAsteroid(state, { x, y, vx: Math.cos(aim) * sp, vy: Math.sin(aim) * sp, type: Math.random() < 0.6 ? 'iron' : 'nickel', size: 'small', meteor: true, life: 14 });
}

export function nearbyDerelict(state, reach = 55) {
  return state.derelicts.find((d) => dist(d.x, d.y, state.ship.x, state.ship.y) < reach) || null;
}

export function salvage(state, stats) {
  const d = nearbyDerelict(state);
  if (!d) return { ok: false, reason: 'Nothing to salvage here' };
  state.derelicts.splice(state.derelicts.indexOf(d), 1);
  const sec = sectorDef(state);
  const credits = Math.round(rand(200, 500) * sec.yield * (1 + state.level * 0.15));
  addCredits(state, credits);
  const res = pickWeighted({ silicon: 3, nickel: 2, crystal: 1 });
  const qty = Math.round(randInt(6, 12) * sec.yield);
  const add = addToBag(state.cargo, res, qty, stats.cargoCap);
  recordCollected(state, res, add);
  if (qty - add > 0) spawnPickup(state, d.x, d.y, res, qty - add, 12);
  addXp(state, 60 * sec.danger, d.x, d.y);
  emit(state, 'salvage', { x: d.x, y: d.y, credits, res, qty });
  return { ok: true };
}

export const eventProgress = (state) => {
  const ev = state.event;
  if (!ev) return null;
  if (ev.id === 'invasion') return { label: `Wave ${ev.wave}/3`, left: state.enemies.filter((e) => ev.ids.includes(e.id)).length };
  if (ev.id === 'mothership') {
    const b = state.enemies.find((e) => e.id === ev.target);
    return b ? { boss: b.hp / b.maxHp } : null;
  }
  return null;
};
