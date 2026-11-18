// Planet model (pure math, no rendering): terrain height on a sphere, biome
// colours, where settlements sit, and which props grow in each surface cell.
import { clamp, fbm, hash32, lerp, mulberry, range, ridged, smoothstep } from '../core/rng.js';
import { BIOMES } from './data.js';

// ---------------------------------------------------------------- cube sphere
export function faceDir(face, u, v, out = [0, 0, 0]) {
  let x, y, z;
  switch (face) {
    case 0: x = 1; y = v; z = -u; break;
    case 1: x = -1; y = v; z = u; break;
    case 2: x = u; y = 1; z = -v; break;
    case 3: x = u; y = -1; z = v; break;
    case 4: x = u; y = v; z = 1; break;
    default: x = -u; y = v; z = -1;
  }
  const l = Math.hypot(x, y, z);
  out[0] = x / l;
  out[1] = y / l;
  out[2] = z / l;
  return out;
}

export function dirToFace(x, y, z) {
  const ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z);
  if (ax >= ay && ax >= az) return x > 0 ? { face: 0, u: -z / ax, v: y / ax } : { face: 1, u: z / ax, v: y / ax };
  if (ay >= ax && ay >= az) return y > 0 ? { face: 2, u: x / ay, v: -z / ay } : { face: 3, u: x / ay, v: z / ay };
  return z > 0 ? { face: 4, u: x / az, v: y / az } : { face: 5, u: -x / az, v: y / az };
}

export const SITE_RADIUS = { village: 75, capital: 130, outpost: 55, ruins: 50, gate: 95, crash: 26 };
export const PROP_LEVEL = 5; // 32 x 32 cells per cube face
export const CELLS = 1 << PROP_LEVEL;

const RES_HP = { tree: 30, bush: 10, rock: 28, copper: 40, gold: 55, sodium: 8, oxygen: 8, aetherium: 70 };
const RES_YIELD = { tree: ['carbon', 16], bush: ['carbon', 6], rock: ['ferrite', 14], copper: ['copper', 12], gold: ['gold', 6], sodium: ['sodium', 8], oxygen: ['oxygen', 8], aetherium: ['aetherium', 4] };

export class Planet {
  constructor(desc) {
    this.desc = desc;
    this.id = desc.id;
    this.name = desc.name;
    this.radius = desc.radius;
    this.biome = BIOMES[desc.type];
    this.seed = desc.seed;
    const r = mulberry(desc.seed);
    this.off = [range(r, -50, 50), range(r, -50, 50), range(r, -50, 50)];
    this.waterBias = lerp(38, -30, this.biome.water);
    this.hasWater = this.biome.water > 0;
    this.sites = [];
    this.placeSites();
  }

  // Terrain height in metres above sea level, before settlements flatten it.
  baseHeight(x, y, z) {
    const o = this.off;
    const px = x + o[0], py = y + o[1], pz = z + o[2];
    const rel = this.desc.relief;
    let h = fbm(px * 1.3, py * 1.3, pz * 1.3, 5) * 75 * rel + this.waterBias;
    const mask = smoothstep(0.05, 0.55, fbm(px * 0.9 + 9.1, py * 0.9, pz * 0.9, 3));
    h += ridged(px * 2.4 + 3.7, py * 2.4, pz * 2.4, 5) * mask * 190 * rel;
    h += fbm(px * 14, py * 14, pz * 14, 4) * 7;
    h += fbm(px * 70, py * 70, pz * 70, 3) * 1.1;
    if (h < 0) h *= 0.55; // gentler sea floor
    return h;
  }

  height(x, y, z) {
    let h = this.baseHeight(x, y, z);
    const R = this.radius;
    for (const s of this.sites) {
      const d = s.dir;
      const dot = x * d[0] + y * d[1] + z * d[2];
      if (dot < s.cosReach) continue;
      const dist = Math.sqrt(Math.max(0, 2 - 2 * dot)) * R;
      const w = 1 - smoothstep(s.radius, s.radius * 1.9, dist);
      h = lerp(h, s.h, w);
    }
    return h;
  }

