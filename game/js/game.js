'use strict';
/* ===== Neon Warfront – meta progression & match rules ===== */

G.meta = {
  data: null,
  KEY: 'nw_meta_v1',
  load() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(this.KEY)); } catch (e) {}
    const def = { tp: 0, research: {}, stars: {}, xp: 0, ach: {}, battles: 0, settings: { music: true, sfx: true, anim: 'mine', diff: 'normal' }, tut: false };
    this.data = Object.assign(def, d || {});
    this.data.settings = Object.assign(def.settings, (d && d.settings) || {});
  },
  save() { try { localStorage.setItem(this.KEY, JSON.stringify(this.data)); } catch (e) {} },
  has(id) { return !!this.data.research[id]; },
  level() { return Math.min(G.RANKS.length - 1, Math.floor(Math.sqrt(this.data.xp / 60))); },
  levelProgress() {
    const l = this.level(), a = l * l * 60, b = (l + 1) * (l + 1) * 60;
    return G.clamp((this.data.xp - a) / (b - a), 0, 1);
  },
  addXP(n) {
    const before = this.level();
    this.data.xp += n;
    if (this.level() > before) G.ui && G.ui.toast(`דרגה חדשה: ${G.RANKS[this.level()]}!`, 'gold');
  },
  stars(key) { return this.data.stars[key] || 0; },
  totalStars() { return Object.values(this.data.stars).reduce((a, b) => a + b, 0); },
  worldUnlocked(w) { return w === 0 || this.stars('w' + (w - 1) + 'all') > 0; },
  countryUnlocked(w, c) { return this.worldUnlocked(w) && (c === 0 || this.stars('w' + w + 'c' + (c - 1)) > 0); },
  allUnlocked(w) { return this.worldUnlocked(w); },
  ach(id) {
    if (this.data.ach[id]) return;
    this.data.ach[id] = Date.now();
    const a = G.ACHIEVEMENTS.find(x => x.id === id);
    if (a && G.ui) G.ui.toast(`🏆 הישג: ${a.name}`, 'gold');
    this.save();
  },
  playerUnits(world = 0) {
    // research unlocks + technology captured from previously conquered worlds
    const u = ['inf', 'tank'].concat(G.WORLDS[Math.max(0, world - 1)].tier);
    const map = { u_commando: 'commando', u_art: 'art', u_aa: 'aa', u_heli: 'heli', u_jet: 'jet', u_mech: 'mech' };
    for (const k in map) if (this.has(k)) u.push(map[k]);
    return G.UNIT_ORDER.filter(x => u.includes(x));
  }
};

/* ---------- helpers ---------- */
G.activeTids = m => G.map.terrs.filter(T => m.terr[T.id].owner !== -2).map(T => T.id);
G.ownedBy = (m, fi) => G.map.terrs.filter(T => m.terr[T.id].owner === fi).map(T => T.id);
G.isAdj = (a, b) => G.map.terrs[a].adj.includes(b);
G.movable = (st) => { const o = {}; for (const k in st.units) { const n = st.units[k] - (st.tired[k] || 0); if (n > 0) o[k] = n; } return o; };

G.bfsDist = function (m, sources, passable) {
  const d = {}; const q = [];
  for (const s of sources) { d[s] = 0; q.push(s); }
  while (q.length) {
    const t = q.shift();
    for (const a of G.map.terrs[t].adj) {
      if (d[a] !== undefined || !passable(a)) continue;
      d[a] = d[t] + 1; q.push(a);
    }
  }
  return d;
};

G.fortCost = (lvl, fi) => Math.round([100, 180, 280, 400][lvl] * (fi === 0 && G.meta.has('fort1') ? 0.7 : 1));
G.mineCost = (lvl, fi) => Math.round([120, 210, 320][lvl] * (fi === 0 && G.meta.has('mine1') ? 0.7 : 1));
G.maxFort = fi => (fi === 0 && G.meta.has('fort1')) ? 4 : 3;

