// Pages: Winner Sal (basketball form), Winner Line (fixed odds), all Toto games & draws, mobile menu.
'use strict';

// ---------- shared bits ----------
const fairOdds = p => (p > 0.001 ? (1 / p).toFixed(2) : '—');
function donut(p, label) {
  const deg = Math.round(Math.max(0, Math.min(1, p)) * 360);
  return `<span class="donut" style="--deg:${deg}deg" title="${esc(label || '')}"><b>${Math.round(p * 100)}%</b></span>`;
}
function bskTeam(L, i) { return L.teams[i] || { he: '?', key: '?' }; }

// ---------- WINNER SAL ----------
const BSK_ORDER = ['bsk.isr', 'bsk.euro', 'bsk.nba'];
function bskUpcoming(days) {
  const from = todayISO(), to = addDays(from, days);
  const out = [];
  for (const code of BSK_ORDER) {
    const L = BSK.leagues[code]; if (!L) continue;
    if (S.bLeagues && !S.bLeagues.includes(code)) continue;
    L.m.forEach((m, idx) => { if (m.d >= from && m.d <= to && m.hs == null) out.push({ code, m, idx }); });
  }
  return out.sort((a, b) => (a.m.d + a.m.t).localeCompare(b.m.d + b.m.t) || BSK_ORDER.indexOf(a.code) - BSK_ORDER.indexOf(b.code));
}
function bskEntryResolve(e) {
  const L = BSK.leagues[e.code]; if (!L) return null;
  const h = L.teams.findIndex(t => t.key === e.hk), a = L.teams.findIndex(t => t.key === e.ak);
  if (h < 0 || a < 0) return null;
  const m = L.m.find(x => x.h === h && x.a === a && Math.abs(daysBetween(x.d, e.d)) <= 3) || null;
  return { L, h, a, m };
}
function bskEntryProbs(e) {
  const r = bskEntryResolve(e); if (!r) return null;
  const asOf = r.m && r.m.hs != null ? r.m.d : todayISO();
  const p = bskPredict(e.code, r.h, r.a, asOf, { type: e.type, line: e.line });
  return { r, p, P: { '1': p.p1, 'X': p.px, '2': p.p2 } };
}
function bskOutcome(e, m) {
  if (!m || m.hs == null) return null;
  // Source scores may include overtime; the 1/X/2 at regulation cannot be told apart when a game went to OT, so treat final score.
  let v, k = +e.line;
  if (e.type === 'spread' && e.line !== '' && !isNaN(k)) v = (m.hs - m.as) - k;
  else if (e.type === 'total' && e.line !== '' && !isNaN(k)) return (m.hs + m.as) < k ? '1' : (m.hs + m.as) === k ? 'X' : '2';
  else v = m.hs - m.as;
  return v > 0 ? '1' : v === 0 ? 'X' : '2';
}

