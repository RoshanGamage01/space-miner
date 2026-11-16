// All balance numbers and content definitions live here, so tuning the game
// never means hunting through system code.

export const SAVE_VERSION = 1;
export const SIM_STEP = 1 / 60;

export const START = {
  credits: 1000,
  fuel: 100,
  cargo: 100,
  drones: 1,
};

// ---------------------------------------------------------------- resources
export const RESOURCE_IDS = ['iron', 'copper', 'silicon', 'nickel', 'crystal'];
export const RESOURCES = {
  iron: { name: 'Iron', value: 5, color: '#aab6c8', glow: '#dfe8ff' },
  copper: { name: 'Copper', value: 8, color: '#ff8c42', glow: '#ffc08a' },
  silicon: { name: 'Silicon', value: 12, color: '#4fd8ff', glow: '#b6f1ff' },
  nickel: { name: 'Nickel', value: 18, color: '#6dff8e', glow: '#c4ffd2' },
  crystal: { name: 'Rare Crystal', value: 50, color: '#d66bff', glow: '#f3c6ff' },
};

// Asteroid bodies. hp/yield are for a medium rock in the starting sector.
export const ASTEROID_TYPES = {
  iron: { hp: 30, resist: 0, yield: [3, 5], rarity: 'Common', xp: 2, rock: ['#3b3f4d', '#5a5f70', '#80869a'] },
  copper: { hp: 40, resist: 0.1, yield: [3, 5], rarity: 'Common', xp: 3, rock: ['#40332e', '#64503f', '#8a6d52'] },
  silicon: { hp: 55, resist: 0.2, yield: [2, 4], rarity: 'Uncommon', xp: 4, rock: ['#2b3a4a', '#41566b', '#5f7a90'] },
  nickel: { hp: 75, resist: 0.32, yield: [2, 4], rarity: 'Rare', xp: 6, rock: ['#2e3d33', '#465c4b', '#66806a'] },
  crystal: { hp: 110, resist: 0.45, yield: [2, 3], rarity: 'Epic', xp: 15, rock: ['#2f2540', '#4a3863', '#6d548c'] },
};

export const ASTEROID_SIZES = {
  small: { r: 10, hp: 0.6, yield: 0.6, weight: 4 },
  medium: { r: 16, hp: 1, yield: 1, weight: 4 },
  large: { r: 24, hp: 1.9, yield: 1.9, weight: 2 },
};