G.incomeOf = function (m, fi) {
  let inc = 0;
  const mineV = 15 + (fi === 0 && G.meta.has('mine1') ? 5 : 0);
  for (const T of G.map.terrs) {
    const st = m.terr[T.id];
    if (st.owner !== fi) continue;
    inc += G.TTYPES[T.type].inc + st.mine * mineV;
  }
  if (m.mode === 'world') for (const C of G.map.countries) if (C.tids.every(t => m.terr[t].owner === fi)) inc += C.bonus;
  if (fi === 0) inc *= 1 + (G.meta.has('eco3') ? 0.35 : G.meta.has('eco2') ? 0.2 : G.meta.has('eco1') ? 0.1 : 0);
  else inc *= ({ easy: 0.8, normal: 1, hard: 1.3 }[m.diff] || 1) * (1 + 0.05 * m.world);
  return Math.round(inc);
};

/* ---------- match creation ---------- */
G.newMatch = function (world, country, diff) {
  const map = G.getMap(world);
  G.map = map;
  const wd = G.WORLDS[world];
  const mode = country === null ? 'world' : 'country';
  const R = G.rng(G.hashStr(`m-${world}-${country}-${Date.now()}`));
  const active = country === null ? map.terrs.map(t => t.id) : map.countries[country].tids.slice();
  const actSet = new Set(active);
  let nAI = mode === 'world' ? wd.ai : G.clamp(1 + Math.floor((country + world) / 2), 1, Math.min(3, wd.ai));
  while (nAI > 1 && active.length < nAI * 2 + 4) nAI--;

  const aiPool = G.AI_FACTIONS.map((f, i) => G.AI_FACTIONS[(i + world * 2 + (country || 0)) % G.AI_FACTIONS.length]);
  const factions = [{ ...G.PLAYER_FACTION, ai: false, credits: 300 + world * 120 + (G.meta.has('cash2') ? 300 : G.meta.has('cash1') ? 150 : 0), alive: true, capital: -1 }];
  for (let i = 0; i < nAI; i++) factions.push({ ...aiPool[i], ai: true, credits: Math.round(220 * wd.aiStart), alive: true, capital: -1 });

  const m = {
    v: 1, mode, world, country, diff, turn: 1, factions,
    terr: map.terrs.map(T => ({ owner: actSet.has(T.id) ? -1 : -2, units: {}, tired: {}, fort: 0, mine: 0 })),
    cd: { strike: 0, reinf: 0, shield: 0, emp: 0 },
    shields: {}, stats: { captured: 0, battlesWon: 0, battlesLost: 0, built: 0, lostTerr: 0, recruited: 0 },
    objectives: [], over: false, startTime: Date.now()
  };
  const pass = a => actSet.has(a);
  // player start: border of the zone (touching sea or outside)
  const border = active.filter(t => {
    const T = map.terrs[t];
    return T.coast.length > 0 || T.adj.some(a => !actSet.has(a));
  });
  const pStart = R.pick(border.length ? border : active);
  const starts = [pStart];
  for (let i = 0; i < nAI; i++) {
    const dists = starts.map(s => G.bfsDist(m, [s], pass));
    let best = -1, bv = -1;
    for (const t of active) {
      if (starts.includes(t)) continue;
      const v = Math.min(...dists.map(d => d[t] === undefined ? 99 : d[t])) + (map.terrs[t].type === 'city' ? 0.5 : 0) + R() * 0.3;
      if (v > bv) { bv = v; best = t; }
    }
    starts.push(best);
  }
  const give = (fi, tid, units) => { const st = m.terr[tid]; st.owner = fi; for (const k in units) st.units[k] = (st.units[k] || 0) + units[k]; };
  starts.forEach((s, fi) => {
    factions[fi].capital = s;
    const free = map.terrs[s].adj.filter(a => m.terr[a].owner === -1 && !starts.includes(a));
    const extra = R.shuffle(free).slice(0, fi === 0 ? 1 : (mode === 'world' ? 2 : 1));
    if (fi === 0) {
      const cap = { inf: 4 + world, tank: 2 + Math.floor(world / 2) };
      if (G.meta.has('vet')) { cap.tank += 2; cap.commando = 3; }
      give(0, s, cap);
      extra.forEach(t => give(0, t, { inf: 2 }));
    } else {
      const k = wd.aiStart * (mode === 'world' ? 1.2 : 1) * ({ easy: 0.75, normal: 1, hard: 1.3 }[diff] || 1);
      const u = { inf: Math.round(4 * k + (country || 0) * 0.6), tank: Math.round(1 * k + world * 0.4) };
      const adv = wd.tier.slice(2);
      adv.forEach((t, i) => { if (R() < 0.7) u[t] = (u[t] || 0) + 1 + Math.floor(world / 3); });
      give(fi, s, u);
      m.terr[s].fort = 1;
      extra.forEach(t => give(fi, t, { inf: Math.round(2 * k) }));
    }
  });
  // neutral garrisons
  for (const t of active) {
    const st = m.terr[t];
    if (st.owner !== -1) continue;
    const T = map.terrs[t];
    const u = { inf: 1 + R.int(2) + Math.floor(world * 0.8) };
    if (world >= 1 && R() < 0.3 + world * 0.1) u.tank = 1 + (world >= 3 ? 1 : 0);
    if (world >= 2 && R() < 0.25) u.aa = 1;
    if (T.type === 'city') u.inf += 1;
    st.units = u;
    if (T.type === 'mountain' || (T.type === 'city' && R() < 0.4)) st.fort = 1;
  }
  G.genObjectives(m, R);
  return m;
};

