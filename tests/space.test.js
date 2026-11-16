// SPACE MINER simulation tests. The engine has no DOM dependency, so the
// whole game runs headless in Node.
import test from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine } from '../src/engine/GameEngine.js';
import { createState, cargoUsed, getStats } from '../src/core/state.js';
import { EVENT_IDS, MARKET, RESOURCE_IDS, SIM_STEP, STATION, WEAPONS, xpToNext } from '../src/core/config.js';
import { spawnAsteroid } from '../src/systems/AsteroidManager.js';
import { spawnPickup } from '../src/systems/ResourceManager.js';
import { addXp, price, updateMarket } from '../src/systems/EconomyManager.js';
import { applyOffline, deserialize, serialize } from '../src/systems/SaveManager.js';
import { endEvent, startEvent } from '../src/systems/EventManager.js';
import { missionProgress } from '../src/systems/MissionManager.js';
import { upgradeInfo } from '../src/systems/UpgradeManager.js';
import { damageEnemy, spawnEnemy } from '../src/systems/CombatSystem.js';
import { playBot } from './space-miner-bot.js';

const IDLE = { mx: 0, my: 0, fire: false, shoot: false, boost: false, interact: false, ability: false, menuOpen: false };

// A quiet engine: no events, no patrols, an empty field.
function quietEngine() {
  const g = new GameEngine();
  g.state.nextEventAt = Infinity;
  g.state.nextPatrolAt = Infinity;
  g.state.asteroids.length = 0;
  g.state.respawnTimer = Infinity;
  return g;
}
const run = (g, seconds, input = IDLE) => {
  for (let i = 0; i < Math.round(seconds / SIM_STEP); i++) g.step(SIM_STEP, typeof input === 'function' ? input() : input);
  g.drainFx();
};
const aimAt = (o, extra = {}) => ({ ...IDLE, aimX: o.x, aimY: o.y, ...extra });

test('new game: starting loadout and a playable field', () => {
  const g = new GameEngine();
  const s = g.state;
  const st = getStats(s);
  assert.equal(s.credits, 1000);
  assert.equal(st.cargoCap, 100);
  assert.equal(s.drones.length, 1);
  assert.deepEqual(s.weapons, { blaster: 1 });
  assert.ok(s.asteroids.length > 300);
  const near = s.asteroids.filter((a) => Math.abs(a.x - s.ship.x) < 260 && Math.abs(a.y - s.ship.y) < 150);
  assert.ok(near.length >= 2, 'asteroids on screen at spawn');
  assert.ok(s.missions.active, 'one mission to start');
});

test('mining breaks rock into its exact yield, collecting fills the hold', () => {
  const g = quietEngine();
  g.state.drones.length = 0;
  const s = g.state;
  const a = spawnAsteroid(s, { x: s.ship.x, y: s.ship.y + 50, type: 'iron', size: 'medium', vx: 0, vy: 0 });
  const y = a.yield;
  run(g, 0.5, aimAt(a, { fire: true }));
  assert.ok(a.hp < a.maxHp);
  run(g, 5, aimAt(a, { fire: true }));
  assert.ok(!s.asteroids.includes(a));
  const total = s.pickups.reduce((n, p) => n + p.qty, 0) + cargoUsed(s.cargo);
  assert.equal(total, y);
  // Fly over the fragments.
  for (const p of s.pickups) {
    p.x = s.ship.x + 5;
    p.y = s.ship.y;
  }
  run(g, 1.5);
  assert.equal(cargoUsed(s.cargo), y);
});

test('a full hold refuses fragments', () => {
  const g = quietEngine();
  const s = g.state;
  s.drones.length = 0;
  s.cargo.iron = getStats(s).cargoCap;
  spawnPickup(s, s.ship.x + 5, s.ship.y, 'nickel', 4, 0);
  run(g, 1.5);
  assert.equal(cargoUsed(s.cargo), getStats(s).cargoCap);
  assert.equal(s.pickups.length, 1);
});

test('docking sells the hold automatically and repairs the ship', () => {
  const g = quietEngine();
  const s = g.state;
  s.cargo.iron = 20;
  s.cargo.crystal = 2;
  s.ship.hull = 10;
  assert.equal(g.act('sell', 'all').ok, false, 'cannot sell while flying');
  const expected = 20 * price(s, 'iron') + 2 * price(s, 'crystal');
  const before = s.credits;
  s.ship.x = 0;
  s.ship.y = STATION.dockRadius - 10;
  assert.ok(g.interact().ok);
  assert.ok(s.ship.docked);
  assert.equal(cargoUsed(s.cargo), 0);
  assert.ok(s.credits - before >= expected);
  run(g, 3);
  assert.equal(s.ship.hull, getStats(s).hullMax, 'free repair while docked');
});

