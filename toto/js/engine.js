// Data store, live loader (ESPN), prediction model, statistics and the Toto column optimiser.
'use strict';

const LEAGUES = {
  // code: [Hebrew name, ESPN slug, bundled history available]
  'isr.1': ['ליגת העל (ישראל)', 'isr.1', false],
  'isr.2': ['ליגה לאומית (ישראל)', 'isr.2', false],
  'en.1': ['פרמייר ליג (אנגליה)', 'eng.1', true],
  'en.2': ["צ'מפיונשיפ (אנגליה)", 'eng.2', true],
  'es.1': ['לה ליגה (ספרד)', 'esp.1', true],
  'it.1': ['סרייה A (איטליה)', 'ita.1', true],
  'de.1': ['בונדסליגה (גרמניה)', 'ger.1', true],
  'fr.1': ['ליג 1 (צרפת)', 'fra.1', true],
  'nl.1': ['ארדיביזי (הולנד)', 'ned.1', true],
  'pt.1': ['ליגה פורטוגל', 'por.1', true],
  'tr.1': ['סופר ליג (טורקיה)', 'tur.1', true],
  'be.1': ['ליגה בלגית', 'bel.1', true],
  'sco.1': ['פרמיירשיפ (סקוטלנד)', 'sco.1', false],
  'ucl': ["ליגת האלופות", 'uefa.champions', false],
  'uel': ['הליגה האירופית', 'uefa.europa', false],
  'uecl': ['הקונפרנס ליג', 'uefa.europa.conf', false],
};
const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer/';
const TZ = 'Asia/Jerusalem';

const DB = { leagues: {}, built: null, live: {} };

function lsGet(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }

