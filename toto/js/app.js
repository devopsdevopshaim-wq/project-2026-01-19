// UI: Toto form, weekly fixtures, match deep-dive, tables, data status.
'use strict';

const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pct = x => (x == null || isNaN(x) ? '–' : Math.round(x * 100) + '%');
const fx = (x, d = 1) => (x == null || isNaN(x) ? '–' : (+x).toFixed(d));
const PRIORITY = ['isr.1', 'en.1', 'es.1', 'it.1', 'de.1', 'fr.1', 'ucl', 'uel', 'uecl', 'en.2', 'nl.1', 'pt.1', 'tr.1', 'be.1', 'sco.1'];
const DEFAULT_P = { '1': 0.45, 'X': 0.28, '2': 0.27 }; // league-wide average when no data

const S = Object.assign({
  tab: 'form', form: [],
  sys: { mode: 'cols', cols: 16, d: 3, t: 1, price: 3 },
  week: { range: 'week', leagues: null },
  tLeague: 'en.1',
}, lsGet('toto.state') || {});
function save() { lsSet('toto.state', S); }

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, 2600);
}

// ---------- helpers ----------
const WD = new Intl.DateTimeFormat('he-IL', { weekday: 'short', timeZone: 'UTC' });
function fmtDate(d, t) {
  if (!d) return '';
  const dt = new Date(d + 'T12:00:00Z');
  return `${WD.format(dt)} ${+d.slice(8, 10)}.${+d.slice(5, 7)}${t ? ' · ' + t : ''}`;
}
function tName(code, i) { const L = DB.leagues[code]; return (L && L.teams[i]) ? L.teams[i].he : '?'; }
function leagueName(code) { return (LEAGUES[code] || [code])[0]; }
function hasData(code) { const L = DB.leagues[code]; return L && L.m.some(x => x.hg != null); }

function resolveEntry(e) { // form entry -> {code,h,a,m}
  if (e.manual) return { manual: true };
  const L = DB.leagues[e.code];
  if (!L) return { manual: true };
  const h = L.keyIdx[e.hk], a = L.keyIdx[e.ak];
  if (h == null || a == null) return { manual: true };
  const m = L.m.find(x => x.h === h && x.a === a && Math.abs(daysBetween(x.d, e.d)) <= 4) || null;
  return { code: e.code, h, a, m };
}

function entryProbs(e) {
  const r = resolveEntry(e);
  if (r.manual || !hasData(r.code)) return { p: DEFAULT_P, known: false, r };
  const asOf = r.m && r.m.hg != null ? r.m.d : todayISO();
  const pr = predict(r.code, r.h, r.a, asOf);
  return { p: probsOf(pr), pr, known: true, r };
}

function staleInfo(code) {
  const L = DB.leagues[code];
  if (!L || !L.lastResult) return null;
  return daysBetween(L.lastResult, todayISO()) > 45 ? L.lastResult : null;
}
function staleTag(code) {
  const d = staleInfo(code);
  return d ? `<span class="tag low">נתונים עד ${d.split('-').reverse().join('.')}</span>` : '';
}

function bestPick(p) { return Object.entries(p).sort((a, b) => b[1] - a[1])[0][0]; }
function outcomeOf(m) { return m && m.hg != null ? (m.hg > m.ag ? '1' : m.hg === m.ag ? 'X' : '2') : null; }

// ---------- tabs ----------
function setTab(tab) {
  S.tab = tab; save();
  document.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === tab));
  document.querySelectorAll('.view').forEach(v => { v.hidden = v.id !== 'view-' + tab; });
  render();
}

function render() {
  if (S.tab === 'form') renderForm();
  else if (S.tab === 'week') renderWeek();
  else if (S.tab === 'tables') renderTables();
  else renderInfo();
}

// ---------- FORM ----------
const COL_OPTIONS = [1, 2, 3, 4, 6, 8, 9, 12, 16, 18, 24, 27, 32, 36, 48, 54, 64, 72, 81, 96, 108, 128, 144, 162, 192, 216, 243, 256, 288, 324, 384, 432, 486, 512, 576, 648, 729, 768, 864, 972, 1024, 1296, 1458, 1728, 2187, 2304, 2592, 3456, 4374, 5184, 6561];