test('prices fluctuate within bounds', () => {
  const s = createState();
  const base = { iron: 5, copper: 8, silicon: 12, nickel: 18, crystal: 50 };
  for (const r of RESOURCE_IDS) assert.equal(price(s, r), base[r]);
  for (let i = 0; i < 2000; i++) updateMarket(s, MARKET.interval);
  for (const r of RESOURCE_IDS) assert.ok(s.market[r].mult >= MARKET.min && s.market[r].mult <= MARKET.max);
});

test('upgrades cost credits and change gameplay', () => {
  const g = quietEngine();
  g.state.drones.length = 0;
  const s = g.state;
  const timeToBreak = () => {
    s.asteroids.length = 0;
    const a = spawnAsteroid(s, { x: s.ship.x, y: s.ship.y + 50, type: 'copper', size: 'large', vx: 0, vy: 0 });
    let t = 0;
    while (s.asteroids.includes(a) && t < 60) {
      g.step(SIM_STEP, aimAt(a, { fire: true }));
      s.ship.energy = 999;
      t += SIM_STEP;
    }
    return t;
  };
  const slow = timeToBreak();
  const cost = upgradeInfo(s, 'laser').cost;
  const credits = s.credits;
  assert.ok(g.act('buyUpgrade', 'laser').ok);
  assert.equal(s.credits, credits - cost);
  assert.ok(timeToBreak() < slow * 0.85);
  const cap = getStats(s).cargoCap;
  s.credits = 1e6;
  assert.ok(g.act('buyUpgrade', 'cargo').ok);
  assert.equal(getStats(s).cargoCap, cap + 50);
  s.credits = 0;
  assert.equal(g.act('buyUpgrade', 'engine').ok, false);
});

test('weapons: blaster kills an alien, shots never leak', () => {
  const g = quietEngine();
  const s = g.state;
  const e = spawnEnemy(s, 'swarmer', s.ship.x, s.ship.y + 120);
  e.vx = e.vy = 0;
  for (let i = 0; i < 300 && s.enemies.includes(e); i++) {
    e.x = s.ship.x;
    e.y = s.ship.y + 120;
    e.vx = e.vy = 0;
    g.step(SIM_STEP, aimAt(e, { shoot: true }));
  }
  assert.ok(!s.enemies.includes(e), 'alien destroyed');
  assert.equal(s.stats.aliens, 1);
  assert.ok(s.pickups.some((p) => p.type === 'credits'), 'drops credits');
  run(g, 3);
  assert.equal(s.shots.length, 0, 'shots expire');
});

test('buying, upgrading and switching weapons', () => {
  const g = quietEngine();
  const s = g.state;
  assert.equal(g.act('buyWeapon', 'scatter').ok, false, 'level locked');
  s.level = 3;
  s.credits = 100000;
  assert.ok(g.act('buyWeapon', 'scatter').ok);
  assert.equal(s.weapon, 'scatter', 'auto-equips');
  const dmg = getStats(s).weapon.dmg;
  assert.ok(g.act('buyWeapon', 'scatter').ok);
  assert.equal(s.weapons.scatter, 2);
  assert.ok(getStats(s).weapon.dmg > dmg);
  // Scatter fires 5 pellets.
  run(g, 0.05, { ...IDLE, shoot: true });
  assert.equal(s.shots.filter((x) => x.team === 'player').length, WEAPONS.scatter.count);
  // Switch via input.
  run(g, 0.05, { ...IDLE, weapon: 'blaster' });
  assert.equal(s.weapon, 'blaster');
  run(g, 0.05, { ...IDLE, weapon: 'rail' });
  assert.equal(s.weapon, 'blaster', 'cannot equip an unowned weapon');
});

test('missiles home in and explode', () => {
  const g = quietEngine();
  const s = g.state;
  s.level = 5;
  s.credits = 1e6;
  g.act('buyWeapon', 'missiles');
  const e = spawnEnemy(s, 'spitter', s.ship.x + 160, s.ship.y + 60);
  e.hp = e.maxHp = 30;
  run(g, 0.1, aimAt({ x: s.ship.x + 160, y: s.ship.y }, { shoot: true }));
  run(g, 3, () => {
    e.vx = e.vy = 0;
    return IDLE;
  });
  assert.ok(!s.enemies.includes(e), 'missile found its target');
});