function renderBasket() {
  const V = $('#view-basket');
  if (!BSK.ok) { V.innerHTML = '<div class="empty">נתוני הכדורסל לא נטענו. רענן את הדף.</div>'; return; }
  S.bform = S.bform || []; S.bsys = S.bsys || { cols: 8, price: 2 };
  const games = bskUpcoming(7);
  const inForm = new Set(S.bform.map(e => `${e.code}|${e.hk}|${e.ak}|${e.d}`));
  // slip
  const items = S.bform.map(e => ({ e, x: bskEntryProbs(e) })).filter(o => o.x);
  let slip = '';
  if (items.length) {
    const probs = items.map(o => o.x.P);
    const locked = items.map(o => (o.e.pick && o.e.pick.length ? o.e.pick : null));
    const freeIdx = items.map((o, i) => (locked[i] ? -1 : i)).filter(i => i >= 0);
    const lockedCols = locked.reduce((s, p) => s * (p ? p.length : 1), 1);
    const best = freeIdx.length ? optimiseByColumns(freeIdx.map(i => probs[i]), Math.max(1, Math.floor(S.bsys.cols / lockedCols))) : { picks: [] };
    const picks = items.map((o, i) => locked[i] || best.picks[freeIdx.indexOf(i)]);
    const hits = picks.map((pk, i) => pk.reduce((s, k) => s + probs[i][k], 0));
    const cols = picks.reduce((s, p) => s * p.length, 1), dist = hitDistribution(hits), n = items.length;
    const all = dist[n] || 0;
    const fin = items.filter(o => o.x.r.m && o.x.r.m.hs != null);
    const finHit = fin.filter(o => picks[items.indexOf(o)].includes(bskOutcome(o.e, o.x.r.m))).length;
    slip = `<div class="kpis">
        <div class="kpi hl"><b>${cols.toLocaleString('he-IL')}</b><span>טורים</span></div>
        <div class="kpi"><b>₪${(cols * (+S.bsys.price || 0)).toLocaleString('he-IL')}</b><span>עלות</span></div>
        <div class="kpi"><b>${fx(hits.reduce((a, b) => a + b, 0))}</b><span>צפי פגיעות מתוך ${n}</span></div>
        <div class="kpi"><b>${pctSmall(all)}</b><span>סיכוי לכל ה־${n}</span></div>
        ${fin.length ? `<div class="kpi ${finHit === fin.length ? 'good' : ''}"><b>${finHit}/${fin.length}</b><span>פגיעות במשחקים שהסתיימו</span></div>` : ''}
      </div>
      <ol class="slip">${items.map((o, i) => {
        const { e, x } = o, L = x.r.L, H = bskTeam(L, x.r.h).he, A = bskTeam(L, x.r.a).he, pk = picks[i];
        const res = bskOutcome(e, x.r.m), done = res != null;
        return `<li class="row${done ? (pk.includes(res) ? ' is-hit' : ' is-miss') : ''}">
          <span class="n">${i + 1}</span>
          <div class="teams" data-bopen="${i}"><b>${esc(H)} – ${esc(A)}</b>
            <div class="meta"><span>${esc(L.name)}</span><span>${fmtDate(e.d, x.r.m && x.r.m.t)}</span><span>צפי <span dir="ltr">${Math.round(x.p.pa)}:${Math.round(x.p.ph)}</span></span>${done ? `<span class="tag ${pk.includes(res) ? 'hit' : 'miss'}">${SC(x.r.m.hs, x.r.m.as)}</span>` : ''}</div>
            <div class="bline">
              <select data-btype="${i}" aria-label="סוג הימור">
                <option value="win"${!e.type || e.type === 'win' ? ' selected' : ''}>1/X/2 בזמן חוקי</option>
                <option value="spread"${e.type === 'spread' ? ' selected' : ''}>לפי הפרש (קו)</option>
                <option value="total"${e.type === 'total' ? ' selected' : ''}>לפי סך נקודות (קו)</option>
              </select>
              ${e.type === 'spread' || e.type === 'total' ? `<input type="number" step="0.5" inputmode="decimal" data-bline="${i}" value="${esc(e.line ?? '')}" placeholder="${e.type === 'spread' ? 'למשל 5.5' : 'למשל 162.5'}" aria-label="קו">` : ''}
              ${x.p.market ? `<span class="note">${esc(x.p.market)}</span>` : ''}
            </div>
          </div>
          <div class="side"><div class="boxes">${['1', 'X', '2'].map(k => `<button class="box${pk.includes(k) ? ' on' : ''}${e.pick && e.pick.includes(k) ? ' lock' : ''}" data-bi="${i}" data-bo="${k}"><span class="o">${k}</span><span class="p">${pct(x.P[k])}</span></button>`).join('')}</div>
          <div class="row-tools"><button class="icon-btn" data-bdel="${i}" aria-label="הסר">✕</button></div></div>
        </li>`;
      }).join('')}</ol>`;
  }
  const byDay = {}; games.forEach(g => (byDay[g.m.d] = byDay[g.m.d] || []).push(g));
  V.innerHTML = `
    <section class="hero hero-court">
      ${courtArt()}
      <div><p class="eyebrow">כדורסל</p><h1>ווינר סל</h1>
        <p>ליגת העל, היורוליג וה־NBA. לכל משחק המערכת מחשבת תוצאה צפויה, סיכוי ל־1/X/2 בסוף הזמן החוקי (X = שוויון לפני הארכה) והסיכוי לנצח כולל הארכה. בטופס אפשר לבחור הימור לפי קו הפרש או סך נקודות, ולהזין את הקו מהטופס של ווינר.</p></div>
      <div class="hero-kpis">
        <div class="hero-kpi"><b>67%</b><span>פגיעה במנצח ב־NBA (בדיקה לאחור)</span></div>
        <div class="hero-kpi"><b>63%</b><span>פגיעה במנצח ביורוליג</span></div>
        <div class="hero-kpi"><b>${games.length}</b><span>משחקים ב־7 הימים הקרובים</span></div>
      </div>
    </section>
    <div class="panel">
      <div class="section-title"><h2>טופס ווינר סל</h2>
        <span class="actions"><label class="field inline"><span>טורים</span><select id="bs-cols">${[1, 2, 3, 4, 6, 8, 9, 12, 16, 18, 24, 27, 32, 36, 48, 64, 81, 96, 128, 162, 243].map(c => `<option${c === +S.bsys.cols ? ' selected' : ''}>${c}</option>`).join('')}</select></label>
        <label class="field inline"><span>₪ לטור</span><input id="bs-price" type="number" min="0" step="0.5" value="${S.bsys.price}" style="width:70px"></label>
        <button class="btn small ghost" id="bs-clear">ניקוי</button></span></div>
      <p class="note">הוסף משחקים מהרשימה למטה כפי שהם מופיעים בטופס הרשמי. לחיצה על 1/X/2 קובעת ניחוש ידני. כללי ווינר סל משתנים מעונה לעונה, ולכן בדוק בטופס הרשמי אם ההכרעה לפי זמן חוקי, הפרש או סך נקודות, ובחר בהתאם.</p>
      ${slip || '<p class="empty">הטופס ריק. לחץ "+ לטופס" על משחק למטה.</p>'}
    </div>
    <div class="filters">
      <div class="league-chips">${BSK_ORDER.filter(c => BSK.leagues[c]).map(c => `<button class="chip" data-bl="${c}" aria-pressed="${!S.bLeagues || S.bLeagues.includes(c)}">🏀 ${esc(BSK.leagues[c].name)}</button>`).join('')}</div>
    </div>
    ${Object.keys(byDay).length ? Object.entries(byDay).map(([d, gs]) => `<div class="day"><h2>${fmtDate(d)} · ${gs.length} משחקים</h2><div class="cards">${gs.map(g => bskCard(g, inForm)).join('')}</div></div>`).join('') : '<div class="empty">אין משחקים בשבוע הקרוב בליגות שנבחרו.</div>'}
    <p class="note">מקורות: TheSportsDB (ליגת העל, יורוליג) ו־ESPN (NBA). נתונים עד ${BSK.built ? dmy(BSK.built) : '–'}.</p>`;
}

