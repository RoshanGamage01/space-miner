// Procedural pixel-art sprites. Everything is generated into small offscreen
// canvases once and cached: ships from hand-drawn pixel maps, asteroids,
// planets and the station from seeded noise with ordered dithering.
import { ASTEROID_SIZES, ASTEROID_TYPES, RESOURCES } from '../core/config.js';

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const dither = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];

export function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

export function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function shade(hex, f) {
  const [r, g, b] = hexToRgb(hex);
  const k = (v) => Math.max(0, Math.min(255, Math.round(f >= 0 ? v + (255 - v) * f : v * (1 + f))));
  return `rgb(${k(r)},${k(g)},${k(b)})`;
}

// ------------------------------------------------------------ pixel maps
// Ships face right (+x). Only the top half and centre row are drawn; the
// bottom half mirrors it.
const MAPS = {
  sparrow: [
    '.kk.............',
    '.kok............',
    '.khok...........',
    'ekhhhkk.........',
    'ekdhhgghkkk.....',
    'kddhgggggghkk...',
    'eedhgggccwggghkk',
  ],
  prospector: [
    '..kkk...............',
    '..kook..............',
    '..khhhk.............',
    '.kkhhhhkk...........',
    'ekddhhhhgkkkk.......',
    'ekdddhhgggghhkkk....',
    'kddhhhggggggghhhkk..',
    'eedhhgggccwcggghhhkk',
  ],
  behemoth: [
    '..kkkk..................',
    '..koook.................',
    '..khhhhk................',
    '..khdhhhk...............',
    '.kkhdhhhhkkk............',
    'ekddhhhhhhggkkkk........',
    'ekdddhhggggghhhhkkk.....',
    'kddddhhgggggggghhhhkk...',
    'eeddhhhgggccwccgggghhhkk',
  ],
  dreadnought: [
    '...kkkk.....................',
    '...kooook...................',
    '...khhhhhk..................',
    '...khddhhhk.................',
    '..kkhddhhhhk................',
    '.kkdhddhhhhhkkkk............',
    'ekdddhhhhhhggghhkkkk........',
    'ekddddhhhgggggghhhhhkkk.....',
    'kdddddhhhgggggggggghhhhkk...',
    'eedddhhhggggccwccggggghhhhkk',
  ],
  pirate: [
    'k.............',
    'kk............',
    'kdk.....k.....',
    '.kdkk..kok....',
    'edddhhkhgkk...',
    'eddhhgccwgghkk',
  ],
  drone: [
    '...kkk...',
    '.kkhhhk..',
    'kohhgghk.',
    'kdhgggcck',
    'kdhggcwck',
  ],
  swarmer: [
    'k..k.....',
    '.kgk.kk..',
    '..kggggk.',
    '.kdggccgk',
    'kddgcwcgk',
  ],
  spitter: [
    '...kk.......',
    '..kddk..k...',
    '.kddgkkkgk..',
    'kddgggggggk.',
    'kdgggcccggk.',
    'kdggccwccggk',
  ],
  brute: [
    '..kkk...........',
    '.kdddk..kk......',
    'kddhdkkkddkk....',
    'kdhhddddhhddkk..',
    'kdhhhgggggghhdk.',
    'kddhhggcccgghhdk',
    'eddhhgccwccgghdk',
  ],
  bomber: [
    '...kkk...',
    '..koook..',
    '.kogggok.',
    'kogwwwgok',
    'kogwcwgok',
  ],
  sniper: [
    '..............',
    'kk............',
    'kdkk..........',
    '.kddkkkk......',
    'kddhhgggkkkkkk',
    'edhhgccwggggwk',
  ],
  guardian: [
    '....kkkk....',
    '..kkhhhhkk..',
    '.khhggggghk.',
    'khggdddggghk',
    'khgddccdddgk',
    'khgdccwccdgk',
  ],
  derelict: [
    '..kk..............',
    '.kddk....k........',
    '.kdhdk..kdk.......',
    'kddhhhkkdhhk......',
    'kdhh.hhhhh.hhkk...',
    'kddhhggg.ghhhhhkk.',
    'eedh.gggccgg.hhhkk',
  ],
};

