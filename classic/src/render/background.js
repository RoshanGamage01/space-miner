// Deep-space backdrop: tiled parallax star layers, a dithered nebula, a
// distant planet and twinkling stars. Regenerated per sector palette.
import { SECTORS } from '../core/config.js';
import { canvas, mulberry, planetSprite } from './sprites.js';

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

function starTile(seed, size, count, colors, big) {
  const rnd = mulberry(seed);
  const c = canvas(size, size);
  const ctx = c.getContext('2d');
  for (let i = 0; i < count; i++) {
    const x = Math.floor(rnd() * size);
    const y = Math.floor(rnd() * size);
    ctx.fillStyle = colors[Math.floor(rnd() * colors.length)];
    ctx.globalAlpha = 0.35 + rnd() * 0.65;
    ctx.fillRect(x, y, 1, 1);
    if (big && rnd() < 0.15) {
      ctx.globalAlpha *= 0.5;
      ctx.fillRect(x - 1, y, 3, 1);
      ctx.fillRect(x, y - 1, 1, 3);
    }
  }
  return c;
}

// Tileable value noise.
function noiseTile(seed, size, cell) {
  const rnd = mulberry(seed);
  const n = size / cell;
  const g = [];
  for (let i = 0; i < n * n; i++) g.push(rnd());
  const at = (i, j) => g[((j + n) % n) * n + ((i + n) % n)];
  const sm = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const fx = x / cell;
    const fy = y / cell;
    const i = Math.floor(fx);
    const j = Math.floor(fy);
    const tx = sm(fx - i);
    const ty = sm(fy - j);
    const a = at(i, j) + (at(i + 1, j) - at(i, j)) * tx;
    const b = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * tx;
    return a + (b - a) * ty;
  };
}

function nebulaTile(seed, size, colors) {
  const octs = [noiseTile(seed, size, 64), noiseTile(seed + 1, size, 32), noiseTile(seed + 2, size, 16), noiseTile(seed + 3, size, 8)];
  const hue = noiseTile(seed + 9, size, 128);
  const c = canvas(size, size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const rgb = colors.map((h) => {
    const v = parseInt(h.slice(1), 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  });
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const v = octs[0](x, y) * 0.5 + octs[1](x, y) * 0.25 + octs[2](x, y) * 0.15 + octs[3](x, y) * 0.1;
      let a = Math.max(0, (v - 0.45) * 2.6);
      // Posterize with dithering for the pixel-art look.
      const lv = Math.floor(a * 4 + BAYER[(y & 3) * 4 + (x & 3)] - 0.5);
      if (lv <= 0) continue;
      const h = hue(x, y);
      const col = h < 0.4 ? rgb[0] : h < 0.7 ? rgb[1] : rgb[2];
      const i = (y * size + x) * 4;
      img.data[i] = col[0];
      img.data[i + 1] = col[1];
      img.data[i + 2] = col[2];
      img.data[i + 3] = Math.min(255, lv * 34);
    }
  ctx.putImageData(img, 0, 0);
  return c;
}

export function createBackground(sectorId) {
  const sec = SECTORS[sectorId];
  const seed = sectorId.length * 977 + sectorId.charCodeAt(0) * 31;
  const p = sec.palette;
  const rnd = mulberry(seed + 5);
  const twinkles = [];
  for (let i = 0; i < 46; i++) twinkles.push({ x: rnd() * 1200, y: rnd() * 1200, p: rnd() * 6.28, s: 1 + rnd() * 2.5, c: rnd() < 0.3 ? '#9fe8ff' : rnd() < 0.5 ? '#ffd9a8' : p.star });
  return {
    layers: [
      { img: starTile(seed + 11, 256, 140, ['#5a6a99', '#6f7fb0', '#8d8fb8'], false), k: 0.06 },
      { img: nebulaTile(seed, 384, p.nebula), k: 0.1, nebula: true },
      { img: starTile(seed + 12, 256, 55, [p.star, '#b8c8ff', '#ffffff'], true), k: 0.2 },
      { img: starTile(seed + 13, 320, 28, ['#ffffff', p.star], true), k: 0.38 },
    ],
    debris: starTile(seed + 14, 256, 10, ['#59607a', '#3d4257'], false),
    planet: { sprite: planetSprite(seed, 30 + Math.floor(rnd() * 26), p.planet, rnd() < 0.6), x: 220 + rnd() * 200, y: -160 - rnd() * 120, k: 0.08 },
    moon: { sprite: planetSprite(seed + 77, 7 + Math.floor(rnd() * 5), ['#8a8fa8', '#5b6078', '#cfd4ea'], false), x: -260 - rnd() * 140, y: 90 + rnd() * 140, k: 0.12 },
    twinkles,
  };
}

function tile(ctx, img, ox, oy, W, H) {
  const w = img.width;
  const h = img.height;
  let sx = -(((ox % w) + w) % w);
  let sy0 = -(((oy % h) + h) % h);
  for (let x = sx; x < W; x += w) for (let y = sy0; y < H; y += h) ctx.drawImage(img, x, y);
}

export function drawBackground(ctx, bg, cam, W, H, time) {
  for (const L of bg.layers) {
    if (L.nebula) ctx.globalAlpha = 0.9;
    tile(ctx, L.img, Math.floor(cam.x * L.k), Math.floor(cam.y * L.k), W, H);
    ctx.globalAlpha = 1;
    if (L.k === 0.1) {
      // Planets sit between the nebula and the near stars.
      for (const pl of [bg.planet, bg.moon]) {
        const s = pl.sprite;
        const x = Math.round(W / 2 + pl.x - cam.x * pl.k - s.size / 2);
        const y = Math.round(H / 2 + pl.y - cam.y * pl.k - s.size / 2);
        if (x > -s.size && x < W && y > -s.size && y < H) ctx.drawImage(s.img, x, y);
      }
    }
  }
  // Twinkling stars.
  for (const t of bg.twinkles) {
    const x = Math.floor((((t.x - cam.x * 0.25) % 1200) + 1200) % 1200) - (1200 - W) / 2;
    const y = Math.floor((((t.y - cam.y * 0.25) % 1200) + 1200) % 1200) - (1200 - H) / 2;
    if (x < -2 || y < -2 || x > W + 2 || y > H + 2) continue;
    const a = 0.5 + 0.5 * Math.sin(time * t.s + t.p);
    ctx.globalAlpha = a;
    ctx.fillStyle = t.c;
    ctx.fillRect(x, y, 1, 1);
    if (a > 0.75) {
      ctx.globalAlpha = (a - 0.75) * 2;
      ctx.fillRect(x - 1, y, 3, 1);
      ctx.fillRect(x, y - 1, 1, 3);
    }
  }
  ctx.globalAlpha = 1;
}

// Foreground dust drifts faster than the world to sell the sense of speed.
export function drawDebris(ctx, bg, cam, W, H) {
  ctx.globalAlpha = 0.7;
  tile(ctx, bg.debris, Math.floor(cam.x * 1.25), Math.floor(cam.y * 1.25), W, H);
  ctx.globalAlpha = 1;
}
