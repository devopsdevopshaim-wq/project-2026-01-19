// UI: home, Toto form, fixtures, match analysis, track record & learning, tables, method.
'use strict';

const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pct = x => (x == null || isNaN(x) ? '–' : Math.round(x * 100) + '%');
const fx = (x, d = 1) => (x == null || isNaN(x) ? '–' : (+x).toFixed(d));
const PRIORITY = ['isr.1', 'isr.2', 'en.1', 'es.1', 'it.1', 'de.1', 'fr.1', 'ucl', 'uel', 'uecl', 'en.2', 'nl.1', 'pt.1', 'tr.1', 'be.1', 'sco.1'];
const DEFAULT_P = { '1': 0.45, 'X': 0.28, '2': 0.27 };
const VIEWS = ['home', 'form', 'week', 'track', 'tables', 'info'];

const S = Object.assign({
  tab: 'home', form: [],
  sys: { mode: 'cols', cols: 16, d: 3, t: 1, price: 3 },
  week: { range: 'weekend', leagues: null },
  tLeague: 'isr.1', trackLeague: '',
}, lsGet('toto.state') || {});
function save() { lsSet('toto.state', S); }
const EXTRA = { pred: null, toto: null, frozen: null, frozenData: {} };

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, 2800);
}

// ---------- helpers ----------
const WD = new Intl.DateTimeFormat('he-IL', { weekday: 'short', timeZone: 'UTC' });
function fmtDate(d, t) {
  if (!d) return '';
  const dt = new Date(d + 'T12:00:00Z');
  return `${WD.format(dt)} ${+d.slice(8, 10)}.${+d.slice(5, 7)}${t ? ' · ' + t : ''}`;
}
const dmy = d => (d ? `${+d.slice(8, 10)}.${+d.slice(5, 7)}` : '');
function tName(code, i) { const L = DB.leagues[code]; return (L && L.teams[i]) ? L.teams[i].he : '?'; }
function leagueName(code) { return (LEAGUES[code] || [code])[0]; }
function hasData(code) { const L = DB.leagues[code]; return L && L.m.some(x => x.hg != null); }
function bestPick(p) { return Object.entries(p).sort((a, b) => b[1] - a[1])[0][0]; }
function outcomeOf(m) { return m && m.hg != null ? (m.hg > m.ag ? '1' : m.hg === m.ag ? 'X' : '2') : null; }
const resultCode = (hg, ag) => (hg > ag ? '1' : hg === ag ? 'X' : '2');
function seasonStart() { return `${seasonStartYear(todayISO())}-07-01`; }
function mondayOf(d) { return addDays(d, -((new Date(d + 'T12:00:00Z').getUTCDay() + 6) % 7)); }

function staleInfo(code) {
  const L = DB.leagues[code];
  if (!L || !L.lastResult) return null;
  return daysBetween(L.lastResult, todayISO()) > 45 ? L.lastResult : null;
}
function staleTag(code) { const d = staleInfo(code); return d ? `<span class="tag low">נתונים עד ${dmy(d)}</span>` : ''; }