const PALETTES = {
  player: { k: '#0d1029', h: '#7f8fc4', d: '#48548a', g: '#c9d6f5', c: '#3ee8ff', w: '#eafdff', o: '#ff8c42', e: '#2c3157' },
  pirate: { k: '#1a060c', h: '#b13a4f', d: '#621a2c', g: '#ec6a78', c: '#ffd23e', w: '#fff3b0', o: '#ffb02e', e: '#3a1520' },
  drone: { k: '#0b1424', h: '#5c7aa8', d: '#33476b', g: '#a9c3e8', c: '#56ffd0', w: '#e6fff7', o: '#ff8c42', e: '#2c3157' },
  alien: { k: '#06140a', h: '#3d8f3a', d: '#1f4d24', g: '#7dff6a', c: '#ff4df0', w: '#ffd6fb', o: '#ffb02e', e: '#123018' },
  bomber: { k: '#1a0a02', o: '#ff8c42', g: '#ffb347', w: '#fff1a8', c: '#ff4d3d', h: '#c2511f', d: '#6b2413', e: '#2a0c06' },
  sniper: { k: '#12061a', h: '#8f3a8a', d: '#4d1f4a', g: '#ff7df0', c: '#ffffff', w: '#ffd6fb', o: '#ffb02e', e: '#2a1030' },
  guardian: { k: '#04121a', h: '#2f7fa8', d: '#17465c', g: '#7fd8ff', c: '#9dff4a', w: '#e6ffd6', o: '#ffb02e', e: '#0a2030' },
  brute: { k: '#0b0614', h: '#5a3a8f', d: '#2c1a4d', g: '#9b7dff', c: '#7dff6a', w: '#e6ffd6', o: '#ffb02e', e: '#1a1030' },
  derelict: { k: '#0c0d12', h: '#5b6070', d: '#353845', g: '#8b90a0', c: '#2b6b6f', w: '#9fd8d6', o: '#8a5a3a', e: '#1c1e26' },
};

const spriteCache = new Map();

export function mapSprite(name, palette = 'player') {
  const key = `${name}|${palette}`;
  if (spriteCache.has(key)) return spriteCache.get(key);
  const half = MAPS[name];
  const rows = [...half, ...half.slice(0, -1).reverse()];
  const w = rows[0].length;
  const h = rows.length;
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  const pal = PALETTES[palette];
  rows.forEach((row, y) => {
    for (let x = 0; x < w; x++) {
      const col = pal[row[x]];
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect(x, y, 1, 1);
    }
  });
  const out = { img: c, w, h, flash: silhouette(c, '#ffffff') };
  spriteCache.set(key, out);
  return out;
}

function silhouette(src, color) {
  const c = canvas(src.width, src.height);
  const ctx = c.getContext('2d');
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, c.width, c.height);
  return c;
}

