// Small math helpers shared by simulation and rendering.
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (lo, hi) => lo + Math.random() * (hi - lo);
export const randInt = (lo, hi) => Math.floor(rand(lo, hi + 1));
export const dist2 = (ax, ay, bx, by) => (ax - bx) * (ax - bx) + (ay - by) * (ay - by);
export const dist = (ax, ay, bx, by) => Math.sqrt(dist2(ax, ay, bx, by));
export const len = (x, y) => Math.sqrt(x * x + y * y);
export const angleTo = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);
export const TAU = Math.PI * 2;

export function wrapAngle(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}

// Rotate `from` toward `to` by at most `step` radians.
export function turnToward(from, to, step) {
  const d = wrapAngle(to - from);
  return Math.abs(d) <= step ? to : from + Math.sign(d) * step;
}

export function pickWeighted(weights) {
  let total = 0;
  for (const k in weights) total += Math.max(0, weights[k]);
  let r = Math.random() * total;
  for (const k in weights) {
    r -= Math.max(0, weights[k]);
    if (r <= 0) return k;
  }
  return Object.keys(weights)[0];
}

// Distance along a ray (origin o, unit dir d) to the first hit of a circle, or -1.
export function rayCircle(ox, oy, dx, dy, cx, cy, r) {
  const fx = ox - cx;
  const fy = oy - cy;
  const b = fx * dx + fy * dy;
  const c = fx * fx + fy * fy - r * r;
  if (c <= 0) return 0; // origin inside
  const disc = b * b - c;
  if (disc < 0) return -1;
  const t = -b - Math.sqrt(disc);
  return t >= 0 ? t : -1;
}

export function fmt(n) {
  n = Math.floor(n);
  if (Math.abs(n) < 10000) return n.toLocaleString('en-US');
  const units = ['K', 'M', 'B', 'T'];
  let u = -1;
  let v = n;
  while (Math.abs(v) >= 1000 && u < units.length - 1) {
    v /= 1000;
    u++;
  }
  return (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1)) + units[u];
}

export function fmtTime(s) {
  s = Math.max(0, Math.ceil(s));
  if (s >= 3600) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  if (s >= 60) return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
  return `${s}s`;
}