function bskCard(g, inForm) {
  const L = BSK.leagues[g.code], H = bskTeam(L, g.m.h), A = bskTeam(L, g.m.a);
  const p = bskPredict(g.code, g.m.h, g.m.a, todayISO());
  const P = { '1': p.p1, 'X': p.px, '2': p.p2 }, fav = p.winOT >= 0.5 ? H.he : A.he, favP = Math.max(p.winOT, 1 - p.winOT);
  const k = `${g.code}|${H.key}|${A.key}|${g.m.d}`;
  return `<article class="mcard">
    <div class="lg"><span>🏀 ${esc(L.name)}</span><span>${esc(g.m.t)}</span></div>
    <div class="vs" data-bmatch="${g.code}|${g.idx}">
      <div class="team">${badge(H.he, H.key)}<b>${esc(H.he)}</b></div>
      <span class="mid score"><span dir="ltr">${Math.round(p.pa)}:${Math.round(p.ph)}</span><small class="note">צפי</small></span>
      <div class="team">${badge(A.he, A.key)}<b>${esc(A.he)}</b></div>
    </div>
    ${probBar(P)}
    <div class="reason">${esc(fav)} מנצחת ב־${pct(favP)} (כולל הארכה) · הפרש צפוי ${fx(Math.abs(p.m))} · סך נקודות ${Math.round(p.t)}${p.reliability < 4 ? ' · מעט נתונים' : ''}</div>
    <div class="card-foot"><span>${donut(favP, 'סיכוי לנצח')}</span>
      ${inForm.has(k) ? '<span class="tag hit">בטופס</span>' : `<button class="btn small" data-badd="${g.code}|${g.idx}">+ לטופס</button>`}</div>
  </article>`;
}