// ---------------------------------------------------------------- sectors
// Type weights are given for the inner, middle and outer rings of a sector,
// so flying further from the station is how you find better rock.
export const SECTOR_IDS = ['kepler', 'cobalt', 'ember', 'void'];
export const SECTORS = {
  kepler: {
    name: 'Kepler Belt',
    blurb: 'A quiet belt of iron and copper. Every miner starts here.',
    level: 1,
    cost: 0,
    research: null,
    radius: 2600,
    asteroids: 380,
    hp: 1,
    yield: 1,
    danger: 1,
    bands: [
      { r: 700, w: { iron: 7, copper: 3, silicon: 0.3, nickel: 0, crystal: 0 } },
      { r: 1600, w: { iron: 4, copper: 4, silicon: 2, nickel: 0.6, crystal: 0.12 } },
      { r: 9e9, w: { iron: 2, copper: 3, silicon: 3, nickel: 2, crystal: 0.5 } },
    ],
    palette: { nebula: ['#2a1b5c', '#13306b', '#4b1f6e'], star: '#cfe3ff', planet: ['#3d6fb5', '#244a85', '#9fd0ff'] },
  },
  cobalt: {
    name: 'Cobalt Drift',
    blurb: 'Dense silicon clouds and the first nickel veins. Rocks are tougher.',
    level: 4,
    cost: 2500,
    research: null,
    radius: 3000,
    asteroids: 420,
    hp: 1.7,
    yield: 1.7,
    danger: 1.5,
    bands: [
      { r: 800, w: { iron: 3, copper: 5, silicon: 3, nickel: 0.6, crystal: 0.05 } },
      { r: 1800, w: { iron: 1, copper: 3, silicon: 4, nickel: 2, crystal: 0.25 } },
      { r: 9e9, w: { iron: 0.5, copper: 2, silicon: 3, nickel: 3, crystal: 0.8 } },
    ],
    palette: { nebula: ['#0b4a5c', '#135a6b', '#1d2f7a'], star: '#d6fff9', planet: ['#2fae9b', '#17665d', '#a6fff0'] },
  },
  ember: {
    name: 'Ember Expanse',
    blurb: 'Hot nickel fields and crystal seams. Pirates hunt here.',
    level: 8,
    cost: 20000,
    research: 'navigation',
    radius: 3300,
    asteroids: 450,
    hp: 2.8,
    yield: 2.8,
    danger: 2.2,
    bands: [
      { r: 900, w: { iron: 1, copper: 3, silicon: 4, nickel: 2, crystal: 0.3 } },
      { r: 2000, w: { iron: 0.3, copper: 1, silicon: 3, nickel: 4, crystal: 0.9 } },
      { r: 9e9, w: { iron: 0, copper: 0.5, silicon: 2, nickel: 4, crystal: 1.8 } },
    ],
    palette: { nebula: ['#5c1b14', '#6b3313', '#4a0f2e'], star: '#ffe4cc', planet: ['#d1622b', '#7a2f17', '#ffc27a'] },
  },
  void: {
    name: 'Void Reach',
    blurb: 'The edge of charted space. Crystal everywhere, danger everywhere.',
    level: 13,
    cost: 150000,
    research: 'navigation',
    radius: 3600,
    asteroids: 480,
    hp: 4.2,
    yield: 4.4,
    danger: 3,
    bands: [
      { r: 1000, w: { iron: 0, copper: 1, silicon: 3, nickel: 3, crystal: 1.5 } },
      { r: 2200, w: { iron: 0, copper: 0.3, silicon: 2, nickel: 3, crystal: 3 } },
      { r: 9e9, w: { iron: 0, copper: 0, silicon: 1, nickel: 2, crystal: 5 } },
    ],
    palette: { nebula: ['#2b0b4f', '#0b3a2a', '#47105e'], star: '#e9d6ff', planet: ['#6a3fd1', '#2c1773', '#c8ffb4'] },
  },
};
export const WARP_FUEL = 25;

// ---------------------------------------------------------------- ships
export const SHIP_IDS = ['sparrow', 'prospector', 'behemoth', 'dreadnought'];
export const SHIPS = {
  sparrow: { name: 'Sparrow MK-I', level: 1, cost: 0, hull: 100, shield: 0, cargo: 1, laser: 1, speed: 1, radius: 8, blurb: 'Light, nimble starter miner.' },
  prospector: { name: 'Prospector', level: 5, cost: 6000, hull: 160, shield: 20, cargo: 1.5, laser: 1.25, speed: 1.05, radius: 9, blurb: 'Bigger hold, stronger beam.' },
  behemoth: { name: 'Behemoth', level: 10, cost: 45000, hull: 260, shield: 50, cargo: 2.2, laser: 1.6, speed: 1.1, radius: 11, blurb: 'Industrial hauler with a heavy beam.' },
  dreadnought: { name: 'Nova Dreadnought', level: 16, cost: 300000, hull: 420, shield: 100, cargo: 3.2, laser: 2.3, speed: 1.18, radius: 13, blurb: 'Flagship of a mining empire.' },
};

