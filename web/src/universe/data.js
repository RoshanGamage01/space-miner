// Content tables: biomes, items, recipes, factions, upgrades, cosmetics.

// Colours are linear-ish sRGB triples (0..1). sky = Rayleigh tint.
export const BIOMES = {
  lush: {
    name: 'Lush', hazard: null, water: 0.55, waterColor: [0.03, 0.22, 0.32], sky: [0.35, 0.56, 1.0], fog: [0.62, 0.74, 0.86],
    sand: [0.76, 0.69, 0.5], low: [0.2, 0.42, 0.14], mid: [0.3, 0.46, 0.17], high: [0.45, 0.42, 0.36], peak: [0.93, 0.94, 0.96], cliff: [0.36, 0.33, 0.3],
    tree: 'broadleaf', treeColor: [0.16, 0.42, 0.14], flora: 1, fauna: 1, clouds: 0.5, res: { ferrite: 4, carbon: 5, copper: 1.5, sodium: 1, oxygen: 2, gold: 0.3 },
  },
  desert: {
    name: 'Desert', hazard: 'heat', water: 0, waterColor: [0.1, 0.3, 0.3], sky: [0.95, 0.62, 0.35], fog: [0.86, 0.7, 0.52],
    sand: [0.82, 0.62, 0.38], low: [0.78, 0.55, 0.32], mid: [0.7, 0.45, 0.26], high: [0.56, 0.34, 0.22], peak: [0.85, 0.72, 0.56], cliff: [0.45, 0.28, 0.18],
    tree: 'cactus', treeColor: [0.3, 0.45, 0.22], flora: 0.25, fauna: 0.5, clouds: 0.1, res: { ferrite: 5, carbon: 1, copper: 3, sodium: 2, oxygen: 1, gold: 1 },
  },
  frozen: {
    name: 'Frozen', hazard: 'cold', water: 0.3, waterColor: [0.1, 0.3, 0.42], sky: [0.55, 0.75, 1.0], fog: [0.8, 0.88, 0.95],
    sand: [0.82, 0.88, 0.94], low: [0.86, 0.9, 0.95], mid: [0.76, 0.83, 0.9], high: [0.6, 0.68, 0.78], peak: [1, 1, 1], cliff: [0.4, 0.46, 0.55],
    tree: 'pine', treeColor: [0.12, 0.3, 0.26], flora: 0.5, fauna: 0.6, clouds: 0.6, res: { ferrite: 4, carbon: 2, copper: 2, sodium: 2, oxygen: 1, gold: 0.5 },
  },
  toxic: {
    name: 'Toxic', hazard: 'toxic', water: 0.45, waterColor: [0.25, 0.4, 0.06], sky: [0.55, 0.85, 0.3], fog: [0.55, 0.66, 0.36],
    sand: [0.45, 0.47, 0.22], low: [0.32, 0.4, 0.16], mid: [0.4, 0.32, 0.42], high: [0.34, 0.26, 0.38], peak: [0.6, 0.7, 0.4], cliff: [0.22, 0.2, 0.25],
    tree: 'fungus', treeColor: [0.55, 0.2, 0.6], flora: 0.9, fauna: 0.8, clouds: 0.8, res: { ferrite: 3, carbon: 4, copper: 2, sodium: 3, oxygen: 2, gold: 0.6 },
  },
  volcanic: {
    name: 'Volcanic', hazard: 'heat', water: 0.25, waterColor: [1.0, 0.25, 0.02], lava: true, sky: [0.9, 0.4, 0.25], fog: [0.45, 0.28, 0.22],
    sand: [0.2, 0.17, 0.16], low: [0.16, 0.14, 0.14], mid: [0.22, 0.18, 0.17], high: [0.3, 0.22, 0.2], peak: [0.4, 0.3, 0.28], cliff: [0.1, 0.08, 0.08],
    tree: 'spire', treeColor: [0.25, 0.2, 0.2], flora: 0.15, fauna: 0.3, clouds: 0.5, res: { ferrite: 5, carbon: 1, copper: 3, sodium: 1, oxygen: 0.5, gold: 2 },
  },
  ocean: {
    name: 'Ocean', hazard: null, water: 0.85, waterColor: [0.02, 0.18, 0.36], sky: [0.3, 0.58, 1.0], fog: [0.6, 0.76, 0.9],
    sand: [0.86, 0.8, 0.6], low: [0.25, 0.5, 0.2], mid: [0.2, 0.42, 0.18], high: [0.42, 0.4, 0.34], peak: [0.9, 0.9, 0.9], cliff: [0.34, 0.32, 0.3],
    tree: 'palm', treeColor: [0.18, 0.5, 0.18], flora: 0.8, fauna: 0.7, clouds: 0.7, res: { ferrite: 3, carbon: 4, copper: 1, sodium: 3, oxygen: 3, gold: 0.4 },
  },
  barren: {
    name: 'Barren', hazard: 'rad', water: 0, waterColor: [0, 0, 0], sky: [0.5, 0.5, 0.55], thinAir: true, fog: [0.4, 0.4, 0.42],
    sand: [0.5, 0.48, 0.46], low: [0.44, 0.42, 0.4], mid: [0.38, 0.36, 0.35], high: [0.5, 0.48, 0.46], peak: [0.66, 0.64, 0.62], cliff: [0.26, 0.25, 0.24],
    tree: 'none', treeColor: [0.3, 0.3, 0.3], flora: 0, fauna: 0, clouds: 0, res: { ferrite: 6, carbon: 0.3, copper: 3, sodium: 1, oxygen: 0.3, gold: 1.5 },
  },
  exotic: {
    name: 'Exotic', hazard: 'rad', water: 0.4, waterColor: [0.35, 0.05, 0.4], sky: [0.75, 0.4, 1.0], fog: [0.6, 0.45, 0.75],
    sand: [0.6, 0.5, 0.7], low: [0.35, 0.2, 0.5], mid: [0.2, 0.4, 0.55], high: [0.5, 0.3, 0.6], peak: [0.9, 0.8, 1.0], cliff: [0.2, 0.12, 0.3],
    tree: 'crystal', treeColor: [0.3, 0.9, 0.9], flora: 0.7, fauna: 0.5, clouds: 0.4, res: { ferrite: 2, carbon: 2, copper: 2, sodium: 1, oxygen: 1, gold: 1.5, aetherium: 3 },
  },
};
export const BIOME_IDS = Object.keys(BIOMES);

