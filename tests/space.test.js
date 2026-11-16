// SPACE MINER simulation tests. The engine has no DOM dependency, so the
// whole game runs headless in Node: the acceptance scenario, every economy
// rule, drones, events, saving and offline progress.
import test from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine } from '../src/engine/GameEngine.js';
import { createState, cargoUsed, getStats } from '../src/core/state.js';
import { EVENT_IDS, MARKET, RESOURCE_IDS, SIM_STEP, START, STATION, xpToNext } from '../src/core/config.js';
import { spawnAsteroid } from '../src/systems/AsteroidManager.js';
import { spawnPickup } from '../src/systems/ResourceManager.js';
import { price, updateMarket } from '../src/systems/EconomyManager.js';
import { applyOffline, deserialize, serialize } from '../src/systems/SaveManager.js';
import { startEvent, endEvent } from '../src/systems/EventManager.js';
import { missionProgress } from '../src/systems/MissionManager.js';
import { upgradeInfo } from '../src/systems/UpgradeManager.js';
import { playBot } from './space-miner-bot.js';

const IDLE = { mx: 0, my: 0, fire: false, boost: false, interact: false, ability: false, menuOpen: false };

// A quiet engine: no random events, an empty field, drones parked.
function quietEngine() {
  const g = new GameEngine();
  g.state.nextEventAt = Infinity;
  g.state.asteroids.length = 0;
  g.state.respawnTimer = Infinity;
  return g;
}
const run = (g, seconds, input = IDLE) => {
  for (let i = 0; i < Math.round(seconds / SIM_STEP); i++) g.step(SIM_STEP, input);
  g.drainFx();
};
const aimAt = (g, a) => ({ ...IDLE, aimX: a.x, aimY: a.y, fire: true });
const parkDrones = (g) => {
  g.state.drones.length = 0;
};

test('new game starts with the specified loadout', () => {
  const s = createState();
  const st = getStats(s);
  assert.equal(s.credits, 1000);
  assert.equal(s.ship.fuel, 100);
  assert.equal(st.cargoCap, 100);
  assert.equal(s.drones.length, 1);
  assert.ok(st.laserDps > 0, 'basic mining laser');
  assert.equal(s.sector, 'kepler');
});

test('an asteroid is in view and in reach right at spawn', () => {
  const g = new GameEngine();
  const s = g.state;
  const near = s.asteroids.filter((a) => Math.abs(a.x - s.ship.x) < 260 && Math.abs(a.y - s.ship.y) < 150);
  assert.ok(near.length >= 2, `asteroids on screen at spawn: ${near.length}`);
  assert.ok(s.asteroids.length > 300, 'the field is populated');
  assert.equal(s.missions.active.length, 3);
});

test('mining damages, breaks the rock and drops exactly its yield', () => {
  const g = quietEngine();
  parkDrones(g);
  const s = g.state;
  const a = spawnAsteroid(s, { x: s.ship.x, y: s.ship.y + 50, type: 'iron', size: 'medium', vx: 0, vy: 0 });
  const yieldQty = a.yield;
  run(g, 0.5, aimAt(g, a));
  assert.ok(a.hp < a.maxHp, 'laser reduces health');
  assert.ok(s.ship.energy < getStats(s).energyMax, 'laser drains energy');
  run(g, 4, aimAt(g, a));
  assert.ok(!s.asteroids.includes(a), 'asteroid destroyed');
  const dropped = s.pickups.reduce((n, p) => n + p.qty, 0) + cargoUsed(s.cargo);
  assert.equal(dropped, yieldQty);
  assert.equal(s.stats.asteroids, 1);
  assert.ok(s.xp > 0 || s.level > 1, 'mining grants XP');
});

