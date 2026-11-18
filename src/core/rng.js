// Deterministic randomness and noise. Everything in the universe is derived
// from integer seeds, so the same coordinates always produce the same world.

export function hash32(...keys) {
  let h = 2166136261 >>> 0;
  for (const k of keys) {
    const s = typeof k === 'number' ? String(Math.floor(k)) : String(k);
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
    h = Math.imul(h ^ 0x9e3779b9, 2246822519) >>> 0;
  }
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519) >>> 0;
  h ^= h >>> 13;
  return h >>> 0;
}

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

export const rngFrom = (...keys) => mulberry(hash32(...keys));
export const pick = (rnd, arr) => arr[Math.floor(rnd() * arr.length)];
export const range = (rnd, lo, hi) => lo + rnd() * (hi - lo);
export const irange = (rnd, lo, hi) => Math.floor(range(rnd, lo, hi + 1));

// ---------------------------------------------------------------- simplex 3D
const perm = new Uint8Array(512);
{
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  const r = mulberry(1337);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    const t = p[i];
    p[i] = p[j];
    p[j] = t;
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
}
const G3 = [1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0, 1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1, 0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1];
const F3 = 1 / 3;
const K3 = 1 / 6;

export function simplex3(x, y, z) {
  const s = (x + y + z) * F3;
  const i = Math.floor(x + s);
  const j = Math.floor(y + s);
  const k = Math.floor(z + s);
  const t = (i + j + k) * K3;
  const x0 = x - i + t;
  const y0 = y - j + t;
  const z0 = z - k + t;
  let i1, j1, k1, i2, j2, k2;
  if (x0 >= y0) {
    if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
    else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
    else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
  } else if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
  else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
  else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
  const x1 = x0 - i1 + K3, y1 = y0 - j1 + K3, z1 = z0 - k1 + K3;
  const x2 = x0 - i2 + 2 * K3, y2 = y0 - j2 + 2 * K3, z2 = z0 - k2 + 2 * K3;
  const x3 = x0 - 1 + 0.5, y3 = y0 - 1 + 0.5, z3 = z0 - 1 + 0.5;
  const ii = i & 255, jj = j & 255, kk = k & 255;
  let n = 0;
  let tt = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
  if (tt > 0) {
    const g = (perm[ii + perm[jj + perm[kk]]] % 12) * 3;
    tt *= tt;
    n += tt * tt * (G3[g] * x0 + G3[g + 1] * y0 + G3[g + 2] * z0);
  }
  tt = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
  if (tt > 0) {
    const g = (perm[ii + i1 + perm[jj + j1 + perm[kk + k1]]] % 12) * 3;
    tt *= tt;
    n += tt * tt * (G3[g] * x1 + G3[g + 1] * y1 + G3[g + 2] * z1);
  }
  tt = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
  if (tt > 0) {
    const g = (perm[ii + i2 + perm[jj + j2 + perm[kk + k2]]] % 12) * 3;
    tt *= tt;
    n += tt * tt * (G3[g] * x2 + G3[g + 1] * y2 + G3[g + 2] * z2);
  }
  tt = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
  if (tt > 0) {
    const g = (perm[ii + 1 + perm[jj + 1 + perm[kk + 1]]] % 12) * 3;
    tt *= tt;
    n += tt * tt * (G3[g] * x3 + G3[g + 1] * y3 + G3[g + 2] * z3);
  }
  return 32 * n; // roughly -1..1
}

export function fbm(x, y, z, octaves, lacunarity = 2, gain = 0.5) {
  let a = 1;
  let f = 1;
  let sum = 0;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += a * simplex3(x * f, y * f, z * f);
    norm += a;
    a *= gain;
    f *= lacunarity;
  }
  return sum / norm;
}

// Sharp ridges, good for mountain ranges. Returns 0..1.
export function ridged(x, y, z, octaves) {
  let a = 1;
  let f = 1;
  let sum = 0;
  let norm = 0;
  let prev = 1;
  for (let o = 0; o < octaves; o++) {
    let n = 1 - Math.abs(simplex3(x * f, y * f, z * f));
    n *= n;
    sum += a * n * prev;
    prev = n;
    norm += a;
    a *= 0.5;
    f *= 2.1;
  }
  return sum / norm;
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// ---------------------------------------------------------------- names
const SYL_A = ['Ka', 'Vel', 'Tor', 'Ny', 'Ae', 'Zor', 'Hal', 'Ix', 'Mor', 'Eri', 'Sol', 'Ves', 'Qua', 'Dra', 'Oph', 'Ul', 'Rhe', 'Cyn', 'Bel', 'Ith'];
const SYL_B = ['ra', 'th', 'en', 'os', 'ia', 'un', 'ar', 'el', 'ix', 'or', 'ae', 'um', 'is', 'yn', 'ax', 'eth'];
const SYL_C = ['ris', 'dan', 'mir', 'tos', 'lia', 'nor', 'vex', 'ron', 'this', 'gar', 'lune', 'phos', 'dra', ''];
export function makeName(rnd) {
  return pick(rnd, SYL_A) + pick(rnd, SYL_B) + pick(rnd, SYL_C);
}