// ---------------------------------------------------------------- upgrades
// Each line levels 0..max. cost(L) = base * growth^L. Level L+1 needs player
// level >= reqLevel(L+1).
export const UPGRADE_GROUPS = [
  { id: 'laser', name: 'Mining Laser', icon: 'laser' },
  { id: 'engine', name: 'Engine', icon: 'engine' },
  { id: 'cargo', name: 'Cargo Hold', icon: 'cargo' },
  { id: 'scanner', name: 'Scanner', icon: 'scanner' },
  { id: 'shield', name: 'Shield', icon: 'shield' },
  { id: 'fuel', name: 'Fuel Tank', icon: 'fuel' },
];
export const UPGRADES = {
  laserDamage: { group: 'laser', name: 'Beam Damage', base: 120, growth: 1.55, max: 15, desc: '+25% mining damage per level' },
  laserSpeed: { group: 'laser', name: 'Mining Speed', base: 200, growth: 1.6, max: 10, desc: 'Cuts through hard rock: -8% resistance, +5% damage' },
  laserRange: { group: 'laser', name: 'Laser Range', base: 150, growth: 1.5, max: 8, desc: '+15 beam range' },
  laserEfficiency: { group: 'laser', name: 'Energy Efficiency', base: 120, growth: 1.5, max: 8, desc: '-12% energy drain, +10 capacitor' },
  engineSpeed: { group: 'engine', name: 'Top Speed', base: 150, growth: 1.5, max: 10, desc: '+10% maximum speed' },
  engineAccel: { group: 'engine', name: 'Acceleration', base: 120, growth: 1.5, max: 10, desc: '+12% thrust' },
  engineBoost: { group: 'engine', name: 'Boost Capacity', base: 180, growth: 1.55, max: 8, desc: '+0.6s boost, faster recharge' },
  cargoCapacity: { group: 'cargo', name: 'Hold Size', base: 100, growth: 1.5, max: 15, desc: '+50 cargo capacity' },
  cargoCollection: { group: 'cargo', name: 'Collection', base: 150, growth: 1.55, max: 8, desc: '+12 tractor radius, +5% bonus units' },
  scannerRange: { group: 'scanner', name: 'Radar Range', base: 150, growth: 1.5, max: 8, desc: '+200 radar range' },
  scannerRare: { group: 'scanner', name: 'Rare Detection', base: 300, growth: 1.6, max: 6, desc: '+35% rare crystal spawns, rare pings' },
  scannerIdent: { group: 'scanner', name: 'Identification', base: 250, growth: 2.4, max: 3, desc: 'L1 ore colors on radar · L2 yield readout · L3 value readout' },
  shieldCapacity: { group: 'shield', name: 'Shield Capacity', base: 160, growth: 1.55, max: 10, desc: '+25 shield' },
  shieldRegen: { group: 'shield', name: 'Regeneration', base: 160, growth: 1.55, max: 8, desc: '+2.5 shield/s, shorter delay' },
  shieldProtection: { group: 'shield', name: 'Impact Plating', base: 140, growth: 1.5, max: 8, desc: '-15% collision damage' },
  fuelTank: { group: 'fuel', name: 'Tank Size', base: 100, growth: 1.45, max: 10, desc: '+40 maximum fuel' },
  fuelEfficiency: { group: 'fuel', name: 'Fuel Efficiency', base: 140, growth: 1.5, max: 8, desc: '-12% fuel use' },
};
export const UPGRADE_IDS = Object.keys(UPGRADES);
export const upgradeReqLevel = (nextLevel) => Math.max(1, nextLevel - 1);

export const DRONE_UPGRADES = {
  droneSpeed: { name: 'Mining Speed', base: 200, growth: 1.6, max: 10, desc: '+25% drone mining damage' },
  droneRange: { name: 'Detection Range', base: 180, growth: 1.55, max: 8, desc: '+90 search radius' },
  droneCargo: { name: 'Cargo Pods', base: 220, growth: 1.6, max: 10, desc: '+5 drone cargo' },
  droneMove: { name: 'Thrusters', base: 160, growth: 1.5, max: 10, desc: '+12% drone speed' },
  droneEfficiency: { name: 'Efficiency', base: 260, growth: 1.65, max: 8, desc: '+8% bonus units per pickup' },
};
export const DRONE_UPGRADE_IDS = Object.keys(DRONE_UPGRADES);
export const droneCost = (owned) => Math.round(400 * Math.pow(2.3, Math.max(0, owned - 1)));

