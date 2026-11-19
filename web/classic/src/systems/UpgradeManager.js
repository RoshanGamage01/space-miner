// UpgradeManager: ship upgrades, weapons, drones, ship hulls and sectors.
// Every purchase validates before it mutates state and returns { ok, reason }.
import { BOSSES, PERKS, PERK_IDS, SECTORS, SECTOR_IDS, SHIPS, UPGRADES, WEAPONS, WEAPON_MAX, droneCost, weaponUpgradeCost } from '../core/config.js';
import { addDrone, emit, getStats, upgradeCost } from '../core/state.js';
import { generateSector } from './AsteroidManager.js';
import { setupSector } from './CampaignSystem.js';

const fail = (reason) => ({ ok: false, reason });

export function upgradeInfo(state, id) {
  const def = UPGRADES[id];
  const level = state.upgrades[id];
  const maxed = level >= def.max;
  const cost = maxed ? 0 : upgradeCost(def, level);
  return { def, level, maxed, cost, affordable: !maxed && state.credits >= cost };
}

export function buyUpgrade(state, id) {
  if (!UPGRADES[id]) return fail('Unknown upgrade');
  const info = upgradeInfo(state, id);
  if (info.maxed) return fail('Maxed out');
  if (!info.affordable) return fail('Not enough credits');
  const before = getStats(state);
  state.credits -= info.cost;
  state.upgrades[id]++;
  state.stats.upgrades++;
  state.stats.byUpgrade[id] = (state.stats.byUpgrade[id] || 0) + 1;
  const after = getStats(state);
  state.ship.hull += Math.max(0, after.hullMax - before.hullMax);
  state.ship.shield += Math.max(0, after.shieldMax - before.shieldMax);
  emit(state, 'upgrade', { id, level: state.upgrades[id] });
  return { ok: true };
}

export function weaponInfo(state, id) {
  const def = WEAPONS[id];
  const level = state.weapons[id] || 0;
  const owned = level > 0;
  const maxed = level >= WEAPON_MAX;
  const cost = !owned ? def.cost : maxed ? 0 : weaponUpgradeCost(id, level);
  return { def, level, owned, maxed, cost, locked: !owned && state.level < def.level, affordable: state.credits >= cost, equipped: state.weapon === id };
}

// Buys the weapon, or upgrades it when already owned.
export function buyWeapon(state, id) {
  if (!WEAPONS[id]) return fail('Unknown weapon');
  const info = weaponInfo(state, id);
  if (info.maxed) return fail('Maxed out');
  if (info.locked) return fail(`Unlocks at level ${info.def.level}`);
  if (!info.affordable) return fail('Not enough credits');
  state.credits -= info.cost;
  state.weapons[id] = info.level + 1;
  if (!info.owned) {
    state.weapon = id;
    emit(state, 'weaponBought', { id, name: info.def.name });
  } else emit(state, 'upgrade', { id, level: state.weapons[id] });
  return { ok: true };
}

export function equipWeapon(state, id) {
  if (!state.weapons[id]) return fail('Not owned');
  state.weapon = id;
  emit(state, 'equip', { id });
  return { ok: true };
}

export function droneBuyInfo(state) {
  const owned = state.drones.length;
  const max = getStats(state).maxDrones;
  const cost = droneCost(owned);
  return { owned, max, cost, full: owned >= max, affordable: state.credits >= cost };
}

export function buyDrone(state) {
  const info = droneBuyInfo(state);
  if (info.full) return fail('No free slot: more at higher level');
  if (!info.affordable) return fail('Not enough credits');
  state.credits -= info.cost;
  const d = addDrone(state);
  d.x = 0;
  d.y = 0;
  emit(state, 'droneDeployed', { count: state.drones.length });
  return { ok: true };
}

export function buyShip(state, id) {
  const def = SHIPS[id];
  if (!def) return fail('Unknown ship');
  if (state.ownedShips.includes(id)) return switchShip(state, id);
  if (state.level < def.level) return fail(`Unlocks at level ${def.level}`);
  if (state.credits < def.cost) return fail('Not enough credits');
  state.credits -= def.cost;
  state.ownedShips.push(id);
  emit(state, 'shipBought', { id, name: def.name });
  return switchShip(state, id);
}

export function switchShip(state, id) {
  if (!state.ownedShips.includes(id)) return fail('You do not own that ship');
  state.shipId = id;
  const s = getStats(state);
  state.ship.hull = s.hullMax;
  state.ship.shield = s.shieldMax;
  emit(state, 'shipSwitch', { id });
  return { ok: true };
}

export function sectorInfo(state, id) {
  const def = SECTORS[id];
  const idx = SECTOR_IDS.indexOf(id);
  const prev = idx > 0 ? SECTOR_IDS[idx - 1] : null;
  const p = state.progress[id] || { hives: 0, boss: false };
  return { def, unlocked: state.unlockedSectors.includes(id), current: state.sector === id, prevBoss: prev ? BOSSES[prev].name : null, boss: BOSSES[id].name, hives: p.hives, cleared: p.boss };
}

// Warp to a sector you have opened by beating the previous sector's boss.
export function travel(state, id) {
  if (!SECTORS[id]) return fail('Unknown sector');
  const info = sectorInfo(state, id);
  if (info.current) return fail('Already here');
  if (!info.unlocked) return fail(`Defeat the ${info.prevBoss} first`);
  if (state.bossId) return fail('Not while the boss is hunting you');
  state.sector = id;
  state.ship.x = 0;
  state.ship.y = 120;
  state.ship.vx = state.ship.vy = 0;
  state.ship.docked = false;
  state.event = null;
  state.nextPatrolAt = state.time + 40;
  generateSector(state);
  setupSector(state);
  for (const d of state.drones) {
    d.x = (Math.random() - 0.5) * 60;
    d.y = (Math.random() - 0.5) * 60;
    d.task = 'idle';
    d.target = 0;
  }
  emit(state, 'warp', { id, name: SECTORS[id].name });
  return { ok: true };
}

// ------------------------------------------------------------ perks
export function rollPerks(state) {
  const pool = PERK_IDS.filter((id) => (state.perks[id] || 0) < PERKS[id].max);
  const out = [];
  while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  return out;
}

// Keeps a set of three choices on offer while a pick is pending.
export function ensurePerkChoices(state) {
  if (state.pendingPerks > 0 && !state.perkChoices) {
    const c = rollPerks(state);
    if (c.length) state.perkChoices = c;
    else state.pendingPerks = 0;
  }
  return state.perkChoices;
}

export function pickPerk(state, id) {
  if (!state.pendingPerks || !state.perkChoices?.includes(id)) return fail('Not on offer');
  state.perks[id] = (state.perks[id] || 0) + 1;
  state.pendingPerks--;
  state.perkChoices = null;
  if (id === 'plating') state.ship.hull += 25;
  emit(state, 'perk', { id, name: PERKS[id].name, level: state.perks[id] });
  ensurePerkChoices(state);
  return { ok: true };
}
