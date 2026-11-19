// Player progress: inventory, crafting, trading, upgrades, cosmetics, saving.
// Pure data and functions, shared by the game and the tests.
import { hash32, mulberry } from '../core/rng.js';
import { COSMETICS, FACTIONS, ITEMS, RECIPES, STACK_BASE, UPGRADES, upgradeCost } from '../universe/data.js';

export const SAVE_KEY = 'space-miner-3d.save.v1';
export const SAVE_VERSION = 1;

export function newGame() {
  return {
    version: SAVE_VERSION,
    units: 300,
    inv: {},
    upgrades: {},
    cosmetics: { owned: { suit: ['white'], visor: ['cyan'], ship: ['steel'], trail: ['cyan'] }, sel: { suit: 'white', visor: 'cyan', ship: 'steel', trail: 'cyan' } },
    rep: { thalori: 0, grumm: 0, vesh: 0 },
    quest: { q: 0, s: 0, n: 0 },
    flags: {},
    bounty: null,
    lore: [],
    systemId: '0,0',
    planet: 0,
    where: null, // { dir:[x,y,z] } last on-foot position
    ship: null, // { planet, dir:[x,y,z] } where the ship is parked
    stats: { mined: 0, kills: 0, jumps: 0, playTime: 0, planets: {}, systems: { '0,0': 1 }, earned: 0 },
    settings: { quality: 'high', volume: 0.6, music: true, invertY: false, view: 'first' },
  };
}

const fail = (reason) => ({ ok: false, reason });
export const count = (s, item) => s.inv[item] || 0;
export const stackCap = (s, item) => (ITEMS[item]?.key ? 99 : STACK_BASE + 150 * (s.upgrades.cargo || 0));

// Adds up to n of an item. Returns how many fit.
export function addItem(s, item, n) {
  if (!ITEMS[item] || n <= 0) return 0;
  const add = Math.max(0, Math.min(n, stackCap(s, item) - count(s, item)));
  if (add > 0) s.inv[item] = count(s, item) + add;
  return add;
}

export function removeItem(s, item, n) {
  if (count(s, item) < n) return false;
  s.inv[item] -= n;
  if (s.inv[item] <= 0) delete s.inv[item];
  return true;
}

export const canAfford = (s, cost) => Object.keys(cost).every((k) => count(s, k) >= cost[k]);

export function craft(s, id) {
  const r = RECIPES[id];
  if (!r) return fail('Unknown recipe');
  if (!canAfford(s, r.cost)) return fail('Missing materials');
  if (count(s, id) + r.out > stackCap(s, id)) return fail('No room');
  for (const k in r.cost) removeItem(s, k, r.cost[k]);
  addItem(s, id, r.out);
  return { ok: true };
}

// ------------------------------------------------------------ trade
// Prices vary by system; each kingdom sells its own good cheap and pays a
// premium for the good it craves. Selling returns 80% of the buy price.
export function buyPrice(s, item, sys) {
  const base = ITEMS[item].value;
  const r = mulberry(hash32('price', sys.seed, item));
  let m = 0.75 + r() * 0.6;
  const f = sys.faction && FACTIONS[sys.faction];
  if (f) {
    if (f.good === item) m = 0.55;
    if (f.wants === item) m = 1.9;
  }
  const rep = sys.faction ? s.rep[sys.faction] || 0 : 0;
  return Math.max(1, Math.round(base * m * (1 - Math.min(0.15, rep * 0.01))));
}
export const sellPrice = (s, item, sys) => Math.max(1, Math.round(buyPrice({ ...s, rep: {} }, item, sys) * 0.8));

export function stockFor(sys) {
  const stock = ['ferrite', 'carbon', 'copper', 'sodium', 'oxygen', 'silicate', 'medkit', 'warpCell'];
  if (sys.faction) stock.push(FACTIONS[sys.faction].good);
  return stock;
}

export function buy(s, item, n, sys) {
  if (!ITEMS[item] || ITEMS[item].key) return fail('Not for sale');
  if (!stockFor(sys).includes(item)) return fail('Not sold here');
  n = Math.floor(n);
  if (n <= 0) return fail('Nothing to buy');
  const cost = buyPrice(s, item, sys) * n;
  if (s.units < cost) return fail('Not enough units');
  if (count(s, item) + n > stackCap(s, item)) return fail('No room');
  s.units -= cost;
  addItem(s, item, n);
  return { ok: true, cost };
}

export function sell(s, item, n, sys) {
  if (!ITEMS[item] || ITEMS[item].key) return fail('Cannot sell that');
  n = Math.min(Math.floor(n), count(s, item));
  if (n <= 0) return fail('Nothing to sell');
  const gain = sellPrice(s, item, sys) * n;
  removeItem(s, item, n);
  s.units += gain;
  s.stats.earned += gain;
  if (sys.faction) s.rep[sys.faction] = Math.min(100, (s.rep[sys.faction] || 0) + gain / 2500);
  return { ok: true, gain };
}