// ------------------------------------------------------------ asteroids
export function asteroidSprite(a) {
  const key = `${a.type}|${a.size}|${a.variant}|${a.special ? 1 : 0}`;
  let s = spriteCache.get(key);
  if (s) return s;
  const rnd = mulberry(hash(key));
  const t = ASTEROID_TYPES[a.type];
  const res = RESOURCES[a.type];
  const r = ASTEROID_SIZES[a.size].r * (a.special ? 1.5 : 1);
  const size = Math.ceil(r * 2 + 4);
  const c = canvas(size, size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const cx = size / 2;
  const cy = size / 2;
  // Lumpy outline: a few random harmonics.
  const harm = [];
  for (let i = 0; i < 4; i++) harm.push({ f: 2 + i + Math.floor(rnd() * 2), a: (0.13 / (i + 1)) * (0.6 + rnd()), p: rnd() * 6.28 });
  const radiusAt = (th) => {
    let k = 1;
    for (const h of harm) k += Math.sin(th * h.f + h.p) * h.a;
    return r * k * 0.92;
  };
  const craters = [];
  const nc = 1 + Math.floor(rnd() * (r / 6));
  for (let i = 0; i < nc; i++) {
    const ang = rnd() * 6.28;
    const d = rnd() * r * 0.55;
    craters.push({ x: cx + Math.cos(ang) * d, y: cy + Math.sin(ang) * d, r: 1.5 + rnd() * r * 0.22 });
  }
  const veins = [];
  const nv = { iron: 3, copper: 4, silicon: 5, nickel: 5, crystal: 8 }[a.type] + Math.floor(r / 6) + (a.special ? 10 : 0);
  for (let i = 0; i < nv; i++) {
    const ang = rnd() * 6.28;
    const d = rnd() * r * 0.75;
    veins.push({ x: cx + Math.cos(ang) * d, y: cy + Math.sin(ang) * d, r: 0.8 + rnd() * (a.type === 'crystal' ? 2.4 : 1.6) });
  }
  const rock = t.rock.map(hexToRgb);
  const ore = hexToRgb(res.color);
  const oreHi = hexToRgb(res.glow);
  const outline = [8, 9, 18];
  const put = (i, rgb) => {
    img.data[i] = rgb[0];
    img.data[i + 1] = rgb[1];
    img.data[i + 2] = rgb[2];
    img.data[i + 3] = 255;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      const rr = radiusAt(Math.atan2(dy, dx));
      if (d > rr) continue;
      const i = (y * size + x) * 4;
      if (d > rr - 1.1) {
        put(i, outline);
        continue;
      }
      const nz = Math.sqrt(Math.max(0, 1 - (d / rr) ** 2));
      let light = (-dx / rr) * 0.55 + (-dy / rr) * 0.55 + nz * 0.7;
      for (const cr of craters) {
        const cd = Math.hypot(x + 0.5 - cr.x, y + 0.5 - cr.y);
        if (cd < cr.r) light -= cd < cr.r - 1 ? 0.35 : -0.25;
      }
      light += (rnd() - 0.5) * 0.18;
      let lv = light < 0.25 ? 0 : light < 0.75 ? 1 : 2;
      const frac = light < 0.25 ? light / 0.25 : light < 0.75 ? (light - 0.25) / 0.5 : 0;
      if (lv < 2 && frac > dither(x, y)) lv++;
      let col = rock[lv];
      for (const v of veins) {
        const vd = Math.hypot(x + 0.5 - v.x, y + 0.5 - v.y);
        if (vd < v.r) col = vd < v.r * 0.45 || light > 0.9 ? oreHi : ore;
      }
      put(i, col);
    }
  }
  ctx.putImageData(img, 0, 0);
  s = { img: c, size, flash: silhouette(c, '#ffffff') };
  spriteCache.set(key, s);
  return s;
}

// ------------------------------------------------------------ planet
export function planetSprite(seed, r, colors, ringed) {
  const key = `planet|${seed}|${r}`;
  if (spriteCache.has(key)) return spriteCache.get(key);
  const rnd = mulberry(seed);
  const pad = ringed ? Math.ceil(r * 0.8) : 4;
  const size = Math.ceil(r * 2 + pad * 2);
  const c = canvas(size, size);
  const ctx = c.getContext('2d');
  const [base, dark, hi] = colors;
  const cx = size / 2;
  const cy = size / 2;
  const bands = [];
  for (let i = 0; i < 6; i++) bands.push({ y: (rnd() - 0.5) * 2, w: 0.05 + rnd() * 0.15, f: rnd() * 0.5 - 0.25 });
  const drawRing = (front) => {
    if (!ringed) return;
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const dx = (x - cx) / (r * 1.75);
        const dy = ((y - cy) / (r * 1.75)) * 3.2;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 0.72 || d > 1) continue;
        const behind = y < cy;
        if (front === behind) continue;
        if (d > 0.84 && d < 0.88) continue;
        if (dither(x, y) > 0.75) continue;
        ctx.fillStyle = shade(hi, -0.3 - d * 0.2);
        ctx.fillRect(x, y, 1, 1);
      }
  };
  drawRing(false);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5 - cx) / r;
      const dy = (y + 0.5 - cy) / r;
      const d2 = dx * dx + dy * dy;
      if (d2 > 1) continue;
      const nz = Math.sqrt(1 - d2);
      const light = -dx * 0.6 - dy * 0.35 + nz * 0.6;
      let col = base;
      for (const b of bands) if (Math.abs(dy + dx * b.f - b.y) < b.w) col = dark;
      const lv = light * 3 + dither(x, y) * 0.8 - 0.4;
      const f = lv < 0.3 ? -0.7 : lv < 1.2 ? -0.4 : lv < 2.1 ? 0 : 0.22;
      ctx.fillStyle = d2 > 0.9 && light > 0.3 ? shade(hi, -0.1) : shade(col, f);
      ctx.fillRect(x, y, 1, 1);
    }
  drawRing(true);
  const out = { img: c, size };
  spriteCache.set(key, out);
  return out;
}