G.genObjectives = function (m, R) {
  const act = G.activeTids(m);
  const w = m.world;
  const pool = [];
  pool.push({ type: 'capture', n: Math.ceil(act.length * 0.5), text: n => `כבוש ${n} שטחים` });
  pool.push({ type: 'battles', n: 4 + w * 2, text: n => `נצח ב-${n} קרבות` });
  pool.push({ type: 'build', n: 3, text: n => `בנה ${n} מבנים (ביצור/מכרה)` });
  pool.push({ type: 'army', n: 20 + w * 6, text: n => `החזק צבא של ${n} יחידות` });
  pool.push({ type: 'income', n: 120 + w * 40 + (m.mode === 'world' ? 100 : 0), text: n => `הגע להכנסה של ${n} לתור` });
  const cities = act.filter(t => G.map.terrs[t].type === 'city' && m.terr[t].owner !== 0);
  if (cities.length) { const t = R.pick(cities); pool.push({ type: 'city', tid: t, n: 1, text: () => `כבוש את העיר ${G.map.terrs[t].name}` }); }
  if (m.factions.length > 2) pool.push({ type: 'elim', fi: 1, n: 1, text: () => `השמד את ${m.factions[1].name}` });
  R.shuffle(pool);
  m.objectives = pool.slice(0, 3).map(o => ({ type: o.type, n: o.n, tid: o.tid, fi: o.fi, text: o.text(o.n), done: false, reward: 120 + 60 * w }));
};

G.objProgress = function (m, o) {
  switch (o.type) {
    case 'capture': return m.stats.captured;
    case 'battles': return m.stats.battlesWon;
    case 'build': return m.stats.built;
    case 'army': return G.ownedBy(m, 0).reduce((s, t) => s + G.countUnits(m.terr[t].units), 0);
    case 'income': return G.incomeOf(m, 0);
    case 'city': return m.terr[o.tid].owner === 0 ? 1 : 0;
    case 'elim': return m.factions[o.fi].alive ? 0 : 1;
  }
  return 0;
};

