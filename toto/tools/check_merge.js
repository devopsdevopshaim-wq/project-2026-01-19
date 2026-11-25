// node tools/check_merge.js — team counts in the current season per league (duplicates show as extra teams).
const fs = require('fs'), vm = require('vm');
const ctx = { console, Intl, Date, Math, Float64Array, Uint8Array, Map, Set, JSON, localStorage: null,
  fetch: async () => ({ ok: true, json: async () => JSON.parse(fs.readFileSync(__dirname + '/../data/history.json')) }) };
vm.createContext(ctx);
for (const f of ['names.js', 'engine.js']) vm.runInContext(fs.readFileSync(__dirname + '/../js/' + f, 'utf8'), ctx);
vm.runInContext(`(async () => {
  const t0 = Date.now(); await loadBundled(); console.log('load ms', Date.now() - t0);
  for (const [c, L] of Object.entries(DB.leagues)) {
    const s = new Set(); L.m.forEach(x => { if (x.d >= '2026-07-01') { s.add(x.h); s.add(x.a); } });
    const unplayedPast = L.m.filter(x => x.hg == null && x.d < '2026-11-20' && x.d >= '2026-07-01').length;
    console.log(c, 'teams', s.size, 'last', L.lastResult, 'stale-unplayed', unplayedPast, s.size > 24 && !c.startsWith('u') ? [...s].map(i => L.teams[i].name).sort().join(', ') : '');
  }
})()`, ctx);
