/* מומנטו – שכבת נתונים משותפת לאתר, לאפליקציה ולתוכנת הניהול.
 * כל הגישה לנתונים עוברת דרך M.db ו־M.photos. כדי לעבור לשרת אמיתי
 * (Supabase / Firebase) מחליפים רק את הקובץ הזה, בלי לגעת במסכים. */
(function () {
  'use strict';
  const M = (window.Momento = window.Momento || {});
  const NS = 'momento.v1.';
  const listeners = new Set();
  let channel = null;
  try { channel = new BroadcastChannel('momento'); } catch (e) { /* דפדפן ישן */ }

  /* ---------- קטלוג ברירת מחדל ---------- */
  const DEFAULT_PRODUCTS = [
    { id: 'wood', name: 'בלוק עץ', short: 'הדפסה ישירה על עץ מלא, עומד לבד על השולחן', minutes: 3, eventCost: 14,
      sizes: [{ id: 's', label: '10×15 ס"מ', price: 89 }, { id: 'm', label: '15×20 ס"מ', price: 129 }, { id: 'l', label: '20×30 ס"מ', price: 179 }] },
    { id: 'crystal', name: 'בלוק קריסטל', short: 'זכוכית אופטית עבה עם התמונה בפנים', minutes: 4, eventCost: 26,
      sizes: [{ id: 's', label: '8×12 ס"מ', price: 149 }, { id: 'm', label: '12×18 ס"מ', price: 199 }, { id: 'l', label: '15×20 ס"מ', price: 259 }] },
    { id: 'globe', name: 'כדור שלג', short: 'כיפת זכוכית עם שלג נוצץ והתמונה במרכז', minutes: 5, eventCost: 22,
      sizes: [{ id: 's', label: 'קוטר 8 ס"מ', price: 119 }, { id: 'm', label: 'קוטר 10 ס"מ', price: 149 }] },
    { id: 'alu', name: 'אלומיניום', short: 'הדפסה מבריקה על אלומיניום, צבעים עזים', minutes: 3, eventCost: 16,
      sizes: [{ id: 's', label: '13×18 ס"מ', price: 99 }, { id: 'm', label: '20×30 ס"מ', price: 149 }, { id: 'l', label: '30×40 ס"מ', price: 229 }] },
    { id: 'canvas', name: 'קנבס', short: 'קנבס מתוח על מסגרת עץ, מוכן לתלייה', minutes: 6, eventCost: 30,
      sizes: [{ id: 's', label: '20×30 ס"מ', price: 150 }, { id: 'm', label: '30×40 ס"מ', price: 220 }, { id: 'l', label: '50×70 ס"מ', price: 320 }] },
    { id: 'magnet', name: 'מגנט', short: 'מגנט למקרר עם עיצוב האירוע', minutes: 1, eventCost: 3,
      sizes: [{ id: 's', label: '5×7 ס"מ', price: 25 }, { id: 'm', label: '10×15 ס"מ', price: 35 }] },
  ];

  const DEFAULT_PACKAGES = [
    { id: 'classic', name: 'קלאסי', price: 3900, units: 120, hours: 4, products: ['wood', 'magnet'],
      features: ['צלם + עמדת הדפסה', '120 מזכרות', 'עיצוב מסגרת אישי', 'אפליקציה לאורחים'] },
    { id: 'premium', name: 'פרימיום', price: 5900, units: 200, hours: 5, popular: true, products: ['wood', 'crystal', 'magnet', 'alu'],
      features: ['צלם + 2 עמדות', '200 מזכרות', 'בלוקי קריסטל ואלומיניום', 'גלריה דיגיטלית לכל האורחים', 'שלט QR מעוצב לשולחנות'] },
    { id: 'royal', name: 'רויאל', price: 8900, units: 320, hours: 6, products: ['wood', 'crystal', 'globe', 'alu', 'canvas', 'magnet'],
      features: ['2 צלמים + 3 עמדות', '320 מזכרות', 'כל המוצרים כולל כדורי שלג', 'קנבס גדול לזוג במתנה', 'אלבום דיגיטלי מלא תוך 48 שעות'] },
  ];

  const EVENT_TYPES = ['חתונה', 'בר מצווה', 'בת מצווה', 'ברית / בריתה', 'חינה', 'יום הולדת', 'אירוע חברה'];
  const EVENT_STATUS = { lead: 'ליד חדש', quote: 'נשלחה הצעה', confirmed: 'מאושר', done: 'בוצע', cancelled: 'בוטל' };
  const ORDER_STATUS = { new: 'ממתין', printing: 'בהדפסה', ready: 'מוכן לאיסוף', delivered: 'נמסר' };
  const SHOP_STATUS = { new: 'חדשה', paid: 'שולמה', production: 'בייצור', shipped: 'נשלחה', delivered: 'נמסרה', cancelled: 'בוטלה' };

  const DEFAULT_SETTINGS = {
    brand: 'מומנטו', tagline: 'מזכרות חיות לאירועים', phone: '050-000-0000', whatsapp: '972500000000',
    email: 'hello@momento.example', area: 'כל הארץ', extraUnit: 22, travelFee: 0, pin: '1234', vat: 18,
  };

  /* ---------- כלים ---------- */
  const uid = (p = '') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const code = () => { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < 5; i++) s += a[Math.floor(Math.random() * a.length)]; return s; };
  const iso = (d) => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 10); };
  const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  M.util = { uid, code, iso, addDays, esc, today: () => iso(new Date()) };
  M.fmt = {
    money: (n) => '₪' + Math.round(Number(n) || 0).toLocaleString('he-IL'),
    date: (s) => (s ? new Date(s + (s.length === 10 ? 'T12:00' : '')).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', year: 'numeric' }) : ''),
    dateLong: (s) => (s ? new Date(s + 'T12:00').toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : ''),
    time: (t) => new Date(t).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }),
    ago: (t) => { const m = Math.round((Date.now() - t) / 60000); if (m < 1) return 'עכשיו'; if (m < 60) return 'לפני ' + m + ' דק׳'; const h = Math.round(m / 60); if (h < 24) return 'לפני ' + h + ' שע׳'; return 'לפני ' + Math.round(h / 24) + ' ימים'; },
  };
  M.const = { EVENT_TYPES, EVENT_STATUS, ORDER_STATUS, SHOP_STATUS };

  /* ---------- אחסון מפתח-ערך ---------- */
  function read(key, fallback) {
    try { const v = localStorage.getItem(NS + key); return v == null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
  }
  function write(key, val, silent) {
    try { localStorage.setItem(NS + key, JSON.stringify(val)); } catch (e) { console.warn('storage', e); M.toast && M.toast('האחסון מלא – לא נשמר', 'err'); return false; }
    if (!silent) emit(key);
    return true;
  }
  function emit(key) {
    listeners.forEach((fn) => { try { fn(key); } catch (e) { console.error(e); } });
    if (channel) channel.postMessage({ key });
  }
  if (channel) channel.onmessage = (ev) => listeners.forEach((fn) => fn(ev.data && ev.data.key));
  window.addEventListener('storage', (ev) => { if (ev.key && ev.key.startsWith(NS)) listeners.forEach((fn) => fn(ev.key.slice(NS.length))); });

  M.db = {
    get: read,
    set: write,
    list: (col) => read(col, []),
    find: (col, id) => read(col, []).find((x) => x.id === id),
    save(col, item) {
      const arr = read(col, []);
      const i = arr.findIndex((x) => x.id === item.id);
      if (!item.id) item.id = uid(col[0]);
      item.updatedAt = Date.now();
      if (i >= 0) arr[i] = Object.assign({}, arr[i], item); else { item.createdAt = item.createdAt || Date.now(); arr.push(item); }
      write(col, arr);
      return item;
    },
    remove(col, id) { write(col, read(col, []).filter((x) => x.id !== id)); },
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    settings: () => Object.assign({}, DEFAULT_SETTINGS, read('settings', {})),
    products: () => read('products', DEFAULT_PRODUCTS),
    packages: () => read('packages', DEFAULT_PACKAGES),
    product: (id) => M.db.products().find((p) => p.id === id),
    eventByCode: (c) => read('events', []).find((e) => e.code === String(c || '').trim().toUpperCase()),
    log(text, type = 'info') {
      const a = read('activity', []); a.unshift({ t: Date.now(), text, type }); write('activity', a.slice(0, 120));
    },
    exportAll() { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith(NS)) o[k.slice(NS.length)] = JSON.parse(localStorage.getItem(k)); } return o; },
    importAll(o) { Object.keys(o).forEach((k) => localStorage.setItem(NS + k, JSON.stringify(o[k]))); emit('*'); },
    reset() { Object.keys(localStorage).filter((k) => k.startsWith(NS)).forEach((k) => localStorage.removeItem(k)); M.photos.clear(); seed(); emit('*'); },
  };

  /* ---------- תמונות (IndexedDB) ---------- */
  let dbp = null;
  const memo = new Map();
  function idb() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open('momento-photos', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('p');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  function tx(mode, fn) { return idb().then((d) => new Promise((res, rej) => { const t = d.transaction('p', mode); const s = t.objectStore('p'); const r = fn(s); t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error); })); }
  M.photos = {
    async put(dataUrl) { const id = uid('ph'); memo.set(id, dataUrl); await tx('readwrite', (s) => s.put(dataUrl, id)); return id; },
    async get(id) { if (!id) return null; if (memo.has(id)) return memo.get(id); try { const v = await tx('readonly', (s) => s.get(id)); if (v) memo.set(id, v); return v || null; } catch (e) { return null; } },
    clear() { memo.clear(); return tx('readwrite', (s) => s.clear()).catch(() => {}); },
  };

  /* הקטנת תמונה מהטלפון לפני שמירה (שומר איכות הדפסה סבירה) */
  M.img = {
    fromFile(file, max = 1600, q = 0.86) {
      return new Promise((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => { const im = new Image(); im.onload = () => res(M.img.resize(im, max, q)); im.onerror = rej; im.src = fr.result; };
        fr.onerror = rej; fr.readAsDataURL(file);
      });
    },
    resize(src, max = 1600, q = 0.86) {
      const w = src.videoWidth || src.naturalWidth || src.width, h = src.videoHeight || src.naturalHeight || src.height;
      const k = Math.min(1, max / Math.max(w, h));
      const c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
      c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', q);
    },
  };

  /* ---------- תמונות דוגמה: סצנת אירוע מוארת מאחור (SVG) ---------- */
  const SCENES = [
    { sky: ['#f6d7a8', '#d98b4e', '#5a2a18'], light: '#ffe2a8', fig: ['#2a170d', '#4b2a18'] },
    { sky: ['#f4cfd3', '#c47584', '#3d1b28'], light: '#ffe0e6', fig: ['#2a1219', '#4a2330'] },
    { sky: ['#e4ead8', '#93a77f', '#2d3a28'], light: '#fff6d8', fig: ['#1b2116', '#334029'] },
    { sky: ['#3a3466', '#1d1838', '#0b0a16'], light: '#ffd27a', fig: ['#06050c', '#1a1530'] },
    { sky: ['#f3e3c4', '#c9a36a', '#4a3518'], light: '#fff3d6', fig: ['#22180c', '#45321a'] },
    { sky: ['#d6e4ee', '#7f9fb8', '#1f3344'], light: '#fff8e8', fig: ['#0f1a24', '#25384a'] },
  ];
  function person(x, h, kind, tilt, f) {
    const s = h / 330, top = 450 - h, hr = (kind === 'kid' ? 30 : 27) * s;
    const hy = top + 40 * s;
    let body, hair = '';
    if (kind === 'dress') {
      body = `M${x - 92 * s} 452 C${x - 70 * s} ${top + 250 * s} ${x - 34 * s} ${top + 200 * s} ${x - 30 * s} ${top + 165 * s} C${x - 40 * s} ${top + 120 * s} ${x - 50 * s} ${top + 92 * s} ${x - 40 * s} ${top + 80 * s} Q${x} ${top + 70 * s} ${x + 40 * s} ${top + 80 * s} C${x + 50 * s} ${top + 92 * s} ${x + 40 * s} ${top + 120 * s} ${x + 30 * s} ${top + 165 * s} C${x + 34 * s} ${top + 200 * s} ${x + 70 * s} ${top + 250 * s} ${x + 92 * s} 452 Z`;
      hair = `<path d="M${x - 31 * s} ${hy} C${x - 36 * s} ${hy - 38 * s} ${x + 36 * s} ${hy - 38 * s} ${x + 31 * s} ${hy} C${x + 38 * s} ${hy + 40 * s} ${x + 30 * s} ${hy + 62 * s} ${x + 20 * s} ${hy + 70 * s} L${x - 20 * s} ${hy + 70 * s} C${x - 30 * s} ${hy + 62 * s} ${x - 38 * s} ${hy + 40 * s} ${x - 31 * s} ${hy} Z"/>`;
    } else if (kind === 'kid') {
      body = `M${x - 46 * s} 452 L${x - 44 * s} ${top + 110 * s} Q${x - 42 * s} ${top + 78 * s} ${x - 18 * s} ${top + 74 * s} L${x + 18 * s} ${top + 74 * s} Q${x + 42 * s} ${top + 78 * s} ${x + 44 * s} ${top + 110 * s} L${x + 46 * s} 452 Z`;
    } else {
      body = `M${x - 72 * s} 452 L${x - 66 * s} ${top + 128 * s} Q${x - 64 * s} ${top + 86 * s} ${x - 30 * s} ${top + 78 * s} L${x - 12 * s} ${top + 72 * s} L${x + 12 * s} ${top + 72 * s} L${x + 30 * s} ${top + 78 * s} Q${x + 64 * s} ${top + 86 * s} ${x + 66 * s} ${top + 128 * s} L${x + 72 * s} 452 Z`;
      hair = `<path d="M${x - 27 * s} ${hy - 4 * s} C${x - 26 * s} ${hy - 36 * s} ${x + 26 * s} ${hy - 36 * s} ${x + 27 * s} ${hy - 4 * s} C${x + 14 * s} ${hy - 18 * s} ${x - 14 * s} ${hy - 18 * s} ${x - 27 * s} ${hy - 4 * s} Z"/>`;
    }
    const shape = `${hair}<ellipse cx="${x}" cy="${hy}" rx="${hr * .9}" ry="${hr}"/><rect x="${x - 9 * s}" y="${hy + hr * .7}" width="${18 * s}" height="${16 * s}"/><path d="${body}"/>`;
    return `<g transform="rotate(${tilt} ${x} 450)"><g fill="url(#rim)" transform="translate(${-2.2 * s} ${-1.5 * s})" opacity=".85">${shape}</g><g fill="url(#fig)">${shape}</g></g>`;
  }
  M.sample = function (seed = 0, people = 2, shape) {
    const tall = shape === 'portrait';
    const sc = SCENES[Math.abs(seed) % SCENES.length];
    const r = (i) => { const v = Math.sin(seed * 97.13 + i * 12.9898) * 43758.5453; return v - Math.floor(v); };
    let bokeh = '', lights = '';
    for (let i = 0; i < 22; i++) bokeh += `<circle cx="${(r(i) * 640 - 20).toFixed(0)}" cy="${(r(i + 40) * (tall ? 450 : 300) - (tall ? 150 : 0)).toFixed(0)}" r="${(8 + r(i + 80) * 34).toFixed(0)}" fill="${i % 3 ? sc.light : '#fff'}" opacity="${(0.12 + r(i + 120) * 0.38).toFixed(2)}"/>`;
    for (let i = 0; i <= 16; i++) { const t = i / 16, x = t * 600, y = 38 + Math.sin(t * Math.PI) * 46 + (seed % 3) * 6; lights += `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="3.2" fill="${sc.light}"/><circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="11" fill="${sc.light}" opacity=".18"/>`; }
    const xs = people === 1 ? [[300, 330, 'dress', 0]] : people === 3 ? [[205, 320, 'suit', 3], [300, 190, 'kid', 0], [395, 300, 'dress', -3]] : [[245, 335, 'suit', 4], [355, 312, 'dress', -5]];
    const figs = xs.map(([x, h, k, t]) => person(x, h, k, t)).join('');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${tall ? '40 -200 520 650' : '0 0 600 450'}" preserveAspectRatio="xMidYMid slice"><defs>
<radialGradient id="sky" gradientUnits="userSpaceOnUse" cx="300" cy="270" r="${tall ? 560 : 450}"><stop offset="0" stop-color="${sc.sky[0]}"/><stop offset=".55" stop-color="${sc.sky[1]}"/><stop offset="1" stop-color="${sc.sky[2]}"/></radialGradient>
<linearGradient id="fig" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sc.fig[1]}"/><stop offset="1" stop-color="${sc.fig[0]}"/></linearGradient>
<linearGradient id="rim" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${sc.light}"/><stop offset="1" stop-color="${sc.light}" stop-opacity="0"/></linearGradient>
<radialGradient id="vig" gradientUnits="userSpaceOnUse" cx="300" cy="${tall ? 155 : 225}" r="${tall ? 430 : 380}"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></radialGradient>
<radialGradient id="glow" cx="50%" cy="62%" r="40%"><stop offset="0" stop-color="${sc.light}" stop-opacity=".75"/><stop offset="1" stop-color="${sc.light}" stop-opacity="0"/></radialGradient>
<filter id="b" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="7"/></filter>
<filter id="g"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="${seed % 50}"/><feColorMatrix values="0 0 0 0 .5  0 0 0 0 .45  0 0 0 0 .4  0 0 0 .09 0"/></filter></defs>
<rect x="-300" y="-400" width="1200" height="850" fill="url(#sky)"/><g filter="url(#b)">${bokeh}</g><g opacity=".9">${lights}</g><ellipse cx="300" cy="300" rx="260" ry="190" fill="url(#glow)"/>
${figs}<rect x="-300" y="-400" width="1200" height="850" fill="url(#vig)"/><rect x="-300" y="-400" width="1200" height="850" filter="url(#g)"/></svg>`;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  };

  /* ---------- הדמיית מוצר תלת־ממדית עם התמונה של הלקוח ---------- */
  M.mockup = function (productId, photo, caption, opts = {}) {
    const url = photo ? `url('${String(photo).replace(/'/g, '%27')}')` : '';
    const img = url ? `style="background-image:${url}"` : '';
    const cap = caption ? `<span class="mk-cap">${esc(caption)}</span>` : '';
    const cls = `mk mk-${productId}${opts.small ? ' mk-sm' : ''}${opts.flat ? ' mk-flat' : ''}${opts.tilt ? ' tiltable' : ''}`;
    const side = url && productId === 'canvas' ? ` style="--side-img:${url}"` : '';
    if (productId === 'globe') return `<div class="${cls}"><div class="mk-obj"><div class="mk-dome"><div class="mk-photo" ${img}></div><i class="mk-snow"></i><i class="mk-gloss"></i></div><div class="mk-base">${cap}</div></div><i class="mk-shadow"></i></div>`;
    return `<div class="${cls}"${side}><div class="mk-obj"><div class="mk-face"><div class="mk-photo" ${img}></div>${cap}<i class="mk-gloss"></i></div><i class="mk-side"></i><i class="mk-top"></i></div><i class="mk-shadow"></i></div>`;
  };

  /* הטיית ההדמיה עם העכבר או האצבע */
  M.tilt = function (root = document) {
    root.querySelectorAll('.tiltable:not([data-tilt])').forEach((el) => {
      el.dataset.tilt = '1';
      const obj = el.querySelector('.mk-obj'); if (!obj) return;
      const move = (cx, cy) => { const b = el.getBoundingClientRect(); const x = (cx - b.left) / b.width - 0.5, y = (cy - b.top) / b.height - 0.5; el.classList.add('tilt'); obj.style.transform = `rotateX(${(-y * 22 - 4).toFixed(1)}deg) rotateY(${(x * 46 - 6).toFixed(1)}deg)`; };
      const reset = () => { el.classList.remove('tilt'); obj.style.transform = ''; };
      el.addEventListener('pointermove', (e) => move(e.clientX, e.clientY));
      el.addEventListener('pointerleave', reset);
      el.addEventListener('touchend', reset, { passive: true });
    });
  };

  /* חשיפה עדינה בזמן גלילה */
  M.reveal = function (root = document) {
    const els = root.querySelectorAll('.rv:not(.in)');
    if (!('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('in')); return; }
    const io = new IntersectionObserver((ents) => ents.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } }), { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    els.forEach((e) => io.observe(e));
  };

  /* ---------- הודעות קופצות ---------- */
  M.toast = function (text, type = 'ok') {
    let box = document.getElementById('mk-toasts');
    if (!box) { box = document.createElement('div'); box.id = 'mk-toasts'; box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
    const t = document.createElement('div'); t.className = 'mk-toast ' + type; t.textContent = text; box.appendChild(t);
    setTimeout(() => t.classList.add('out'), 3200); setTimeout(() => t.remove(), 3700);
  };

  /* ---------- נתוני פתיחה (דמו) ---------- */
  function seed() {
    if (read('seeded', false)) return;
    const names = [['נועה', 'אורי', 'לוי'], ['שירה', 'דניאל', 'כהן'], ['מאיה', 'איתי', 'מזרחי'], ['טל', 'עומר', 'פרץ'], ['יעל', 'רועי', 'אברהם'], ['הדר', 'אלון', 'ביטון'], ['רוני', 'עידו', 'שושן'], ['אור', 'נתן', 'גבאי'], ['ליה', 'יונתן', 'חדד'], ['עדי', 'גיא', 'דהן'], ['תמר', 'אריאל', 'אזולאי'], ['ספיר', 'אביב', 'עמר']];
    const venues = ['גן האירועים "הדר", ראשון לציון', 'אולמי "לגונה", אשדוד', 'חוות "השקמים", בית שמש', 'אולם "קיסר", באר שבע', 'גני "אגדה", חולון', 'מלון "ים", תל אביב'];
    const pk = DEFAULT_PACKAGES;
    const ev = (i, offset, status, type, extra = {}) => {
      const n = names[i % names.length]; const p = pk[i % 3];
      const isWed = type === 'חתונה';
      return Object.assign({
        id: 'e' + i, code: i === 0 ? 'DEMO1' : code(), type, date: addDays(offset), time: '19:30', venue: venues[i % venues.length],
        client: isWed ? `${n[0]} ו${n[1]}` : `משפחת ${n[2]}`, phone: '05' + (2 + (i % 7)) + '-' + (1000000 + i * 734521).toString().slice(0, 7),
        email: '', guests: 250 + i * 40, pkg: p.id, price: p.price, deposit: status === 'confirmed' || status === 'done' ? Math.round(p.price * 0.3) : 0,
        status, products: p.products.slice(), frameText: isWed ? `${n[0]} & ${n[1]}` : `${type} – ${n[2]}`, theme: ['#b5653a', '#6f9886', '#c36f86', '#7d6fb8', '#c99a38', '#5b8fb0'][i % 6],
        staff: ['אבי', 'מורן'].slice(0, 1 + (i % 2)), notes: '', createdAt: Date.now() - (20 - i) * 86400000,
      }, extra);
    };
    const events = [
      ev(0, 0, 'confirmed', 'חתונה', { theme: '#c9a463', notes: 'אירוע הדגמה – פתחו את האפליקציה עם הקוד DEMO1' }),
      ev(1, 4, 'confirmed', 'בר מצווה'), ev(2, 9, 'confirmed', 'חתונה'), ev(3, 16, 'quote', 'חינה'),
      ev(4, 23, 'lead', 'בת מצווה'), ev(5, 31, 'lead', 'אירוע חברה'), ev(6, -6, 'done', 'חתונה'), ev(7, -13, 'done', 'ברית / בריתה'),
      ev(8, -27, 'done', 'חתונה'), ev(9, -41, 'done', 'בר מצווה'), ev(10, -58, 'done', 'חתונה'), ev(11, -75, 'cancelled', 'יום הולדת'),
    ];
    write('events', events, true);

    const guests = ['סבתא רחל', 'דוד משה', 'רוני', 'עדי ושחר', 'מיכל', 'החבר׳ה מהצבא', 'משפחת גולן', 'ליאור', 'אלה', 'נדב'];
    const prods = ['wood', 'magnet', 'wood', 'crystal', 'magnet', 'wood', 'alu', 'wood', 'magnet', 'crystal'];
    const st = ['delivered', 'delivered', 'delivered', 'ready', 'ready', 'printing', 'printing', 'new', 'new', 'new'];
    const orders = guests.map((g, i) => ({ id: 'o' + i, num: 101 + i, eventId: 'e0', guest: g, product: prods[i], sample: i + 3, caption: events[0].frameText, status: st[i], createdAt: Date.now() - (60 - i * 6) * 60000 }));
    for (let k = 6; k <= 10; k++) for (let j = 0; j < 14; j++) orders.push({ id: `o${k}_${j}`, num: 1 + j, eventId: 'e' + k, guest: guests[j % guests.length], product: prods[j % prods.length], sample: j + k, caption: events[k].frameText, status: 'delivered', createdAt: new Date(events[k].date + 'T21:00').getTime() + j * 300000 });
    write('orders', orders, true);

    const shop = [
      { id: 's1', num: 5001, customer: 'אורית שמעוני', phone: '052-4433221', city: 'חיפה', address: 'הנביאים 12', items: [{ product: 'canvas', size: 'm', qty: 1, caption: 'משפחת שמעוני 2026', sample: 2 }], total: 220, status: 'production', createdAt: Date.now() - 2 * 86400000 },
      { id: 's2', num: 5002, customer: 'יוסי בן דוד', phone: '054-9988776', city: 'מודיעין', address: 'עמק החולה 4', items: [{ product: 'crystal', size: 'l', qty: 1, caption: 'לאמא באהבה', sample: 4 }, { product: 'magnet', size: 's', qty: 4, caption: '', sample: 4 }], total: 359, status: 'paid', createdAt: Date.now() - 86400000 },
      { id: 's3', num: 5003, customer: 'רינת אזולאי', phone: '050-1122334', city: 'נתניה', address: 'הרצל 90', items: [{ product: 'globe', size: 'm', qty: 2, caption: 'חנוכה שמח', sample: 5 }], total: 298, status: 'new', createdAt: Date.now() - 3 * 3600000 },
      { id: 's4', num: 4998, customer: 'קרן לוי', phone: '053-7766554', city: 'אשקלון', address: 'בן גוריון 7', items: [{ product: 'wood', size: 'l', qty: 1, caption: '', sample: 1 }], total: 179, status: 'delivered', createdAt: Date.now() - 9 * 86400000 },
    ];
    write('shop', shop, true);
    write('inventory', { wood: 340, crystal: 64, globe: 38, alu: 120, canvas: 22, magnet: 900 }, true);
    write('minStock', { wood: 150, crystal: 60, globe: 30, alu: 60, canvas: 15, magnet: 300 }, true);
    write('staff', [{ id: 'st1', name: 'אבי', role: 'צלם', phone: '050-1111111' }, { id: 'st2', name: 'מורן', role: 'מפעילת עמדה', phone: '050-2222222' }, { id: 'st3', name: 'שי', role: 'צלם', phone: '050-3333333' }], true);
    write('activity', [{ t: Date.now() - 3600000, text: 'הזמנה 5003 התקבלה מהחנות', type: 'shop' }, { t: Date.now() - 7200000, text: 'אירוע של נועה ואורי אושר', type: 'event' }], true);
    write('seeded', true, true);
  }
  seed();
})();
