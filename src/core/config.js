// All balance numbers and content definitions live here.

export const SAVE_VERSION = 2;
export const SIM_STEP = 1 / 60;

export const START = { credits: 1000, cargo: 100, drones: 1 };

// ---------------------------------------------------------------- ores
export const RESOURCE_IDS = ['iron', 'copper', 'silicon', 'nickel', 'crystal'];
export const RESOURCES = {
  iron: { name: 'Iron', value: 5, color: '#aab6c8', glow: '#dfe8ff' },
  copper: { name: 'Copper', value: 8, color: '#ff8c42', glow: '#ffc08a' },
  silicon: { name: 'Silicon', value: 12, color: '#4fd8ff', glow: '#b6f1ff' },
  nickel: { name: 'Nickel', value: 18, color: '#6dff8e', glow: '#c4ffd2' },
  crystal: { name: 'Crystal', value: 50, color: '#d66bff', glow: '#f3c6ff' },
};

export const ASTEROID_TYPES = {
  iron: { hp: 30, resist: 0, yield: [3, 5], xp: 2, rock: ['#3b3f4d', '#5a5f70', '#80869a'] },
  copper: { hp: 40, resist: 0.1, yield: [3, 5], xp: 3, rock: ['#40332e', '#64503f', '#8a6d52'] },
  silicon: { hp: 55, resist: 0.2, yield: [2, 4], xp: 4, rock: ['#2b3a4a', '#41566b', '#5f7a90'] },
  nickel: { hp: 75, resist: 0.3, yield: [2, 4], xp: 6, rock: ['#2e3d33', '#465c4b', '#66806a'] },
  crystal: { hp: 110, resist: 0.4, yield: [2, 3], xp: 15, rock: ['#2f2540', '#4a3863', '#6d548c'] },
};

export const ASTEROID_SIZES = {
  small: { r: 10, hp: 0.6, yield: 0.6, weight: 4 },
  medium: { r: 16, hp: 1, yield: 1, weight: 4 },
  large: { r: 24, hp: 1.9, yield: 1.9, weight: 2 },
};

// ---------------------------------------------------------------- sectors
export const SECTOR_IDS = ['kepler', 'cobalt', 'ember', 'void'];
export const SECTORS = {
  kepler: {
    name: 'Kepler Belt',
    blurb: 'Calm. Iron and copper.',
    level: 1,
    cost: 0,
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
    blurb: 'Richer rock. Alien scouts.',
    level: 4,
    cost: 3000,
    radius: 3000,
    asteroids: 420,
    hp: 1.7,
    yield: 1.7,
    danger: 1.6,
    bands: [
      { r: 800, w: { iron: 3, copper: 5, silicon: 3, nickel: 0.6, crystal: 0.05 } },
      { r: 1800, w: { iron: 1, copper: 3, silicon: 4, nickel: 2, crystal: 0.25 } },
      { r: 9e9, w: { iron: 0.5, copper: 2, silicon: 3, nickel: 3, crystal: 0.8 } },
    ],
    palette: { nebula: ['#0b4a5c', '#135a6b', '#1d2f7a'], star: '#d6fff9', planet: ['#2fae9b', '#17665d', '#a6fff0'] },
  },
  ember: {
    name: 'Ember Front',
    blurb: 'Nickel and crystal. Active war zone.',
    level: 8,
    cost: 25000,
    radius: 3300,
    asteroids: 450,
    hp: 2.8,
    yield: 2.8,
    danger: 2.4,
    bands: [
      { r: 900, w: { iron: 1, copper: 3, silicon: 4, nickel: 2, crystal: 0.3 } },
      { r: 2000, w: { iron: 0.3, copper: 1, silicon: 3, nickel: 4, crystal: 0.9 } },
      { r: 9e9, w: { iron: 0, copper: 0.5, silicon: 2, nickel: 4, crystal: 1.8 } },
    ],
    palette: { nebula: ['#5c1b14', '#6b3313', '#4a0f2e'], star: '#ffe4cc', planet: ['#d1622b', '#7a2f17', '#ffc27a'] },
  },
  void: {
    name: 'Void Hive',
    blurb: 'Crystal everywhere. The alien homeworld.',
    level: 13,
    cost: 150000,
    radius: 3600,
    asteroids: 480,
    hp: 4.2,
    yield: 4.4,
    danger: 3.6,
    bands: [
      { r: 1000, w: { iron: 0, copper: 1, silicon: 3, nickel: 3, crystal: 1.5 } },
      { r: 2200, w: { iron: 0, copper: 0.3, silicon: 2, nickel: 3, crystal: 3 } },
      { r: 9e9, w: { iron: 0, copper: 0, silicon: 1, nickel: 2, crystal: 5 } },
    ],
    palette: { nebula: ['#2b0b4f', '#0b3a2a', '#47105e'], star: '#e9d6ff', planet: ['#6a3fd1', '#2c1773', '#c8ffb4'] },
  },
};

