(function () {
  'use strict';
  const M = window.Momento, { esc } = M.util, $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  let S = M.db.settings(), P = M.db.products(), K = M.db.packages();
  const minPrice = (p) => Math.min(...p.sizes.map((s) => s.price));

  /* פרטי העסק מההגדרות בתוכנת הניהול */
  function applySettings() {
    S = M.db.settings();
    $$('[data-s]').forEach((el) => { el.textContent = S[el.dataset.s] || el.textContent; });
    const wa = 'https://wa.me/' + S.whatsapp + '?text=' + encodeURIComponent('היי, אשמח לפרטים על עמדת מזכרות לאירוע');
    $('#waFab').href = wa; $('#cWa').href = wa; $('#waLine').href = wa;
    $('#cPhone').href = 'tel:' + S.phone.replace(/[^0-9+]/g, ''); $('#cMail').href = 'mailto:' + S.email;
    $('#extraUnit').textContent = M.fmt.money(S.extraUnit) + ' ליחידה';
    document.title = S.brand + ' – ' + S.tagline;
  }

  /* תפריט נייד */
  const nav = $('#nav'), burger = $('#burger');
  burger.onclick = () => { const o = nav.classList.toggle('open'); burger.setAttribute('aria-expanded', o); };
  nav.onclick = (e) => { if (e.target.tagName === 'A') { nav.classList.remove('open'); burger.setAttribute('aria-expanded', false); } };
  addEventListener('scroll', () => $('#top').classList.toggle('scrolled', scrollY > 10), { passive: true });

  /* פתיח */
  $('#heroArt').innerHTML =
    M.mockup('wood', M.sample(0), 'נועה & אורי').replace('class="mk', 'class="h1 mk') +
    M.mockup('crystal', M.sample(2), '').replace('class="mk', 'class="h3 mk') +
    M.mockup('globe', M.sample(5, 3), 'ברית 2026').replace('class="mk', 'class="h2 mk');

  /* מוצרים */
  function renderProducts() {
    $('#prodGrid').innerHTML = P.map((p, i) => `
      <article class="prod">
        <div class="stage">${M.mockup(p.id, M.sample(i + 1, p.id === 'magnet' ? 3 : 2), p.id === 'magnet' || p.id === 'globe' ? 'מזל טוב!' : '')}</div>
        <h3>${esc(p.name)}</h3><p>${esc(p.short)}</p>
        <div class="prod-foot"><b>באונליין מ־${M.fmt.money(minPrice(p))}</b><a class="btn btn-soft btn-sm" href="#shop" data-shop="${p.id}">לעיצוב ולהזמנה</a></div>
      </article>`).join('');
  }
  $('#prodGrid').addEventListener('click', (e) => { const b = e.target.closest('[data-shop]'); if (b) { shop.product = b.dataset.shop; shop.size = null; renderShop(); } });

  /* חבילות */
  function renderPackages() {
    $('#pkgGrid').innerHTML = K.map((k) => `
      <article class="pkg ${k.popular ? 'pop' : ''}">
        ${k.popular ? '<span class="badge">הכי מוזמנת</span>' : ''}
        <h3>${esc(k.name)}</h3>
        <div class="price">${M.fmt.money(k.price)}</div>
        <div class="per">${k.units} מזכרות · ${k.hours} שעות פעילות</div>
        <div class="mini">${k.products.map((id) => `<span class="chip accent">${esc((M.db.product(id) || {}).name || id)}</span>`).join('')}</div>
        <ul>${k.features.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
        <a class="btn ${k.popular ? 'btn-primary' : 'btn-ghost'} btn-block" href="#book" data-pkg="${k.id}">בדיקת תאריך לחבילה</a>
      </article>`).join('');
  }
  $('#pkgGrid').addEventListener('click', (e) => { const b = e.target.closest('[data-pkg]'); if (b) { $('#bPkg').value = b.dataset.pkg; quote(); } });

  /* מחשבון הצעת מחיר וזמינות */
  $('#bType').innerHTML = M.const.EVENT_TYPES.map((t) => `<option>${esc(t)}</option>`).join('');
  $('#bDate').min = M.util.today();
  function fillPkgSelect() { const v = $('#bPkg').value; $('#bPkg').innerHTML = K.map((k) => `<option value="${k.id}">${esc(k.name)} – ${M.fmt.money(k.price)}</option>`).join(''); $('#bPkg').value = v || (K.find((k) => k.popular) || K[0]).id; }
  function estimate() {
    const k = K.find((x) => x.id === $('#bPkg').value) || K[0];
    const guests = Math.max(0, +$('#bGuests').value || 0);
    const expected = Math.round(guests * 0.8);
    const extra = Math.max(0, expected - k.units);
    return { k, guests, expected, extra, extraCost: extra * S.extraUnit, total: k.price + extra * S.extraUnit + (+S.travelFee || 0) };
  }
  function quote() {
    const q = estimate();
    $('#quoteLines').innerHTML = `
      <dt>חבילת ${esc(q.k.name)} (${q.k.units} מזכרות)</dt><dd>${M.fmt.money(q.k.price)}</dd>
      <dt>צפי מזכרות (80% מ־${q.guests} אורחים)</dt><dd>${q.expected}</dd>
      <dt>מזכרות נוספות ${q.extra ? '(' + q.extra + ' × ' + M.fmt.money(S.extraUnit) + ')' : ''}</dt><dd>${q.extra ? M.fmt.money(q.extraCost) : 'לא נדרש'}</dd>
      ${+S.travelFee ? `<dt>נסיעות</dt><dd>${M.fmt.money(S.travelFee)}</dd>` : ''}`;
    $('#quoteTotal').textContent = M.fmt.money(q.total);
    const d = $('#bDate').value, a = $('#avail');
    if (!d) { a.className = 'avail'; a.textContent = 'בחרו תאריך לבדיקת זמינות'; return; }
    const cap = +S.capacity || 3;
    const busy = M.db.list('events').filter((e) => e.date === d && (e.status === 'confirmed' || e.status === 'quote')).length;
    const left = cap - busy;
    a.className = 'avail ' + (left <= 0 ? 'err' : left === 1 ? 'warn' : 'ok');
    a.textContent = left <= 0 ? `${M.fmt.dateLong(d)}: התאריך מלא. השאירו פרטים ונבדוק צוות נוסף` : left === 1 ? `${M.fmt.dateLong(d)}: נשאר צוות אחד פנוי, כדאי לשריין` : `${M.fmt.dateLong(d)}: התאריך פנוי 🎉`;
  }
  ['#bPkg', '#bGuests', '#bDate', '#bType'].forEach((s) => $(s).addEventListener('input', quote));

  $('#bookForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target, fd = Object.fromEntries(new FormData(f));
    const bad = [...f.querySelectorAll('[required]')].find((i) => !i.checkValidity());
    if (bad) { bad.focus(); bad.reportValidity(); return; }
    const q = estimate();
    const ev = M.db.save('events', {
      code: M.util.code(), status: 'lead', source: 'אתר', type: fd.type, date: fd.date, time: '19:30', venue: fd.venue, client: fd.client.trim(),
      phone: fd.phone.trim(), guests: q.guests, pkg: q.k.id, price: q.total, deposit: 0, products: q.k.products.slice(), notes: fd.notes,
      frameText: fd.client.trim(), theme: '#b5653a', staff: [],
    });
    M.db.log(`ליד חדש מהאתר: ${ev.client} (${ev.type}, ${M.fmt.date(ev.date)})`, 'lead');
    modal(`<div class="done-box"><h3>תודה ${esc(ev.client)}!</h3><p>הבקשה התקבלה. נחזור אליכם תוך שעות ספורות עם הצעה מסודרת.</p><div class="big">${M.fmt.money(q.total)}</div><p class="muted-s">הערכת מחיר לחבילת ${esc(q.k.name)} · ${M.fmt.dateLong(ev.date)}</p>
      <a class="btn btn-primary" target="_blank" rel="noopener" href="https://wa.me/${S.whatsapp}?text=${encodeURIComponent(`היי, השארתי פרטים באתר לאירוע ${ev.type} ב־${M.fmt.date(ev.date)}`)}">להמשך בוואטסאפ</a></div>`, 'הבקשה נשלחה');
    f.reset(); fillPkgSelect(); $('#bGuests').value = 300; quote();
  });

  /* חנות */
  const shop = { product: 'wood', size: null, photo: null, cap: '', qty: 1 };
  function renderShop() {
    const p = M.db.product(shop.product) || P[0];
    if (!shop.size || !p.sizes.find((s) => s.id === shop.size)) shop.size = p.sizes[Math.min(1, p.sizes.length - 1)].id;
    const sz = p.sizes.find((s) => s.id === shop.size);
    $('#shopProducts').innerHTML = P.map((x) => `<button type="button" role="radio" aria-checked="${x.id === p.id}" data-p="${x.id}">${esc(x.name)}<small>מ־${M.fmt.money(minPrice(x))}</small></button>`).join('');
    $('#shopSizes').innerHTML = p.sizes.map((s) => `<button type="button" role="radio" aria-checked="${s.id === shop.size}" data-z="${s.id}">${esc(s.label)}<small>${M.fmt.money(s.price)}</small></button>`).join('');
    $('#shopStage').innerHTML = M.mockup(p.id, shop.photo || M.sample(3), shop.cap);
    $('#shopHint').textContent = shop.photo ? `${p.name} · ${sz.label}` : 'זו תמונת דוגמה. העלו תמונה משלכם כדי לראות אותה על המוצר';
    $('#shopPrice').textContent = M.fmt.money(sz.price * shop.qty);
  }
  $('#shopProducts').onclick = (e) => { const b = e.target.closest('[data-p]'); if (b) { shop.product = b.dataset.p; renderShop(); } };
  $('#shopSizes').onclick = (e) => { const b = e.target.closest('[data-z]'); if (b) { shop.size = b.dataset.z; renderShop(); } };
  $('#shopCap').oninput = (e) => { shop.cap = e.target.value; renderShop(); };
  $('#shopQty').oninput = (e) => { shop.qty = Math.max(1, Math.min(50, +e.target.value || 1)); renderShop(); };
  $$('.qty button').forEach((b) => (b.onclick = () => { shop.qty = Math.max(1, Math.min(50, shop.qty + +b.dataset.q)); $('#shopQty').value = shop.qty; renderShop(); }));
  $('#shopFile').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { shop.photo = await M.img.fromFile(f, 2000, 0.9); $('#upload').classList.add('has'); $('#upload b').textContent = '✓ ' + f.name; renderShop(); }
    catch (err) { M.toast('לא הצלחנו לקרוא את התמונה', 'err'); }
  };

  /* סל קניות (נשמר בדפדפן של הלקוח) */
  let cart = [];
  try { cart = JSON.parse(sessionStorage.getItem('momento.cart') || '[]'); } catch (e) { cart = []; }
  const saveCart = () => { try { sessionStorage.setItem('momento.cart', JSON.stringify(cart)); } catch (e) { /* תמונות גדולות */ } updateFab(); };
  const itemPrice = (it) => { const p = M.db.product(it.product); const s = p && p.sizes.find((z) => z.id === it.size); return (s ? s.price : 0) * it.qty; };
  function updateFab() { const n = cart.reduce((a, b) => a + b.qty, 0); $('#cartCount').textContent = n; $('#cartFab').classList.toggle('show', n > 0); }
  $('#shopForm').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!shop.photo) { M.toast('העלו תמונה כדי להזמין', 'err'); $('#shopFile').click(); return; }
    cart.push({ product: shop.product, size: shop.size, qty: shop.qty, caption: shop.cap, photo: shop.photo });
    saveCart(); M.toast('נוסף לסל ✓');
  });
  $('#cartFab').onclick = openCart;
  function openCart() {
    if (!cart.length) { M.toast('הסל ריק'); return; }
    const total = cart.reduce((a, it) => a + itemPrice(it), 0);
    const m = modal(`
      <div class="cart-list">${cart.map((it, i) => { const p = M.db.product(it.product); const s = p.sizes.find((z) => z.id === it.size); return `
        <div class="cart-item">${M.mockup(it.product, it.photo, '', { small: true })}
          <div><b>${esc(p.name)} ${esc(s.label)}</b><small>${it.qty} יח׳${it.caption ? ' · "' + esc(it.caption) + '"' : ''}</small></div>
          <div style="text-align:end"><b>${M.fmt.money(itemPrice(it))}</b><br><button class="btn btn-ghost btn-sm" data-rm="${i}">הסרה</button></div></div>`; }).join('')}</div>
      <form id="checkout" class="grid2">
        <label class="field"><span>שם מלא</span><input class="input" name="customer" required autocomplete="name"></label>
        <label class="field"><span>טלפון</span><input class="input" name="phone" type="tel" required autocomplete="tel" pattern="[0-9\\-+ ]{9,15}"></label>
        <div class="field" style="grid-column:1/-1"><span>משלוח</span><div class="ship">
          <label><input type="radio" name="ship" value="delivery" checked> שליח עד הבית (${M.fmt.money(35)})</label>
          <label><input type="radio" name="ship" value="pickup"> איסוף עצמי (חינם)</label></div></div>
        <label class="field"><span>עיר</span><input class="input" name="city" autocomplete="address-level2"></label>
        <label class="field"><span>כתובת</span><input class="input" name="address" autocomplete="street-address"></label>
        <div style="grid-column:1/-1"><div class="cart-sum"><span>סה״כ לתשלום</span><b id="sumTotal">${M.fmt.money(total + 35)}</b></div>
        <button class="btn btn-primary btn-block" type="submit">שליחת ההזמנה</button>
        <p class="muted-s">אחרי השליחה נשלח לכם קישור לתשלום מאובטח ואישור עיצוב לפני ההדפסה.</p></div>
      </form>`, 'הסל שלי');
    m.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = () => { cart.splice(+b.dataset.rm, 1); saveCart(); m.closest('.modal-bg').remove(); if (cart.length) openCart(); }));
    const f = m.querySelector('#checkout');
    f.addEventListener('change', () => { const ship = f.ship.value === 'delivery' ? 35 : 0; f.querySelector('#sumTotal').textContent = M.fmt.money(total + ship); f.city.required = f.address.required = !!ship; });
    f.city.required = f.address.required = true;
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const bad = [...f.querySelectorAll('[required]')].find((i) => !i.checkValidity()); if (bad) { bad.reportValidity(); return; }
      const fd = Object.fromEntries(new FormData(f)); const ship = fd.ship === 'delivery' ? 35 : 0;
      const items = [];
      for (const it of cart) items.push({ product: it.product, size: it.size, qty: it.qty, caption: it.caption, photoId: await M.photos.put(it.photo) });
      const nums = M.db.list('shop').map((o) => o.num || 0);
      const o = M.db.save('shop', { num: Math.max(5000, ...nums) + 1, customer: fd.customer, phone: fd.phone, city: fd.city, address: fd.address, ship: fd.ship, shipping: ship, items, total: total + ship, status: 'new' });
      M.db.log(`הזמנה ${o.num} התקבלה מהחנות (${o.customer}, ${M.fmt.money(o.total)})`, 'shop');
      cart = []; saveCart();
      m.innerHTML = `<div class="done-box"><h3>ההזמנה התקבלה!</h3><div class="big">#${o.num}</div><p>שלחנו את הפרטים לצוות. נחזור אליכם ב־${esc(fd.phone)} עם קישור לתשלום ואישור עיצוב.</p></div>`;
    });
  }

  /* גלריה */
  const gal = [['wood', 'חתונה · בלוק עץ', 'נועה & אורי'], ['crystal', 'בת מצווה · קריסטל', ''], ['globe', 'ברית · כדור שלג', 'אלה 2026'], ['magnet', 'חינה · מגנט', 'חינה של מאיה'], ['alu', 'אירוע חברה · אלומיניום', ''], ['canvas', 'מתנה · קנבס', ''], ['wood', 'בר מצווה · בלוק עץ', 'איתי בר מצווה'], ['crystal', 'יום הולדת · קריסטל', '']];
  $('#galleryGrid').innerHTML = gal.map(([p, t, c], i) => `<figure>${M.mockup(p, M.sample(i + 2, i % 3 === 2 ? 3 : 2), c)}<figcaption>${esc(t)}</figcaption></figure>`).join('');

  /* חלון קופץ */
  function modal(html, title) {
    const bg = document.createElement('div'); bg.className = 'modal-bg';
    bg.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="modal-head"><h3>${esc(title)}</h3><button class="x" aria-label="סגירה">×</button></div><div class="modal-body">${html}</div></div>`;
    const close = () => { bg.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    bg.onclick = (e) => { if (e.target === bg || e.target.closest('.x')) close(); };
    document.addEventListener('keydown', onKey);
    document.body.appendChild(bg);
    return bg.querySelector('.modal-body');
  }

  function renderAll() { P = M.db.products(); K = M.db.packages(); applySettings(); renderProducts(); renderPackages(); fillPkgSelect(); quote(); renderShop(); }
  $('#year').textContent = new Date().getFullYear();
  renderAll(); updateFab();
  M.db.on((k) => { if (['settings', 'products', 'packages', '*'].includes(k)) renderAll(); });
})();
