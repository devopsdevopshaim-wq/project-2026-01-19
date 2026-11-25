// node tools/fit_factors.js — fits factor weights (ordered logit) and the Poisson/factor mix.
// Train: Jul 2022 – Jun 2025. Test: Jul 2025 – today. Every factor uses only data before the match.
const fs = require('fs'), vm = require('vm');
const ctx = { console, Intl, Date, Math, Float64Array, Uint8Array, Map, Set, JSON, Object, localStorage: null,
  fetch: async () => ({ ok: true, json: async () => JSON.parse(fs.readFileSync(__dirname + '/../data/history.json')) }) };
vm.createContext(ctx);
for (const f of ['names.js', 'engine.js']) vm.runInContext(fs.readFileSync(__dirname + '/../js/' + f, 'utf8'), ctx);

vm.runInContext(`(async () => {
  await loadBundled();
  const LG = ['en.1','es.1','it.1','de.1','fr.1','nl.1','pt.1','en.2','tr.1','be.1'];
  const rows = [];
  for (const code of LG) {
    const L = DB.leagues[code];
    for (const m of L.m) {
      if (m.hg == null || m.d < '2022-07-01') continue;
      const fx = factorsFor(code, m.h, m.a, m.d);
      if (Math.min(fx.F.games[m.h], fx.F.games[m.a]) < 3) continue;
      const pm = summarizeMatrix(scoreMatrix(fx.lh, fx.la));
      rows.push({ code, d: m.d, y: m.hg > m.ag ? 0 : m.hg === m.ag ? 1 : 2, f: fx.d, pm });
    }
  }
  const train = rows.filter(r => r.d < '2025-07-01'), test = rows.filter(r => r.d >= '2025-07-01');
  const K = ['str','table','form','venue','h2h'];
  const nll = (P, set) => { let s = 0; for (const r of set) { const o = orderedLogit(r.f, P); s -= Math.log(Math.max([o.p1, o.px, o.p2][r.y], 1e-6)); } return s / set.length; };
  // coordinate/gradient descent with numeric gradients
  let P = { w: { str: 1, table: 0, form: 0, venue: 0, h2h: 0 }, t1: -0.5, t2: 0.6, mix: 0 };
  const keys = [...K.map(k => ['w', k]), ['t1'], ['t2']];
  const get = (P, k) => k.length === 2 ? P[k[0]][k[1]] : P[k[0]];
  const set = (P, k, v) => { if (k.length === 2) P[k[0]][k[1]] = v; else P[k[0]] = v; };
  let lr = 0.5;
  for (let it = 0; it < 120; it++) {
    const base = nll(P, train), g = [];
    for (const k of keys) { const Q = JSON.parse(JSON.stringify(P)); set(Q, k, get(P, k) + 1e-4); g.push((nll(Q, train) - base) / 1e-4); }
    const Q = JSON.parse(JSON.stringify(P));
    keys.forEach((k, i) => set(Q, k, get(P, k) - lr * g[i]));
    if (nll(Q, train) < base) P = Q; else lr *= 0.5;
    if (lr < 1e-4) break;
  }
  const evalSet = (set, mix) => {
    let ll = 0, acc = 0, top2 = 0;
    for (const r of set) {
      const o = orderedLogit(r.f, P);
      const p = [mix * r.pm.p1 + (1 - mix) * o.p1, mix * r.pm.px + (1 - mix) * o.px, mix * r.pm.p2 + (1 - mix) * o.p2];
      const z = p[0] + p[1] + p[2]; for (let i = 0; i < 3; i++) p[i] /= z;
      ll -= Math.log(p[r.y]);
      const ord = [0, 1, 2].sort((a, b) => p[b] - p[a]);
      if (ord[0] === r.y) acc++; if (ord[0] === r.y || ord[1] === r.y) top2++;
    }
    return { ll: ll / set.length, acc: acc / set.length, top2: top2 / set.length };
  };
  let bestMix = 0, bestLL = 9;
  for (let mx = 0; mx <= 1.0001; mx += 0.1) { const e = evalSet(train, mx); if (e.ll < bestLL) { bestLL = e.ll; bestMix = +mx.toFixed(1); } }
  P.mix = bestMix;
  const fmt = e => 'logloss ' + e.ll.toFixed(4) + ' acc ' + (e.acc * 100).toFixed(1) + '% top2 ' + (e.top2 * 100).toFixed(1) + '%';
  console.log('train', train.length, 'test', test.length);
  console.log('TEST Poisson only  :', fmt(evalSet(test, 1)));
  console.log('TEST factors only  :', fmt(evalSet(test, 0)));
  console.log('TEST combined mix=' + bestMix + ':', fmt(evalSet(test, bestMix)));
  const r = x => +x.toFixed(3);
  console.log('FW = ' + JSON.stringify({ w: Object.fromEntries(K.map(k => [k, r(P.w[k])])), t1: r(P.t1), t2: r(P.t2), mix: bestMix }));
})()`, ctx);
