// Live results dock: football (all leagues) + basketball, fixed at the bottom of the site.
// Source: ESPN public scoreboards, fetched from the browser; polled every 30s while games are live.
'use strict';

const LIVE_SOURCES = [
  { sport: 'soccer', path: 'soccer/all', name: null },
  { sport: 'basketball', path: 'basketball/nba', name: 'NBA' },
  { sport: 'basketball', path: 'basketball/euroleague', name: 'יורוליג' },
  { sport: 'basketball', path: 'basketball/wnba', name: 'WNBA' },
  { sport: 'basketball', path: 'basketball/fiba', name: 'FIBA' },
];
const SOCCER_LEAGUE_HE = {
  'uefa.champions': 'ליגת האלופות', 'uefa.europa': 'הליגה האירופית', 'uefa.europa.conf': 'הקונפרנס ליג',
  'eng.1': 'פרמייר ליג', 'eng.2': "צ'מפיונשיפ", 'eng.3': 'ליג 1 אנגלית', 'eng.fa': 'גביע האנגלי', 'eng.league_cup': 'גביע הליגה',
  'esp.1': 'לה ליגה', 'esp.2': 'ספרד ליגה 2', 'esp.copa_del_rey': 'גביע ספרד', 'ita.1': 'סרייה A', 'ita.2': 'סרייה B', 'ita.coppa_italia': 'גביע איטליה',
  'ger.1': 'בונדסליגה', 'ger.2': 'בונדסליגה 2', 'ger.dfb_pokal': 'גביע גרמניה', 'fra.1': 'ליג 1', 'fra.2': 'ליג 2', 'ned.1': 'ארדיביזי', 'por.1': 'ליגה פורטוגל',
  'tur.1': 'סופר ליג', 'bel.1': 'ליגה בלגית', 'sco.1': 'סקוטלנד', 'gre.1': 'יוון', 'isr.1': 'ליגת העל', 'usa.1': 'MLS', 'bra.1': 'ברזיל', 'arg.1': 'ארגנטינה',
  'mex.1': 'מקסיקו', 'ksa.1': 'סעודיה', 'afc.champions': 'ליגת האלופות אסיה', 'afc.cup': 'גביע אסיה', 'conmebol.libertadores': 'ליברטדורס',
  'fifa.world': 'מונדיאל', 'fifa.worldq.uefa': 'מוקדמות מונדיאל', 'uefa.nations': 'ליגת האומות', 'fifa.friendly': 'ידידות',
};
const LIVE = { events: [], at: 0, ok: null, open: false, tab: 'live', sport: 'all', timer: null, busy: false };

function liveLeagueOf(ev) {
  for (const l of ev.links || []) { const m = /\/league\/([a-z0-9._-]+)/i.exec(l.href || ''); if (m) return m[1]; }
  return '';
}
function parseLive(json, src) {
  const out = [];
  for (const ev of (json && json.events) || []) {
    const c = ev.competitions && ev.competitions[0];
    if (!c || !c.competitors || c.competitors.length !== 2) continue;
    const H = c.competitors.find(x => x.homeAway === 'home') || c.competitors[0];
    const A = c.competitors.find(x => x.homeAway === 'away') || c.competitors[1];
    const st = (c.status || ev.status || {}).type || {};
    const slug = src.sport === 'soccer' ? liveLeagueOf(ev) : src.path.split('/')[1];
    const nm = t => (t.team && (t.team.displayName || t.team.name)) || '?';
    const short = t => (t.team && (t.team.shortDisplayName || t.team.abbreviation)) || nm(t);
    const he = (t) => { const n = nm(t), k = teamKey(n), h = heName(n, k); return h !== n.replace(/\s+(FC|AFC|CF)$/i, '') ? h : short(t); };
    const sc = v => (v == null || v === '' ? null : +(typeof v === 'object' ? (v.value ?? v.displayValue) : v));
    const [d, t] = localParts(ev.date);
    out.push({
      id: src.sport + ev.id, sport: src.sport, slug, d, t,
      league: src.name || SOCCER_LEAGUE_HE[slug] || slug.replace(/\./g, ' ').toUpperCase(),
      home: nm(H), away: nm(A), homeHe: he(H), awayHe: he(A),
      logoH: (H.team && H.team.logo) || '', logoA: (A.team && A.team.logo) || '',
      hs: sc(H.score), as: sc(A.score),
      state: st.state || 'pre', // pre | in | post
      done: !!st.completed, clock: (c.status && c.status.displayClock) || '', detail: st.shortDetail || st.detail || '',
      postponed: /POSTPONED|CANCEL|ABANDON|SUSPEND/i.test(st.name || ''),
    });
  }
  return out;
}