function computeForm() {
  const items = S.form.map(e => ({ e, ...entryProbs(e) }));
  const probList = items.map(x => x.p);
  // locked (user) picks fixed; optimise the rest
  const free = [], lockedCols = items.reduce((s, x) => s * (x.e.pick && x.e.pick.length ? x.e.pick.length : 1), 1);
  items.forEach((x, i) => { if (!(x.e.pick && x.e.pick.length)) free.push(i); });
  let picks = items.map(x => (x.e.pick && x.e.pick.length ? x.e.pick : null));
  const freeProbs = free.map(i => probList[i]);
  if (free.length) {
    let res;
    if (S.sys.mode === 'cols') {
      res = optimiseByColumns(freeProbs, Math.max(1, Math.floor(S.sys.cols / lockedCols))).picks;
    } else {
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

function renderForm() {
  const sel = $('#sys-cols');
  if (!sel.options.length) sel.innerHTML = COL_OPTIONS.map(c => `<option value="${c}">${c} טורים</option>`).join('');
  sel.value = S.sys.cols; $('#sys-mode').value = S.sys.mode; $('#sys-d').value = S.sys.d; $('#sys-t').value = S.sys.t; $('#sys-price').value = S.sys.price;
  $('#f-cols').hidden = S.sys.mode !== 'cols'; $('#f-d').hidden = $('#f-t').hidden = S.sys.mode === 'cols';

  const n = S.form.length;
  $('#form-sub').textContent = n ? `${n} מתוך 16 משחקים בטופס` : 'הוסף את המשחקים מהטופס הרשמי, או מלא אוטומטית מהמשחקים הקרובים.';
  if (!n) {
    $('#slip').innerHTML = `<li class="empty">הטופס ריק. לחץ "מילוי מהמשחקים הקרובים" לטופס לדוגמה, או "הוספת משחק" כדי להזין את משחקי הטופס הרשמי.</li>`;
    $('#sys-summary').innerHTML = '';
    return;
  }
  const F = computeForm();
  const nd = F.picks.filter(p => p.length === 2).length, nt = F.picks.filter(p => p.length === 3).length;
  const cost = F.cols * (+S.sys.price || 0);
  const exp = F.hits.reduce((a, b) => a + b, 0);
  const played = F.items.filter(x => x.r.m && x.r.m.hg != null);
  const correct = played.filter(x => F.picks[F.items.indexOf(x)].includes(outcomeOf(x.r.m))).length;
  $('#sys-summary').innerHTML = `
    <div class="kpi hl"><b>${F.cols.toLocaleString('he-IL')}</b><span>טורים · ${nd} כפולים · ${nt} משולשים</span></div>
    <div class="kpi"><b>₪${cost.toLocaleString('he-IL', { maximumFractionDigits: 1 })}</b><span>עלות משוערת</span></div>
    <div class="kpi"><b>${fx(exp)}</b><span>צפי פגיעות מתוך ${n}</span></div>
    <div class="kpi"><b>${pctSmall(F.atLeast(n))}</b><span>סיכוי לכל ה־${n}</span></div>
    <div class="kpi"><b>${pctSmall(F.atLeast(n - 1))}</b><span>סיכוי ל־${n - 1} ומעלה</span></div>
    <div class="kpi"><b>${pctSmall(F.atLeast(n - 2))}</b><span>סיכוי ל־${n - 2} ומעלה</span></div>
    ${played.length ? `<div class="kpi"><b>${correct}/${played.length}</b><span>פגיעות במשחקים שהסתיימו</span></div>` : ''}`;

  $('#slip').innerHTML = F.items.map((x, i) => {
    const e = x.e, r = x.r, pk = F.picks[i];
    const home = r.manual ? esc(e.manual.home) : esc(tName(r.code, r.h));
    const away = r.manual ? esc(e.manual.away) : esc(tName(r.code, r.a));
    const res = outcomeOf(r.m);
    const lowRel = x.known && x.pr.reliability < 6;
    const tags = [
      !x.known ? '<span class="tag low">ללא נתונים – סמן ידנית</span>' : '',
      lowRel ? '<span class="tag low">מעט נתונים</span>' : '',
      !r.manual ? staleTag(r.code) : '',
      res ? `<span class="tag ${pk.includes(res) ? 'hit' : 'miss'}">${r.m.hg}:${r.m.ag} ${pk.includes(res) ? 'פגיעה' : 'החטאה'}</span>` : '',
    ].join('');
    const boxes = ['1', 'X', '2'].map(o => `<button class="box${pk.includes(o) ? ' on' : ''}${e.pick && e.pick.includes(o) ? ' lock' : ''}${res === o ? ' res' : ''}" data-i="${i}" data-o="${o}" aria-pressed="${pk.includes(o)}" aria-label="${o}"><span class="o">${o}</span><span class="p">${x.known ? pct(x.p[o]) : '–'}</span></button>`).join('');
    return `<li class="row">
      <span class="n">${i + 1}</span>
      <div class="teams" data-open="${i}">
        <b>${home} – ${away}</b>
        <div class="meta"><span>${r.manual ? 'משחק ידני' : esc(leagueName(r.code))}</span><span>${fmtDate(e.d, r.m && r.m.t)}</span>${tags}</div>
      </div>
      <div class="side">
        <div class="boxes">${boxes}</div>
        <div class="row-tools">
          <button class="icon-btn" data-up="${i}" aria-label="העבר למעלה">▲</button>
          <button class="icon-btn" data-del="${i}" aria-label="הסר">✕</button>
        </div>
      </div>
    </li>`;
  }).join('');
}
function pctSmall(x) { if (x >= 0.1) return Math.round(x * 100) + '%'; if (x >= 0.001) return (x * 100).toFixed(2) + '%'; return '1:' + Math.round(1 / Math.max(x, 1e-12)).toLocaleString('he-IL'); }

function toggleBox(i, o) {
  const e = S.form[i];
  const F = computeForm();
  let cur = e.pick && e.pick.length ? e.pick.slice() : F.picks[i].slice();
  if (!e.pick) cur = [o]; // first tap: take control with a single pick
  else if (cur.includes(o)) cur = cur.filter(x => x !== o);
  else cur.push(o);
  cur.sort((a, b) => '1X2'.indexOf(a) - '1X2'.indexOf(b));
  e.pick = cur.length ? cur : null;
  save(); renderForm();
  if (!e.pick) toast('המשחק חזר לבחירה אוטומטית');
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

function entryFrom(code, m) {
  const L = DB.leagues[code];
  return { code, hk: L.teams[m.h].key, ak: L.teams[m.a].key, d: m.d };
}

function autofill() {
  const from = todayISO(), to = addDays(from, 7);
  const list = upcoming(from, to, PRIORITY.filter(hasData)).filter(x => x.m.hg == null);
  const pickN = [];
  for (const code of PRIORITY) {
    for (const x of list) if (x.code === code && pickN.length < 16) pickN.push(x);
    if (pickN.length >= 16) break;
  }
  if (!pickN.length) { toast('לא נמצאו משחקים בשבוע הקרוב בנתונים הזמינים'); return; }
  pickN.sort((a, b) => (a.m.d + (a.m.t || '')).localeCompare(b.m.d + (b.m.t || '')));
  S.form = pickN.map(x => entryFrom(x.code, x.m));
  save(); renderForm();
  toast(`נוספו ${S.form.length} משחקים. החלף אותם במשחקי הטופס הרשמי לפי הצורך.`);
}

function formText() {
  const F = computeForm();
  const lines = F.items.map((x, i) => {
    const r = x.r;
    const h = r.manual ? x.e.manual.home : tName(r.code, r.h), a = r.manual ? x.e.manual.away : tName(r.code, r.a);
    return `${i + 1}. ${h} – ${a}:  ${F.picks[i].join('/')}`;
  });
  lines.push('', `טורים: ${F.cols} | עלות: ₪${(F.cols * (+S.sys.price || 0)).toLocaleString('he-IL')}`, 'נבנה בטוטו חכם');
  return lines.join('\n');
}

function copyForm() {
  if (!S.form.length) { toast('הטופס ריק'); return; }
  const txt = formText();
  const show = () => {
    openSheet(`<div class="panel"><h2>הטופס כטקסט</h2><textarea class="copybox" id="copytxt" readonly>${esc(txt)}</textarea><p class="note">סמן את הטקסט והעתק אותו (למשל לוואטסאפ).</p></div>`);
    const ta = $('#copytxt'); ta.focus(); ta.select();
  };
  try {
    navigator.clipboard.writeText(txt).then(() => toast('הטופס הועתק'), show);
  } catch (e) { show(); }
}

// manual add dialog
function openAddDialog() {
  const codes = PRIORITY.filter(c => DB.leagues[c] && DB.leagues[c].teams.length);
  openSheet(`<div class="panel">
    <h2>הוספת משחק לטופס</h2>
    <p class="note">בחר ליגה וקבוצות כפי שמופיעות בטופס הרשמי. אם הליגה או הקבוצה לא ברשימה, השתמש בהזנה חופשית.</p>
    <div class="grid2">
      <label class="field"><span>ליגה</span><select id="ad-league">${codes.map(c => `<option value="${c}">${esc(leagueName(c))}</option>`).join('')}</select></label>
      <label class="field"><span>תאריך</span><input type="date" id="ad-date" value="${todayISO()}"></label>
      <label class="field"><span>קבוצת בית</span><select id="ad-home"></select></label>
      <label class="field"><span>קבוצת חוץ</span><select id="ad-away"></select></label>
    </div>
    <div id="ad-fixtures"></div>
    <div class="slip-actions"><button class="btn primary" id="ad-ok">הוספה</button></div>
    <hr style="border:0;border-top:1px solid var(--line);width:100%">
    <h3>הזנה חופשית (בלי סטטיסטיקה)</h3>
    <div class="grid2">
      <label class="field"><span>בית</span><input id="ad-fh" placeholder="למשל: הפועל עכו"></label>
      <label class="field"><span>חוץ</span><input id="ad-fa" placeholder="למשל: מכבי יפו"></label>
    </div>
    <div class="slip-actions"><button class="btn" id="ad-free">הוספה ידנית</button></div>
  </div>`);
  const fill = () => {
    const code = $('#ad-league').value, L = DB.leagues[code];
    const season = `${seasonStartYear(todayISO())}-07-01`;
    const cur = new Set(); L.m.forEach(x => { if (x.d >= season) { cur.add(x.h); cur.add(x.a); } });
    const idx = (cur.size ? [...cur] : L.teams.map((_, i) => i)).sort((a, b) => L.teams[a].he.localeCompare(L.teams[b].he, 'he'));
    const opts = idx.map(i => `<option value="${i}">${esc(L.teams[i].he)}</option>`).join('');
    $('#ad-home').innerHTML = opts; $('#ad-away').innerHTML = opts;
    if (idx.length > 1) $('#ad-away').value = idx[1];
    const next = upcoming(todayISO(), addDays(todayISO(), 10), [code]).filter(x => x.m.hg == null).slice(0, 12);
    $('#ad-fixtures').innerHTML = next.length ? `<div class="note">משחקים קרובים בליגה (לחיצה מוסיפה):</div><div class="range">${next.map((x, k) => `<button class="chip" data-fx="${k}">${esc(tName(code, x.m.h))} – ${esc(tName(code, x.m.a))} · ${fmtDate(x.m.d)}</button>`).join('')}</div>` : '';
    $('#ad-fixtures').onclick = ev => {
      const b = ev.target.closest('[data-fx]'); if (!b) return;
      addEntry(entryFrom(code, next[+b.dataset.fx].m));
    };
  };
  $('#ad-league').onchange = fill; fill();
  $('#ad-ok').onclick = () => {
    const code = $('#ad-league').value, L = DB.leagues[code];
    const h = +$('#ad-home').value, a = +$('#ad-away').value;
    if (h === a) { toast('בחר שתי קבוצות שונות'); return; }
    addEntry({ code, hk: L.teams[h].key, ak: L.teams[a].key, d: $('#ad-date').value || todayISO() });
  };
  $('#ad-free').onclick = () => {
    const h = $('#ad-fh').value.trim(), a = $('#ad-fa').value.trim();
    if (!h || !a) { toast('הזן שתי קבוצות'); return; }
    addEntry({ manual: { home: h, away: a }, d: $('#ad-date').value || todayISO() });
  };
}
function addEntry(e) {
  if (S.form.length >= 16) { toast('בטופס כבר 16 משחקים'); return; }
  S.form.push(e); save(); renderForm();
  toast(`נוסף משחק ${S.form.length} מתוך 16`);
}

// ---------- WEEK ----------
function weekRange() {
  const t = todayISO();
  const dow = new Date(t + 'T12:00:00Z').getUTCDay(); // 0 Sun
  if (S.week.range === 'weekend') { const fri = addDays(t, (5 - dow + 7) % 7); return [fri < t ? t : fri, addDays(fri, 3)]; }
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
  const byDay = {};
  list.forEach(x => (byDay[x.m.d] = byDay[x.m.d] || []).push(x));
  const inForm = new Set(S.form.filter(e => !e.manual).map(e => `${e.code}|${e.hk}|${e.ak}`));
  $('#week-list').innerHTML = Object.entries(byDay).map(([d, xs]) => `
    <div class="day"><h2>${fmtDate(d)} · ${xs.length} משחקים</h2><div class="cards">${xs.map(x => card(x.code, x.m, inForm)).join('')}</div></div>`).join('');
}

function card(code, m, inForm) {
  const L = DB.leagues[code];
  const known = hasData(code);
  const asOf = m.hg != null ? m.d : todayISO();
  const p = known ? predict(code, m.h, m.a, asOf) : null;
  const P = p ? probsOf(p) : null;
  const k = `${code}|${L.teams[m.h].key}|${L.teams[m.a].key}`;
  const mid = m.hg != null ? `${m.hg}:${m.ag}` : (m.t || 'נגד');
  return `<article class="card">
    <div class="lg"><span>${esc(leagueName(code))} ${staleTag(code)}</span><span>${m.status && m.hg == null && m.state !== 'pre' ? esc(m.status) : ''}</span></div>
    <div class="vs" data-match="${code}|${L.m.indexOf(m)}"><b>${esc(L.teams[m.h].he)}</b><span class="mid">${esc(mid)}</span><b>${esc(L.teams[m.a].he)}</b></div>
    ${P ? probBar(P) : '<div class="note">אין מספיק נתונים לתחזית</div>'}
    <div class="card-foot">
      <span>${P ? `ניחוש: <span class="pick">${bestPick(P)}</span> · צפי ${fx(p.lh)}–${fx(p.la)}` : ''}</span>
      ${m.hg == null ? (inForm.has(k) ? '<span class="tag hit">בטופס</span>' : `<button class="btn small" data-addm="${code}|${L.m.indexOf(m)}">+ לטופס</button>`) : ''}
    </div>
  </article>`;
}

function probBar(P) {
  const w = o => Math.max(P[o] * 100, 4).toFixed(1);
  return `<div><div class="bar"><span class="b1" style="width:${w('1')}%">1 ${pct(P['1'])}</span><span class="bx" style="width:${w('X')}%">X ${pct(P['X'])}</span><span class="b2" style="width:${w('2')}%">2 ${pct(P['2'])}</span></div></div>`;
}

// ---------- MATCH DEEP-DIVE ----------
function openMatch(code, h, a, m) {
  const L = DB.leagues[code];
  const asOf = m && m.hg != null ? m.d : todayISO();
  const known = hasData(code);
  const p = known ? predict(code, h, a, asOf) : null;
  const P = p && probsOf(p);
  const sh = teamStats(L, h, asOf), sa = teamStats(L, a, asOf);
  const hh = h2h(L, h, a, asOf);
  const tab = standings(L, asOf);
  const ph = tab.find(r => r.t === h), pa = tab.find(r => r.t === a);
  const H = L.teams[h].he, A = L.teams[a].he;
  const F = fitLeague(L, asOf);

  const statBlock = (s, label) => `
    <div class="stats">
      <div class="stat"><b>${s.all.n}</b><span>משחקים (${s.basisLabel})</span></div>
      <div class="stat"><b>${s.all.w}-${s.all.d}-${s.all.l}</b><span>נ-ת-ה</span></div>
      <div class="stat"><b>${fx(s.all.n ? s.all.gf / s.all.n : null, 2)}</b><span>שערי זכות למשחק</span></div>
      <div class="stat"><b>${fx(s.all.n ? s.all.ga / s.all.n : null, 2)}</b><span>שערי חובה למשחק</span></div>
      <div class="stat"><b>${pct(s.all.n ? s.all.o25 / s.all.n : null)}</b><span>מעל 2.5 שערים</span></div>
      <div class="stat"><b>${pct(s.all.n ? s.all.btts / s.all.n : null)}</b><span>שתי הקבוצות הבקיעו</span></div>
      <div class="stat"><b>${pct(s.all.n ? s.all.cs / s.all.n : null)}</b><span>שער נקי</span></div>
      <div class="stat"><b>${label === 'home' ? `${s.home.w}-${s.home.d}-${s.home.l}` : `${s.away.w}-${s.away.d}-${s.away.l}`}</b><span>${label === 'home' ? 'מאזן בבית' : 'מאזן בחוץ'}</span></div>
    </div>`;

  const formChips = s => `<span class="form">${s.form.slice(0, 6).map(f => `<i class="${f.r}" title="${esc(fmtDate(f.m.d))} ${f.home ? 'בית' : 'חוץ'} ${f.gf}:${f.ga}">${f.r === 'W' ? 'נ' : f.r === 'D' ? 'ת' : 'ה'}</i>`).join('')}</span>`;
  const lastList = (s, t) => `<div class="tbl-wrap"><table><tbody>${s.form.map(f => {
    const opp = f.m.h === t ? f.m.a : f.m.h;
    return `<tr><td class="num">${fmtDate(f.m.d)}</td><td>${f.home ? 'בית' : 'חוץ'} מול ${esc(L.teams[opp].he)}</td><td class="num c">${f.gf}:${f.ga}</td><td class="c"><span class="form"><i class="${f.r}">${f.r === 'W' ? 'נ' : f.r === 'D' ? 'ת' : 'ה'}</i></span></td></tr>`;
  }).join('') || '<tr><td>אין משחקים</td></tr>'}</tbody></table></div>`;

  const cmpRow = (label, x, y) => `<tr><td>${x}</td><td>${label}</td><td>${y}</td></tr>`;
  const per = (s, k) => (s.n ? s[k] / s.n : null);

  const html = `
    <div class="m-head">
      <div><h2>${esc(H)}</h2><div class="pos">${ph ? `מקום ${ph.pos} · ${ph.pts} נק׳` : ''}</div></div>
      <div class="mid">${m && m.hg != null ? `${m.hg}:${m.ag}` : 'נגד'}<div class="note">${esc(leagueName(code))}<br>${m ? fmtDate(m.d, m.t) : ''}</div></div>
      <div><h2>${esc(A)}</h2><div class="pos">${pa ? `מקום ${pa.pos} · ${pa.pts} נק׳` : ''}</div></div>
    </div>

    ${P ? `<div class="panel">
      <h3>תחזית המערכת</h3>
      ${probBar(P)}
      <div class="stats">
        <div class="stat"><b>${bestPick(P)}</b><span>ניחוש מומלץ</span></div>
        <div class="stat"><b dir="ltr">${fx(p.lh, 1)}–${fx(p.la, 1)}</b><span>שערים צפויים (בית–חוץ)</span></div>
        <div class="stat"><b>${pct(p.o25)}</b><span>מעל 2.5 שערים</span></div>
        <div class="stat"><b>${pct(p.btts)}</b><span>שתי הקבוצות יבקיעו</span></div>
        <div class="stat"><b>${pct(P['1'] + P['X'])}</b><span>כפול 1X</span></div>
        <div class="stat"><b>${pct(P['X'] + P['2'])}</b><span>כפול X2</span></div>
      </div>
      <div><div class="note">תוצאות סבירות:</div><div class="scores">${p.top.map(s => `<span>${s[0]}:${s[1]} · ${pct(s[2])}</span>`).join('')}</div></div>
      ${staleInfo(code) ? `<p class="note"><b>נתוני הליגה הזו מעודכנים רק עד ${staleInfo(code).split('-').reverse().join('.')}.</b> התחזית מבוססת על הכוח של הקבוצות אז, ולא על העונה הנוכחית. בדוק כושר עדכני לפני שאתה סומך עליה.</p>` : ''}
      ${p.reliability < 6 ? '<p class="note">שים לב: לאחת הקבוצות מעט משחקים בנתונים (קבוצה עולה או ליגה חדשה במערכת). התחזית פחות אמינה.</p>' : ''}
    </div>` : '<div class="panel"><p>אין מספיק נתונים לליגה הזו לתחזית סטטיסטית.</p></div>'}

    <div class="panel">
      <h3>ניתוח</h3>
      <ul class="analysis">${analysis(H, A, P, p, sh, sa, hh, ph, pa, L).map(t => `<li>${t}</li>`).join('')}</ul>
    </div>

    <div class="panel">
      <h3>ראש בראש${hh.since ? ` · מאז ${+hh.since.slice(0, 4)} בנתונים` : ''}</h3>
      ${hh.all.n ? `
      <div class="h2h-big">
        <div class="w"><b>${hh.all.w}</b><span>ניצחונות ${esc(H)}</span></div>
        <div class="d"><b>${hh.all.d}</b><span>תיקו</span></div>
        <div class="l"><b>${hh.all.l}</b><span>ניצחונות ${esc(A)}</span></div>
      </div>
      <div class="stats">
        <div class="stat"><b>${hh.all.n}</b><span>מפגשים</span></div>
        <div class="stat"><b>${hh.all.gf}:${hh.all.ga}</b><span>שערים (${esc(H)}:${esc(A)})</span></div>
        <div class="stat"><b>${fx((hh.all.gf + hh.all.ga) / hh.all.n, 2)}</b><span>שערים למשחק</span></div>
        <div class="stat"><b>${pct(hh.all.o25 / hh.all.n)}</b><span>מעל 2.5</span></div>
        <div class="stat"><b>${hh.venue.w}-${hh.venue.d}-${hh.venue.l}</b><span>כש${esc(H)} בבית</span></div>
      </div>
      <div class="tbl-wrap"><table><thead><tr><th>תאריך</th><th>בית</th><th class="c">תוצאה</th><th>חוץ</th></tr></thead><tbody>
        ${hh.list.slice(0, 15).map(x => `<tr><td class="num">${x.d.split('-').reverse().join('.')}</td><td>${esc(L.teams[x.h].he)}</td><td class="num c">${x.hg}:${x.ag}</td><td>${esc(L.teams[x.a].he)}</td></tr>`).join('')}
      </tbody></table></div>` : '<p class="note">לא נמצאו מפגשים קודמים בליגה הזו בנתונים.</p>'}
    </div>

    <div class="panel">
      <h3>השוואה</h3>
      <div class="tbl-wrap"><table class="cmp"><thead><tr><th class="c">${esc(H)}</th><th class="c"></th><th class="c">${esc(A)}</th></tr></thead><tbody>
        ${cmpRow('מקום בטבלה', ph ? ph.pos : '–', pa ? pa.pos : '–')}
        ${cmpRow('נקודות למשחק', fx(per(sh.all, 'pts'), 2), fx(per(sa.all, 'pts'), 2))}
        ${cmpRow('5 אחרונים', formChips(sh), formChips(sa))}
        ${cmpRow('נקודות ב־5 האחרונים', sh.last5.pts, sa.last5.pts)}
        ${cmpRow('בית / חוץ (נ-ת-ה)', `${sh.home.w}-${sh.home.d}-${sh.home.l}`, `${sa.away.w}-${sa.away.d}-${sa.away.l}`)}
        ${cmpRow('שערים למשחק בבית / בחוץ', fx(per(sh.home, 'gf'), 2), fx(per(sa.away, 'gf'), 2))}
        ${cmpRow('ספיגה למשחק בבית / בחוץ', fx(per(sh.home, 'ga'), 2), fx(per(sa.away, 'ga'), 2))}
        ${cmpRow('מדד התקפה (1.00 = ממוצע ליגה)', fx(F.att[h], 2), fx(F.att[a], 2))}
        ${cmpRow('מדד הגנה (נמוך = טוב)', fx(F.def[h], 2), fx(F.def[a], 2))}
        ${cmpRow('רצף ללא הפסד', sh.streak.unbeaten, sa.streak.unbeaten)}
        ${cmpRow('רצף ללא ניצחון', sh.streak.winless, sa.streak.winless)}
      </tbody></table></div>
    </div>

    <div class="grid2">
      <div class="panel"><h3>${esc(H)}</h3>${statBlock(sh, 'home')}<div class="note">10 משחקים אחרונים</div>${lastList(sh, h)}</div>
      <div class="panel"><h3>${esc(A)}</h3>${statBlock(sa, 'away')}<div class="note">10 משחקים אחרונים</div>${lastList(sa, a)}</div>
    </div>
    ${m && m.hg == null && !S.form.some(e => !e.manual && e.code === code && e.hk === L.teams[h].key && e.ak === L.teams[a].key) ? `<div class="slip-actions"><button class="btn primary" id="m-add">הוספה לטופס</button></div>` : ''}
  `;
  openSheet(html);
  const b = $('#m-add'); if (b) b.onclick = () => { addEntry(entryFrom(code, m)); closeSheet(); };
}

function analysis(H, A, P, p, sh, sa, hh, ph, pa, L) {
  const out = [];
  if (P) {
    const best = bestPick(P);
    const top = P[best];
    if (best === 'X') out.push(`התחזית נוטה לתיקו (${pct(P.X)}). משחק צמוד — מומלץ לשקול כפול.`);
    else {
      const fav = best === '1' ? H : A;
      if (top >= 0.6) out.push(`<b>${esc(fav)}</b> פייבוריטית ברורה עם ${pct(top)} לניצחון.`);
      else if (top >= 0.45) out.push(`<b>${esc(fav)}</b> קלה לפייבוריטית (${pct(top)}), אבל יש מקום להפתעה.`);
      else out.push(`אין פייבוריטית ברורה (הסיכוי הגבוה ביותר ${pct(top)} ל־${esc(fav)}). מועמד טוב לכפול או למשולש.`);
    }
    if (P.X >= 0.3) out.push(`סיכוי התיקו גבוה מהרגיל (${pct(P.X)}).`);
    const g = p.lh + p.la;
    out.push(g >= 3 ? `צפוי משחק פתוח: ${fx(g)} שערים בממוצע, ${pct(p.o25)} למעל 2.5.` : g <= 2.2 ? `צפוי משחק סגור: ${fx(g)} שערים בממוצע, ${pct(1 - p.o25)} לעד 2 שערים.` : `צפי שערים בינוני: ${fx(g)} למשחק.`);
  }
  if (ph && pa && ph.p >= 3) {
    const diff = pa.pos - ph.pos;
    if (Math.abs(diff) >= 6) out.push(`פער בטבלה: ${esc(diff > 0 ? H : A)} במקום ${Math.min(ph.pos, pa.pos)} מול מקום ${Math.max(ph.pos, pa.pos)}.`);
  }
  const formLine = (name, s) => {
    if (s.streak.wins >= 3) return `${esc(name)} ברצף של ${s.streak.wins} ניצחונות.`;
    if (s.streak.unbeaten >= 5) return `${esc(name)} ב־${s.streak.unbeaten} משחקים ללא הפסד.`;
    if (s.streak.losses >= 3) return `${esc(name)} ברצף של ${s.streak.losses} הפסדים.`;
    if (s.streak.winless >= 5) return `${esc(name)} לא ניצחה ב־${s.streak.winless} המשחקים האחרונים.`;
    return null;
  };
  [formLine(H, sh), formLine(A, sa)].filter(Boolean).forEach(x => out.push(x));
  if (sh.home.n >= 4) {
    const r = sh.home.w / sh.home.n;
    if (r >= 0.65) out.push(`${esc(H)} חזקה בבית: ${sh.home.w} ניצחונות ב־${sh.home.n} משחקי בית.`);
    else if (r <= 0.2) out.push(`${esc(H)} חלשה בבית: רק ${sh.home.w} ניצחונות ב־${sh.home.n} משחקי בית.`);
  }
  if (sa.away.n >= 4) {
    const r = sa.away.w / sa.away.n;
    if (r >= 0.5) out.push(`${esc(A)} טובה בחוץ: ${sa.away.w} ניצחונות ב־${sa.away.n} משחקי חוץ.`);
    else if (sa.away.l / sa.away.n >= 0.65) out.push(`${esc(A)} מתקשה בחוץ: ${sa.away.l} הפסדים ב־${sa.away.n} משחקי חוץ.`);
  }
  if (hh.all.n >= 3) {
    out.push(`בכל המפגשים בנתונים: ${hh.all.w} ניצחונות ל${esc(H)}, ${hh.all.d} תיקו, ${hh.all.l} ניצחונות ל${esc(A)}.`);
    if (hh.recent.n >= 3 && hh.recent.n !== hh.all.n) out.push(`ב־8 השנים האחרונות: ${hh.recent.w}-${hh.recent.d}-${hh.recent.l} (נ-ת-ה מנקודת המבט של ${esc(H)}).`);
    if (hh.all.o25 / hh.all.n >= 0.65) out.push(`מפגשים עתירי שערים: ${pct(hh.all.o25 / hh.all.n)} מהם הסתיימו מעל 2.5.`);
    const last = hh.list[0];
    out.push(`המפגש האחרון (${last.d.split('-').reverse().join('.')}): ${esc(L.teams[last.h].he)} ${last.hg}:${last.ag} ${esc(L.teams[last.a].he)}.`);
  } else out.push('אין מספיק מפגשים קודמים בין הקבוצות כדי להסיק מגמה.');
  return out;
}

// ---------- TABLES ----------
function renderTables() {
  const codes = PRIORITY.filter(c => DB.leagues[c] && DB.leagues[c].m.some(x => x.hg != null));
  const sel = $('#t-league');
  sel.innerHTML = codes.map(c => `<option value="${c}">${esc(leagueName(c))}</option>`).join('');
  if (!codes.includes(S.tLeague)) S.tLeague = codes[0];
  sel.value = S.tLeague;
  const L = DB.leagues[S.tLeague];
  if (!L) { $('#table-box').innerHTML = '<div class="empty">אין נתונים</div>'; return; }
  const tab = standings(L);
  const played = tab.some(r => r.p > 0);
  const F = fitLeague(L);
  $('#table-box').innerHTML = `
    <p class="note">${played ? `טבלת העונה הנוכחית לפי התוצאות שבמערכת (עדכני עד ${L.lastResult ? fmtDate(L.lastResult) : '–'}).` : 'העונה טרם התחילה בנתונים.'} לחיצה על קבוצה פותחת פרופיל.</p>
    <div class="tbl-wrap"><table><thead><tr><th class="c">#</th><th>קבוצה</th><th class="c">מש׳</th><th class="c">נ</th><th class="c">ת</th><th class="c">ה</th><th class="c">שערים</th><th class="c">נק׳</th><th class="c">כושר</th><th class="c">התקפה</th><th class="c">הגנה</th></tr></thead><tbody>
    ${tab.map(r => `<tr class="click" data-team="${r.t}"><td class="c num">${r.pos}</td><td>${esc(L.teams[r.t].he)}</td><td class="c num">${r.p}</td><td class="c num">${r.w}</td><td class="c num">${r.d}</td><td class="c num">${r.l}</td><td class="c num">${r.gf}:${r.ga}</td><td class="c num"><b>${r.pts}</b></td><td class="c"><span class="form">${r.form.map(f => `<i class="${f}">${f === 'W' ? 'נ' : f === 'D' ? 'ת' : 'ה'}</i>`).join('')}</span></td><td class="c num">${fx(F.att[r.t], 2)}</td><td class="c num">${fx(F.def[r.t], 2)}</td></tr>`).join('')}
    </tbody></table></div>`;
}

function openTeam(code, t) {
  const L = DB.leagues[code];
  const s = teamStats(L, t);
  const next = L.m.filter(x => x.hg == null && x.d >= todayISO() && (x.h === t || x.a === t)).slice(0, 5);
  openSheet(`<div class="panel">
    <h2>${esc(L.teams[t].he)}</h2><div class="note">${esc(leagueName(code))} · ${s.total} משחקים בנתונים</div>
    <div class="stats">
      <div class="stat"><b>${s.all.w}-${s.all.d}-${s.all.l}</b><span>נ-ת-ה (${s.basisLabel})</span></div>
      <div class="stat"><b>${s.home.w}-${s.home.d}-${s.home.l}</b><span>בבית</span></div>
      <div class="stat"><b>${s.away.w}-${s.away.d}-${s.away.l}</b><span>בחוץ</span></div>
      <div class="stat"><b>${s.all.gf}:${s.all.ga}</b><span>שערים</span></div>
      <div class="stat"><b>${pct(s.all.n ? s.all.o25 / s.all.n : null)}</b><span>מעל 2.5</span></div>
      <div class="stat"><b>${pct(s.all.n ? s.all.cs / s.all.n : null)}</b><span>שער נקי</span></div>
    </div></div>
    ${next.length ? `<div class="panel"><h3>המשחקים הבאים</h3><div class="cards">${next.map(m => card(code, m, new Set())).join('')}</div></div>` : ''}
    <div class="panel"><h3>תוצאות אחרונות</h3><div class="tbl-wrap"><table><tbody>${s.form.map(f => { const o = f.m.h === t ? f.m.a : f.m.h; return `<tr><td class="num">${fmtDate(f.m.d)}</td><td>${f.home ? 'בית' : 'חוץ'} מול ${esc(L.teams[o].he)}</td><td class="num c">${f.gf}:${f.ga}</td><td class="c"><span class="form"><i class="${f.r}">${f.r === 'W' ? 'נ' : f.r === 'D' ? 'ת' : 'ה'}</i></span></td></tr>`; }).join('')}</tbody></table></div></div>`);
}

// ---------- INFO ----------
function renderInfo() {
  const rows = PRIORITY.map(c => {
    const L = DB.leagues[c]; const lv = DB.live[c];
    const played = L ? L.m.filter(x => x.hg != null).length : 0;
    const up = L ? L.m.filter(x => x.hg == null && x.d >= todayISO()).length : 0;
    const live = !lv ? '<span class="note">לא נבדק</span>' : lv.ok ? '<span class="ok">מחובר</span>' : '<span class="err">לא זמין</span>';
    return `<tr><td>${esc(leagueName(c))}</td><td class="c num">${played.toLocaleString('he-IL')}</td><td class="c num">${up}</td><td class="c num">${L && L.lastResult ? L.lastResult.split('-').reverse().join('.') : '–'}</td><td class="c">${LEAGUES[c][2] ? 'כן' : '–'}</td><td class="c">${live}</td></tr>`;
  }).join('');
  $('#info-box').innerHTML = `<div class="info-grid">
    <h1>נתונים ושיטה</h1>
    <div class="panel">
      <h3>מצב הנתונים</h3>
      <div class="tbl-wrap"><table><thead><tr><th>ליגה</th><th class="c">משחקים שהסתיימו</th><th class="c">משחקים קרובים</th><th class="c">תוצאה אחרונה</th><th class="c">היסטוריה מ־2010</th><th class="c">עדכון חי בדפדפן</th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="slip-actions"><button class="btn primary" id="btn-refresh">רענון נתונים חיים</button></div>
      <p class="note">הנתונים המובנים באפליקציה: openfootball (תוצאות מאז 2010 בליגות הגדולות) ו־ESPN (תוצאות ולוח משחקים עדכניים, סקוטלנד, ליגת האלופות, הליגה האירופית והקונפרנס). הנתונים נבנו ב־${DB.built ? DB.built.split('-').reverse().join('.') : '–'}. בנוסף, האפליקציה מנסה לעדכן את החודש הנוכחי והבא ישירות מ־ESPN כשהיא פתוחה.</p>
      <p class="note"><b>ליגת העל:</b> ESPN הפסיקה לכסות את הכדורגל הישראלי במאי 2025, ולא מצאתי מקור פתוח אחר שזמין לאפליקציה. לכן לליגת העל יש היסטוריה וראש בראש עד מאי 2025 בלבד, בלי לוח משחקים עדכני. משחקים ישראליים מוסיפים לטופס ידנית; התחזית עבורם מסומנת "נתונים עד 24.05.2025". הליגה הלאומית לא זמינה בכלל, ולכן מוסיפים אותה בהזנה חופשית ומסמנים ניחוש ידני.</p>
    </div>
    <div class="panel">
      <h3>איך עובדת התחזית</h3>
      <p>לכל ליגה המערכת מחשבת מדד התקפה ומדד הגנה לכל קבוצה מתוך התוצאות של 3 השנים האחרונות. משחקים חדשים שוקלים יותר (מחצית משקל כל 8 חודשים). מזה נגזר מספר השערים הצפוי לכל צד (כולל יתרון ביתיות של אותה ליגה), ומודל פואסון עם תיקון דיקסון-קולס נותן הסתברות לכל תוצאה, ל־1/X/2, למעל 2.5 ולשתי הקבוצות יבקיעו. כשיש לפחות 4 מפגשים ב־8 השנים האחרונות, ראש בראש מזיז את התחזית עד 15%.</p>
      <p>בבדיקה לאחור על עונות 2023–2025 בחמש הליגות הגדולות (3,484 משחקים, בכל משחק רק עם מידע שהיה ידוע לפניו): הניחוש הבודד המומלץ צדק ב־51%–55% מהמשחקים, וכפול מומלץ ב־78%–80%. ניחוש אקראי צודק ב־33%.</p>
    </div>
    <div class="panel">
      <h3>בניית הטופס</h3>
      <p>במצב "לפי מספר טורים" המערכת בודקת כל שילוב של כפולים ומשולשים שנכנס במספר הטורים, ובוחרת את השילוב והמשחקים שנותנים את הסיכוי הגבוה ביותר לפגוע בכל הטופס. כפולים ומשולשים הולכים למשחקים הכי לא ודאיים. ניחוש שסימנת ידנית נשאר קבוע. מחיר הטור הוא הגדרה שלך: בדוק אותו בטופס הרשמי.</p>
      <p>המערכת לא מקבלת את הטופס הרשמי של ווינר אוטומטית. מלא את 16 המשחקים לפי הטופס של המחזור (הוספת משחק → ליגה וקבוצות), או השתמש במילוי האוטומטי כנקודת התחלה.</p>
    </div>
    <div class="panel">
      <h3>חשוב לדעת</h3>
      <p>זו תחזית סטטיסטית ולא ודאות. המודל לא יודע על פציעות, הרחקות, החלפת מאמן או רוטציה. מעבר מהיר על חדשות הקבוצות לפני שליחת הטופס יכול לשנות החלטה. הימור הוא בגיל 18 ומעלה. הגדר מראש סכום שאתה מוכן להפסיד.</p>
    </div>
  </div>`;
  $('#btn-refresh').onclick = () => refreshAll(true);
}

// ---------- sheet ----------
function openSheet(html) {
  $('#sheet-body').innerHTML = html;
  $('#sheet').hidden = false; $('#sheet-back').hidden = false;
  $('#sheet-body').scrollTop = 0;
  document.body.style.overflow = 'hidden';
}
function closeSheet() { $('#sheet').hidden = true; $('#sheet-back').hidden = true; document.body.style.overflow = ''; }

// ---------- events ----------
function bind() {
  document.querySelectorAll('.tabs button').forEach(b => { b.onclick = () => setTab(b.dataset.tab); });
  $('#sheet-close').onclick = closeSheet; $('#sheet-back').onclick = closeSheet;
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });
  $('#btn-autofill').onclick = autofill;
  $('#btn-add-manual').onclick = openAddDialog;
  $('#btn-copy').onclick = copyForm;
  $('#btn-clear').onclick = () => {
    if (!S.form.length) return;
    const b = $('#btn-clear');
    if (b.dataset.confirm) { S.form = []; save(); renderForm(); b.textContent = 'ניקוי'; delete b.dataset.confirm; toast('הטופס נוקה'); }
    else { b.dataset.confirm = 1; b.textContent = 'לחץ שוב לאישור'; setTimeout(() => { b.textContent = 'ניקוי'; delete b.dataset.confirm; }, 3000); }
  };
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
    if (op) {
      const ent = S.form[+op.dataset.open], r = resolveEntry(ent);
      if (r.manual) toast('משחק ידני: אין נתונים סטטיסטיים. סמן ניחוש בעצמך.');
      else openMatch(r.code, r.h, r.a, r.m || { d: ent.d });
    }
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
  const matchClick = e => {
    const add = e.target.closest('[data-addm]');
    if (add) { const [c, i] = add.dataset.addm.split('|'); addEntry(entryFrom(c, DB.leagues[c].m[+i])); if (S.tab === 'week') renderWeek(); return; }
    const mt = e.target.closest('[data-match]');
    if (mt) { const [c, i] = mt.dataset.match.split('|'); const m = DB.leagues[c].m[+i]; openMatch(c, m.h, m.a, m); }
  };
  $('#week-list').onclick = matchClick;
  $('#sheet-body').addEventListener('click', matchClick);
  $('#t-league').onchange = e => { S.tLeague = e.target.value; save(); renderTables(); };
  $('#table-box').onclick = e => { const tr = e.target.closest('[data-team]'); if (tr) openTeam(S.tLeague, +tr.dataset.team); };
}

function setStatus() {
  const codes = Object.keys(DB.live);
  const ok = codes.filter(c => DB.live[c].ok).length;
  const latest = Object.values(DB.leagues).map(L => L.lastResult).filter(Boolean).sort().pop();
  const el = $('#status');
  if (!codes.length) { el.textContent = `נתונים מובנים · תוצאה אחרונה ${latest ? fmtDate(latest) : '–'} · מתחבר לעדכון חי…`; el.className = 'status'; return; }
  if (ok) { el.textContent = `עדכון חי פעיל (${ok} ליגות) · תוצאה אחרונה ${latest ? fmtDate(latest) : '–'}`; el.className = 'status'; }
  else {
    const old = latest && daysBetween(latest, todayISO()) > 4;
    el.textContent = `תוצאות עד ${latest ? fmtDate(latest) : '–'} (מובנות באפליקציה)${old ? '. העדכון החי לא זמין כאן, ולכן תוצאות אחרונות חסרות.' : ''}`;
    el.className = old ? 'status warn' : 'status';
  }
}

let refreshing = false;
async function refreshAll(force) {
  if (refreshing) return; refreshing = true;
  if (force) resetEspn();
  setStatus();
  const codes = PRIORITY.filter(c => c !== 'isr.1' && DB.leagues[c]);
  let i = 0;
  const worker = async () => { while (i < codes.length) { const c = codes[i++]; try { await refreshLeague(c, force); } catch (e) { /* noted in DB.live */ } } };
  await Promise.all([worker(), worker(), worker()]);
  refreshing = false;
  setStatus(); render();
  if (force) toast(Object.values(DB.live).some(x => x.ok) ? 'הנתונים עודכנו' : 'העדכון החי לא זמין מכאן');
}

(async function start() {
  document.documentElement.lang = 'he'; document.documentElement.dir = 'rtl';
  bind();
  try { await loadBundled(); }
  catch (e) { $('#status').textContent = 'טעינת הנתונים נכשלה. רענן את הדף.'; $('#status').className = 'status warn'; return; }
  setStatus();
  setTab(S.tab || 'form');
  refreshAll(false);
})();