// ---------------------------------------------------------------- ships
export const SHIP_IDS = ['sparrow', 'prospector', 'behemoth', 'dreadnought'];
export const SHIPS = {
  sparrow: { name: 'Sparrow', level: 1, cost: 0, hull: 1, shield: 0, cargo: 1, laser: 1, guns: 1, speed: 1, radius: 8 },
  prospector: { name: 'Raider', level: 4, cost: 5000, hull: 1.5, shield: 20, cargo: 1.4, laser: 1.2, guns: 1.3, speed: 1.06, radius: 9 },
  behemoth: { name: 'Behemoth', level: 9, cost: 40000, hull: 2.4, shield: 50, cargo: 2, laser: 1.5, guns: 1.7, speed: 1.1, radius: 11 },
  dreadnought: { name: 'Dreadnought', level: 15, cost: 250000, hull: 3.8, shield: 100, cargo: 3, laser: 2.1, guns: 2.4, speed: 1.18, radius: 13 },
};

// ---------------------------------------------------------------- upgrades
// Six simple lines. cost(L) = base * growth^L.
export const UPGRADE_IDS = ['laser', 'engine', 'armor', 'shield', 'cargo', 'drones'];
export const UPGRADES = {
  laser: { name: 'Mining Laser', icon: 'laser', color: '#5ef1ff', base: 150, growth: 1.6, max: 12, short: 'Mine faster' },
  engine: { name: 'Engines', icon: 'engine', color: '#ff8c42', base: 150, growth: 1.55, max: 10, short: 'Fly faster' },
  armor: { name: 'Armor', icon: 'hull', color: '#ff6a6a', base: 180, growth: 1.55, max: 12, short: 'More hull' },
  shield: { name: 'Shields', icon: 'shield', color: '#7aa8ff', base: 180, growth: 1.55, max: 12, short: 'Stronger shield' },
  cargo: { name: 'Cargo Hold', icon: 'cargo', color: '#ffd23e', base: 120, growth: 1.5, max: 12, short: 'Carry more' },
  drones: { name: 'Drone Tech', icon: 'drone', color: '#7dffb0', base: 250, growth: 1.6, max: 10, short: 'Better drones' },
};
export const droneCost = (owned) => Math.round(400 * Math.pow(2.3, Math.max(0, owned - 1)));
export const maxDrones = (level) => Math.min(8, 1 + Math.floor(level / 2));

// ---------------------------------------------------------------- weapons
// Right mouse fires the equipped weapon. Keys 1-4 switch.
export const WEAPON_IDS = ['blaster', 'scatter', 'missiles', 'rail'];
export const WEAPONS = {
  blaster: { name: 'Blaster', level: 1, cost: 0, color: '#5ef1ff', dmg: 9, rate: 6, speed: 460, life: 0.8, count: 1, spread: 0.04, short: 'Fast bolts' },
  scatter: { name: 'Scatter', level: 3, cost: 1500, color: '#ff8c42', dmg: 6, rate: 2.2, speed: 400, life: 0.55, count: 5, spread: 0.5, short: 'Close-range spread' },
  missiles: { name: 'Missiles', level: 5, cost: 6000, color: '#ffd23e', dmg: 34, rate: 1.4, speed: 240, life: 2.4, count: 1, spread: 0, homing: true, splash: 45, short: 'Homing, explode' },
  rail: { name: 'Railgun', level: 8, cost: 18000, color: '#ff5ef1', dmg: 75, rate: 0.85, speed: 950, life: 0.6, count: 1, spread: 0, pierce: true, short: 'Pierces everything' },
};
export const WEAPON_MAX = 6;
export const weaponUpgradeCost = (id, level) => Math.round(Math.max(300, WEAPONS[id].cost * 0.6) * Math.pow(1.75, level - 1));

// ---------------------------------------------------------------- enemies
export const ENEMIES = {
  swarmer: { name: 'Swarmer', hp: 22, speed: 175, accel: 420, r: 6, touch: 12, credits: 15, xp: 6, alien: true },
  spitter: { name: 'Spitter', hp: 50, speed: 120, accel: 220, r: 8, keep: 190, fire: 1.7, shot: 8, shotSpeed: 170, credits: 30, xp: 12, alien: true },
  brute: { name: 'Brute', hp: 180, speed: 70, accel: 120, r: 12, keep: 150, fire: 2.4, shot: 10, shotSpeed: 150, spread: 3, credits: 80, xp: 30, alien: true },
  pirate: { name: 'Pirate', hp: 60, speed: 130, accel: 200, r: 8, keep: 130, fire: 1.8, shot: 7, shotSpeed: 230, credits: 60, xp: 20, steals: true },
  mothership: { name: 'Mothership', hp: 1600, speed: 38, accel: 40, r: 34, keep: 220, fire: 3, shot: 9, shotSpeed: 140, ring: 14, spawn: 7, credits: 1500, xp: 400, alien: true, boss: true },
};
export const STATION_TURRET = { range: 260, rate: 2.2, dmg: 30 };
export const COMBO_WINDOW = 4;