async function fetchLive() {
  if (LIVE.busy) return; LIVE.busy = true;
  const ymd = todayISO().replace(/-/g, '');
  const res = await Promise.allSettled(LIVE_SOURCES.map(s => fetchJSON(`https://site.api.espn.com/apis/site/v2/sports/${s.path}/scoreboard?dates=${ymd}`, 12000).then(j => parseLive(j, s))));
  const ok = res.filter(r => r.status === 'fulfilled');
  LIVE.busy = false;
  if (!ok.length) { LIVE.ok = false; renderLiveDock(); scheduleLive(); return; }
  LIVE.ok = true; LIVE.at = Date.now();
  LIVE.events = ok.flatMap(r => r.value);
  feedLiveIntoLeagues();
  renderLiveDock();
  scheduleLive();
}
function scheduleLive() {
  clearTimeout(LIVE.timer);
  const anyLive = LIVE.events.some(e => e.state === 'in');
  LIVE.timer = setTimeout(() => { if (document.hidden) scheduleLive(); else fetchLive(); }, LIVE.ok === false ? 300000 : anyLive ? 30000 : 120000);
}

// Football events from leagues the app follows update the form / cards (green-red colouring live).
function feedLiveIntoLeagues() {
  if (typeof DB === 'undefined' || !DB.leagues) return;
  const bySlug = {};
  for (const [code, v] of Object.entries(LEAGUES)) bySlug[v[1]] = code;
  let changed = false;
  for (const [code, evs] of Object.entries(groupBy(LIVE.events.filter(e => e.sport === 'soccer' && bySlug[e.slug]), e => bySlug[e.slug]))) {
    const L = DB.leagues[code]; if (!L) continue;
    const before = JSON.stringify(L.m.filter(x => x.d === todayISO()).map(x => [x.hg, x.live]));
    mergeEvents(L, evs.map(e => ({
      d: e.d, t: e.t, home: e.home, away: e.away,
      hg: e.done && !e.postponed ? e.hs : null, ag: e.done && !e.postponed ? e.as : null,
      live: e.state === 'in' ? { hg: e.hs || 0, ag: e.as || 0, clock: e.clock || e.detail } : null,
      state: e.state, status: e.detail,
    })));
    const after = JSON.stringify(L.m.filter(x => x.d === todayISO()).map(x => [x.hg, x.live]));
    if (before !== after) { finalizeLeague(L); changed = true; }
  }
  if (changed && typeof PCACHE !== 'undefined') { PCACHE.clear(); if (typeof render === 'function' && $('#sheet').hidden) render(); }
}
function groupBy(arr, f) { const o = {}; for (const x of arr) (o[f(x)] = o[f(x)] || []).push(x); return o; }

// Is this event one of the user's form games? Returns the picks if so.
function formPicksFor(e) {
  if (e.sport !== 'soccer' || typeof S === 'undefined' || !S.form || !S.form.length) return null;
  const hk = teamKey(e.home), ak = teamKey(e.away);
  try {
    const F = computeForm();
    for (let i = 0; i < F.items.length; i++) {
      const r = F.items[i].r; if (r.manual) continue;
      const L = DB.leagues[r.code];
      if (keySimilarity(hk, L.teams[r.h].key) >= 0.6 && keySimilarity(ak, L.teams[r.a].key) >= 0.6) return F.picks[i];
    }
  } catch (err) { /* form not ready */ }
  return null;
}

function liveRow(e) {
  const picks = formPicksFor(e);
  const has = e.state !== 'pre' && e.hs != null;
  const o = has ? (e.hs > e.as ? '1' : e.hs === e.as ? 'X' : '2') : null;
  const cls = picks && has ? (picks.includes(o) ? ' is-hit' : ' is-miss') : '';
  const lg = (src) => (src ? `<img src="${esc(src)}" alt="" loading="lazy" width="20" height="20" onerror="this.style.visibility='hidden'">` : '<span class="nologo"></span>');
  const stat = e.postponed ? '<span class="lv-st">נדחה</span>'
    : e.state === 'in' ? `<span class="lv-st live"><i class="pulse"></i>${esc(e.clock || e.detail || 'חי')}</span>`
    : e.state === 'post' ? '<span class="lv-st">סיום</span>' : `<span class="lv-st">${esc(e.t)}</span>`;
  return `<div class="lv-row${cls}">
    ${stat}
    <span class="lv-team">${lg(e.logoH)}<b>${esc(e.homeHe)}</b></span>
    <span class="lv-score" dir="ltr">${has ? `${e.as} : ${e.hs}` : '–'}</span>
    <span class="lv-team away"><b>${esc(e.awayHe)}</b>${lg(e.logoA)}</span>
    ${picks ? `<span class="pick sm" title="הניחוש שלך">${picks.join('')}</span>` : ''}
  </div>`;
}