// ------------------------------------------------------------ bosses
// One procedural saucer per boss: spiky hull, glowing core and pods.
export function bossSprite(def) {
  const key = `boss|${def.name}`;
  if (spriteCache.has(key)) return spriteCache.get(key);
  const R = def.r;
  const size = Math.ceil(R * 2.3);
  const c = canvas(size, size);
  const ctx = c.getContext('2d');
  const cx = size / 2;
  const cols = def.hue;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cx;
      const d = Math.hypot(dx, dy);
      const ang = Math.atan2(dy, dx);
      const rr = R * 0.88 + Math.sin(ang * def.spikes) * R * 0.13;
      if (d > rr) continue;
      if (d > rr - 1.2) ctx.fillStyle = '#05020a';
      else if (d < R * 0.26) ctx.fillStyle = d < R * 0.14 ? '#ffffff' : def.color;
      else {
        const l = (-dx / rr) * 0.5 + (-dy / rr) * 0.5 + Math.sqrt(Math.max(0, 1 - (d / rr) ** 2)) * 0.5;
        let lv = Math.max(0, Math.min(3, Math.floor(l * 3 + dither(x, y) * 0.9)));
        if (Math.abs(d - R * 0.48) < 0.7 || Math.abs(Math.sin((ang * def.spikes) / 2)) < 0.05) lv = 0;
        ctx.fillStyle = cols[lv];
      }
      ctx.fillRect(x, y, 1, 1);
    }
  for (let k = 0; k < def.spikes; k++) {
    const a = (k / def.spikes) * Math.PI * 2;
    ctx.fillStyle = def.color;
    ctx.fillRect(Math.round(cx + Math.cos(a) * R * 0.66) - 1, Math.round(cx + Math.sin(a) * R * 0.66) - 1, 3, 3);
  }
  const out = { img: c, size, w: size, h: size, flash: silhouette(c, '#ffffff') };
  spriteCache.set(key, out);
  return out;
}

// Alien hive: an organic, pulsing nest.
export function hiveSprite() {
  if (spriteCache.has('hive')) return spriteCache.get('hive');
  const size = 68;
  const c = canvas(size, size);
  const ctx = c.getContext('2d');
  const cx = size / 2;
  const rnd = mulberry(77);
  const lumps = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    lumps.push({ x: cx + Math.cos(a) * 15, y: cx + Math.sin(a) * 15, r: 9 + rnd() * 5 });
  }
  lumps.push({ x: cx, y: cx, r: 18 });
  const cols = ['#1a0a24', '#3d1a5c', '#6a2f8f', '#a04dd6'];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let v = 0;
      let edge = 9;
      for (const l of lumps) {
        const d = Math.hypot(x + 0.5 - l.x, y + 0.5 - l.y);
        if (d < l.r) v = Math.max(v, 1 - d / l.r);
        edge = Math.min(edge, Math.abs(d - l.r));
      }
      if (v <= 0) continue;
      const dx = x - cx;
      const dy = y - cx;
      let lv = Math.max(0, Math.min(3, Math.floor(v * 2.2 + (-dx - dy) / 40 + 0.8 + dither(x, y) * 0.8)));
      if (v < 0.12) lv = -1;
      ctx.fillStyle = lv < 0 ? '#08030f' : cols[lv];
      ctx.fillRect(x, y, 1, 1);
    }
  // Glowing spawn pores.
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.3;
    ctx.fillStyle = '#9dff4a';
    ctx.fillRect(Math.round(cx + Math.cos(a) * 15) - 1, Math.round(cx + Math.sin(a) * 15) - 1, 3, 3);
  }
  ctx.fillStyle = '#ff4df0';
  ctx.fillRect(cx - 4, cx - 4, 8, 8);
  ctx.fillStyle = '#ffd6fb';
  ctx.fillRect(cx - 2, cx - 2, 4, 4);
  const out = { img: c, size, w: size, h: size, flash: silhouette(c, '#ffffff') };
  spriteCache.set('hive', out);
  return out;
}