// ---------------------------------------------------------------- research
export const RESEARCH = {
  refining1: { name: 'Ore Refining I', cost: 2, req: [], desc: '+10% sell price on all minerals' },
  droneBay1: { name: 'Drone Bay I', cost: 2, req: [], desc: '+1 drone slot' },
  escort: { name: 'Escort Protocol', cost: 2, req: [], desc: 'Drones can escort you and unload into your hold' },
  silo1: { name: 'Station Silo I', cost: 2, req: [], desc: '+500 station storage for drone hauls' },
  pulse: { name: 'Pulse Capacitors', cost: 3, req: [], desc: 'Pulse Blast: -35% cooldown, +30% radius' },
  hull: { name: 'Reinforced Hull', cost: 3, req: [], desc: '+50% hull integrity' },
  navigation: { name: 'Deep Space Navigation', cost: 4, req: [], desc: 'Required to warp to Ember Expanse and beyond' },
  comms: { name: 'Long-Range Comms', cost: 4, req: ['silo1'], desc: 'Offline drone mining up to 6h (from 2h)' },
  refining2: { name: 'Ore Refining II', cost: 5, req: ['refining1'], desc: '+15% more sell price' },
  droneBay2: { name: 'Drone Bay II', cost: 5, req: ['droneBay1'], desc: '+1 drone slot' },
  silo2: { name: 'Station Silo II', cost: 5, req: ['silo1'], desc: '+1500 station storage' },
  nanites: { name: 'Nanite Repair', cost: 5, req: ['hull'], desc: 'Hull slowly repairs itself (1/s)' },
  quantum: { name: 'Quantum Lasers', cost: 6, req: ['pulse'], desc: '+30% laser and drone damage' },
  resonance: { name: 'Crystal Resonance', cost: 8, req: ['quantum'], desc: 'Rare crystals yield +50%' },
  droneBay3: { name: 'Drone Bay III', cost: 10, req: ['droneBay2'], desc: '+2 drone slots' },
  automation: { name: 'Swarm Logic', cost: 12, req: ['droneBay2', 'quantum'], desc: 'Drones +25% speed and +50% cargo' },
};
export const RESEARCH_IDS = Object.keys(RESEARCH);

// ---------------------------------------------------------------- progression
export const xpToNext = (level) => Math.round(140 * Math.pow(1.4, level - 1));
export const maxDronesBase = (level) => Math.min(6, 1 + Math.floor(level / 2));

export const STATION = { dockRadius: 95, storageBase: 500 };
export const OFFLINE = { baseCapHours: 2, commsCapHours: 6, efficiency: 0.7, minSeconds: 30 };
export const EXPLORE_CELL = 400;

export const PULSE = { cooldown: 22, radius: 140, damage: 3 }; // damage = x laser dps

export const MARKET = { interval: 15, min: 0.65, max: 1.5, history: 24 };

export const EVENTS = {
  meteors: { name: 'Meteor Shower', duration: 30, weight: 3, minLevel: 1, color: '#ff8c42', desc: 'Meteors streak through the field. Mine them for bonus ore, but watch your hull!' },
  rare: { name: 'Rare Asteroid Detected', duration: 90, weight: 3, minLevel: 1, color: '#d66bff', desc: 'A huge crystal motherlode appeared. Follow the purple beacon.' },
  storm: { name: 'Solar Storm', duration: 20, weight: 2, minLevel: 2, color: '#ffcf4a', desc: 'Shields offline, laser drains faster, radar fuzzy.' },
  pirates: { name: 'Pirate Raid', duration: 60, weight: 2, minLevel: 3, color: '#ff4d6d', desc: 'Pirates want your cargo. Burn them with your laser or outrun them!' },
  derelict: { name: 'Abandoned Spacecraft', duration: 120, weight: 2.5, minLevel: 1, color: '#7dffb0', desc: 'A derelict hauler drifts nearby. Fly up and press E to salvage.' },
  anomaly: { name: 'Energy Anomaly', duration: 25, weight: 2.5, minLevel: 1, color: '#9b7dff', desc: 'Laser and drone damage x2!' },
};
export const EVENT_IDS = Object.keys(EVENTS);
export const EVENT_GAP = [70, 140];
export const FIRST_EVENT_AT = 75;