test('flying over fragments fills the hold; a full hold stops collection', () => {
  const g = quietEngine();
  parkDrones(g);
  const s = g.state;
  spawnPickup(s, s.ship.x + 20, s.ship.y, 'copper', 3, 0);
  run(g, 1.5);
  assert.ok(s.cargo.copper >= 3, 'collected via tractor beam');
  assert.equal(s.pickups.length, 0);

  const cap = getStats(s).cargoCap;
  s.cargo.iron = cap - cargoUsed(s.cargo);
  spawnPickup(s, s.ship.x + 5, s.ship.y, 'nickel', 4, 0);
  run(g, 1.5);
  assert.equal(cargoUsed(s.cargo), cap, 'never exceeds capacity');
  assert.equal(s.cargo.nickel, 0);
  assert.equal(s.pickups.length, 1, 'fragment stays in space');
});

test('cargo can only be sold while docked; credits follow quantity x price', () => {
  const g = quietEngine();
  const s = g.state;
  s.cargo.iron = 20;
  s.cargo.crystal = 2;
  const blocked = g.act('sell', 'all');
  assert.equal(blocked.ok, false);
  assert.equal(s.cargo.iron, 20);
  assert.equal(g.dock().ok, false, 'too far to dock');
  s.ship.x = 0;
  s.ship.y = STATION.dockRadius - 10;
  assert.ok(g.canDock());
  assert.ok(g.interact().ok);
  assert.ok(s.ship.docked);
  const expected = 20 * price(s, 'iron') + 2 * price(s, 'crystal');
  const before = s.credits;
  const r = g.act('sell', 'all');
  assert.ok(r.ok);
  assert.equal(s.credits - before >= expected, true); // mission rewards may add on top
  assert.equal(r.credits, expected);
  assert.equal(cargoUsed(s.cargo), 0);
  assert.equal(s.stats.sales, 1);
});

test('base prices match the design table', () => {
  const s = createState();
  const base = { iron: 5, copper: 8, silicon: 12, nickel: 18, crystal: 50 };
  for (const r of RESOURCE_IDS) assert.equal(price(s, r), base[r]);
});

test('market prices fluctuate but stay within bounds', () => {
  const s = createState();
  for (let i = 0; i < 2000; i++) updateMarket(s, MARKET.interval);
  for (const r of RESOURCE_IDS) {
    const m = s.market[r].mult;
    assert.ok(m >= MARKET.min && m <= MARKET.max, `${r} ${m}`);
    assert.ok(s.market[r].history.length <= MARKET.history);
    assert.ok(new Set(s.market[r].history.map((v) => v.toFixed(3))).size > 1, 'prices move');
  }
});

test('upgrades cost credits, respect level gates and change gameplay', () => {
  const g = quietEngine();
  parkDrones(g);
  const s = g.state;
  const timeToBreak = () => {
    s.asteroids.length = 0;
    const a = spawnAsteroid(s, { x: s.ship.x, y: s.ship.y + 50, type: 'copper', size: 'large', vx: 0, vy: 0 });
    let t = 0;
    while (s.asteroids.includes(a) && t < 60) {
      g.step(SIM_STEP, aimAt(g, a));
      s.ship.energy = 999; // isolate damage from energy
      t += SIM_STEP;
    }
    return t;
  };
  const slow = timeToBreak();
  const cost = upgradeInfo(s, 'laserDamage').cost;
  const credits = s.credits;
  assert.ok(g.act('buyUpgrade', 'laserDamage').ok);
  assert.equal(s.credits, credits - cost);
  assert.equal(s.upgrades.laserDamage, 1);
  const fast = timeToBreak();
  assert.ok(fast < slow * 0.9, `laser upgrade mines faster (${slow.toFixed(2)}s -> ${fast.toFixed(2)}s)`);

  // Bigger hold really holds more.
  const cap0 = getStats(s).cargoCap;
  s.credits = 1e6;
  assert.ok(g.act('buyUpgrade', 'cargoCapacity').ok);
  assert.equal(getStats(s).cargoCap, cap0 + 50);

  // Level gate.
  s.upgrades.engineSpeed = 3;
  s.level = 1;
  const r = g.act('buyUpgrade', 'engineSpeed');
  assert.equal(r.ok, false);
  assert.match(r.reason, /level/);
  // Not enough credits.
  s.credits = 0;
  assert.equal(g.act('buyUpgrade', 'laserRange').ok, false);
});