function renderLiveDock() {
  const dock = document.getElementById('live-dock'); if (!dock) return;
  const ev = LIVE.events;
  const live = ev.filter(e => e.state === 'in');
  const mine = ev.filter(e => formPicksFor(e));
  const tick = (live.length ? live : ev.filter(e => e.state === 'pre').slice(0, 12)).slice(0, 30);
  const tickHtml = tick.map(e => `<span class="tk${formPicksFor(e) ? ' mine' : ''}">${e.sport === 'basketball' ? '🏀' : '⚽'} ${esc(e.homeHe)} <b dir="ltr">${e.state === 'pre' ? e.t : `${e.as}:${e.hs}`}</b> ${esc(e.awayHe)}${e.state === 'in' ? ` <em>${esc(e.clock || '')}</em>` : ''}</span>`).join('');
  const head = LIVE.ok === false
    ? '<span class="lv-off">תוצאות חיות זמינות באתר המלא (בגרסה הזו הדפדפן חוסם את שרת התוצאות)</span>'
    : LIVE.ok == null ? '<span class="lv-off">טוען תוצאות…</span>'
    : `<span class="lv-badge${live.length ? ' on' : ''}"><i class="pulse"></i>${live.length ? `${live.length} חי` : 'אין משחקים חיים'}</span>
       <div class="ticker" aria-hidden="true"><div class="ticker-in${tick.length > 2 ? ' run' : ''}" style="--n:${tick.length}">${tickHtml}${tick.length > 2 ? tickHtml : ''}</div></div>`;
  let body = '';
  if (LIVE.open && LIVE.ok) {
    const f = ev.filter(e => (LIVE.sport === 'all' || e.sport === LIVE.sport) &&
      (LIVE.tab === 'live' ? e.state === 'in' : LIVE.tab === 'done' ? e.state === 'post' : LIVE.tab === 'mine' ? formPicksFor(e) : true));
    const order = e => (e.state === 'in' ? 0 : e.state === 'pre' ? 1 : 2);
    const groups = groupBy(f.slice().sort((a, b) => order(a) - order(b) || (a.d + a.t).localeCompare(b.d + b.t)), e => (e.sport === 'basketball' ? '🏀 ' : '⚽ ') + e.league);
    const pri = k => (/ליגת העל|ליגת האלופות|פרמייר|לה ליגה|סרייה A|בונדסליגה|ליג 1|הליגה האירופית|NBA|יורוליג/.test(k) ? 0 : 1);
    const keys = Object.keys(groups).sort((a, b) => pri(a) - pri(b) || a.localeCompare(b, 'he'));
    body = `<div class="lv-panel">
      <div class="lv-controls">
        <div class="seg" role="group" aria-label="סינון">
          ${[['live', `חי (${live.length})`], ['all', `היום (${ev.length})`], ['done', 'הסתיימו'], ['mine', `בטופס שלי (${mine.length})`]].map(([k, l]) => `<button data-lvtab="${k}" aria-pressed="${LIVE.tab === k}">${l}</button>`).join('')}
        </div>
        <div class="seg" role="group" aria-label="ענף">
          ${[['all', 'הכל'], ['soccer', '⚽ כדורגל'], ['basketball', '🏀 כדורסל']].map(([k, l]) => `<button data-lvsport="${k}" aria-pressed="${LIVE.sport === k}">${l}</button>`).join('')}
        </div>
      </div>
      <div class="lv-list">${keys.length ? keys.map(k => `<div class="lv-group"><h4>${esc(k)}</h4>${groups[k].map(liveRow).join('')}</div>`).join('') : `<p class="note lv-empty">${LIVE.tab === 'live' ? 'אין משחקים חיים כרגע. נסה "היום".' : 'אין משחקים להצגה.'}</p>`}</div>
      <p class="note lv-foot">מתעדכן אוטומטית ${live.length ? 'כל 30 שניות' : 'כל 2 דקות'} · עדכון אחרון ${new Date(LIVE.at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} · ליגות ישראליות לא זמינות בשידור חי</p>
    </div>`;
  }
  dock.innerHTML = `<button class="lv-bar" id="lv-toggle" aria-expanded="${LIVE.open}">${head}<span class="lv-chev" aria-hidden="true">${LIVE.open ? '▾' : '▴'}</span></button>${body}`;
  dock.classList.toggle('open', LIVE.open);
}

function bindLiveDock() {
  const dock = document.getElementById('live-dock'); if (!dock) return;
  dock.addEventListener('click', e => {
    if (e.target.closest('#lv-toggle')) { LIVE.open = !LIVE.open; renderLiveDock(); return; }
    const t = e.target.closest('[data-lvtab]'); if (t) { LIVE.tab = t.dataset.lvtab; renderLiveDock(); return; }
    const s = e.target.closest('[data-lvsport]'); if (s) { LIVE.sport = s.dataset.lvsport; renderLiveDock(); }
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - LIVE.at > 25000) fetchLive(); });
  renderLiveDock();
  fetchLive();
}
