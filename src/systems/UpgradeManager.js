// UpgradeManager: ship system upgrades, drone fleet, ship hulls, research
// and unlocking / warping between asteroid fields. Every purchase validates
// before it mutates state and returns { ok, reason }.
import {
  DRONE_UPGRADES,
  RESEARCH,
  SECTORS,
  SHIPS,
  UPGRADES,
  WARP_FUEL,
  droneCost,
  upgradeReqLevel,
} from '../core/config.js';
import { addDrone, emit, getStats, researchAvailable, upgradeCost } from '../core/state.js';
import { generateSector } from './AsteroidManager.js';

const fail = (reason) => ({ ok: false, reason });

export function upgradeInfo(state, id) {
  const def = UPGRADES[id];
  const level = state.upgrades[id];
  const maxed = level >= def.max;
  const cost = maxed ? 0 : upgradeCost(def, level);
  const reqLevel = upgradeReqLevel(level + 1);
  return { def, level, maxed, cost, reqLevel, locked: !maxed && state.level < reqLevel, affordable: !maxed && state.credits >= cost };
}

export function buyUpgrade(state, id) {
  if (!UPGRADES[id]) return fail('Unknown upgrade');
  const info = upgradeInfo(state, id);
  if (info.maxed) return fail('Already maxed');
  if (info.locked) return fail(`Requires pilot level ${info.reqLevel}`);
  if (!info.affordable) return fail('Not enough credits');
  const before = getStats(state);
  state.credits -= info.cost;
  state.upgrades[id]++;
  state.stats.upgrades++;
  const g = info.def.group;
  state.stats.byGroup[g] = (state.stats.byGroup[g] || 0) + 1;
  // Bigger tanks/shields come pre-filled with the difference.
  const after = getStats(state);
  state.ship.fuel += Math.max(0, after.fuelMax - before.fuelMax);
  state.ship.shield += Math.max(0, after.shieldMax - before.shieldMax);
  state.ship.energy += Math.max(0, after.energyMax - before.energyMax);
  emit(state, 'upgrade', { id, level: state.upgrades[id], name: info.def.name });
  return { ok: true };
}

export function droneUpgradeInfo(state, id) {
  const def = DRONE_UPGRADES[id];
  const level = state.droneUpgrades[id];
  const maxed = level >= def.max;
  const cost = maxed ? 0 : upgradeCost(def, level);
  const reqLevel = upgradeReqLevel(level + 1);
  return { def, level, maxed, cost, reqLevel, locked: !maxed && state.level < reqLevel, affordable: !maxed && state.credits >= cost };
}

export function buyDroneUpgrade(state, id) {
  if (!DRONE_UPGRADES[id]) return fail('Unknown upgrade');
  const info = droneUpgradeInfo(state, id);
  if (info.maxed) return fail('Already maxed');
  if (info.locked) return fail(`Requires pilot level ${info.reqLevel}`);
  if (!info.affordable) return fail('Not enough credits');
  state.credits -= info.cost;
  state.droneUpgrades[id]++;
  state.stats.upgrades++;
  state.stats.byGroup.drones = (state.stats.byGroup.drones || 0) + 1;
  emit(state, 'upgrade', { id, level: state.droneUpgrades[id], name: info.def.name });
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
  if (info.full) return fail('No free drone slot: level up or research Drone Bay');
  if (!info.affordable) return fail('Not enough credits');
  state.credits -= info.cost;
  const d = addDrone(state);
  d.x = 0;
  d.y = 0;
  state.stats.drones = Math.max(state.stats.drones, state.drones.length);
  emit(state, 'droneDeployed', { count: state.drones.length });
  return { ok: true };
}

export function buyShip(state, id) {
  const def = SHIPS[id];
  if (!def) return fail('Unknown ship');
  if (state.ownedShips.includes(id)) return switchShip(state, id);
  if (state.level < def.level) return fail(`Requires pilot level ${def.level}`);
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

export function doResearch(state, id) {
  const def = RESEARCH[id];
  if (!def) return fail('Unknown research');
  if (state.research[id]) return fail('Already researched');
  if (!researchAvailable(state, id)) return fail('Research the prerequisites first');
  if (state.rp < def.cost) return fail('Not enough research points');
  state.rp -= def.cost;
  state.research[id] = true;
  if (id === 'hull') state.ship.hull = getStats(state).hullMax;
  emit(state, 'research', { id, name: def.name });
  return { ok: true };
}

export function sectorInfo(state, id) {
  const def = SECTORS[id];
  const unlocked = state.unlockedSectors.includes(id);
  const needResearch = def.research && !state.research[def.research];
  return {
    def,
    unlocked,
    current: state.sector === id,
    levelOk: state.level >= def.level,
    researchOk: !needResearch,
    affordable: state.credits >= def.cost,
  };
}

export function unlockSector(state, id) {
  if (!SECTORS[id]) return fail('Unknown sector');
  const info = sectorInfo(state, id);
  if (info.unlocked) return fail('Already charted');
  if (!info.levelOk) return fail(`Requires pilot level ${info.def.level}`);
  if (!info.researchOk) return fail(`Requires ${RESEARCH[info.def.research].name} research`);
  if (!info.affordable) return fail('Not enough credits for the jump license');
  state.credits -= info.def.cost;
  state.unlockedSectors.push(id);
  state.stats.sectors = state.unlockedSectors.length;
  emit(state, 'sectorUnlocked', { id, name: info.def.name });
  return { ok: true };
}

export function warp(state, id) {
  if (!SECTORS[id]) return fail('Unknown sector');
  if (!state.unlockedSectors.includes(id)) return fail('Sector not charted yet');
  if (state.sector === id) return fail('Already here');
  if (state.ship.fuel < WARP_FUEL) return fail(`Warp needs ${WARP_FUEL} fuel`);
  state.ship.fuel -= WARP_FUEL;
  state.sector = id;
  if (!state.explored[id]) state.explored[id] = {};
  state.ship.x = 0;
  state.ship.y = 120;
  state.ship.vx = state.ship.vy = 0;
  state.ship.docked = false;
  state.event = null;
  generateSector(state);
  for (const d of state.drones) {
    d.x = (Math.random() - 0.5) * 60;
    d.y = (Math.random() - 0.5) * 60;
    d.task = 'idle';
    d.target = 0;
  }
  emit(state, 'warp', { id, name: SECTORS[id].name });
  return { ok: true };
}
