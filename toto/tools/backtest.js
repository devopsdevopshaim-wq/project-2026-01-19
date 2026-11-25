// node tools/backtest.js — evaluates the model on past seasons using only data available before each match.
const fs = require('fs'), vm = require('vm');
const ctx = { console, Intl, Date, Math, Float64Array, Uint8Array, Map, Set, JSON, localStorage: null,
  fetch: async () => ({ ok: true, json: async () => JSON.parse(fs.readFileSync(__dirname + '/../data/history.json')) }) };
vm.createContext(ctx);
for (const f of ['names.js', 'engine.js']) vm.runInContext(fs.readFileSync(__dirname + '/../js/' + f, 'utf8'), ctx);
vm.runInContext(`(async () => {
  await loadBundled();
  const res = [];
  for (const code of ['en.1','es.1','it.1','de.1','fr.1']) {
    const L = DB.leagues[code];
    let n=0, ll=0, acc=0, accFav=0, brier=0, hitTop2=0;
    for (const m of L.m) {
      if (m.hg == null || m.d < '2023-08-01' || m.d > '2025-06-30') continue;
      const p = predict(code, m.h, m.a, m.d);
      const o = m.hg > m.ag ? '1' : m.hg === m.ag ? 'X' : '2';
      const P = probsOf(p);
      ll += -Math.log(P[o]); n++;
      const best = Object.entries(P).sort((a,b)=>b[1]-a[1]);
      if (best[0][0] === o) acc++;
      if (best[0][0] === o || best[1][0] === o) hitTop2++;
      for (const k of ['1','X','2']) brier += (P[k] - (k===o?1:0))**2;
    }
    res.push(code + ' n=' + n + ' logloss=' + (ll/n).toFixed(3) + ' brier=' + (brier/n).toFixed(3) + ' acc=' + (100*acc/n).toFixed(1) + '% top2=' + (100*hitTop2/n).toFixed(1) + '%');
  }
  console.log(res.join('\\n'));
})()`, ctx);
