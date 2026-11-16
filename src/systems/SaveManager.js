// SaveManager: localStorage persistence with validation, and capped offline
// progress for the drone fleet. Transient world objects (asteroids, enemies,
// shots) are regenerated on load; everything the player earned is kept.
import { ACHIEVEMENT_IDS, MARKET, OFFLINE, RESOURCE_IDS, SAVE_VERSION, SECTORS, SHIPS, UPGRADES, UPGRADE_IDS, WEAPONS, WEAPON_MAX } from '../core/config.js';
import { addDrone, cargoUsed, createState, getStats } from '../core/state.js';
import { clamp } from '../core/math.js';
import { droneRate } from './DroneManager.js';
import { addToBag } from './ResourceManager.js';

export const SAVE_KEY = 'space-miner.save.v2';

const SAVED_KEYS = ['time', 'credits', 'xp', 'level', 'shipId', 'ownedShips', 'cargo', 'storage', 'upgrades', 'weapons', 'weapon', 'sector', 'unlockedSectors', 'market', 'marketTimer', 'missions', 'achievements', 'stats', 'settings', 'nextId', 'nextEventAt', 'nextPatrolAt'];

export function serialize(state, now = Date.now()) {
  const out = { version: SAVE_VERSION, savedAt: now };
  for (const k of SAVED_KEYS) out[k] = state[k];
  const s = state.ship;
  out.ship = { x: s.x, y: s.y, angle: s.angle, hull: s.hull, shield: s.shield, energy: s.energy, boost: s.boost, pulseCd: s.pulseCd };
  out.drones = state.drones.map((d) => ({ cargo: d.cargo }));
  return JSON.stringify(out);
}

const num = (v, fallback, lo = -Infinity, hi = Infinity) => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : fallback);
const intIn = (v, fallback, lo, hi) => Math.floor(num(v, fallback, lo, hi));

function resBag(src, into) {
  if (!src || typeof src !== 'object') return;
  for (const r of RESOURCE_IDS) into[r] = intIn(src[r], 0, 0, 1e9);
}

function trim(bag, cap) {
  let over = cargoUsed(bag) - cap;
  for (const r of RESOURCE_IDS) {
    if (over <= 0) break;
    const cut = Math.min(bag[r], over);
    bag[r] -= cut;
    over -= cut;
  }
}