test('drones find rock, mine it and haul minerals to the station', () => {
  const g = quietEngine();
  const s = g.state;
  const d = s.drones[0];
  for (let i = 0; i < 4; i++) spawnAsteroid(s, { x: 150 + i * 30, y: -120, type: 'iron', size: 'small', vx: 0, vy: 0 });
  s.ship.x = 2000; // player far away: the drone works alone
  run(g, 150);
  assert.ok(s.stats.asteroids >= 2, `drone destroyed ${s.stats.asteroids} rocks`);
  assert.ok(cargoUsed(s.storage) + d.load > 0, 'minerals collected by the drone');
  assert.ok(cargoUsed(s.storage) > 0, 'drone delivered to the silo');
  // Silo contents can be sold without docking.
  const r = g.act('sell', 'all', 'storage');
  assert.ok(r.ok && r.credits > 0);
});

test('buying a second drone needs a free slot and credits', () => {
  const g = quietEngine();
  const s = g.state;
  assert.equal(g.act('buyDrone').ok, false, 'one slot at level 1');
  s.level = 2;
  const before = s.credits;
  assert.ok(g.act('buyDrone').ok);
  assert.equal(s.drones.length, 2);
  assert.ok(s.credits < before + 300); // paid (mission reward may be added)
  assert.equal(g.act('droneMode', s.drones[0].id, 'escort').ok, false, 'escort needs research');
  s.rp = 10;
  assert.ok(g.act('research', 'escort').ok);
  assert.ok(g.act('droneMode', s.drones[0].id, 'escort').ok);
});

test('missions track progress and pay out on completion', () => {
  const g = quietEngine();
  const s = g.state;
  const m = s.missions.active.find((q) => q.kind === 'collect' && q.res === 'iron');
  assert.ok(m, 'first mission is mining iron');
  const credits = s.credits;
  s.stats.byRes.iron += 4;
  assert.equal(missionProgress(s, m), 4);
  s.stats.byRes.iron += 10;
  run(g, 0.5);
  assert.ok(!s.missions.active.includes(m), 'mission completed');
  assert.ok(s.credits >= credits + m.credits);
  assert.equal(s.missions.active.length, 3, 'a new mission replaces it');
  assert.equal(s.missions.completed, 1);
});

test('XP levels the pilot up and grants research points', () => {
  const g = quietEngine();
  const s = g.state;
  const rp = s.rp;
  s.stats.byRes.iron += 10; // finish a mission for XP
  run(g, 0.3);
  s.xp += xpToNext(s.level);
  s.stats.asteroids += 5;
  run(g, 0.3);
  assert.ok(s.level >= 2);
  assert.ok(s.rp > rp);
});

test('achievements unlock once and pay research points', () => {
  const g = quietEngine();
  const s = g.state;
  s.stats.sales = 1;
  run(g, 0.3);
  assert.ok(s.achievements.firstTrip);
  const rp = s.rp;
  run(g, 0.3);
  assert.equal(s.rp, rp, 'not paid twice');
});

test('every random event starts and ends cleanly', () => {
  for (const id of EVENT_IDS) {
    const g = quietEngine();
    const s = g.state;
    s.level = 10;
    assert.ok(startEvent(s, id).ok, id);
    run(g, 3);
    endEvent(s);
    run(g, 20);
    assert.equal(s.event, null);
    assert.equal(s.derelicts.length, 0);
    assert.ok(Number.isFinite(s.ship.hull));
  }
});