function openBasketMatch(code, idx) {
  const L = BSK.leagues[code], m = L.m[idx], H = bskTeam(L, m.h), A = bskTeam(L, m.a);
  const asOf = m.hs != null ? m.d : todayISO();
  const p = bskPredict(code, m.h, m.a, asOf);
  const last = t => L.m.filter(x => x.hs != null && x.d < asOf && (x.h === t || x.a === t)).slice(-8).reverse();
  const h2h = L.m.filter(x => x.hs != null && ((x.h === m.h && x.a === m.a) || (x.h === m.a && x.a === m.h))).slice(-10).reverse();
  const tab = bskStandings(L), th = tab.find(r => r.t === m.h), ta = tab.find(r => r.t === m.a);
  const rec = t => { const l = last(t); return `<div class="tbl-wrap"><table><tbody>${l.map(x => { const home = x.h === t, gf = home ? x.hs : x.as, ga = home ? x.as : x.hs, o = home ? x.a : x.h; return `<tr><td class="num">${fmtDate(x.d)}</td><td>${home ? 'בית' : 'חוץ'} · ${esc(bskTeam(L, o).he)}</td><td class="num c">${gf}:${ga}</td><td class="c"><span class="form"><i class="${gf > ga ? 'W' : 'L'}">${gf > ga ? 'נ' : 'ה'}</i></span></td></tr>`; }).join('') || '<tr><td>אין משחקים</td></tr>'}</tbody></table></div>`; };
  const spreads = [-10.5, -5.5, -2.5, 2.5, 5.5, 10.5].map(k => ({ k, q: lineProbs(p.m, p.sdm, k) }));
  const totals = [Math.round(p.t) - 10.5, Math.round(p.t) - 0.5, Math.round(p.t) + 9.5].map(k => ({ k, q: lineProbs(p.t, p.sdt, k) }));
  openSheet(`
    <div class="m-head">
      <div>${badge(H.he, H.key, true)}<h2>${esc(H.he)}</h2><div class="pos">${th ? `מקום ${th.pos} · ${th.w}-${th.l}` : ''}</div></div>
      <div><span class="mid">${m.hs != null ? SC(m.hs, m.as) : `<span dir="ltr">${Math.round(p.pa)}:${Math.round(p.ph)}</span>`}</span><span class="mnote">${m.hs != null ? 'תוצאה' : 'תוצאה צפויה'} · ${esc(L.name)}<br>${fmtDate(m.d, m.t)}</span></div>
      <div>${badge(A.he, A.key, true)}<h2>${esc(A.he)}</h2><div class="pos">${ta ? `מקום ${ta.pos} · ${ta.w}-${ta.l}` : ''}</div></div>
    </div>
    <div class="panel"><h3>הסיכויים</h3>
      ${probBar({ '1': p.p1, 'X': p.px, '2': p.p2 })}
      <div class="stats">
        <div class="stat"><b>${pct(p.winOT)}</b><span>${esc(H.he)} מנצחת (כולל הארכה)</span></div>
        <div class="stat"><b>${pct(1 - p.winOT)}</b><span>${esc(A.he)} מנצחת (כולל הארכה)</span></div>
        <div class="stat"><b>${pct(p.px)}</b><span>שוויון בסוף הזמן החוקי</span></div>
        <div class="stat"><b>${fx(p.m)}</b><span>הפרש צפוי לטובת ${esc(p.m >= 0 ? H.he : A.he)}</span></div>
        <div class="stat"><b>${Math.round(p.t)}</b><span>סך נקודות צפוי</span></div>
        <div class="stat"><b>±${Math.round(p.sdm)}</b><span>סטיית תקן של ההפרש</span></div>
      </div></div>
    <div class="grid2">
      <div class="panel"><h3>קווי הפרש (הבית מנצח ביותר מ…)</h3><div class="tbl-wrap"><table><thead><tr><th>קו</th><th class="c">1 (מעל)</th><th class="c">2 (מתחת)</th></tr></thead><tbody>
        ${spreads.map(({ k, q }) => `<tr><td class="num">${k}</td><td class="c num">${pct(q.above)} · ${fairOdds(q.above)}</td><td class="c num">${pct(q.below)} · ${fairOdds(q.below)}</td></tr>`).join('')}</tbody></table></div>
        <p class="note">אחוז · יחס הוגן (יחס שמתחתיו ההימור לא משתלם).</p></div>
      <div class="panel"><h3>קווי סך נקודות</h3><div class="tbl-wrap"><table><thead><tr><th>קו</th><th class="c">1 (פחות)</th><th class="c">2 (יותר)</th></tr></thead><tbody>
        ${totals.map(({ k, q }) => `<tr><td class="num">${k}</td><td class="c num">${pct(q.below)} · ${fairOdds(q.below)}</td><td class="c num">${pct(q.above)} · ${fairOdds(q.above)}</td></tr>`).join('')}</tbody></table></div></div>
    </div>
    ${h2h.length ? `<div class="panel"><h3>ראש בראש</h3><div class="tbl-wrap"><table><tbody>${h2h.map(x => `<tr><td class="num">${dmy(x.d)}.${x.d.slice(2, 4)}</td><td>${esc(bskTeam(L, x.h).he)}</td><td class="num c">${SC(x.hs, x.as)}</td><td>${esc(bskTeam(L, x.a).he)}</td></tr>`).join('')}</tbody></table></div></div>` : ''}
    <div class="grid2"><div class="panel"><h3>${esc(H.he)} · 8 אחרונים</h3>${rec(m.h)}</div><div class="panel"><h3>${esc(A.he)} · 8 אחרונים</h3>${rec(m.a)}</div></div>
    ${m.hs == null ? `<div class="actions"><button class="btn primary" data-badd="${code}|${idx}">הוספה לטופס ווינר סל</button></div>` : ''}`);
}