// Merge a parsed save onto a fresh state, validating every field.
export function deserialize(json) {
  let data;
  try {
    data = typeof json === 'string' ? JSON.parse(json) : json;
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object' || data.version !== SAVE_VERSION) return null;
  const st = createState();
  st.time = num(data.time, 0, 0);
  st.credits = Math.floor(num(data.credits, st.credits, 0, 1e15));
  st.level = intIn(data.level, 1, 1, 999);
  st.xp = num(data.xp, 0, 0);
  if (Array.isArray(data.ownedShips)) st.ownedShips = ['sparrow', ...data.ownedShips.filter((s) => SHIPS[s] && s !== 'sparrow')];
  if (SHIPS[data.shipId] && st.ownedShips.includes(data.shipId)) st.shipId = data.shipId;
  resBag(data.cargo, st.cargo);
  resBag(data.storage, st.storage);
  if (data.upgrades) for (const u of UPGRADE_IDS) st.upgrades[u] = intIn(data.upgrades[u], 0, 0, UPGRADES[u].max);
  if (data.weapons && typeof data.weapons === 'object') {
    for (const w in WEAPONS) {
      const lv = intIn(data.weapons[w], 0, 0, WEAPON_MAX);
      if (lv > 0) st.weapons[w] = lv;
    }
  }
  if (st.weapons[data.weapon]) st.weapon = data.weapon;
  if (Array.isArray(data.unlockedSectors)) st.unlockedSectors = ['kepler', ...data.unlockedSectors.filter((s) => SECTORS[s] && s !== 'kepler')];
  if (SECTORS[data.sector] && st.unlockedSectors.includes(data.sector)) st.sector = data.sector;
  if (data.market) {
    for (const r of RESOURCE_IDS) {
      const m = data.market[r];
      if (!m) continue;
      st.market[r].mult = num(m.mult, 1, MARKET.min, MARKET.max);
      if (Array.isArray(m.history)) st.market[r].history = m.history.slice(-MARKET.history).map((v) => num(v, 1, MARKET.min, MARKET.max));
    }
  }
  st.marketTimer = num(data.marketTimer, MARKET.interval, 0, MARKET.interval);
  if (data.missions && typeof data.missions === 'object') {
    const a = data.missions.active;
    st.missions = {
      script: intIn(data.missions.script, 0, 0, 999),
      completed: intIn(data.missions.completed, 0, 0, 1e9),
      seq: intIn(data.missions.seq, 0, 0, 1e9),
      active: a && typeof a.goal === 'number' && typeof a.kind === 'string' && typeof a.title === 'string' ? { ...a } : null,
    };
  }
  if (data.achievements) for (const a of ACHIEVEMENT_IDS) if (data.achievements[a]) st.achievements[a] = num(data.achievements[a], 1);
  if (data.stats) {
    for (const k in st.stats) {
      if (k === 'byRes') resBag(data.stats.byRes, st.stats.byRes);
      else if (k === 'byUpgrade') st.stats.byUpgrade = data.stats.byUpgrade && typeof data.stats.byUpgrade === 'object' ? { ...data.stats.byUpgrade } : {};
      else st.stats[k] = num(data.stats[k], st.stats[k], 0);
    }
  }
  if (data.settings) {
    const s = data.settings;
    st.settings.volume = num(s.volume, 0.6, 0, 1);
    for (const k of ['muted', 'music', 'hints']) if (typeof s[k] === 'boolean') st.settings[k] = s[k];
    if (s.view === 'cockpit' || s.view === 'top') st.settings.view = s.view;
  }
  st.nextId = intIn(data.nextId, 1, 1, 1e12);
  st.nextEventAt = num(data.nextEventAt, 0, 0);
  st.nextPatrolAt = num(data.nextPatrolAt, 0, 0);

  st.drones = [];
  const drones = Array.isArray(data.drones) ? data.drones.slice(0, 20) : [];
  for (const dd of drones) resBag(dd?.cargo, addDrone(st).cargo);
  if (!st.drones.length) addDrone(st);
  st.nextId = Math.max(st.nextId, ...st.drones.map((d) => d.id + 1));

  const stats = getStats(st);
  if (data.ship) {
    const s = data.ship;
    st.ship.x = num(s.x, 0, -5000, 5000);
    st.ship.y = num(s.y, 120, -5000, 5000);
    st.ship.angle = num(s.angle, Math.PI / 2);
    st.ship.hull = num(s.hull, stats.hullMax, 1, stats.hullMax);
    st.ship.shield = num(s.shield, stats.shieldMax, 0, stats.shieldMax);
    st.ship.energy = num(s.energy, stats.energyMax, 0, stats.energyMax);
    st.ship.boost = num(s.boost, stats.boostMax, 0, stats.boostMax);
    st.ship.pulseCd = num(s.pulseCd, 0, 0, 60);
  }
  trim(st.cargo, stats.cargoCap);
  trim(st.storage, stats.storageCap);
  return { state: st, savedAt: num(data.savedAt, Date.now()) };
}

function storage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

export function saveGame(state, now = Date.now()) {
  try {
    storage()?.setItem(SAVE_KEY, serialize(state, now));
    return true;
  } catch {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = storage()?.getItem(SAVE_KEY);
    return raw ? deserialize(raw) : null;
  } catch {
    return null;
  }
}

export function clearSave() {
  try {
    storage()?.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}

// Offline progress: an elapsed-time estimate of what the drone fleet hauled
// into the station silo, capped by time and by silo space.
export function applyOffline(state, seconds) {
  const stats = getStats(state);
  const capped = Math.min(seconds, OFFLINE.capHours * 3600);
  if (capped < OFFLINE.minSeconds || !state.drones.length) return null;
  const { perSecond, mix } = droneRate(state, stats);
  const space = Math.max(0, stats.storageCap - cargoUsed(state.storage));
  const raw = perSecond * capped * OFFLINE.efficiency;
  const total = Math.min(space, raw);
  const gained = {};
  let units = 0;
  for (const r of RESOURCE_IDS) {
    const add = addToBag(state.storage, r, Math.floor(total * mix[r]), stats.storageCap);
    if (add > 0) {
      gained[r] = add;
      units += add;
    }
  }
  return { seconds, capped, gained, units, siloFull: raw > space };
}