test('pirates can be shot down and drop loot; derelicts can be salvaged', () => {
  const g = quietEngine();
  parkDrones(g);
  const s = g.state;
  startEvent(s, 'pirates');
  const p = s.pirates[0];
  const n = s.pirates.length;
  p.x = s.ship.x + 40;
  p.y = s.ship.y;
  p.vx = p.vy = 0;
  for (let i = 0; i < 600 && s.pirates.includes(p); i++) {
    p.x = s.ship.x + 40;
    p.y = s.ship.y;
    g.step(SIM_STEP, { ...IDLE, aimX: p.x, aimY: p.y, fire: true });
    s.ship.energy = 999;
  }
  assert.ok(!s.pirates.includes(p), 'pirate destroyed');
  assert.equal(s.pirates.length, n - 1);
  assert.ok(s.pickups.some((q) => q.type === 'credits'));
  assert.equal(s.stats.pirates, 1);

  endEvent(s);
  startEvent(s, 'derelict');
  const d = s.derelicts[0];
  s.ship.x = d.x + 10;
  s.ship.y = d.y;
  const credits = s.credits;
  const rp = s.rp;
  assert.ok(g.interact().ok);
  assert.ok(s.credits > credits && s.rp > rp);
  assert.equal(s.derelicts.length, 0);
});

test('fuel burns while thrusting; an empty tank still limps home', () => {
  const g = quietEngine();
  const s = g.state;
  run(g, 3, { ...IDLE, mx: 1 });
  assert.ok(s.ship.fuel < START.fuel);
  s.ship.fuel = 0;
  s.ship.vx = s.ship.vy = 0;
  const x = s.ship.x;
  run(g, 2, { ...IDLE, mx: 1 });
  assert.ok(s.ship.x > x + 10, 'emergency thrust');
  // Docked refuel; broke pilots get it free.
  s.ship.x = 0;
  s.ship.y = 40;
  g.dock();
  s.credits = 0;
  assert.ok(g.act('refuel').ok);
  assert.equal(s.ship.fuel, getStats(s).fuelMax);
});

test('sectors unlock with level + credits and warping builds a new field', () => {
  const g = quietEngine();
  const s = g.state;
  assert.equal(g.act('unlockSector', 'cobalt').ok, false);
  s.level = 4;
  s.credits = 10000;
  assert.ok(g.act('unlockSector', 'cobalt').ok);
  assert.ok(g.act('warp', 'cobalt').ok);
  assert.equal(s.sector, 'cobalt');
  assert.ok(s.asteroids.length > 300);
  assert.equal(g.act('warp', 'ember').ok, false, 'not charted');
});

test('save/load round-trips progress and rejects or repairs bad data', () => {
  const g = quietEngine();
  const s = g.state;
  s.credits = 4321;
  s.level = 6;
  s.xp = 77;
  s.rp = 9;
  s.upgrades.laserDamage = 3;
  s.droneUpgrades.droneCargo = 2;
  s.cargo.nickel = 7;
  s.storage.iron = 55;
  s.research.escort = true;
  s.achievements.firstTrip = 1;
  s.stats.asteroids = 42;
  s.settings.volume = 0.3;
  g.act('buyDrone');
  s.drones[0].mode = 'escort';
  const json = serialize(s, 1000);
  const { state: t, savedAt } = deserialize(json);
  assert.equal(savedAt, 1000);
  for (const k of ['credits', 'level', 'xp', 'rp']) assert.equal(t[k], s[k], k);
  assert.deepEqual(t.upgrades, s.upgrades);
  assert.deepEqual(t.droneUpgrades, s.droneUpgrades);
  assert.deepEqual(t.cargo, s.cargo);
  assert.deepEqual(t.storage, s.storage);
  assert.deepEqual(t.research, s.research);
  assert.equal(t.drones.length, s.drones.length);
  assert.equal(t.drones[0].mode, 'escort');
  assert.equal(t.stats.asteroids, 42);
  assert.equal(t.settings.volume, 0.3);
  assert.deepEqual(t.missions.active.map((m) => m.title), s.missions.active.map((m) => m.title));
  // A restored game runs.
  const g2 = new GameEngine(t);
  run(g2, 1);

  assert.equal(deserialize('{not json'), null);
  assert.equal(deserialize('{"version":999}'), null);
  const bad = JSON.parse(json);
  bad.credits = -50;
  bad.upgrades.laserDamage = 9999;
  bad.cargo.iron = 1e9;
  bad.shipId = 'deathstar';
  bad.sector = 'void';
  const fixed = deserialize(JSON.stringify(bad)).state;
  assert.equal(fixed.credits, 0);
  assert.equal(fixed.upgrades.laserDamage, 15);
  assert.ok(cargoUsed(fixed.cargo) <= getStats(fixed).cargoCap);
  assert.equal(fixed.shipId, 'sparrow');
  assert.equal(fixed.sector, 'kepler', 'cannot load into an uncharted sector');
});