function todayISO() { return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date()); }
function addDays(iso, n) { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function daysBetween(a, b) { return (Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5; }
function seasonStartYear(iso) { const y = +iso.slice(0, 4), m = +iso.slice(5, 7); return m >= 7 ? y : y - 1; }

function emptyLeague(code) { return { code, name: LEAGUES[code][0], teams: [], keyIdx: {}, m: [], version: 0, lastResult: null }; }

function addTeam(L, name, key) {
  key = key || teamKey(name);
  if (L.keyIdx[key] != null) return L.keyIdx[key];
  const i = L.teams.length;
  L.teams.push({ name, key, he: heName(name, key) });
  L.keyIdx[key] = i;
  return i;
}

// Find a team by (possibly differently spelled) name; adds it if not found.
function findOrAddTeam(L, name) {
  const k = teamKey(name);
  if (L.keyIdx[k] != null) return L.keyIdx[k];
  let best = -1, bs = 0, second = 0;
  L.teams.forEach((t, i) => {
    const s = keySimilarity(k, t.key);
    if (s > bs) { second = bs; bs = s; best = i; } else if (s > second) second = s;
  });
  if (best >= 0 && bs >= 0.6 && bs - second > 0.15) { L.keyIdx[k] = best; return best; }
  return addTeam(L, name, k);
}

async function loadBundled() {
  const r = await fetch('data/history.json', { cache: 'no-cache' });
  if (!r.ok) throw new Error('history.json ' + r.status);
  const d = await r.json();
  DB.built = d.built;
  for (const code of Object.keys(LEAGUES)) DB.leagues[code] = emptyLeague(code);
  for (const [code, src] of Object.entries(d.leagues)) {
    const L = DB.leagues[code];
    if (!L) continue;
    src.teams.forEach(([name, key]) => addTeam(L, name, key));
    L.m = src.m.map(r => ({ d: r[0], t: r[5] || '', h: r[1], a: r[2], hg: r[3], ag: r[4], src: 'of' }));
    if (src.espn) mergeEvents(L, src.espn.map(r => ({ d: r[0], t: r[1], home: r[2], away: r[3], hg: r[4], ag: r[5] })));
    finalizeLeague(L);
  }
}

function finalizeLeague(L) {
  L.m.sort((x, y) => (x.d + x.t).localeCompare(y.d + y.t));
  const played = L.m.filter(x => x.hg != null);
  L.lastResult = played.length ? played[played.length - 1].d : null;
  L.version++;
  L._fit = null;
}

// ---------- ESPN live data (runs in the user's browser) ----------
function espnDate(iso) { return iso.replace(/-/g, ''); }
function localParts(utc) {
  const dt = new Date(utc);
  const d = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(dt);
  const t = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(dt);
  return [d, t];
}

async function fetchJSON(url, ms = 15000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(timer); }
}

function parseEspnEvents(json) {
  const out = [];
  for (const ev of (json && json.events) || []) {
    const c = ev.competitions && ev.competitions[0];
    if (!c || !c.competitors || c.competitors.length !== 2) continue;
    const home = c.competitors.find(x => x.homeAway === 'home') || c.competitors[0];
    const away = c.competitors.find(x => x.homeAway === 'away') || c.competitors[1];
    const st = (c.status || ev.status || {}).type || {};
    const done = !!st.completed && !/POSTPONED|CANCELED|CANCELLED|ABANDONED/i.test(st.name || '');
    const [d, t] = localParts(ev.date || c.date);
    const num = v => (v == null || v === '' ? null : typeof v === 'object' ? +(v.value ?? v.displayValue) : +v);
    out.push({
      id: ev.id, d, t,
      home: (home.team && (home.team.displayName || home.team.name)) || '?',
      away: (away.team && (away.team.displayName || away.team.name)) || '?',
      hg: done ? num(home.score) : null, ag: done ? num(away.score) : null,
      state: st.state || '', status: st.shortDetail || st.description || '',
    });
  }
  return out;
}

// Stop hammering the network when ESPN is unreachable (offline, blocked, CORS).
const ESPN_DOWN = { fails: 0, ok: false };
function resetEspn() { ESPN_DOWN.fails = 0; ESPN_DOWN.ok = false; }

// ESPN accepts whole months (YYYYMM) on the scoreboard endpoint; date ranges are refused.
async function espnMonth(slug, ym, force) {
  const ck = `toto.espn.${slug}.${ym}`;
  const cached = lsGet(ck);
  if (cached && !force && Date.now() - cached.at < 2 * 3600e3) return cached.ev;
  if (ESPN_DOWN.fails >= 4 && !ESPN_DOWN.ok) { if (cached) return cached.ev; throw new Error('offline'); }
  try {
    const ev = parseEspnEvents(await fetchJSON(`${ESPN_BASE}${slug}/scoreboard?dates=${ym}&limit=500`));
    ESPN_DOWN.ok = true;
    lsSet(ck, { at: Date.now(), ev });
    return ev;
  } catch (e) {
    ESPN_DOWN.fails++;
    if (cached) return cached.ev;
    throw e;
  }
}

function mergeEvents(L, events) {
  let added = 0, updated = 0;
  const idx = new Map();
  for (const x of L.m) { const k = x.h + '|' + x.a; if (!idx.has(k)) idx.set(k, []); idx.get(k).push(x); }
  for (const e of events) {
    const h = findOrAddTeam(L, e.home), a = findOrAddTeam(L, e.away);
    const k = h + '|' + a;
    let m = (idx.get(k) || []).find(x => Math.abs(daysBetween(x.d, e.d)) <= 4);
    if (!m) {
      m = { d: e.d, t: e.t, h, a, hg: e.hg, ag: e.ag, src: 'espn', id: e.id, status: e.status, state: e.state };
      L.m.push(m); added++;
      if (!idx.has(k)) idx.set(k, []); idx.get(k).push(m);
    } else {
      if (e.hg != null && (m.hg !== e.hg || m.ag !== e.ag)) updated++;
      Object.assign(m, { d: e.d, t: e.t, id: e.id, status: e.status, state: e.state });
      if (e.hg != null) { m.hg = e.hg; m.ag = e.ag; }
      m.src = m.src === 'of' ? 'of+espn' : m.src;
    }
  }
  return { added, updated };
}

// Live refresh of one league. Bundled leagues: current season only. ESPN-only leagues: last 5 seasons.
// Live refresh: this month and next month, on top of the data built into the app.
async function refreshLeague(code, force) {
  const L = DB.leagues[code];
  const slug = LEAGUES[code][1];
  const t = todayISO();
  const months = [t.slice(0, 7), addDays(t.slice(0, 7) + '-01', 35).slice(0, 7)].map(x => x.replace('-', ''));
  if (+t.slice(8, 10) <= 7) months.unshift(addDays(t.slice(0, 7) + '-01', -5).slice(0, 7).replace('-', ''));
  let ok = 0, err = null;
  for (const ym of months) {
    try { mergeEvents(L, await espnMonth(slug, ym, force)); ok++; } catch (e) { err = e; }
  }
  finalizeLeague(L);
  DB.live[code] = { ok: ok > 0, at: Date.now(), err: ok ? null : String((err && err.message) || err) };
  return DB.live[code];
}

// ---------- Model: time-weighted Poisson (Maher / Dixon-Coles) ----------
const HALF_LIFE = 240; // days
const RHO = -0.08;

function fitLeague(L, asOf) {
  asOf = asOf || todayISO();
  if (L._fit && L._fit.asOf === asOf && L._fit.v === L.version) return L._fit;
  const from = addDays(asOf, -3 * 365);
  const ms = [];
  for (const x of L.m) {
    if (x.hg == null || x.d >= asOf || x.d < from) continue;
    ms.push({ h: x.h, a: x.a, hg: x.hg, ag: x.ag, w: Math.pow(0.5, daysBetween(x.d, asOf) / HALF_LIFE) });
  }
  const n = L.teams.length;
  const att = new Float64Array(n).fill(1), def = new Float64Array(n).fill(1);
  let sw = 0, sh = 0, sa = 0;
  const games = new Float64Array(n);
  for (const x of ms) { sw += x.w; sh += x.w * x.hg; sa += x.w * x.ag; games[x.h] += x.w; games[x.a] += x.w; }
  const baseH = sw ? sh / sw : 1.45, baseA = sw ? sa / sw : 1.15;
  // Teams new to this league's recent window (promoted) start weaker.
  const curStart = `${seasonStartYear(asOf)}-07-01`;
  const prevSeen = new Uint8Array(n);
  for (const x of L.m) if (x.hg != null && x.d < curStart && x.d >= addDays(curStart, -400)) { prevSeen[x.h] = 1; prevSeen[x.a] = 1; }
  const priorA = new Float64Array(n), priorD = new Float64Array(n);
  for (let i = 0; i < n; i++) { const promoted = !prevSeen[i]; priorA[i] = promoted ? 0.85 : 1; priorD[i] = promoted ? 1.15 : 1; }
  const K = 3; // prior weight in "matches"
  for (let it = 0; it < 30; it++) {
    const gf = new Float64Array(n), ef = new Float64Array(n), ga = new Float64Array(n), ea = new Float64Array(n);
    for (const x of ms) {
      gf[x.h] += x.w * x.hg; ef[x.h] += x.w * baseH * def[x.a];
      gf[x.a] += x.w * x.ag; ef[x.a] += x.w * baseA * def[x.h];
    }
    for (let i = 0; i < n; i++) att[i] = (gf[i] + K * priorA[i]) / (ef[i] + K);
    for (const x of ms) {
      ga[x.h] += x.w * x.ag; ea[x.h] += x.w * baseA * att[x.a];
      ga[x.a] += x.w * x.hg; ea[x.a] += x.w * baseH * att[x.h];
    }
    for (let i = 0; i < n; i++) def[i] = (ga[i] + K * priorD[i]) / (ea[i] + K);
    // normalise over active teams
    let s1 = 0, s2 = 0, c = 0;
    for (let i = 0; i < n; i++) if (games[i] > 0.5) { s1 += att[i]; s2 += def[i]; c++; }
    if (c) for (let i = 0; i < n; i++) { att[i] /= s1 / c; def[i] /= s2 / c; }
  }
  L._fit = { asOf, v: L.version, att, def, baseH, baseA, games, nMatches: ms.length };
  return L._fit;
}

function pois(k, l) { let p = Math.exp(-l); for (let i = 1; i <= k; i++) p *= l / i; return p; }

function scoreMatrix(lh, la, max = 10) {
  const M = [];
  let tot = 0;
  for (let i = 0; i <= max; i++) {
    M.push([]);
    for (let j = 0; j <= max; j++) {
      let tau = 1;
      if (i === 0 && j === 0) tau = 1 - lh * la * RHO;
      else if (i === 0 && j === 1) tau = 1 + lh * RHO;
      else if (i === 1 && j === 0) tau = 1 + la * RHO;
      else if (i === 1 && j === 1) tau = 1 - RHO;
      const p = pois(i, lh) * pois(j, la) * Math.max(tau, 0);
      M[i].push(p); tot += p;
    }
  }
  for (const r of M) for (let j = 0; j < r.length; j++) r[j] /= tot;
  return M;
}

function summarizeMatrix(M) {
  let p1 = 0, px = 0, p2 = 0, o25 = 0, btts = 0;
  const scores = [];
  for (let i = 0; i < M.length; i++) for (let j = 0; j < M.length; j++) {
    const p = M[i][j];
    if (i > j) p1 += p; else if (i === j) px += p; else p2 += p;
    if (i + j > 2) o25 += p;
    if (i > 0 && j > 0) btts += p;
    scores.push([i, j, p]);
  }
  scores.sort((a, b) => b[2] - a[2]);
  return { p1, px, p2, o25, btts, top: scores.slice(0, 6) };
}

// ---------- Factor model: five explainable factors combined by an ordered logit ----------
// Each factor is a "home minus away" difference; positive favours the home team.
const FACTOR_NAMES = {
  str: 'כוח התקפה והגנה (3 שנים, משוקלל זמן)',
  table: 'מצב בטבלה (נקודות למשחק העונה)',
  form: 'כושר: 6 משחקים אחרונים',
  venue: 'בית / חוץ: מאזן בבית מול מאזן בחוץ',
  h2h: 'ראש בראש: 10 המפגשים האחרונים',
};
// Fitted by tools/fit_factors.js on past seasons (see the "מידע" tab for the backtest).
let FW = {"w":{"str":1.084,"table":0.092,"form":0.042,"venue":0.09,"h2h":0.234},"t1":-0.651,"t2":0.555,"mix":0.3};

function ppg(s) { return s && s.n ? s.pts / s.n : null; }

function factorsFor(code, h, a, asOf) {
  const L = DB.leagues[code];
  asOf = asOf || todayISO();
  const F = fitLeague(L, asOf);
  const lh = F.baseH * F.att[h] * F.def[a], la = F.baseA * F.att[a] * F.def[h];
  const sh = teamStats(L, h, asOf), sa = teamStats(L, a, asOf);
  const ms = L.m.filter(x => x.hg != null && x.d < asOf && ((x.h === h && x.a === a) || (x.h === a && x.a === h)) && x.d >= addDays(asOf, -10 * 365)).slice(-10);
  let hw = 0, hl = 0, hd = 0;
  for (const x of ms) { const r = resultFor(x, h).r; if (r === 'W') hw++; else if (r === 'L') hl++; else hd++; }
  const f6 = (s) => {
    const last = s.form.slice(0, 6);
    return last.length ? last.reduce((t, x) => t + (x.r === 'W' ? 3 : x.r === 'D' ? 1 : 0), 0) / last.length : null;
  };
  const diff = (x, y) => (x == null || y == null ? 0 : x - y);
  return {
    lh, la, sh, sa, F,
    h2hRec: { n: ms.length, w: hw, d: hd, l: hl },
    d: {
      str: Math.log(lh / la),
      table: diff(ppg(sh.all), ppg(sa.all)),
      form: diff(f6(sh), f6(sa)),
      venue: diff(ppg(sh.home), ppg(sa.away)),
      h2h: ms.length ? (hw - hl) / (ms.length + 3) : 0,
    },
  };
}

const sig = x => 1 / (1 + Math.exp(-x));
function orderedLogit(d, P) {
  P = P || FW;
  let S = 0;
  for (const k in P.w) S += P.w[k] * (d[k] || 0);
  const p2 = sig(P.t1 - S), notHome = sig(P.t2 - S);
  return { p1: 1 - notHome, px: Math.max(notHome - p2, 0.02), p2, S };
}

function predict(code, h, a, asOf) {
  const L = DB.leagues[code];
  const fx = factorsFor(code, h, a, asOf);
  const { lh, la, F } = fx;
  const S = summarizeMatrix(scoreMatrix(lh, la));
  const ol = orderedLogit(fx.d);
  const m = FW.mix; // share of the Poisson model in the final probability
  let p1 = m * S.p1 + (1 - m) * ol.p1, px = m * S.px + (1 - m) * ol.px, p2 = m * S.p2 + (1 - m) * ol.p2;
  const z = p1 + px + p2; p1 /= z; px /= z; p2 /= z;
  // Contribution of each factor to the latent score (positive = home side).
  const contrib = {};
  for (const k in FW.w) contrib[k] = FW.w[k] * (fx.d[k] || 0);
  const reliability = Math.min(F.games[h], F.games[a]);
  return { ...S, p1, px, p2, lh, la, poisson: { p1: S.p1, px: S.px, p2: S.p2 }, factors: fx.d, contrib, h2hRec: fx.h2hRec, sh: fx.sh, sa: fx.sa, reliability, nMatches: F.nMatches };
}

function probsOf(p) { return { '1': p.p1, 'X': p.px, '2': p.p2 }; }

// ---------- Statistics ----------
function resultFor(m, t) { // from team t perspective
  const gf = m.h === t ? m.hg : m.ag, ga = m.h === t ? m.ag : m.hg;
  return { gf, ga, r: gf > ga ? 'W' : gf === ga ? 'D' : 'L', home: m.h === t };
}

function h2h(L, h, a, asOf) {
  asOf = asOf || '9999';
  const all = L.m.filter(x => x.hg != null && x.d < asOf && ((x.h === h && x.a === a) || (x.h === a && x.a === h)));
  const agg = list => {
    const s = { n: list.length, w: 0, d: 0, l: 0, gf: 0, ga: 0, o25: 0, btts: 0 };
    for (const x of list) {
      const r = resultFor(x, h);
      s[r.r === 'W' ? 'w' : r.r === 'D' ? 'd' : 'l']++;
      s.gf += r.gf; s.ga += r.ga;
      if (x.hg + x.ag > 2) s.o25++;
      if (x.hg > 0 && x.ag > 0) s.btts++;
    }
    return s;
  };
  const recentFrom = addDays(asOf === '9999' ? todayISO() : asOf, -8 * 365);
  return {
    all: agg(all),
    venue: agg(all.filter(x => x.h === h)),
    recent: agg(all.filter(x => x.d >= recentFrom)),
    list: all.slice().reverse(),
    since: L.m.length ? L.m[0].d : null,
  };
}

function teamMatches(L, t, asOf) {
  return L.m.filter(x => x.hg != null && (x.h === t || x.a === t) && (!asOf || x.d < asOf));
}

function teamStats(L, t, asOf) {
  asOf = asOf || todayISO();
  const ms = teamMatches(L, t, asOf);
  const sStart = `${seasonStartYear(asOf)}-07-01`;
  let season = ms.filter(x => x.d >= sStart);
  const usingPrev = season.length < 5;
  const basis = usingPrev ? ms.filter(x => x.d >= addDays(sStart, -365)) : season;
  const calc = list => {
    const s = { n: list.length, w: 0, d: 0, l: 0, gf: 0, ga: 0, o25: 0, btts: 0, cs: 0, fts: 0, pts: 0 };
    for (const x of list) {
      const r = resultFor(x, t);
      s[r.r === 'W' ? 'w' : r.r === 'D' ? 'd' : 'l']++;
      s.pts += r.r === 'W' ? 3 : r.r === 'D' ? 1 : 0;
      s.gf += r.gf; s.ga += r.ga;
      if (r.gf + r.ga > 2) s.o25++;
      if (r.gf > 0 && r.ga > 0) s.btts++;
      if (r.ga === 0) s.cs++;
      if (r.gf === 0) s.fts++;
    }
    return s;
  };
  const last = ms.slice(-10).reverse();
  // streaks
  let unbeaten = 0, winless = 0, wins = 0, losses = 0;
  for (const x of ms.slice().reverse()) { if (resultFor(x, t).r !== 'L') unbeaten++; else break; }
  for (const x of ms.slice().reverse()) { if (resultFor(x, t).r !== 'W') winless++; else break; }
  for (const x of ms.slice().reverse()) { if (resultFor(x, t).r === 'W') wins++; else break; }
  for (const x of ms.slice().reverse()) { if (resultFor(x, t).r === 'L') losses++; else break; }
  return {
    basisLabel: usingPrev ? 'העונה הנוכחית + הקודמת' : 'העונה הנוכחית',
    all: calc(basis), home: calc(basis.filter(x => x.h === t)), away: calc(basis.filter(x => x.a === t)),
    last5: calc(ms.slice(-5)), last10: calc(ms.slice(-10)),
    form: last.map(x => ({ m: x, ...resultFor(x, t) })),
    streak: { unbeaten, winless, wins, losses },
    total: ms.length,
  };
}

function standings(L, asOf) {
  asOf = asOf || todayISO();
  const sStart = `${seasonStartYear(asOf)}-07-01`;
  const ms = L.m.filter(x => x.d >= sStart && x.d < addDays(sStart, 365));
  const tab = {};
  const row = i => (tab[i] = tab[i] || { t: i, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0, form: [] });
  for (const x of ms) { row(x.h); row(x.a); }
  for (const x of ms) {
    if (x.hg == null || x.d >= asOf) continue;
    for (const [t, gf, ga] of [[x.h, x.hg, x.ag], [x.a, x.ag, x.hg]]) {
      const r = row(t);
      r.p++; r.gf += gf; r.ga += ga;
      if (gf > ga) { r.w++; r.pts += 3; r.form.push('W'); } else if (gf === ga) { r.d++; r.pts++; r.form.push('D'); } else { r.l++; r.form.push('L'); }
    }
  }
  const list = Object.values(tab).sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf);
  list.forEach((r, i) => { r.pos = i + 1; r.form = r.form.slice(-5); });
  return list;
}