test('aliens attack: rammers and shooters hurt the player', () => {
  const g = quietEngine();
  const s = g.state;
  s.ship.invuln = 0;
  s.ship.x = 1500; // away from the station turret
  spawnEnemy(s, 'swarmer', s.ship.x + 60, s.ship.y);
  spawnEnemy(s, 'spitter', s.ship.x - 200, s.ship.y);
  const hp = s.ship.hull + s.ship.shield;
  run(g, 6);
  assert.ok(s.ship.hull + s.ship.shield < hp, 'took damage');
});

test('alien patrols arrive on their own', () => {
  const g = new GameEngine();
  const s = g.state;
  s.nextEventAt = Infinity;
  s.nextPatrolAt = s.time + 1;
  run(g, 2);
  assert.ok(s.enemies.length >= 2);
});

test('station turret defends the docking area', () => {
  const g = quietEngine();
  const s = g.state;
  s.ship.x = 1500;
  const e = spawnEnemy(s, 'swarmer', 150, 0);
  for (let i = 0; i < 400 && s.enemies.includes(e); i++) {
    e.x = 150;
    e.y = 0;
    g.step(SIM_STEP, IDLE);
  }
  assert.ok(!s.enemies.includes(e));
});

test('kill combos multiply rewards', () => {
  const g = quietEngine();
  const s = g.state;
  const payout = () => {
    s.pickups.length = 0;
    const e = spawnEnemy(s, 'swarmer', 900, 900);
    damageEnemy(s, e, 1e6);
    return s.pickups.find((p) => p.type === 'credits').qty;
  };
  const first = payout();
  for (let i = 0; i < 3; i++) payout();
  const fifth = payout();
  assert.equal(s.combo.count, 5);
  assert.ok(fifth >= first * 1.9, `${first} -> ${fifth}`);
  run(g, 5);
  assert.equal(s.combo.count, 0, 'combo expires');
});

test('invasion: three waves then a reward', () => {
  const g = quietEngine();
  const s = g.state;
  s.level = 4;
  startEvent(s, 'invasion');
  const credits = s.credits;
  for (let wave = 1; wave <= 3; wave++) {
    assert.equal(s.event.wave, wave);
    for (const e of [...s.enemies]) damageEnemy(s, e, 1e6);
    run(g, 0.3);
  }
  assert.equal(s.event, null, 'event over');
  assert.ok(s.credits > credits, 'victory bonus');
});

test('the mothership boss spawns minions and can be destroyed', () => {
  const g = quietEngine();
  const s = g.state;
  s.level = 6;
  startEvent(s, 'mothership');
  const boss = s.enemies.find((e) => e.kind === 'mothership');
  assert.ok(boss);
  boss.x = s.ship.x + 300;
  boss.y = s.ship.y;
  run(g, 8, () => {
    s.ship.hull = 999;
    return IDLE;
  });
  assert.ok(s.enemies.some((e) => e.kind === 'swarmer'), 'launches swarmers');
  boss.hp = 1;
  boss.x = s.ship.x;
  boss.y = s.ship.y + 60;
  run(g, 1, () => {
    s.ship.hull = 999;
    return aimAt(boss, { shoot: true });
  });
  assert.equal(s.stats.bosses, 1);
  run(g, 0.5);
  assert.equal(s.event, null);
});

test('every event starts and ends cleanly', () => {
  for (const id of EVENT_IDS) {
    const g = quietEngine();
    const s = g.state;
    s.level = 10;
    assert.ok(startEvent(s, id).ok, id);
    run(g, 3, () => {
      s.ship.hull = 999;
      return IDLE;
    });
    endEvent(s);
    run(g, 20, () => {
      s.ship.hull = 999;
      return IDLE;
    });
    assert.equal(s.event, null);
  }
});

test('shockwave damages everything nearby and clears enemy shots', () => {
  const g = quietEngine();
  const s = g.state;
  const e = spawnEnemy(s, 'spitter', s.ship.x + 50, s.ship.y);
  const hp = e.hp;
  s.shots.push({ team: 'enemy', x: s.ship.x + 30, y: s.ship.y, vx: 0, vy: 0, life: 5, dmg: 5, color: '#fff' });
  run(g, 0.05, { ...IDLE, ability: true });
  assert.ok(e.hp < hp || !s.enemies.includes(e));
  assert.equal(s.shots.filter((x) => x.team === 'enemy').length, 0);
  assert.ok(s.ship.pulseCd > 0);
});

test('cockpit controls: turning and thrusting along the nose', () => {
  const g = quietEngine();
  const s = g.state;
  const a0 = s.ship.angle;
  run(g, 0.5, { ...IDLE, turn: 1, turnDelta: 0 });
  assert.ok(s.ship.angle > a0 + 1);
  const x = s.ship.x;
  const y = s.ship.y;
  run(g, 1, () => ({ ...IDLE, turn: 0, mx: Math.cos(s.ship.angle), my: Math.sin(s.ship.angle) }));
  const moved = Math.hypot(s.ship.x - x, s.ship.y - y);
  const along = ((s.ship.x - x) * Math.cos(s.ship.angle) + (s.ship.y - y) * Math.sin(s.ship.angle)) / moved;
  assert.ok(moved > 40 && along > 0.95, 'flies where the nose points');
});

