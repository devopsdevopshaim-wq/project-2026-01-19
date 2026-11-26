// node tools/backtest_basketball.js — winner accuracy and margin error, each game predicted with data from before it.
const fs = require('fs'), vm = require('vm'), path = require('path');
const ctx = { console, Intl, Date, Math, Float64Array, Uint8Array, Map, Set, JSON, Object, localStorage: null,
  fetch: async (u) => ({ ok: true, json: async () => JSON.parse(fs.readFileSync(path.join(__dirname, '..', u))) }) };
vm.createContext(ctx);
for (const f of ['names.js', 'engine.js', 'basket.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), ctx);
vm.runInContext(`(async () => {
  await loadBasketball();
  for (const [code, L] of Object.entries(BSK.leagues)) {
    let n = 0, acc = 0, ll = 0, mae = 0, cover = 0;
    for (const x of L.m) {
      if (x.hs == null || x.d < addDays(todayISO(), -330)) continue;
      const F = bskFit(L, x.d);
      if (Math.min(F.games[x.h], F.games[x.a]) < 4) continue;
      const p = bskPredict(code, x.h, x.a, x.d);
      const homeWon = x.hs > x.as;
      n++; if ((p.winOT > 0.5) === homeWon) acc++;
      ll -= Math.log(homeWon ? p.winOT : 1 - p.winOT);
      mae += Math.abs((x.hs - x.as) - p.m);
      const z = ((x.hs - x.as) - p.m) / p.sdm; if (Math.abs(z) < 1) cover++;
    }
    console.log(code, 'n=' + n, 'winner acc=' + (100 * acc / n).toFixed(1) + '%', 'logloss=' + (ll / n).toFixed(3), 'margin MAE=' + (mae / n).toFixed(1), 'within 1sd=' + (100 * cover / n).toFixed(0) + '%');
  }
})()`, ctx);
