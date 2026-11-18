// The galaxy: an endless grid of star systems, each generated from its
// coordinates. A handful of systems near the origin are authored for the
// story; everything else is procedural.
import { hash32, makeName, mulberry, pick, range, irange } from '../core/rng.js';
import { BIOMES, BIOME_IDS, FACTION_IDS } from './data.js';
import { getPlanet } from './planet.js';

const STAR_CLASSES = [
  { name: 'Yellow dwarf', color: [1.0, 0.95, 0.82], w: 5 },
  { name: 'Orange dwarf', color: [1.0, 0.76, 0.5], w: 3 },
  { name: 'Red dwarf', color: [1.0, 0.5, 0.36], w: 3 },
  { name: 'Blue giant', color: [0.7, 0.82, 1.0], w: 1.5 },
  { name: 'White star', color: [0.95, 0.97, 1.0], w: 2 },
];

// Authored systems. `sites` are guaranteed settlements on a planet.
const STORY = {
  '0,0': {
    name: "Haven's Reach", star: 0, faction: 'thalori',
    planets: [
      { name: 'Verdis', type: 'lush', radius: 900, sites: [{ type: 'crash' }, { type: 'village', faction: 'thalori', name: 'Lumen Hollow' }, { type: 'ruins' }] },
      { name: 'Thalora', type: 'ocean', radius: 1100, sites: [{ type: 'capital', faction: 'thalori', name: 'Spire of Accord' }, { type: 'village', faction: 'thalori', name: 'Tidewatch' }] },
      { name: 'Cinder', type: 'barren', radius: 700, sites: [{ type: 'outpost' }] },
    ],
  },
  '1,0': {
    name: 'Karg Forge', star: 2, faction: 'grumm',
    planets: [
      { name: 'Durn', type: 'desert', radius: 1000, sites: [{ type: 'capital', faction: 'grumm', name: 'Ironhold' }, { type: 'outpost', name: 'Raider Den' }, { type: 'village', faction: 'grumm', name: 'Anvil Rest' }] },
      { name: 'Ashfall', type: 'volcanic', radius: 850, sites: [{ type: 'village', faction: 'grumm', name: 'Slagmouth' }, { type: 'outpost' }] },
    ],
  },
  '0,1': {
    name: 'Whisperdeep', star: 3, faction: 'vesh',
    planets: [
      { name: 'Sszeth', type: 'toxic', radius: 950, sites: [{ type: 'capital', faction: 'vesh', name: 'The Chorus' }, { type: 'ruins', name: 'Vault of Echoes', relic: true }, { type: 'village', faction: 'vesh', name: 'Murmur' }] },
      { name: 'Rime', type: 'frozen', radius: 800, sites: [{ type: 'village', faction: 'vesh', name: 'Stillwater' }] },
    ],
  },
  '1,1': {
    name: 'The Silence', star: 4, faction: null,
    planets: [
      { name: 'Threshold', type: 'exotic', radius: 900, sites: [{ type: 'gate', name: 'The Ancient Gate' }] },
      { name: 'Hollow', type: 'barren', radius: 650, sites: [] },
    ],
  },
};

export const systemId = (gx, gy) => `${gx},${gy}`;
export const parseSystemId = (id) => id.split(',').map(Number);

// Lightweight info for the galaxy map (no planets generated).
export function starAt(gx, gy) {
  const id = systemId(gx, gy);
  const seed = hash32('sys', gx, gy);
  const rnd = mulberry(seed);
  const story = STORY[id];
  let cls = STAR_CLASSES[0];
  if (story) cls = STAR_CLASSES[story.star];
  else {
    let t = rnd() * STAR_CLASSES.reduce((n, c) => n + c.w, 0);
    for (const c of STAR_CLASSES) {
      t -= c.w;
      if (t <= 0) {
        cls = c;
        break;
      }
    }
  }
  const fr = mulberry(hash32('fac', Math.floor(gx / 3), Math.floor(gy / 3)));
  const faction = story ? story.faction : rnd() < 0.8 ? pick(fr, FACTION_IDS) : null;
  return {
    id, gx, gy, seed,
    name: story ? story.name : makeName(rnd),
    x: gx + (story ? 0 : (rnd() - 0.5) * 0.7),
    y: gy + (story ? 0 : (rnd() - 0.5) * 0.7),
    star: cls, faction, story: !!story,
    danger: story ? 1 : 1 + Math.min(4, Math.hypot(gx, gy) * 0.15) * (0.6 + rnd() * 0.8),
  };
}

