(function () {
  'use strict';
  const M = window.Momento, { esc } = M.util, F = M.fmt;
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  let S = M.db.settings(), P = M.db.products(), K = M.db.packages();
  const minPrice = (p) => Math.min(...p.sizes.map((s) => s.price));
  const wa = (text) => 'https://wa.me/' + S.whatsapp + '?text=' + encodeURIComponent(text);
  const ss = { get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { sessionStorage.setItem(k, v); return true; } catch (e) { return false; } } };
  let userPhoto = ss.get('momento.photo');

  /* ---------- פרטי העסק ---------- */
  function applySettings() {
    S = M.db.settings();
    $$('[data-s]').forEach((el) => { if (S[el.dataset.s]) el.textContent = S[el.dataset.s]; });
    const hi = 'היי, אשמח לשמוע על עמדת מזכרות לאירוע שלנו';
    ['#cWa', '#mWa', '#faqWa', '#waBook'].forEach((s) => ($(s).href = wa(hi)));
    $('#cPhone').href = 'tel:' + S.phone.replace(/[^0-9+]/g, ''); $('#cMail').href = 'mailto:' + S.email;
    $('#extraUnit').textContent = F.money(S.extraUnit) + ' ליחידה';
  }

  /* ---------- כותרת, תפריט, גלילה ---------- */
  const top = $('#top'), nav = $('#nav'), burger = $('#burger'), hero = $('.hero');
  const setMenu = (o) => { nav.classList.toggle('open', o); burger.setAttribute('aria-expanded', o); burger.setAttribute('aria-label', o ? 'סגירת תפריט' : 'פתיחת תפריט'); document.body.style.overflow = o ? 'hidden' : ''; };
  burger.onclick = () => setMenu(!nav.classList.contains('open'));
  nav.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { setMenu(false); closeDrawer(); } });
  function onScroll() {
    const past = scrollY > hero.offsetHeight - 90;
    top.classList.toggle('solid', past);
    $('#mbar').classList.toggle('show', scrollY > hero.offsetHeight * 0.8 && !isNear('#book'));
  }
  function isNear(sel) { const r = $(sel).getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; }
  addEventListener('scroll', onScroll, { passive: true });
  if ('IntersectionObserver' in window) {
    const links = $$('.nav a[href^="#"]:not(.btn)');
    const io = new IntersectionObserver((ents) => ents.forEach((en) => { if (en.isIntersecting) links.forEach((a) => a.classList.toggle('on', a.getAttribute('href') === '#' + en.target.id)); }), { rootMargin: '-45% 0px -50% 0px' });
    links.forEach((a) => { const t = $(a.getAttribute('href')); if (t) io.observe(t); });
  }

  /* ---------- פתיח: מוצר מתחלף בזרקור ---------- */
  const heroSet = [['wood', 0, 2, 'נועה & אורי'], ['crystal', 1, 2, ''], ['globe', 2, 3, 'ברית · 2026'], ['canvas', 4, 2, ''], ['alu', 3, 2, ''], ['magnet', 5, 3, 'בת מצווה של אלה']];
  let heroI = 0, heroTimer = null;
  $('#heroDots').innerHTML = heroSet.map((h, i) => `<button role="tab" aria-label="${esc((M.db.product(h[0]) || {}).name)}" aria-selected="${i === 0}" data-i="${i}"></button>`).join('');
  function showHero(i) {
    heroI = (i + heroSet.length) % heroSet.length;
    const [p, seed, ppl, cap] = heroSet[heroI];
    const box = $('#heroProd'), old = box.firstElementChild;
    const html = M.mockup(p, userPhoto || M.sample(seed, ppl), userPhoto ? '' : cap, { tilt: true }).replace('class="mk', `class="${p === 'globe' ? 'globe-s ' : ''}mk`);
    const put = () => { box.innerHTML = html; M.tilt(box); };
    if (old) { old.classList.add('out'); setTimeout(put, 380); } else put();
    $('#heroName').textContent = (M.db.product(p) || {}).name || '';
    $$('#heroDots button').forEach((b, j) => b.setAttribute('aria-selected', j === heroI));
  }
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const heroAuto = () => { clearInterval(heroTimer); if (!reduced) heroTimer = setInterval(() => showHero(heroI + 1), 4200); };
  $('#heroDots').onclick = (e) => { const b = e.target.closest('[data-i]'); if (b) { showHero(+b.dataset.i); heroAuto(); } };
  $('#heroStage').addEventListener('pointerenter', () => clearInterval(heroTimer));
  $('#heroStage').addEventListener('pointerleave', heroAuto);

  /* ---------- נסו עם תמונה שלכם ---------- */
  function renderTry() {
    $('#tryRow').innerHTML = P.map((p, i) => `<figure>${M.mockup(p.id, userPhoto || M.sample(i + 1, p.id === 'globe' ? 3 : 2), '', { tilt: true })}<figcaption>${esc(p.name)}</figcaption></figure>`).join('');
    M.tilt($('#tryRow'));
    $('#tryHint').textContent = userPhoto ? 'זו התמונה שלכם ✦ אפשר להזמין אותה בחנות למטה' : 'העבירו את העכבר על המוצרים כדי לסובב אותם';
  }
  async function takePhoto(file) {
    if (!file || !file.type.startsWith('image/')) { M.toast('בחרו קובץ תמונה', 'err'); return; }
    try {
      userPhoto = await M.img.fromFile(file, 1600, 0.88);
      if (!ss.set('momento.photo', userPhoto)) { /* תמונה גדולה מדי לזיכרון הזמני – ממשיכים בלי לשמור */ }
      renderTry(); showHero(heroI); shop.photo = userPhoto; markUpload(file.name); renderShop();
      M.toast('התמונה שלכם על המוצרים');
    } catch (e) { M.toast('לא הצלחנו לקרוא את התמונה', 'err'); }
  }
  $('#tryFile').onchange = (e) => takePhoto(e.target.files[0]);

  /* ---------- החוויה ---------- */
  $('#expImg').style.backgroundImage = `url("${M.sample(4, 2, 'portrait')}")`;
  $('#expFloat').innerHTML = M.mockup('crystal', M.sample(1, 2), '');

  /* ---------- הקולקציה ---------- */
  let collI = 0;
  const where = { wood: 'באירוע ובחנות', crystal: 'באירוע ובחנות', globe: 'באירוע ובחנות', alu: 'באירוע ובחנות', canvas: 'בעיקר בחנות ובחבילת רויאל', magnet: 'באירוע ובחנות' };
  function renderColl() {
    $('#collList').innerHTML = P.map((p, i) => `<button role="tab" aria-selected="${i === collI}" data-i="${i}"><small>0${i + 1}</small>${esc(p.name)}</button>`).join('');
    const p = P[collI];
    $('#collStage').innerHTML = M.mockup(p.id, userPhoto || M.sample(collI + 2, p.id === 'globe' ? 3 : 2), userPhoto ? '' : (p.id === 'magnet' || p.id === 'globe' ? 'מזל טוב' : 'נועה & אורי'), { tilt: true });
    M.tilt($('#collStage'));
    $('#collInfo').innerHTML = `<h3>${esc(p.name)}</h3><p>${esc(p.short)}</p>
      <dl><dt>זמן הכנה</dt><dd>כ־${p.minutes} דקות</dd><dt>זמין</dt><dd>${where[p.id] || 'באירוע ובחנות'}</dd><dt>גדלים</dt><dd><div class="sz">${p.sizes.map((s) => `<span>${esc(s.label)}</span>`).join('')}</div></dd><dt>בחנות</dt><dd>מ־${F.money(minPrice(p))}</dd></dl>
      <a class="btn btn-primary" href="#shop" data-shop="${p.id}">לעיצוב והזמנה <span class="arr">←</span></a>`;
  }
  $('#collList').onclick = (e) => { const b = e.target.closest('[data-i]'); if (b) { collI = +b.dataset.i; renderColl(); } };
  $('#collList').addEventListener('keydown', (e) => { if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { collI = (collI + 1) % P.length; renderColl(); $('#collList [aria-selected=true]').focus(); e.preventDefault(); } if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { collI = (collI - 1 + P.length) % P.length; renderColl(); $('#collList [aria-selected=true]').focus(); e.preventDefault(); } });
  $('#collInfo').onclick = (e) => { const b = e.target.closest('[data-shop]'); if (b) { shop.product = b.dataset.shop; shop.size = null; renderShop(); } };

  /* ---------- חבילות ---------- */
  const TIER = ['I', 'II', 'III'];
  function renderPackages() {
    $('#pkgGrid').innerHTML = K.map((k, i) => `
      <article class="pkg rv d${i + 1} ${k.popular ? 'pop' : ''}">
        ${k.popular ? '<span class="badge">✦ הנבחרת שלנו</span>' : ''}
        <span class="tier">חבילה ${TIER[i] || i + 1}</span>
        <h3>${esc(k.name)}</h3>
        <div class="price">${F.money(k.price)}<small>כולל מע״מ</small></div>
        <p class="per">${k.units} מזכרות · ${k.hours} שעות · ${k.products.length} סוגי מוצרים</p>
        <ul>${k.features.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
        <a class="btn ${k.popular ? 'btn-gold' : 'btn-primary'} btn-block" href="#book" data-pkg="${k.id}">בדיקת תאריך לחבילה</a>
      </article>`).join('');
    const rows = [['מזכרות כלולות', (k) => k.units], ['שעות פעילות', (k) => k.hours]].concat(P.map((p) => [p.name, (k) => (k.products.includes(p.id) ? '<span class="yes">✦</span>' : '<span class="no">—</span>')]));
    $('#cmp').innerHTML = `<table><thead><tr><th></th>${K.map((k) => `<th>${esc(k.name)}</th>`).join('')}</tr></thead><tbody>${rows.map(([l, f]) => `<tr><td>${esc(l)}</td>${K.map((k) => `<td>${f(k)}</td>`).join('')}</tr>`).join('')}<tr><td>מחיר</td>${K.map((k) => `<td><b>${F.money(k.price)}</b></td>`).join('')}</tr></tbody></table>`;
    M.reveal($('#pkgGrid'));
  }
  $('#pkgGrid').onclick = (e) => { const b = e.target.closest('[data-pkg]'); if (b) { wz.pkg = b.dataset.pkg; renderWiz(); } };
  $('#cmpToggle').onclick = () => { const c = $('#cmp'), o = c.hidden; c.hidden = !o; $('#cmpToggle').setAttribute('aria-expanded', o); $('#cmpToggle').textContent = o ? 'הסתרת ההשוואה ↑' : 'השוואה מלאה בין החבילות ↓'; };

  /* ---------- אשף בדיקת תאריך ---------- */
  const ICONS = {
    'חתונה': '<circle cx="12" cy="20" r="7"/><circle cx="21" cy="20" r="7"/><path d="M15 8l2-3 2 3"/>',
    'בר מצווה': '<path d="M16 4l3.5 6H26l-3.2 5.8L26 22h-6.5L16 28l-3.5-6H6l3.2-6.2L6 10h6.5Z"/>',
    'בת מצווה': '<circle cx="16" cy="16" r="3"/><path d="M16 13c0-5 4-8 4-8s1 5-4 8Zm3 3c5 0 8 4 8 4s-5 1-8-4Zm-3 3c0 5-4 8-4 8s-1-5 4-8Zm-3-3c-5 0-8-4-8-4s5-1 8 4Z"/>',
    'ברית / בריתה': '<path d="M6 18h20a10 10 0 0 1-20 0Z"/><path d="M10 18a6 6 0 0 1 12 0M16 6v6"/>',
    'חינה': '<path d="M22 6a11 11 0 1 0 4 15A9 9 0 0 1 22 6Z"/><circle cx="20" cy="14" r="1"/>',
    'יום הולדת': '<rect x="6" y="15" width="20" height="11" rx="2"/><path d="M6 20c3 2 5-2 8 0s5-2 8 0 4 0 4 0M16 15V9m0-4c1 1 1 2 0 3-1-1-1-2 0-3"/>',
    'אירוע חברה': '<rect x="7" y="6" width="18" height="21" rx="1"/><path d="M11 11h3m4 0h3m-10 5h3m4 0h3m-10 5h3m4 0h3"/>',
  };
  const wz = { step: 0, type: null, date: '', venue: '', guests: 300, pkg: (K.find((k) => k.popular) || K[0]).id };
  $('#typeGrid').innerHTML = M.const.EVENT_TYPES.map((t) => `<button type="button" aria-pressed="false" data-t="${esc(t)}"><svg viewBox="0 0 32 32" aria-hidden="true">${ICONS[t] || ''}</svg><b>${esc(t)}</b></button>`).join('');
  $('#typeGrid').onclick = (e) => { const b = e.target.closest('[data-t]'); if (!b) return; wz.type = b.dataset.t; renderWiz(); setTimeout(() => go(1), 260); };
  $('#bDate').min = M.util.today();
  $('#bDate').addEventListener('input', (e) => { wz.date = e.target.value; renderWiz(); });
  $('#bVenue').addEventListener('input', (e) => { wz.venue = e.target.value; });
  const range = $('#bGuests');
  range.addEventListener('input', () => { wz.guests = +range.value; renderWiz(); });
  $('#pkgPick').onclick = (e) => { const b = e.target.closest('[data-p]'); if (b) { wz.pkg = b.dataset.p; renderWiz(); } };
  function estimate() {
    const k = K.find((x) => x.id === wz.pkg) || K[0];
    const expected = Math.round(wz.guests * 0.8), extra = Math.max(0, expected - k.units);
    return { k, expected, extra, extraCost: extra * S.extraUnit, total: k.price + extra * S.extraUnit + (+S.travelFee || 0) };
  }
  function availability(d) {
    if (!d) return null;
    const cap = +S.capacity || 3;
    const busy = M.db.list('events').filter((e) => e.date === d && (e.status === 'confirmed' || e.status === 'quote')).length;
    return cap - busy;
  }
  let lastTotal = 0;
  function renderWiz() {
    $$('#typeGrid [data-t]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.t === wz.type));
    $('#gOut').textContent = wz.guests.toLocaleString('he-IL');
    range.style.setProperty('--p', ((wz.guests - 50) / 950) * 100 + '%');
    const left = availability(wz.date), a = $('#avail');
    a.className = 'avail' + (left == null ? '' : left <= 0 ? ' err' : left === 1 ? ' warn' : ' ok');
    a.textContent = left == null ? 'בחרו תאריך ונבדוק זמינות מיד' : left <= 0 ? `${F.dateLong(wz.date)}: כל הצוותים תפוסים. השאירו פרטים ונבדוק צוות נוסף.` : left === 1 ? `${F.dateLong(wz.date)}: נשאר צוות אחד פנוי. כדאי לשריין.` : `${F.dateLong(wz.date)}: התאריך פנוי.`;
    const q = estimate();
    $('#pkgPick').innerHTML = K.map((k) => `<button type="button" aria-pressed="${k.id === wz.pkg}" data-p="${k.id}"><b>${esc(k.name)}${k.popular ? ' ✦' : ''}</b><small>${k.units} מזכרות · ${k.hours} שעות · ${k.products.map((id) => (M.db.product(id) || {}).name).join(', ')}</small><span class="pp">${F.money(k.price)}</span></button>`).join('');
    $('#sumLines').innerHTML = `
      <dt>אירוע</dt><dd>${esc(wz.type || '—')}</dd>
      <dt>תאריך</dt><dd>${wz.date ? F.date(wz.date) : '—'}</dd>
      <dt>אורחים</dt><dd>${wz.guests.toLocaleString('he-IL')}</dd>
      <dt>חבילת ${esc(q.k.name)}</dt><dd>${F.money(q.k.price)}</dd>
      <dt>צפי מזכרות (80% מהאורחים)</dt><dd>${q.expected}</dd>
      <dt>מזכרות נוספות</dt><dd>${q.extra ? `${q.extra} × ${F.money(S.extraUnit)}` : 'כלול בחבילה'}</dd>
      ${+S.travelFee ? `<dt>נסיעות</dt><dd>${F.money(S.travelFee)}</dd>` : ''}`;
    const tb = $('#sumTotal'); tb.textContent = F.money(q.total);
    if (q.total !== lastTotal) { tb.classList.add('bump'); setTimeout(() => tb.classList.remove('bump'), 250); lastTotal = q.total; }
  }
  function go(n) {
    wz.step = Math.max(0, Math.min(3, n));
    $$('.wiz-pane').forEach((p) => p.classList.toggle('on', +p.dataset.step === wz.step));
    $$('#wizSteps li').forEach((li, i) => { li.classList.toggle('on', i === wz.step); li.classList.toggle('done', i < wz.step); });
    $('#wPrev').hidden = wz.step === 0;
    $('#wNext').innerHTML = wz.step === 3 ? 'שליחת בקשה להצעה <span class="arr">←</span>' : 'המשך <span class="arr">←</span>';
    const wt = $('#wiz').getBoundingClientRect().top; if (wz.step && (wt < 70 || wt > innerHeight * 0.6)) $('#wiz').scrollIntoView({ behavior: 'smooth', block: 'start' });
    const f = $(`.wiz-pane[data-step="${wz.step}"] input, .wiz-pane[data-step="${wz.step}"] button`); if (f && wz.step) setTimeout(() => f.focus({ preventScroll: true }), 50);
  }
  function valid() {
    if (wz.step === 0 && !wz.type) { M.toast('בחרו את סוג האירוע', 'err'); return false; }
    if (wz.step === 1 && !wz.date) { M.toast('בחרו תאריך', 'err'); $('#bDate').focus(); return false; }
    if (wz.step === 3) { for (const s of ['#bName', '#bPhone']) { const el = $(s); if (!el.value.trim() || !el.checkValidity()) { el.reportValidity(); el.focus(); return false; } } }
    return true;
  }
  $('#wPrev').onclick = () => go(wz.step - 1);
  $('#wNext').onclick = () => { if (!valid()) return; if (wz.step < 3) go(wz.step + 1); else submitLead(); };
  $('#wiz').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); $('#wNext').click(); } });
  function submitLead() {
    const q = estimate(), name = $('#bName').value.trim(), phone = $('#bPhone').value.trim();
    const ev = M.db.save('events', { code: M.util.code(), status: 'lead', source: 'אתר', type: wz.type, date: wz.date, time: '19:30', venue: wz.venue, client: name, phone, guests: wz.guests, pkg: q.k.id, price: q.total, deposit: 0, products: q.k.products.slice(), notes: $('#bNotes').value.trim(), frameText: name, theme: '#b8914f', staff: [] });
    M.db.log(`ליד חדש מהאתר: ${ev.client} (${ev.type}, ${F.date(ev.date)})`, 'lead');
    $('#wiz').innerHTML = `<div class="wiz-done"><div class="seal">✦</div><h3>תודה, ${esc(name.split(' ')[0])}</h3><p>קיבלנו את הבקשה ל${esc(wz.type)} ב־${F.dateLong(wz.date)}.<br>נחזור אליכם היום עם הצעה מסודרת והדמיה ראשונה של העיצוב.</p>
      <a class="btn btn-gold" target="_blank" rel="noopener" href="${wa(`היי, השארתי פרטים באתר ל${wz.type} ב־${F.date(wz.date)} (${wz.guests} אורחים, חבילת ${q.k.name})`)}">להמשך שיחה בוואטסאפ</a></div>`;
  }

  /* ---------- חנות ---------- */
  const shop = { product: 'wood', size: null, photo: userPhoto, cap: '', qty: 1 };
  function markUpload(name) { $('#upload').classList.add('has'); $('#upTitle').textContent = name ? '✓ ' + name : '✓ התמונה שלכם'; }
  if (userPhoto) markUpload();
  function renderShop() {
    const p = M.db.product(shop.product) || P[0];
    if (!shop.size || !p.sizes.find((s) => s.id === shop.size)) shop.size = p.sizes[Math.min(1, p.sizes.length - 1)].id;
    const sz = p.sizes.find((s) => s.id === shop.size);
    $('#shopProducts').innerHTML = P.map((x) => `<button type="button" role="radio" aria-checked="${x.id === p.id}" data-p="${x.id}">${esc(x.name)}<small>מ־${F.money(minPrice(x))}</small></button>`).join('');
    $('#shopSizes').innerHTML = p.sizes.map((s) => `<button type="button" role="radio" aria-checked="${s.id === shop.size}" data-z="${s.id}">${esc(s.label)}<small>${F.money(s.price)}</small></button>`).join('');
    $('#shopStage').innerHTML = M.mockup(p.id, shop.photo || M.sample(3), shop.cap, { tilt: true });
    M.tilt($('#shopStage'));
    $('#shopHint').textContent = shop.photo ? `${p.name} · ${sz.label} · גררו כדי לסובב` : 'זו תמונת דוגמה. העלו תמונה משלכם כדי לראות אותה על המוצר';
    $('#shopPrice').textContent = F.money(sz.price * shop.qty);
  }
  $('#shopProducts').onclick = (e) => { const b = e.target.closest('[data-p]'); if (b) { shop.product = b.dataset.p; renderShop(); } };
  $('#shopSizes').onclick = (e) => { const b = e.target.closest('[data-z]'); if (b) { shop.size = b.dataset.z; renderShop(); } };
  $('#shopCap').oninput = (e) => { shop.cap = e.target.value; renderShop(); };
  const setQty = (n) => { shop.qty = Math.max(1, Math.min(50, n || 1)); $('#shopQty').value = shop.qty; renderShop(); };
  $('#shopQty').oninput = (e) => setQty(+e.target.value);
  $$('.qty button').forEach((b) => (b.onclick = () => setQty(shop.qty + +b.dataset.q)));
  $('#shopFile').onchange = (e) => takePhoto(e.target.files[0]);
  const up = $('#upload');
  ['dragenter', 'dragover'].forEach((t) => up.addEventListener(t, (e) => { e.preventDefault(); up.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach((t) => up.addEventListener(t, (e) => { e.preventDefault(); up.classList.remove('drag'); }));
  up.addEventListener('drop', (e) => takePhoto(e.dataTransfer.files[0]));

  /* ---------- סל ומגירה ---------- */
  let cart = []; try { cart = JSON.parse(ss.get('momento.cart') || '[]'); } catch (e) { cart = []; }
  const saveCart = () => { ss.set('momento.cart', JSON.stringify(cart)); updateCount(); };
  const itemPrice = (it) => { const p = M.db.product(it.product); const s = p && p.sizes.find((z) => z.id === it.size); return (s ? s.price : 0) * it.qty; };
  function updateCount() { const n = cart.reduce((a, b) => a + b.qty, 0), b = $('#cartCount'); b.hidden = !n; b.textContent = n; }
  $('#shopForm').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!shop.photo) { M.toast('העלו תמונה כדי להזמין', 'err'); $('#shopFile').click(); return; }
    cart.push({ product: shop.product, size: shop.size, qty: shop.qty, caption: shop.cap, photo: shop.photo });
    saveCart(); openDrawer();
  });
  const drawer = $('#drawer');
  let lastFocus = null;
  function openDrawer() { lastFocus = document.activeElement; renderCart(); drawer.classList.add('open'); drawer.setAttribute('aria-hidden', 'false'); document.body.style.overflow = 'hidden'; setTimeout(() => $('.drawer-panel .x').focus(), 60); }
  function closeDrawer() { if (!drawer.classList.contains('open')) return; drawer.classList.remove('open'); drawer.setAttribute('aria-hidden', 'true'); document.body.style.overflow = ''; if (lastFocus) lastFocus.focus(); }
  drawer.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeDrawer(); });
  $('#cartBtn').onclick = openDrawer;
  function renderCart(stage = 'cart') {
    const body = $('#drawerBody');
    if (!cart.length) { body.innerHTML = `<div class="empty-cart">${M.mockup('wood', M.sample(2), '', { small: true })}<p>הסל ריק כרגע.</p><a class="btn btn-primary" href="#shop" data-close>לעיצוב מתנה</a></div>`; return; }
    const sub = cart.reduce((a, it) => a + itemPrice(it), 0);
    if (stage === 'cart') {
      body.innerHTML = cart.map((it, i) => { const p = M.db.product(it.product), s = p.sizes.find((z) => z.id === it.size); return `
        <div class="cart-item">${M.mockup(it.product, it.photo, '', { small: true })}<div><b>${esc(p.name)}</b><small>${esc(s.label)} · ${it.qty} יח׳${it.caption ? ` · "${esc(it.caption)}"` : ''}</small><button class="rm" data-rm="${i}">הסרה</button></div><b>${F.money(itemPrice(it))}</b></div>`; }).join('') +
        `<div class="cart-sum"><div><span>סכום ביניים</span><b>${F.money(sub)}</b></div><div><span>משלוח</span><span>נבחר בשלב הבא</span></div></div>
         <button class="btn btn-primary btn-block btn-lg" id="toCheckout">להמשך הזמנה <span class="arr">←</span></button><a class="btn btn-ghost btn-block" href="#shop" data-close>הוספת מוצר נוסף</a>`;
      $$('[data-rm]', body).forEach((b) => (b.onclick = () => { cart.splice(+b.dataset.rm, 1); saveCart(); renderCart(); }));
      $('#toCheckout').onclick = () => renderCart('checkout');
      return;
    }
    body.innerHTML = `<form id="checkout" style="display:grid;gap:14px">
      <label class="field"><span>שם מלא</span><input class="input" name="customer" required autocomplete="name"></label>
      <label class="field"><span>טלפון</span><input class="input" name="phone" type="tel" required autocomplete="tel" pattern="0[0-9\\-]{8,11}"></label>
      <div class="field"><span>משלוח</span><div class="ship"><label><input type="radio" name="ship" value="delivery" checked>שליח עד הבית<small>${F.money(35)} · 1–3 ימים</small></label><label><input type="radio" name="ship" value="pickup">איסוף עצמי<small>ללא עלות</small></label></div></div>
      <div class="grid2" id="addr"><label class="field"><span>עיר</span><input class="input" name="city" required autocomplete="address-level2"></label><label class="field"><span>רחוב ומספר</span><input class="input" name="address" required autocomplete="street-address"></label></div>
      <div class="cart-sum"><div><span>מוצרים</span><span>${F.money(sub)}</span></div><div><span>משלוח</span><span id="shipCost">${F.money(35)}</span></div><div class="tot"><span>סה״כ</span><b id="grand">${F.money(sub + 35)}</b></div></div>
      <button class="btn btn-gold btn-block btn-lg" type="submit">שליחת ההזמנה</button>
      <button class="btn btn-ghost btn-block" type="button" id="backCart">→ חזרה לסל</button>
      <p style="font-size:.85rem;color:var(--ink3);margin:0;text-align:center">אחרי השליחה תקבלו הדמיה לאישור וקישור לתשלום מאובטח. לא נגבה תשלום לפני שתאשרו.</p></form>`;
    const f = $('#checkout');
    const sync = () => { const d = f.ship.value === 'delivery'; $('#addr').hidden = !d; f.city.required = f.address.required = d; $('#shipCost').textContent = d ? F.money(35) : 'ללא עלות'; $('#grand').textContent = F.money(sub + (d ? 35 : 0)); };
    f.addEventListener('change', sync); sync();
    $('#backCart').onclick = () => renderCart();
    setTimeout(() => f.customer.focus(), 50);
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const bad = [...f.elements].find((i) => i.required && !i.checkValidity()); if (bad) { bad.reportValidity(); return; }
      const fd = Object.fromEntries(new FormData(f)), ship = fd.ship === 'delivery' ? 35 : 0;
      f.querySelector('[type=submit]').disabled = true;
      const items = [];
      for (const it of cart) items.push({ product: it.product, size: it.size, qty: it.qty, caption: it.caption, photoId: await M.photos.put(it.photo) });
      const nums = M.db.list('shop').map((o) => o.num || 0);
      const o = M.db.save('shop', { num: Math.max(5000, ...nums) + 1, customer: fd.customer, phone: fd.phone, city: fd.city || '', address: fd.address || '', ship: fd.ship, shipping: ship, items, total: sub + ship, status: 'new' });
      M.db.log(`הזמנה ${o.num} התקבלה מהחנות (${o.customer}, ${F.money(o.total)})`, 'shop');
      cart = []; saveCart();
      body.innerHTML = `<div class="done-box"><div class="seal">✦</div><h3>ההזמנה התקבלה</h3><div class="big">#${o.num}</div><p>תודה ${esc(fd.customer.split(' ')[0])}. נשלח הדמיה לאישור וקישור לתשלום לטלפון ${esc(fd.phone)}.</p><button class="btn btn-primary" data-close>סגירה</button></div>`;
    });
  }

  /* ---------- השראה ---------- */
  const gal = [['wood', 0, 2, 'חתונה בגן', 'בלוקי עץ עם מסגרת זהב', '4/5'], ['crystal', 1, 2, 'בת מצווה', 'קריסטל עם הקדשה', '1/1'], ['globe', 2, 3, 'ברית', 'כדורי שלג למשפחה', '4/5'], ['magnet', 5, 2, 'חינה', 'מגנטים בגווני זהב', '1/1'], ['alu', 3, 2, 'מסיבה בלילה', 'אלומיניום בצבעים עזים', '4/5'], ['canvas', 4, 1, 'מתנה מהחנות', 'קנבס לסלון', '1/1']];
  $('#galleryGrid').innerHTML = gal.map(([p, s, n, t, d, ar], i) => `<figure class="rv d${(i % 3) + 1}"><div class="g-img" style="--ar:${ar};background-image:url('${M.sample(s + 3, n, ar === '4/5' ? 'portrait' : '')}')"></div><div class="g-mk">${M.mockup(p, M.sample(s, n), '', { tilt: true })}</div><figcaption><b>${esc(t)}</b><small>${esc(d)}</small></figcaption></figure>`).join('');

  /* ---------- הפעלה ---------- */
  function renderAll() { P = M.db.products(); K = M.db.packages(); applySettings(); renderPackages(); renderColl(); renderTry(); renderShop(); renderWiz(); }
  $('#year').textContent = new Date().getFullYear();
  renderAll(); showHero(0); heroAuto(); updateCount(); onScroll(); go(0); M.reveal();
  M.db.on((k) => { if (['settings', 'products', 'packages', '*'].includes(k)) renderAll(); });
})();