function badge(name, key, big) {
  let h = 0; const k = key || name;
  for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) % 360;
  const words = String(name).replace(/["'״׳.]/g, '').split(/\s+/).filter(Boolean);
  const ini = (words.length > 1 ? words[0][0] + words[words.length - 1][0] : (words[0] || '?').slice(0, 2));
  return `<span class="badge${big ? ' lg' : ''}" style="--h:${h}" aria-hidden="true">${esc(ini)}</span>`;
}
function confLevel(p) { const m = Math.max(p['1'], p['X'], p['2']); return m >= 0.65 ? 5 : m >= 0.56 ? 4 : m >= 0.48 ? 3 : m >= 0.4 ? 2 : 1; }
function confMeter(p) {
  const n = confLevel(p), label = ['', 'פתוח מאוד', 'פתוח', 'נטייה', 'ביטחון טוב', 'ביטחון גבוה'][n];
  return `<span class="conf" title="רמת ביטחון">${label}<i>${[1, 2, 3, 4, 5].map(i => `<b class="${i <= n ? 'on' : ''}"></b>`).join('')}</i></span>`;
}
// Match status for colouring: final result, live score (ESPN, in progress) or not started.
function matchStatus(m) {
  if (!m) return { s: 'none' };
  if (m.hg != null) return { s: 'done', hg: m.hg, ag: m.ag, o: resultCode(m.hg, m.ag) };
  if (m.live) return { s: 'live', hg: m.live.hg, ag: m.live.ag, o: resultCode(m.live.hg, m.live.ag), clock: m.live.clock };
  return { s: 'pre' };
}
function statusTag(st, picks) {
  if (st.s !== 'done' && st.s !== 'live') return '';
  const ok = picks.includes(st.o);
  const sc = `<span dir="ltr">${st.hg}:${st.ag}</span>`;
  return st.s === 'done'
    ? `<span class="tag ${ok ? 'hit' : 'miss'}">${sc} · ${ok ? 'פגיעה' : 'החטאה'}</span>`
    : `<span class="tag live ${ok ? 'hit' : 'miss'}"><i class="pulse"></i>חי ${esc(st.clock || '')} · ${sc} · ${ok ? 'כרגע פוגע' : 'כרגע מחטיא'}</span>`;
}
function rowState(st, picks) {
  if (st.s !== 'done' && st.s !== 'live') return '';
  return (picks.includes(st.o) ? ' is-hit' : ' is-miss') + (st.s === 'live' ? ' is-live' : '');
}
function oddsLine(P) { return `<span dir="ltr" class="odds">1 ${pct(P['1'])} · X ${pct(P['X'])} · 2 ${pct(P['2'])}</span>`; }
function probBar(P) {
  const w = o => Math.max(P[o] * 100, 5).toFixed(1);
  return `<div class="bar"><span class="b1" style="width:${w('1')}%">1 · ${pct(P['1'])}</span><span class="bx" style="width:${w('X')}%">X · ${pct(P['X'])}</span><span class="b2" style="width:${w('2')}%">2 · ${pct(P['2'])}</span></div>`;
}

function resolveEntry(e) {
  if (e.manual) return { manual: true };
  const L = DB.leagues[e.code];
  if (!L) return { manual: true };
  const h = L.keyIdx[e.hk], a = L.keyIdx[e.ak];
  if (h == null || a == null) return { manual: true };
  const m = L.m.find(x => x.h === h && x.a === a && Math.abs(daysBetween(x.d, e.d)) <= 4) || null;
  return { code: e.code, h, a, m };
}
const PCACHE = new Map();
function predictCached(code, h, a, asOf) {
  const L = DB.leagues[code], k = `${code}|${h}|${a}|${asOf}|${L.version}`;
  if (!PCACHE.has(k)) PCACHE.set(k, predict(code, h, a, asOf));
  return PCACHE.get(k);
}
function entryProbs(e) {
  const r = resolveEntry(e);
  if (r.manual || !hasData(r.code)) return { p: DEFAULT_P, known: false, r };
  const asOf = r.m && r.m.hg != null ? r.m.d : todayISO();
  const pr = predictCached(r.code, r.h, r.a, asOf);
  return { p: probsOf(pr), pr, known: true, r };
}
function upcoming(from, to, codes) {
  const out = [];
  for (const code of codes) {
    const L = DB.leagues[code]; if (!L) continue;
    for (const m of L.m) if (m.d >= from && m.d <= to) out.push({ code, m });
  }
  out.sort((a, b) => (a.m.d + (a.m.t || '')).localeCompare(b.m.d + (b.m.t || '')) || PRIORITY.indexOf(a.code) - PRIORITY.indexOf(b.code));
  return out;
}
function entryFrom(code, m) { const L = DB.leagues[code]; return { code, hk: L.teams[m.h].key, ak: L.teams[m.a].key, d: m.d }; }
function weekendRange() {
  const t = todayISO(), dow = new Date(t + 'T12:00:00Z').getUTCDay();
  const fri = addDays(t, (5 - dow + 7) % 7), thu = addDays(fri, -1);
  return [thu < t ? t : thu, addDays(fri, 3)];
}

// ---------- factor explanation ----------
const FACTOR_SHORT = { str: 'כוח', table: 'טבלה', form: 'כושר', venue: 'בית/חוץ', h2h: 'ראש בראש' };
function reasonLine(p, H, A) {
  if (!p || !p.contrib) return '';
  const pro = side => Object.entries(p.contrib).filter(([, v]) => (side > 0 ? v > 0.04 : v < -0.04)).sort((x, y) => Math.abs(y[1]) - Math.abs(x[1])).map(([k]) => FACTOR_SHORT[k]);
  const a = pro(1), b = pro(-1), parts = [];
  if (a.length) parts.push(`בעד ${esc(H)}: ${a.join(', ')}`);
  if (b.length) parts.push(`בעד ${esc(A)}: ${b.join(', ')}`);
  return `<div class="reason">${parts.length ? parts.join(' · ') : 'המדדים מאוזנים'}</div>`;
}
function factorPanel(p, H, A, ph, pa) {
  if (!p || !p.contrib) return '';
  const ppgS = s => (s && s.n ? (s.pts / s.n).toFixed(2) : '–');
  const rec = s => (s && s.n ? `${s.w}-${s.d}-${s.l}` : '–');
  const f6 = s => { const l = s.form.slice(0, 6); return l.length ? `${l.reduce((t, x) => t + (x.r === 'W' ? 3 : x.r === 'D' ? 1 : 0), 0)} נק׳ מ־${l.length * 3}` : '–'; };
  const hr = p.h2hRec;
  const rows = [
    ['str', `${fx(p.lh, 2)} שערים צפויים`, `${fx(p.la, 2)} שערים צפויים`],
    ['table', `${ph ? 'מקום ' + ph.pos + ' · ' : ''}${ppgS(p.sh.all)} נק׳ למשחק`, `${pa ? 'מקום ' + pa.pos + ' · ' : ''}${ppgS(p.sa.all)} נק׳ למשחק`],
    ['form', f6(p.sh), f6(p.sa)],
    ['venue', `בבית ${rec(p.sh.home)}`, `בחוץ ${rec(p.sa.away)}`],
    ['h2h', hr.n ? `${hr.w} ניצחונות` : 'אין מפגשים', hr.n ? `${hr.l} ניצחונות · ${hr.d} תיקו` : ''],
  ];
  const max = Math.max(0.35, ...Object.values(p.contrib).map(Math.abs));
  const P = probsOf(p), pick = bestPick(P);
  const verdict = pick === 'X' ? 'המדדים מתקזזים, ולכן הניחוש הוא תיקו.' : `רוב המשקל נוטה ל${esc(pick === '1' ? H : A)}.`;
  return `<div class="panel">
    <h3>איך נקבע הניחוש</h3>
    <p class="note">חמישה מדדים, כל אחד במשקל שהמערכת למדה מאלפי משחקי עבר ומעדכנת כל שבוע. הפס מראה לאיזו קבוצה המדד נותן יתרון ובכמה.</p>
    <div class="factors">
      <div class="f-head"><span>${esc(H)}</span><span></span><span>${esc(A)}</span></div>
      ${rows.map(([k, vh, va]) => {
        const c = p.contrib[k] || 0, w = Math.min(50, Math.abs(c) / max * 50);
        return `<div class="f-row"><div class="f-name">${FACTOR_NAMES[k]}</div>
          <div class="f-vals"><span>${vh}</span><div class="fbar" aria-hidden="true"><i class="${c >= 0 ? 'h' : 'a'}" style="${c >= 0 ? 'left' : 'right'}:50%;width:${w.toFixed(1)}%"></i></div><span>${va}</span></div></div>`;
      }).join('')}
    </div>
    <p><b>${verdict}</b> סיכויים סופיים: ${esc(H)} ${pct(P['1'])} · תיקו ${pct(P['X'])} · ${esc(A)} ${pct(P['2'])}.</p>
  </div>`;
}

// ---------- navigation ----------
function go(tab, push = true) {
  if (!VIEWS.includes(tab)) tab = 'home';
  S.tab = tab; save();
  document.querySelectorAll('[data-go]').forEach(b => { if (b.dataset.go === tab && !b.classList.contains('brand')) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  document.querySelectorAll('.view').forEach(v => { v.hidden = v.id !== 'view-' + tab; });
  if (push && location.hash !== '#' + tab) { try { history.replaceState(null, '', '#' + tab); } catch (e) { /* ignore */ } }
  window.scrollTo(0, 0);
  render();
}
function render() {
  ({ home: renderHome, form: renderForm, week: renderWeek, track: renderTrack, tables: renderTables, info: renderInfo })[S.tab]();
}

// ---------- HOME ----------
function trackRows() {
  const T = (EXTRA.pred && EXTRA.pred.track) || [];
  return T.map(r => {
    const [code, d, hk, ak, hg, ag, p1, px, p2] = r;
    const P = { '1': p1, 'X': px, '2': p2 };
    const pick = bestPick(P), res = resultCode(hg, ag);
    const order = Object.entries(P).sort((a, b) => b[1] - a[1]).map(x => x[0]);
    return { code, d, hk, ak, hg, ag, P, pick, res, hit: pick === res, hit2: order[0] === res || order[1] === res, conf: P[pick] };
  });
}
function teamHe(code, key) { const L = DB.leagues[code]; if (!L) return key; const i = L.keyIdx[key]; return i != null ? L.teams[i].he : heName(key, key); }
function accOf(rows) { const n = rows.length; return { n, acc: n ? rows.filter(r => r.hit).length / n : null, acc2: n ? rows.filter(r => r.hit2).length / n : null }; }

function renderHome() {
  const [from, to] = weekendRange();
  const codes = PRIORITY.filter(hasData);
  const games = upcoming(from, to, codes).filter(x => x.m.hg == null).map(x => {
    const p = predictCached(x.code, x.m.h, x.m.a, todayISO());
    return { ...x, p, P: probsOf(p) };
  });
  const T = trackRows();
  const season = accOf(T.filter(r => r.d >= seasonStart()));
  const lastW = T.filter(r => r.d >= addDays(todayISO(), -7));
  const lw = accOf(lastW);
  const sure = games.slice().sort((a, b) => Math.max(...Object.values(b.P)) - Math.max(...Object.values(a.P))).slice(0, 8);
  const open = games.slice().sort((a, b) => Math.max(...Object.values(a.P)) - Math.max(...Object.values(b.P))).slice(0, 6);
  const surprises = lastW.filter(r => !r.hit && r.conf >= 0.55).sort((a, b) => b.conf - a.conf).slice(0, 5);
  const M = DB.model;
  const toto = EXTRA.toto;

  const prow = x => {
    const L = DB.leagues[x.code], H = L.teams[x.m.h].he, A = L.teams[x.m.a].he, pk = bestPick(x.P);
    return `<div class="prow click" data-match="${x.code}|${L.m.indexOf(x.m)}">
      <div><div class="t">${esc(H)} – ${esc(A)}</div><div class="m">${esc(leagueName(x.code))} · ${fmtDate(x.m.d, x.m.t)}</div></div>
      <div class="r"><span class="pct">${pct(x.P[pk])}</span><span class="pick">${pk}</span></div></div>`;
  };
  const prowDouble = x => {
    const L = DB.leagues[x.code], H = L.teams[x.m.h].he, A = L.teams[x.m.a].he;
    const o = Object.entries(x.P).sort((a, b) => b[1] - a[1]);
    const dbl = [o[0][0], o[1][0]].sort((a, b) => '1X2'.indexOf(a) - '1X2'.indexOf(b)).join('');
    return `<div class="prow click" data-match="${x.code}|${L.m.indexOf(x.m)}">
      <div><div class="t">${esc(H)} – ${esc(A)}</div><div class="m">${esc(leagueName(x.code))} · ${oddsLine(x.P)}</div></div>
      <div class="r"><span class="pct">${pct(o[0][1] + o[1][1])}</span><span class="pick">${dbl}</span></div></div>`;
  };

  $('#view-home').innerHTML = `
    <section class="hero">
      <div>
        <p class="eyebrow">המחזור הקרוב · ${dmy(from)}–${dmy(to)}</p>
        <h1>הניחושים של סוף השבוע</h1>
        <p>${games.length} משחקים בליגות שבמערכת. לכל משחק יש ניחוש מנומק לפי כוח הקבוצות, הטבלה, הכושר, בית/חוץ וראש בראש, והמערכת בודקת את עצמה מול התוצאות כל שבוע.</p>
      </div>
      <div class="hero-kpis">
        <div class="hero-kpi"><b>${pct(season.acc)}</b><span>פגיעה בניחוש בודד העונה (${season.n} משחקים)</span></div>
        <div class="hero-kpi"><b>${pct(season.acc2)}</b><span>פגיעה בכפול העונה</span></div>
        <div class="hero-kpi"><b>${lw.n ? `${lastW.filter(r => r.hit).length}/${lw.n}` : '–'}</b><span>פגיעות בשבוע שעבר</span></div>
        <div class="hero-kpi"><b>33%</b><span>ניחוש אקראי, לשם השוואה</span></div>
      </div>
      <div class="actions">
        <button class="btn" data-go="form">${toto ? 'לטופס ווינר 16' : 'לבניית הטופס'}</button>
        <button class="btn ghost" data-go="week">כל המשחקים</button>
        <button class="btn ghost" data-go="track">איך המערכת פגעה</button>
      </div>
    </section>

    ${toto ? totoCard(toto) : ''}

    <div class="grid2">
      <div class="panel">
        <div class="section-title"><h2>הניחושים החזקים</h2><button class="linkbtn" data-go="week">הכל</button></div>
        <p class="note">המשחקים שבהם המערכת הכי בטוחה. טובים כבסיס לטופס ולווינר.</p>
        <div class="plist">${sure.map(prow).join('') || '<div class="empty">אין משחקים בטווח</div>'}</div>
      </div>
      <div class="panel">
        <div class="section-title"><h2>משחקים פתוחים: מועמדים לכפול</h2></div>
        <p class="note">אין פייבוריטית ברורה. בטופס כדאי לשים כאן כפול או משולש.</p>
        <div class="plist">${open.map(prowDouble).join('') || '<div class="empty">אין משחקים בטווח</div>'}</div>
      </div>
    </div>

    <div class="grid2">
      <div class="panel">
        <div class="section-title"><h2>שבוע שעבר</h2><button class="linkbtn" data-go="track">לכל התוצאות</button></div>
        ${lw.n ? `<div class="kpis">
          <div class="kpi"><b>${pct(lw.acc)}</b><span>פגיעה בניחוש בודד</span></div>
          <div class="kpi"><b>${pct(lw.acc2)}</b><span>פגיעה בכפול</span></div>
          <div class="kpi"><b>${lw.n}</b><span>משחקים שנבדקו</span></div>
        </div>
        <h3>ההפתעות הגדולות</h3>
        <div class="plist">${surprises.map(r => `<div class="prow"><div><div class="t">${esc(teamHe(r.code, r.hk))} ${r.hg}:${r.ag} ${esc(teamHe(r.code, r.ak))}</div><div class="m">${esc(leagueName(r.code))} · המערכת נתנה ${r.pick} ב־${pct(r.conf)}</div></div><div class="r"><span class="hitmark no">✕</span></div></div>`).join('') || '<p class="note">לא היו הפתעות גדולות.</p>'}</div>` : '<p class="note">אין עדיין תוצאות מהשבוע האחרון בנתונים.</p>'}
      </div>
      <div class="panel">
        <div class="section-title"><h2>מה המערכת למדה</h2><button class="linkbtn" data-go="track">פירוט</button></div>
        ${M ? learnSummary(M) : '<p class="note">מודל הלמידה לא נטען.</p>'}
      </div>
    </div>`;
}

function learnSummary(M) {
  const w = M.live.w, tot = Object.values(w).reduce((a, b) => a + Math.abs(b), 0) || 1;
  const typical = { str: 0.45, table: 0.6, form: 0.8, venue: 0.8, h2h: 0.35 }; // typical spread of each factor, to compare influence fairly
  const infl = Object.fromEntries(Object.keys(w).map(k => [k, Math.abs(w[k]) * typical[k]]));
  const it = Object.values(infl).reduce((a, b) => a + b, 0) || 1;
  void tot;
  const rows = Object.keys(w).sort((a, b) => infl[b] - infl[a]).map(k => `<tr><td>${FACTOR_SHORT[k]}</td><td class="c"><span class="minibar"><i style="width:${(infl[k] / it * 100).toFixed(0)}%"></i></span></td><td class="c num">${pct(infl[k] / it)}</td>${M.changes ? `<td class="c num">${M.changes[k] > 0 ? '+' : ''}${fx(M.changes[k], 3)}</td>` : ''}</tr>`).join('');
  return `<p class="note">עדכון אחרון ${dmy(M.updated)}, על ${M.samples.all.toLocaleString('he-IL')} משחקים. כך המערכת מחלקת היום את המשקל בין המדדים:</p>
    <div class="tbl-wrap"><table><thead><tr><th>מדד</th><th class="c">השפעה</th><th class="c">חלק</th>${M.changes ? '<th class="c">שינוי מהשבוע שעבר</th>' : ''}</tr></thead><tbody>${rows}</tbody></table></div>
    <p class="note">${M.calibration.used ? 'השבוע המערכת הפעילה תיקון לפי ליגה, כי הוא שיפר את הדיוק על המשחקים האחרונים.' : 'המערכת בדקה תיקון לפי ליגה ודחתה אותו השבוע, כי בבדיקה על 90 הימים האחרונים הוא לא שיפר את הדיוק.'}</p>`;
}

// ---------- official Toto form (data/toto_week.json, written by the weekly update) ----------
function matchTotoGame(g) {
  const lo = addDays(g.d || todayISO(), -3), hi = addDays(g.d || todayISO(), 3);
  let best = null, bs = 0;
  for (const code of PRIORITY) {
    const L = DB.leagues[code]; if (!L) continue;
    if (g.league && g.league !== code) continue;
    const hk = teamKey(g.home_en || g.home), ak = teamKey(g.away_en || g.away);
    for (const m of L.m) {
      if (m.d < lo || m.d > hi) continue;
      const s = keySimilarity(hk, L.teams[m.h].key) + keySimilarity(ak, L.teams[m.a].key);
      if (s > bs) { bs = s; best = { code, m }; }
    }
  }
  return bs >= 1.3 ? best : null;
}
function totoEntries(t) {
  return t.games.map(g => {
    const hit = matchTotoGame(g);
    return hit ? entryFrom(hit.code, hit.m) : { manual: { home: g.home, away: g.away }, d: g.d || todayISO() };
  });
}
function totoCard(t) {
  const ents = totoEntries(t);
  const rows = ents.map((e, i) => {
    const x = entryProbs(e);
    const H = x.r.manual ? e.manual.home : tName(x.r.code, x.r.h), A = x.r.manual ? e.manual.away : tName(x.r.code, x.r.a);
    const st = matchStatus(x.r.m), pk = x.known ? bestPick(x.p) : null;
    return `<div class="prow${pk ? rowState(st, [pk]) : ''}"><div><div class="t">${i + 1}. ${esc(H)} – ${esc(A)}</div><div class="m">${x.known ? `${oddsLine(x.p)}` : 'אין נתונים: ניחוש ידני'} ${pk ? statusTag(st, [pk]) : ''}</div></div><div class="r">${pk ? `<span class="pick">${pk}</span>` : ''}</div></div>`;
  }).join('');
  return `<div class="panel">
    <div class="section-title"><h2>טופס ווינר 16${t.round ? ' · מחזור ' + esc(t.round) : ''}</h2><button class="btn accent small" id="load-toto">טעינה לטופס שלי</button></div>
    <p class="note">${esc(t.note || 'רשימת המשחקים נאספה מאתרי ספורט. ודא מול הטופס הרשמי לפני השליחה.')}</p>
    <div class="plist">${rows}</div></div>`;
}
function loadToto() {
  if (!EXTRA.toto) return;
  S.form = totoEntries(EXTRA.toto).slice(0, 16);
  save(); go('form');
  toast(`נטענו ${S.form.length} משחקים מטופס ווינר 16`);
}

// ---------- FORM ----------
const COL_OPTIONS = [1, 2, 3, 4, 6, 8, 9, 12, 16, 18, 24, 27, 32, 36, 48, 54, 64, 72, 81, 96, 108, 128, 144, 162, 192, 216, 243, 256, 288, 324, 384, 432, 486, 512, 576, 648, 729, 768, 864, 972, 1024, 1296, 1458, 1728, 2187, 2304, 2592, 3456, 4374, 5184, 6561];

function computeForm() {
  const items = S.form.map(e => ({ e, ...entryProbs(e) }));
  const probList = items.map(x => x.p);
  const lockedCols = items.reduce((s, x) => s * (x.e.pick && x.e.pick.length ? x.e.pick.length : 1), 1);
  const free = []; items.forEach((x, i) => { if (!(x.e.pick && x.e.pick.length)) free.push(i); });
  const picks = items.map(x => (x.e.pick && x.e.pick.length ? x.e.pick : null));
  const freeProbs = free.map(i => probList[i]);
  if (free.length) {
    let res;
    if (S.sys.mode === 'cols') res = optimiseByColumns(freeProbs, Math.max(1, Math.floor(S.sys.cols / lockedCols))).picks;
    else {
      let ld = 0, lt = 0;
      items.forEach(x => { if (x.e.pick) { if (x.e.pick.length === 2) ld++; if (x.e.pick.length === 3) lt++; } });
      res = optimise(freeProbs, Math.max(0, S.sys.d - ld), Math.max(0, S.sys.t - lt));
    }
    free.forEach((gi, k) => { picks[gi] = res[k]; });
  }
  const hits = items.map((x, i) => picks[i].reduce((s, o) => s + x.p[o], 0));
  const cols = picks.reduce((s, p) => s * p.length, 1);
  const dist = hitDistribution(hits);
  const atLeast = k => dist.slice(k).reduce((a, b) => a + b, 0);
  return { items, picks, hits, cols, dist, atLeast };
}
function pctSmall(x) { if (x >= 0.1) return Math.round(x * 100) + '%'; if (x >= 0.001) return (x * 100).toFixed(2) + '%'; return '1:' + Math.round(1 / Math.max(x, 1e-12)).toLocaleString('he-IL'); }

function renderForm() {
  const sel = $('#sys-cols');
  if (!sel.options.length) sel.innerHTML = COL_OPTIONS.map(c => `<option value="${c}">${c} טורים</option>`).join('');
  sel.value = S.sys.cols; $('#sys-mode').value = S.sys.mode; $('#sys-d').value = S.sys.d; $('#sys-t').value = S.sys.t; $('#sys-price').value = S.sys.price;
  $('#f-cols').hidden = S.sys.mode !== 'cols'; $('#f-d').hidden = $('#f-t').hidden = S.sys.mode === 'cols';
  $('#btn-official').hidden = !EXTRA.toto;
  const n = S.form.length;
  $('#form-sub').textContent = n ? `${n} מתוך 16 משחקים · המערכת מסמנת את הניחוש ומחלקת כפולים ומשולשים` : 'טען את טופס ווינר 16 של השבוע, או הוסף את המשחקים מהטופס הרשמי.';
  if (!n) {
    $('#slip').innerHTML = `<li class="empty">הטופס ריק. ${EXTRA.toto ? 'לחץ "טופס ווינר 16 של השבוע" כדי לטעון אותו,' : ''} לחץ "מילוי מהמשחקים הקרובים" לטופס לדוגמה, או "הוספת משחק".</li>`;
    $('#sys-summary').innerHTML = ''; $('#prize-box').innerHTML = ''; renderSaved(); return;
  }
  const F = computeForm();
  const nd = F.picks.filter(p => p.length === 2).length, nt = F.picks.filter(p => p.length === 3).length;
  const cost = F.cols * (+S.sys.price || 0), exp = F.hits.reduce((a, b) => a + b, 0);
  const sts = F.items.map(x => matchStatus(x.r.m));
  const fin = sts.filter(st => st.s === 'done').length, liveN = sts.filter(st => st.s === 'live').length;
  const finHit = sts.filter((st, i) => st.s === 'done' && F.picks[i].includes(st.o)).length;
  const liveHit = sts.filter((st, i) => st.s === 'live' && F.picks[i].includes(st.o)).length;
  $('#sys-summary').innerHTML = `
    <div class="kpi hl"><b>${F.cols.toLocaleString('he-IL')}</b><span>טורים · ${nd} כפולים · ${nt} משולשים</span></div>
    <div class="kpi"><b>₪${cost.toLocaleString('he-IL', { maximumFractionDigits: 1 })}</b><span>עלות משוערת</span></div>
    <div class="kpi"><b>${fx(exp)}</b><span>צפי פגיעות מתוך ${n}</span></div>
    <div class="kpi"><b>${pctSmall(F.atLeast(n))}</b><span>סיכוי לכל ה־${n}</span></div>
    <div class="kpi"><b>${pctSmall(F.atLeast(n - 1))}</b><span>סיכוי ל־${n - 1} ומעלה</span></div>
    <div class="kpi"><b>${pctSmall(F.atLeast(n - 2))}</b><span>סיכוי ל־${n - 2} ומעלה</span></div>
    ${fin ? `<div class="kpi ${finHit === fin ? 'good' : ''}"><b>${finHit}/${fin}</b><span>פגיעות במשחקים שהסתיימו</span></div>` : ''}
    ${liveN ? `<div class="kpi live"><b>${liveHit}/${liveN}</b><span>משחקים חיים שפוגעים כרגע</span></div>` : ''}`;
  renderPrize(F, sts, cost);
  autoSaveForm(F, sts);
  $('#slip').innerHTML = F.items.map((x, i) => {
    const e = x.e, r = x.r, pk = F.picks[i];
    const home = r.manual ? e.manual.home : tName(r.code, r.h), away = r.manual ? e.manual.away : tName(r.code, r.a);
    const st = matchStatus(r.m), res = st.o || null;
    const tags = [
      !x.known ? '<span class="tag low">ללא נתונים: סמן ידנית</span>' : '',
      x.known && x.pr.reliability < 6 ? '<span class="tag low">מעט נתונים</span>' : '',
      !r.manual ? staleTag(r.code) : '',
      statusTag(st, pk),
    ].join('');
    const boxes = ['1', 'X', '2'].map(o => `<button class="box${pk.includes(o) ? ' on' : ''}${e.pick && e.pick.includes(o) ? ' lock' : ''}${res === o ? ' res' : ''}" data-i="${i}" data-o="${o}" aria-pressed="${pk.includes(o)}" aria-label="${o}"><span class="o">${o}</span><span class="p">${x.known ? pct(x.p[o]) : '–'}</span></button>`).join('');
    return `<li class="row${rowState(st, pk)}">
      <span class="n">${i + 1}</span>
      <div class="teams" data-open="${i}">
        <b>${esc(home)} – ${esc(away)}</b>
        <div class="meta"><span>${r.manual ? 'משחק ידני' : esc(leagueName(r.code))}</span><span>${fmtDate(e.d, r.m && r.m.t)}</span>${x.known ? confMeter(x.p) : ''}${tags}</div>
        ${x.known && x.pr ? reasonLine(x.pr, home, away) : ''}
      </div>
      <div class="side"><div class="boxes">${boxes}</div>
        <div class="row-tools"><button class="icon-btn" data-up="${i}" aria-label="העבר למעלה">▲</button><button class="icon-btn" data-del="${i}" aria-label="הסר">✕</button></div></div>
    </li>`;
  }).join('');
  renderSaved();
}

function toggleBox(i, o) {
  const e = S.form[i];
  let cur = e.pick && e.pick.length ? e.pick.slice() : [];
  if (!e.pick) cur = [o]; else if (cur.includes(o)) cur = cur.filter(x => x !== o); else cur.push(o);
  cur.sort((a, b) => '1X2'.indexOf(a) - '1X2'.indexOf(b));
  e.pick = cur.length ? cur : null;
  save(); renderForm();
  if (!e.pick) toast('המשחק חזר לבחירה אוטומטית');
}
function autofill() {
  const [from, to] = weekendRange();
  const list = upcoming(from, to, PRIORITY.filter(hasData)).filter(x => x.m.hg == null);
  const pick = [];
  for (const code of PRIORITY) { for (const x of list) if (x.code === code && pick.length < 16) pick.push(x); if (pick.length >= 16) break; }
  if (!pick.length) { toast('לא נמצאו משחקים בטווח הקרוב'); return; }
  pick.sort((a, b) => (a.m.d + (a.m.t || '')).localeCompare(b.m.d + (b.m.t || '')));
  S.form = pick.map(x => entryFrom(x.code, x.m)); save(); renderForm();
  toast(`נוספו ${S.form.length} משחקים לדוגמה`);
}
function formText() {
  const F = computeForm();
  const lines = F.items.map((x, i) => {
    const r = x.r, h = r.manual ? x.e.manual.home : tName(r.code, r.h), a = r.manual ? x.e.manual.away : tName(r.code, r.a);
    return `${i + 1}. ${h} – ${a}:  ${F.picks[i].join('/')}`;
  });
  lines.push('', `טורים: ${F.cols} | עלות: ₪${(F.cols * (+S.sys.price || 0)).toLocaleString('he-IL')}`, 'טוטו חכם');
  return lines.join('\n');
}
function copyForm() {
  if (!S.form.length) { toast('הטופס ריק'); return; }
  const txt = formText();
  const show = () => { openSheet(`<div class="panel"><h2>הטופס כטקסט</h2><textarea class="copybox" id="copytxt" readonly>${esc(txt)}</textarea><p class="note">סמן והעתק (למשל לוואטסאפ).</p></div>`); const ta = $('#copytxt'); ta.focus(); ta.select(); };
  try { navigator.clipboard.writeText(txt).then(() => toast('הטופס הועתק'), show); } catch (e) { show(); }
}
function addEntry(e) {
  if (S.form.length >= 16) { toast('בטופס כבר 16 משחקים'); return; }
  S.form.push(e); save(); if (S.tab === 'form') renderForm();
  toast(`נוסף משחק ${S.form.length} מתוך 16`);
}
function openAddDialog() {
  const codes = PRIORITY.filter(c => DB.leagues[c] && DB.leagues[c].teams.length);
  openSheet(`<div class="panel">
    <h2>הוספת משחק לטופס</h2>
    <p class="note">בחר ליגה וקבוצות כפי שמופיעות בטופס הרשמי, או לחץ על משחק קרוב מהרשימה.</p>
    <div class="grid2">
      <label class="field"><span>ליגה</span><select id="ad-league">${codes.map(c => `<option value="${c}">${esc(leagueName(c))}</option>`).join('')}</select></label>
      <label class="field"><span>תאריך</span><input type="date" id="ad-date" value="${todayISO()}"></label>
      <label class="field"><span>קבוצת בית</span><select id="ad-home"></select></label>
      <label class="field"><span>קבוצת חוץ</span><select id="ad-away"></select></label>
    </div>
    <div id="ad-fixtures"></div>
    <div class="actions"><button class="btn primary" id="ad-ok">הוספה</button></div>
    <h3>הזנה חופשית (בלי סטטיסטיקה)</h3>
    <div class="grid2"><label class="field"><span>בית</span><input id="ad-fh"></label><label class="field"><span>חוץ</span><input id="ad-fa"></label></div>
    <div class="actions"><button class="btn" id="ad-free">הוספה ידנית</button></div>
  </div>`);
  const fill = () => {
    const code = $('#ad-league').value, L = DB.leagues[code];
    const cur = new Set(); L.m.forEach(x => { if (x.d >= seasonStart()) { cur.add(x.h); cur.add(x.a); } });
    const idx = (cur.size ? [...cur] : L.teams.map((_, i) => i)).sort((a, b) => L.teams[a].he.localeCompare(L.teams[b].he, 'he'));
    const opts = idx.map(i => `<option value="${i}">${esc(L.teams[i].he)}</option>`).join('');
    $('#ad-home').innerHTML = opts; $('#ad-away').innerHTML = opts; if (idx.length > 1) $('#ad-away').value = idx[1];
    const next = upcoming(todayISO(), addDays(todayISO(), 10), [code]).filter(x => x.m.hg == null).slice(0, 14);
    $('#ad-fixtures').innerHTML = next.length ? `<div class="note">משחקים קרובים בליגה:</div><div class="league-chips" style="flex-wrap:wrap">${next.map((x, k) => `<button class="chip" data-fx="${k}">${esc(tName(code, x.m.h))} – ${esc(tName(code, x.m.a))} · ${dmy(x.m.d)}</button>`).join('')}</div>` : '';
    $('#ad-fixtures').onclick = ev => { const b = ev.target.closest('[data-fx]'); if (b) addEntry(entryFrom(code, next[+b.dataset.fx].m)); };
  };
  $('#ad-league').onchange = fill; fill();
  $('#ad-ok').onclick = () => {
    const code = $('#ad-league').value, L = DB.leagues[code], h = +$('#ad-home').value, a = +$('#ad-away').value;
    if (h === a) { toast('בחר שתי קבוצות שונות'); return; }
    addEntry({ code, hk: L.teams[h].key, ak: L.teams[a].key, d: $('#ad-date').value || todayISO() });
  };
  $('#ad-free').onclick = () => {
    const h = $('#ad-fh').value.trim(), a = $('#ad-fa').value.trim();
    if (!h || !a) { toast('הזן שתי קבוצות'); return; }
    addEntry({ manual: { home: h, away: a }, d: $('#ad-date').value || todayISO() });
  };
}


// ---------- WINNINGS: columns per tier, prize, saved forms ----------
// Columns with exactly j misses = coefficient of x^j in prod(hit_i + miss_i * x).
// Games not decided yet count as going your way ("best case") so the box shows what is still possible.
function columnsByMisses(picksList, sts) {
  let poly = [1], pending = 0;
  picksList.forEach((pk, i) => {
    const st = sts[i], k = pk.length;
    let h, m;
    if (st && (st.s === 'done' || st.s === 'live')) { h = pk.includes(st.o) ? 1 : 0; m = k - h; }
    else { pending++; h = 1; m = k - 1; }
    const np = new Array(poly.length + 1).fill(0);
    poly.forEach((v, j) => { np[j] += v * h; np[j + 1] += v * m; });
    poly = np;
  });
  return { poly, pending };
}
function tiersOf(n) { return [n, n - 1, n - 2].filter(t => t > 0); }
function winningsOf(n, poly, prizes) {
  const rows = tiersOf(n).map(t => { const c = poly[n - t] || 0, pr = +((prizes || {})[t]) || 0; return { t, c, pr, sum: c * pr }; });
  const best = n - poly.findIndex(v => v > 0);
  return { rows, total: rows.reduce((a, r) => a + r.sum, 0), best };
}
const money = v => '₪' + (+v || 0).toLocaleString('he-IL', { maximumFractionDigits: 0 });

function prizeTable(n, poly, prizes, cost, inputPrefix, final) {
  const W = winningsOf(n, poly, prizes), profit = W.total - cost;
  return `<div class="tbl-wrap"><table><thead><tr><th>נכונים</th><th class="c">טורים זוכים</th><th class="c">פרס לטור (₪)</th><th class="c">סה״כ</th></tr></thead><tbody>
    ${W.rows.map(r => `<tr class="${r.c ? 'tier-on' : ''}"><td><b>${r.t}</b> מתוך ${n}</td><td class="c num">${r.c.toLocaleString('he-IL')}</td>
      <td class="c"><input class="prize-in" type="number" min="0" step="1" inputmode="decimal" id="${inputPrefix}-${r.t}" data-tier="${r.t}" value="${(prizes || {})[r.t] ?? ''}" placeholder="0" aria-label="פרס לטור עם ${r.t} נכונים"></td>
      <td class="c num">${money(r.sum)}</td></tr>`).join('')}
    </tbody></table></div>
    <div class="kpis">
      <div class="kpi"><b>${W.best}/${n}</b><span>הטור הטוב ביותר</span></div>
      <div class="kpi ${W.total > 0 ? 'good' : ''}"><b>${money(W.total)}</b><span>זכייה</span></div>
      <div class="kpi"><b>${money(cost)}</b><span>עלות הטופס</span></div>
      <div class="kpi ${profit > 0 ? 'good' : profit < 0 && W.total > 0 ? 'bad' : ''}"><b>${profit >= 0 ? '' : '−'}${money(Math.abs(profit))}</b><span>${profit >= 0 ? 'רווח' : 'הפסד'}${final ? '' : ' עד כה'}</span></div>
    </div>`;
}

function renderPrize(F, sts, cost) {
  const box = $('#prize-box'); if (!box) return;
  const n = F.items.length;
  const started = sts.some(st => st.s === 'done' || st.s === 'live');
  if (!started) {
    box.innerHTML = `<div class="panel"><h3>זכייה בטופס</h3><p class="note">אחרי שהמשחקים יתחילו, כאן יופיעו התוצאות: כמה טורים פגעו ב־${tiersOf(n).join(', ')} נכונים, הזכייה והרווח. הטופס נשמר אוטומטית ב"הטפסים שלי" ברגע שהמשחק הראשון מתחיל.</p></div>`;
    return;
  }
  const { poly, pending } = columnsByMisses(F.picks, sts);
  const liveN = sts.filter(st => st.s === 'live').length;
  const state = pending ? `נותרו ${pending} משחקים שלא התחילו. הטבלה מניחה שהם יסתדרו לטובתך, כלומר זה המקסימום שעוד אפשרי.` : liveN ? `${liveN} משחקים עדיין חיים: המספרים לפי התוצאה כרגע.` : 'כל המשחקים הסתיימו. אלה התוצאות הסופיות של הטופס.';
  box.innerHTML = `<div class="panel">
    <div class="section-title"><h3>זכייה בטופס</h3>${!pending && !liveN ? '<span class="tag hit">סופי</span>' : '<span class="tag live"><i class="pulse"></i>מתעדכן</span>'}</div>
    <p class="note">${state} את הפרס לטור מזינים לפי מה שהטוטו מפרסם אחרי המחזור: הוא נקבע לפי הקופה ומספר הזוכים, ולכן אי אפשר לדעת אותו מראש.</p>
    ${prizeTable(n, poly, S.prizes, cost, 'pz', !pending && !liveN)}</div>`;
}

function formSig(entries) { return entries.map(e => (e.manual ? 'm:' + e.manual.home + '-' + e.manual.away : e.code + ':' + e.hk + '-' + e.ak) + '@' + e.d).join('|'); }
function saveCurrentForm(auto) {
  if (!S.form.length) { toast('הטופס ריק'); return; }
  const F = computeForm();
  S.saved = S.saved || [];
  const sig = formSig(S.form);
  const ds = S.form.map(e => e.d).sort();
  const rec = {
    id: 'f' + Date.now(), sig, saved: todayISO(), auto: !!auto,
    label: (EXTRA.toto && formSig(totoEntries(EXTRA.toto).slice(0, 16)) === sig ? 'ווינר 16 · מחזור ' + EXTRA.toto.round + ' · ' : '') + `${dmy(ds[0])}–${dmy(ds[ds.length - 1])}`,
    cols: F.cols, price: +S.sys.price || 0, cost: F.cols * (+S.sys.price || 0), prizes: { ...(S.prizes || {}) },
    games: F.items.map((x, i) => {
      const r = x.r;
      return { e: { ...x.e, pick: undefined }, home: r.manual ? x.e.manual.home : tName(r.code, r.h), away: r.manual ? x.e.manual.away : tName(r.code, r.a), picks: F.picks[i], p: x.p };
    }),
  };
  const i = S.saved.findIndex(x => x.sig === sig);
  if (i >= 0) { if (auto) return; rec.id = S.saved[i].id; rec.prizes = { ...S.saved[i].prizes, ...rec.prizes }; S.saved[i] = rec; }
  else S.saved.unshift(rec);
  save(); renderSaved();
  toast(auto ? 'המשחק הראשון התחיל: הטופס נשמר אוטומטית ב"הטפסים שלי"' : 'הטופס נשמר ב"הטפסים שלי"');
}
function autoSaveForm(F, sts) {
  if (!S.form.length || !sts.some(st => st.s === 'done' || st.s === 'live')) return;
  const sig = formSig(S.form);
  if (!(S.saved || []).some(x => x.sig === sig)) saveCurrentForm(true);
}
function evalSaved(rec) {
  const sts = rec.games.map(g => { const r = resolveEntry(g.e); return r.manual ? { s: 'none' } : matchStatus(r.m); });
  const { poly, pending } = columnsByMisses(rec.games.map(g => g.picks), sts);
  const n = rec.games.length, W = winningsOf(n, poly, rec.prizes);
  const fin = sts.filter(st => st.s === 'done').length, live = sts.filter(st => st.s === 'live').length;
  const hits = sts.filter((st, i) => st.s === 'done' && rec.games[i].picks.includes(st.o)).length;
  return { sts, poly, pending, n, W, fin, live, hits, done: fin === n, profit: W.total - rec.cost };
}

function savedChart(list) {
  const pts = list.filter(x => x.v.done).slice(0, 12).reverse();
  if (!pts.length) return '<p class="note">הגרף יופיע אחרי שטופס שמור יסתיים.</p>';
  const W = 640, Hh = 210, pad = { l: 34, r: 8, t: 14, b: 30 }, iw = W - pad.l - pad.r, ih = Hh - pad.t - pad.b;
  const n = Math.max(...pts.map(x => x.v.n)), bw = iw / pts.length, y = v => pad.t + ih * (1 - v / n);
  return `<svg class="chart" viewBox="0 0 ${W} ${Hh}" role="img" aria-label="הטור הטוב ביותר בכל טופס">
    ${[0, n / 4, n / 2, (3 * n) / 4, n].map(v => `<line class="grid" x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}"/><text x="${pad.l - 6}" y="${y(v) + 3}" text-anchor="end">${Math.round(v)}</text>`).join('')}
    <line class="ref" x1="${pad.l}" x2="${W - pad.r}" y1="${y(n - 2)}" y2="${y(n - 2)}"/>
    ${pts.map((x, i) => `<rect class="barv${x.v.W.total > 0 ? '' : ' lowv'}" x="${pad.l + i * bw + bw * 0.2}" y="${y(x.v.W.best)}" width="${bw * 0.6}" height="${ih * x.v.W.best / n}" rx="3"><title>${esc(x.rec.label)}: ${x.v.W.best}/${x.v.n}, זכייה ${money(x.v.W.total)}</title></rect>
      <text x="${pad.l + i * bw + bw / 2}" y="${y(x.v.W.best) - 4}" text-anchor="middle">${x.v.W.best}</text>
      <text x="${pad.l + i * bw + bw / 2}" y="${Hh - 10}" text-anchor="middle">${dmy(x.rec.games.map(g => g.e.d).sort()[0])}</text>`).join('')}
  </svg>
  <div class="legend"><span><i style="background:var(--o1)"></i>טופס עם זכייה</span><span><i style="background:var(--ox)"></i>בלי זכייה</span><span><i style="background:var(--accent)"></i>קו ${n - 2} נכונים (הדרגה הנמוכה)</span></div>`;
}

function renderSaved() {
  const box = $('#saved-box'); if (!box) return;
  const list = (S.saved || []).map(rec => ({ rec, v: evalSaved(rec) }));
  const done = list.filter(x => x.v.done);
  const tc = done.reduce((a, x) => a + x.rec.cost, 0), tw = done.reduce((a, x) => a + x.v.W.total, 0);
  box.innerHTML = `<div class="panel">
    <div class="section-title"><h2>הטפסים שלי</h2><span class="actions"><button class="btn small" id="btn-save">שמירת הטופס</button><button class="btn small ghost" id="btn-export">גיבוי</button><button class="btn small ghost" id="btn-import">שחזור</button></span></div>
    <p class="note">כל טופס נשמר עם הניחושים שלו ונבדק מול התוצאות: ירוק = פגיעה, אדום = החטאה. הנתונים נשמרים בדפדפן הזה; "גיבוי" מעתיק אותם כדי להעביר למכשיר אחר.</p>
    ${list.length ? `<div class="kpis">
      <div class="kpi"><b>${list.length}</b><span>טפסים שמורים</span></div>
      <div class="kpi"><b>${done.length ? pct(done.reduce((a, x) => a + x.v.hits, 0) / done.reduce((a, x) => a + x.v.n, 0)) : '–'}</b><span>פגיעה במשחקים (טפסים שהסתיימו)</span></div>
      <div class="kpi"><b>${money(tw)}</b><span>סך זכיות</span></div>
      <div class="kpi ${tw - tc > 0 ? 'good' : tw - tc < 0 ? 'bad' : ''}"><b>${tw - tc >= 0 ? '' : '−'}${money(Math.abs(tw - tc))}</b><span>${tw - tc >= 0 ? 'רווח' : 'הפסד'} מצטבר</span></div>
    </div>
    ${savedChart(list)}
    <div class="plist">${list.map(({ rec, v }) => {
      const cls = v.done ? (v.W.total > 0 ? ' is-hit' : ' is-miss') : v.live ? ' is-live' : '';
      const st = v.done ? 'הסתיים' : v.live ? `${v.live} משחקים חיים` : v.fin ? `${v.fin}/${v.n} הסתיימו` : 'לפני המשחקים';
      return `<div class="prow click${cls}" data-saved="${rec.id}"><div><div class="t">${esc(rec.label)}${rec.auto ? ' <span class="tag">נשמר אוטומטית</span>' : ''}</div>
        <div class="m">${st} · ${rec.cols.toLocaleString('he-IL')} טורים · ${money(rec.cost)} · פגיעות ${v.hits}/${v.fin || 0}</div></div>
        <div class="r"><span class="pct">${v.W.best}/${v.n}</span>${v.done ? `<span class="tag ${v.W.total > 0 ? 'hit' : 'miss'}">${v.W.total > 0 ? money(v.W.total) : 'ללא זכייה'}</span>` : ''}</div></div>`;
    }).join('')}</div>` : '<p class="note">עדיין אין טפסים שמורים. לחץ "שמירת הטופס", או פשוט חכה: הטופס יישמר לבד כשהמשחק הראשון מתחיל.</p>'}
  </div>`;
}

function openSaved(id) {
  const rec = (S.saved || []).find(x => x.id === id); if (!rec) return;
  const v = evalSaved(rec);
  openSheet(`<div class="panel">
    <h2>${esc(rec.label)}</h2>
    <p class="note">נשמר ב־${dmy(rec.saved)}${rec.auto ? ' (אוטומטית, בתחילת המשחקים)' : ''} · ${rec.cols.toLocaleString('he-IL')} טורים · ₪${rec.price} לטור</p>
    <div class="plist">${rec.games.map((g, i) => {
      const st = v.sts[i];
      return `<div class="prow${rowState(st, g.picks)}"><div><div class="t">${i + 1}. ${esc(g.home)} – ${esc(g.away)}</div><div class="m">${g.p ? oddsLine(g.p) : ''} ${statusTag(st, g.picks)}</div></div><div class="r"><span class="pick">${g.picks.join('')}</span>${st.s === 'done' ? `<span class="hitmark ${g.picks.includes(st.o) ? 'ok' : 'no'}">${g.picks.includes(st.o) ? '✓' : '✕'}</span>` : ''}</div></div>`;
    }).join('')}</div>
    <h3>זכייה</h3>
    <p class="note">${v.done ? 'כל המשחקים הסתיימו.' : v.pending ? `נותרו ${v.pending} משחקים: המספרים מניחים שהם יסתדרו לטובתך.` : 'יש משחקים חיים: המספרים לפי התוצאה כרגע.'} הזן את הפרס לטור לפי הפרסום הרשמי.</p>
    <div id="saved-prize">${prizeTable(v.n, v.poly, rec.prizes, rec.cost, 'sp', v.done)}</div>
    <div class="actions"><button class="btn" id="saved-load">טעינה לטופס</button><button class="btn ghost" id="saved-del">מחיקה</button></div>
  </div>`);
  $('#saved-prize').addEventListener('change', e => {
    const t = e.target.closest('[data-tier]'); if (!t) return;
    rec.prizes = rec.prizes || {};
    if (rec.prizes[t.dataset.tier] === t.value) return;
    rec.prizes[t.dataset.tier] = t.value; save(); setTimeout(() => { renderSaved(); openSaved(id); }, 0);
  });
  $('#saved-load').onclick = () => {
    S.form = rec.games.map(g => ({ ...g.e, pick: g.picks.slice() })); S.prizes = { ...rec.prizes }; save(); closeSheet(); go('form');
    toast('הטופס נטען, עם הניחושים כפי שנשמרו');
  };
  $('#saved-del').onclick = () => {
    const b = $('#saved-del');
    if (!b.dataset.confirm) { b.dataset.confirm = 1; b.textContent = 'לחץ שוב למחיקה'; return; }
    S.saved = S.saved.filter(x => x.id !== id); save(); closeSheet(); renderSaved(); toast('הטופס נמחק');
  };
}
function exportSaved() {
  const txt = JSON.stringify(S.saved || []);
  openSheet(`<div class="panel"><h2>גיבוי הטפסים</h2><p class="note">העתק את הטקסט ושמור אותו (למשל בהודעה לעצמך). במכשיר אחר: "שחזור" והדבקה.</p><textarea class="copybox" id="exp-txt" readonly>${esc(txt)}</textarea></div>`);
  const ta = $('#exp-txt'); ta.focus(); ta.select();
  try { navigator.clipboard.writeText(txt).then(() => toast('הגיבוי הועתק'), () => {}); } catch (e) { /* manual copy */ }
}
function importSaved() {
  openSheet(`<div class="panel"><h2>שחזור טפסים</h2><p class="note">הדבק כאן טקסט גיבוי. טפסים שכבר קיימים לא יוכפלו.</p><textarea class="copybox" id="imp-txt"></textarea><div class="actions"><button class="btn primary" id="imp-ok">שחזור</button></div></div>`);
  $('#imp-ok').onclick = () => {
    try {
      const arr = JSON.parse($('#imp-txt').value);
      if (!Array.isArray(arr)) throw new Error('bad');
      S.saved = S.saved || []; let added = 0;
      for (const r of arr) if (r && r.sig && r.games && !S.saved.some(x => x.sig === r.sig)) { S.saved.push(r); added++; }
      save(); closeSheet(); renderSaved(); toast(`שוחזרו ${added} טפסים`);
    } catch (e) { toast('הטקסט לא נראה כמו גיבוי של טוטו חכם'); }
  };
}

// ---------- WEEK ----------
function weekRange() {
  const t = todayISO(), dow = new Date(t + 'T12:00:00Z').getUTCDay();
  if (S.week.range === 'weekend') return weekendRange();
  if (S.week.range === 'next') { const sun = addDays(t, 7 - dow); return [sun, addDays(sun, 6)]; }
  if (S.week.range === 'custom' && S.week.from && S.week.to) return [S.week.from, S.week.to];
  return [t, addDays(t, 6)];
}
function renderWeek() {
  const [from, to] = weekRange();
  $('#w-from').value = from; $('#w-to').value = to;
  document.querySelectorAll('[data-range]').forEach(b => b.setAttribute('aria-pressed', b.dataset.range === S.week.range));
  const avail = PRIORITY.filter(c => DB.leagues[c] && DB.leagues[c].m.length);
  const on = new Set(S.week.leagues || avail);
  $('#league-chips').innerHTML = avail.map(c => `<button class="chip" data-lg="${c}" aria-pressed="${on.has(c)}">${esc(leagueName(c))}</button>`).join('');
  const list = upcoming(from, to, avail.filter(c => on.has(c)));
  if (!list.length) { $('#week-list').innerHTML = `<div class="empty">אין משחקים בטווח התאריכים הזה בליגות שנבחרו.</div>`; return; }
  const byDay = {}; list.forEach(x => (byDay[x.m.d] = byDay[x.m.d] || []).push(x));
  const inForm = new Set(S.form.filter(e => !e.manual).map(e => `${e.code}|${e.hk}|${e.ak}`));
  $('#week-list').innerHTML = Object.entries(byDay).map(([d, xs]) => `<div class="day"><h2>${fmtDate(d)} · ${xs.length} משחקים</h2><div class="cards">${xs.map(x => card(x.code, x.m, inForm)).join('')}</div></div>`).join('');
}
function card(code, m, inForm) {
  const L = DB.leagues[code], known = hasData(code);
  const asOf = m.hg != null ? m.d : todayISO();
  const p = known ? predictCached(code, m.h, m.a, asOf) : null, P = p ? probsOf(p) : null;
  const H = L.teams[m.h], A = L.teams[m.a];
  const k = `${code}|${H.key}|${A.key}`;
  const st = matchStatus(m), res = st.o || null, pk = P ? bestPick(P) : null;
  return `<article class="mcard${pk ? rowState(st, [pk]) : ''}">
    <div class="lg"><span>${esc(leagueName(code))} ${staleTag(code)}</span><span>${m.hg == null ? (m.t || '') : (pk ? `<span class="hitmark ${pk === res ? 'ok' : 'no'}">${pk === res ? '✓' : '✕'}</span>` : '')}</span></div>
    <div class="vs" data-match="${code}|${L.m.indexOf(m)}">
      <div class="team">${badge(H.he, H.key)}<b>${esc(H.he)}</b></div>
      <span class="mid${st.s === 'done' || st.s === 'live' ? ' score' : ''}">${st.s === 'done' || st.s === 'live' ? `<span dir="ltr">${st.hg}:${st.ag}</span>${st.s === 'live' ? `<small class="live-clock"><i class="pulse"></i>${esc(st.clock || 'חי')}</small>` : ''}` : 'נגד'}</span>
      <div class="team">${badge(A.he, A.key)}<b>${esc(A.he)}</b></div>
    </div>
    ${P ? probBar(P) + reasonLine(p, H.he, A.he) : '<div class="note">אין מספיק נתונים לתחזית</div>'}
    <div class="card-foot">
      <span>${P ? `<span class="pick">${pk}</span> ${confMeter(P)}` : ''}</span>
      ${m.hg == null ? (inForm.has(k) ? '<span class="tag hit">בטופס</span>' : `<button class="btn small" data-addm="${code}|${L.m.indexOf(m)}">+ לטופס</button>`) : ''}
    </div>
  </article>`;
}

// ---------- MATCH ----------
function openMatch(code, h, a, m) {
  const L = DB.leagues[code];
  const asOf = m && m.hg != null ? m.d : todayISO();
  const p = hasData(code) ? predictCached(code, h, a, asOf) : null, P = p && probsOf(p);
  const sh = teamStats(L, h, asOf), sa = teamStats(L, a, asOf), hh = h2h(L, h, a, asOf);
  const tab = standings(L, asOf), ph = tab.find(r => r.t === h), pa = tab.find(r => r.t === a);
  const H = L.teams[h].he, A = L.teams[a].he, F = fitLeague(L, asOf);
  const rIcon = r => (r === 'W' ? 'נ' : r === 'D' ? 'ת' : 'ה');
  const statBlock = (s, home) => `<div class="stats">
      <div class="stat"><b>${s.all.w}-${s.all.d}-${s.all.l}</b><span>נ-ת-ה (${s.basisLabel})</span></div>
      <div class="stat"><b>${home ? `${s.home.w}-${s.home.d}-${s.home.l}` : `${s.away.w}-${s.away.d}-${s.away.l}`}</b><span>${home ? 'מאזן בבית' : 'מאזן בחוץ'}</span></div>
      <div class="stat"><b>${fx(s.all.n ? s.all.gf / s.all.n : null, 2)}</b><span>שערי זכות למשחק</span></div>
      <div class="stat"><b>${fx(s.all.n ? s.all.ga / s.all.n : null, 2)}</b><span>שערי חובה למשחק</span></div>
      <div class="stat"><b>${pct(s.all.n ? s.all.o25 / s.all.n : null)}</b><span>מעל 2.5</span></div>
      <div class="stat"><b>${pct(s.all.n ? s.all.btts / s.all.n : null)}</b><span>שתיהן הבקיעו</span></div>
      <div class="stat"><b>${pct(s.all.n ? s.all.cs / s.all.n : null)}</b><span>שער נקי</span></div>
      <div class="stat"><b>${s.streak.unbeaten}</b><span>רצף ללא הפסד</span></div></div>`;
  const formChips = s => `<span class="form">${s.form.slice(0, 6).map(f => `<i class="${f.r}">${rIcon(f.r)}</i>`).join('')}</span>`;
  const lastList = (s, t) => `<div class="tbl-wrap"><table><tbody>${s.form.map(f => { const opp = f.m.h === t ? f.m.a : f.m.h; return `<tr><td class="num">${fmtDate(f.m.d)}</td><td>${f.home ? 'בית' : 'חוץ'} · ${esc(L.teams[opp].he)}</td><td class="num c">${f.gf}:${f.ga}</td><td class="c"><span class="form"><i class="${f.r}">${rIcon(f.r)}</i></span></td></tr>`; }).join('') || '<tr><td>אין משחקים</td></tr>'}</tbody></table></div>`;
  const per = (s, k) => (s.n ? s[k] / s.n : null);
  const cmp = (label, x, y) => `<tr><td>${x}</td><td>${label}</td><td>${y}</td></tr>`;
  openSheet(`
    <div class="m-head">
      <div>${badge(H, L.teams[h].key, true)}<h2>${esc(H)}</h2><div class="pos">${ph ? `מקום ${ph.pos} · ${ph.pts} נק׳` : ''}</div></div>
      <div><span class="mid">${m && m.hg != null ? `${m.hg}:${m.ag}` : 'נגד'}</span><span class="mnote">${esc(leagueName(code))}<br>${m ? fmtDate(m.d, m.t) : ''}</span></div>
      <div>${badge(A, L.teams[a].key, true)}<h2>${esc(A)}</h2><div class="pos">${pa ? `מקום ${pa.pos} · ${pa.pts} נק׳` : ''}</div></div>
    </div>
    ${P ? `<div class="panel">
      <div class="section-title"><h3>הניחוש</h3>${confMeter(P)}</div>
      ${probBar(P)}
      <div class="stats">
        <div class="stat"><b>${bestPick(P)}</b><span>ניחוש מומלץ</span></div>
        <div class="stat"><b dir="ltr">${fx(p.lh, 1)}–${fx(p.la, 1)}</b><span>שערים צפויים (בית–חוץ)</span></div>
        <div class="stat"><b>${pct(P['1'] + P['X'])}</b><span>כפול 1X</span></div>
        <div class="stat"><b>${pct(P['X'] + P['2'])}</b><span>כפול X2</span></div>
        <div class="stat"><b>${pct(p.o25)}</b><span>מעל 2.5 שערים</span></div>
        <div class="stat"><b>${pct(p.btts)}</b><span>שתי הקבוצות יבקיעו</span></div>
      </div>
      <div><div class="note">תוצאות סבירות:</div><div class="scores">${p.top.map(s => `<span>${s[0]}:${s[1]} · ${pct(s[2])}</span>`).join('')}</div></div>
      ${staleInfo(code) ? `<p class="note"><b>נתוני הליגה מעודכנים עד ${dmy(staleInfo(code))}.</b> בדוק כושר עדכני לפני שאתה סומך על התחזית.</p>` : ''}
      ${p.reliability < 6 ? '<p class="note">לאחת הקבוצות מעט משחקים בנתונים (קבוצה עולה), ולכן התחזית פחות אמינה.</p>' : ''}
    </div>
    ${factorPanel(p, H, A, ph, pa)}` : '<div class="panel"><p>אין מספיק נתונים לתחזית.</p></div>'}
    <div class="panel"><h3>ניתוח</h3><ul class="analysis">${analysis(H, A, P, p, sh, sa, hh, ph, pa, L).map(t => `<li>${t}</li>`).join('')}</ul></div>
    <div class="panel">
      <h3>ראש בראש${hh.since ? ` · מאז ${+hh.since.slice(0, 4)}` : ''}</h3>
      ${hh.all.n ? `<div class="h2h-big"><div class="w"><b>${hh.all.w}</b><span>ניצחונות ${esc(H)}</span></div><div class="d"><b>${hh.all.d}</b><span>תיקו</span></div><div class="l"><b>${hh.all.l}</b><span>ניצחונות ${esc(A)}</span></div></div>
      <div class="stats"><div class="stat"><b>${hh.all.n}</b><span>מפגשים</span></div><div class="stat"><b>${hh.all.gf}:${hh.all.ga}</b><span>שערים</span></div><div class="stat"><b>${fx((hh.all.gf + hh.all.ga) / hh.all.n, 2)}</b><span>שערים למשחק</span></div><div class="stat"><b>${pct(hh.all.o25 / hh.all.n)}</b><span>מעל 2.5</span></div><div class="stat"><b>${hh.venue.w}-${hh.venue.d}-${hh.venue.l}</b><span>כש${esc(H)} בבית</span></div></div>
      <div class="tbl-wrap"><table><thead><tr><th>תאריך</th><th>בית</th><th class="c">תוצאה</th><th>חוץ</th></tr></thead><tbody>${hh.list.slice(0, 15).map(x => `<tr><td class="num">${x.d.split('-').reverse().join('.')}</td><td>${esc(L.teams[x.h].he)}</td><td class="num c">${x.hg}:${x.ag}</td><td>${esc(L.teams[x.a].he)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="note">לא נמצאו מפגשים קודמים בליגה הזו בנתונים.</p>'}
    </div>
    <div class="panel"><h3>השוואה</h3><div class="tbl-wrap"><table class="cmp"><thead><tr><th class="c">${esc(H)}</th><th class="c"></th><th class="c">${esc(A)}</th></tr></thead><tbody>
      ${cmp('מקום בטבלה', ph ? ph.pos : '–', pa ? pa.pos : '–')}
      ${cmp('נקודות למשחק', fx(per(sh.all, 'pts'), 2), fx(per(sa.all, 'pts'), 2))}
      ${cmp('6 אחרונים', formChips(sh), formChips(sa))}
      ${cmp('שערים למשחק (בית / חוץ)', fx(per(sh.home, 'gf'), 2), fx(per(sa.away, 'gf'), 2))}
      ${cmp('ספיגה למשחק (בית / חוץ)', fx(per(sh.home, 'ga'), 2), fx(per(sa.away, 'ga'), 2))}
      ${cmp('מדד התקפה (1.00 = ממוצע)', fx(F.att[h], 2), fx(F.att[a], 2))}
      ${cmp('מדד הגנה (נמוך = טוב)', fx(F.def[h], 2), fx(F.def[a], 2))}
      ${cmp('רצף ללא ניצחון', sh.streak.winless, sa.streak.winless)}
    </tbody></table></div></div>
    <div class="grid2">
      <div class="panel"><h3>${esc(H)}</h3>${statBlock(sh, true)}<div class="note">10 משחקים אחרונים</div>${lastList(sh, h)}</div>
      <div class="panel"><h3>${esc(A)}</h3>${statBlock(sa, false)}<div class="note">10 משחקים אחרונים</div>${lastList(sa, a)}</div>
    </div>
    ${m && m.hg == null && !S.form.some(e => !e.manual && e.code === code && e.hk === L.teams[h].key && e.ak === L.teams[a].key) ? `<div class="actions"><button class="btn primary" id="m-add">הוספה לטופס</button></div>` : ''}`);
  const b = $('#m-add'); if (b) b.onclick = () => { addEntry(entryFrom(code, m)); closeSheet(); };
}

function analysis(H, A, P, p, sh, sa, hh, ph, pa, L) {
  const out = [];
  if (P) {
    const best = bestPick(P), top = P[best];
    if (best === 'X') out.push(`התחזית נוטה לתיקו (${pct(P.X)}). משחק צמוד, כדאי לשקול כפול.`);
    else {
      const fav = best === '1' ? H : A;
      if (top >= 0.6) out.push(`<b>${esc(fav)}</b> פייבוריטית ברורה עם ${pct(top)} לניצחון.`);
      else if (top >= 0.45) out.push(`<b>${esc(fav)}</b> קלה לפייבוריטית (${pct(top)}), אבל יש מקום להפתעה.`);
      else out.push(`אין פייבוריטית ברורה (הסיכוי הגבוה ביותר ${pct(top)} ל־${esc(fav)}). מועמד לכפול או למשולש.`);
    }
    if (P.X >= 0.3) out.push(`סיכוי התיקו גבוה מהרגיל (${pct(P.X)}).`);
    const g = p.lh + p.la;
    out.push(g >= 3 ? `צפוי משחק פתוח: ${fx(g)} שערים בממוצע, ${pct(p.o25)} למעל 2.5.` : g <= 2.2 ? `צפוי משחק סגור: ${fx(g)} שערים בממוצע, ${pct(1 - p.o25)} לעד 2 שערים.` : `צפי שערים בינוני: ${fx(g)} למשחק.`);
  }
  if (ph && pa && ph.p >= 3 && Math.abs(pa.pos - ph.pos) >= 5) out.push(`פער בטבלה: ${esc(pa.pos > ph.pos ? H : A)} במקום ${Math.min(ph.pos, pa.pos)} מול מקום ${Math.max(ph.pos, pa.pos)}.`);
  const formLine = (name, s) => {
    if (s.streak.wins >= 3) return `${esc(name)} ברצף של ${s.streak.wins} ניצחונות.`;
    if (s.streak.unbeaten >= 5) return `${esc(name)} ב־${s.streak.unbeaten} משחקים ללא הפסד.`;
    if (s.streak.losses >= 3) return `${esc(name)} ברצף של ${s.streak.losses} הפסדים.`;
    if (s.streak.winless >= 5) return `${esc(name)} לא ניצחה ב־${s.streak.winless} המשחקים האחרונים.`;
    return null;
  };
  [formLine(H, sh), formLine(A, sa)].filter(Boolean).forEach(x => out.push(x));
  if (sh.home.n >= 4) { const r = sh.home.w / sh.home.n; if (r >= 0.65) out.push(`${esc(H)} חזקה בבית: ${sh.home.w} ניצחונות ב־${sh.home.n} משחקי בית.`); else if (r <= 0.2) out.push(`${esc(H)} חלשה בבית: ${sh.home.w} ניצחונות ב־${sh.home.n} משחקי בית.`); }
  if (sa.away.n >= 4) { const r = sa.away.w / sa.away.n; if (r >= 0.5) out.push(`${esc(A)} טובה בחוץ: ${sa.away.w} ניצחונות ב־${sa.away.n} משחקי חוץ.`); else if (sa.away.l / sa.away.n >= 0.65) out.push(`${esc(A)} מתקשה בחוץ: ${sa.away.l} הפסדים ב־${sa.away.n} משחקי חוץ.`); }
  if (hh.all.n >= 3) {
    out.push(`בכל המפגשים בנתונים: ${hh.all.w} ניצחונות ל${esc(H)}, ${hh.all.d} תיקו, ${hh.all.l} ניצחונות ל${esc(A)}.`);
    if (hh.all.o25 / hh.all.n >= 0.65) out.push(`מפגשים עתירי שערים: ${pct(hh.all.o25 / hh.all.n)} הסתיימו מעל 2.5.`);
    const last = hh.list[0];
    out.push(`המפגש האחרון (${last.d.split('-').reverse().join('.')}): ${esc(L.teams[last.h].he)} ${last.hg}:${last.ag} ${esc(L.teams[last.a].he)}.`);
  } else out.push('אין מספיק מפגשים קודמים בין הקבוצות כדי להסיק מגמה.');
  return out;
}

// ---------- TRACK RECORD & LEARNING ----------
function weeklyChart(rows) {
  const by = {};
  rows.forEach(r => { const w = mondayOf(r.d); (by[w] = by[w] || []).push(r); });
  const weeks = Object.keys(by).sort().slice(-16).map(w => ({ w, ...accOf(by[w]), exp: by[w].reduce((a, r) => a + r.conf, 0) / by[w].length })).filter(x => x.n >= 5);
  if (!weeks.length) return '<p class="note">אין מספיק שבועות.</p>';
  const W = 640, Hh = 200, pad = { l: 34, r: 8, t: 12, b: 26 }, iw = W - pad.l - pad.r, ih = Hh - pad.t - pad.b;
  const bw = iw / weeks.length, y = v => pad.t + ih * (1 - v);
  const avg = weeks.reduce((s, x) => s + x.acc * x.n, 0) / weeks.reduce((s, x) => s + x.n, 0);
  return `<svg class="chart" viewBox="0 0 ${W} ${Hh}" role="img" aria-label="אחוז פגיעה לפי שבוע">
    ${[0, 0.25, 0.5, 0.75, 1].map(v => `<line class="grid" x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}"/><text x="${pad.l - 6}" y="${y(v) + 3}" text-anchor="end">${v * 100}%</text>`).join('')}
    ${weeks.map((x, i) => `<rect class="barv${x.acc < 1 / 3 ? ' lowv' : ''}" x="${pad.l + i * bw + bw * 0.18}" y="${y(x.acc)}" width="${bw * 0.64}" height="${ih * x.acc}" rx="3"><title>${dmy(x.w)}: ${pct(x.acc)} (${x.n} משחקים)</title></rect>
      ${i % 2 === 0 || weeks.length <= 8 ? `<text x="${pad.l + i * bw + bw / 2}" y="${Hh - 8}" text-anchor="middle">${dmy(x.w)}</text>` : ''}`).join('')}
    <line class="diag" x1="${pad.l}" x2="${W - pad.r}" y1="${y(1 / 3)}" y2="${y(1 / 3)}"/>
    <polyline class="line" points="${weeks.map((x, i) => `${pad.l + i * bw + bw / 2},${y(x.exp)}`).join(' ')}"/>
    ${weeks.map((x, i) => `<circle class="dot" cx="${pad.l + i * bw + bw / 2}" cy="${y(x.exp)}" r="3.5"><title>${dmy(x.w)}: המערכת צפתה ${pct(x.exp)}, בפועל ${pct(x.acc)}</title></circle>`).join('')}
  </svg>
  <div class="legend"><span><i style="background:var(--o1)"></i>פגיעה בפועל (ממוצע ${pct(avg)})</span><span><i style="background:var(--accent)"></i>מה שהמערכת צפתה לאותו שבוע</span><span>מקווקו: ניחוש אקראי 33%</span></div>`;
}
function calibChart(buckets) {
  const W = 320, Hh = 240, pad = { l: 36, r: 10, t: 10, b: 30 }, iw = W - pad.l - pad.r, ih = Hh - pad.t - pad.b;
  const x = v => pad.l + iw * (v - 0.3) / 0.6, y = v => pad.t + ih * (1 - (v - 0.3) / 0.6);
  const pts = buckets.filter(b => b.n >= 30);
  return `<svg class="chart" viewBox="0 0 ${W} ${Hh}" role="img" aria-label="כיול: ביטחון מול פגיעה בפועל">
    ${[0.3, 0.45, 0.6, 0.75, 0.9].map(v => `<line class="grid" x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}"/><text x="${pad.l - 5}" y="${y(v) + 3}" text-anchor="end">${Math.round(v * 100)}%</text><text x="${x(v)}" y="${Hh - 10}" text-anchor="middle">${Math.round(v * 100)}%</text>`).join('')}
    <line class="diag" x1="${x(0.3)}" y1="${y(0.3)}" x2="${x(0.9)}" y2="${y(0.9)}"/>
    <polyline class="line" points="${pts.map(b => `${x(b.pred)},${y(b.hit)}`).join(' ')}"/>
    ${pts.map(b => `<circle class="dot" cx="${x(b.pred)}" cy="${y(b.hit)}" r="5"><title>המערכת אמרה ${pct(b.pred)}, פגעה ב־${pct(b.hit)} (${b.n} משחקים)</title></circle>`).join('')}
  </svg>
  <div class="legend"><span>ציר אופקי: כמה המערכת הייתה בטוחה · ציר אנכי: כמה פעמים צדקה בפועל · קו מקווקו = כיול מושלם</span></div>`;
}

async function loadFrozenIndex() {
  if (EXTRA.frozen) return EXTRA.frozen;
  try { const r = await fetch('data/frozen/index.json', { cache: 'no-cache' }); EXTRA.frozen = r.ok ? await r.json() : []; } catch (e) { EXTRA.frozen = []; }
  return EXTRA.frozen;
}
async function loadFrozen(f) {
  if (EXTRA.frozenData[f]) return EXTRA.frozenData[f];
  const r = await fetch('data/frozen/' + f, { cache: 'no-cache' });
  EXTRA.frozenData[f] = await r.json();
  return EXTRA.frozenData[f];
}
function scoreFrozen(fz) {
  return fz.games.map(g => {
    const [code, d, t, hk, ak, hn, an, p1, px, p2] = g;
    const L = DB.leagues[code];
    let m = null;
    if (L) { const h = L.keyIdx[hk], a = L.keyIdx[ak]; if (h != null && a != null) m = L.m.find(x => x.h === h && x.a === a && Math.abs(daysBetween(x.d, d)) <= 4) || null; }
    const P = { '1': p1, 'X': px, '2': p2 }, pick = bestPick(P);
    const res = m && m.hg != null ? resultCode(m.hg, m.ag) : null;
    return { code, d, hn, an, P, pick, m, res, hit: res ? pick === res : null };
  });
}

async function renderTrack() {
  const V = $('#view-track');
  const M = DB.model, T = trackRows();
  const sStart = seasonStart();
  const season = T.filter(r => r.d >= sStart);
  const sa = accOf(season), all = accOf(T);
  const codes = PRIORITY.filter(c => season.some(r => r.code === c));
  const lg = S.trackLeague && codes.includes(S.trackLeague) ? S.trackLeague : '';
  const recent = T.filter(r => !lg || r.code === lg).slice().sort((a, b) => b.d.localeCompare(a.d)).slice(0, 30);
  const surprises = T.filter(r => r.d >= addDays(todayISO(), -30) && !r.hit && r.conf >= 0.58).sort((a, b) => b.conf - a.conf).slice(0, 8);
  const perL = codes.map(c => ({ c, ...accOf(season.filter(r => r.code === c)) })).filter(x => x.n >= 10).sort((a, b) => b.acc - a.acc);
  const draws = season.filter(r => r.res === 'X').length / (season.length || 1), drawPicks = season.filter(r => r.pick === 'X').length / (season.length || 1);
  const ev = M && M.eval;
  V.innerHTML = `
    <div class="page-head"><div><p class="eyebrow">בדיקה עצמית ולמידה</p><h1>דיוק ולמידה</h1>
      <p class="sub">כל ניחוש כאן חושב לפני המשחק, רק עם המידע שהיה ידוע אז, ונבדק מול התוצאה. המשקלים שבהם נבדק העונה נקבעו לפני יולי 2025, כך שהמערכת לא "ראתה" את התוצאות האלה.</p></div></div>
    <div class="kpis">
      <div class="kpi hl"><b>${pct(sa.acc)}</b><span>פגיעה בניחוש בודד, העונה (${sa.n.toLocaleString('he-IL')})</span></div>
      <div class="kpi"><b>${pct(sa.acc2)}</b><span>פגיעה בכפול, העונה</span></div>
      <div class="kpi"><b>${pct(all.acc)}</b><span>פגיעה מאז יולי 2025 (${all.n.toLocaleString('he-IL')})</span></div>
      <div class="kpi"><b>33% / 67%</b><span>ניחוש אקראי: בודד / כפול</span></div>
    </div>
    <div class="grid2">
      <div class="panel"><h3>תחזית מול תוצאה, לפי שבוע</h3><p class="note">עמודה = כמה ניחושים פגעו בפועל. נקודה = כמה המערכת ציפתה שיפגעו. כשהן קרובות, המערכת מעריכה את עצמה נכון.</p>${weeklyChart(T.filter(r => r.d >= addDays(todayISO(), -140)))}</div>
      <div class="panel"><h3>האם אפשר לסמוך על האחוזים?</h3>${M ? calibChart(M.buckets) : ''}
        <p class="note">${M ? M.buckets.filter(b => b.n >= 30).map(b => `כשהמערכת אמרה ${pct(b.pred)}, היא צדקה ב־${pct(b.hit)}`).join(' · ') : ''}.</p></div>
    </div>
    <div class="panel" id="frozen-panel"><h3>הניחושים הנעולים של כל שבוע</h3><p class="note">טוען…</p></div>
    <div class="grid2">
      <div class="panel"><h3>דיוק לפי ליגה, העונה</h3>
        <div class="tbl-wrap"><table><thead><tr><th>ליגה</th><th class="c">משחקים</th><th class="c">בודד</th><th class="c"></th><th class="c">כפול</th></tr></thead><tbody>
        ${perL.map(x => `<tr><td>${esc(leagueName(x.c))}</td><td class="c num">${x.n}</td><td class="c num">${pct(x.acc)}</td><td class="c"><span class="minibar"><i style="width:${(x.acc * 100).toFixed(0)}%"></i></span></td><td class="c num">${pct(x.acc2)}</td></tr>`).join('')}
        </tbody></table></div></div>
      <div class="panel"><h3>ממה המערכת לומדת</h3>
        <ul class="analysis">
          <li>תיקו: ${pct(draws)} מהמשחקים העונה הסתיימו בתיקו, אבל המערכת ניחשה תיקו רק ב־${pct(drawPicks)} מהם. תיקו כמעט אף פעם לא האפשרות הכי סבירה, ולכן בטופס הוא מגיע דרך כפולים.</li>
          ${ev ? `<li>שקלול חמשת המדדים מול מודל השערים לבד, על ${ev.combined.n.toLocaleString('he-IL')} משחקים שהמערכת לא ראתה: פגיעה ${pct(ev.combined.acc)} מול ${pct(ev.poisson.acc)}, כפול ${pct(ev.combined.top2)} מול ${pct(ev.poisson.top2)}.</li>` : ''}
          ${M ? `<li>${M.calibration.used ? 'תיקון לפי ליגה פעיל השבוע.' : 'תיקון לפי ליגה נבדק ונדחה השבוע: הוא לא שיפר את 90 הימים האחרונים.'} כל שבוע המשקלים מחושבים מחדש עם התוצאות החדשות, ומשחקים אחרונים שוקלים יותר.</li>` : ''}
        </ul>
        ${M ? learnSummary(M) : ''}</div>
    </div>
    <div class="grid2">
      <div class="panel"><h3>ההפתעות הגדולות, 30 יום אחרונים</h3>
        <p class="note">משחקים שבהם המערכת הייתה בטוחה ובכל זאת טעתה.</p>
        <div class="plist">${surprises.map(r => `<div class="prow"><div><div class="t">${esc(teamHe(r.code, r.hk))} ${r.hg}:${r.ag} ${esc(teamHe(r.code, r.ak))}</div><div class="m">${esc(leagueName(r.code))} · ${dmy(r.d)} · ניחוש ${r.pick} ב־${pct(r.conf)}</div></div><div class="r"><span class="hitmark no">✕</span></div></div>`).join('') || '<p class="note">אין.</p>'}</div></div>
      <div class="panel"><div class="section-title"><h3>תוצאות אחרונות</h3>
        <label class="field inline"><select id="tr-league"><option value="">כל הליגות</option>${codes.map(c => `<option value="${c}"${c === lg ? ' selected' : ''}>${esc(leagueName(c))}</option>`).join('')}</select></label></div>
        <div class="plist">${recent.map(r => `<div class="prow"><div><div class="t">${esc(teamHe(r.code, r.hk))} ${r.hg}:${r.ag} ${esc(teamHe(r.code, r.ak))}</div><div class="m">${esc(leagueName(r.code))} · ${dmy(r.d)} · ${oddsLine(r.P)}</div></div><div class="r"><span class="pick">${r.pick}</span><span class="hitmark ${r.hit ? 'ok' : 'no'}">${r.hit ? '✓' : '✕'}</span></div></div>`).join('')}</div></div>
    </div>`;
  const sel = $('#tr-league'); if (sel) sel.onchange = e => { S.trackLeague = e.target.value; save(); renderTrack(); };
  // frozen weeks
  const idx = await loadFrozenIndex();
  const fp = $('#frozen-panel'); if (!fp || S.tab !== 'track') return;
  if (!idx.length) { fp.innerHTML = '<h3>הניחושים הנעולים של כל שבוע</h3><p class="note">עדיין אין שבועות נעולים.</p>'; return; }
  const weeks = await Promise.all(idx.slice(0, 12).map(async f => { try { const fz = await loadFrozen(f); return { f, fz, sc: scoreFrozen(fz) }; } catch (e) { return null; } }));
  fp.innerHTML = `<h3>הניחושים הנעולים של כל שבוע</h3>
    <p class="note">בתחילת כל שבוע המערכת שומרת את הניחושים לכל המשחקים הקרובים ולא משנה אותם. אחרי המשחקים הם נבדקים מול התוצאות. זה המבחן האמיתי, בלי שום אפשרות "לתקן בדיעבד".</p>
    <div class="plist">${weeks.filter(Boolean).map(w => {
      const done = w.sc.filter(g => g.res), hits = done.filter(g => g.hit).length;
      return `<div class="prow click" data-frozen="${esc(w.f)}"><div><div class="t">שבוע ${dmy(w.fz.week)} · ננעל ב־${dmy(w.fz.made)}</div><div class="m">${w.sc.length} ניחושים · ${done.length ? `נבדקו ${done.length}` : 'המשחקים עוד לא שוחקו'}</div></div>
        <div class="r">${done.length ? `<span class="pct">${hits}/${done.length} · ${pct(hits / done.length)}</span>` : '<span class="tag">פתוח</span>'}</div></div>`;
    }).join('')}</div>`;
}
async function openFrozen(f) {
  const fz = await loadFrozen(f), sc = scoreFrozen(fz);
  const done = sc.filter(g => g.res), hits = done.filter(g => g.hit).length;
  openSheet(`<div class="panel"><h2>ניחושים נעולים · שבוע ${dmy(fz.week)}</h2>
    <p class="note">ננעל ב־${dmy(fz.made)}. ${done.length ? `פגיעה: ${hits} מתוך ${done.length} (${pct(hits / done.length)}).` : 'המשחקים עוד לא שוחקו.'}</p>
    <div class="plist">${sc.map(g => `<div class="prow"><div><div class="t">${esc(g.hn)} ${g.res ? `${g.m.hg}:${g.m.ag}` : '–'} ${esc(g.an)}</div><div class="m">${esc(leagueName(g.code))} · ${dmy(g.d)} · ${oddsLine(g.P)}</div></div>
      <div class="r"><span class="pick">${g.pick}</span>${g.res ? `<span class="hitmark ${g.hit ? 'ok' : 'no'}">${g.hit ? '✓' : '✕'}</span>` : ''}</div></div>`).join('')}</div></div>`);
}

// ---------- TABLES ----------
function renderTables() {
  const codes = PRIORITY.filter(c => DB.leagues[c] && DB.leagues[c].m.some(x => x.hg != null && x.d >= seasonStart()));
  const sel = $('#t-league');
  sel.innerHTML = codes.map(c => `<option value="${c}">${esc(leagueName(c))}</option>`).join('');
  if (!codes.includes(S.tLeague)) S.tLeague = codes[0];
  sel.value = S.tLeague;
  const L = DB.leagues[S.tLeague];
  if (!L) { $('#table-box').innerHTML = '<div class="empty">אין נתונים</div>'; return; }
  const tab = standings(L), F = fitLeague(L);
  $('#table-box').innerHTML = `<p class="note">עדכני עד ${L.lastResult ? fmtDate(L.lastResult) : '–'}. לחיצה על קבוצה פותחת פרופיל.</p>
    <div class="tbl-wrap"><table><thead><tr><th class="c">#</th><th>קבוצה</th><th class="c">מש׳</th><th class="c">נ</th><th class="c">ת</th><th class="c">ה</th><th class="c">שערים</th><th class="c">נק׳</th><th class="c">כושר</th><th class="c">התקפה</th><th class="c">הגנה</th></tr></thead><tbody>
    ${tab.map(r => `<tr class="click" data-team="${r.t}"><td class="c num">${r.pos}</td><td><span class="team">${badge(L.teams[r.t].he, L.teams[r.t].key)}<b>${esc(L.teams[r.t].he)}</b></span></td><td class="c num">${r.p}</td><td class="c num">${r.w}</td><td class="c num">${r.d}</td><td class="c num">${r.l}</td><td class="c num">${r.gf}:${r.ga}</td><td class="c num"><b>${r.pts}</b></td><td class="c"><span class="form">${r.form.map(f => `<i class="${f}">${f === 'W' ? 'נ' : f === 'D' ? 'ת' : 'ה'}</i>`).join('')}</span></td><td class="c num">${fx(F.att[r.t], 2)}</td><td class="c num">${fx(F.def[r.t], 2)}</td></tr>`).join('')}
    </tbody></table></div>`;
}
function openTeam(code, t) {
  const L = DB.leagues[code], s = teamStats(L, t);
  const next = L.m.filter(x => x.hg == null && x.d >= todayISO() && (x.h === t || x.a === t)).slice(0, 4);
  openSheet(`<div class="m-head"><div></div><div>${badge(L.teams[t].he, L.teams[t].key, true)}<h2>${esc(L.teams[t].he)}</h2><span class="mnote">${esc(leagueName(code))} · ${s.total} משחקים בנתונים</span></div><div></div></div>
    <div class="panel"><div class="stats">
      <div class="stat"><b>${s.all.w}-${s.all.d}-${s.all.l}</b><span>נ-ת-ה (${s.basisLabel})</span></div>
      <div class="stat"><b>${s.home.w}-${s.home.d}-${s.home.l}</b><span>בבית</span></div>
      <div class="stat"><b>${s.away.w}-${s.away.d}-${s.away.l}</b><span>בחוץ</span></div>
      <div class="stat"><b>${s.all.gf}:${s.all.ga}</b><span>שערים</span></div>
      <div class="stat"><b>${pct(s.all.n ? s.all.o25 / s.all.n : null)}</b><span>מעל 2.5</span></div>
      <div class="stat"><b>${pct(s.all.n ? s.all.cs / s.all.n : null)}</b><span>שער נקי</span></div></div></div>
    ${next.length ? `<div class="panel"><h3>המשחקים הבאים</h3><div class="cards">${next.map(m => card(code, m, new Set())).join('')}</div></div>` : ''}
    <div class="panel"><h3>תוצאות אחרונות</h3><div class="tbl-wrap"><table><tbody>${s.form.map(f => { const o = f.m.h === t ? f.m.a : f.m.h; return `<tr><td class="num">${fmtDate(f.m.d)}</td><td>${f.home ? 'בית' : 'חוץ'} · ${esc(L.teams[o].he)}</td><td class="num c">${f.gf}:${f.ga}</td><td class="c"><span class="form"><i class="${f.r}">${f.r === 'W' ? 'נ' : f.r === 'D' ? 'ת' : 'ה'}</i></span></td></tr>`; }).join('')}</tbody></table></div></div>`);
}

// ---------- INFO ----------
function renderInfo() {
  const M = DB.model;
  const rows = PRIORITY.map(c => {
    const L = DB.leagues[c]; if (!L) return '';
    const played = L.m.filter(x => x.hg != null).length, up = L.m.filter(x => x.hg == null && x.d >= todayISO()).length;
    return `<tr><td>${esc(leagueName(c))}</td><td class="c num">${played.toLocaleString('he-IL')}</td><td class="c num">${up}</td><td class="c num">${L.lastResult ? dmy(L.lastResult) + '.' + L.lastResult.slice(2, 4) : '–'}</td></tr>`;
  }).join('');
  $('#view-info').innerHTML = `
    <div class="page-head"><div><p class="eyebrow">שקיפות</p><h1>השיטה והנתונים</h1></div></div>
    <div class="grid2">
      <div class="panel prose"><h3>איך נקבע ניחוש</h3>
        <p>לכל משחק המערכת מחשבת חמישה מדדים: <b>כוח</b> (התקפה והגנה מ־3 השנים האחרונות, משחקים חדשים שוקלים יותר), <b>מצב בטבלה</b> (נקודות למשחק העונה), <b>כושר</b> (6 משחקים אחרונים), <b>בית/חוץ</b> ו<b>ראש בראש</b> (10 המפגשים האחרונים). המדדים משוקללים לסיכויים ל־1, X ו־2, ומשולבים עם מודל שערים (פואסון/דיקסון-קולס) שנותן גם צפי שערים ותוצאות סבירות.</p>
        <p>הטופס: המערכת בודקת כל שילוב של כפולים ומשולשים שנכנס בתקציב הטורים, ובוחרת את מה שנותן את הסיכוי הגבוה ביותר לפגוע בכל הטופס.</p></div>
      <div class="panel prose"><h3>איך המערכת לומדת</h3>
        <p>פעם בשבוע: הנתונים מתעדכנים, המשקלים מחושבים מחדש על כל התוצאות (משחקים אחרונים שוקלים יותר), ונבדק תיקון לפי ליגה, שנשאר רק אם הוא משפר את הדיוק על 90 הימים האחרונים. הניחושים לשבוע הקרוב ננעלים ונבדקים מול התוצאות בשבוע שאחרי.</p>
        ${M ? `<p>עדכון אחרון: ${dmy(M.updated)}. בדיקה על ${M.eval.combined.n.toLocaleString('he-IL')} משחקים שהמערכת לא ראתה: ניחוש בודד ${pct(M.eval.combined.acc)}, כפול ${pct(M.eval.combined.top2)}.</p>` : ''}</div>
    </div>
    <div class="panel"><h3>מצב הנתונים</h3>
      <div class="tbl-wrap"><table><thead><tr><th>ליגה</th><th class="c">משחקים בנתונים</th><th class="c">משחקים קרובים</th><th class="c">תוצאה אחרונה</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="note">מקורות: openfootball (מאז 2010), ESPN (ליגות אירופה ומפעלים), TheSportsDB (ליגת העל והליגה הלאומית). הנתונים נבנו ב־${DB.built ? dmy(DB.built) : '–'}.</p></div>
    <div class="panel prose"><h3>חשוב לדעת</h3>
      <p>זו תחזית סטטיסטית, לא ודאות. המודל לא יודע על פציעות, הרחקות, החלפת מאמן או רוטציה, ולכן כדאי לעבור על חדשות הקבוצות לפני שליחת טופס. הימורים מגיל 18. קבע מראש סכום שאתה מוכן להפסיד.</p></div>`;
}

// ---------- sheet ----------
function openSheet(html) {
  $('#sheet-body').innerHTML = html;
  $('#sheet').hidden = false; $('#sheet-back').hidden = false;
  $('#sheet-body').scrollTop = 0; document.body.style.overflow = 'hidden';
}
function closeSheet() { $('#sheet').hidden = true; $('#sheet-back').hidden = true; document.body.style.overflow = ''; }

// ---------- events ----------
function bind() {
  document.addEventListener('click', e => {
    const g = e.target.closest('[data-go]');
    if (g) { e.preventDefault(); closeSheet(); go(g.dataset.go); return; }
    if (e.target.closest('#load-toto')) { loadToto(); return; }
    const fr = e.target.closest('[data-frozen]'); if (fr) { openFrozen(fr.dataset.frozen); return; }
    if (e.target.closest('#btn-save')) { saveCurrentForm(false); return; }
    if (e.target.closest('#btn-export')) { exportSaved(); return; }
    if (e.target.closest('#btn-import')) { importSaved(); return; }
    const sv = e.target.closest('[data-saved]'); if (sv) { openSaved(sv.dataset.saved); return; }
    const add = e.target.closest('[data-addm]');
    if (add) { const [c, i] = add.dataset.addm.split('|'); addEntry(entryFrom(c, DB.leagues[c].m[+i])); if (S.tab === 'week') renderWeek(); return; }
    const mt = e.target.closest('[data-match]');
    if (mt) { const [c, i] = mt.dataset.match.split('|'); const m = DB.leagues[c].m[+i]; openMatch(c, m.h, m.a, m); }
  });
  window.addEventListener('hashchange', () => { const h = location.hash.slice(1); if (VIEWS.includes(h) && h !== S.tab) go(h, false); });
  $('#sheet-close').onclick = closeSheet; $('#sheet-back').onclick = closeSheet;
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });
  $('#btn-official').onclick = loadToto;
  $('#btn-autofill').onclick = autofill;
  $('#btn-add-manual').onclick = openAddDialog;
  $('#btn-copy').onclick = copyForm;
  $('#btn-clear').onclick = () => {
    if (!S.form.length) return;
    const b = $('#btn-clear');
    if (b.dataset.confirm) { S.form = []; save(); renderForm(); b.textContent = 'ניקוי'; delete b.dataset.confirm; toast('הטופס נוקה'); }
    else { b.dataset.confirm = 1; b.textContent = 'לחץ שוב לאישור'; setTimeout(() => { b.textContent = 'ניקוי'; delete b.dataset.confirm; }, 3000); }
  };
  $('#prize-box').addEventListener('change', e => {
    const t = e.target.closest('[data-tier]'); if (!t) return;
    S.prizes = S.prizes || {};
    if (S.prizes[t.dataset.tier] === t.value) return;
    S.prizes[t.dataset.tier] = t.value;
    const rec = (S.saved || []).find(x => x.sig === formSig(S.form)); if (rec) rec.prizes = { ...rec.prizes, [t.dataset.tier]: t.value };
    save(); setTimeout(renderForm, 0); // redraw after the input has finished losing focus
  });
  $('#sys-mode').onchange = e => { S.sys.mode = e.target.value; save(); renderForm(); };
  $('#sys-cols').onchange = e => { S.sys.cols = +e.target.value; save(); renderForm(); };
  $('#sys-d').oninput = e => { S.sys.d = Math.max(0, Math.min(16, +e.target.value || 0)); save(); renderForm(); };
  $('#sys-t').oninput = e => { S.sys.t = Math.max(0, Math.min(16, +e.target.value || 0)); save(); renderForm(); };
  $('#sys-price').oninput = e => { S.sys.price = Math.max(0, +e.target.value || 0); save(); renderForm(); };
  $('#slip').onclick = e => {
    const box = e.target.closest('.box'); if (box) return toggleBox(+box.dataset.i, box.dataset.o);
    const del = e.target.closest('[data-del]'); if (del) { S.form.splice(+del.dataset.del, 1); save(); return renderForm(); }
    const up = e.target.closest('[data-up]');
    if (up) { const i = +up.dataset.up; if (i > 0) { [S.form[i - 1], S.form[i]] = [S.form[i], S.form[i - 1]]; save(); renderForm(); } return; }
    const op = e.target.closest('[data-open]');
    if (op) { const ent = S.form[+op.dataset.open], r = resolveEntry(ent); if (r.manual) toast('משחק ידני: אין נתונים סטטיסטיים.'); else openMatch(r.code, r.h, r.a, r.m || { d: ent.d }); }
  };
  document.querySelectorAll('[data-range]').forEach(b => { b.onclick = () => { S.week.range = b.dataset.range; save(); renderWeek(); }; });
  $('#w-from').onchange = $('#w-to').onchange = () => { S.week.range = 'custom'; S.week.from = $('#w-from').value; S.week.to = $('#w-to').value; save(); renderWeek(); };
  $('#league-chips').onclick = e => {
    const b = e.target.closest('[data-lg]'); if (!b) return;
    const avail = PRIORITY.filter(c => DB.leagues[c] && DB.leagues[c].m.length);
    const on = new Set(S.week.leagues || avail);
    on.has(b.dataset.lg) ? on.delete(b.dataset.lg) : on.add(b.dataset.lg);
    S.week.leagues = [...on]; save(); renderWeek();
  };
  $('#t-league').onchange = e => { S.tLeague = e.target.value; save(); renderTables(); };
  $('#table-box').onclick = e => { const tr = e.target.closest('[data-team]'); if (tr) openTeam(S.tLeague, +tr.dataset.team); };
}

function setStatus() {
  const latest = Object.values(DB.leagues).map(L => L.lastResult).filter(Boolean).sort().pop();
  const el = $('#status');
  const ok = Object.values(DB.live).some(x => x.ok);
  el.textContent = `${ok ? 'מעודכן חי · ' : ''}תוצאות עד ${latest ? dmy(latest) : '–'}${DB.model ? ` · למידה ${dmy(DB.model.updated)}` : ''}`;
  el.className = 'fresh' + (latest && daysBetween(latest, todayISO()) > 6 ? ' warn' : '');
}

let refreshing = false;
async function refreshAll(force) {
  if (refreshing) return; refreshing = true;
  if (force) resetEspn();
  const codes = PRIORITY.filter(c => !c.startsWith('isr') && DB.leagues[c]);
  let i = 0;
  const worker = async () => { while (i < codes.length) { const c = codes[i++]; try { await refreshLeague(c, force); } catch (e) { /* recorded in DB.live */ } } };
  await Promise.all([worker(), worker(), worker()]);
  refreshing = false; PCACHE.clear();
  setStatus();
  if (Object.values(DB.live).some(x => x.ok)) render();
}

async function loadExtras() {
  const get = async (u) => { try { const r = await fetch(u, { cache: 'no-cache' }); return r.ok ? await r.json() : null; } catch (e) { return null; } };
  const [pred, toto] = await Promise.all([get('data/predictions.json'), get('data/toto_week.json')]);
  EXTRA.pred = pred;
  if (toto && toto.games && toto.games.length && (!toto.until || toto.until >= todayISO())) EXTRA.toto = toto;
}

(async function start() {
  document.documentElement.lang = 'he'; document.documentElement.dir = 'rtl';
  bind();
  try { await loadBundled(); await loadExtras(); }
  catch (e) { $('#status').textContent = 'טעינת הנתונים נכשלה. רענן את הדף.'; return; }
  setStatus();
  const h = location.hash.slice(1);
  go(VIEWS.includes(h) ? h : (S.tab || 'home'), false);
  refreshAll(false).then(pollLive);
  setInterval(pollLive, 60000);
})();

// Live scores: every minute while the page is open, for today's games (ESPN leagues).
async function pollLive() {
  if (document.hidden) return;
  const t = todayISO();
  const codes = PRIORITY.filter(c => !c.startsWith('isr') && DB.leagues[c] && DB.leagues[c].m.some(x => x.d === t && x.hg == null));
  if (!codes.length) return;
  const r = await refreshToday(codes);
  if (r.changed) { PCACHE.clear(); setStatus(); if (!$('#sheet').hidden) return; render(); }
}