// ---------- Toto column optimiser ----------
// For each game choose a set of outcomes (1, 2 or 3 of them) to maximise P(all correct) under limits.
function gameOptions(p) {
  const o = [['1', p['1']], ['X', p['X']], ['2', p['2']]].sort((a, b) => b[1] - a[1]);
  return [
    { picks: [o[0][0]], hit: o[0][1] },
    { picks: [o[0][0], o[1][0]], hit: o[0][1] + o[1][1] },
    { picks: ['1', 'X', '2'], hit: 1 },
  ];
}

function optimise(probList, maxD, maxT, locked) {
  // DP over games with counts of doubles and triples used.
  const N = probList.length;
  const key = (d, t) => d * 100 + t;
  let dp = new Map([[key(0, 0), { lp: 0, choice: [] }]]);
  for (let g = 0; g < N; g++) {
    const opts = gameOptions(probList[g]);
    const allowed = locked && locked[g] ? [locked[g]] : [0, 1, 2];
    const nd = new Map();
    for (const [k, st] of dp) {
      const d = Math.floor(k / 100), t = k % 100;
      for (const c of allowed) {
        const d2 = d + (c === 1), t2 = t + (c === 2);
        if (d2 > maxD || t2 > maxT) continue;
        const lp = st.lp + Math.log(Math.max(opts[c].hit, 1e-9));
        const k2 = key(d2, t2);
        const cur = nd.get(k2);
        if (!cur || lp > cur.lp) nd.set(k2, { lp, choice: st.choice.concat(c) });
      }
    }
    dp = nd;
  }
  let best = null;
  for (const st of dp.values()) if (!best || st.lp > best.lp) best = st;
  return best.choice.map((c, g) => gameOptions(probList[g])[c].picks);
}

// Best (doubles, triples) combination within a number of columns.
function optimiseByColumns(probList, maxCols) {
  let best = null;
  for (let t = 0; Math.pow(3, t) <= maxCols && t <= probList.length; t++) {
    for (let d = 0; Math.pow(3, t) * Math.pow(2, d) <= maxCols && d + t <= probList.length; d++) {
      const picks = optimise(probList, d, t);
      const pr = picks.reduce((s, pk, g) => s * pk.reduce((a, o) => a + probList[g][o], 0), 1);
      if (!best || pr > best.pr + 1e-12) best = { picks, pr, d, t };
    }
  }
  return best;
}

// Distribution of the number of correct games (Poisson-binomial).
function hitDistribution(hitProbs) {
  let dist = [1];
  for (const p of hitProbs) {
    const nd = new Array(dist.length + 1).fill(0);
    dist.forEach((v, k) => { nd[k] += v * (1 - p); nd[k + 1] += v * p; });
    dist = nd;
  }
  return dist;
}