// ---------- WINNER LINE ----------
function lineMarketsFootball(x) {
  const p = predictCached(x.code, x.m.h, x.m.a, todayISO());
  const P = probsOf(p), L = DB.leagues[x.code];
  return { title: `${L.teams[x.m.h].he} – ${L.teams[x.m.a].he}`, league: leagueName(x.code), d: x.m.d, t: x.m.t, sport: '⚽', key: `f|${x.code}|${L.teams[x.m.h].key}|${L.teams[x.m.a].key}|${x.m.d}`,
    markets: [['1', P['1']], ['X', P['X']], ['2', P['2']], ['1X', P['1'] + P['X']], ['X2', P['X'] + P['2']], ['12', P['1'] + P['2']], ['מעל 2.5', p.o25], ['מתחת 2.5', 1 - p.o25], ['שתיהן יבקיעו', p.btts]] };
}
function lineMarketsBasket(g) {
  const L = BSK.leagues[g.code], p = bskPredict(g.code, g.m.h, g.m.a, todayISO());
  return { title: `${bskTeam(L, g.m.h).he} – ${bskTeam(L, g.m.a).he}`, league: L.name, d: g.m.d, t: g.m.t, sport: '🏀', key: `b|${g.code}|${bskTeam(L, g.m.h).key}|${bskTeam(L, g.m.a).key}|${g.m.d}`,
    markets: [['1 (כולל הארכה)', p.winOT], ['2 (כולל הארכה)', 1 - p.winOT], ['1 זמן חוקי', p.p1], ['X זמן חוקי', p.px], ['2 זמן חוקי', p.p2]] };
}
function renderLine() {
  const V = $('#view-line');
  S.line = S.line || []; S.lineSport = S.lineSport || 'all';
  const [from, to] = weekendRange();
  let games = [];
  if (S.lineSport !== 'basket') games = games.concat(upcoming(from, to, PRIORITY.filter(hasData)).filter(x => x.m.hg == null).map(lineMarketsFootball));
  if (S.lineSport !== 'foot' && BSK.ok) games = games.concat(bskUpcoming(4).map(lineMarketsBasket));
  games.sort((a, b) => (a.d + a.t).localeCompare(b.d + b.t));
  const top = games.flatMap(g => g.markets.filter(([n]) => !/^(1X|X2|12)$/.test(n)).map(([n, p]) => ({ g, n, p }))).filter(o => o.p >= 0.62 && o.p <= 0.9).sort((a, b) => b.p - a.p).slice(0, 10);
  const comb = S.line.reduce((s, x) => s * x.p, 1);
  const odds = +S.lineOdds || 0, stake = +S.lineStake || 0;
  const ev = odds ? comb * odds - 1 : null;
  const chosen = new Set(S.line.map(x => x.id));
  const chip = (g, n, p) => { const id = g.key + '#' + n; return `<button class="mchip${chosen.has(id) ? ' on' : ''}" data-lchip="${esc(id)}" data-lp="${p}" data-ll="${esc(g.title + ' · ' + n)}"><b>${esc(n)}</b><span>${pct(p)}</span><em>${fairOdds(p)}</em></button>`; };
  V.innerHTML = `
    <section class="hero hero-line">
      <div><p class="eyebrow">יחס קבוע</p><h1>ווינר ליין</h1>
        <p>לכל אפשרות המערכת נותנת סיכוי ו<b>יחס הוגן</b> (1 חלקי הסיכוי). אם היחס שווינר מציע גבוה מהיחס ההוגן, ההימור משתלם לאורך זמן. בונים ליין בלחיצה על האפשרויות, ומזינים את היחס של ווינר כדי לראות אם הוא משתלם.</p></div>
    </section>
    <div class="grid2">
      <div class="panel">
        <div class="section-title"><h2>הליין שלי</h2>${S.line.length ? '<button class="btn small ghost" id="line-clear">ניקוי</button>' : ''}</div>
        ${S.line.length ? `<div class="plist">${S.line.map((x, i) => `<div class="prow"><div><div class="t">${esc(x.label)}</div><div class="m">סיכוי ${pct(x.p)} · יחס הוגן ${fairOdds(x.p)}</div></div><div class="r"><button class="icon-btn" data-ldel="${i}" aria-label="הסר">✕</button></div></div>`).join('')}</div>
        <div class="kpis">
          <div class="kpi hl"><b>${pctSmall(comb)}</b><span>סיכוי שכל ה־${S.line.length} יפגעו</span></div>
          <div class="kpi"><b>${fairOdds(comb)}</b><span>יחס הוגן לליין</span></div>
        </div>
        <div class="sys-controls">
          <label class="field"><span>היחס שווינר מציע לליין</span><input id="line-odds" type="number" step="0.01" min="1" inputmode="decimal" value="${esc(S.lineOdds || '')}" placeholder="למשל ${fairOdds(comb)}"></label>
          <label class="field"><span>סכום (₪)</span><input id="line-stake" type="number" step="1" min="0" inputmode="decimal" value="${esc(S.lineStake || '')}" placeholder="למשל 20"></label>
        </div>
        ${odds ? `<div class="kpis"><div class="kpi ${ev > 0 ? 'good' : 'bad'}"><b>${ev > 0 ? '+' : ''}${(ev * 100).toFixed(0)}%</b><span>${ev > 0 ? 'משתלם: ערך חיובי' : 'לא משתלם: ערך שלילי'}</span></div>${stake ? `<div class="kpi"><b>₪${(stake * odds).toLocaleString('he-IL', { maximumFractionDigits: 0 })}</b><span>זכייה אם פוגע</span></div><div class="kpi"><b>${ev >= 0 ? '+' : '−'}₪${Math.abs(stake * ev).toFixed(1)}</b><span>תוחלת רווח</span></div>` : ''}</div>` : ''}
        <p class="note">ווינר ליין דורש בדרך כלל לפחות 3 בחירות. ליין ארוך יותר נותן יחס גבוה יותר, אבל הסיכוי שכל הבחירות יפגעו יורד מהר.</p>` : '<p class="empty">לחץ על אפשרות באחד המשחקים כדי להוסיף אותה לליין.</p>'}
      </div>
      <div class="panel"><h2>הבחירות הבטוחות של סוף השבוע</h2>
        <p class="note">אפשרויות עם סיכוי 62%–90%. היחס ההוגן הוא המינימום שכדאי לקבל.</p>
        <div class="plist">${top.map(o => `<div class="prow"><div><div class="t">${o.g.sport} ${esc(o.g.title)}</div><div class="m">${esc(o.g.league)} · ${fmtDate(o.g.d, o.g.t)}</div></div><div class="r"><span class="pct">${pct(o.p)}</span><span class="pick">${esc(o.n)}</span><span class="tag">≥${fairOdds(o.p)}</span></div></div>`).join('') || '<p class="note">אין כרגע.</p>'}</div>
      </div>
    </div>
    <div class="filters"><div class="seg" role="group">${[['all', 'הכל'], ['foot', '⚽ כדורגל'], ['basket', '🏀 כדורסל']].map(([k, l]) => `<button data-lsport="${k}" aria-pressed="${S.lineSport === k}">${l}</button>`).join('')}</div>
      <span class="note">${games.length} משחקים · כל אפשרות: שם · סיכוי · יחס הוגן</span></div>
    <div class="cards">${games.slice(0, 80).map(g => `<article class="mcard"><div class="lg"><span>${g.sport} ${esc(g.league)}</span><span>${fmtDate(g.d, g.t)}</span></div>
      <h3 class="mtitle">${esc(g.title)}</h3><div class="mchips">${g.markets.map(([n, p]) => chip(g, n, p)).join('')}</div></article>`).join('')}</div>`;
}

