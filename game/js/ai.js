'use strict';
/* ===== Neon Warfront – AI commanders ===== */
G.AI = {
  TH: { aggressive: 1.15, balanced: 1.4, turtle: 1.75 },

  async turn(m, fi, hooks) {
    const f = m.factions[fi];
    const terrs = G.map.terrs;
    const mods = G.mods(m, fi);
    const tier = fi === 0 ? G.meta.playerUnits(m.world) : G.WORLDS[m.world].tier;
    const enemyOf = o => o !== fi && o !== -2;
    const own = () => G.ownedBy(m, fi);

    // threat map
    const threat = {}, frontier = [];
    for (const t of own()) {
      let th = 0, isF = false;
      for (const a of terrs[t].adj) {
        const o = m.terr[a].owner;
        if (!enemyOf(o)) continue;
        isF = true;
        if (o >= 0) th = Math.max(th, G.unitPower(m.terr[a].units, G.mods(m, o)).p * (o === 0 ? 1.15 : 1));
      }
      threat[t] = th;
      if (isF) frontier.push(t);
    }
    const myP = t => G.unitPower(m.terr[t].units, mods).p;

    // ---- buildings ----
    const pers = f.pers;
    if (frontier.length) {
      const hot = frontier.slice().sort((a, b) => threat[b] - threat[a])[0];
      if ((pers === 'turtle' || threat[hot] > myP(hot) * 1.2) && m.terr[hot].fort < 3 && f.credits > G.fortCost(m.terr[hot].fort, fi) + 150 && Math.random() < (pers === 'turtle' ? 0.7 : 0.35))
        G.act.build(m, fi, hot, 'fort');
    }
    const interior = own().filter(t => !frontier.includes(t));
    if (f.credits > 450 && Math.random() < 0.5) {
      const c = (interior.length ? interior : own()).filter(t => m.terr[t].mine < 2);
      if (c.length) G.act.build(m, fi, c[Math.floor(Math.random() * c.length)], 'mine');
    }

    // ---- recruit ----
    const budgetFrac = { aggressive: 1, balanced: 0.9, turtle: 0.8 }[pers] || 0.9;
    let budget = f.credits * budgetFrac;
    const enemyAir = frontier.some(t => terrs[t].adj.some(a => { const u = m.terr[a].units; return enemyOf(m.terr[a].owner) && ((u.heli || 0) + (u.jet || 0)) > 0; }));
    const place = (frontier.length ? frontier : own()).slice().sort((a, b) => (threat[b] - myP(b)) - (threat[a] - myP(a)));
    const spots = place.slice(0, Math.min(3, place.length));
    let si = 0, guard = 0;
    const cheapest = G.UNITS.inf.cost;
    while (budget >= cheapest && spots.length && guard++ < 60) {
      let type;
      const r = Math.random();
      const affordable = tier.filter(t => G.UNITS[t].cost <= budget);
      if (enemyAir && tier.includes('aa') && r < 0.25 && G.UNITS.aa.cost <= budget) type = 'aa';
      else if (r < 0.45) type = affordable[affordable.length - 1];
      else if (r < 0.75) type = affordable[Math.floor(Math.random() * affordable.length)];
      else type = 'inf';
      if (!type) break;
      if (G.act.recruit(m, fi, spots[si % spots.length], type, 1)) budget -= G.UNITS[type].cost;
      si++;
    }

    // ---- attacks ----
    const th = (this.TH[pers] || 1.4) * Math.max(0.8, 1 - Math.max(0, m.turn - 18) * 0.01); // grow bolder in long games
    const order = own().sort((a, b) => myP(b) - myP(a));
    let attacks = 0;
    for (const t of order) {
      if (m.terr[t].owner !== fi) continue;
      const mv = G.movable(m.terr[t]);
      if (!G.countUnits(mv)) continue;
      let best = null, bs = 0;
      for (const a of terrs[t].adj) {
        const st = m.terr[a];
        if (!enemyOf(st.owner) || st.owner === fi) continue;
        if (st.owner === 0 && m.turn <= 2 && m.diff !== 'hard') continue; // grace period
        if (m.shields[a] !== undefined && m.shields[a] === st.owner) continue;
        const dp = G.unitPower(st.units, G.mods(m, st.owner)).p * Math.sqrt(G.defBonus(m, a, mv));
        const ratio = G.unitPower(mv, mods).p / (dp + 0.01);
        let value = 1 + (terrs[a].type === 'city' ? 0.3 : 0) + (terrs[a].type === 'resource' ? 0.2 : 0);
        if (st.owner === 0) value += m.diff === 'hard' ? 0.35 : 0.15;
        if (st.owner >= 0 && m.factions[st.owner].capital === a) value += 0.25;
        if (!G.countUnits(st.units)) value += 1;
        const score = ratio * value;
        if (ratio >= th && score > bs) { bs = score; best = a; }
      }
      if (best === null) continue;
      // garrison
      const send = G.cloneU(mv);
      if (threat[t] > 0 && (send.inf || 0) > 1 && pers !== 'aggressive') {
        const keep = Math.ceil(send.inf * 0.4); send.inf -= keep; if (!send.inf) delete send.inf;
      }
      // never leave a frontier territory completely empty
      if (G.countUnits(send) >= G.countUnits(m.terr[t].units) && G.countUnits(send) > 1) {
        const k = Object.keys(send).sort((x, y) => G.UNITS[x].cost - G.UNITS[y].cost)[0];
        send[k]--; if (!send[k]) delete send[k];
      }
      if (!G.countUnits(m.terr[best].units)) { // just one unit is enough for empty land
        const k = Object.keys(send).sort((x, y) => G.UNITS[x].cost - G.UNITS[y].cost)[0];
        for (const x in send) if (x !== k) delete send[x];
        send[k] = 1;
      }
      const prev = m.terr[best].owner;
      const out = G.act.attack(m, fi, t, best, send);
      if (!out) continue;
      attacks++;
      if (hooks && hooks.event) await hooks.event({ type: 'attack', fi, from: t, to: best, prev, out, sent: send });
      if (G.checkEnd(m) === 'lose') return;
      if (attacks > 12) break;
    }

    // ---- consolidate toward the front ----
    const ownSet = new Set(own());
    const front = own().filter(t => terrs[t].adj.some(a => enemyOf(m.terr[a].owner) && m.terr[a].owner !== fi));
    if (front.length) {
      const dist = G.bfsDist(m, front, a => ownSet.has(a));
      const movers = own().filter(t => dist[t] > 0).sort((a, b) => dist[b] - dist[a]);
      for (const t of movers) {
        const mv = G.movable(m.terr[t]);
        if (!G.countUnits(mv)) continue;
        const next = terrs[t].adj.filter(a => ownSet.has(a) && dist[a] === dist[t] - 1);
        if (!next.length) continue;
        const to = next.sort((a, b) => threat[b] - threat[a])[0];
        G.act.move(m, fi, t, to, mv);
      }
    }
  }
};
