'use strict';
/* ===== Neon Warfront – procedural world generator ===== */
G.MAPS = {};
G.getMap = wi => G.MAPS[wi] || (G.MAPS[wi] = G.genMap(wi));

G.HEIGHTS = { plain: 5, forest: 6, beach: 3, mountain: 12, city: 6, resource: 5 };

G.genMap = function (wi) {
  const w = G.WORLDS[wi];
  const seed = G.hashStr('neon-warfront-v1-world-' + wi);
  const R = G.rng(seed);
  const noise = G.makeNoise(seed % 99991);
  const noise2 = G.makeNoise((seed >>> 5) % 99991 + 17);
  const W = w.W, H = w.H, r = 26, s3 = Math.sqrt(3), SQ = G.HEX.SQ;
  const N = W * H;
  const hexes = [];
  const elev = new Float32Array(N);

  for (let row = 0; row < H; row++) {
    for (let col = 0; col < W; col++) {
      const dx = (col / (W - 1) - 0.5) * 2, dy = (row / (H - 1) - 0.5) * 2;
      const d = Math.sqrt(dx * dx * 0.85 + dy * dy * 1.05);
      let e = noise(col * 0.12 + 3.1, row * 0.12 + 7.7, 5) * 1.25 - d * d * 0.75;
      if (row === 0 || col === 0 || row === H - 1 || col === W - 1) e -= 5;
      elev[row * W + col] = e;
    }
  }
  const sorted = Array.from(elev).sort((a, b) => a - b);
  const thr = sorted[Math.floor(N * (wi === 4 ? 0.36 : 0.44))];
  const emax = sorted[N - 1];

  const isLand = new Uint8Array(N);
  for (let i = 0; i < N; i++) isLand[i] = elev[i] > thr ? 1 : 0;

  const nbrIdx = (i) => {
    const row = Math.floor(i / W), col = i % W, out = [];
    for (const [dc, dr] of G.HEX.dirs(row)) {
      const c = col + dc, rr = row + dr;
      out.push(c < 0 || rr < 0 || c >= W || rr >= H ? -1 : rr * W + c);
    }
    return out;
  };

  // keep the largest land component
  const comp = new Int32Array(N).fill(-1);
  let best = -1, bestSize = 0, cid = 0;
  for (let i = 0; i < N; i++) {
    if (!isLand[i] || comp[i] >= 0) continue;
    const st = [i]; comp[i] = cid; let sz = 0;
    while (st.length) {
      const k = st.pop(); sz++;
      for (const n of nbrIdx(k)) if (n >= 0 && isLand[n] && comp[n] < 0) { comp[n] = cid; st.push(n); }
    }
    if (sz > bestSize) { bestSize = sz; best = cid; }
    cid++;
  }
  for (let i = 0; i < N; i++) if (isLand[i] && comp[i] !== best) isLand[i] = 0;

  // build hex records
  const grid = new Int32Array(N).fill(-1);
  for (let i = 0; i < N; i++) {
    const row = Math.floor(i / W), col = i % W;
    const x = r * s3 * (col + 0.5 * (row & 1)) + r * s3 * 0.5 + 10;
    const y = r * 1.5 * row + r + 10;
    const hx = { i, col, row, x, y, land: !!isLand[i], el: (elev[i] - thr) / (emax - thr), terr: 'water', tid: -1, h: 0, coast: false, rnd: R() };
    hexes.push(hx);
  }
  for (const hx of hexes) {
    hx.nb = nbrIdx(hx.i);
    if (!hx.land) continue;
    hx.coast = hx.nb.some(n => n < 0 || !isLand[n]);
    const m = noise2(hx.col * 0.17, hx.row * 0.17, 3);
    if (hx.el > 0.6) hx.terr = 'mountain';
    else if (hx.coast && wi !== 4) hx.terr = 'beach';
    else if (m > 0.56) hx.terr = 'forest';
    else hx.terr = 'plain';
  }
  for (const hx of hexes) if (!hx.land) hx.shallow = hx.nb.some(n => n >= 0 && isLand[n]);

  const landHexes = hexes.filter(h => h.land);
  const dist2 = (a, b) => { const dx = a.x - b.x, dy = a.y - b.y; return dx * dx + dy * dy; };

  // ---- territory seeds ----
  const K = w.terr;
  let D = Math.sqrt(landHexes.length / K) * r * s3 * 0.95;
  const seeds = [];
  let guard = 0;
  while (seeds.length < K && guard < 200) {
    guard++;
    const cand = R.shuffle(landHexes.slice());
    for (const c of cand) {
      if (seeds.length >= K) break;
      if (seeds.every(s => dist2(s, c) > D * D)) seeds.push(c);
    }
    D *= 0.92;
  }
  // ---- grow territories (randomised dijkstra) ----
  const dist = new Float64Array(N).fill(Infinity);
  const heap = [];
  const push = (d, i, t) => { heap.push([d, i, t]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const a = 2 * k + 1, b = a + 1; let m = k; if (a < heap.length && heap[a][0] < heap[m][0]) m = a; if (b < heap.length && heap[b][0] < heap[m][0]) m = b; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
  seeds.forEach((s, t) => { dist[s.i] = 0; push(0, s.i, t); });
  while (heap.length) {
    const [d, i, t] = pop();
    if (d > dist[i]) continue;
    hexes[i].tid = t;
    for (const n of hexes[i].nb) {
      if (n < 0 || !isLand[n]) continue;
      const nd = d + 1 + R() * 0.9 + (hexes[n].terr === 'mountain' ? 0.5 : 0);
      if (nd < dist[n]) { dist[n] = nd; push(nd, n, t); }
    }
  }

  // ---- territories ----
  const names = [];
  for (const p of w.pre) for (const s of w.suf) names.push(p + ' ' + s);
  R.shuffle(names);
  const terrs = seeds.map((s, t) => ({ id: t, hexes: [], adj: [], name: names[t % names.length], type: 'plain', country: -1 }));
  for (const hx of landHexes) terrs[hx.tid].hexes.push(hx.i);

  for (const T of terrs) {
    const adj = new Set();
    let sx = 0, sy = 0;
    const cnt = {};
    for (const i of T.hexes) {
      const hx = hexes[i];
      sx += hx.x; sy += hx.y;
      cnt[hx.terr] = (cnt[hx.terr] || 0) + 1;
      for (const n of hx.nb) if (n >= 0 && isLand[n] && hexes[n].tid !== T.id) adj.add(hexes[n].tid);
    }
    T.adj = Array.from(adj);
    const cxm = sx / T.hexes.length, cym = sy / T.hexes.length;
    let bestH = null, bd = Infinity;
    for (const i of T.hexes) {
      const hx = hexes[i];
      const interior = hx.nb.every(n => n >= 0 && hexes[n].tid === T.id);
      const d = (hx.x - cxm) ** 2 + (hx.y - cym) ** 2 - (interior ? 1e6 : 0);
      if (d < bd) { bd = d; bestH = hx; }
    }
    T.center = bestH.i;
    const mt = (cnt.mountain || 0) / T.hexes.length;
    T.type = mt >= 0.4 ? 'mountain' : (cnt.forest || 0) > T.hexes.length * 0.45 ? 'forest' : (cnt.beach || 0) > T.hexes.length * 0.5 ? 'beach' : 'plain';
  }

  // cities and resources
  const cityFrac = wi === 4 ? 0.5 : 0.22;
  const order = R.shuffle(terrs.slice());
  let nCity = Math.round(K * cityFrac), nRes = Math.round(K * 0.16);
  for (const T of order) {
    if (nCity > 0 && T.type !== 'mountain') {
      T.type = 'city'; nCity--;
      const c = hexes[T.center]; c.terr = 'city';
      for (const n of c.nb) if (n >= 0 && hexes[n].tid === T.id && R() < (wi === 4 ? 0.95 : 0.6)) hexes[n].terr = 'city';
      if (wi === 4) for (const i of T.hexes) if (hexes[i].terr === 'plain' && R() < 0.5) hexes[i].terr = 'city';
    } else if (nRes > 0) {
      T.type = 'resource'; nRes--;
      hexes[T.center].terr = 'resource';
    }
  }
  for (const hx of landHexes) hx.h = G.HEIGHTS[hx.terr] + (hx.terr === 'mountain' ? Math.round(hx.el * 6) : 0);
  for (const T of terrs) {
    const c = hexes[T.center];
    T.cx = c.x; T.cy = c.y * SQ - c.h;
  }

  // ---- countries ----
  const KC = w.countries.length;
  const cseeds = [R.int(K)];
  while (cseeds.length < KC) {
    let bi = 0, bv = -1;
    for (const T of terrs) {
      if (cseeds.includes(T.id)) continue;
      const v = Math.min(...cseeds.map(s => (terrs[s].cx - T.cx) ** 2 + (terrs[s].cy - T.cy) ** 2));
      if (v > bv) { bv = v; bi = T.id; }
    }
    cseeds.push(bi);
  }
  const countries = cseeds.map((s, c) => ({ id: c, name: w.countries[c], tids: [s], seed: s }));
  cseeds.forEach((s, c) => { terrs[s].country = c; });
  let left = K - KC, g2 = 0;
  while (left > 0 && g2 < 10000) {
    g2++;
    const byS = countries.slice().sort((a, b) => a.tids.length - b.tids.length);
    let grew = false;
    for (const C of byS) {
      const cand = [];
      for (const t of C.tids) for (const a of terrs[t].adj) if (terrs[a].country < 0 && !cand.includes(a)) cand.push(a);
      if (!cand.length) continue;
      const sd = terrs[C.seed];
      cand.sort((a, b) => ((terrs[a].cx - sd.cx) ** 2 + (terrs[a].cy - sd.cy) ** 2) - ((terrs[b].cx - sd.cx) ** 2 + (terrs[b].cy - sd.cy) ** 2));
      const pick = cand[R() < 0.75 ? 0 : R.int(cand.length)];
      terrs[pick].country = C.id; C.tids.push(pick); left--; grew = true;
      break;
    }
    if (!grew) break;
  }
  for (const C of countries) C.bonus = Math.round(C.tids.length * 6);

  // ---- border segments (in screen-map coords) ----
  const corner = (hx, k) => {
    const a = (Math.PI / 180) * (60 * k - 30);
    return [hx.x + r * Math.cos(a), (hx.y + r * Math.sin(a)) * SQ - hx.h];
  };
  for (const T of terrs) {
    T.edges = []; T.cedges = []; T.coast = [];
    for (const i of T.hexes) {
      const hx = hexes[i];
      for (let k = 0; k < 6; k++) {
        const n = hx.nb[k];
        const nh = n >= 0 ? hexes[n] : null;
        if (nh && nh.tid === T.id) continue;
        const seg = [corner(hx, k), corner(hx, (k + 1) % 6)];
        T.edges.push(seg);
        if (!nh || !nh.land) T.coast.push(seg);
        else if (terrs[nh.tid].country !== T.country) T.cedges.push(seg);
      }
    }
  }

  const width = r * s3 * (W + 1) + 20;
  const height = (r * 1.5 * (H - 1) + 2 * r + 20) * SQ + 24;
  return { wi, W, H, r, hexes, terrs, countries, width, height, corner, seed };
};