export const HAZARDS = {
  heat: { name: 'Extreme Heat', color: '#ff7b3d' },
  cold: { name: 'Freezing Cold', color: '#8fd0ff' },
  toxic: { name: 'Toxic Air', color: '#a6e04a' },
  rad: { name: 'Radiation', color: '#d9a6ff' },
};

export const ITEMS = {
  ferrite: { name: 'Ferrite', color: '#b0895f', value: 6, desc: 'Common metal. Hull repairs and construction.' },
  carbon: { name: 'Carbon', color: '#5fbf5a', value: 5, desc: 'Organic fuel, harvested from plants.' },
  copper: { name: 'Copper', color: '#e08a4a', value: 18, desc: 'Conductive ore from blue-green deposits.' },
  gold: { name: 'Gold', color: '#ffd24a', value: 60, desc: 'Precious metal, prized by every kingdom.' },
  sodium: { name: 'Sodium', color: '#ffe86b', value: 9, desc: 'Recharges hazard protection.' },
  oxygen: { name: 'Oxygen', color: '#ff6b6b', value: 8, desc: 'Recharges life support.' },
  aetherium: { name: 'Aetherium', color: '#7df9ff', value: 140, desc: 'Resonant crystal from before the Silence.' },
  silicate: { name: 'Silicate', color: '#c8c8d8', value: 10, desc: 'Asteroid dust. Feeds the pulse drive.' },
  warpCell: { name: 'Warp Cell', color: '#b98bff', value: 600, desc: 'One jump between stars.' },
  medkit: { name: 'Med Gel', color: '#ff8fa8', value: 120, desc: 'Restores health. Press H.' },
  silk: { name: 'Thalori Silk', color: '#8fd8ff', value: 220, desc: 'Trade good. Sells high far from Thalori space.' },
  ale: { name: 'Grumm Ale', color: '#ffb347', value: 180, desc: 'Trade good. The Vesh will pay dearly.' },
  incense: { name: 'Vesh Incense', color: '#b6ff8a', value: 200, desc: 'Trade good. Thalori scholars covet it.' },
  relic: { name: 'Ancient Relic', color: '#ffe9a8', value: 900, desc: 'A fragment of the Builders. Collectors pay well.' },
  shardCommerce: { name: 'Shard of Accord', color: '#8fd8ff', value: 0, key: true, desc: 'The Thalori key shard.' },
  shardValor: { name: 'Shard of Valor', color: '#ffb347', value: 0, key: true, desc: 'The Grumm key shard.' },
  shardMemory: { name: 'Shard of Memory', color: '#b6ff8a', value: 0, key: true, desc: 'The Vesh key shard.' },
};