// ---------------------------------------------------------------- achievements
export const ACHIEVEMENTS = {
  firstTrip: { name: 'First Mining Trip', desc: 'Sell your first load of minerals', stat: 'sales', goal: 1, rp: 1 },
  destroyer: { name: 'Asteroid Destroyer', desc: 'Destroy 100 asteroids', stat: 'asteroids', goal: 100, rp: 3 },
  collector: { name: 'Mineral Collector', desc: 'Collect 1,000 mineral units', stat: 'collected', goal: 1000, rp: 3 },
  crystalHunter: { name: 'Rare Crystal Hunter', desc: 'Collect 25 rare crystals', stat: 'crystals', goal: 25, rp: 3 },
  droneCommander: { name: 'Drone Commander', desc: 'Own 5 mining drones', stat: 'drones', goal: 5, rp: 4 },
  explorer: { name: 'Deep Space Explorer', desc: 'Chart 120 sectors of space', stat: 'explored', goal: 120, rp: 4 },
  tinkerer: { name: 'Gearhead', desc: 'Buy 25 upgrades', stat: 'upgrades', goal: 25, rp: 2 },
  pirateBuster: { name: 'Pirate Buster', desc: 'Destroy 5 pirate ships', stat: 'pirates', goal: 5, rp: 3 },
  wanderer: { name: 'Galactic Wanderer', desc: 'Unlock a new asteroid field', stat: 'sectors', goal: 2, rp: 2 },
  millionaire: { name: 'Millionaire Miner', desc: 'Earn 1,000,000 credits in total', stat: 'earned', goal: 1000000, rp: 10 },
};
export const ACHIEVEMENT_IDS = Object.keys(ACHIEVEMENTS);

// ---------------------------------------------------------------- missions
// The first missions teach the loop; after that they are generated.
export const SCRIPTED_MISSIONS = [
  { kind: 'collect', res: 'iron', goal: 10, title: 'Mine 10 Iron', hint: 'Hold left mouse on a grey asteroid, then fly over the fragments.', credits: 100, xp: 40 },
  { kind: 'asteroids', goal: 5, title: 'Destroy 5 asteroids', hint: 'Any asteroid counts.', credits: 120, xp: 40 },
  { kind: 'sales', goal: 1, title: 'Sell your first cargo', hint: 'Fly to the station (arrow on screen edge) and press E.', credits: 150, xp: 60 },
  { kind: 'upgradeGroup', group: 'laser', goal: 1, title: 'Upgrade your mining laser', hint: 'Open the Hangar (H) and buy any laser upgrade.', credits: 150, xp: 60 },
  { kind: 'collect', res: 'copper', goal: 20, title: 'Collect 20 Copper', hint: 'Orange asteroids hold copper.', credits: 200, xp: 70 },
  { kind: 'drones', goal: 2, title: 'Deploy a second drone', hint: 'Hangar → Drones. Unlocks at level 2.', credits: 250, xp: 90, rp: 1 },
  { kind: 'earned', goal: 500, title: 'Earn 500 credits', hint: 'Sell minerals at the market.', credits: 200, xp: 80 },
  { kind: 'collect', res: 'iron', goal: 50, title: 'Mine 50 Iron', hint: 'Iron is everywhere near the station.', credits: 250, xp: 90 },
  { kind: 'crystals', goal: 1, title: 'Discover a rare crystal', hint: 'Purple rocks lurk far from the station.', credits: 400, xp: 150, rp: 1 },
  { kind: 'asteroids', goal: 10, title: 'Destroy 10 asteroids', hint: 'Bigger rocks drop more.', credits: 250, xp: 90 },
  { kind: 'bigSale', goal: 400, title: 'Complete a mining expedition', hint: 'Sell a single load worth 400+ credits.', credits: 400, xp: 150, rp: 1 },
];
export const ACTIVE_MISSIONS = 3;