// Ambient alien patrols: the field is never safe for long.
export const PATROL = { first: 70, gap: [28, 50], despawn: 1500 };

export const STATION = { dockRadius: 95, storageBase: 600 };
export const OFFLINE = { capHours: 3, efficiency: 0.7, minSeconds: 30 };
export const PULSE = { cooldown: 18, radius: 150 };
export const MARKET = { interval: 15, min: 0.7, max: 1.45, history: 12 };

export const EVENTS = {
  invasion: { name: 'Alien Invasion', duration: 80, weight: 3, minLevel: 2, color: '#7dff6a', desc: 'Survive 3 waves' },
  mothership: { name: 'Mothership', duration: 150, weight: 1.5, minLevel: 5, color: '#ff4d6d', desc: 'Boss inbound!' },
  pirates: { name: 'Pirate Raid', duration: 60, weight: 2, minLevel: 3, color: '#ff8c42', desc: 'They want your cargo' },
  meteors: { name: 'Meteor Shower', duration: 25, weight: 2, minLevel: 1, color: '#ffb347', desc: 'Free ore, watch your hull' },
  rare: { name: 'Crystal Motherlode', duration: 90, weight: 2, minLevel: 1, color: '#d66bff', desc: 'Follow the purple arrow' },
  derelict: { name: 'Derelict Ship', duration: 120, weight: 1.5, minLevel: 1, color: '#7dffb0', desc: 'Fly to it, press E' },
  anomaly: { name: 'Power Surge', duration: 25, weight: 1.5, minLevel: 1, color: '#9b7dff', desc: 'All damage x2' },
};
export const EVENT_IDS = Object.keys(EVENTS);
export const EVENT_GAP = [55, 100];
export const FIRST_EVENT_AT = 100;

// ---------------------------------------------------------------- progression
export const xpToNext = (level) => Math.round(140 * Math.pow(1.4, level - 1));

export const ACHIEVEMENTS = {
  firstTrip: { name: 'First Haul', desc: 'Sell your first cargo', stat: 'sales', goal: 1, credits: 200 },
  firstBlood: { name: 'First Contact', desc: 'Destroy an alien', stat: 'aliens', goal: 1, credits: 200 },
  alienHunter: { name: 'Alien Hunter', desc: 'Destroy 100 aliens', stat: 'aliens', goal: 100, credits: 3000 },
  bossSlayer: { name: 'Mothership Down', desc: 'Destroy a mothership', stat: 'bosses', goal: 1, credits: 5000 },
  destroyer: { name: 'Rock Breaker', desc: 'Destroy 200 asteroids', stat: 'asteroids', goal: 200, credits: 2000 },
  arsenal: { name: 'Arsenal', desc: 'Own all 4 weapons', stat: 'weapons', goal: 4, credits: 10000 },
  fleet: { name: 'Drone Fleet', desc: 'Own 5 drones', stat: 'drones', goal: 5, credits: 4000 },
  crystal: { name: 'Crystal Hunter', desc: 'Collect 25 crystals', stat: 'crystals', goal: 25, credits: 2500 },
  millionaire: { name: 'Millionaire', desc: 'Earn 1,000,000 credits', stat: 'earned', goal: 1000000, credits: 50000 },
};
export const ACHIEVEMENT_IDS = Object.keys(ACHIEVEMENTS);

// First missions teach the loop; then they are generated. One at a time.
export const SCRIPTED_MISSIONS = [
  { kind: 'collect', res: 'iron', goal: 10, title: 'Mine 10 iron', credits: 100, xp: 40 },
  { kind: 'sales', goal: 1, title: 'Sell at the station', credits: 150, xp: 60 },
  { kind: 'upgrade', id: 'laser', goal: 1, title: 'Upgrade your laser', credits: 150, xp: 60 },
  { kind: 'aliens', goal: 3, title: 'Destroy 3 aliens', credits: 300, xp: 100 },
  { kind: 'drones', goal: 2, title: 'Deploy a 2nd drone', credits: 250, xp: 90 },
  { kind: 'weapons', goal: 2, title: 'Buy a new weapon', credits: 500, xp: 150 },
];