  // Distance from the planet centre to the ground along a direction.
  groundRadius(x, y, z) {
    return this.radius + this.height(x, y, z);
  }

  // Colour for a point given its height, slope (0 flat .. 1 wall) and position.
  color(x, y, z, h, slope, out) {
    const b = this.biome;
    const o = this.off;
    const n = fbm(x * 9 + o[1], y * 9 + o[2], z * 9 + o[0], 3) * 0.5 + 0.5;
    const rel = this.desc.relief;
    let c;
    const beach = this.hasWater ? 3.5 : -1e9;
    if (h < beach) c = b.sand;
    else if (h < 45 * rel + n * 20) c = mix3(b.low, b.mid, n);
    else if (h < 120 * rel + n * 30) c = mix3(b.mid, b.high, smoothstep(45 * rel, 120 * rel, h));
    else c = mix3(b.high, b.peak, smoothstep(120 * rel, 175 * rel, h + n * 25));
    const cliff = smoothstep(0.5, 0.78, slope) * (h > beach ? 1 : 0.3);
    const v = 0.86 + n * 0.28;
    out[0] = lerp(c[0], b.cliff[0], cliff) * v;
    out[1] = lerp(c[1], b.cliff[1], cliff) * v;
    out[2] = lerp(c[2], b.cliff[2], cliff) * v;
    return out;
  }