// ---------- ALL GAMES & DRAWS ----------
function renderGames() {
  const card = (icon, title, status, cls, text, go) => `<div class="panel game-card ${cls}"><div class="section-title"><h3>${icon} ${title}</h3><span class="tag ${cls === 'yes' ? 'hit' : cls === 'part' ? 'low' : ''}">${status}</span></div><p>${text}</p>${go ? `<div class="actions"><button class="btn small primary" data-go="${go}">פתיחה</button></div>` : ''}</div>`;
  $('#view-games').innerHTML = `
    <div class="page-head"><div><p class="eyebrow">טוטו ומפעל הפיס</p><h1>כל המשחקים וההגרלות</h1>
      <p class="sub">מה האתר יודע לעשות לכל משחק, ומה לא. בדקתי מול כללי המשחקים שמצאתי; תמיד כדאי לוודא בתקנון הרשמי.</p></div></div>
    <h2>משחקי הטוטו (ווינר)</h2>
    <div class="grid2">
      ${card('⚽', 'ווינר 16', 'נתמך', 'yes', '16 משחקי כדורגל, 1/X/2. טופס השבוע נטען בלחיצה, ניחוש מנומק לכל משחק, חלוקת כפולים ומשולשים לפי תקציב, זכייה ב־12 עד 16 נכונים, מעקב וצביעה חיה.', 'form')}
      ${card('🏀', 'ווינר סל', 'נתמך', 'yes', 'טופס כדורסל: ליגת העל, יורוליג ו־NBA. 1/X/2 בזמן חוקי, או לפי קו הפרש וסך נקודות שמזינים מהטופס. כולל תוצאה צפויה וסיכוי לנצח כולל הארכה.', 'basket')}
      ${card('📈', 'ווינר ליין (יחס קבוע)', 'נתמך', 'yes', 'יחס הוגן לכל אפשרות בכדורגל ובכדורסל, בחירות בטוחות, ובונה ליין שמחשב את הסיכוי הכולל ואם היחס של ווינר משתלם.', 'line')}
      ${card('⏱️', 'ווינר מחצית', 'חלקי', 'part', 'ניחוש תוצאת המחצית. אין במערכת נתוני מחציות לכל הליגות, ולכן אין תחזית מחצית ייעודית. אפשר להיעזר בצפי השערים של כל משחק.', '')}
      ${card('🌍', 'ווינר עולמי', 'חלקי', 'part', 'משחקי כדורגל בינלאומיים. הליגות האירופיות והמפעלים האירופיים נתמכים; משחקי נבחרות עדיין לא.', 'week')}
      ${card('🎯', 'ווינר מיליונר', 'לא נתמך', '', 'ניחוש שבעה משחקים שייגמרו בתיקו. האתר נותן סיכוי תיקו לכל משחק (בעמוד המשחקים), אבל אין טופס ייעודי.', 'week')}
    </div>
    <h2>הגרלות מפעל הפיס</h2>
    <div class="grid2">
      ${card('🎱', 'לוטו', 'הגרלה אקראית', '', 'המספרים נבחרים באקראי מוחלט, ולכן שום נתון עבר לא משפר את הסיכוי. סטטיסטיקות של מספרים "חמים" ו"קרים" לא מנבאות את ההגרלה הבאה.', '')}
      ${card('🃏', "צ'אנס", 'הגרלה אקראית', '', 'ארבעה קלפים אקראיים. אין דרך סטטיסטית לנבא; כל צירוף בעל אותו סיכוי.', '')}
      ${card('7️⃣', '777 ו־123', 'הגרלה אקראית', '', 'הגרלות אקראיות לחלוטין. האתר לא נותן ניחושים להגרלות אקראיות, כי אין להם בסיס.', '')}
    </div>
    <p class="note">בניגוד להגרלות, בספורט יש מידע אמיתי (כוח הקבוצות, טבלה, ביתיות) ולכן אפשר לשפר את הסיכוי מעבר לניחוש אקראי, וזה מה שהאתר עושה. הימורים מגיל 18.</p>`;
}