function planetDesc(sys, i, n, rnd, authored) {
  const type = authored?.type || pick(rnd, BIOME_IDS);
  const b = BIOMES[type];
  const radius = authored?.radius || Math.round(range(rnd, 700, 1250));
  const orbit = 26000 + i * 21000 + range(rnd, -3000, 3000);
  const ang = range(rnd, 0, Math.PI * 2);
  const sites = authored?.sites ? authored.sites.map((s) => ({ ...s })) : [];
  if (!authored) {
    const villages = b.thinAir ? irange(rnd, 0, 1) : irange(rnd, 1, 3);
    for (let v = 0; v < villages; v++) sites.push({ type: 'village', faction: sys.faction || pick(rnd, FACTION_IDS) });
    if (rnd() < 0.6) sites.push({ type: 'ruins', relic: rnd() < 0.5 });
    if (rnd() < 0.5) sites.push({ type: 'outpost' });
  }
  return {
    id: `${sys.id}:${i}`,
    index: i,
    seed: hash32('planet', sys.seed, i),
    name: authored?.name || `${makeName(rnd)}${rnd() < 0.3 ? ' ' + ['II', 'III', 'IV', 'Prime'][irange(rnd, 0, 3)] : ''}`,
    type,
    radius,
    gravity: range(rnd, 8, 12),
    pos: [Math.cos(ang) * orbit, range(rnd, -1500, 1500), Math.sin(ang) * orbit],
    atmosphere: !b.thinAir,
    hazardLevel: b.hazard ? range(rnd, 0.6, 1.2) : 0,
    relief: range(rnd, 0.8, 1.25),
    sites,
    systemId: sys.id,
  };
}

const cache = new Map();
export function genSystem(gx, gy) {
  const id = systemId(gx, gy);
  if (cache.has(id)) return cache.get(id);
  const star = starAt(gx, gy);
  const rnd = mulberry(hash32('sysgen', gx, gy));
  const story = STORY[id];
  const sys = { ...star, planets: [] };
  const n = story ? story.planets.length : irange(rnd, 2, 5);
  for (let i = 0; i < n; i++) {
    const d = planetDesc(sys, i, n, rnd, story?.planets[i]);
    // Put the planet where its main settlement enjoys mid-morning sun.
    const site = getPlanet(d).sites.find((s) => s.type === 'crash') || getPlanet(d).sites[0];
    if (site) {
      const s = site.dir;
      const up = Math.abs(s[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
      const t = [up[1] * s[2] - up[2] * s[1], up[2] * s[0] - up[0] * s[2], up[0] * s[1] - up[1] * s[0]];
      const tl = Math.hypot(...t);
      const sun = [s[0] + (t[0] / tl) * 0.75, s[1] + (t[1] / tl) * 0.75, s[2] + (t[2] / tl) * 0.75];
      const sl = Math.hypot(...sun);
      const orbit = Math.hypot(...d.pos);
      d.pos = [(-sun[0] / sl) * orbit, (-sun[1] / sl) * orbit, (-sun[2] / sl) * orbit];
    }
    sys.planets.push(d);
  }
  // The station orbits near the first planet.
  const p0 = sys.planets[0];
  const L = Math.hypot(...p0.pos);
  const k = 1 - 7000 / L;
  // Sunward of the planet, nudged sideways so it is not hidden by it.
  const side = Math.abs(p0.pos[1]) / L > 0.9 ? [1800, 0, 0] : [0, 1800, 0];
  sys.station = { pos: [p0.pos[0] * k + side[0], p0.pos[1] * k + side[1], p0.pos[2] * k + side[2]], name: `${sys.name} Station` };
  if (cache.size > 40) cache.clear();
  cache.set(id, sys);
  return sys;
}

export const STORY_SYSTEMS = { home: '0,0', grumm: '1,0', vesh: '0,1', gate: '1,1' };
