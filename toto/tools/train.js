// node tools/train.js — weekly learning step. Run after tools/build_data.py.
//  1. Holdout weights: fitted only on matches before HOLD, used for the honest track record.
//  2. Live weights: fitted on all matches (recent ones weigh more), used for new predictions.
//  3. Per-league calibration: corrects systematic biases seen in recent results (kept only if it helps on unseen weeks).
//  4. data/predictions.json: pre-match prediction for every match since HOLD + upcoming matches.
//  5. data/frozen/<date>.json: this week's predictions, saved once and never changed, to be scored later.
//  6. data/model.json + data/model_log.json: weights, metrics, and what changed since last week.
const fs = require('fs'), vm = require('vm'), path = require('path');
const DIR = path.join(__dirname, '..', 'data');
const ctx = { console, Intl, Date, Math, Float64Array, Uint8Array, Map, Set, JSON, Object, localStorage: null,
  fetch: async (u) => { const f = path.join(__dirname, '..', u); return fs.existsSync(f) && !u.includes('model.json') ? { ok: true, json: async () => JSON.parse(fs.readFileSync(f)) } : { ok: false }; } };
vm.createContext(ctx);
for (const f of ['names.js', 'engine.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), ctx);
ctx.__out = { DIR, fs, path };

vm.runInContext(`(async () => {
  const { DIR, fs, path } = __out;
  await loadBundled();
  const TODAY = todayISO();
  const HOLD = '2025-07-01';
  const K = ['str', 'table', 'form', 'venue', 'h2h'];
  const codes = Object.keys(DB.leagues).filter(c => DB.leagues[c].m.some(x => x.hg != null));

  // ---- samples ----
  const rows = [];
  for (const code of codes) {
    const L = DB.leagues[code];
    for (const m of L.m) {
      if (m.hg == null || m.d < '2022-07-01' || m.d >= TODAY) continue;
      const fx = factorsFor(code, m.h, m.a, m.d);
      if (Math.min(fx.F.games[m.h], fx.F.games[m.a]) < 3) continue;
      const pm = summarizeMatrix(scoreMatrix(fx.lh, fx.la));
      rows.push({ code, d: m.d, h: L.teams[m.h].key, a: L.teams[m.a].key, hg: m.hg, ag: m.ag, y: m.hg > m.ag ? 0 : m.hg === m.ag ? 1 : 2, f: fx.d, pm });
    }
  }
  console.log('samples', rows.length);

  const blend = (r, P) => {
    const o = orderedLogit(r.f, P), mx = P.mix;
    let p = [mx * r.pm.p1 + (1 - mx) * o.p1, mx * r.pm.px + (1 - mx) * o.px, mx * r.pm.p2 + (1 - mx) * o.p2];
    const c = P.calib && P.calib[r.code];
    if (c) p = p.map((v, i) => v * c[i]);
    const z = p[0] + p[1] + p[2];
    return p.map(v => v / z);
  };
  const fit = (set, wfn) => {
    const W = set.map(wfn), WS = W.reduce((a, b) => a + b, 0);
    const nll = P => { let s = 0; set.forEach((r, i) => { const o = orderedLogit(r.f, P); s -= W[i] * Math.log(Math.max([o.p1, o.px, o.p2][r.y], 1e-6)); }); return s / WS; };
    let P = { w: { str: 1, table: 0, form: 0, venue: 0, h2h: 0 }, t1: -0.6, t2: 0.6, mix: 0 };
    const keys = [...K.map(k => ['w', k]), ['t1'], ['t2']];
    const get = (P, k) => (k.length === 2 ? P[k[0]][k[1]] : P[k[0]]);
    const put = (P, k, v) => { if (k.length === 2) P[k[0]][k[1]] = v; else P[k[0]] = v; };
    let lr = 0.5;
    for (let it = 0; it < 150 && lr > 1e-4; it++) {
      const base = nll(P), g = keys.map(k => { const Q = JSON.parse(JSON.stringify(P)); put(Q, k, get(P, k) + 1e-4); return (nll(Q) - base) / 1e-4; });
      const Q = JSON.parse(JSON.stringify(P));
      keys.forEach((k, i) => put(Q, k, get(P, k) - lr * g[i]));
      if (nll(Q) < base) P = Q; else lr *= 0.5;
    }
    // Poisson / factor mix
    let best = 1, bl = 9;
    for (let mx = 0; mx <= 1.0001; mx += 0.1) {
      const Q = { ...P, mix: mx }; let s = 0;
      set.forEach((r, i) => { s -= W[i] * Math.log(blend(r, Q)[r.y]); });
      if (s / WS < bl) { bl = s / WS; best = +mx.toFixed(1); }
    }
    P.mix = best;
    const r3 = x => +x.toFixed(3);
    return { w: Object.fromEntries(K.map(k => [k, r3(P.w[k])])), t1: r3(P.t1), t2: r3(P.t2), mix: P.mix };
  };
  const metrics = (set, P, poissonOnly) => {
    let ll = 0, acc = 0, top2 = 0, br = 0;
    for (const r of set) {
      const p = poissonOnly ? [r.pm.p1, r.pm.px, r.pm.p2] : blend(r, P);
      ll -= Math.log(Math.max(p[r.y], 1e-9));
      const o = [0, 1, 2].sort((a, b) => p[b] - p[a]);
      if (o[0] === r.y) acc++; if (o[0] === r.y || o[1] === r.y) top2++;
      p.forEach((v, i) => { br += (v - (i === r.y ? 1 : 0)) ** 2; });
    }
    const n = set.length || 1, q = x => +x.toFixed(4);
    return { n: set.length, logloss: q(ll / n), acc: q(acc / n), top2: q(top2 / n), brier: q(br / n) };
  };

  // ---- 1. holdout weights ----
  const train = rows.filter(r => r.d < HOLD), test = rows.filter(r => r.d >= HOLD);
  const PH = fit(train, () => 1);
  // ---- 2. live weights (recent matches weigh more: half-life 2 years) ----
  const PL = fit(rows, r => Math.pow(0.5, daysBetween(r.d, TODAY) / 730));

  // ---- 3. per-league calibration, validated on the most recent 90 days ----
  const calibFrom = (set) => {
    const by = {};
    for (const r of set) {
      const p = blend(r, PH);
      const b = by[r.code] = by[r.code] || { n: 0, o: [0, 0, 0], e: [0, 0, 0] };
      b.n++; b.o[r.y]++; p.forEach((v, i) => { b.e[i] += v; });
    }
    const S = 40, out = {};
    for (const [c, b] of Object.entries(by)) if (b.n >= 60) out[c] = b.o.map((o, i) => +((o + S * b.e[i] / b.n) / (b.e[i] + S * b.e[i] / b.n)).toFixed(3));
    return out;
  };
  const d90 = addDays(TODAY, -90), d455 = addDays(TODAY, -455), d365 = addDays(TODAY, -365);
  const calTrain = calibFrom(test.filter(r => r.d >= d455 && r.d < d90));
  const recent = test.filter(r => r.d >= d90);
  const withoutCal = metrics(recent, PH), withCal = metrics(recent, { ...PH, calib: calTrain });
  const useCal = withCal.logloss < withoutCal.logloss;
  const liveCal = useCal ? calibFrom(test.filter(r => r.d >= d365)) : {};
  const LIVE = { ...PL, calib: liveCal };

  // ---- evaluation on the unseen period ----
  const evalAll = { poisson: metrics(test, PH, true), combined: metrics(test, PH) };
  const perLeague = {};
  for (const c of codes) { const s = test.filter(r => r.code === c); if (s.length >= 20) perLeague[c] = metrics(s, PH); }
  const buckets = [[0, 0.4], [0.4, 0.5], [0.5, 0.6], [0.6, 0.7], [0.7, 1.01]].map(([lo, hi]) => {
    const s = test.map(r => ({ r, p: blend(r, PH) })).filter(x => Math.max(...x.p) >= lo && Math.max(...x.p) < hi);
    const pred = s.reduce((t, x) => t + Math.max(...x.p), 0) / (s.length || 1);
    const hit = s.filter(x => x.p.indexOf(Math.max(...x.p)) === x.r.y).length / (s.length || 1);
    return { lo, hi: Math.min(hi, 1), n: s.length, pred: +pred.toFixed(3), hit: +hit.toFixed(3) };
  });
  const lastWeek = metrics(test.filter(r => r.d >= addDays(TODAY, -7)), PH);

  // ---- 4. predictions.json (track record + upcoming) ----
  const pr = x => +x.toFixed(3);
  const track = test.map(r => { const p = blend(r, PH); return [r.code, r.d, r.h, r.a, r.hg, r.ag, pr(p[0]), pr(p[1]), pr(p[2])]; });
  FW = LIVE;
  const upcoming = [];
  for (const code of codes) {
    const L = DB.leagues[code];
    for (const m of L.m) {
      if (m.hg != null || m.d < TODAY || m.d > addDays(TODAY, 10)) continue;
      const p = predict(code, m.h, m.a, TODAY);
      upcoming.push([code, m.d, m.t || '', L.teams[m.h].key, L.teams[m.a].key, L.teams[m.h].he, L.teams[m.a].he, pr(p.p1), pr(p.px), pr(p.p2)]);
    }
  }
  upcoming.sort((a, b) => (a[1] + a[2]).localeCompare(b[1] + b[2]));
  fs.writeFileSync(path.join(DIR, 'predictions.json'), JSON.stringify({ updated: TODAY, hold: HOLD, track, upcoming }));

  // ---- 4b. real prediction log: the last prediction made before each kickoff, never changed afterwards ----
  const nowIL = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
  const started = (d, t) => d < TODAY || (d === TODAY && (!t || t <= nowIL));
  const logFileP = path.join(DIR, 'pred_log.json');
  const plog = fs.existsSync(logFileP) ? JSON.parse(fs.readFileSync(logFileP)) : {};
  let logged = 0;
  for (const u of upcoming) {
    const [code, d, t, hk, ak, hn, an, p1, px, p2] = u;
    if (started(d, t)) continue;
    plog[code + '|' + hk + '|' + ak + '|' + d] = [code, d, t, hk, ak, hn, an, p1, px, p2, TODAY + ' ' + nowIL];
    logged++;
  }
  fs.writeFileSync(logFileP, JSON.stringify(plog));
  console.log('prediction log:', Object.keys(plog).length, 'games,', logged, 'updated before kickoff');

  // ---- 5. frozen weekly snapshot (one per ISO week, never overwritten) ----
  const fdir = path.join(DIR, 'frozen');
  if (!fs.existsSync(fdir)) fs.mkdirSync(fdir);
  const monday = addDays(TODAY, -((new Date(TODAY + 'T12:00:00Z').getUTCDay() + 6) % 7));
  const ffile = path.join(fdir, monday + '.json');
  if (!fs.existsSync(ffile)) fs.writeFileSync(ffile, JSON.stringify({ week: monday, made: TODAY, weights: LIVE, games: upcoming }));
  const index = fs.readdirSync(fdir).filter(f => /^\\d{4}-\\d{2}-\\d{2}\\.json$/.test(f)).sort().reverse();
  fs.writeFileSync(path.join(fdir, 'index.json'), JSON.stringify(index));

  // ---- 6. model.json + learning log ----
  const logFile = path.join(DIR, 'model_log.json');
  const log = fs.existsSync(logFile) ? JSON.parse(fs.readFileSync(logFile)) : [];
  const prev = log.length ? log[log.length - 1] : null;
  const entry = { date: TODAY, live: { w: LIVE.w, mix: LIVE.mix }, calibUsed: useCal, calib: liveCal, holdout: evalAll.combined, lastWeek, recent90: { without: withoutCal, with: withCal } };
  if (!prev || prev.date !== TODAY) log.push(entry); else log[log.length - 1] = entry;
  fs.writeFileSync(logFile, JSON.stringify(log));
  const model = { updated: TODAY, updatedAt: TODAY + ' ' + nowIL, hold: HOLD, live: LIVE, holdoutWeights: PH, eval: evalAll, perLeague, buckets, lastWeek,
    calibration: { used: useCal, recent90: { without: withoutCal, with: withCal } }, samples: { train: train.length, test: test.length, all: rows.length },
    changes: prev ? Object.fromEntries(K.map(k => [k, +(LIVE.w[k] - (prev.live.w[k] || 0)).toFixed(3)])) : null };
  fs.writeFileSync(path.join(DIR, 'model.json'), JSON.stringify(model));

  const f = m => 'll ' + m.logloss + ' acc ' + (m.acc * 100).toFixed(1) + '% top2 ' + (m.top2 * 100).toFixed(1) + '% (n=' + m.n + ')';
  console.log('unseen period  Poisson :', f(evalAll.poisson));
  console.log('unseen period  combined:', f(evalAll.combined));
  console.log('last 90 days   no calib:', f(withoutCal), '| with calib:', f(withCal), '=> calib', useCal ? 'ON' : 'OFF');
  console.log('last 7 days            :', f(lastWeek));
  console.log('live weights', JSON.stringify(LIVE.w), 'mix', LIVE.mix);
  console.log('calib', JSON.stringify(liveCal));
  console.log('buckets', JSON.stringify(buckets));
  console.log('track', track.length, 'upcoming', upcoming.length, 'frozen', path.basename(ffile));
})()`, ctx);
