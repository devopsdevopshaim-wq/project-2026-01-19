(function () {
  'use strict';
  const M = window.Momento, { esc, uid } = M.util, F = M.fmt, C = M.const;
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const view = $('#view');
  const SESSION = 'momento.admin';
  const STATUS_CHIP = { lead: 'accent', quote: 'warn', confirmed: 'ok', done: 'info', cancelled: 'muted' };
  const ORDER_CHIP = { new: 'muted', printing: 'warn', ready: 'ok', delivered: 'info' };
  const SHOP_CHIP = { new: 'accent', paid: 'info', production: 'warn', shipped: 'ok', delivered: 'muted', cancelled: 'err' };
  const STATUS_COLOR = { lead: '#c36f86', quote: '#c98a12', confirmed: '#2f8a5b', done: '#3d6fa8', cancelled: '#9c8f85' };
  const TITLES = { dashboard: 'לוח בקרה', events: 'אירועים ולידים', calendar: 'יומן אירועים', queue: 'תור הדפסה', shop: 'הזמנות מהחנות', clients: 'לקוחות', inventory: 'מלאי חומרי גלם', catalog: 'מוצרים, מחירים וחבילות', staff: 'צוות', settings: 'הגדרות' };
  let current = 'dashboard', state = { evFilter: 'all', evSearch: '', calMonth: null, queueEvent: null, shopFilter: 'open', sound: true };
  let lastOrderIds = new Set(M.db.list('orders').map((o) => o.id));

  /* ---------- כניסה ---------- */
  function authed() { try { return sessionStorage.getItem(SESSION) === '1'; } catch (e) { return false; } }
  function showApp() { $('#login').hidden = true; $('#shell').hidden = false; route(); }
  $('#loginForm').onsubmit = (e) => {
    e.preventDefault();
    if ($('#pin').value === String(M.db.settings().pin)) { try { sessionStorage.setItem(SESSION, '1'); } catch (er) {} showApp(); }
    else { M.toast('קוד שגוי', 'err'); $('#pin').value = ''; $('#pin').focus(); }
  };
  $('#logout').onclick = () => { try { sessionStorage.removeItem(SESSION); } catch (e) {} location.reload(); };
  $('#burger').onclick = () => $('#side').classList.toggle('open');
  $('#sideNav').onclick = () => $('#side').classList.remove('open');

  /* ---------- ניתוב ---------- */
  addEventListener('hashchange', route);
  function route() {
    const [v, arg] = location.hash.slice(1).split('/');
    current = TITLES[v] ? v : 'dashboard';
    if (current === 'queue' && arg) state.queueEvent = arg;
    $$('#sideNav a').forEach((a) => a.classList.toggle('on', a.dataset.v === current));
    $('#vTitle').textContent = TITLES[current];
    $('#vActions').innerHTML = '';
    render();
  }
  function render() { badges(); $('#brandName').textContent = M.db.settings().brand; (V[current] || V.dashboard)(); }
  function badges() {
    const leads = M.db.list('events').filter((e) => e.status === 'lead').length;
    const q = M.db.list('orders').filter((o) => o.status === 'new' || o.status === 'printing').length;
    const sh = M.db.list('shop').filter((o) => o.status === 'new' || o.status === 'paid').length;
    const inv = M.db.get('inventory', {}), min = M.db.get('minStock', {});
    const low = Object.keys(inv).filter((k) => inv[k] < (min[k] || 0)).length;
    $('#nLeads').textContent = leads || ''; $('#nQueue').textContent = q || ''; $('#nShop').textContent = sh || ''; $('#nStock').textContent = low || '';
  }
  const actions = (html) => { $('#vActions').innerHTML = html; return $('#vActions'); };

  /* ---------- כלים ---------- */
  const events = () => M.db.list('events').sort((a, b) => (a.date < b.date ? -1 : 1));
  const pName = (id) => (M.db.product(id) || {}).name || id;
  const pkgName = (id) => (M.db.packages().find((k) => k.id === id) || {}).name || '—';
  const photoOf = (o) => (o.photoId ? M.photos.get(o.photoId) : Promise.resolve(M.sample(o.sample || 0)));
  const appUrl = (code) => new URL('../app/?e=' + code, location.href).href;
  const waLink = (phone, text) => 'https://wa.me/972' + String(phone || '').replace(/\D/g, '').replace(/^0/, '') + '?text=' + encodeURIComponent(text || '');
  const shopTotal = (o) => (o.status === 'cancelled' ? 0 : +o.total || 0);
  function qrSvg(text, cell = 5) {
    if (typeof window.qrcode !== 'function') return `<div class="empty">QR לא נטען (אין חיבור). הקישור: ${esc(text)}</div>`;
    const q = window.qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: cell, margin: 2, scalable: true });
  }
  function modal(title, html, wide) {
    const bg = document.createElement('div'); bg.className = 'modal-bg';
    bg.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="modal-head"><h3>${esc(title)}</h3><button class="x" aria-label="סגירה">×</button></div><div class="mb">${html}</div></div>`;
    const close = () => { bg.remove(); document.removeEventListener('keydown', key); };
    const key = (e) => { if (e.key === 'Escape') close(); };
    bg.addEventListener('mousedown', (e) => { if (e.target === bg) close(); });
    bg.querySelector('.x').onclick = close;
    document.addEventListener('keydown', key);
    document.body.appendChild(bg);
    const body = bg.querySelector('.mb'); body.close = close; return body;
  }
  function confirmBox(text) { return window.confirm(text); }
  function printDoc(title, body, css = '') {
    const w = window.open('', '_blank');
    if (!w) { M.toast('אפשרו חלונות קופצים להדפסה', 'err'); return; }
    w.document.write(`<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>${esc(title)}</title>
      <link href="https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@700;900&family=Heebo:wght@400;600;800&display=swap" rel="stylesheet">
      <style>body{font-family:Heebo,Arial,sans-serif;color:#2a211c;margin:0}${css}</style></head><body>${body}
      <script>window.onload=()=>setTimeout(()=>{window.print()},600)<\/script></body></html>`);
    w.document.close();
  }
  function beep() {
    if (!state.sound) return;
    try { const a = new (window.AudioContext || window.webkitAudioContext)(); [0, 0.18].forEach((t, i) => { const o = a.createOscillator(), g = a.createGain(); o.frequency.value = i ? 1046 : 784; g.gain.setValueAtTime(0.0001, a.currentTime + t); g.gain.exponentialRampToValueAtTime(0.25, a.currentTime + t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + t + 0.16); o.connect(g).connect(a.destination); o.start(a.currentTime + t); o.stop(a.currentTime + t + 0.2); }); } catch (e) {}
  }

  /* ---------- מסכים ---------- */
  const V = {};

  V.dashboard = function () {
    const ev = events(), today = M.util.today(), now = new Date();
    const mKey = today.slice(0, 7);
    const evRevenue = (pred) => ev.filter((e) => (e.status === 'confirmed' || e.status === 'done') && pred(e)).reduce((a, e) => a + (+e.price || 0), 0);
    const shopRev = (pred) => M.db.list('shop').filter((o) => pred(new Date(o.createdAt))).reduce((a, o) => a + shopTotal(o), 0);
    const monthRev = evRevenue((e) => e.date.startsWith(mKey)) + shopRev((d) => d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth());
    const upcoming = ev.filter((e) => e.date >= today && (e.status === 'confirmed' || e.status === 'quote'));
    const in30 = upcoming.filter((e) => e.date <= M.util.addDays(30)).length;
    const leads = ev.filter((e) => e.status === 'lead');
    const queue = M.db.list('orders').filter((o) => o.status === 'new' || o.status === 'printing');
    const pipeline = ev.filter((e) => e.status === 'lead' || e.status === 'quote').reduce((a, e) => a + (+e.price || 0), 0);
    const balance = ev.filter((e) => e.status === 'confirmed').reduce((a, e) => a + Math.max(0, (+e.price || 0) - (+e.deposit || 0)), 0);

    // הכנסות לפי חודש – 6 חודשים
    const months = [];
    for (let i = 5; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); months.push({ k: M.util.iso(d).slice(0, 7), label: d.toLocaleDateString('he-IL', { month: 'short' }), y: d.getFullYear(), m: d.getMonth() }); }
    months.forEach((x) => { x.ev = evRevenue((e) => e.date.startsWith(x.k)); x.sh = shopRev((d) => d.getFullYear() === x.y && d.getMonth() === x.m); });
    const max = Math.max(1000, ...months.map((x) => x.ev + x.sh));
    const W = 600, H = 220, bw = 54, gap = (W - 40 - bw * 6) / 5;
    const bars = months.map((x, i) => { const X = 20 + i * (bw + gap), he = (x.ev / max) * 160, hs = (x.sh / max) * 160; return `
      <g><title>${x.label}: אירועים ${F.money(x.ev)}, חנות ${F.money(x.sh)}</title>
      <rect x="${X}" y="${185 - he}" width="${bw}" height="${he}" rx="4" fill="#b5653a"/>
      <rect x="${X}" y="${185 - he - hs - (hs ? 2 : 0)}" width="${bw}" height="${hs}" rx="4" fill="#6f9886"/>
      <text x="${X + bw / 2}" y="205" text-anchor="middle">${x.label}</text>
      <text x="${X + bw / 2}" y="${178 - he - hs}" text-anchor="middle" style="font-weight:600;fill:#2a211c">${x.ev + x.sh ? '₪' + Math.round((x.ev + x.sh) / 1000) + 'K' : ''}</text></g>`; }).join('');

    const inv = M.db.get('inventory', {}), min = M.db.get('minStock', {});
    const low = Object.keys(inv).filter((k) => inv[k] < (min[k] || 0));
    actions(`<a class="btn btn-primary btn-sm" href="#events" id="qNew">+ אירוע חדש</a>`).querySelector('#qNew').onclick = (e) => { e.preventDefault(); editEvent(); };

    view.innerHTML = `
      <div class="kpis">
        <div class="kpi hl"><small>הכנסות החודש</small><b>${F.money(monthRev)}</b><span>אירועים מאושרים + חנות</span></div>
        <div class="kpi"><small>אירועים ב־30 הימים הקרובים</small><b>${in30}</b><span>${upcoming.length} סה״כ בעתיד</span></div>
        <div class="kpi"><small>לידים פתוחים</small><b>${leads.length}</b><span>שווי בצנרת ${F.money(pipeline)}</span></div>
        <div class="kpi"><small>יתרה לגבייה</small><b>${F.money(balance)}</b><span>מאירועים מאושרים</span></div>
        <div class="kpi"><small>בתור הדפסה עכשיו</small><b>${queue.length}</b><span><a href="#queue">לתור ←</a></span></div>
      </div>
      <div class="cols">
        <div>
          <section class="panel"><h2>הכנסות ב־6 החודשים האחרונים <span style="font-size:.8rem;font-weight:500"><span class="chip accent">אירועים</span> <span class="chip ok" style="background:#e3efe9;color:#2c4a3e">חנות</span></span></h2>
            <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="גרף הכנסות חודשי"><line x1="10" x2="${W - 10}" y1="185" y2="185" stroke="#e6dcd0"/>${bars}</svg></section>
          <section class="panel"><h2>אירועים קרובים <a href="#calendar">ליומן</a></h2><div class="list">${upcoming.slice(0, 6).map(evLine).join('') || '<div class="empty">אין אירועים קרובים</div>'}</div></section>
        </div>
        <div>
          ${low.length ? `<section class="panel" style="border-color:#f0c9c3"><h2>⚠️ מלאי נמוך <a href="#inventory">למלאי</a></h2><div class="list">${low.map((k) => `<div class="li"><div class="t"><b>${esc(pName(k))}</b><small>נשארו ${inv[k]} (מינימום ${min[k]})</small></div></div>`).join('')}</div></section>` : ''}
          <section class="panel"><h2>לידים שמחכים לטיפול <a href="#events">לכל הלידים</a></h2><div class="list">${leads.slice(0, 5).map(evLine).join('') || '<div class="empty">אין לידים פתוחים 👏</div>'}</div></section>
          <section class="panel"><h2>פעילות אחרונה</h2><div class="feed">${M.db.list('activity').slice(0, 10).map((a) => `<div><time>${F.ago(a.t)}</time><span>${esc(a.text)}</span></div>`).join('')}</div></section>
        </div>
      </div>`;
    bindEvLines();
  };
  function evLine(e) {
    const d = new Date(e.date + 'T12:00');
    return `<div class="li click" data-ev="${e.id}" style="cursor:pointer"><div class="d"><b>${d.getDate()}</b><small>${d.toLocaleDateString('he-IL', { month: 'short' })}</small></div>
      <div class="t"><b>${esc(e.client)}</b><small>${esc(e.type)} · ${esc(e.venue || 'מקום לא נקבע')} · ${e.guests || '?'} אורחים</small></div><span class="chip ${STATUS_CHIP[e.status]}">${C.EVENT_STATUS[e.status]}</span></div>`;
  }
  function bindEvLines() { $$('[data-ev]', view).forEach((el) => (el.onclick = () => openEvent(el.dataset.ev))); }

  V.events = function () {
    actions(`<button class="btn btn-primary btn-sm" id="newEv">+ אירוע / ליד חדש</button>`).querySelector('#newEv').onclick = () => editEvent();
    const f = state.evFilter, s = state.evSearch.trim();
    const all = events();
    const counts = Object.keys(C.EVENT_STATUS).reduce((o, k) => ((o[k] = all.filter((e) => e.status === k).length), o), {});
    let list = all.filter((e) => (f === 'all' ? true : f === 'upcoming' ? e.date >= M.util.today() && e.status !== 'cancelled' : e.status === f));
    if (s) list = list.filter((e) => [e.client, e.phone, e.venue, e.code, e.type].join(' ').includes(s));
    if (f !== 'upcoming' && f !== 'lead') list.reverse();
    view.innerHTML = `
      <div class="toolbar"><div class="seg" id="seg">
        ${[['all', 'הכול'], ['upcoming', 'קרובים'], ...Object.entries(C.EVENT_STATUS)].map(([k, l]) => `<button data-f="${k}" class="${f === k ? 'on' : ''}">${l}${counts[k] != null ? ` (${counts[k]})` : ''}</button>`).join('')}
      </div><input class="input" id="evSearch" placeholder="חיפוש לפי שם, טלפון, אולם או קוד" value="${esc(s)}"></div>
      <section class="panel tbl-wrap"><table class="tbl"><thead><tr><th>תאריך</th><th>לקוח</th><th>סוג</th><th>מקום</th><th>חבילה</th><th>מחיר</th><th>שולם</th><th>סטטוס</th><th>מקור</th></tr></thead><tbody>
        ${list.map((e) => `<tr class="click" data-ev="${e.id}"><td class="num">${F.date(e.date)}</td><td><b>${esc(e.client)}</b><small>${esc(e.phone)}</small></td><td>${esc(e.type)}</td><td>${esc(e.venue || '—')}</td><td>${esc(pkgName(e.pkg))}</td><td class="num">${F.money(e.price)}</td><td class="num">${F.money(e.deposit)}</td><td><span class="chip ${STATUS_CHIP[e.status]}">${C.EVENT_STATUS[e.status]}</span></td><td><small>${esc(e.source || 'ידני')}</small></td></tr>`).join('') || '<tr><td colspan="9" class="empty">לא נמצאו אירועים</td></tr>'}
      </tbody></table></section>`;
    $('#seg').onclick = (e) => { const b = e.target.closest('[data-f]'); if (b) { state.evFilter = b.dataset.f; V.events(); } };
    const si = $('#evSearch'); si.oninput = () => { state.evSearch = si.value; const pos = si.selectionStart; V.events(); const n = $('#evSearch'); n.focus(); n.setSelectionRange(pos, pos); };
    bindEvLines();
  };

  /* כרטיס אירוע */
  async function openEvent(id) {
    const e = M.db.find('events', id); if (!e) return;
    const orders = M.db.list('orders').filter((o) => o.eventId === id);
    const byProd = {}; orders.forEach((o) => (byProd[o.product] = (byProd[o.product] || 0) + 1));
    const pkg = M.db.packages().find((k) => k.id === e.pkg);
    const cost = orders.reduce((a, o) => a + ((M.db.product(o.product) || {}).eventCost || 0), 0);
    const url = appUrl(e.code);
    const b = modal(`${e.client} – ${e.type}`, `
      <div class="ev-grid">
        <div>
          <p><span class="chip ${STATUS_CHIP[e.status]}">${C.EVENT_STATUS[e.status]}</span> &nbsp; ${F.dateLong(e.date)} ${esc(e.time || '')}</p>
          <p><b>מקום:</b> ${esc(e.venue || '—')}<br><b>טלפון:</b> <a href="tel:${esc(e.phone)}">${esc(e.phone)}</a>${e.email ? ` · ${esc(e.email)}` : ''}<br><b>אורחים:</b> ${e.guests || '—'} · <b>חבילה:</b> ${esc(pkgName(e.pkg))}${pkg ? ` (${pkg.units} מזכרות)` : ''}<br><b>צוות:</b> ${esc((e.staff || []).join(', ') || 'לא שובץ')}<br><b>מוצרים באירוע:</b> ${(e.products || []).map(pName).join(', ')}<br><b>טקסט במסגרת:</b> ${esc(e.frameText || '—')}</p>
          ${e.notes ? `<p class="note" style="background:var(--bg2);padding:10px;border-radius:10px">${esc(e.notes)}</p>` : ''}
          <div class="panel" style="margin:12px 0"><div class="money-row"><span>מחיר כולל</span><b>${F.money(e.price)}</b></div><div class="money-row"><span>מקדמה ששולמה</span><b>${F.money(e.deposit)}</b></div><div class="money-row"><span>יתרה</span><b>${F.money((+e.price || 0) - (+e.deposit || 0))}</b></div>
          <div class="money-row"><span>מזכרות שהודפסו</span><b>${orders.length}${pkg ? ' / ' + pkg.units : ''}</b></div><div class="money-row" style="border:0"><span>עלות חומרים משוערת</span><b>${F.money(cost)}</b></div>
          ${orders.length ? `<p style="margin:8px 0 0">${Object.entries(byProd).map(([k, n]) => `<span class="chip">${esc(pName(k))}: ${n}</span>`).join(' ')}</p>` : ''}</div>
          <label class="field"><span>שינוי סטטוס</span><select class="input" id="stSel">${Object.entries(C.EVENT_STATUS).map(([k, l]) => `<option value="${k}" ${k === e.status ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        </div>
        <div class="qr-box"><b>קישור לאורחים</b>${qrSvg(url)}<code>${esc(e.code)}</code><a href="${esc(url)}" target="_blank">${esc(url)}</a>
          <div class="btn-row" style="justify-content:center"><button class="btn btn-soft btn-sm" id="copyUrl">העתקת קישור</button><button class="btn btn-soft btn-sm" id="sign">שלט QR לשולחנות</button></div></div>
      </div>
      <div class="btn-row">
        <button class="btn btn-primary btn-sm" id="edit">עריכה</button>
        <a class="btn btn-dark btn-sm" href="#queue/${e.id}" id="toQ">תור הדפסה (${orders.length})</a>
        <button class="btn btn-ghost btn-sm" id="quote">הצעת מחיר להדפסה</button>
        <a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="${waLink(e.phone, `היי ${e.client}, כאן ${M.db.settings().brand} לגבי ה${e.type} ב־${F.date(e.date)}`)}">וואטסאפ ללקוח</a>
        <button class="btn btn-ghost btn-sm" id="album">גלריית האירוע</button>
        <button class="btn btn-ghost btn-sm danger" id="del">מחיקה</button>
      </div>`, true);
    $('#stSel', b).onchange = (ev) => { const st = ev.target.value; M.db.save('events', { id, status: st }); M.db.log(`${e.client}: סטטוס שונה ל"${C.EVENT_STATUS[st]}"`, 'event'); M.toast('הסטטוס עודכן'); b.close(); openEvent(id); };
    $('#edit', b).onclick = () => { b.close(); editEvent(e); };
    $('#toQ', b).onclick = () => b.close();
    $('#quote', b).onclick = () => printQuote(e);
    $('#sign', b).onclick = () => printSign(e);
    $('#copyUrl', b).onclick = () => navigator.clipboard.writeText(url).then(() => M.toast('הקישור הועתק'));
    $('#album', b).onclick = () => { b.close(); album(e); };
    $('#del', b).onclick = () => { if (confirmBox(`למחוק את האירוע של ${e.client}? הפעולה לא ניתנת לביטול.`)) { M.db.remove('events', id); M.db.log(`אירוע נמחק: ${e.client}`); b.close(); render(); } };
  }

  async function album(e) {
    const orders = M.db.list('orders').filter((o) => o.eventId === e.id);
    const b = modal(`גלריה – ${e.client} (${orders.length})`, `<div class="items-thumbs" id="alb">${orders.length ? '' : '<div class="empty">אין עדיין תמונות</div>'}</div>`, true);
    for (const o of orders) { const ph = await photoOf(o); $('#alb', b).insertAdjacentHTML('beforeend', `<figure>${M.mockup(o.product, ph, '', { small: true })}<figcaption>#${o.num} ${esc(o.guest)}${o.message ? `<br><small>"${esc(o.message)}"</small>` : ''}</figcaption></figure>`); }
  }

  function editEvent(e) {
    const isNew = !e; e = e || { status: 'lead', type: C.EVENT_TYPES[0], date: state.newDate || M.util.addDays(14), time: '19:30', guests: 300, pkg: 'premium', products: [], staff: [], theme: '#b5653a', deposit: 0, source: 'ידני' };
    state.newDate = null;
    const pk = M.db.packages(), P = M.db.products(), staff = M.db.list('staff');
    if (isNew) { const k = pk.find((x) => x.id === e.pkg) || pk[0]; e.price = k.price; e.products = k.products.slice(); }
    const b = modal(isNew ? 'אירוע חדש' : 'עריכת אירוע', `
      <form id="evForm" class="form-grid">
        <label class="field"><span>שם הלקוח / בעלי השמחה</span><input class="input" name="client" required value="${esc(e.client || '')}"></label>
        <label class="field"><span>טלפון</span><input class="input" name="phone" required value="${esc(e.phone || '')}"></label>
        <label class="field"><span>סוג אירוע</span><select class="input" name="type">${C.EVENT_TYPES.map((t) => `<option ${t === e.type ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <label class="field"><span>סטטוס</span><select class="input" name="status">${Object.entries(C.EVENT_STATUS).map(([k, l]) => `<option value="${k}" ${k === e.status ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="field"><span>תאריך</span><input class="input" type="date" name="date" required value="${esc(e.date)}"></label>
        <label class="field"><span>שעה</span><input class="input" type="time" name="time" value="${esc(e.time || '')}"></label>
        <label class="field full"><span>מקום האירוע</span><input class="input" name="venue" value="${esc(e.venue || '')}"></label>
        <label class="field"><span>מספר אורחים</span><input class="input" type="number" name="guests" value="${e.guests || ''}"></label>
        <label class="field"><span>חבילה</span><select class="input" name="pkg">${pk.map((k) => `<option value="${k.id}" ${k.id === e.pkg ? 'selected' : ''}>${esc(k.name)} – ${F.money(k.price)}</option>`).join('')}<option value="custom" ${e.pkg === 'custom' ? 'selected' : ''}>מותאם אישית</option></select></label>
        <label class="field"><span>מחיר סופי (₪)</span><input class="input" type="number" name="price" value="${e.price || 0}"></label>
        <label class="field"><span>מקדמה ששולמה (₪)</span><input class="input" type="number" name="deposit" value="${e.deposit || 0}"></label>
        <label class="field"><span>טקסט על המזכרת</span><input class="input" name="frameText" maxlength="40" value="${esc(e.frameText || '')}" placeholder="נועה & אורי · 12.12.26"></label>
        <label class="field"><span>צבע האירוע (באפליקציה)</span><input class="input" type="color" name="theme" value="${esc(e.theme || '#b5653a')}" style="height:46px;padding:4px"></label>
        <label class="field"><span>תקרת מזכרות (לא חובה)</span><input class="input" type="number" name="limit" value="${e.limit || ''}" placeholder="ללא"></label>
        <label class="field"><span>אימייל</span><input class="input" type="email" name="email" value="${esc(e.email || '')}"></label>
        <div class="field full"><span>מוצרים זמינים באירוע</span><div class="checks">${P.map((p) => `<label><input type="checkbox" name="products" value="${p.id}" ${(e.products || []).includes(p.id) ? 'checked' : ''}>${esc(p.name)}</label>`).join('')}</div></div>
        <div class="field full"><span>צוות משובץ</span><div class="checks">${staff.map((s) => `<label><input type="checkbox" name="staff" value="${esc(s.name)}" ${(e.staff || []).includes(s.name) ? 'checked' : ''}>${esc(s.name)} <small>(${esc(s.role)})</small></label>`).join('') || '<small>הוסיפו אנשי צוות במסך "צוות"</small>'}</div></div>
        <label class="field full"><span>הערות</span><textarea class="input" name="notes">${esc(e.notes || '')}</textarea></label>
        <div class="full btn-row"><button class="btn btn-primary">שמירה</button><button type="button" class="btn btn-ghost" id="cancel">ביטול</button></div>
      </form>`, true);
    const f = $('#evForm', b);
    f.pkg.onchange = () => { const k = pk.find((x) => x.id === f.pkg.value); if (k) { f.price.value = k.price; $$('[name=products]', f).forEach((c) => (c.checked = k.products.includes(c.value))); } };
    $('#cancel', b).onclick = b.close;
    f.onsubmit = (ev) => {
      ev.preventDefault();
      const fd = new FormData(f), o = Object.fromEntries(fd);
      o.products = fd.getAll('products'); o.staff = fd.getAll('staff');
      ['guests', 'price', 'deposit', 'limit'].forEach((k) => (o[k] = o[k] === '' ? '' : +o[k]));
      if (!o.products.length) { M.toast('בחרו לפחות מוצר אחד', 'err'); return; }
      const saved = M.db.save('events', Object.assign({}, isNew ? { code: uniqueCode(), source: 'ידני' } : { id: e.id }, o));
      M.db.log(`${isNew ? 'אירוע חדש נוצר' : 'אירוע עודכן'}: ${saved.client}`, 'event');
      M.toast('נשמר ✓'); b.close(); render(); if (isNew) openEvent(saved.id);
    };
  }
  function uniqueCode() { let c; do c = M.util.code(); while (M.db.eventByCode(c)); return c; }

  function printQuote(e) {
    const s = M.db.settings(), k = M.db.packages().find((x) => x.id === e.pkg);
    const total = +e.price || 0, beforeVat = total / (1 + s.vat / 100);
    printDoc('הצעת מחיר – ' + e.client, `
      <div class="pg"><header><div class="lg">m</div><div><h1>${esc(s.brand)}</h1><p>${esc(s.tagline)} · ${esc(s.phone)} · ${esc(s.email)}</p></div></header>
      <h2>הצעת מחיר</h2><p>תאריך: ${F.date(M.util.today())} · בתוקף ל־14 יום</p>
      <table><tr><td>לכבוד</td><td><b>${esc(e.client)}</b> · ${esc(e.phone)}</td></tr><tr><td>אירוע</td><td>${esc(e.type)} · ${F.dateLong(e.date)} · ${esc(e.venue || '')}</td></tr><tr><td>אורחים</td><td>${e.guests || ''}</td></tr></table>
      <table class="lines"><thead><tr><th>פריט</th><th>פירוט</th><th>סכום</th></tr></thead><tbody>
      <tr><td>חבילת ${esc(k ? k.name : 'מותאמת')}</td><td>${k ? `${k.units} מזכרות · ${k.hours} שעות · ${k.features.map(esc).join(' · ')}` : ''}</td><td>${F.money(total)}</td></tr>
      <tr><td>מוצרים באירוע</td><td colspan="2">${(e.products || []).map(pName).join(', ')}</td></tr>
      <tr><td>מזכרת נוספת</td><td colspan="2">${F.money(s.extraUnit)} ליחידה מעבר לחבילה</td></tr></tbody></table>
      <div class="tot"><div>סכום לפני מע״מ <b>${F.money(beforeVat)}</b></div><div>מע״מ ${s.vat}% <b>${F.money(total - beforeVat)}</b></div><div class="big">סה״כ לתשלום <b>${F.money(total)}</b></div></div>
      <h3>תנאים</h3><ul><li>מקדמה של 30% לשריון התאריך, היתרה ביום האירוע.</li><li>ביטול עד 30 יום לפני האירוע: החזר מלא של המקדמה.</li><li>הלקוח מספק שולחן ושקע חשמל ליד העמדה.</li><li>עיצוב המסגרת יישלח לאישור עד 7 ימים לפני האירוע.</li></ul>
      <div class="sig"><div>חתימת הלקוח: ____________</div><div>תאריך: ____________</div></div></div>`,
      `.pg{max-width:780px;margin:30px auto;padding:0 30px}header{display:flex;gap:14px;align-items:center;border-bottom:3px solid #b5653a;padding-bottom:14px}.lg{width:56px;height:56px;border-radius:14px;background:#b5653a;color:#fff;display:grid;place-items:center;font:900 2rem 'Frank Ruhl Libre'}h1{font:900 1.8rem 'Frank Ruhl Libre';margin:0}header p{margin:0;color:#6b5d53}h2{font:900 1.6rem 'Frank Ruhl Libre';margin:24px 0 4px}table{width:100%;border-collapse:collapse;margin:14px 0}td,th{padding:9px;border-bottom:1px solid #e6dcd0;text-align:start;vertical-align:top}.lines th{background:#f6e4d6}.tot{margin-inline-start:auto;width:300px}.tot div{display:flex;justify-content:space-between;padding:5px 0}.tot .big{font-size:1.25rem;border-top:2px solid #2a211c;margin-top:6px;padding-top:8px}.sig{display:flex;justify-content:space-between;margin-top:50px}@page{size:A4;margin:12mm}`);
  }

  function printSign(e) {
    const s = M.db.settings();
    printDoc('שלט QR – ' + e.client, `<div class="sign"><small>${esc(e.type)}</small><h1>${esc(e.frameText || e.client)}</h1><p>רוצים מזכרת מהאירוע?<br><b>סרקו, הצטלמו וקבלו אותה תוך דקות</b></p>${qrSvg(appUrl(e.code), 8)}<div class="code">קוד: ${esc(e.code)}</div><footer>${esc(s.brand)} · ${esc(s.tagline)}</footer></div>`,
      `.sign{width:148mm;height:200mm;margin:0 auto;border:6mm solid ${e.theme || '#b5653a'};box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:10mm}.sign small{letter-spacing:.2em;color:#6b5d53}.sign h1{font:900 30pt 'Frank Ruhl Libre';margin:6px 0 10px;color:${e.theme || '#b5653a'}}.sign p{font-size:14pt}.sign svg{width:70mm;height:70mm}.code{font:800 18pt monospace;letter-spacing:.2em;margin-top:6px;direction:ltr}footer{margin-top:auto;color:#6b5d53}@page{size:A5;margin:0}`);
  }

  V.calendar = function () {
    const base = state.calMonth ? new Date(state.calMonth + '-01T12:00') : new Date();
    const y = base.getFullYear(), m = base.getMonth();
    const first = new Date(y, m, 1), start = new Date(first); start.setDate(1 - first.getDay());
    const evs = events(), today = M.util.today();
    const a = actions(`<button class="btn btn-ghost btn-sm" data-m="-1">→ הקודם</button><button class="btn btn-ghost btn-sm" data-m="0">היום</button><button class="btn btn-ghost btn-sm" data-m="1">הבא ←</button>`);
    a.onclick = (e) => { const b = e.target.closest('[data-m]'); if (!b) return; const d = +b.dataset.m ? new Date(y, m + +b.dataset.m, 1) : new Date(); state.calMonth = M.util.iso(d).slice(0, 7); V.calendar(); };
    let cells = '';
    for (let i = 0; i < 42; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i); const k = M.util.iso(d);
      const de = evs.filter((e) => e.date === k && e.status !== 'cancelled');
      cells += `<div class="day ${d.getMonth() !== m ? 'out' : ''} ${k === today ? 'today' : ''}" data-day="${k}"><b>${d.getDate()}</b>${de.map((e) => `<span class="ev" data-ev="${e.id}" style="background:${STATUS_COLOR[e.status]}" title="${esc(e.client)}">${esc(e.client)}</span>`).join('')}</div>`;
      if (i >= 34 && d.getMonth() !== m && d.getDay() === 6) break;
    }
    view.innerHTML = `<section class="panel"><h2>${base.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' })} <span>${Object.entries(C.EVENT_STATUS).filter(([k]) => k !== 'cancelled').map(([k, l]) => `<span class="chip" style="background:${STATUS_COLOR[k]};color:#fff">${l}</span>`).join(' ')}</span></h2>
      <div class="cal">${['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'].map((d) => `<div class="dow">${d}</div>`).join('')}${cells}</div></section>
      <p class="muted-s" style="color:var(--ink2)">לחיצה על יום ריק פותחת אירוע חדש בתאריך הזה.</p>`;
    view.querySelector('.cal').onclick = (e) => { const ev = e.target.closest('[data-ev]'); if (ev) return openEvent(ev.dataset.ev); const d = e.target.closest('[data-day]'); if (d) { state.newDate = d.dataset.day; editEvent(); } };
  };

  /* תור הדפסה – מתעדכן חי מהאפליקציה */
  V.queue = function () {
    const evs = events().filter((e) => e.status !== 'cancelled');
    const today = M.util.today();
    if (!state.queueEvent || !M.db.find('events', state.queueEvent)) {
      const t = evs.find((e) => e.date === today) || evs.filter((e) => e.date <= today).pop() || evs[0];
      state.queueEvent = t && t.id;
    }
    const e = M.db.find('events', state.queueEvent);
    const a = actions(`<select class="input" id="qEv" style="width:auto;padding:.45em .8em">${evs.slice().reverse().map((x) => `<option value="${x.id}" ${x.id === state.queueEvent ? 'selected' : ''}>${F.date(x.date)} · ${esc(x.client)}</option>`).join('')}</select>
      <button class="btn btn-ghost btn-sm" id="snd">${state.sound ? '🔔 צליל פעיל' : '🔕 צליל כבוי'}</button><a class="btn btn-soft btn-sm" target="_blank" href="${e ? esc(appUrl(e.code)) : '#'}">פתיחת האפליקציה ↗</a>`);
    $('#qEv', a).onchange = (x) => { state.queueEvent = x.target.value; location.hash = 'queue/' + x.target.value; };
    $('#snd', a).onclick = () => { state.sound = !state.sound; V.queue(); };
    if (!e) { view.innerHTML = '<div class="empty">אין אירועים</div>'; return; }
    const orders = M.db.list('orders').filter((o) => o.eventId === e.id).sort((x, y) => x.createdAt - y.createdAt);
    const pkg = M.db.packages().find((k) => k.id === e.pkg);
    const lanes = [['new', 'ממתינים'], ['printing', 'בהדפסה'], ['ready', 'מוכנים לאיסוף'], ['delivered', 'נמסרו']];
    const next = { new: ['printing', 'התחלת הדפסה'], printing: ['ready', 'מוכן ✓'], ready: ['delivered', 'נמסר לאורח'] };
    view.innerHTML = `
      <div class="toolbar"><span class="live">מחובר – מתעדכן אוטומטית</span><span class="chip">קוד אירוע: <b dir="ltr">${esc(e.code)}</b></span><span class="chip">${orders.length}${pkg ? ' / ' + pkg.units : ''} מזכרות</span>
        ${(e.products || []).map((p) => `<span class="chip accent">${esc(pName(p))}: ${orders.filter((o) => o.product === p).length}</span>`).join('')}</div>
      <div class="board">${lanes.map(([st, l]) => { const list = orders.filter((o) => o.status === st); const shown = st === 'delivered' ? list.slice(-12).reverse() : list; return `
        <div class="lane"><h3>${l}<span>${list.length}</span></h3>${shown.map((o) => `
          <div class="qcard ${state.fresh && state.fresh.has(o.id) ? 'fresh' : ''}" data-o="${o.id}"><div class="ph" data-ph="${o.id}" title="הגדלה"></div>
            <div><b>#${o.num} · ${esc(o.guest)}</b><small>${esc(pName(o.product))} · ${F.time(o.createdAt)}</small>${o.message ? `<small>💬 ${esc(o.message)}</small>` : ''}</div>
            <div class="acts"><button class="btn btn-ghost btn-sm" data-print="${o.id}">🖨 הדפסה</button>${next[st] ? `<button class="btn btn-primary btn-sm" data-next="${o.id}" data-to="${next[st][0]}">${next[st][1]}</button>` : ''}</div></div>`).join('') || '<div class="empty" style="padding:16px">—</div>'}
          ${st === 'delivered' && list.length > 12 ? `<small style="color:var(--ink2)">ועוד ${list.length - 12}…</small>` : ''}</div>`; }).join('')}</div>`;
    view.querySelector('.board').onclick = async (x) => {
      const n = x.target.closest('[data-next]'), p = x.target.closest('[data-print]'), z = x.target.closest('[data-ph]');
      if (n) moveOrder(n.dataset.next, n.dataset.to);
      if (p) { const o = M.db.find('orders', p.dataset.print); printPhoto(o, e); if (o.status === 'new') moveOrder(o.id, 'printing'); }
      if (z) { const o = M.db.find('orders', z.dataset.ph); const ph = await photoOf(o); modal(`#${o.num} · ${o.guest}`, `<img class="zoom" src="${ph}" alt="">`); }
    };
    orders.forEach(async (o) => { const ph = await photoOf(o); const el = view.querySelector(`[data-ph="${o.id}"]`); if (el && ph) el.style.backgroundImage = `url("${ph}")`; });
    state.fresh = null;
  };
  function moveOrder(id, to) {
    const o = M.db.find('orders', id); if (!o) return;
    const patch = { id, status: to };
    if (to === 'printing' && !o.stockTaken) { const inv = M.db.get('inventory', {}); if (inv[o.product] != null) { inv[o.product] = Math.max(0, inv[o.product] - 1); M.db.set('inventory', inv); } patch.stockTaken = true; }
    M.db.save('orders', patch);
  }
  async function printPhoto(o, e) {
    const ph = await photoOf(o), p = M.db.product(o.product) || {};
    const size = { magnet: [70, 50], crystal: [120, 80], globe: [60, 60] }[o.product] || [150, 100];
    printDoc(`#${o.num} ${o.guest}`, `<div class="pp" style="background-image:url('${ph}')"><div class="cap">${esc(o.caption || (e && e.frameText) || '')}</div></div><div class="meta">#${o.num} · ${esc(o.guest)} · ${esc(p.name || '')}</div>`,
      `@page{size:${size[0]}mm ${size[1]}mm;margin:0}html,body{width:${size[0]}mm;height:${size[1]}mm}.pp{width:100%;height:100%;background:center/cover no-repeat;position:relative;-webkit-print-color-adjust:exact;print-color-adjust:exact}.cap{position:absolute;inset-inline:0;bottom:6%;text-align:center;color:#fff;font:900 ${Math.round(size[0] / 14)}pt 'Frank Ruhl Libre',serif;text-shadow:0 1px 5px rgba(0,0,0,.6)}.meta{display:none}@media screen{body{margin:20px auto}.pp{width:${size[0] * 3}px;height:${size[1] * 3}px;margin:0 auto;box-shadow:0 10px 30px rgba(0,0,0,.2)}.meta{display:block;text-align:center;margin-top:10px}}`);
  }

  V.shop = function () {
    const f = state.shopFilter;
    let list = M.db.list('shop').sort((a, b) => b.createdAt - a.createdAt);
    const open = (o) => !['delivered', 'cancelled'].includes(o.status);
    if (f === 'open') list = list.filter(open); else if (f !== 'all') list = list.filter((o) => o.status === f);
    const all = M.db.list('shop');
    view.innerHTML = `
      <div class="kpis"><div class="kpi"><small>הזמנות פתוחות</small><b>${all.filter(open).length}</b></div><div class="kpi"><small>מחזור חנות (סה״כ)</small><b>${F.money(all.reduce((a, o) => a + shopTotal(o), 0))}</b></div><div class="kpi"><small>ממוצע להזמנה</small><b>${F.money(all.length ? all.reduce((a, o) => a + shopTotal(o), 0) / all.filter((o) => o.status !== 'cancelled').length : 0)}</b></div></div>
      <div class="toolbar"><div class="seg" id="seg">${[['open', 'פתוחות'], ['all', 'הכול'], ...Object.entries(C.SHOP_STATUS)].map(([k, l]) => `<button data-f="${k}" class="${f === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <section class="panel tbl-wrap"><table class="tbl"><thead><tr><th>מס׳</th><th>תאריך</th><th>לקוח</th><th>פריטים</th><th>משלוח</th><th>סכום</th><th>סטטוס</th></tr></thead><tbody>
      ${list.map((o) => `<tr class="click" data-s="${o.id}"><td class="num"><b>#${o.num}</b></td><td class="num">${F.date(M.util.iso(o.createdAt))}<small>${F.time(o.createdAt)}</small></td><td><b>${esc(o.customer)}</b><small>${esc(o.phone)}</small></td><td>${o.items.map((i) => `${esc(pName(i.product))} ×${i.qty}`).join('<br>')}</td><td>${o.ship === 'pickup' ? 'איסוף' : esc(o.city || 'שליח')}</td><td class="num">${F.money(o.total)}</td><td><span class="chip ${SHOP_CHIP[o.status]}">${C.SHOP_STATUS[o.status]}</span></td></tr>`).join('') || '<tr><td colspan="7" class="empty">אין הזמנות</td></tr>'}
      </tbody></table></section>`;
    $('#seg').onclick = (e) => { const b = e.target.closest('[data-f]'); if (b) { state.shopFilter = b.dataset.f; V.shop(); } };
    $$('[data-s]', view).forEach((tr) => (tr.onclick = () => openShop(tr.dataset.s)));
  };
  async function openShop(id) {
    const o = M.db.find('shop', id); if (!o) return;
    const b = modal(`הזמנה #${o.num} – ${o.customer}`, `
      <p><b>טלפון:</b> <a href="tel:${esc(o.phone)}">${esc(o.phone)}</a> · <b>${o.ship === 'pickup' ? 'איסוף עצמי' : 'משלוח'}:</b> ${esc([o.address, o.city].filter(Boolean).join(', ') || '—')}<br><b>התקבלה:</b> ${new Date(o.createdAt).toLocaleString('he-IL')}</p>
      <div class="items-thumbs" id="its"></div>
      <div class="panel" style="margin:14px 0">${o.items.map((i) => { const p = M.db.product(i.product) || { sizes: [] }; const s = p.sizes.find((z) => z.id === i.size) || {}; return `<div class="money-row"><span>${esc(p.name)} ${esc(s.label || '')} ×${i.qty}${i.caption ? ` · "${esc(i.caption)}"` : ''}</span><b>${F.money((s.price || 0) * i.qty)}</b></div>`; }).join('')}
        ${o.shipping ? `<div class="money-row"><span>משלוח</span><b>${F.money(o.shipping)}</b></div>` : ''}<div class="money-row" style="border:0"><span>סה״כ</span><b>${F.money(o.total)}</b></div></div>
      <label class="field"><span>סטטוס</span><select class="input" id="ss">${Object.entries(C.SHOP_STATUS).map(([k, l]) => `<option value="${k}" ${k === o.status ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <div class="btn-row"><a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="${waLink(o.phone, `היי ${o.customer}, כאן ${M.db.settings().brand} לגבי הזמנה #${o.num}`)}">וואטסאפ ללקוח</a></div>`, true);
    $('#ss', b).onchange = (e) => { M.db.save('shop', { id, status: e.target.value }); M.db.log(`הזמנה #${o.num}: ${C.SHOP_STATUS[e.target.value]}`, 'shop'); M.toast('עודכן'); };
    for (const [n, i] of o.items.entries()) {
      const ph = i.photoId ? await M.photos.get(i.photoId) : M.sample(i.sample || n);
      $('#its', b).insertAdjacentHTML('beforeend', `<figure>${M.mockup(i.product, ph, i.caption, { small: true })}<figcaption>${esc(pName(i.product))}<br><a href="${ph}" download="order-${o.num}-${n + 1}.jpg">הורדת קובץ להדפסה</a></figcaption></figure>`);
    }
  }

  V.clients = function () {
    const map = new Map();
    const key = (p) => String(p || '').replace(/\D/g, '');
    M.db.list('events').forEach((e) => { const k = key(e.phone) || e.client; const c = map.get(k) || { name: e.client, phone: e.phone, events: 0, orders: 0, total: 0, last: 0 }; c.events++; if (e.status === 'confirmed' || e.status === 'done') c.total += +e.price || 0; c.last = Math.max(c.last, new Date(e.date).getTime()); c.evId = e.id; map.set(k, c); });
    M.db.list('shop').forEach((o) => { const k = key(o.phone) || o.customer; const c = map.get(k) || { name: o.customer, phone: o.phone, events: 0, orders: 0, total: 0, last: 0 }; c.orders++; c.total += shopTotal(o); c.last = Math.max(c.last, o.createdAt); map.set(k, c); });
    const list = [...map.values()].sort((a, b) => b.total - a.total);
    actions(`<button class="btn btn-ghost btn-sm" id="csv">ייצוא לאקסל (CSV)</button>`).querySelector('#csv').onclick = () => {
      const rows = [['שם', 'טלפון', 'אירועים', 'הזמנות חנות', 'סה"כ', 'פעילות אחרונה'], ...list.map((c) => [c.name, c.phone, c.events, c.orders, c.total, F.date(M.util.iso(c.last))])];
      const blob = new Blob(['﻿' + rows.map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\n')], { type: 'text/csv' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'clients.csv'; a.click();
    };
    view.innerHTML = `<section class="panel tbl-wrap"><table class="tbl"><thead><tr><th>לקוח</th><th>טלפון</th><th>אירועים</th><th>הזמנות חנות</th><th>סה״כ הכנסה</th><th>פעילות אחרונה</th><th></th></tr></thead><tbody>
      ${list.map((c) => `<tr><td><b>${esc(c.name)}</b></td><td class="num">${esc(c.phone)}</td><td>${c.events}</td><td>${c.orders}</td><td class="num">${F.money(c.total)}</td><td class="num">${F.date(M.util.iso(c.last))}</td><td><a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="${waLink(c.phone, 'היי ' + c.name)}">וואטסאפ</a></td></tr>`).join('')}
      </tbody></table></section>`;
  };

  V.inventory = function () {
    const inv = M.db.get('inventory', {}), min = M.db.get('minStock', {});
    const upcomingNeed = {};
    events().filter((e) => e.status === 'confirmed' && e.date >= M.util.today()).forEach((e) => { const k = M.db.packages().find((x) => x.id === e.pkg); const units = k ? k.units : 150; const share = units / Math.max(1, (e.products || []).length); (e.products || []).forEach((p) => (upcomingNeed[p] = (upcomingNeed[p] || 0) + Math.round(share))); });
    view.innerHTML = `<p style="color:var(--ink2);margin-top:0">המלאי יורד אוטומטית בכל מזכרת שנכנסת להדפסה. "צפי לאירועים" מחושב לפי החבילות של האירועים המאושרים.</p>
      <div class="stock">${M.db.products().map((p) => { const q = inv[p.id] || 0, mn = min[p.id] || 0, need = upcomingNeed[p.id] || 0; const pct = Math.min(100, (q / Math.max(1, mn * 2)) * 100); return `
        <div class="panel" data-p="${p.id}"><h2 style="margin:0">${esc(p.name)} ${q < mn ? '<span class="chip err">להזמין</span>' : q < need ? '<span class="chip warn">לא מספיק לאירועים</span>' : '<span class="chip ok">תקין</span>'}</h2>
          <div style="font:900 2rem var(--display)">${q}<small style="font:500 .9rem var(--font);color:var(--ink2)"> יח׳ במלאי</small></div>
          <div class="bar"><i class="${q < mn ? 'low' : ''}" style="width:${pct}%"></i></div>
          <small style="color:var(--ink2)">מינימום: ${mn} · צפי לאירועים קרובים: ${need} · עלות ליח׳: ${F.money(p.eventCost)}</small>
          <div class="adj"><input class="input" type="number" placeholder="כמות" aria-label="כמות"><button class="btn btn-soft btn-sm" data-add="1">+ קליטה</button><button class="btn btn-ghost btn-sm" data-add="-1">− הוצאה</button></div>
          <label class="field"><span>מינימום להתראה</span><input class="input" type="number" data-min value="${mn}"></label></div>`; }).join('')}</div>`;
    $$('[data-p]', view).forEach((card) => {
      const id = card.dataset.p;
      card.querySelectorAll('[data-add]').forEach((b) => (b.onclick = () => { const n = +card.querySelector('.adj input').value; if (!n) return; const i = M.db.get('inventory', {}); i[id] = Math.max(0, (i[id] || 0) + n * +b.dataset.add); M.db.set('inventory', i); M.db.log(`מלאי ${pName(id)}: ${b.dataset.add > 0 ? '+' : '−'}${n}`, 'stock'); M.toast('המלאי עודכן'); }));
      card.querySelector('[data-min]').onchange = (e) => { const m = M.db.get('minStock', {}); m[id] = +e.target.value || 0; M.db.set('minStock', m); };
    });
  };

  V.catalog = function () {
    const P = M.db.products(), K = M.db.packages();
    view.innerHTML = `
      <section class="panel"><h2>מוצרים ומחירים לחנות</h2><p style="color:var(--ink2);margin-top:0">המחירים מתעדכנים מיד באתר. "עלות" היא עלות החומר לאירוע, לחישוב רווחיות.</p><div class="tbl-wrap"><table class="tbl price-tbl"><thead><tr><th>מוצר</th><th>תיאור</th><th>זמן הכנה (דק׳)</th><th>עלות חומר</th><th>גדלים ומחירים</th></tr></thead><tbody>
        ${P.map((p, i) => `<tr data-i="${i}"><td><input class="input" data-k="name" value="${esc(p.name)}" style="width:130px"></td><td><input class="input" data-k="short" value="${esc(p.short)}" style="width:240px"></td><td><input class="input" type="number" data-k="minutes" value="${p.minutes}" style="width:70px"></td><td><input class="input" type="number" data-k="eventCost" value="${p.eventCost}" style="width:80px"></td>
          <td>${p.sizes.map((s, j) => `<div style="display:flex;gap:6px;margin-bottom:4px"><input class="input" data-s="${j}" data-sk="label" value="${esc(s.label)}" style="width:120px"><input class="input" type="number" data-s="${j}" data-sk="price" value="${s.price}" style="width:90px"></div>`).join('')}</td></tr>`).join('')}
      </tbody></table></div><div class="btn-row"><button class="btn btn-primary btn-sm" id="saveP">שמירת מחירים</button></div></section>
      <section class="panel"><h2>חבילות לאירועים</h2><div class="stock">${K.map((k, i) => `<div class="panel" data-k="${i}">
        <label class="field"><span>שם</span><input class="input" data-f="name" value="${esc(k.name)}"></label>
        <div class="grid2"><label class="field"><span>מחיר</span><input class="input" type="number" data-f="price" value="${k.price}"></label><label class="field"><span>מזכרות</span><input class="input" type="number" data-f="units" value="${k.units}"></label><label class="field"><span>שעות</span><input class="input" type="number" data-f="hours" value="${k.hours}"></label><label class="field"><span>מומלצת</span><select class="input" data-f="popular"><option value="">לא</option><option value="1" ${k.popular ? 'selected' : ''}>כן</option></select></label></div>
        <div class="field"><span>מוצרים</span><div class="checks">${P.map((p) => `<label><input type="checkbox" value="${p.id}" ${k.products.includes(p.id) ? 'checked' : ''}>${esc(p.name)}</label>`).join('')}</div></div>
        <label class="field"><span>מה כלול (שורה לכל סעיף)</span><textarea class="input" data-f="features">${esc(k.features.join('\n'))}</textarea></label></div>`).join('')}</div>
        <div class="btn-row"><button class="btn btn-primary btn-sm" id="saveK">שמירת חבילות</button></div></section>`;
    $('#saveP').onclick = () => {
      const out = P.map((p, i) => { const tr = view.querySelector(`tr[data-i="${i}"]`); const n = JSON.parse(JSON.stringify(p)); tr.querySelectorAll('[data-k]').forEach((el) => (n[el.dataset.k] = el.type === 'number' ? +el.value : el.value)); tr.querySelectorAll('[data-s]').forEach((el) => (n.sizes[+el.dataset.s][el.dataset.sk] = el.type === 'number' ? +el.value : el.value)); return n; });
      M.db.set('products', out); M.db.log('מחירון המוצרים עודכן'); M.toast('המחירים נשמרו ✓');
    };
    $('#saveK').onclick = () => {
      const out = K.map((k, i) => { const c = view.querySelector(`[data-k="${i}"]`), g = (f) => c.querySelector(`[data-f="${f}"]`).value; return Object.assign({}, k, { name: g('name'), price: +g('price'), units: +g('units'), hours: +g('hours'), popular: !!g('popular'), products: $$('.checks input:checked', c).map((x) => x.value), features: g('features').split('\n').map((s) => s.trim()).filter(Boolean) }); });
      M.db.set('packages', out); M.db.log('החבילות עודכנו'); M.toast('החבילות נשמרו ✓');
    };
  };

  V.staff = function () {
    const staff = M.db.list('staff'), up = events().filter((e) => e.date >= M.util.today() && e.status === 'confirmed');
    actions(`<button class="btn btn-primary btn-sm" id="addS">+ איש צוות</button>`).querySelector('#addS').onclick = () => {
      const b = modal('איש צוות חדש', `<form class="form-grid" id="sf"><label class="field"><span>שם</span><input class="input" name="name" required></label><label class="field"><span>תפקיד</span><select class="input" name="role"><option>צלם</option><option>מפעיל/ת עמדה</option><option>מעצב/ת</option><option>נהג/ת</option></select></label><label class="field full"><span>טלפון</span><input class="input" name="phone"></label><div class="full"><button class="btn btn-primary">הוספה</button></div></form>`);
      $('#sf', b).onsubmit = (e) => { e.preventDefault(); M.db.save('staff', Object.fromEntries(new FormData(e.target))); b.close(); render(); };
    };
    view.innerHTML = `<div class="stock">${staff.map((s) => { const mine = up.filter((e) => (e.staff || []).includes(s.name)); return `<div class="panel"><h2 style="margin:0">${esc(s.name)} <span class="chip">${esc(s.role)}</span></h2><small style="color:var(--ink2)">${esc(s.phone || '')}</small>
      <b style="font-size:.9rem">אירועים קרובים (${mine.length})</b><div class="list">${mine.slice(0, 4).map((e) => `<div class="li"><div class="t"><b>${F.date(e.date)}</b><small>${esc(e.client)} · ${esc(e.venue || '')}</small></div></div>`).join('') || '<small style="color:var(--ink2)">אין שיבוצים</small>'}</div>
      <div class="btn-row"><a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="${waLink(s.phone, 'היי ' + s.name + ', השיבוצים הקרובים שלך:\n' + mine.map((e) => `${F.date(e.date)} ${e.time || ''} – ${e.client}, ${e.venue || ''}`).join('\n'))}">שליחת שיבוצים בוואטסאפ</a><button class="btn btn-ghost btn-sm danger" data-del="${s.id}">הסרה</button></div></div>`; }).join('')}</div>`;
    $$('[data-del]', view).forEach((b) => (b.onclick = () => { if (confirmBox('להסיר את איש הצוות?')) { M.db.remove('staff', b.dataset.del); render(); } }));
  };

  V.settings = function () {
    const s = M.db.settings();
    view.innerHTML = `
      <section class="panel"><h2>פרטי העסק</h2><form id="setF" class="form-grid">
        <label class="field"><span>שם העסק</span><input class="input" name="brand" value="${esc(s.brand)}"></label>
        <label class="field"><span>שורת תיאור</span><input class="input" name="tagline" value="${esc(s.tagline)}"></label>
        <label class="field"><span>טלפון</span><input class="input" name="phone" value="${esc(s.phone)}"></label>
        <label class="field"><span>וואטסאפ (972...)</span><input class="input" name="whatsapp" value="${esc(s.whatsapp)}" dir="ltr"></label>
        <label class="field"><span>אימייל</span><input class="input" name="email" value="${esc(s.email)}" dir="ltr"></label>
        <label class="field"><span>אזור שירות</span><input class="input" name="area" value="${esc(s.area)}"></label>
        <label class="field"><span>מחיר מזכרת נוספת (₪)</span><input class="input" type="number" name="extraUnit" value="${s.extraUnit}"></label>
        <label class="field"><span>תוספת נסיעות קבועה (₪)</span><input class="input" type="number" name="travelFee" value="${s.travelFee}"></label>
        <label class="field"><span>צוותים פנויים לכל תאריך</span><input class="input" type="number" name="capacity" value="${s.capacity || 3}"></label>
        <label class="field"><span>מזכרות לאורח באפליקציה</span><input class="input" type="number" name="guestLimit" value="${s.guestLimit || 2}"></label>
        <label class="field"><span>מע״מ (%)</span><input class="input" type="number" name="vat" value="${s.vat}"></label>
        <label class="field"><span>קוד כניסה לצוות</span><input class="input" name="pin" value="${esc(s.pin)}" dir="ltr"></label>
        <div class="full"><button class="btn btn-primary">שמירה</button></div></form></section>
      <section class="panel"><h2>גיבוי ושחזור</h2><p style="color:var(--ink2);margin-top:0">שמרו גיבוי של כל הנתונים (אירועים, הזמנות, לקוחות, מחירים). תמונות האורחים נשמרות בנפרד במכשיר הזה.</p>
        <div class="btn-row"><button class="btn btn-soft btn-sm" id="exp">הורדת גיבוי</button><label class="btn btn-ghost btn-sm">שחזור מגיבוי<input type="file" accept=".json" id="imp" hidden></label><button class="btn btn-ghost btn-sm danger" id="rst">איפוס לנתוני הדגמה</button></div></section>`;
    $('#setF').onsubmit = (e) => { e.preventDefault(); const o = Object.fromEntries(new FormData(e.target)); ['extraUnit', 'travelFee', 'capacity', 'guestLimit', 'vat'].forEach((k) => (o[k] = +o[k] || 0)); M.db.set('settings', Object.assign(M.db.get('settings', {}), o)); M.toast('ההגדרות נשמרו ✓'); render(); };
    $('#exp').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(M.db.exportAll(), null, 1)], { type: 'application/json' })); a.download = `momento-backup-${M.util.today()}.json`; a.click(); };
    $('#imp').onchange = async (e) => { const f = e.target.files[0]; if (!f) return; try { const o = JSON.parse(await f.text()); if (!o.events) throw new Error(); if (confirmBox('השחזור יחליף את הנתונים הנוכחיים. להמשיך?')) { M.db.importAll(o); M.toast('שוחזר ✓'); } } catch (er) { M.toast('קובץ גיבוי לא תקין', 'err'); } };
    $('#rst').onclick = () => { if (confirmBox('למחוק את כל הנתונים ולחזור לנתוני ההדגמה?')) { M.db.reset(); M.toast('אופס'); } };
  };

  /* עדכונים חיים מהאתר ומהאפליקציה */
  M.db.on((k) => {
    if ($('#shell').hidden) return;
    if (k === 'orders' || k === '*') {
      const now = M.db.list('orders'); const fresh = now.filter((o) => !lastOrderIds.has(o.id));
      lastOrderIds = new Set(now.map((o) => o.id));
      if (fresh.length) { beep(); state.fresh = new Set(fresh.map((o) => o.id)); M.toast(`מזכרת חדשה בתור: #${fresh[0].num} ${fresh[0].guest}`); }
    }
    if (document.querySelector('.modal-bg') && !['orders', 'inventory'].includes(k)) { badges(); return; }
    if (document.activeElement && view.contains(document.activeElement) && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { badges(); return; }
    render();
  });

  if (authed()) showApp(); else { $('#login').hidden = false; $('#pin').focus(); }
})();