// ---------- mobile menu ----------
function openMenu() {
  const items = [['home', '🏠', 'ראשי'], ['form', '⚽', 'ווינר 16'], ['basket', '🏀', 'ווינר סל'], ['line', '📈', 'ווינר ליין'], ['week', '📅', 'משחקים וניחושים'], ['track', '📊', 'דיוק ולמידה'], ['tables', '🏆', 'טבלאות'], ['games', '🎲', 'כל המשחקים וההגרלות'], ['info', 'ℹ️', 'השיטה והנתונים']];
  openSheet(`<div class="panel"><h2>תפריט</h2><div class="menu-grid">${items.map(([k, i, l]) => `<button class="menu-item" data-go="${k}"><span>${i}</span>${l}</button>`).join('')}</div></div>`);
}

// ---------- events ----------
function bindPages() {
  document.addEventListener('click', e => {
    if (e.target.closest('#menu-btn')) { openMenu(); return; }
    const ba = e.target.closest('[data-badd]');
    if (ba) {
      const [code, idx] = ba.dataset.badd.split('|'), L = BSK.leagues[code], m = L.m[+idx];
      S.bform = S.bform || [];
      if (S.bform.length >= 16) { toast('בטופס כבר 16 משחקים'); return; }
      S.bform.push({ code, hk: L.teams[m.h].key, ak: L.teams[m.a].key, d: m.d, type: 'win', line: '' });
      save(); closeSheet(); if (S.tab === 'basket') renderBasket(); toast(`נוסף לטופס ווינר סל (${S.bform.length})`); return;
    }
    const bm = e.target.closest('[data-bmatch]'); if (bm) { const [c, i] = bm.dataset.bmatch.split('|'); openBasketMatch(c, +i); return; }
    const bo = e.target.closest('[data-bopen]'); if (bo) { const en = S.bform[+bo.dataset.bopen], r = bskEntryResolve(en); if (r) openBasketMatch(en.code, r.L.m.indexOf(r.m)); return; }
    const bb = e.target.closest('[data-bi]');
    if (bb) {
      const en = S.bform[+bb.dataset.bi], o = bb.dataset.bo;
      let cur = en.pick ? en.pick.slice() : [];
      if (!en.pick) cur = [o]; else if (cur.includes(o)) cur = cur.filter(x => x !== o); else cur.push(o);
      en.pick = cur.length ? cur.sort((a, b) => '1X2'.indexOf(a) - '1X2'.indexOf(b)) : null; save(); renderBasket(); return;
    }
    const bd = e.target.closest('[data-bdel]'); if (bd) { S.bform.splice(+bd.dataset.bdel, 1); save(); renderBasket(); return; }
    if (e.target.closest('#bs-clear')) { S.bform = []; save(); renderBasket(); return; }
    const bl = e.target.closest('[data-bl]');
    if (bl) { const all = BSK_ORDER.filter(c => BSK.leagues[c]); const on = new Set(S.bLeagues || all); on.has(bl.dataset.bl) ? on.delete(bl.dataset.bl) : on.add(bl.dataset.bl); S.bLeagues = [...on]; save(); renderBasket(); return; }
    const lc = e.target.closest('[data-lchip]');
    if (lc) {
      const id = lc.dataset.lchip, gk = id.split('#')[0];
      const i = S.line.findIndex(x => x.id === id);
      if (i >= 0) S.line.splice(i, 1);
      else { S.line = S.line.filter(x => x.id.split('#')[0] !== gk); S.line.push({ id, p: +lc.dataset.lp, label: lc.dataset.ll }); }
      save(); renderLine(); return;
    }
    const ld = e.target.closest('[data-ldel]'); if (ld) { S.line.splice(+ld.dataset.ldel, 1); save(); renderLine(); return; }
    if (e.target.closest('#line-clear')) { S.line = []; save(); renderLine(); return; }
    const ls = e.target.closest('[data-lsport]'); if (ls) { S.lineSport = ls.dataset.lsport; save(); renderLine(); }
  });
  document.addEventListener('change', e => {
    const t = e.target;
    if (t.matches('[data-btype]')) { const en = S.bform[+t.dataset.btype]; en.type = t.value; en.pick = null; if (t.value === 'win') en.line = ''; save(); setTimeout(renderBasket, 0); }
    else if (t.matches('[data-bline]')) { const en = S.bform[+t.dataset.bline]; en.line = t.value; en.pick = null; save(); setTimeout(renderBasket, 0); }
    else if (t.id === 'bs-cols') { S.bsys.cols = +t.value; save(); renderBasket(); }
    else if (t.id === 'bs-price') { S.bsys.price = +t.value || 0; save(); setTimeout(renderBasket, 0); }
    else if (t.id === 'line-odds') { S.lineOdds = t.value; save(); setTimeout(renderLine, 0); }
    else if (t.id === 'line-stake') { S.lineStake = t.value; save(); setTimeout(renderLine, 0); }
  });
}

