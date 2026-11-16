// The centralized game state, plus the derived stats every system reads.
// State is plain data: systems mutate it, renderers and UI only read it.
import {
  ACHIEVEMENT_IDS,
  DRONE_UPGRADES,
  DRONE_UPGRADE_IDS,
  MARKET,
  OFFLINE,
  PULSE,
  RESEARCH,
  RESOURCE_IDS,
  SAVE_VERSION,
  SECTORS,
  SHIPS,
  START,
  STATION,
  UPGRADE_IDS,
  maxDronesBase,
} from './config.js';

const zeroRes = () => Object.fromEntries(RESOURCE_IDS.map((r) => [r, 0]));

export function createState() {
  const state = {
    version: SAVE_VERSION,
    time: 0,
    credits: START.credits,
    xp: 0,
    level: 1,
    rp: 0,
    shipId: 'sparrow',
    ownedShips: ['sparrow'],
    ship: {
      x: 0,
      y: 120,
      vx: 0,
      vy: 0,
      angle: Math.PI / 2,
      hull: SHIPS.sparrow.hull,
      shield: 40,
      fuel: START.fuel,
      energy: 100,
      boost: 2,
      shieldDelay: 0,
      pulseCd: 0,
      thrusting: 0,
      boosting: false,
      laser: null, // { x, y, len, hit } while firing
      docked: false,
      invuln: 0,
      cargoFullWarn: 0,
    },
    cargo: zeroRes(),
    storage: zeroRes(),
    upgrades: Object.fromEntries(UPGRADE_IDS.map((u) => [u, 0])),
    droneUpgrades: Object.fromEntries(DRONE_UPGRADE_IDS.map((u) => [u, 0])),
    research: {},
    drones: [],
    sector: 'kepler',
    unlockedSectors: ['kepler'],
    explored: { kepler: {} },
    asteroids: [],
    clusters: [],
    pickups: [],
    pirates: [],
    projectiles: [],
    derelicts: [],
    market: Object.fromEntries(RESOURCE_IDS.map((r) => [r, { mult: 1, history: Array(MARKET.history).fill(1) }])),
    marketTimer: MARKET.interval,
    missions: { script: 0, active: [], completed: 0, seq: 0 },
    achievements: {},
    stats: {
      asteroids: 0,
      collected: 0,
      crystals: 0,
      earned: 0,
      sales: 0,
      bigSale: 0,
      upgrades: 0,
      drones: 0,
      pirates: 0,
      explored: 0,
      sectors: 1,
      distance: 0,
      events: 0,
      playTime: 0,
      byRes: zeroRes(),
      byGroup: {},
    },
    event: null,
    nextEventAt: 0,
    respawnTimer: 0,
    settings: { volume: 0.6, muted: false, music: true, leftOpen: true, rightOpen: true, help: true },
    nextId: 1,
    fx: [],
  };
  for (let i = 0; i < START.drones; i++) addDrone(state);
  state.stats.drones = state.drones.length;
  return state;
}

export function addDrone(state) {
  const a = Math.random() * Math.PI * 2;
  const d = {
    id: state.nextId++,
    mode: 'station',
    x: Math.cos(a) * 40,
    y: Math.sin(a) * 40,
    vx: 0,
    vy: 0,
    angle: a,
    task: 'idle',
    target: 0,
    cargo: zeroRes(),
    load: 0,
    beam: null,
    think: 0,
  };
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

export const hasResearch = (state, id) => !!state.research[id];

export function maxDrones(state) {
  let n = maxDronesBase(state.level);
  if (state.research.droneBay1) n += 1;
  if (state.research.droneBay2) n += 1;
  if (state.research.droneBay3) n += 2;
  return n;
}

// Every effective number the simulation uses, from upgrades, ship, research
// and the active event. Cheap enough to recompute each step.
export function getStats(state) {
  const u = state.upgrades;
  const du = state.droneUpgrades;
  const ship = SHIPS[state.shipId] || SHIPS.sparrow;
  const r = state.research;
  const ev = state.event?.id;
  const quantum = r.quantum ? 1.3 : 1;
  const anomaly = ev === 'anomaly' ? 2 : 1;

  const s = {
    laserDps: 14 * (1 + 0.25 * u.laserDamage) * (1 + 0.05 * u.laserSpeed) * ship.laser * quantum * anomaly,
    resistMult: Math.max(0.1, 1 - 0.08 * u.laserSpeed),
    laserRange: 90 + 15 * u.laserRange,
    energyMax: 100 + 10 * u.laserEfficiency,
    energyDrain: 12 * Math.pow(0.88, u.laserEfficiency) * (ev === 'storm' ? 1.6 : 1),
    energyRegen: 22,
    maxSpeed: 130 * (1 + 0.1 * u.engineSpeed) * ship.speed,
    thrust: 280 * (1 + 0.12 * u.engineAccel),
    boostMax: 2 + 0.6 * u.engineBoost,
    boostRegen: 0.35 + 0.05 * u.engineBoost,
    cargoCap: Math.round((START.cargo + 50 * u.cargoCapacity) * ship.cargo),
    magnetRadius: 40 + 12 * u.cargoCollection,
    bonusChance: 0.05 * u.cargoCollection,
    radarRange: 700 + 200 * u.scannerRange,
    rareMult: 1 + 0.35 * u.scannerRare,
    ident: u.scannerIdent,
    hullMax: Math.round(ship.hull * (r.hull ? 1.5 : 1)),
    hullRegen: r.nanites ? 1 : 0,
    shieldMax: 40 + 25 * u.shieldCapacity + ship.shield,
    shieldRegen: ev === 'storm' ? 0 : 4 + 2.5 * u.shieldRegen,
    shieldDelay: Math.max(1, 3 - 0.2 * u.shieldRegen),
    collisionMult: Math.pow(0.85, u.shieldProtection),
    fuelMax: START.fuel + 40 * u.fuelTank,
    fuelUse: Math.pow(0.88, u.fuelEfficiency),
    droneDps: 6 * (1 + 0.25 * du.droneSpeed) * quantum * anomaly,
    droneRange: 350 + 90 * du.droneRange,
    droneCargo: Math.round((8 + 5 * du.droneCargo) * (r.automation ? 1.5 : 1)),
    droneSpeed: 90 * (1 + 0.12 * du.droneMove) * (r.automation ? 1.25 : 1),
    droneBonus: 0.08 * du.droneEfficiency,
    maxDrones: maxDrones(state),
    sellMult: (r.refining1 ? 1.1 : 1) * (r.refining2 ? 1.15 : 1),
    storageCap: STATION.storageBase + (r.silo1 ? 500 : 0) + (r.silo2 ? 1500 : 0),
    offlineCapHours: r.comms ? OFFLINE.commsCapHours : OFFLINE.baseCapHours,
    pulseCooldown: PULSE.cooldown * (r.pulse ? 0.65 : 1),
    pulseRadius: PULSE.radius * (r.pulse ? 1.3 : 1),
    crystalYield: r.resonance ? 1.5 : 1,
    shipRadius: ship.radius,
  };
  return s;
}

export const sectorDef = (state) => SECTORS[state.sector] || SECTORS.kepler;

export function upgradeCost(def, level) {
  return Math.round(def.base * Math.pow(def.growth, level));
}

export const droneUpgradeCost = (id, level) => upgradeCost(DRONE_UPGRADES[id], level);

export const researchAvailable = (state, id) =>
  !state.research[id] && RESEARCH[id].req.every((q) => state.research[q]);

export const achievementCount = (state) => ACHIEVEMENT_IDS.filter((a) => state.achievements[a]).length;
