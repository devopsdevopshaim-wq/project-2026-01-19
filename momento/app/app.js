(function () {
  'use strict';
  const M = window.Momento, { esc } = M.util, $ = (s, r = document) => r.querySelector(s);
  const scr = $('#screen'), app = $('#app');
  const KEY = 'momento.guest';
  let me = {}; try { me = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { me = {}; }
  const saveMe = () => { try { localStorage.setItem(KEY, JSON.stringify(me)); } catch (e) {} };
  let ev = null, view = 'join', params = {}, stream = null, draft = { photo: null, product: null };

  const ICON = {
    cam: '<svg viewBox="0 0 24 24"><path d="M12 8.5a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM20 5h-3.2L15 3H9L7.2 5H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Z"/></svg>',
    img: '<svg viewBox="0 0 24 24"><path d="M21 19V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2ZM8.5 13.5l2.5 3 3.5-4.5 4.5 6H5Z"/></svg>',
    list: '<svg viewBox="0 0 24 24"><path d="M3 13h2v-2H3Zm0 4h2v-2H3Zm0-8h2V7H3Zm4 4h14v-2H7Zm0 4h14v-2H7ZM7 7v2h14V7Z"/></svg>',
  };

  /* ---------- ניווט ---------- */
  function go(v, p = {}, push = true) {
    stopCam();
    view = v; params = p;
    if (push) history.pushState({ v, p }, '');
    render();
    scrollTo(0, 0);
  }
  addEventListener('popstate', (e) => { const s = e.state || { v: ev ? 'home' : 'join', p: {} }; go(s.v, s.p, false); });
  $('#back').onclick = () => history.back();
  $('#mine').onclick = () => go('orders');
  $('#tabs').onclick = (e) => { const b = e.target.closest('[data-go]'); if (b) go(b.dataset.go); };

  function myOrders() { const ids = new Set(me.orders || []); return M.db.list('orders').filter((o) => ids.has(o.id) && o.eventId === (ev && ev.id)).sort((a, b) => b.createdAt - a.createdAt); }
  const photoOf = (o) => (o.photoId ? M.photos.get(o.photoId) : Promise.resolve(M.sample(o.sample || 0)));

  function chrome() {
    const inEvent = !!ev && view !== 'join';
    $('#tabs').hidden = !inEvent;
    $('#back').hidden = !inEvent || ['home', 'orders', 'gallery'].includes(view);
    const mine = inEvent ? myOrders() : [];
    $('#mine').hidden = !inEvent || !mine.length;
    $('#mineCount').textContent = mine.filter((o) => o.status !== 'delivered').length || mine.length;
    $('#evTitle').textContent = ev ? ev.frameText || ev.client : M.db.settings().brand;
    $('#evSub').textContent = ev ? `${ev.type} · ${M.fmt.date(ev.date)}` : M.db.settings().tagline;
    if (ev && ev.theme) { app.style.setProperty('--theme', ev.theme); document.querySelector('meta[name=theme-color]').content = ev.theme; }
    document.querySelectorAll('#tabs [data-go]').forEach((b) => b.toggleAttribute('aria-current', b.dataset.go === view || (b.dataset.go === 'home' && ['camera', 'choose'].includes(view))));
  }

  /* ---------- מסכים ---------- */
  const views = {
    join() {
      scr.innerHTML = `<div class="join">
        <div class="logo-mark">m</div>
        <h1 class="h">ברוכים הבאים!</h1>
        <p class="sub">הקלידו את קוד האירוע שמופיע על השלט בשולחן, או סרקו את קוד ה־QR</p>
        <form id="joinForm" class="stack"><input class="input code-in" id="codeIn" maxlength="6" autocomplete="off" autocapitalize="characters" placeholder="•••••" aria-label="קוד אירוע" value="${esc(params.code || '')}">
        <button class="btn btn-primary btn-block">כניסה לאירוע</button></form>
        ${params.err ? `<p class="note">${esc(params.err)}</p>` : ''}
        <p class="demo-hint">רוצים לנסות? <button id="demo">היכנסו לאירוע הדגמה</button></p>
      </div>`;
      $('#joinForm').onsubmit = (e) => { e.preventDefault(); enter($('#codeIn').value); };
      $('#demo').onclick = () => enter('DEMO1');
    },

    home() {
      const left = remaining();
      const mine = myOrders();
      const notToday = ev.date !== M.util.today();
      scr.innerHTML = `
        <section class="ev-hero"><h2>${esc(ev.frameText || ev.client)}</h2><p>${esc(ev.type)} · ${M.fmt.dateLong(ev.date)}</p><p>${esc(ev.venue || '')}</p></section>
        <div class="big-btns">
          <button class="big-btn main" id="snap">${ICON.cam}מצטלמים עכשיו</button>
          <button class="big-btn" id="pick">${ICON.img}תמונה מהגלריה</button>
          <button class="big-btn" data-go2="orders">${ICON.list}ההזמנות שלי${mine.length ? ` (${mine.length})` : ''}</button>
        </div>
        ${left.guest <= 0 ? `<p class="note">הגעתם למקסימום המזכרות לאורח באירוע הזה (${left.perGuest}). אפשר להזמין עוד מהחנות באתר שלנו.</p>` : `<p class="note">כל אורח יכול לקבל עד ${left.perGuest} מזכרות. נשארו לכם ${left.guest}.</p>`}
        ${notToday ? `<p class="note">האירוע מתקיים ב־${M.fmt.dateLong(ev.date)}. אפשר כבר לשלוח תמונה, והיא תודפס ביום האירוע.</p>` : ''}
        <div id="installSlot"></div>`;
      $('#snap').onclick = () => (left.guest > 0 && left.event > 0 ? go('camera') : M.toast('אין יותר מזכרות זמינות', 'err'));
      $('#pick').onclick = () => (left.guest > 0 && left.event > 0 ? $('#libFile').click() : M.toast('אין יותר מזכרות זמינות', 'err'));
      scr.querySelector('[data-go2]').onclick = () => go('orders');
      showInstall();
    },

    async camera() {
      scr.innerHTML = `<h2 class="h">חייכו! 📸</h2><p class="sub">עמדו קרוב, באור טוב. אחרי הצילום תבחרו מוצר.</p>
        <div class="cam"><video id="vid" playsinline autoplay muted></video><div class="frame"><span>${esc(ev.frameText || '')}</span></div><div class="cam-count" id="count"></div></div>
        <div class="cam-ctl"><button class="btn btn-ghost btn-sm" id="flip">החלפת מצלמה</button><button class="shutter" id="shutter" aria-label="צילום"></button><button class="btn btn-ghost btn-sm" id="fromLib">מהגלריה</button></div>`;
      $('#fromLib').onclick = () => $('#libFile').click();
      let facing = 'user';
      const start = async () => {
        stopCam();
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false });
          const v = $('#vid'); if (!v) return stopCam(); v.srcObject = stream; v.style.transform = facing === 'user' ? 'scaleX(-1)' : 'none';
        } catch (e) { stopCam(); $('#camFile').click(); }
      };
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { $('#camFile').click(); } else start();
      $('#flip').onclick = () => { facing = facing === 'user' ? 'environment' : 'user'; start(); };
      $('#shutter').onclick = async () => {
        const c = $('#count'), v = $('#vid');
        if (!stream || !v.videoWidth) { $('#camFile').click(); return; }
        for (let i = 3; i > 0; i--) { c.textContent = i; await new Promise((r) => setTimeout(r, 750)); }
        c.textContent = '';
        const cv = document.createElement('canvas'); cv.width = v.videoWidth; cv.height = v.videoHeight;
        const g = cv.getContext('2d'); if (facing === 'user') { g.translate(cv.width, 0); g.scale(-1, 1); } g.drawImage(v, 0, 0);
        draft.photo = M.img.resize(cv, 1800, 0.9);
        go('choose', {}, true);
      };
    },

    choose() {
      if (!draft.photo) return go('home', {}, false);
      const prods = (ev.products || []).map((id) => M.db.product(id)).filter(Boolean);
      if (!draft.product || !prods.find((p) => p.id === draft.product)) draft.product = prods[0] && prods[0].id;
      scr.innerHTML = `<h2 class="h">בחרו מזכרת</h2><p class="sub">כל המזכרות באירוע הן מתנה מבעלי השמחה 🎁</p>
        <div class="preview" id="pv"></div>
        <div class="prods" role="radiogroup" aria-label="מוצר">${prods.map((p) => `<button class="pcard" role="radio" data-p="${p.id}" aria-checked="${p.id === draft.product}">${M.mockup(p.id, draft.photo, '', { small: true })}<b>${esc(p.name)}</b><small>מוכן תוך ~${p.minutes} דק׳</small></button>`).join('')}</div>
        <form id="sendForm" class="stack" style="margin-top:18px">
          <label class="field"><span>השם שלכם (כדי שנקרא לכם לאסוף)</span><input class="input" id="gName" required maxlength="30" value="${esc(me.name || '')}" autocomplete="name"></label>
          <label class="field"><span>ברכה קצרה לבעלי השמחה (לא חובה)</span><input class="input" id="gMsg" maxlength="80" placeholder="מזל טוב!"></label>
          <button class="btn btn-primary btn-block" id="sendBtn">שליחה להדפסה</button>
          <button class="btn btn-ghost btn-block" type="button" id="retake">צילום מחדש</button>
        </form>`;
      const pv = () => { $('#pv').innerHTML = M.mockup(draft.product, draft.photo, ev.frameText); };
      pv();
      scr.querySelector('.prods').onclick = (e) => { const b = e.target.closest('[data-p]'); if (!b) return; draft.product = b.dataset.p; scr.querySelectorAll('.pcard').forEach((x) => x.setAttribute('aria-checked', x === b)); pv(); };
      $('#retake').onclick = () => { draft.photo = null; history.back(); };
      $('#sendForm').onsubmit = async (e) => {
        e.preventDefault();
        const name = $('#gName').value.trim(); if (!name) { $('#gName').focus(); return; }
        const left = remaining(); if (left.guest <= 0 || left.event <= 0) { M.toast('אין יותר מזכרות זמינות', 'err'); return; }
        $('#sendBtn').disabled = true; $('#sendBtn').textContent = 'שולח…';
        try {
          const photoId = await M.photos.put(draft.photo);
          const num = Math.max(100, ...M.db.list('orders').filter((o) => o.eventId === ev.id).map((o) => o.num || 0)) + 1;
          const o = M.db.save('orders', { num, eventId: ev.id, guest: name, product: draft.product, photoId, caption: ev.frameText, message: $('#gMsg').value.trim(), status: 'new' });
          me.name = name; me.orders = (me.orders || []).concat(o.id); saveMe();
          draft = { photo: null, product: draft.product };
          M.db.log(`מזכרת #${num} נשלחה מהאפליקציה (${ev.client})`, 'order');
          history.replaceState({ v: 'status', p: { id: o.id } }, ''); go('status', { id: o.id }, false);
        } catch (err) { console.error(err); M.toast('השליחה נכשלה, נסו שוב', 'err'); $('#sendBtn').disabled = false; $('#sendBtn').textContent = 'שליחה להדפסה'; }
      };
    },

    async status() {
      const o = M.db.find('orders', params.id); if (!o) return go('orders', {}, false);
      const p = M.db.product(o.product) || { name: o.product };
      const step = { new: 0, printing: 1, ready: 2, delivered: 2 }[o.status] || 0;
      const ahead = M.db.list('orders').filter((x) => x.eventId === o.eventId && x.status === 'new' && x.createdAt < o.createdAt).length;
      const msg = { new: ahead ? `יש ${ahead} מזכרות לפניכם בתור` : 'אתם הבאים בתור!', printing: 'המזכרת שלכם בהדפסה עכשיו', ready: 'המזכרת מוכנה! גשו לעמדה עם המספר', delivered: 'נמסר. תהנו מהמזכרת! 💛' }[o.status];
      scr.innerHTML = `<div class="status-card ${o.status === 'ready' ? 'ready-pulse' : ''}">
          <small>מספר ההזמנה שלכם</small><div class="status-num">#${o.num}</div><b>${esc(msg)}</b>
          <div class="track"><span class="fill" style="width:${step * 34}%"></span>
            <div class="${step >= 0 ? 'on' : ''}"><i>1</i>התקבל</div><div class="${step >= 1 ? 'on' : ''}"><i>2</i>בהדפסה</div><div class="${step >= 2 ? 'on' : ''}"><i>3</i>מוכן</div></div>
        </div>
        <div class="preview" style="margin-top:16px" id="pv"></div>
        <p class="center sub">${esc(p.name)} · ${esc(o.guest)} · ${M.fmt.time(o.createdAt)}</p>
        <button class="btn btn-primary btn-block" id="again">מזכרת נוספת</button>`;
      $('#again').onclick = () => go('home');
      const ph = await photoOf(o); const pv = $('#pv'); if (pv) pv.innerHTML = M.mockup(o.product, ph, o.caption);
      if (o.status === 'ready' && navigator.vibrate && params.lastStatus !== 'ready') navigator.vibrate([120, 80, 120]);
      params.lastStatus = o.status;
    },

    async orders() {
      const list = myOrders();
      scr.innerHTML = `<h2 class="h">ההזמנות שלי</h2>${list.length ? '<div class="olist" id="ol"></div>' : '<div class="empty">עוד לא שלחתם תמונה.<br><br><button class="btn btn-primary" id="first">למזכרת הראשונה</button></div>'}`;
      if (!list.length) { $('#first').onclick = () => go('home'); return; }
      const chip = { new: 'muted', printing: 'warn', ready: 'ok', delivered: 'info' };
      $('#ol').innerHTML = list.map((o) => `<button class="orow" data-id="${o.id}"><span data-ph="${o.id}">${M.mockup(o.product, null, '', { small: true })}</span><span><b>#${o.num} · ${esc((M.db.product(o.product) || {}).name || '')}</b><small>${M.fmt.time(o.createdAt)}</small></span><span class="chip ${chip[o.status]}">${M.const.ORDER_STATUS[o.status]}</span></button>`).join('');
      $('#ol').onclick = (e) => { const b = e.target.closest('[data-id]'); if (b) go('status', { id: b.dataset.id }); };
      for (const o of list) { const ph = await photoOf(o); const el = scr.querySelector(`[data-ph="${o.id}"]`); if (el) el.innerHTML = M.mockup(o.product, ph, '', { small: true }); }
    },

    async gallery() {
      const list = M.db.list('orders').filter((o) => o.eventId === ev.id).sort((a, b) => b.createdAt - a.createdAt);
      scr.innerHTML = `<h2 class="h">הגלריה של האירוע</h2><p class="sub">${list.length} תמונות מהאורחים</p><div class="gal" id="gal">${list.map((o) => `<div data-g="${o.id}" role="img" aria-label="תמונה של ${esc(o.guest)}"></div>`).join('')}</div>`;
      for (const o of list) { const ph = await photoOf(o); const el = scr.querySelector(`[data-g="${o.id}"]`); if (el && ph) el.style.backgroundImage = `url("${ph}")`; }
    },
  };

  function remaining() {
    const s = M.db.settings(); const perGuest = +s.guestLimit || 2;
    const all = M.db.list('orders').filter((o) => o.eventId === ev.id);
    const pkg = M.db.packages().find((k) => k.id === ev.pkg);
    const cap = +ev.limit || (pkg ? pkg.units : 200) + 200;
    return { perGuest, guest: perGuest - myOrders().length, event: cap - all.length };
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
    try { draft.photo = await M.img.fromFile(f, 1800, 0.9); go('choose'); } catch (err) { M.toast('לא הצלחנו לקרוא את התמונה', 'err'); }
  }
  $('#camFile').onchange = onFile; $('#libFile').onchange = onFile;

  function stopCam() { if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; } }

  function render() { chrome(); (views[view] || views.join)(); }

  /* עדכון חי כשהצוות משנה סטטוס בעמדה */
  M.db.on((k) => {
    if (!ev) return;
    if (k === 'events' || k === '*') { const e = M.db.find('events', ev.id); if (e) ev = e; }
    if (['orders', 'events', '*'].includes(k) && ['status', 'orders', 'home'].includes(view)) render();
    else chrome();
  });

  /* התקנה כאפליקציה */
  let deferred = null;
  addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; if (view === 'home') showInstall(); });
  function showInstall() {
    const slot = $('#installSlot'); if (!slot || !deferred) return;
    slot.innerHTML = `<div class="install"><p>להוסיף את האפליקציה למסך הבית?</p><button class="btn btn-soft btn-sm" id="inst">התקנה</button></div>`;
    $('#inst').onclick = async () => { deferred.prompt(); await deferred.userChoice; deferred = null; slot.innerHTML = ''; };
  }
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

  /* התחלה */
  const qs = new URLSearchParams(location.search).get('e');
  if (qs) enter(qs);
  else if (me.code && M.db.eventByCode(me.code)) enter(me.code);
  else { history.replaceState({ v: 'join', p: {} }, ''); render(); }
})();