// Sprite + draw scale for any enemy.
export function enemySprite(e, BOSSES) {
  if (e.kind === 'boss') return { spr: bossSprite(BOSSES[e.bossKey]), k: 1 };
  if (e.kind === 'hive') return { spr: hiveSprite(), k: 1 };
  const pal = { pirate: 'pirate', brute: 'brute', bomber: 'bomber', sniper: 'sniper', guardian: 'guardian' }[e.kind] || 'alien';
  return { spr: mapSprite(e.kind, pal), k: (e.kind === 'pirate' ? 1 : 1.5) * (e.elite ? 1.3 : 1) };
}

// ------------------------------------------------------------ station hub
export function stationHub() {
  if (spriteCache.has('hub')) return spriteCache.get('hub');
  const size = 44;
  const c = canvas(size, size);
  const ctx = c.getContext('2d');
  const cx = size / 2;
  const cols = ['#1b2140', '#2c3766', '#4a5a96', '#8597d6'];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cx;
      const d = Math.hypot(dx, dy);
      if (d > 17) continue;
      if (d > 16) {
        ctx.fillStyle = '#080a18';
      } else {
        const nz = Math.sqrt(Math.max(0, 1 - (d / 16) ** 2));
        let l = (-dx / 16) * 0.5 + (-dy / 16) * 0.5 + nz * 0.6;
        let lv = Math.max(0, Math.min(3, Math.floor(l * 3 + dither(x, y) * 0.9)));
        // Panel seams.
        if ((Math.abs(dx) < 0.6 || Math.abs(dy) < 0.6) && d < 15) lv = 0;
        if (Math.abs(d - 9) < 0.6) lv = Math.max(0, lv - 1);
        ctx.fillStyle = cols[lv];
      }
      ctx.fillRect(x, y, 1, 1);
    }
  // Core window.
  ctx.fillStyle = '#0e1a33';
  ctx.fillRect(cx - 4, cx - 4, 8, 8);
  ctx.fillStyle = '#3ee8ff';
  ctx.fillRect(cx - 3, cx - 3, 6, 6);
  ctx.fillStyle = '#c9fbff';
  ctx.fillRect(cx - 2, cx - 2, 2, 2);
  const out = { img: c, size };
  spriteCache.set('hub', out);
  return out;
}

// The whole station (arms, ring, hub) as one image, for the cockpit view.
export function stationSprite() {
  if (spriteCache.has('station')) return spriteCache.get('station');
  const size = 112;
  const c = canvas(size, size);
  const ctx = c.getContext('2d');
  const cx = size / 2;
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2;
    for (let d = 18; d < 54; d++) {
      ctx.fillStyle = d > 34 ? (d % 3 === 0 ? '#1d2c5e' : '#2f56a8') : '#3b456e';
      const w = d > 34 ? 3 : 1;
      for (let o = -w; o <= w; o++) ctx.fillRect(Math.round(cx + Math.cos(a) * d - Math.sin(a) * o), Math.round(cx + Math.sin(a) * d + Math.cos(a) * o), 1, 1);
    }
  }
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    ctx.fillStyle = i % 7 === 0 ? '#ff8c42' : i % 2 ? '#56669e' : '#7f8fc4';
    ctx.fillRect(Math.round(cx + Math.cos(a) * 30) - 1, Math.round(cx + Math.sin(a) * 30) - 1, 3, 3);
  }
  const hub = stationHub();
  ctx.drawImage(hub.img, cx - hub.size / 2, cx - hub.size / 2);
  const out = { img: c, size };
  spriteCache.set('station', out);
  return out;
}

export function clearSpriteCache() {
  spriteCache.clear();
}
