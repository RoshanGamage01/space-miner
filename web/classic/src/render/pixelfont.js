// A 3x5 bitmap font for in-world text (damage numbers, pickups, prompts).
// Text is rendered once into a small cached canvas with a dark outline.
const G = {
  0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111', 4: '101101111001001',
  5: '111100111001111', 6: '111100111101111', 7: '111001010010010', 8: '111101111101111', 9: '111101111001111',
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111',
  F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010',
  K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '010101101101010',
  P: '110101110100100', Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010',
  Z: '111001010100111', '+': '000010111010000', '-': '000000111000000', '!': '010010010000010', '.': '000000000000010',
  ':': '000010000010000', '/': '001001010100100', '%': '101001010100101', ' ': '000000000000000', x: '000101010101000',
  '[': '110100100100110', ']': '011001001001011', '?': '111001010000010', ',': '000000000010100', "'": '010010000000000',
};

const cache = new Map();
const hasDOM = typeof document !== 'undefined';

export function textWidth(text, scale = 1) {
  return (text.length * 4 - 1) * scale;
}

export function textSprite(text, color = '#ffffff', scale = 1, outline = '#05060d') {
  const key = `${text}|${color}|${scale}|${outline}`;
  let c = cache.get(key);
  if (c) return c;
  if (!hasDOM) return null;
  if (cache.size > 400) cache.clear();
  const up = String(text).toUpperCase();
  const w = textWidth(up, scale) + 2;
  const h = 5 * scale + 2;
  c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  const draw = (ox, oy, col) => {
    ctx.fillStyle = col;
    for (let i = 0; i < up.length; i++) {
      const g = G[up[i]] || G['?'];
      for (let p = 0; p < 15; p++) {
        if (g[p] !== '1') continue;
        ctx.fillRect(ox + (i * 4 + (p % 3)) * scale, oy + Math.floor(p / 3) * scale, scale, scale);
      }
    }
  };
  if (outline) for (const [dx, dy] of [[0, 1], [2, 1], [1, 0], [1, 2]]) draw(dx, dy, outline);
  draw(1, 1, color);
  cache.set(key, c);
  return c;
}

export function drawText(ctx, text, x, y, color, scale = 1, align = 'center', alpha = 1) {
  const s = textSprite(text, color, scale);
  if (!s) return;
  let dx = Math.round(x);
  if (align === 'center') dx -= Math.floor(s.width / 2);
  else if (align === 'right') dx -= s.width;
  if (alpha < 1) ctx.globalAlpha = alpha;
  ctx.drawImage(s, dx, Math.round(y - s.height / 2));
  if (alpha < 1) ctx.globalAlpha = 1;
}
