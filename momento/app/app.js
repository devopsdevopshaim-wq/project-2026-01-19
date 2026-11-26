(function () {
  'use strict';
  const M = window.Momento, { esc } = M.util, F = M.fmt, $ = (s, r = document) => r.querySelector(s);
  const scr = $('#screen'), app = $('#app');
  const KEY = 'momento.guest';
  let me = {}; try { me = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { me = {}; }
  const saveMe = () => { try { localStorage.setItem(KEY, JSON.stringify(me)); } catch (e) {} };
  let ev = null, view = 'join', params = {}, stream = null, draft = { photo: null, product: null, filter: 'none' };
  const FILTERS = { none: ['מקורי', ''], warm: ['חמים', 'sepia(.28) saturate(1.2) contrast(1.04)'], bw: ['שחור־לבן', 'grayscale(1) contrast(1.12)'], soft: ['רך', 'brightness(1.08) saturate(.85) contrast(.94)'] };
  const ICON = {
    img: '<svg viewBox="0 0 24 24"><path d="M21 19V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2ZM8.5 13.5l2.5 3 3.5-4.5 4.5 6H5Z"/></svg>',
    list: '<svg viewBox="0 0 24 24"><path d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2Zm-7 14-5-5 1.4-1.4 3.6 3.6 7.6-7.6L21 8Z"/></svg>',
    mark: '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="19" fill="none" stroke="currentColor" stroke-width=".8"/><path d="M11 27V15.5l5 6 4-6 4 6 5-6V27" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    orn: '<svg viewBox="0 0 120 14"><path d="M0 7h48M72 7h48" stroke="currentColor" stroke-width=".8"/><path d="M60 1l3 6-3 6-3-6Z" fill="currentColor"/></svg>',
  };

  /* ---------- ניווט ---------- */
  function go(v, p = {}, push = true) { stopCam(); view = v; params = p; if (push) history.pushState({ v, p }, ''); render(); scrollTo(0, 0); }
  addEventListener('popstate', (e) => { const s = e.state || { v: ev ? 'home' : 'join', p: {} }; go(s.v, s.p, false); });
  $('#back').onclick = () => history.back();
  $('#mine').onclick = () => go('orders');
  $('#tabs').onclick = (e) => { const b = e.target.closest('[data-go]'); if (b) go(b.dataset.go); };

  function myOrders() { const ids = new Set(me.orders || []); return M.db.list('orders').filter((o) => ids.has(o.id) && o.eventId === (ev && ev.id)).sort((a, b) => b.createdAt - a.createdAt); }
  const photoOf = (o) => (o.photoId ? M.photos.get(o.photoId) : Promise.resolve(M.sample(o.sample || 0)));

  function chrome() {
    const inEvent = !!ev && view !== 'join';
    $('#tabs').hidden = !inEvent || view === 'camera';
    $('#back').hidden = !inEvent || ['home', 'orders', 'gallery'].includes(view);
    const mine = inEvent ? myOrders() : [], waiting = mine.filter((o) => o.status !== 'delivered');
    $('#mine').hidden = !inEvent || !mine.length;
    $('#mine').classList.toggle('badge', mine.some((o) => o.status === 'ready'));
    $('#mineCount').textContent = waiting.length || mine.length;
    $('#evTitle').textContent = ev ? ev.frameText || ev.client : M.db.settings().brand;
    $('#evSub').textContent = ev ? `${ev.type} · ${F.date(ev.date)}` : 'מזכרות חיות לאירועים';
    if (ev && ev.theme) { app.style.setProperty('--theme', ev.theme); document.querySelector('meta[name=theme-color]').content = '#100d0b'; }
    document.querySelectorAll('#tabs [data-go]').forEach((b) => b.toggleAttribute('aria-current', b.dataset.go === view || (b.dataset.go === 'home' && ['choose', 'status'].includes(view))));
  }

  /* ---------- מסכים ---------- */
  const views = {
    join() {
      scr.innerHTML = `<div class="join"><div class="mark">${ICON.mark}</div>
        <h1 class="h">ברוכים הבאים</h1><p class="sub">הקלידו את קוד האירוע מהשלט בשולחן,<br>או סרקו את קוד ה־QR עם המצלמה</p>
        <form id="joinForm" class="stack"><input class="input code-in" id="codeIn" maxlength="6" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="· · · · ·" aria-label="קוד אירוע" value="${esc(params.code || '')}">
        <button class="btn btn-gold btn-block btn-lg">כניסה לאירוע</button></form>
        ${params.err ? `<p class="err-note">${esc(params.err)}</p>` : ''}
        <p class="demo-hint">רוצים לראות איך זה עובד? <button id="demo">כניסה לאירוע הדגמה</button></p></div>`;
      $('#joinForm').onsubmit = (e) => { e.preventDefault(); enter($('#codeIn').value); };
      $('#demo').onclick = () => enter('DEMO1');
    },

    home() {
      const left = remaining(), mine = myOrders(), notToday = ev.date !== M.util.today(), ready = mine.find((o) => o.status === 'ready');
      const used = left.perGuest - Math.max(0, left.guest);
      scr.innerHTML = `
        <section class="welcome"><small>${esc(ev.type)}</small><h2>${esc(ev.frameText || ev.client)}</h2><p>${F.dateLong(ev.date)}${ev.venue ? ' · ' + esc(ev.venue) : ''}</p><span class="orn">${ICON.orn}</span></section>
        ${ready ? `<button class="note" id="readyNote" style="width:100%;text-align:start;border-color:var(--theme);color:var(--ivory);cursor:pointer">✦ המזכרת #${ready.num} מוכנה! גשו לעמדה לאסוף אותה ←</button>` : ''}
        <button class="hero-snap" id="snap" style="margin-top:12px"><b>מצטלמים<br>עכשיו</b><span>ומקבלים מזכרת תוך דקות</span><i class="lens" aria-hidden="true"></i></button>
        <div class="row2"><button class="tile" id="pick">${ICON.img}<b>מהגלריה</b><small>תמונה מהטלפון</small></button><button class="tile" id="mineT">${ICON.list}<b>ההזמנות שלי</b><small>${mine.length ? mine.length + ' הזמנות' : 'עוד אין'}</small></button></div>
        <div class="meter"><div class="pips">${Array.from({ length: left.perGuest }, (_, i) => `<i class="${i < used ? 'used' : ''}"></i>`).join('')}</div><p>${left.guest > 0 ? `נשארו לכם ${left.guest} מזכרות מתוך ${left.perGuest}, מתנה מבעלי השמחה` : 'ניצלתם את כל המזכרות שלכם באירוע. אפשר להזמין עוד בחנות שלנו.'}</p></div>
        ${notToday ? `<p class="note">האירוע ב־${F.dateLong(ev.date)}. אפשר כבר לשלוח תמונה, והיא תודפס ביום האירוע.</p>` : ''}
        <div id="installSlot"></div>`;
      const can = () => (left.guest > 0 && left.event > 0) || (M.toast('אין יותר מזכרות זמינות', 'err'), false);
      $('#snap').onclick = () => can() && go('camera');
      $('#pick').onclick = () => can() && $('#libFile').click();
      $('#mineT').onclick = () => go('orders');
      if (ready) $('#readyNote').onclick = () => go('status', { id: ready.id });
      showInstall();
    },

    camera() {
      scr.innerHTML = `<div class="cam"><video id="vid" playsinline autoplay muted></video><i class="grid-l"></i><div class="frame"><span>${esc(ev.frameText || '')}</span></div><div class="cam-count" id="count"></div><i class="flash" id="flash"></i></div>
        <div class="cam-ctl"><button class="ctl" id="flip">↺ החלפת מצלמה</button><button class="shutter" id="shutter" aria-label="צילום"></button><button class="ctl" id="fromLib">מהגלריה</button></div>
        <p class="sub center" style="margin-top:16px">עמדו קרוב ובאור טוב. הצילום יוצא אחרי ספירה של 3</p>`;
      $('#fromLib').onclick = () => $('#libFile').click();
      let facing = 'user';
      const start = async () => {
        stopCam();
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false });
          const v = $('#vid'); if (!v) return stopCam(); v.srcObject = stream; v.style.transform = facing === 'user' ? 'scaleX(-1)' : 'none';
        } catch (e) { stopCam(); $('#camFile').click(); }
      };
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) $('#camFile').click(); else start();
      $('#flip').onclick = () => { facing = facing === 'user' ? 'environment' : 'user'; start(); };
      $('#shutter').onclick = async () => {
        const c = $('#count'), v = $('#vid');
        if (!stream || !v.videoWidth) { $('#camFile').click(); return; }
        $('#shutter').disabled = true;
        for (let i = 3; i > 0; i--) { c.textContent = i; c.classList.remove('go'); void c.offsetWidth; c.classList.add('go'); await new Promise((r) => setTimeout(r, 800)); }
        c.textContent = ''; $('#flash').classList.add('on');
        const cv = document.createElement('canvas'); cv.width = v.videoWidth; cv.height = v.videoHeight;
        const g = cv.getContext('2d'); if (facing === 'user') { g.translate(cv.width, 0); g.scale(-1, 1); } g.drawImage(v, 0, 0);
        draft.photo = M.img.resize(cv, 1800, 0.9); draft.filter = 'none';
        setTimeout(() => go('choose'), 350);
      };
    },

    choose() {
      if (!draft.photo) return go('home', {}, false);
      const prods = (ev.products || []).map((id) => M.db.product(id)).filter(Boolean);
      if (!draft.product || !prods.find((p) => p.id === draft.product)) draft.product = prods[0] && prods[0].id;
      scr.innerHTML = `<h2 class="h center">בחרו את המזכרת</h2><p class="sub center">מתנה מבעלי השמחה ✦ סובבו את ההדמיה באצבע</p>
        <div class="preview" id="pv"></div>
        <div class="filters" id="flt">${Object.entries(FILTERS).map(([k, [l]]) => `<button aria-pressed="${k === draft.filter}" data-f="${k}">${l}</button>`).join('')}</div>
        <div class="prods" role="radiogroup" aria-label="מוצר" id="prods">${prods.map((p) => `<button class="pcard" role="radio" data-p="${p.id}" aria-checked="${p.id === draft.product}">${M.mockup(p.id, draft.photo, '', { small: true })}<b>${esc(p.name)}</b><small>מוכן תוך ~${p.minutes} דק׳</small></button>`).join('')}</div>
        <form id="sendForm" class="stack" style="margin-top:14px">
          <label class="field"><span>השם שלכם, כדי שנקרא לכם לאסוף</span><input class="input" id="gName" required maxlength="30" value="${esc(me.name || '')}" autocomplete="name"></label>
          <label class="field"><span>ברכה לבעלי השמחה (תופיע באלבום שלהם)</span><input class="input" id="gMsg" maxlength="80" placeholder="מזל טוב! שמחה שהייתי כאן"></label>
          <button class="btn btn-theme btn-block btn-lg" id="sendBtn">שליחה להדפסה</button>
          <button class="btn btn-ghost btn-block" type="button" id="retake">צילום מחדש</button>
        </form>`;
      const pv = () => {
        $('#pv').innerHTML = M.mockup(draft.product, draft.photo, ev.frameText, { tilt: true }); M.tilt($('#pv'));
        const f = FILTERS[draft.filter][1]; scr.querySelectorAll('.mk-photo').forEach((el) => (el.style.filter = f));
      };
      pv();
      $('#prods').onclick = (e) => { const b = e.target.closest('[data-p]'); if (!b) return; draft.product = b.dataset.p; scr.querySelectorAll('.pcard').forEach((x) => x.setAttribute('aria-checked', x === b)); pv(); };
      $('#flt').onclick = (e) => { const b = e.target.closest('[data-f]'); if (!b) return; draft.filter = b.dataset.f; scr.querySelectorAll('#flt button').forEach((x) => x.setAttribute('aria-pressed', x === b)); pv(); };
      $('#retake').onclick = () => { draft.photo = null; history.back(); };
      $('#sendForm').onsubmit = async (e) => {
        e.preventDefault();
        const name = $('#gName').value.trim(); if (!name) { $('#gName').focus(); return; }
        const left = remaining(); if (left.guest <= 0 || left.event <= 0) { M.toast('אין יותר מזכרות זמינות', 'err'); return; }
        const btn = $('#sendBtn'); btn.disabled = true; btn.textContent = 'שולחים…';
        try {
          const finalPhoto = await bake(draft.photo, FILTERS[draft.filter][1]);
          const photoId = await M.photos.put(finalPhoto);
          const num = Math.max(100, ...M.db.list('orders').filter((o) => o.eventId === ev.id).map((o) => o.num || 0)) + 1;
          const o = M.db.save('orders', { num, eventId: ev.id, guest: name, product: draft.product, photoId, caption: ev.frameText, message: $('#gMsg').value.trim(), status: 'new' });
          me.name = name; me.orders = (me.orders || []).concat(o.id); saveMe();
          draft = { photo: null, product: draft.product, filter: 'none' };
          M.db.log(`מזכרת #${num} נשלחה מהאפליקציה (${ev.client})`, 'order');
          confetti();
          history.replaceState({ v: 'status', p: { id: o.id } }, ''); go('status', { id: o.id }, false);
        } catch (err) { console.error(err); M.toast('השליחה נכשלה, נסו שוב', 'err'); btn.disabled = false; btn.textContent = 'שליחה להדפסה'; }
      };
    },

    async status() {
      const o = M.db.find('orders', params.id); if (!o) return go('orders', {}, false);
      const p = M.db.product(o.product) || { name: o.product, minutes: 3 };
      const step = { new: 0, printing: 1, ready: 2, delivered: 2 }[o.status] || 0;
      const queue = M.db.list('orders').filter((x) => x.eventId === o.eventId && x.status === 'new' && x.createdAt < o.createdAt);
      const eta = Math.max(1, Math.round(queue.reduce((a, x) => a + ((M.db.product(x.product) || {}).minutes || 3), 0) / 2 + p.minutes));
      const pct = [0.22, 0.6, 1, 1][step + (o.status === 'delivered' ? 1 : 0)];
      const msg = { new: queue.length ? `יש ${queue.length} מזכרות לפניכם` : 'אתם הבאים בתור', printing: 'מדפיסים את המזכרת שלכם', ready: 'המזכרת מוכנה!', delivered: 'נמסרה. תהנו ממנה' }[o.status];
      const sub = { new: `זמן משוער: כ־${eta} דקות`, printing: `עוד כ־${p.minutes} דקות`, ready: 'גשו לעמדת המזכרות עם המספר', delivered: 'רוצים עוד אחת? יש לכם מזכרות נוספות' }[o.status];
      const C = 2 * Math.PI * 88;
      scr.innerHTML = `<div class="${o.status === 'ready' ? 'ready' : ''}">
        <div class="ring"><svg viewBox="0 0 190 190"><circle class="bg" cx="95" cy="95" r="88"/><circle class="fg" cx="95" cy="95" r="88" stroke-dasharray="${C}" stroke-dashoffset="${C}"/></svg><div class="in"><small>מספר</small><b>#${o.num}</b></div></div>
        <p class="status-msg">${esc(msg)}</p><p class="status-sub">${esc(sub)}</p>
        <div class="track"><div class="${step >= 0 ? 'on' : ''}">התקבל</div><div class="${step >= 1 ? 'on' : ''}">בהדפסה</div><div class="${step >= 2 ? 'on' : ''}">מוכן</div></div>
        <div class="preview" id="pv"></div>
        <p class="center sub">${esc(p.name)} · ${esc(o.guest)} · ${F.time(o.createdAt)}</p>
        <button class="btn btn-theme btn-block btn-lg" id="again">מזכרת נוספת</button></div>`;
      requestAnimationFrame(() => { const fg = scr.querySelector('.ring .fg'); if (fg) fg.style.strokeDashoffset = C * (1 - pct); });
      $('#again').onclick = () => go('home');
      const ph = await photoOf(o); const pv = $('#pv'); if (pv) { pv.innerHTML = M.mockup(o.product, ph, o.caption, { tilt: true }); M.tilt(pv); }
      if (o.status === 'ready' && params.lastStatus && params.lastStatus !== 'ready') { if (navigator.vibrate) navigator.vibrate([120, 80, 120]); confetti(); }
      params.lastStatus = o.status;
    },

    async orders() {
      const list = myOrders();
      scr.innerHTML = `<h2 class="h">ההזמנות שלי</h2>${list.length ? '<div class="olist" id="ol"></div>' : '<div class="empty">עוד לא שלחתם תמונה.<br><br><button class="btn btn-theme" id="first">למזכרת הראשונה</button></div>'}`;
      if (!list.length) { $('#first').onclick = () => go('home'); return; }
      const chip = { new: 'muted', printing: 'warn', ready: 'ok', delivered: 'info' };
      $('#ol').innerHTML = list.map((o) => `<button class="orow" data-id="${o.id}"><span data-ph="${o.id}">${M.mockup(o.product, null, '', { small: true })}</span><span><b>#${o.num} · ${esc((M.db.product(o.product) || {}).name || '')}</b><small>${F.time(o.createdAt)}</small></span><span class="chip ${chip[o.status]}">${M.const.ORDER_STATUS[o.status]}</span></button>`).join('');
      $('#ol').onclick = (e) => { const b = e.target.closest('[data-id]'); if (b) go('status', { id: b.dataset.id }); };
      for (const o of list) { const ph = await photoOf(o); const el = scr.querySelector(`[data-ph="${o.id}"]`); if (el) el.innerHTML = M.mockup(o.product, ph, '', { small: true }); }
    },

    async gallery() {
      const list = M.db.list('orders').filter((o) => o.eventId === ev.id).sort((a, b) => b.createdAt - a.createdAt);
      scr.innerHTML = `<h2 class="h">הגלריה של האירוע</h2><p class="sub">${list.length} רגעים מהאורחים</p><div class="gal" id="gal">${list.map((o, i) => `<div data-g="${o.id}" style="--ar:${i % 3 ? '1' : '3/4'}" role="img" aria-label="תמונה של ${esc(o.guest)}"></div>`).join('')}</div>`;
      for (const o of list) { const ph = await photoOf(o); const el = scr.querySelector(`[data-g="${o.id}"]`); if (el && ph) el.style.backgroundImage = `url("${ph}")`; }
    },
  };

  function remaining() {
    const s = M.db.settings(), perGuest = +s.guestLimit || 2;
    const all = M.db.list('orders').filter((o) => o.eventId === ev.id);
    const pkg = M.db.packages().find((k) => k.id === ev.pkg);
    const cap = +ev.limit || (pkg ? pkg.units : 200) + 200;
    return { perGuest, guest: perGuest - myOrders().length, event: cap - all.length };
  }
  function bake(src, filter) {
    if (!filter) return Promise.resolve(src);
    return new Promise((res) => { const im = new Image(); im.onload = () => { const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight; const g = c.getContext('2d'); g.filter = filter; g.drawImage(im, 0, 0); res(c.toDataURL('image/jpeg', 0.9)); }; im.onerror = () => res(src); im.src = src; });
  }
  function confetti() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const box = document.createElement('div'); box.className = 'confetti';
    const cols = [getComputedStyle(app).getPropertyValue('--theme') || '#c9a463', '#f6efe4', '#e6cf9f', '#b8914f'];
    for (let i = 0; i < 60; i++) { const s = document.createElement('i'); s.style.cssText = `left:${Math.random() * 100}%;background:${cols[i % cols.length]};--dx:${(Math.random() - 0.5) * 160}px;--r:${Math.random() * 720}deg;animation-delay:${Math.random() * 0.4}s`; box.appendChild(s); }
    document.body.appendChild(box); setTimeout(() => box.remove(), 2800);
  }

  function enter(c) {
    const e = M.db.eventByCode(c);
    if (!e) return go('join', { code: c, err: 'לא מצאנו אירוע עם הקוד הזה. בדקו את השלט בשולחן.' }, false);
    if (e.status === 'cancelled') return go('join', { code: c, err: 'האירוע הזה לא פעיל.' }, false);
    ev = e; me.code = e.code; saveMe();
    history.replaceState({ v: 'home', p: {} }, '', '?e=' + e.code);
    go('home', {}, false);
  }
  async function onFile(e) {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try { draft.photo = await M.img.fromFile(f, 1800, 0.9); draft.filter = 'none'; go('choose'); } catch (err) { M.toast('לא הצלחנו לקרוא את התמונה', 'err'); }
  }
  $('#camFile').onchange = onFile; $('#libFile').onchange = onFile;
  function stopCam() { if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; } }
  function render() { chrome(); (views[view] || views.join)(); }

  /* עדכון חי מהעמדה */
  M.db.on((k) => {
    if (!ev) return;
    if (k === 'events' || k === '*') { const e = M.db.find('events', ev.id); if (e) ev = e; }
    if (['orders', 'events', '*'].includes(k) && ['status', 'orders', 'home'].includes(view)) render(); else chrome();
  });

  let deferred = null;
  addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; if (view === 'home') showInstall(); });
  function showInstall() {
    const slot = $('#installSlot'); if (!slot || !deferred) return;
    slot.innerHTML = `<div class="install"><p>שמרו את האפליקציה במסך הבית</p><button class="btn btn-theme btn-sm" id="inst">התקנה</button></div>`;
    $('#inst').onclick = async () => { deferred.prompt(); await deferred.userChoice; deferred = null; slot.innerHTML = ''; };
  }
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});

  const qs = new URLSearchParams(location.search).get('e');
  if (qs) enter(qs); else if (me.code && M.db.eventByCode(me.code)) enter(me.code); else { history.replaceState({ v: 'join', p: {} }, ''); render(); }
})();
