'use strict';
/* ===== Neon Warfront – utilities ===== */
window.G = window.G || {};

G.rng = function (seed) {
  let a = seed >>> 0;
  const f = function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.int = n => Math.floor(f() * n);
  f.pick = arr => arr[Math.floor(f() * arr.length)];
  f.range = (lo, hi) => lo + f() * (hi - lo);
  f.shuffle = arr => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(f() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
  return f;
};

G.hashStr = function (s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

/* value noise + fbm */
G.makeNoise = function (seed) {
  const hash = (x, y) => {
    let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const sm = t => t * t * (3 - 2 * t);
  const n2 = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    const u = sm(xf), v = sm(yf);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  return function fbm(x, y, oct = 4) {
    let s = 0, amp = 1, f = 1, tot = 0;
    for (let i = 0; i < oct; i++) { s += n2(x * f, y * f) * amp; tot += amp; amp *= 0.5; f *= 2.03; }
    return s / tot;
  };
};

G.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
G.lerp = (a, b, t) => a + (b - a) * t;
G.sleep = ms => new Promise(r => setTimeout(r, ms));

/* colors */
G.hexToRgb = function (h) {
  h = h.replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
G.rgb = (r, g, b, a = 1) => `rgba(${r | 0},${g | 0},${b | 0},${a})`;
G.shade = function (hex, amt, a = 1) {
  const [r, g, b] = G.hexToRgb(hex);
  if (amt >= 0) return G.rgb(r + (255 - r) * amt, g + (255 - g) * amt, b + (255 - b) * amt, a);
  return G.rgb(r * (1 + amt), g * (1 + amt), b * (1 + amt), a);
};
G.alpha = (hex, a) => { const [r, g, b] = G.hexToRgb(hex); return G.rgb(r, g, b, a); };
G.mix = function (h1, h2, t) {
  const a = G.hexToRgb(h1), b = G.hexToRgb(h2);
  return G.rgb(G.lerp(a[0], b[0], t), G.lerp(a[1], b[1], t), G.lerp(a[2], b[2], t));
};

/* hex grid (pointy-top, odd-r offset) */
G.HEX = {
  SQ: 0.78, // vertical squash for 2.5D look
  dirs(row) {
    return (row & 1)
      ? [[1, 0], [1, 1], [0, 1], [-1, 0], [0, -1], [1, -1]]
      : [[1, 0], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1]];
  }
};

G.fmt = n => Math.round(n).toLocaleString('en-US');

G.el = function (tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};