test('drones mine and haul to the station silo', () => {
  const g = quietEngine();
  const s = g.state;
  for (let i = 0; i < 4; i++) spawnAsteroid(s, { x: 150 + i * 30, y: -120, type: 'iron', size: 'small', vx: 0, vy: 0 });
  s.ship.x = 2000;
  run(g, 150);
  assert.ok(cargoUsed(s.storage) > 0);
  assert.ok(g.act('sell', 'all', 'storage').ok, 'silo sells remotely');
});

test('one mission at a time, paid on completion', () => {
  const g = quietEngine();
  const s = g.state;
  const m = s.missions.active;
  assert.equal(m.kind, 'collect');
  const credits = s.credits;
  s.stats.byRes.iron += 4;
  assert.equal(missionProgress(s, m), 4);
  s.stats.byRes.iron += 10;
  run(g, 0.5);
  assert.notEqual(s.missions.active, m);
  assert.ok(s.credits >= credits + m.credits);
  assert.equal(s.missions.completed, 1);
});

test('levels, ships and sectors', () => {
  const g = quietEngine();
  const s = g.state;
  addXp(s, xpToNext(1));
  assert.ok(s.level >= 2);
  assert.equal(g.act('buyShip', 'prospector').ok, false);
  s.level = 9;
  s.credits = 1e6;
  assert.ok(g.act('buyShip', 'prospector').ok);
  assert.ok(getStats(s).weapon.dmg > WEAPONS.blaster.dmg, 'bigger hull, bigger guns');
  assert.ok(g.act('travel', 'cobalt').ok);
  assert.equal(s.sector, 'cobalt');
  assert.equal(g.act('travel', 'void').ok, false);
});

test('save/load round-trips and repairs bad data', () => {
  const g = quietEngine();
  const s = g.state;
  s.credits = 4321;
  s.level = 6;
  s.upgrades.laser = 3;
  s.weapons.scatter = 2;
  s.weapon = 'scatter';
  s.cargo.nickel = 7;
  s.storage.iron = 55;
  s.settings.view = 'cockpit';
  s.stats.aliens = 12;
  const { state: t } = deserialize(serialize(s, 1000));
  for (const k of ['credits', 'level', 'weapon']) assert.equal(t[k], s[k]);
  assert.deepEqual(t.weapons, s.weapons);
  assert.deepEqual(t.upgrades, s.upgrades);
  assert.deepEqual(t.cargo, s.cargo);
  assert.equal(t.settings.view, 'cockpit');
  assert.equal(t.stats.aliens, 12);
  assert.equal(t.missions.active.title, s.missions.active.title);
  run(new GameEngine(t), 1);
  assert.equal(deserialize('{nope'), null);
  const bad = JSON.parse(serialize(s));
  bad.credits = -5;
  bad.weapons = { rail: 99, laserCannon: 3 };
  bad.weapon = 'laserCannon';
  bad.cargo.iron = 1e9;
  const f = deserialize(JSON.stringify(bad)).state;
  assert.equal(f.credits, 0);
  assert.equal(f.weapons.rail, 6);
  assert.equal(f.weapons.laserCannon, undefined);
  assert.notEqual(f.weapon, 'laserCannon');
  assert.ok(cargoUsed(f.cargo) <= getStats(f).cargoCap);
});

test('offline drone mining is capped by time and silo', () => {
  assert.equal(applyOffline(createState(), 10), null);
  const st = createState();
  const off = applyOffline(st, 30 * 24 * 3600);
  assert.equal(off.capped, 3 * 3600);
  assert.ok(cargoUsed(st.storage) <= getStats(st).storageCap);
  assert.ok(Object.keys(off.gained).length >= 2);
});

test('pacing: a bot playing 5 minutes mines, fights and grows', () => {
  const g = new GameEngine();
  const log = playBot(g, 300);
  const s = g.state;
  assert.ok(s.stats.sales >= 2, `sales ${s.stats.sales}`);
  assert.ok(s.stats.aliens >= 3, `aliens ${s.stats.aliens}`);
  assert.ok(s.stats.upgrades >= 2, log.join(', '));
  assert.ok(s.missions.completed >= 3, `missions ${s.missions.completed}`);
  assert.ok(s.level >= 3, `level ${s.level}`);
});
