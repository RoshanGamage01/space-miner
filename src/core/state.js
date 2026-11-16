// The centralized game state, plus the derived stats every system reads.
import { MARKET, RESOURCE_IDS, SAVE_VERSION, SECTORS, SHIPS, START, STATION, UPGRADE_IDS, WEAPONS, maxDrones } from './config.js';

const zeroRes = () => Object.fromEntries(RESOURCE_IDS.map((r) => [r, 0]));

export function createState() {
  const state = {
    version: SAVE_VERSION,
    time: 0,
    credits: START.credits,
    xp: 0,
    level: 1,
    shipId: 'sparrow',
    ownedShips: ['sparrow'],
    ship: {
      x: 0,
      y: 120,
      vx: 0,
      vy: 0,
      angle: Math.PI / 2,
      hull: 100,
      shield: 40,
      energy: 100,
      boost: 2,
      shieldDelay: 0,
      pulseCd: 0,
      fireCd: 0,
      thrusting: 0,
      boosting: false,
      laser: null,
      docked: false,
      invuln: 0,
      cargoFullWarn: 0,
    },
    cargo: zeroRes(),
    storage: zeroRes(),
    upgrades: Object.fromEntries(UPGRADE_IDS.map((u) => [u, 0])),
    weapons: { blaster: 1 }, // id -> level (owned when >= 1)
    weapon: 'blaster',
    drones: [],
    sector: 'kepler',
    unlockedSectors: ['kepler'],
    asteroids: [],
    clusters: [],
    pickups: [],
    enemies: [],
    shots: [],
    derelicts: [],
    market: Object.fromEntries(RESOURCE_IDS.map((r) => [r, { mult: 1, history: Array(MARKET.history).fill(1) }])),
    marketTimer: MARKET.interval,
    missions: { script: 0, active: null, completed: 0, seq: 0 },
    achievements: {},
    stats: {
      asteroids: 0,
      collected: 0,
      crystals: 0,
      earned: 0,
      sales: 0,
      upgrades: 0,
      aliens: 0,
      kills: 0,
      bosses: 0,
      pirates: 0,
      events: 0,
      bestCombo: 0,
      playTime: 0,
      byRes: zeroRes(),
      byUpgrade: {},
    },
    combo: { count: 0, t: 0 },
    event: null,
    nextEventAt: 0,
    nextPatrolAt: 0,
    turretCd: 0,
    respawnTimer: 0,
    settings: { volume: 0.6, muted: false, music: true, view: 'top', hints: true },
    nextId: 1,
    fx: [],
  };
  for (let i = 0; i < START.drones; i++) addDrone(state);
  return state;
}

export function addDrone(state) {
  const a = Math.random() * Math.PI * 2;
  const d = { id: state.nextId++, x: Math.cos(a) * 40, y: Math.sin(a) * 40, vx: 0, vy: 0, angle: a, task: 'idle', target: 0, cargo: zeroRes(), load: 0, beam: null, think: 0 };
  state.drones.push(d);
  return d;
}

export const emit = (state, type, data = {}) => {
  state.fx.push({ ...data, type });
};

export const cargoUsed = (bag) => {
  let n = 0;
  for (const r of RESOURCE_IDS) n += bag[r] || 0;
  return n;
};

export const sectorDef = (state) => SECTORS[state.sector] || SECTORS.kepler;
export const upgradeCost = (def, level) => Math.round(def.base * Math.pow(def.growth, level));

// Every effective number the simulation uses. Cheap enough to recompute.
export function getStats(state) {
  const u = state.upgrades;
  const ship = SHIPS[state.shipId] || SHIPS.sparrow;
  const surge = state.event?.id === 'anomaly' ? 2 : 1;
  const w = WEAPONS[state.weapon] ? state.weapon : 'blaster';
  const wl = state.weapons[w] || 1;
  const wd = WEAPONS[w];
  return {
    laserDps: 14 * (1 + 0.3 * u.laser) * ship.laser * surge,
    resistMult: Math.max(0.2, 1 - 0.06 * u.laser),
    laserRange: 90 + 8 * u.laser,
    energyMax: 100 + 5 * u.laser,
    energyDrain: 12 * Math.pow(0.93, u.laser),
    energyRegen: 24,
    maxSpeed: 140 * (1 + 0.08 * u.engine) * ship.speed,
    thrust: 300 * (1 + 0.1 * u.engine),
    boostMax: 2 + 0.4 * u.engine,
    boostRegen: 0.4 + 0.05 * u.engine,
    hullMax: Math.round(100 * (1 + 0.25 * u.armor) * ship.hull),
    collisionMult: Math.pow(0.9, u.armor),
    shieldMax: 40 + 20 * u.shield + ship.shield,
    shieldRegen: 5 + 2 * u.shield,
    shieldDelay: Math.max(1.2, 3 - 0.15 * u.shield),
    cargoCap: Math.round((START.cargo + 50 * u.cargo) * ship.cargo),
    magnetRadius: 40 + 10 * u.cargo,
    droneDps: 6 * (1 + 0.3 * u.drones) * surge,
    droneRange: 350 + 60 * u.drones,
    droneCargo: 8 + 4 * u.drones,
    droneSpeed: 90 * (1 + 0.1 * u.drones),
    maxDrones: maxDrones(state.level),
    storageCap: STATION.storageBase + 300 * u.drones,
    weapon: {
      id: w,
      level: wl,
      ...wd,
      dmg: wd.dmg * (1 + 0.3 * (wl - 1)) * ship.guns * surge,
      rate: wd.rate * (1 + 0.08 * (wl - 1)),
    },
    gunMult: ship.guns * surge,
    shipRadius: ship.radius,
  };
}