G.checkObjectives = function (m) {
  for (const o of m.objectives) {
    if (o.done) continue;
    if (G.objProgress(m, o) >= o.n) {
      o.done = true;
      m.factions[0].credits += o.reward;
      G.meta.data.tp += 1; G.meta.save();
      G.ui && G.ui.toast(`✔ משימה הושלמה: ${o.text} (+${o.reward} 💰, +1 נק״מ)`, 'good');
      G.sfx.capture();
    }
  }
};

/* ---------- actions ---------- */
G.act = {
  recruit(m, fi, tid, type, n) {
    const st = m.terr[tid], f = m.factions[fi];
    const cost = G.UNITS[type].cost * n;
    if (st.owner !== fi || f.credits < cost || n <= 0) return false;
    f.credits -= cost;
    st.units[type] = (st.units[type] || 0) + n;
    if (fi === 0) { m.stats.recruited += n; if (type === 'mech') G.meta.ach('mech'); }
    return true;
  },
  build(m, fi, tid, kind) {
    const st = m.terr[tid], f = m.factions[fi];
    if (st.owner !== fi) return false;
    if (kind === 'fort') {
      if (st.fort >= G.maxFort(fi)) return false;
      const c = G.fortCost(st.fort, fi); if (f.credits < c) return false;
      f.credits -= c; st.fort++;
    } else {
      if (st.mine >= 3) return false;
      const c = G.mineCost(st.mine, fi); if (f.credits < c) return false;
      f.credits -= c; st.mine++;
    }
    if (fi === 0) m.stats.built++;
    return true;
  },
  move(m, fi, from, to, units) {
    const a = m.terr[from], b = m.terr[to];
    if (a.owner !== fi || b.owner !== fi || !G.isAdj(from, to)) return false;
    const mv = G.movable(a);
    for (const k in units) {
      const n = Math.min(units[k], mv[k] || 0);
      if (n <= 0) continue;
      a.units[k] -= n; if (!a.units[k]) delete a.units[k];
      b.units[k] = (b.units[k] || 0) + n;
      b.tired[k] = (b.tired[k] || 0) + n;
    }
    return true;
  },
  // returns {res, captured} or null
  attack(m, fi, from, to, units) {
    const a = m.terr[from], d = m.terr[to];
    if (a.owner !== fi || d.owner === fi || d.owner === -2 || !G.isAdj(from, to)) return null;
    if (m.shields[to] !== undefined && d.owner === m.shields[to]) return null;
    const mv = G.movable(a), send = {};
    for (const k in units) { const n = Math.min(units[k], mv[k] || 0); if (n > 0) send[k] = n; }
    if (!G.countUnits(send)) return null;
    for (const k in send) { a.units[k] -= send[k]; if (!a.units[k]) delete a.units[k]; if (a.tired[k] > a.units[k]) a.tired[k] = a.units[k] || 0; }
    const prevOwner = d.owner;
    let res;
    if (!G.countUnits(d.units)) res = { rounds: [], A: send, D: {}, win: true, empty: true };
    else res = G.resolveBattle(m, send, fi, to);
    if (res.win) {
      d.owner = fi; d.units = G.cloneU(res.A); d.tired = G.cloneU(res.A);
      d.fort = Math.max(0, d.fort - 1);
      G.onCapture(m, fi, to, prevOwner);
    } else {
      d.units = G.cloneU(res.D);
      for (const k in res.A) { a.units[k] = (a.units[k] || 0) + res.A[k]; a.tired[k] = (a.tired[k] || 0) + res.A[k]; }
    }
    if (!res.empty) {
      if (fi === 0) { res.win ? m.stats.battlesWon++ : m.stats.battlesLost++; G.meta.data.battles++; if (res.win) { G.meta.ach('first_blood'); G.meta.addXP(10); } if (G.meta.data.battles >= 100) G.meta.ach('warlord'); }
      else if (prevOwner === 0 && !res.win) m.stats.battlesWon++;
    }
    return { res, captured: res.win, prevOwner };
  }
};