test('offline drone mining is credited to the silo and capped', () => {
  const s = createState();
  const short = applyOffline(s, 10);
  assert.equal(short, null, 'too short to count');
  const hour = applyOffline(createState(), 3600);
  assert.ok(hour.units > 0);
  const st = createState();
  const huge = applyOffline(st, 30 * 24 * 3600);
  assert.equal(huge.capped, 2 * 3600, 'capped at 2 hours');
  assert.ok(cargoUsed(st.storage) <= getStats(st).storageCap, 'silo cap respected');
});

test('pacing: a bot playing 5 minutes hits the early-game milestones', () => {
  const g = new GameEngine();
  const log = playBot(g, 300);
  const s = g.state;
  assert.ok(s.stats.sales >= 2, `sold ${s.stats.sales} loads`);
  assert.ok(s.stats.upgrades >= 2, `bought ${s.stats.upgrades} upgrades: ${log.join(', ')}`);
  assert.ok(s.drones.length >= 2, 'second drone deployed');
  assert.ok(s.missions.completed >= 4, `missions: ${s.missions.completed}`);
  assert.ok(s.level >= 3, `level ${s.level}`);
  assert.ok(s.ship.hull > 0);
});

test('escort drones follow the player and unload into the hold', () => {
  const g = quietEngine();
  const s = g.state;
  s.research.escort = true;
  s.ship.x = 1500;
  s.ship.y = 0;
  const d = s.drones[0];
  assert.ok(g.act('droneMode', d.id, 'escort').ok);
  for (let i = 0; i < 3; i++) spawnAsteroid(s, { x: 1560 + i * 25, y: 40, type: 'copper', size: 'small', vx: 0, vy: 0 });
  run(g, 120);
  assert.ok(Math.hypot(d.x - s.ship.x, d.y - s.ship.y) < 400, 'drone stays with the player');
  assert.ok(s.cargo.copper > 0, 'escort delivered into the ship hold');
  assert.equal(cargoUsed(s.storage), 0, 'nothing went to the station');
});

test('new ships need level and credits and change stats', () => {
  const g = quietEngine();
  const s = g.state;
  assert.equal(g.act('buyShip', 'prospector').ok, false);
  s.level = 5;
  s.credits = 10000;
  const cap = getStats(s).cargoCap;
  assert.ok(g.act('buyShip', 'prospector').ok);
  assert.equal(s.shipId, 'prospector');
  assert.ok(getStats(s).cargoCap > cap);
  assert.equal(s.credits, 4000);
  assert.ok(g.act('switchShip', 'sparrow').ok);
  assert.ok(g.act('switchShip', 'prospector').ok, 'owned ships swap for free');
  assert.equal(s.credits, 4000);
});

test('offline hauls keep the mineral mix when the silo fills up', () => {
  const st = createState();
  const off = applyOffline(st, 2 * 3600);
  assert.ok(off.siloFull);
  assert.ok(Object.keys(off.gained).length >= 2, `mix: ${JSON.stringify(off.gained)}`);
});