export const RECIPES = {
  warpCell: { name: 'Warp Cell', out: 1, cost: { copper: 20, carbon: 20, aetherium: 2 } },
  medkit: { name: 'Med Gel', out: 1, cost: { carbon: 15, sodium: 5 } },
};

// Three kingdoms and the lawless.
export const FACTIONS = {
  thalori: { name: 'Thalori Accord', species: 'Thalori', color: '#6fd0ff', skin: [0.35, 0.65, 0.95], blurb: 'Tall, patient traders who measure worth in fair exchange.', good: 'silk', wants: 'incense' },
  grumm: { name: 'Grumm Holds', species: 'Grumm', color: '#ffa040', skin: [0.85, 0.5, 0.25], blurb: 'Stocky warrior clans. Respect is earned in battle.', good: 'ale', wants: 'silk' },
  vesh: { name: 'Vesh Chorus', species: 'Vesh', color: '#9dff6a', skin: [0.45, 0.8, 0.4], blurb: 'Many-eyed mystics who remember what others forgot.', good: 'incense', wants: 'ale' },
};
export const FACTION_IDS = Object.keys(FACTIONS);

export const UPGRADES = {
  mining: { name: 'Mining Beam', desc: 'Mine faster', max: 4, base: 600, icon: '⛏' },
  blaster: { name: 'Bolt Caster', desc: 'More weapon damage', max: 4, base: 800, icon: '✦' },
  jetpack: { name: 'Jetpack Tank', desc: 'Fly longer', max: 4, base: 500, icon: '▲' },
  shield: { name: 'Suit Shield', desc: 'Stronger shield', max: 4, base: 700, icon: '◈' },
  hazard: { name: 'Hazard Plating', desc: 'Survive harsh worlds longer', max: 4, base: 600, icon: '☣' },
  cargo: { name: 'Cargo Slots', desc: 'Carry more of each item', max: 4, base: 500, icon: '▣' },
  hull: { name: 'Ship Hull', desc: 'Tougher starship', max: 4, base: 900, icon: '⬢' },
  cannon: { name: 'Ship Cannons', desc: 'More ship damage', max: 4, base: 900, icon: '⁂' },
};
export const upgradeCost = (id, level) => Math.round(UPGRADES[id].base * Math.pow(1.9, level));

export const COSMETICS = {
  suit: [
    { id: 'white', name: 'Pathfinder White', color: '#e8ecf2', cost: 0 },
    { id: 'orange', name: 'Hazard Orange', color: '#ff7b2e', cost: 400 },
    { id: 'blue', name: 'Deep Blue', color: '#2e6bff', cost: 400 },
    { id: 'green', name: 'Verdant', color: '#3ecf6a', cost: 400 },
    { id: 'black', name: 'Voidwalker', color: '#23262e', cost: 1200 },
    { id: 'gold', name: 'Sun King', color: '#f2c14a', cost: 4000 },
  ],
  visor: [
    { id: 'cyan', name: 'Cyan Visor', color: '#4af0ff', cost: 0 },
    { id: 'amber', name: 'Amber Visor', color: '#ffb02e', cost: 300 },
    { id: 'magenta', name: 'Magenta Visor', color: '#ff4df0', cost: 300 },
    { id: 'lime', name: 'Lime Visor', color: '#9dff4a', cost: 300 },
  ],
  ship: [
    { id: 'steel', name: 'Factory Steel', color: '#c9d1dc', cost: 0 },
    { id: 'crimson', name: 'Crimson Comet', color: '#d9342b', cost: 800 },
    { id: 'cobalt', name: 'Cobalt Star', color: '#2b6fd9', cost: 800 },
    { id: 'emerald', name: 'Emerald Wing', color: '#2bbf6a', cost: 800 },
    { id: 'obsidian', name: 'Obsidian', color: '#1b1d24', cost: 2500 },
    { id: 'royal', name: 'Royal Gold', color: '#e8b63a', cost: 6000 },
  ],
  trail: [
    { id: 'cyan', name: 'Ion Blue', color: '#4ad8ff', cost: 0 },
    { id: 'orange', name: 'Afterburn', color: '#ff8a2e', cost: 500 },
    { id: 'violet', name: 'Void Violet', color: '#b46bff', cost: 500 },
    { id: 'green', name: 'Plasma Green', color: '#6bff8a', cost: 500 },
  ],
};

export const STACK_BASE = 250;