G.onCapture = function (m, fi, tid, prevOwner) {
  if (fi === 0) { m.stats.captured++; G.meta.addXP(5); }
  if (prevOwner === 0) m.stats.lostTerr++;
  if (prevOwner >= 0) {
    const pf = m.factions[prevOwner];
    const left = G.ownedBy(m, prevOwner);
    if (!left.length) {
      pf.alive = false;
      m.factions[fi].credits += Math.round(pf.credits * 0.5);
      pf.credits = 0;
      G.ui && G.ui.toast(`${pf.name} הושמד!`, prevOwner === 0 ? 'bad' : 'gold');
    } else if (pf.capital === tid) {
      const loot = Math.round(pf.credits * 0.3);
      pf.credits -= loot; m.factions[fi].credits += loot;
      pf.capital = left.sort((a, b) => G.countUnits(m.terr[b].units) - G.countUnits(m.terr[a].units))[0];
      G.ui && G.ui.toast(`הבירה של ${pf.name} נפלה! (+${loot} שלל)`, fi === 0 ? 'gold' : 'bad');
    }
  }
};

G.checkEnd = function (m) {
  const act = G.activeTids(m);
  if (act.every(t => m.terr[t].owner === 0)) return 'win';
  if (!G.ownedBy(m, 0).length) return 'lose';
  return null;
};

G.parTurns = m => Math.round(G.activeTids(m).length * (m.mode === 'world' ? 0.5 : 0.9)) + 4;
G.missionKey = m => 'w' + m.world + (m.mode === 'world' ? 'all' : 'c' + m.country);

G.startTurn = function (m, fi) {
  const f = m.factions[fi];
  if (!(m.turn === 1 && fi === 0)) f.credits += G.incomeOf(m, fi);
  for (const T of G.map.terrs) if (m.terr[T.id].owner === fi) m.terr[T.id].tired = {};
  if (fi === 0) {
    for (const k in m.cd) if (m.cd[k] > 0) m.cd[k]--;
    for (const t in m.shields) if (m.shields[t] === 0) delete m.shields[t];
  } else {
    for (const t in m.shields) if (m.shields[t] === fi) delete m.shields[t];
  }
};

/* ---------- abilities ---------- */
G.ability = {
  available(m) { return Object.keys(G.ABILITIES).filter(k => G.meta.has(G.ABILITIES[k].req)); },
  cd(k) { const base = G.ABILITIES[k].cd; return k === 'strike' && G.meta.has('ab_strike2') ? base - 1 : base; },
  validTarget(m, k, tid) {
    const st = m.terr[tid];
    if (st.owner === -2) return false;
    return G.ABILITIES[k].target === 'own' ? st.owner === 0 : st.owner !== 0;
  },
  use(m, k, tid) {
    const st = m.terr[tid];
    if (m.cd[k] > 0 || !this.validTarget(m, k, tid)) return false;
    if (k === 'strike' || k === 'emp') {
      const frac = k === 'emp' ? 0.75 : G.meta.has('ab_strike2') ? 0.55 : 0.35;
      for (const u in st.units) { st.units[u] -= Math.ceil(st.units[u] * frac); if (st.units[u] <= 0) delete st.units[u]; }
      if (k === 'emp') st.fort = 0; else if (G.meta.has('ab_strike2')) st.fort = Math.max(0, st.fort - 1);
    } else if (k === 'reinf') {
      st.units.inf = (st.units.inf || 0) + 4; st.units.tank = (st.units.tank || 0) + 1;
    } else if (k === 'shield') {
      m.shields[tid] = 0;
    }
    m.cd[k] = this.cd(k);
    return true;
  }
};

/* ---------- save / load running match ---------- */
G.saveMatch = function (m) { try { localStorage.setItem('nw_match_v1', JSON.stringify(m)); } catch (e) {} };
G.loadMatch = function () { try { const m = JSON.parse(localStorage.getItem('nw_match_v1')); if (m && !m.over && m.v === 1) return m; } catch (e) {} return null; };
G.clearMatch = function () { try { localStorage.removeItem('nw_match_v1'); } catch (e) {} };
