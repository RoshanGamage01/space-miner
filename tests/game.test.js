// Logic tests for SPACE MINER: Beyond the Silence. The universe generator,
// economy, story and save system have no rendering dependency, so they run
// headless in Node.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fbm, hash32, mulberry, simplex3 } from '../src/core/rng.js';
import { genSystem, starAt, STORY_SYSTEMS } from '../src/universe/galaxy.js';
import { CELLS, Planet, dirToFace, faceDir, getPlanet } from '../src/universe/planet.js';
import { BIOMES, COSMETICS, FACTIONS, ITEMS, RECIPES, UPGRADES, upgradeCost } from '../src/universe/data.js';
import { addItem, buy, buyPrice, buyUpgrade, count, craft, derived, deserialize, newGame, removeItem, sell, sellPrice, serialize, setCosmetic, stackCap, stockFor } from '../src/game/state.js';
import { QUESTS, bountyReady, claimBounty, currentStep, dialogueFor, randomBounty, storyEvent } from '../src/game/story.js';

test('noise is deterministic and bounded', () => {
  assert.equal(hash32('a', 1, 2), hash32('a', 1, 2));
  assert.notEqual(hash32('a', 1, 2), hash32('a', 2, 1));
  const r1 = mulberry(42);
  const r2 = mulberry(42);
  for (let i = 0; i < 10; i++) assert.equal(r1(), r2());
  let lo = 1, hi = -1;
  for (let i = 0; i < 5000; i++) {
    const v = simplex3(i * 0.37, i * 0.11, i * 0.73);
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  assert.ok(lo > -1.1 && hi < 1.1 && hi - lo > 1, `simplex range ${lo}..${hi}`);
  assert.equal(fbm(1.5, 2.5, 3.5, 4), fbm(1.5, 2.5, 3.5, 4));
});

test('the galaxy is endless and repeatable', () => {
  const a = genSystem(37, -12);
  const b = genSystem(37, -12);
  assert.deepEqual(a.planets.map((p) => p.name), b.planets.map((p) => p.name));
  assert.ok(a.planets.length >= 2 && a.planets.length <= 5);
  const names = new Set();
  for (let x = -20; x < 20; x++) for (let y = -20; y < 20; y++) names.add(starAt(x, y).id);
  assert.equal(names.size, 1600);
  for (const far of [[100000, -250000], [-9999999, 42]]) {
    const s = genSystem(...far);
    assert.ok(s.planets.length >= 2 && s.name.length > 2);
    for (const p of s.planets) assert.ok(BIOMES[p.type] && p.radius > 600 && p.pos.every(Number.isFinite));
  }
});

test('story systems exist with their kingdoms and key sites', () => {
  const home = genSystem(0, 0);
  assert.equal(home.name, "Haven's Reach");
  assert.deepEqual(home.planets[0].sites.map((s) => s.type).sort(), ['crash', 'ruins', 'village']);
  assert.equal(home.planets[1].sites[0].type, 'capital');
  const want = { [STORY_SYSTEMS.grumm]: 'grumm', [STORY_SYSTEMS.vesh]: 'vesh' };
  for (const id in want) {
    const [x, y] = id.split(',').map(Number);
    const s = genSystem(x, y);
    assert.equal(s.faction, want[id]);
    assert.ok(s.planets[0].sites.some((q) => q.type === 'capital' && q.faction === want[id]));
  }
  assert.ok(genSystem(1, 1).planets[0].sites.some((s) => s.type === 'gate'));
  // Every mission marker points at something that exists.
  for (const q of QUESTS) for (const st of q.steps) {
    const m = st.mark;
    if (!m || !m.site) continue;
    const [x, y] = m.system.split(',').map(Number);
    const pl = genSystem(x, y).planets[m.planet];
    assert.ok(getPlanet(pl).sites.some((s) => s.type === m.site), `${q.id}: ${st.text}`);
  }
});

test('planets: cube-sphere mapping round-trips', () => {
  for (let f = 0; f < 6; f++) for (const [u, v] of [[0, 0], [0.5, -0.3], [-0.9, 0.9]]) {
    const d = faceDir(f, u, v);
    assert.ok(Math.abs(Math.hypot(...d) - 1) < 1e-9);
    const b = dirToFace(...d);
    assert.equal(b.face, f);
    assert.ok(Math.abs(b.u - u) < 1e-9 && Math.abs(b.v - v) < 1e-9);
  }
});

test('planets: terrain is continuous, sites are flat, dry and apart', () => {
  const sys = genSystem(0, 0);
  for (const desc of sys.planets) {
    const p = getPlanet(desc);
    // Neighbouring samples never jump: no cliffs out of nowhere.
    for (let i = 0; i < 300; i++) {
      const d = faceDir(i % 6, Math.sin(i) * 0.9, Math.cos(i * 1.7) * 0.9);
      const e = [d[0] + 0.5 / p.radius, d[1], d[2]];
      const l = Math.hypot(...e);
      const h1 = p.height(...d);
      const h2 = p.height(e[0] / l, e[1] / l, e[2] / l);
      assert.ok(Math.abs(h1 - h2) < 4, `${desc.name} jump ${h1} -> ${h2}`);
    }
    assert.equal(p.sites.length, desc.sites.length);
    for (const s of p.sites) {
      assert.ok(Math.abs(p.height(...s.dir) - s.h) < 0.01, 'plateau height');
      if (p.hasWater) assert.ok(s.h >= 6, `${desc.name} ${s.type} is above water`);
      // Flat across the settlement.
      const up = Math.abs(s.dir[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
      const t = [up[1] * s.dir[2] - up[2] * s.dir[1], up[2] * s.dir[0] - up[0] * s.dir[2], up[0] * s.dir[1] - up[1] * s.dir[0]];
      const tl = Math.hypot(...t);
      const off = (s.radius * 0.8) / p.radius;
      const q = [s.dir[0] + (t[0] / tl) * off, s.dir[1] + (t[1] / tl) * off, s.dir[2] + (t[2] / tl) * off];
      const ql = Math.hypot(...q);
      assert.ok(Math.abs(p.height(q[0] / ql, q[1] / ql, q[2] / ql) - s.h) < 0.5, 'flat plateau');
    }
    for (const a of p.sites) for (const b of p.sites) {
      if (a === b || a.type === 'crash' || b.type === 'crash') continue;
      const d = Math.acos(Math.min(1, a.dir[0] * b.dir[0] + a.dir[1] * b.dir[1] + a.dir[2] * b.dir[2])) * p.radius;
      assert.ok(d > 500, `sites ${d.toFixed(0)}m apart`);
    }
  }
  // The crash site is a short walk from the starting village, in daylight.
  const verdis = getPlanet(sys.planets[0]);
  const crash = verdis.sites.find((s) => s.type === 'crash');
  const village = verdis.sites.find((s) => s.type === 'village');
  const walk = Math.acos(crash.dir[0] * village.dir[0] + crash.dir[1] * village.dir[1] + crash.dir[2] * village.dir[2]) * verdis.radius;
  assert.ok(walk > 150 && walk < 450, `walk ${walk}`);
  const L = Math.hypot(...sys.planets[0].pos);
  const sun = sys.planets[0].pos.map((v) => -v / L);
  assert.ok(crash.dir[0] * sun[0] + crash.dir[1] * sun[1] + crash.dir[2] * sun[2] > 0.5, 'sun is up at the start');
});

test('planets: props are deterministic, on dry ground and minable', () => {
  const p = new Planet(genSystem(0, 0).planets[0]);
  const c = p.cellOf(...p.sites[0].dir);
  const types = {};
  let total = 0;
  for (let di = -3; di <= 3; di++) for (let dj = -3; dj <= 3; dj++) {
    const i = (c.i + di + CELLS) % CELLS;
    const j = (c.j + dj + CELLS) % CELLS;
    const a = p.propsForCell(c.face, i, j);
    assert.deepEqual(a.map((x) => x.id), p.propsForCell(c.face, i, j).map((x) => x.id));
    for (const q of a) {
      total++;
      types[q.type] = (types[q.type] || 0) + 1;
      assert.ok(ITEMS[q.res] && q.amount > 0 && q.hp > 0);
      assert.ok(p.height(...q.dir) >= 1.2, 'not under water');
      assert.equal(p.siteAt(...q.dir, 1.15), null, 'not inside a settlement');
      assert.ok(Math.abs(Math.hypot(...q.pos) - p.groundRadius(...q.dir)) < 0.01, 'sits on the ground');
    }
  }
  assert.ok(total > 60, `props ${total}`);
  assert.ok(types.tree > 10 && types.rock > 10, JSON.stringify(types));
  // A barren world grows nothing but still has ore.
  const barren = new Planet(genSystem(0, 0).planets[2]);
  const b = barren.propsForCell(0, 5, 5).concat(barren.propsForCell(0, 6, 5), barren.propsForCell(0, 7, 5));
  assert.ok(b.every((q) => q.type !== 'tree' && q.type !== 'bush') && b.some((q) => q.type === 'rock'));
});

test('inventory: stacks, caps and crafting', () => {
  const s = newGame();
  assert.equal(addItem(s, 'ferrite', 100), 100);
  assert.equal(addItem(s, 'ferrite', 1000), stackCap(s, 'ferrite') - 100);
  assert.equal(addItem(s, 'nonsense', 5), 0);
  assert.equal(removeItem(s, 'ferrite', 9999), false);
  assert.ok(removeItem(s, 'ferrite', 50));
  s.upgrades.cargo = 2;
  assert.equal(stackCap(s, 'ferrite'), 550);
  assert.equal(craft(s, 'warpCell').ok, false);
  for (const k in RECIPES.warpCell.cost) addItem(s, k, RECIPES.warpCell.cost[k]);
  assert.ok(craft(s, 'warpCell').ok);
  assert.equal(count(s, 'warpCell'), 1);
  assert.equal(count(s, 'aetherium'), 0);
});

test('trade: buy low, sell high, kingdoms have wants', () => {
  const s = newGame();
  const home = genSystem(0, 0);
  const karg = genSystem(1, 0);
  s.units = 100000;
  assert.equal(buy(s, 'shardValor', 1, home).ok, false);
  assert.equal(buy(s, 'ale', 1, home).ok, false, 'Grumm ale is not sold in Thalori space');
  const p = buyPrice(s, 'silk', home);
  assert.ok(buy(s, 'silk', 10, home).ok);
  assert.equal(s.units, 100000 - p * 10);
  // Thalori silk is cheap at home and the Grumm crave it.
  assert.ok(sellPrice(s, 'silk', karg) > p * 1.5, 'a real trade route');
  const before = s.units;
  const r = sell(s, 'silk', 999, karg);
  assert.ok(r.ok && s.units === before + r.gain && count(s, 'silk') === 0);
  assert.ok(s.rep.grumm > 0, 'trading builds reputation');
  assert.equal(sell(s, 'silk', 1, karg).ok, false);
  for (const sys of [home, karg, genSystem(9, 9)]) for (const id of stockFor(sys)) {
    assert.ok(sellPrice(s, id, sys) < buyPrice({ ...s, rep: {} }, id, sys), 'no free money');
  }
  s.units = 0;
  assert.equal(buy(s, 'copper', 1, home).ok, false);
});

test('upgrades and cosmetics cost units and change the numbers', () => {
  const s = newGame();
  const d0 = derived(s);
  assert.equal(buyUpgrade(s, 'mining').ok, false);
  s.units = 1e6;
  for (const id in UPGRADES) {
    for (let i = 0; i < UPGRADES[id].max; i++) assert.ok(buyUpgrade(s, id).ok);
    assert.equal(buyUpgrade(s, id).ok, false, 'max level');
  }
  const d1 = derived(s);
  for (const k of Object.keys(d0)) assert.ok(d1[k] > d0[k], k);
  assert.ok(upgradeCost('mining', 3) > upgradeCost('mining', 0));
  const u = s.units;
  assert.ok(setCosmetic(s, 'ship', 'crimson').ok);
  assert.equal(s.units, u - COSMETICS.ship.find((c) => c.id === 'crimson').cost);
  assert.ok(setCosmetic(s, 'ship', 'steel').ok);
  assert.ok(setCosmetic(s, 'ship', 'crimson').ok);
  assert.equal(s.units, u - 800, 'owned styles are free to re-equip');
  assert.equal(setCosmetic(s, 'ship', 'rainbow').ok, false);
});

test('the whole story can be played through', () => {
  const s = newGame();
  const ev = (type, data) => storyEvent(s, type, data);
  const step = () => currentStep(s).text;
  // Act 1: wreckage.
  assert.match(step(), /Ferrite/);
  assert.equal(ev('tick').length, 0);
  addItem(s, 'ferrite', 30);
  ev('tick');
  assert.match(step(), /Carbon/);
  addItem(s, 'carbon', 20);
  ev('tick');
  assert.match(step(), /Repair/);
  removeItem(s, 'ferrite', 10);
  assert.equal(ev('interact', { what: 'repair' })[0].type, 'lack');
  addItem(s, 'ferrite', 10);
  ev('interact', { what: 'repair' });
  assert.ok(s.flags.shipRepaired && count(s, 'ferrite') === 0);
  assert.equal(ev('talk', { role: 'arbiter' }).length, 0, 'wrong character');
  assert.ok(dialogueFor(s, 'elder').story);
  const units = s.units;
  const out = ev('talk', { role: 'elder' });
  assert.ok(out.some((e) => e.type === 'questDone') && out.some((e) => e.type === 'questStart'));
  assert.ok(s.units > units && s.rep.thalori > 0);
  // Act 2: skyward and the three shards.
  ev('space');
  ev('dock');
  ev('talk', { role: 'envoy' });
  assert.equal(QUESTS[s.quest.q].id, 'accord');
  assert.equal(ev('arrive', { site: 'capital', system: '1,0' }).length, 0, 'wrong capital');
  ev('arrive', { site: 'capital', system: '0,0' });
  ev('talk', { role: 'arbiter' });
  assert.equal(ev('talk', { role: 'arbiter' })[0].type, 'lack');
  assert.equal(dialogueFor(s, 'arbiter').story, false);
  addItem(s, 'copper', 25);
  addItem(s, 'gold', 4);
  ev('talk', { role: 'arbiter' });
  assert.equal(count(s, 'shardCommerce'), 1);
  assert.equal(count(s, 'warpCell'), 2);
  assert.equal(ev('system', { system: '0,1' }).length, 0);
  ev('system', { system: '1,0' });
  ev('talk', { role: 'warchief' });
  for (let i = 0; i < 5; i++) assert.equal(ev('kill', { kind: 'raider' })[0].type, 'progress');
  assert.equal(ev('kill', { kind: 'sentinel' }).length, 0);
  ev('kill', { kind: 'raider' });
  ev('talk', { role: 'warchief' });
  assert.equal(count(s, 'shardValor'), 1);
  ev('system', { system: '0,1' });
  ev('talk', { role: 'choir' });
  ev('interact', { what: 'relic' });
  assert.ok(s.flags.echoCore);
  ev('talk', { role: 'choir' });
  assert.equal(count(s, 'shardMemory'), 1);
  // Act 3: the Gate.
  ev('system', { system: '1,1' });
  ev('arrive', { site: 'gate', system: '1,1' });
  ev('kill', { kind: 'warden' });
  const end = ev('interact', { what: 'gate' });
  assert.ok(end.some((e) => e.type === 'questDone'));
  assert.equal(currentStep(s), null, 'story complete');
  assert.deepEqual(ev('tick'), []);
});

test('contracts: bring and hunt', () => {
  const s = newGame();
  s.bounty = { kind: 'bring', item: 'copper', n: 20, faction: 'grumm', units: 280, text: 'Bring 20 copper' };
  assert.equal(bountyReady(s), false);
  assert.equal(claimBounty(s), null);
  addItem(s, 'copper', 25);
  const u = s.units;
  assert.ok(claimBounty(s));
  assert.equal(s.units, u + 280);
  assert.equal(count(s, 'copper'), 5);
  assert.equal(s.bounty, null);
  const r = mulberry(7);
  for (let i = 0; i < 30; i++) {
    const b = randomBounty(r, 'vesh');
    assert.ok(b.units > 0 && b.text.length > 5 && (b.kind === 'hunt' || ITEMS[b.item]));
  }
});

test('saving round-trips and survives corruption', () => {
  const s = newGame();
  s.units = 4321;
  addItem(s, 'gold', 12);
  s.upgrades.jetpack = 2;
  s.quest = { q: 3, s: 2, n: 4 };
  s.flags.shipRepaired = true;
  s.rep.vesh = 33;
  s.systemId = '-4,17';
  s.ship = { planet: 1, dir: [0, 1, 0] };
  s.where = { dir: [1, 0, 0] };
  s.lore.push('"A fair price is a kind of prayer."');
  setCosmetic(s, 'visor', 'cyan');
  s.settings.view = 'third';
  const t = deserialize(serialize(s));
  for (const k of ['units', 'systemId']) assert.equal(t[k], s[k]);
  assert.deepEqual(t.inv, s.inv);
  assert.deepEqual(t.quest, s.quest);
  assert.deepEqual(t.ship, s.ship);
  assert.deepEqual(t.where, s.where);
  assert.equal(t.rep.vesh, 33);
  assert.equal(t.settings.view, 'third');
  assert.equal(t.flags.shipRepaired, true);
  assert.equal(deserialize('{broken'), null);
  assert.equal(deserialize('{"version":99}'), null);
  const bad = JSON.parse(serialize(s));
  bad.units = -100;
  bad.inv = { gold: 1e12, plutonium: 5 };
  bad.upgrades.jetpack = 99;
  bad.systemId = '<script>';
  bad.ship = { planet: 1, dir: [NaN, 0, 0] };
  bad.cosmetics.sel.ship = 'rainbow';
  bad.settings.quality = 'insane';
  const f = deserialize(JSON.stringify(bad));
  assert.equal(f.units, 0);
  assert.equal(f.inv.plutonium, undefined);
  assert.ok(f.inv.gold <= 5000);
  assert.equal(f.upgrades.jetpack, UPGRADES.jetpack.max);
  assert.equal(f.systemId, '0,0');
  assert.equal(f.ship, null);
  assert.equal(f.cosmetics.sel.ship, 'steel');
  assert.equal(f.settings.quality, 'high');
  assert.ok(FACTIONS.thalori && f.rep.thalori >= 0);
});