// ---------- decorative art ----------
function courtArt() {
  return `<svg class="hero-art" viewBox="0 0 300 180" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2">
    <rect x="6" y="6" width="288" height="168" rx="6"/><line x1="150" y1="6" x2="150" y2="174"/><circle cx="150" cy="90" r="24"/>
    <path d="M6 40 h40 a50 50 0 0 1 0 100 h-40"/><path d="M294 40 h-40 a50 50 0 0 0 0 100 h40"/>
    <rect x="6" y="64" width="54" height="52"/><rect x="240" y="64" width="54" height="52"/></g></svg>`;
}
function pitchArt() {
  return `<svg class="hero-art" viewBox="0 0 300 180" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2">
    <rect x="6" y="6" width="288" height="168" rx="4"/><line x1="150" y1="6" x2="150" y2="174"/><circle cx="150" cy="90" r="26"/><circle cx="150" cy="90" r="2.5" fill="currentColor"/>
    <rect x="6" y="46" width="42" height="88"/><rect x="252" y="46" width="42" height="88"/><rect x="6" y="70" width="16" height="40"/><rect x="278" y="70" width="16" height="40"/>
    <path d="M48 72 a22 22 0 0 1 0 36"/><path d="M252 72 a22 22 0 0 0 0 36"/></g>
    <g class="ball"><circle cx="0" cy="0" r="7" fill="currentColor" opacity=".9"/></g></svg>`;
}