  // Choose a buildable spot for every site the planet description asks for.
  placeSites() {
    const rnd = mulberry(hash32('sites', this.seed));
    const R = this.radius;
    const placed = [];
    const far = (d, min) => placed.every((s) => Math.sqrt(Math.max(0, 2 - 2 * (d[0] * s.dir[0] + d[1] * s.dir[1] + d[2] * s.dir[2]))) * R > min);
    const tangent = (d) => {
      const up = Math.abs(d[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
      const t = norm(cross(up, d));
      return [t, cross(d, t)];
    };
    // The crash site is placed last so it can sit beside a village.
    const specs = [...this.desc.sites].sort((p, q) => (p.type === 'crash') - (q.type === 'crash'));
    for (const spec of specs) {
      let best = null;
      let bestScore = -1e9;
      const village = spec.type === 'crash' ? placed.find((s) => s.type === 'village') : null;
      for (let i = 0; i < 260; i++) {
        let d;
        if (village) {
          // The crash site is a short walk from the first village.
          const [t, bt] = tangent(village.dir);
          const a = rnd() * Math.PI * 2;
          const off = range(rnd, 230, 330) / R;
          d = norm([village.dir[0] + (t[0] * Math.cos(a) + bt[0] * Math.sin(a)) * off, village.dir[1] + (t[1] * Math.cos(a) + bt[1] * Math.sin(a)) * off, village.dir[2] + (t[2] * Math.cos(a) + bt[2] * Math.sin(a)) * off]);
        } else {
          const zz = rnd() * 2 - 1;
          const a = rnd() * Math.PI * 2;
          const rr = Math.sqrt(1 - zz * zz);
          d = [rr * Math.cos(a), zz, rr * Math.sin(a)];
          if (!far(d, 700)) continue;
        }
        const h = this.baseHeight(d[0], d[1], d[2]);
        const [t, bt] = tangent(d);
        const e = 45 / R;
        let rough = 0;
        for (const [sx, sy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const q = norm([d[0] + (t[0] * sx + bt[0] * sy) * e, d[1] + (t[1] * sx + bt[1] * sy) * e, d[2] + (t[2] * sx + bt[2] * sy) * e]);
          rough += Math.abs(this.baseHeight(q[0], q[1], q[2]) - h);
        }
        const score = -rough - (h < 5 ? (5 - h) * 6 : 0) - (h > 70 ? (h - 70) * 0.5 : 0);
        if (score > bestScore) {
          bestScore = score;
          best = { d, h };
        }
        if (score > -8 && i > 12) break;
      }
      const radius = SITE_RADIUS[spec.type];
      const site = {
        ...spec,
        index: placed.length,
        id: `${this.id}/${placed.length}`,
        dir: best.d,
        h: Math.max(best.h, this.hasWater ? 6 : best.h),
        radius,
        cosReach: Math.cos(Math.min(1.5, (radius * 2) / R)),
        seed: hash32('site', this.seed, placed.length),
      };
      placed.push(site);
    }
    this.sites = placed;
  }

  siteAt(x, y, z, pad = 1) {
    const R = this.radius;
    for (const s of this.sites) {
      const dot = x * s.dir[0] + y * s.dir[1] + z * s.dir[2];
      if (dot < s.cosReach) continue;
      if (Math.sqrt(Math.max(0, 2 - 2 * dot)) * R < s.radius * pad) return s;
    }
    return null;
  }

  // Deterministic props (trees, rocks, ore, plants) for one surface cell.
  propsForCell(face, i, j) {
    const rnd = mulberry(hash32('cell', this.seed, face, i, j));
    const b = this.biome;
    const out = [];
    const d = [0, 0, 0];
    const add = (type, k, scaleLo, scaleHi) => {
      const u = ((i + rnd()) / CELLS) * 2 - 1;
      const v = ((j + rnd()) / CELLS) * 2 - 1;
      const scale = range(rnd, scaleLo, scaleHi);
      const rot = rnd() * Math.PI * 2;
      faceDir(face, u, v, d);
      const h = this.height(d[0], d[1], d[2]);
      if (h < 1.2 && this.hasWater) return;
      if (this.siteAt(d[0], d[1], d[2], 1.15)) return;
      if (type === 'tree' && h > 130 * this.desc.relief) return;
      const r = this.radius + h;
      const [res, amount] = RES_YIELD[type];
      out.push({ id: `${face}.${i}.${j}.${k}`, type, res, amount: Math.round(amount * scale), hp: RES_HP[type] * scale, dir: [d[0], d[1], d[2]], pos: [d[0] * r, d[1] * r, d[2] * r], scale, rot });
    };
    let k = 0;
    if (b.tree !== 'none') {
      const grove = fbm(face * 3.1 + i * 0.21 + this.off[0], j * 0.21 + this.off[1], this.off[2], 2) * 0.5 + 0.5;
      const trees = Math.floor(b.flora * grove * 7 + rnd() * 1.2);
      for (let t = 0; t < trees; t++) add('tree', k++, 0.7, 1.6);
      const bushes = Math.floor(b.flora * 3 * rnd() + 0.4);
      for (let t = 0; t < bushes; t++) add('bush', k++, 0.7, 1.3);
    }
    const rocks = 1 + Math.floor(rnd() * 2.2);
    for (let t = 0; t < rocks; t++) add('rock', k++, 0.6, 2.2);
    for (const res of ['copper', 'gold', 'sodium', 'oxygen', 'aetherium']) {
      const w = b.res[res] || 0;
      if (rnd() < w * 0.13) add(res, k++, 0.8, 1.4);
    }
    return out;
  }

  cellOf(x, y, z) {
    const f = dirToFace(x, y, z);
    return { face: f.face, i: clamp(Math.floor(((f.u + 1) / 2) * CELLS), 0, CELLS - 1), j: clamp(Math.floor(((f.v + 1) / 2) * CELLS), 0, CELLS - 1), u: f.u, v: f.v };
  }
}

// One Planet per description, shared by generation and rendering.
const planets = new Map();
export function getPlanet(desc) {
  let p = planets.get(desc.id);
  if (!p || p.desc !== desc) {
    p = new Planet(desc);
    if (planets.size > 60) planets.clear();
    planets.set(desc.id, p);
  }
  return p;
}

function mix3(a, b, t) {
  t = clamp(t, 0, 1);
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}
export function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
export function norm(a) {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}