// ------------------------------------------------------------ upgrades
export const level = (s, id) => s.upgrades[id] || 0;
export function buyUpgrade(s, id) {
  const u = UPGRADES[id];
  if (!u) return fail('Unknown upgrade');
  const lv = level(s, id);
  if (lv >= u.max) return fail('Fully upgraded');
  const cost = upgradeCost(id, lv);
  if (s.units < cost) return fail('Not enough units');
  s.units -= cost;
  s.upgrades[id] = lv + 1;
  return { ok: true, cost };
}

// Derived numbers used by the simulation.
export function derived(s) {
  return {
    mineRate: 14 * (1 + 0.45 * level(s, 'mining')),
    boltDamage: 16 * (1 + 0.4 * level(s, 'blaster')),
    jetFuel: 3.2 + 1.3 * level(s, 'jetpack'),
    shieldMax: 60 + 30 * level(s, 'shield'),
    hazardTime: 170 + 80 * level(s, 'hazard'),
    shipHull: 300 + 150 * level(s, 'hull'),
    shipDamage: 26 * (1 + 0.4 * level(s, 'cannon')),
  };
}

// ------------------------------------------------------------ cosmetics
export function cosmetic(slot, id) {
  return COSMETICS[slot]?.find((c) => c.id === id) || COSMETICS[slot][0];
}
export function setCosmetic(s, slot, id) {
  const c = COSMETICS[slot]?.find((x) => x.id === id);
  if (!c) return fail('Unknown style');
  if (!s.cosmetics.owned[slot].includes(id)) {
    if (s.units < c.cost) return fail('Not enough units');
    s.units -= c.cost;
    s.cosmetics.owned[slot].push(id);
  }
  s.cosmetics.sel[slot] = id;
  return { ok: true };
}

// ------------------------------------------------------------ persistence
export function serialize(s) {
  return JSON.stringify({ ...s, savedAt: Date.now() });
}

// Rebuild a save on top of fresh defaults, dropping anything malformed.
export function deserialize(json) {
  let d;
  try {
    d = typeof json === 'string' ? JSON.parse(json) : json;
  } catch {
    return null;
  }
  if (!d || d.version !== SAVE_VERSION) return null;
  const s = newGame();
  const num = (v, def, lo = 0, hi = 1e12) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : def);
  s.units = Math.floor(num(d.units, s.units));
  if (d.inv && typeof d.inv === 'object') for (const k in ITEMS) {
    const n = Math.floor(num(d.inv[k], 0, 0, 100000));
    if (n > 0) s.inv[k] = Math.min(n, 5000);
  }
  if (d.upgrades) for (const k in UPGRADES) s.upgrades[k] = Math.floor(num(d.upgrades[k], 0, 0, UPGRADES[k].max));
  if (d.cosmetics) for (const slot in COSMETICS) {
    const ids = COSMETICS[slot].map((c) => c.id);
    const owned = (d.cosmetics.owned?.[slot] || []).filter((x) => ids.includes(x));
    s.cosmetics.owned[slot] = [...new Set([COSMETICS[slot][0].id, ...owned])];
    if (s.cosmetics.owned[slot].includes(d.cosmetics.sel?.[slot])) s.cosmetics.sel[slot] = d.cosmetics.sel[slot];
  }
  if (d.rep) for (const f in FACTIONS) s.rep[f] = num(d.rep[f], 0, 0, 100);
  if (d.quest) s.quest = { q: Math.floor(num(d.quest.q, 0, 0, 99)), s: Math.floor(num(d.quest.s, 0, 0, 99)), n: Math.floor(num(d.quest.n, 0)) };
  if (d.flags && typeof d.flags === 'object') for (const k in d.flags) if (typeof d.flags[k] !== 'object') s.flags[k] = d.flags[k];
  if (d.bounty && typeof d.bounty === 'object' && typeof d.bounty.kind === 'string') s.bounty = { ...d.bounty };
  if (Array.isArray(d.lore)) s.lore = d.lore.filter((x) => typeof x === 'string').slice(0, 200);
  if (typeof d.systemId === 'string' && /^-?\d+,-?\d+$/.test(d.systemId)) s.systemId = d.systemId;
  s.planet = Math.floor(num(d.planet, 0, 0, 8));
  const vec = (v) => (Array.isArray(v) && v.length === 3 && v.every((x) => Number.isFinite(x)) ? v : null);
  if (d.where && vec(d.where.dir)) s.where = { dir: d.where.dir };
  if (d.ship && vec(d.ship.dir)) s.ship = { planet: Math.floor(num(d.ship.planet, 0, 0, 8)), dir: d.ship.dir };
  if (d.stats) {
    for (const k of ['mined', 'kills', 'jumps', 'playTime', 'earned']) s.stats[k] = num(d.stats[k], 0);
    for (const k of ['planets', 'systems']) if (d.stats[k] && typeof d.stats[k] === 'object') s.stats[k] = { ...d.stats[k] };
  }
  if (d.settings) {
    if (['low', 'medium', 'high', 'ultra'].includes(d.settings.quality)) s.settings.quality = d.settings.quality;
    s.settings.volume = num(d.settings.volume, 0.6, 0, 1);
    for (const k of ['music', 'invertY']) if (typeof d.settings[k] === 'boolean') s.settings[k] = d.settings[k];
    if (['first', 'third'].includes(d.settings.view)) s.settings.view = d.settings.view;
  }
  return s;
}
