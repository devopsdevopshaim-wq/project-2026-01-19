'use strict';
/* ===== Neon Warfront – UI, screens & game controller ===== */
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

G.ui = {
  stack: ['title'],
  show(name, push = true) {
    $$('.screen').forEach(s => s.classList.remove('show'));
    $('#scr-' + name).classList.add('show');
    if (push && this.stack[this.stack.length - 1] !== name) this.stack.push(name);
    this.current = name;
    $$('[data-tp]').forEach(e => e.innerHTML = `${G.svg('flask')} ${G.meta.data.tp} נק״מ`);
    if (name === 'title') { this.stack = ['title']; G.Title.refresh(); }
  },
  back() {
    this.stack.pop();
    const prev = this.stack[this.stack.length - 1] || 'title';
    this.go(prev, false);
  },
  go(name, push = true) {
    if (name === 'campaign' || name === 'conquest') { this.worldMode = name; this.renderWorlds(); return this.show('worlds', push); }
    if (name === 'worlds') { this.renderWorlds(); return this.show('worlds', push); }
    if (name === 'countries') { this.renderCountries(this.world); return this.show('countries', push); }
    if (name === 'research') { this.renderResearch(); return this.show('research', push); }
    if (name === 'achievements') { this.renderAch(); return this.show('achievements', push); }
    if (name === 'settings') return this.settings();
    if (name === 'howto') return this.howto();
    this.show(name, push);
  },

  toast(text, kind = '') {
    const t = G.el('div', 'toast ' + kind, text);
    $('#toasts').appendChild(t);
    while ($('#toasts').children.length > 4) $('#toasts').firstChild.remove();
    setTimeout(() => t.remove(), 3300);
  },

  modal(html, opts = {}) {
    $('#modal-card').innerHTML = html;
    $('#modal').classList.add('show');
    $('#modal').onclick = e => { if (e.target.id === 'modal' && opts.dismiss !== false) this.closeModal(); };
    return $('#modal-card');
  },
  closeModal() { $('#modal').classList.remove('show'); },

  starsHtml(n, max = 3) {
    let s = '<span class="stars">';
    for (let i = 0; i < max; i++) s += i < n ? '★' : '<span class="off">★</span>';
    return s + '</span>';
  },

  /* ---------- worlds ---------- */
  renderWorlds() {
    const list = $('#worlds-list'); list.innerHTML = '';
    $('#worlds-title').textContent = this.worldMode === 'conquest' ? 'כיבוש עולם שלם' : 'קמפיין – בחר עולם';
    G.WORLDS.forEach((w, wi) => {
      const unlocked = G.meta.worldUnlocked(wi);
      const card = G.el('div', 'world-card' + (unlocked ? '' : ' locked'));
      const cv = document.createElement('canvas');
      card.appendChild(cv);
      let stars = 0;
      w.countries.forEach((c, ci) => stars += G.meta.stars('w' + wi + 'c' + ci));
      const all = G.meta.stars('w' + wi + 'all');
      card.insertAdjacentHTML('beforeend', `<div class="wc-num">עולם ${wi + 1}</div>
        <div class="wc-body"><h3>${w.name}</h3><p>${w.sub}</p>
        <div class="wc-stars">${this.worldMode === 'conquest' ? 'כיבוש מלא: ' + this.starsHtml(all) : `${G.svg('star')} ${stars}/${w.countries.length * 3} · מלחמה כוללת ${this.starsHtml(all)}`}</div></div>
        ${unlocked ? '' : `<div class="lock">${G.svg('lock')} כבוש את העולם הקודם</div>`}`);
      card.onclick = () => {
        if (!unlocked) { G.sfx.error(); return this.toast('העולם נעול – נצח במלחמה הכוללת של העולם הקודם', 'bad'); }
        G.sfx.select();
        this.world = wi;
        if (this.worldMode === 'conquest') this.briefing(wi, null);
        else this.go('countries');
      };
      list.appendChild(card);
      setTimeout(() => G.drawThumb(cv, wi), 60 + wi * 90);
    });
  },

  /* ---------- countries ---------- */
  renderCountries(wi) {
    const w = G.WORLDS[wi];
    $('#countries-title').textContent = `${w.name} – מדינות`;
    const list = $('#country-list'); list.innerHTML = '';
    const map = G.getMap(wi);
    map.countries.forEach((C, ci) => {
      const un = G.meta.countryUnlocked(wi, ci);
      const st = G.meta.stars('w' + wi + 'c' + ci);
      const it = G.el('div', 'c-item' + (un ? '' : ' locked'),
        `<div class="c-num">${un ? ci + 1 : G.svg('lock')}</div><div class="c-name">${C.name}<small>${C.tids.length} שטחים · בונוס ${C.bonus}</small></div>${this.starsHtml(st)}`);
      it.onclick = () => un ? (G.sfx.select(), this.briefing(wi, ci)) : (G.sfx.error(), this.toast('השלם את המדינה הקודמת', 'bad'));
      it.onmouseenter = () => G.drawCountryMap(wi, ci);
      list.appendChild(it);
    });
    const allUn = map.countries.every((C, ci) => G.meta.stars('w' + wi + 'c' + ci) > 0);
    const fin = G.el('div', 'c-item final' + (allUn ? '' : ' locked'),
      `<div class="c-num">${allUn ? G.svg('globe') : G.svg('lock')}</div><div class="c-name">מלחמה כוללת<small>כבוש את כל ${w.name} מול כל האויבים</small></div>${this.starsHtml(G.meta.stars('w' + wi + 'all'))}`);
    fin.onclick = () => allUn ? (G.sfx.select(), this.briefing(wi, null)) : (G.sfx.error(), this.toast('כבוש את כל המדינות כדי לפתוח (או שחק ב״כיבוש עולם״)', 'bad'));
    list.appendChild(fin);
    requestAnimationFrame(() => G.drawCountryMap(wi, -1));
    const cv = $('#country-cv');
    cv.onclick = e => {
      const ci = G.countryAt(wi, e);
      if (ci >= 0) list.children[ci].click();
    };
  },

  briefing(wi, ci) {
    const w = G.WORLDS[wi], map = G.getMap(wi);
    const isAll = ci === null;
    const n = isAll ? map.terrs.length : map.countries[ci].tids.length;
    const first = !isAll && ci === 0;
    const diff = G.meta.data.settings.diff;
    const newUnits = w.tier.filter(t => !G.WORLDS[Math.max(0, wi - 1)].tier.includes(t) || wi === 0);
    const card = this.modal(`
      <h2>${isAll ? 'מלחמה כוללת: ' + w.name : map.countries[ci].name}</h2>
      ${first || isAll ? `<p>${w.brief}</p>` : ''}
      <p><b>מטרה:</b> כבוש את כל ${n} השטחים ${isAll ? 'בעולם' : 'במדינה'}. ניצחון ב-${'≤'}${G.parTurnsFor(n, isAll)} תורות = 3 כוכבים.</p>
      <p><b>האויב משתמש ב:</b> ${w.tier.map(t => `<span class="chip">${G.svg(t)} ${G.UNITS[t].name}</span>`).join(' ')}</p>
      <div class="setting"><span>רמת קושי</span><div class="seg" id="diff-seg">
        ${['easy', 'normal', 'hard'].map(d => `<button data-d="${d}" class="${d === diff ? 'on' : ''}">${{ easy: 'קל', normal: 'רגיל', hard: 'קשה' }[d]}</button>`).join('')}
      </div></div>
      <div class="m-actions"><button class="btn" id="b-cancel">ביטול</button><button class="btn primary big" id="b-go">${G.svg('sword')} לקרב!</button></div>`);
    let d = diff;
    card.querySelectorAll('#diff-seg button').forEach(b => b.onclick = () => {
      d = b.dataset.d; card.querySelectorAll('#diff-seg button').forEach(x => x.classList.toggle('on', x === b));
      G.meta.data.settings.diff = d; G.meta.save();
    });
    $('#b-cancel').onclick = () => this.closeModal();
    $('#b-go').onclick = () => {
      this.closeModal(); G.sfx.buy();
      const m = G.newMatch(wi, ci, d);
      G.startTurn(m, 0);
      G.ctl.start(m, true);
    };
  },

  /* ---------- research ---------- */
  renderResearch() {
    const tree = $('#research-tree'); tree.innerHTML = '';
    G.BRANCHES.forEach((bn, bi) => {
      const col = G.el('div', 'r-col', `<h3>${bn}</h3>`);
      G.RESEARCH.filter(r => r.br === bi).forEach(r => {
        const done = G.meta.has(r.id);
        const reqOk = r.req.every(q => G.meta.has(q));
        const node = G.el('div', 'r-node ' + (done ? 'done' : reqOk ? 'avail' : 'locked'));
        const unitKey = { u_commando: 'commando', u_aa: 'aa', u_art: 'art', u_heli: 'heli', u_jet: 'jet', u_mech: 'mech' }[r.id];
        node.innerHTML = `<h4>${unitKey ? G.svg(unitKey) : G.svg(['flask', 'coin', 'sword', 'emp'][bi])} ${r.name}</h4><p>${r.desc}</p>
          ${!reqOk && !done ? `<div class="req">דורש: ${r.req.map(q => G.RESEARCH.find(x => x.id === q).name).join(', ')}</div>` : ''}
          ${done ? '' : `<button class="btn sm ${reqOk && G.meta.data.tp >= r.cost ? 'primary' : ''}" ${reqOk ? '' : 'disabled'}>${G.svg('flask')} ${r.cost} נק״מ</button>`}`;
        const b = node.querySelector('button');
        if (b) b.onclick = () => {
          if (G.meta.data.tp < r.cost) { G.sfx.error(); return this.toast('אין מספיק נקודות מחקר – נצח במשימות כדי להרוויח', 'bad'); }
          G.meta.data.tp -= r.cost; G.meta.data.research[r.id] = 1; G.meta.save();
          G.sfx.capture(); this.toast(`מחקר הושלם: ${r.name}`, 'good');
          if (Object.keys(G.meta.data.research).length >= 12) G.meta.ach('scientist');
          this.renderResearch(); this.show('research', false);
        };
        col.appendChild(node);
      });
      tree.appendChild(col);
    });
  },

  renderAch() {
    const l = $('#ach-list'); l.innerHTML = '';
    for (const a of G.ACHIEVEMENTS) {
      const got = G.meta.data.ach[a.id];
      l.appendChild(G.el('div', 'ach' + (got ? ' got' : ''), `${G.svg('crown')}<div><b>${a.name}</b><small>${a.desc}</small></div>`));
    }
  },

  settings() {
    const s = G.meta.data.settings;
    const seg = (key, opts) => `<div class="seg" data-key="${key}">${opts.map(([v, l]) => `<button data-v="${v}" class="${String(s[key]) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    const card = this.modal(`<h2>הגדרות</h2>
      <div class="setting"><span>מוזיקה</span>${seg('music', [[true, 'פועל'], [false, 'כבוי']])}</div>
      <div class="setting"><span>אפקטים קוליים</span>${seg('sfx', [[true, 'פועל'], [false, 'כבוי']])}</div>
      <div class="setting"><span>איכות גרפיקה</span>${seg('gfx', [['high', 'גבוהה'], ['low', 'חסכונית']])}</div>
      <div class="setting"><span>אנימציית קרב</span>${seg('anim', [['all', 'הכל'], ['mine', 'שלי'], ['off', 'כבוי']])}</div>
      <div class="setting"><span>קושי ברירת מחדל</span>${seg('diff', [['easy', 'קל'], ['normal', 'רגיל'], ['hard', 'קשה']])}</div>
      <div class="m-actions"><button class="btn danger" id="b-reset">אפס התקדמות</button><button class="btn primary" id="b-ok">סגור</button></div>`);
    card.querySelectorAll('.seg').forEach(sg => sg.querySelectorAll('button').forEach(b => b.onclick = () => {
      let v = b.dataset.v; if (v === 'true') v = true; if (v === 'false') v = false;
      s[sg.dataset.key] = v; G.meta.save();
      sg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
      if (sg.dataset.key === 'music') { G.sfx.unlock(); G.sfx.music(v); }
      if (sg.dataset.key === 'gfx' && G.ctl.rend && G.ctl.rend.setQuality) G.ctl.rend.setQuality(v);
      G.sfx.click();
    }));
    $('#b-ok').onclick = () => this.closeModal();
    $('#b-reset').onclick = () => {
      if (!confirm('למחוק את כל ההתקדמות, המחקר והכוכבים?')) return;
      localStorage.removeItem(G.meta.KEY); G.clearMatch(); G.meta.load(); this.closeModal(); this.show('title');
    };
  },

  howto() {
    const card = this.modal(`<h2>איך משחקים</h2><ul class="howto">
      <li><b>בחר שטח שלך</b> (צבוע בתכלת) – יופיעו השטחים השכנים: <b style="color:#ff3b5c">אדום</b> לתקיפה, <b style="color:#3dfcff">תכלת</b> להזזת כוחות.</li>
      <li><b>גייס</b> יחידות בכל שטח שבבעלותך עם קרדיטים. <b>בנה</b> ביצורים להגנה ומכרות להכנסה.</li>
      <li>כל יחידה זזה/תוקפת <b>פעם אחת בתור</b>. יחידות חדשות יכולות לפעול מיד.</li>
      <li><b>יחסי כוחות:</b> טנקים מנצחים רגלים · מסוקים צדים טנקים · נ״מ מפילים מטוסים · ארטילריה שוברת ביצורים.</li>
      <li>הרים, ערים וביצורים נותנים בונוס הגנה. לפני תקיפה תראה את <b>סיכויי הניצחון</b>.</li>
      <li>ערים ומשאבים מניבים יותר הכנסה. בכיבוש עולם – החזקת מדינה שלמה נותנת בונוס!</li>
      <li>השלם <b>משימות צד</b> ונצח מהר כדי לקבל ⭐ ו<b>נקודות מחקר</b> – פתח יחידות ויכולות חדשות במעבדה.</li>
      <li>במחשב: גלגלת = זום, גרירה = הזזת מפה, E = סיום תור, Esc = ביטול.</li>
      </ul><div class="m-actions"><button class="btn primary" id="b-ok">הבנתי!</button></div>`);
    $('#b-ok').onclick = () => { this.closeModal(); G.meta.data.tut = true; G.meta.save(); };
  }
};

G.parTurnsFor = (n, isAll) => Math.round(n * (isAll ? 0.5 : 0.9)) + 4;

/* ---------- thumbnails ---------- */
G.thumbCache = {};
G.thumbTerrain = wi => G.thumbCache[wi] || (G.thumbCache[wi] = G.drawTerrain(G.getMap(wi), 0.6));
G.drawThumb = function (cv, wi) {
  const w = G.WORLDS[wi], map = G.getMap(wi);
  const r = cv.getBoundingClientRect();
  if (G.snapshot3D && r.width > 0) {
    const img = G.snapshot3D(wi, Math.round(r.width), Math.round(r.height), 'persp');
    cv.width = img.width; cv.height = img.height; cv.getContext('2d').drawImage(img, 0, 0);
    return;
  }
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = r.width * dpr; cv.height = r.height * dpr;
  const ctx = cv.getContext('2d'); ctx.scale(dpr, dpr);
  const g = ctx.createLinearGradient(0, 0, 0, r.height);
  w.sky.forEach((c, i) => g.addColorStop(i / (w.sky.length - 1), c));
  ctx.fillStyle = g; ctx.fillRect(0, 0, r.width, r.height);
  const sg = ctx.createRadialGradient(r.width / 2, r.height * 0.55, 10, r.width / 2, r.height * 0.55, r.width * 0.7);
  sg.addColorStop(0, G.alpha(w.sea[1], 0.85)); sg.addColorStop(1, G.alpha(w.sea[0], 0.95));
  ctx.fillStyle = sg; ctx.fillRect(0, r.height * 0.12, r.width, r.height);
  const s = Math.min(r.width / map.width, (r.height * 0.85) / map.height) * 1.05;
  ctx.drawImage(G.thumbTerrain(wi), (r.width - map.width * s) / 2, r.height * 0.1, map.width * s, map.height * s);
};

G.countryColors = ['#ff2d95', '#22d8ff', '#ffd23f', '#3dff8f', '#a66bff', '#ff8a3d'];
G.drawCountryMap = function (wi, hi) {
  const cv = $('#country-cv'); if (!cv) return;
  if (G.snapshot3D) return G.drawCountryMap3D(wi, hi);
  const map = G.getMap(wi), w = G.WORLDS[wi];
  const r = cv.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = r.width * dpr; cv.height = r.height * dpr;
  const ctx = cv.getContext('2d'); ctx.scale(dpr, dpr);
  const sg = ctx.createRadialGradient(r.width / 2, r.height / 2, 10, r.width / 2, r.height / 2, r.width * 0.7);
  sg.addColorStop(0, w.sea[1]); sg.addColorStop(1, w.sea[0]);
  ctx.fillStyle = sg; ctx.fillRect(0, 0, r.width, r.height);
  const s = Math.min(r.width / map.width, r.height / map.height) * 0.98;
  const ox = (r.width - map.width * s) / 2, oy = (r.height - map.height * s) / 2;
  G._cmap = { s, ox, oy };
  ctx.drawImage(G.thumbTerrain(wi), ox, oy, map.width * s, map.height * s);
  ctx.save(); ctx.translate(ox, oy); ctx.scale(s, s);
  map.countries.forEach((C, ci) => {
    const p = new Path2D();
    for (const t of C.tids) for (const i of map.terrs[t].hexes) G.hexPath(p, map, map.hexes[i]);
    const won = G.meta.stars('w' + wi + 'c' + ci) > 0, un = G.meta.countryUnlocked(wi, ci);
    ctx.fillStyle = G.alpha(won ? '#22d8ff' : G.countryColors[ci % 6], ci === hi ? 0.55 : un ? 0.32 : 0.12);
    ctx.fill(p);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 2.5;
    const b = new Path2D();
    for (const t of C.tids) for (const [a, c] of map.terrs[t].cedges.concat(map.terrs[t].coast)) { b.moveTo(a[0], a[1]); b.lineTo(c[0], c[1]); }
    ctx.stroke(b);
  });
  ctx.restore();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  map.countries.forEach((C, ci) => {
    let x = 0, y = 0;
    for (const t of C.tids) { x += map.terrs[t].cx; y += map.terrs[t].cy; }
    x = ox + x / C.tids.length * s; y = oy + y / C.tids.length * s;
    ctx.font = `800 ${Math.max(12, 15 * s * 1.4)}px Rubik`;
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.75)';
    const un = G.meta.countryUnlocked(wi, ci);
    const label = (un ? '' : '🔒 ') + C.name;
    ctx.strokeText(label, x, y); ctx.fillStyle = '#fff'; ctx.fillText(label, x, y);
    const st = G.meta.stars('w' + wi + 'c' + ci);
    ctx.font = '16px Rubik'; ctx.fillStyle = '#ffd23f';
    ctx.fillText('★'.repeat(st) + '☆'.repeat(3 - st), x, y + 18);
  });
};
G.countryAt = function (wi, e) {
  const cv = $('#country-cv'), map = G.getMap(wi), r = cv.getBoundingClientRect();
  if (!G._cmap) return -1;
  if (G._cmap.flat) {
    const mx = (e.clientX - r.left - G._cmap.ox) / G._cmap.s + G._cmap.bx, my = (e.clientY - r.top - G._cmap.oy) / G._cmap.s + G._cmap.bz;
    let best = -1, bd = Infinity;
    for (const hx of map.hexes) { if (!hx.land) continue; const d = (hx.x - mx) ** 2 + (hx.y - my) ** 2; if (d < bd) { bd = d; best = hx.tid; } }
    return bd < (map.r * 1.2) ** 2 ? map.terrs[best].country : -1;
  }
  const mx = (e.clientX - r.left - G._cmap.ox) / G._cmap.s, my = (e.clientY - r.top - G._cmap.oy) / G._cmap.s;
  let best = -1, bd = Infinity;
  for (const hx of map.hexes) {
    if (!hx.land) continue;
    const d = (hx.x - mx) ** 2 + (hx.y * G.HEX.SQ - hx.h - my) ** 2;
    if (d < bd) { bd = d; best = hx.tid; }
  }
  return bd < (map.r * 1.2) ** 2 ? map.terrs[best].country : -1;
};

G.drawCountryMap3D = function (wi, hi) {
  const cv = $('#country-cv');
  const map = G.getMap(wi);
  const r = cv.getBoundingClientRect();
  if (!r.width) return;
  const img = G.snapshot3D(wi, 900, Math.round(900 * 0.62), 'top');
  const b = img.bounds, bx = b.x0 - 30, bz = b.z0 - 30, bw = b.x1 - b.x0 + 60, bh = b.z1 - b.z0 + 60;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = r.width * dpr; cv.height = r.height * dpr;
  const ctx = cv.getContext('2d'); ctx.scale(dpr, dpr);
  const w = G.WORLDS[wi];
  ctx.fillStyle = w.sea[0]; ctx.fillRect(0, 0, r.width, r.height);
  const s = Math.min(r.width / bw, r.height / bh);
  const ox = (r.width - bw * s) / 2, oy = (r.height - bh * s) / 2;
  G._cmap = { s, ox, oy, bx, bz, flat: true };
  ctx.drawImage(img, ox, oy, bw * s, bh * s);
  ctx.save(); ctx.translate(ox, oy); ctx.scale(s, s); ctx.translate(-bx, -bz);
  const hexP = (p, hx) => { for (let k = 0; k < 6; k++) { const a = Math.PI / 180 * (60 * k - 30); const X = hx.x + 26 * Math.cos(a), Y = hx.y + 26 * Math.sin(a); k ? p.lineTo(X, Y) : p.moveTo(X, Y); } p.closePath(); };
  map.countries.forEach((C, ci) => {
    const p = new Path2D();
    for (const t of C.tids) for (const i of map.terrs[t].hexes) hexP(p, map.hexes[i]);
    const won = G.meta.stars('w' + wi + 'c' + ci) > 0, un = G.meta.countryUnlocked(wi, ci);
    ctx.fillStyle = G.alpha(won ? '#22d8ff' : G.countryColors[ci % 6], ci === hi ? 0.5 : un ? 0.22 : 0.05);
    ctx.fill(p);
    if (!un) { ctx.fillStyle = 'rgba(5,3,15,.45)'; ctx.fill(p); }
    const e = new Path2D();
    for (const t of C.tids) for (const i of map.terrs[t].hexes) {
      const hx = map.hexes[i];
      for (let k = 0; k < 6; k++) {
        const n = hx.nb[k], nh = n >= 0 ? map.hexes[n] : null;
        if (nh && nh.land && map.terrs[nh.tid].country === ci) continue;
        const a0 = Math.PI / 180 * (60 * k - 30), a1 = Math.PI / 180 * (60 * k + 30);
        e.moveTo(hx.x + 26 * Math.cos(a0), hx.y + 26 * Math.sin(a0)); e.lineTo(hx.x + 26 * Math.cos(a1), hx.y + 26 * Math.sin(a1));
      }
    }
    ctx.shadowColor = ci === hi ? '#fff' : G.countryColors[ci % 6]; ctx.shadowBlur = 10;
    ctx.strokeStyle = ci === hi ? '#ffffff' : 'rgba(255,255,255,.75)'; ctx.lineWidth = ci === hi ? 5 : 3; ctx.lineCap = 'round';
    ctx.stroke(e); ctx.shadowBlur = 0;
  });
  ctx.restore();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  map.countries.forEach((C, ci) => {
    let x = 0, y = 0;
    for (const t of C.tids) { const hx = map.hexes[map.terrs[t].center]; x += hx.x; y += hx.y; }
    x = ox + (x / C.tids.length - bx) * s; y = oy + (y / C.tids.length - bz) * s;
    const un = G.meta.countryUnlocked(wi, ci);
    const label = (un ? '' : '🔒 ') + C.name;
    ctx.font = `800 ${Math.max(13, Math.min(18, r.width / 40))}px Rubik`;
    const tw = ctx.measureText(label).width + 18;
    ctx.fillStyle = 'rgba(8,5,20,.78)'; ctx.beginPath(); ctx.roundRect(x - tw / 2, y - 14, tw, 40, 10); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillText(label, x, y - 2);
    const st = G.meta.stars('w' + wi + 'c' + ci);
    ctx.font = '13px Rubik'; ctx.fillStyle = '#ffd23f';
    ctx.fillText('★'.repeat(st) + '☆'.repeat(3 - st), x, y + 15);
  });
};

/* ======================================================================
   GAME CONTROLLER
   ====================================================================== */
G.ctl = {
  m: null, rend: null, ui: { sel: -1, targets: null, hover: -1 }, busy: false, ability: null,

  init() {
    this.rend = new G.Renderer($('#map-cv'));
    this.bindInput();
    $('#btn-end').onclick = () => this.endTurn();
    $('#btn-pause').innerHTML = G.svg('menu');
    $('#btn-obj').innerHTML = G.svg('list');
    $('#btn-pause').onclick = () => this.pauseMenu();
    $('#btn-obj').onclick = () => this.objectivesModal();
    window.addEventListener('keydown', e => {
      if (G.ui.current !== 'game' || $('#modal').classList.contains('show')) return;
      if (e.key === 'e' || e.key === 'E') this.endTurn();
      if (e.key === 'Escape') this.deselect();
    });
  },

  start(m, fresh) {
    this.m = m; G.match = m;
    G.map = G.getMap(m.world);
    G.ui.show('game');
    this.rend.resize();
    this.rend.setMap(G.map);
    this.rend.focusBounds(G.activeTids(m));
    this.deselect();
    this.busy = false;
    this.refreshHUD();
    G.saveMatch(m);
    if (fresh && !G.meta.data.tut) setTimeout(() => G.ui.howto(), 400);
    else if (fresh) this.objectivesModal(true);
  },

  /* ---- input ---- */
  bindInput() {
    const cv = $('#map-cv');
    const pts = new Map();
    let start = null, moved = false, pinchD = 0;
    cv.addEventListener('pointerdown', e => {
      G.sfx.unlock();
      cv.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 1) { start = { x: e.clientX, y: e.clientY, t: performance.now() }; moved = false; }
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinchD = Math.hypot(a.x - b.x, a.y - b.y); moved = true; }
      this.rend.camTarget = null;
    });
    cv.addEventListener('pointermove', e => {
      const r = this.rend;
      if (!pts.has(e.pointerId)) {
        if (e.pointerType === 'mouse' && this.m) {
          const rc = cv.getBoundingClientRect();
          const t = r.pick(e.clientX - rc.left, e.clientY - rc.top);
          this.ui.hover = t; cv.style.cursor = t >= 0 ? 'pointer' : 'grab';
        }
        return;
      }
      const p = pts.get(e.pointerId);
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (pts.size === 1) {
        if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8) moved = true;
        if (moved) {
          if (r.pan) { const rc = cv.getBoundingClientRect(); r.pan(e.clientX - dx - rc.left, e.clientY - dy - rc.top, e.clientX - rc.left, e.clientY - rc.top); }
          else { r.cam.x -= dx / r.cam.z; r.cam.y -= dy / r.cam.z; r.clampCam(); }
        }
      } else if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const rc = cv.getBoundingClientRect();
        if (pinchD > 0) r.zoomAt((a.x + b.x) / 2 - rc.left, (a.y + b.y) / 2 - rc.top, d / pinchD);
        pinchD = d;
      }
    });
    const up = e => {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      if (pts.size === 0 && start && !moved && performance.now() - start.t < 700) {
        const rc = cv.getBoundingClientRect();
        this.tap(this.rend.pick(e.clientX - rc.left, e.clientY - rc.top));
      }
      if (pts.size < 2) pinchD = 0;
      if (pts.size === 0) start = null;
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', e => { pts.delete(e.pointerId); start = null; });
    cv.addEventListener('wheel', e => {
      e.preventDefault();
      const rc = cv.getBoundingClientRect();
      this.rend.zoomAt(e.clientX - rc.left, e.clientY - rc.top, Math.exp(-e.deltaY * 0.0015));
    }, { passive: false });
  },

  tap(tid) {
    if (this.busy || !this.m || this.m.over) return;
    const m = this.m;
    if (this.ability) {
      if (tid >= 0 && G.ability.validTarget(m, this.ability, tid)) this.useAbility(this.ability, tid);
      else { G.sfx.error(); G.ui.toast('בחר מטרה מסומנת', 'bad'); }
      return;
    }
    if (tid < 0 || m.terr[tid].owner === -2) { this.deselect(); return; }
    if (this.ui.sel >= 0 && this.ui.targets && this.ui.targets.has(tid)) {
      const kind = this.ui.targets.get(tid);
      if (kind === 'move') return this.moveDialog(this.ui.sel, tid);
      if (kind === 'attack') return this.attackDialog(this.ui.sel, tid);
    }
    this.select(tid);
  },

  select(tid) {
    const m = this.m;
    G.sfx.select();
    this.ui.sel = tid;
    this.ui.targets = null;
    const st = m.terr[tid];
    if (st.owner === 0) {
      const mv = G.countUnits(G.movable(st));
      const tg = new Map();
      if (mv > 0) for (const a of G.map.terrs[tid].adj) {
        const o = m.terr[a].owner;
        if (o === -2) continue;
        if (o === 0) tg.set(a, 'move');
        else if (!(m.shields[a] !== undefined && m.shields[a] === o)) tg.set(a, 'attack');
      }
      this.ui.targets = tg;
      this.renderPanel();
      this.hint(mv > 0 ? 'בחר שטח שכן: אדום = תקיפה, תכלת = העברת כוחות' : 'כל היחידות כאן כבר פעלו בתור הזה');
    } else { this.renderPanel(); this.hint(''); }
  },

  deselect() {
    this.ui.sel = -1; this.ui.targets = null; this.ability = null;
    $('#panel').classList.remove('show');
    this.hint('');
    this.renderAbilities();
  },

  hint(t) {
    const inPanel = $('#panel').classList.contains('show') && $('#p-hint');
    const h = $('#hint-bar');
    if (inPanel) { $('#p-hint').textContent = t; h.classList.remove('show'); return; }
    h.textContent = t; h.classList.toggle('show', !!t);
  },

  ownerName(o) { return o === -1 ? 'ניטרלי (מיליציה)' : this.m.factions[o].name; },
  ownerColor(o) { return o < 0 ? G.NEUTRAL_COLOR : this.m.factions[o].color; },

  renderPanel() {
    const m = this.m, tid = this.ui.sel;
    const p = $('#panel');
    if (tid < 0) { p.classList.remove('show'); return; }
    const T = G.map.terrs[tid], st = m.terr[tid];
    const mv = G.movable(st);
    const chips = G.UNIT_ORDER.filter(k => st.units[k] > 0).map(k => {
      const tired = st.owner === 0 && (mv[k] || 0) < st.units[k];
      return `<span class="chip ${tired ? 'tired' : ''}" title="${G.UNITS[k].name}">${G.svg(k)} ${st.units[k]}${tired && mv[k] ? ` <small>(${mv[k]} זמינים)</small>` : ''}</span>`;
    }).join('') || '<span class="chip">ללא כוחות</span>';
    const inc = G.TTYPES[T.type].inc + st.mine * (15 + (G.meta.has('mine1') && st.owner === 0 ? 5 : 0));
    const defp = Math.round((G.defBonus(m, tid, {}) - 1) * 100);
    const cap = m.factions.some(f => f.capital === tid && f.alive);
    const country = G.map.countries[T.country].name;
    const shield = m.shields[tid] !== undefined;
    p.innerHTML = `
      <div class="p-head"><span class="p-dot" style="background:${this.ownerColor(st.owner)};color:${this.ownerColor(st.owner)}"></span>
        <h3>${cap ? G.svg('crown') + ' ' : ''}${T.name}<small>${G.TTYPES[T.type].name} · ${country} · ${this.ownerName(st.owner)}</small></h3>
        <button class="p-close" id="p-close">✕</button></div>
      <div class="p-hint" id="p-hint"></div>
      <div class="p-units">${chips}</div>
      <div class="p-meta"><span>הכנסה <b>+${inc}</b></span><span>הגנה <b>+${defp}%</b></span><span>ביצור <b>${st.fort}</b></span><span>מכרה <b>${st.mine}</b></span>${shield ? '<span style="color:#7fe3ff">🛡 מוגן</span>' : ''}</div>
      ${st.owner === 0 ? `<div class="p-actions">
        <button class="btn cyan" id="p-rec">${G.svg('inf')} גייס</button>
        <button class="btn" id="p-build">${G.svg('build')} בנה</button>
      </div>` : ''}`;
    p.classList.add('show');
    $('#p-close').onclick = () => this.deselect();
    if (st.owner === 0) {
      $('#p-rec').onclick = () => this.recruitDialog(tid);
      $('#p-build').onclick = () => this.buildDialog(tid);
    }
  },

  refreshHUD() {
    const m = this.m; if (!m) return;
    $('#h-credits').textContent = G.fmt(m.factions[0].credits);
    $('#h-income').textContent = '+' + G.incomeOf(m, 0);
    $('#h-turn').textContent = m.turn;
    $('#h-facs').innerHTML = m.factions.map((f, i) => {
      const n = G.ownedBy(m, i).length;
      return `<div class="fac ${f.alive ? '' : 'dead'} ${this.turnOf === i ? 'turn' : ''}"><i style="background:${f.color};color:${f.color}"></i><span>${i === 0 ? 'אתה' : f.name}</span> ${n}</div>`;
    }).join('');
    const mvAny = G.ownedBy(m, 0).some(t => G.countUnits(G.movable(m.terr[t])) > 0 && G.map.terrs[t].adj.some(a => m.terr[a].owner !== 0 && m.terr[a].owner !== -2));
    $('#btn-end').classList.toggle('pulse', !mvAny && m.factions[0].credits < 50);
    this.renderAbilities();
  },

  renderAbilities() {
    const bar = $('#ability-bar'); if (!this.m) return;
    const ks = G.ability.available(this.m);
    bar.innerHTML = '';
    for (const k of ks) {
      const A = G.ABILITIES[k], cd = this.m.cd[k];
      const b = G.el('div', 'ab' + (cd > 0 ? ' cd' : '') + (this.ability === k ? ' active' : ''), G.svg(A.icon) + (cd > 0 ? `<span class="cdn">${cd}</span>` : ''));
      b.title = A.name;
      b.onclick = () => {
        if (this.busy) return;
        if (cd > 0) { G.sfx.error(); return G.ui.toast(`${A.name} תהיה זמינה בעוד ${cd} תורות`, 'bad'); }
        if (this.ability === k) return this.deselect();
        this.deselect();
        this.ability = k;
        const tg = new Map();
        for (const t of G.activeTids(this.m)) if (G.ability.validTarget(this.m, k, t)) tg.set(t, 'ability');
        this.ui.targets = tg;
        this.hint(`${A.name}: בחר ${A.target === 'own' ? 'שטח שלך' : 'שטח אויב'}`);
        G.sfx.select();
        this.renderAbilities();
      };
      bar.appendChild(b);
    }
  },

  async useAbility(k, tid) {
    const m = this.m, T = G.map.terrs[tid];
    if (!G.ability.use(m, k, tid)) return;
    this.ability = null;
    const r = this.rend;
    if (k === 'strike' || k === 'emp') {
      this.busy = true;
      for (let i = 0; i < (k === 'emp' ? 1 : 6); i++) {
        const hx = G.map.hexes[T.hexes[Math.floor(Math.random() * T.hexes.length)]];
        r.boom(k === 'emp' ? T.cx : hx.x, k === 'emp' ? T.cy : hx.y * G.HEX.SQ - hx.h, k === 'emp' ? 3 : 1);
        G.sfx.boom(0.8);
        await G.sleep(130);
      }
      if (k === 'emp') r.addFx({ type: 'ring', x: T.cx, y: T.cy, dur: 1200, col: '#a66bff', size: 160 });
      r.addFx({ type: 'text', x: T.cx, y: T.cy, dur: 1500, text: k === 'emp' ? 'EMP!' : 'הפצצה!', col: '#ffd23f', size: 22 });
      this.busy = false;
    } else if (k === 'reinf') {
      r.addFx({ type: 'ring', x: T.cx, y: T.cy, dur: 900, col: '#22d8ff', size: 70 });
      r.addFx({ type: 'text', x: T.cx, y: T.cy, dur: 1500, text: '+4 רגלים +טנק', col: '#3dfcff' });
      G.sfx.buy();
    } else {
      r.addFx({ type: 'ring', x: T.cx, y: T.cy, dur: 1000, col: '#7fe3ff', size: 80 });
      G.sfx.capture();
    }
    this.deselect();
    this.ui.sel = tid; this.renderPanel();
    this.refreshHUD();
  },

  /* ---- dialogs ---- */
  recruitDialog(tid) {
    const m = this.m, f = m.factions[0];
    const units = G.meta.playerUnits(m.world);
    const q = {}; units.forEach(u => q[u] = 0);
    const card = G.ui.modal(`<h2>גיוס – ${G.map.terrs[tid].name}</h2>
      <div class="u-grid">${units.map(u => {
        const U = G.UNITS[u];
        return `<div class="u-card"><div class="u-top">${G.svg(u)} ${U.name}</div>
        <div class="u-stats">⚔ ${U.atk} · ❤ ${U.hp} · <span class="cost">${U.cost}💰</span></div>
        <div class="u-desc">${U.desc}</div>
        <div class="qty"><button class="btn" data-u="${u}" data-d="-1">−</button><b id="q-${u}">0</b><button class="btn" data-u="${u}" data-d="1">+</button><button class="btn sm" data-u="${u}" data-d="5">+5</button></div></div>`;
      }).join('')}</div>
      ${G.meta.playerUnits(m.world).length < 8 ? '<p style="margin-top:10px;font-size:12.5px">💡 יחידות נוספות נפתחות במעבדת המחקר.</p>' : ''}
      <div class="total-row"><span>סה״כ: <span class="cost" id="q-tot">0</span></span><span>יתרה: <span id="q-left">${G.fmt(f.credits)}</span></span></div>
      <div class="m-actions"><button class="btn" id="q-max">מקסימום רגלים</button><button class="btn" id="b-cancel">ביטול</button><button class="btn primary" id="b-ok">גייס</button></div>`);
    const total = () => units.reduce((s, u) => s + q[u] * G.UNITS[u].cost, 0);
    const upd = () => {
      units.forEach(u => $('#q-' + u).textContent = q[u]);
      $('#q-tot').textContent = G.fmt(total());
      $('#q-left').textContent = G.fmt(f.credits - total());
      $('#b-ok').disabled = total() === 0;
    };
    card.querySelectorAll('[data-u]').forEach(b => b.onclick = () => {
      const u = b.dataset.u, d = +b.dataset.d;
      if (d > 0) {
        const can = Math.floor((f.credits - total()) / G.UNITS[u].cost);
        if (can <= 0) { G.sfx.error(); return; }
        q[u] += Math.min(d, can);
      } else q[u] = Math.max(0, q[u] + d);
      G.sfx.click(); upd();
    });
    $('#q-max').onclick = () => { q.inf += Math.floor((f.credits - total()) / G.UNITS.inf.cost); upd(); };
    $('#b-cancel').onclick = () => G.ui.closeModal();
    $('#b-ok').onclick = () => {
      for (const u of units) if (q[u] > 0) G.act.recruit(m, 0, tid, u, q[u]);
      G.ui.closeModal(); G.sfx.buy();
      const T = G.map.terrs[tid];
      this.rend.addFx({ type: 'ring', x: T.cx, y: T.cy, dur: 700, col: '#22d8ff', size: 50 });
      G.checkObjectives(m);
      this.select(tid); this.refreshHUD();
    };
    upd();
  },

  buildDialog(tid) {
    const m = this.m, f = m.factions[0], st = m.terr[tid];
    const row = (kind, icon, name, desc, lvl, max, cost) => `<div class="build-row">${G.svg(icon)}<div><b>${name}</b><small>${desc}</small>
      <div class="lvl">${Array.from({ length: max }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('')}</div></div>
      ${lvl >= max ? '<span class="chip">מקסימום</span>' : `<button class="btn ${f.credits >= cost ? 'primary' : ''}" data-k="${kind}" ${f.credits >= cost ? '' : 'disabled'}>${cost}💰</button>`}</div>`;
    G.ui.modal(`<h2>בנייה – ${G.map.terrs[tid].name}</h2>
      ${row('fort', 'fort', 'ביצור', '+25% הגנה לכל רמה', st.fort, G.maxFort(0), G.fortCost(Math.min(st.fort, 3), 0))}
      ${row('mine', 'mine', 'מכרה / באר נפט', `+${15 + (G.meta.has('mine1') ? 5 : 0)} הכנסה לכל רמה`, st.mine, 3, G.mineCost(Math.min(st.mine, 2), 0))}
      <div class="m-actions"><button class="btn" id="b-cancel">סגור</button></div>`);
    $$('#modal-card [data-k]').forEach(b => b.onclick = () => {
      if (G.act.build(m, 0, tid, b.dataset.k)) {
        G.sfx.buy();
        const T = G.map.terrs[tid];
        this.rend.addFx({ type: 'ring', x: T.cx, y: T.cy, dur: 700, col: '#ffd23f', size: 50 });
        G.checkObjectives(m);
        this.refreshHUD(); this.renderPanel(); this.buildDialog(tid);
      }
    });
    $('#b-cancel').onclick = () => G.ui.closeModal();
  },

  unitChooser(units, onChange) {
    const sel = G.cloneU(units);
    const html = `<div class="u-grid">${G.UNIT_ORDER.filter(k => units[k]).map(k => `<div class="u-card"><div class="u-top">${G.svg(k)} ${G.UNITS[k].name}</div>
      <div class="qty"><button class="btn" data-u="${k}" data-d="-1">−</button><b id="s-${k}">${units[k]}</b><button class="btn" data-u="${k}" data-d="1">+</button><button class="btn sm" data-u="${k}" data-d="all">${units[k]}</button></div></div>`).join('')}</div>`;
    const bind = () => {
      $$('#modal-card [data-u]').forEach(b => b.onclick = () => {
        const k = b.dataset.u, d = b.dataset.d;
        sel[k] = d === 'all' ? units[k] : G.clamp((sel[k] || 0) + +d, 0, units[k]);
        $('#s-' + k).textContent = sel[k];
        G.sfx.click(); onChange && onChange(sel);
      });
    };
    return { html, bind, sel };
  },

  moveDialog(from, to) {
    const m = this.m;
    const mv = G.movable(m.terr[from]);
    const ch = this.unitChooser(mv);
    G.ui.modal(`<h2>העברת כוחות</h2><p>${G.map.terrs[from].name} ← ${G.map.terrs[to].name}</p>${ch.html}
      <div class="m-actions"><button class="btn" id="b-cancel">ביטול</button><button class="btn cyan" id="b-ok">${G.svg('move')} העבר</button></div>`);
    ch.bind();
    $('#b-cancel').onclick = () => G.ui.closeModal();
    $('#b-ok').onclick = () => {
      G.ui.closeModal();
      if (!G.countUnits(ch.sel)) return;
      G.act.move(m, 0, from, to, ch.sel);
      const A = G.map.terrs[from], B = G.map.terrs[to];
      this.rend.addFx({ type: 'arrow', from: [A.cx, A.cy], to: [B.cx, B.cy], col: '#3dfcff', dur: 800 });
      if (this.rend.convoy) this.rend.convoy(from, to, ch.sel, m.factions[0].color, 0.8);
      G.sfx.select();
      this.select(from); this.refreshHUD();
    };
  },

  attackDialog(from, to) {
    const m = this.m;
    const mv = G.movable(m.terr[from]);
    const d = m.terr[to];
    let timer = null;
    const updOdds = sel => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const p = G.countUnits(sel) ? G.winChance(m, sel, 0, to) : 0;
        const el = $('#odds-v'); if (!el) return;
        el.textContent = Math.round(p * 100) + '%';
        el.style.color = p > 0.7 ? '#3dff8f' : p > 0.4 ? '#ffd23f' : '#ff3b5c';
        $('#odds-bar').style.width = (p * 100) + '%';
        $('#b-ok').disabled = !G.countUnits(sel);
      }, 60);
    };
    const ch = this.unitChooser(mv, updOdds);
    const defChips = G.UNIT_ORDER.filter(k => d.units[k] > 0).map(k => `<span class="chip">${G.svg(k)} ${d.units[k]}</span>`).join('') || '<span class="chip">ריק!</span>';
    G.ui.modal(`<h2>${G.svg('sword')} תקיפה: ${G.map.terrs[to].name}</h2>
      <p>מגן: <b style="color:${this.ownerColor(d.owner)}">${this.ownerName(d.owner)}</b> · בונוס הגנה +${Math.round((G.defBonus(m, to, mv) - 1) * 100)}%</p>
      <div class="p-units">${defChips}</div>
      <div class="odds">סיכויי ניצחון: <b id="odds-v">...</b><div class="odds-bar"><i id="odds-bar" style="width:0"></i></div></div>
      <p style="margin:0">בחר כוח תקיפה:</p>${ch.html}
      <div class="m-actions"><button class="btn" id="b-cancel">ביטול</button><button class="btn danger big" id="b-ok">${G.svg('target')} תקוף!</button></div>`);
    ch.bind(); updOdds(ch.sel);
    $('#b-cancel').onclick = () => G.ui.closeModal();
    $('#b-ok').onclick = () => { G.ui.closeModal(); this.doAttack(from, to, ch.sel); };
  },

  async doAttack(from, to, sel) {
    const m = this.m;
    const prevUnits = G.cloneU(m.terr[to].units), prev = m.terr[to].owner, fort = m.terr[to].fort;
    const out = G.act.attack(m, 0, from, to, sel);
    if (!out) return;
    this.busy = true;
    const A = G.map.terrs[from], B = G.map.terrs[to];
    this.rend.addFx({ type: 'arrow', from: [A.cx, A.cy], to: [B.cx, B.cy], col: '#ff3b5c', dur: 700 });
    if (!out.res.empty && G.meta.data.settings.anim !== 'off') {
      await G.BattleScene.play({
        world: m.world, tid: to, from, result: out.res, fort,
        att: { units: sel, color: m.factions[0].color, name: m.factions[0].name },
        def: { units: prevUnits, color: this.ownerColor(prev), name: this.ownerName(prev) },
        place: `${B.name} · ${G.TTYPES[B.type].name}`,
        banner: out.captured ? 'השטח נכבש!' : 'ההתקפה נהדפה',
        good: out.captured
      });
    } else if (this.rend.convoy) await this.rend.convoy(from, to, sel, m.factions[0].color, 0.7);
    else await G.sleep(350);
    this.afterCombat(to, out, 0);
    this.busy = false;
    this.select(out.captured ? to : from);
    const end = G.checkEnd(m);
    if (end) this.finish(end);
  },

  afterCombat(to, out, fi) {
    const B = G.map.terrs[to], r = this.rend;
    r.boom(B.cx, B.cy, out.captured ? 1.4 : 0.8);
    if (out.captured) {
      r.ownerDirty = true;
      r.addFx({ type: 'ring', x: B.cx, y: B.cy, dur: 1000, col: this.m.factions[fi].color, size: 90 });
      r.addFx({ type: 'text', x: B.cx, y: B.cy - 10, dur: 1500, text: fi === 0 ? 'נכבש!' : 'אבד!', col: fi === 0 ? '#3dff8f' : '#ff3b5c', size: 20 });
      fi === 0 ? G.sfx.capture() : G.sfx.boom();
    } else {
      r.addFx({ type: 'text', x: B.cx, y: B.cy - 10, dur: 1300, text: fi === 0 ? 'נהדף' : 'הוגן!', col: fi === 0 ? '#ff3b5c' : '#3dff8f', size: 18 });
    }
    G.checkObjectives(this.m);
    this.refreshHUD();
  },

  async endTurn() {
    const m = this.m;
    if (this.busy || !m || m.over || $('#modal').classList.contains('show')) return;
    this.busy = true;
    this.deselect();
    G.sfx.turn();
    $('#btn-end').disabled = true;
    const anim = G.meta.data.settings.anim;
    for (let fi = 1; fi < m.factions.length; fi++) {
      const f = m.factions[fi];
      if (!f.alive) continue;
      this.turnOf = fi; this.refreshHUD();
      const bn = $('#ai-banner');
      bn.innerHTML = `<span style="color:${f.color}">${f.name}</span> משחק...`;
      bn.classList.add('show');
      G.startTurn(m, fi);
      await G.sleep(450);
      bn.classList.remove('show');
      await G.AI.turn(m, fi, {
        event: async ev => {
          const A = G.map.terrs[ev.from], B = G.map.terrs[ev.to];
          const involve = ev.prev === 0;
          this.rend.addFx({ type: 'arrow', from: [A.cx, A.cy], to: [B.cx, B.cy], col: f.color, dur: 650 });
          if (involve && !ev.out.res.empty && anim === 'all') {
            const pre = G.cloneU(ev.out.res.rounds.length ? this.reconstructDef(ev.out.res) : {});
            await G.BattleScene.play({
              world: m.world, tid: ev.to, from: ev.from, result: ev.out.res, fort: m.terr[ev.to].fort,
              att: { units: ev.sent, color: f.color, name: f.name },
              def: { units: pre, color: m.factions[0].color, name: m.factions[0].name },
              place: `${B.name} · ${G.TTYPES[B.type].name}`,
              banner: ev.out.captured ? 'השטח אבד!' : 'ההגנה החזיקה!', good: !ev.out.captured
            });
          } else if (this.rend.convoy) await this.rend.convoy(ev.from, ev.to, ev.sent, f.color, involve ? 0.85 : 0.5);
          else await G.sleep(involve ? 500 : 220);
          this.afterCombat(ev.to, ev.out, fi);
          if (involve) G.ui.toast(ev.out.captured ? `${f.name} כבש את ${B.name}!` : `הדפת את ${f.name} ב${B.name}`, ev.out.captured ? 'bad' : 'good');
        }
      });
      this.rend.ownerDirty = true;
      if (G.checkEnd(m) === 'lose') break;
    }
    this.turnOf = 0;
    $('#btn-end').disabled = false;
    const end = G.checkEnd(m);
    if (end) { this.busy = false; this.refreshHUD(); return this.finish(end); }
    m.turn++;
    G.startTurn(m, 0);
    const inc = G.incomeOf(m, 0);
    G.ui.toast(`תור ${m.turn} · הכנסה +${inc} 💰`, 'gold');
    G.checkObjectives(m);
    G.saveMatch(m);
    this.busy = false;
    this.refreshHUD();
  },

  reconstructDef(res) {
    // defender's units before battle = remaining + all losses
    const u = G.cloneU(res.D);
    for (const r of res.rounds) for (const k in r.lossD) u[k] = (u[k] || 0) + r.lossD[k];
    return u;
  },

  objectivesModal(start) {
    const m = this.m;
    const par = G.parTurns(m);
    G.ui.modal(`<h2>${start ? 'תדריך משימה' : 'משימות'}</h2>
      <p><b>מטרה ראשית:</b> כבוש את כל ${G.activeTids(m).length} השטחים. (${G.ownedBy(m, 0).length} בשליטתך)</p>
      <p>⭐⭐⭐ ניצחון עד תור ${par} · ⭐⭐ עד תור ${Math.round(par * 1.5)} · ⭐ ניצחון</p>
      <b>משימות צד (פרס: קרדיטים + נק״מ):</b>
      ${m.objectives.map(o => `<div class="obj ${o.done ? 'done' : ''}">${o.done ? '✅' : '🎯'} ${o.text}<span class="pr">${o.done ? 'הושלם' : Math.min(G.objProgress(m, o), o.n) + '/' + o.n}</span></div>`).join('')}
      <div class="m-actions"><button class="btn primary" id="b-ok">${start ? 'התחל!' : 'סגור'}</button></div>`);
    $('#b-ok').onclick = () => G.ui.closeModal();
  },

  pauseMenu() {
    if (this.busy) return;
    G.ui.modal(`<h2>הפסקה</h2>
      <div class="menu" style="width:100%">
        <button class="btn big primary" id="pm-res">המשך</button>
        <button class="btn" id="pm-set">הגדרות</button>
        <button class="btn" id="pm-help">איך משחקים</button>
        <button class="btn" id="pm-save">שמור ויציאה לתפריט</button>
        <button class="btn danger" id="pm-quit">כניעה</button>
      </div>`);
    $('#pm-res').onclick = () => G.ui.closeModal();
    $('#pm-set').onclick = () => G.ui.settings();
    $('#pm-help').onclick = () => G.ui.howto();
    $('#pm-save').onclick = () => { G.saveMatch(this.m); G.ui.closeModal(); G.ui.show('title'); };
    $('#pm-quit').onclick = () => { if (confirm('להיכנע ולסיים את המשימה?')) { G.ui.closeModal(); this.finish('lose'); } };
  },

  finish(result) {
    const m = this.m;
    if (m.over) return;
    m.over = true;
    G.clearMatch();
    const key = G.missionKey(m);
    const par = G.parTurns(m);
    let stars = 0, tp = 0;
    if (result === 'win') {
      stars = m.turn <= par ? 3 : m.turn <= par * 1.5 ? 2 : 1;
      const prev = G.meta.stars(key);
      const full = Math.round(stars * (m.mode === 'world' ? 5 : 3) * (1 + m.world * 0.5) * ({ easy: 0.7, normal: 1, hard: 1.4 }[m.diff] || 1));
      tp = stars > prev ? full : Math.max(1, Math.ceil(full / 3));
      if (stars > prev) G.meta.data.stars[key] = stars;
      G.meta.data.tp += tp;
      G.meta.addXP(100 * (m.world + 1) * (m.mode === 'world' ? 2 : 1));
      G.meta.ach('first_win');
      if (stars === 3) G.meta.ach('three_star');
      if (m.mode === 'world' && m.world === 0) G.meta.ach('world1');
      if (m.mode === 'world' && m.world === 4) G.meta.ach('world5');
      G.sfx.win();
    } else { G.meta.addXP(20); G.sfx.lose(); }
    G.meta.save();
    const won = result === 'win';
    const nextLabel = (() => {
      if (!won) return null;
      if (m.mode === 'country') {
        const map = G.getMap(m.world);
        if (m.country + 1 < map.countries.length) return 'המדינה הבאה ›';
        return 'למלחמה הכוללת ›';
      }
      return m.world + 1 < G.WORLDS.length ? 'לעולם הבא ›' : null;
    })();
    G.ui.modal(`<h2 style="text-align:center">${won ? 'ניצחון!' : 'תבוסה'}</h2>
      ${won ? `<div class="big-stars">${[0, 1, 2].map(i => `<span class="${i < stars ? 'on' : ''}">★</span>`).join('')}</div>` : '<p style="text-align:center">כוחותיך הובסו. חזור חזק יותר – שדרג במעבדת המחקר.</p>'}
      <div class="stat-grid">
        <div>תורות<b>${m.turn}</b></div><div>שטחים שנכבשו<b>${m.stats.captured}</b></div>
        <div>קרבות שנוצחו<b>${m.stats.battlesWon}</b></div><div>יחידות שגויסו<b>${m.stats.recruited}</b></div>
        <div>משימות צד<b>${m.objectives.filter(o => o.done).length}/${m.objectives.length}</b></div><div>נק״מ שהרווחת<b style="color:#c9b6ff">+${tp}</b></div>
      </div>
      <div class="m-actions">
        <button class="btn" id="f-menu">תפריט</button>
        <button class="btn" id="f-lab">${G.svg('flask')} מחקר</button>
        <button class="btn ${won && nextLabel ? '' : 'primary'}" id="f-retry">שחק שוב</button>
        ${nextLabel ? `<button class="btn primary" id="f-next">${nextLabel}</button>` : ''}
      </div>`, { dismiss: false });
    $('#f-menu').onclick = () => { G.ui.closeModal(); G.ui.show('title'); };
    $('#f-lab').onclick = () => { G.ui.closeModal(); G.ui.show('title'); G.ui.go('research'); };
    $('#f-retry').onclick = () => { G.ui.closeModal(); const nm = G.newMatch(m.world, m.country, m.diff); G.startTurn(nm, 0); this.start(nm, false); this.objectivesModal(true); };
    const nx = $('#f-next');
    if (nx) nx.onclick = () => {
      G.ui.closeModal();
      G.ui.show('title');
      if (m.mode === 'country') {
        G.ui.worldMode = 'campaign'; G.ui.world = m.world;
        G.ui.stack = ['title', 'worlds']; G.ui.renderWorlds(); G.ui.go('countries');
        const map = G.getMap(m.world);
        G.ui.briefing(m.world, m.country + 1 < map.countries.length ? m.country + 1 : null);
      } else {
        G.ui.worldMode = G.ui.worldMode || 'campaign'; G.ui.world = m.world + 1;
        G.ui.stack = ['title']; G.ui.go('worlds');
        if (G.ui.worldMode === 'campaign') G.ui.go('countries'); else G.ui.briefing(m.world + 1, null);
      }
    };
  }
};

/* ======================================================================
   TITLE SCREEN – animated synthwave sunset
   ====================================================================== */
G.Title = {
  init() {
    this.cv = $('#title-cv'); this.ctx = this.cv.getContext('2d');
    const R = G.rng(7);
    this.bld = []; let x = 0;
    while (x < 1.05) { const w = R.range(0.018, 0.05); this.bld.push({ x, w, h: R.range(0.05, 0.26) * (Math.abs(x - 0.5) < 0.2 ? 1.25 : 1), win: R() }); x += w + R.range(0.002, 0.01); }
    this.palms = [0.06, 0.13, 0.88, 0.95].map(px => ({ x: px, h: R.range(0.22, 0.32), lean: R.range(-0.05, 0.05) }));
    this.jets = [];
    this.stars = Array.from({ length: 90 }, () => [R(), R() * 0.45, R()]);
  },
  refresh() {
    const lvl = G.meta.level();
    $('#rank-card').innerHTML = `${G.svg('crown')}<div><b>${G.RANKS[lvl]}</b> · דרגה ${lvl + 1}<div class="xpbar"><i style="width:${G.meta.levelProgress() * 100}%"></i></div></div>
      <span>${G.svg('star')} ${G.meta.totalStars()}</span><span>${G.svg('flask')} ${G.meta.data.tp}</span>`;
    const saved = G.loadMatch();
    const bc = $('#btn-continue');
    if (saved) {
      const w = G.WORLDS[saved.world];
      bc.hidden = false;
      bc.innerHTML = `${G.svg('play')} המשך: ${saved.mode === 'world' ? w.name : G.getMap(saved.world).countries[saved.country].name} (תור ${saved.turn})`;
      bc.onclick = () => { G.sfx.select(); G.ctl.start(saved, false); };
    } else bc.hidden = true;
  },
  frame(now) {
    const cv = this.cv, ctx = this.ctx;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = cv.clientWidth, H = cv.clientHeight;
    if (cv.width !== Math.round(W * dpr)) { cv.width = W * dpr; cv.height = H * dpr; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const t = now / 1000, hz = H * 0.62;
    const sky = ctx.createLinearGradient(0, 0, 0, hz);
    ['#0d0221', '#2b0a4a', '#7a1a73', '#e2447f', '#ff8a5c', '#ffcf7a'].forEach((c, i, a) => sky.addColorStop(i / (a.length - 1), c));
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, hz);
    for (const s of this.stars) { ctx.fillStyle = `rgba(255,255,255,${0.3 + 0.5 * Math.abs(Math.sin(t + s[2] * 9)) * (1 - s[1] * 2)})`; ctx.fillRect(s[0] * W, s[1] * H, 1.5, 1.5); }
    // sun
    const sr = Math.min(W, H) * 0.26, sx = W / 2, sy = hz - sr * 0.35;
    const glow = ctx.createRadialGradient(sx, sy, sr * 0.5, sx, sy, sr * 2.4);
    glow.addColorStop(0, 'rgba(255,120,120,.55)'); glow.addColorStop(1, 'rgba(255,60,140,0)');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, W, hz);
    ctx.save();
    ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.clip();
    const sg = ctx.createLinearGradient(0, sy - sr, 0, sy + sr);
    sg.addColorStop(0, '#fff3a8'); sg.addColorStop(0.5, '#ff9a4d'); sg.addColorStop(1, '#ff2d95');
    ctx.fillStyle = sg; ctx.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
    ctx.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 9; i++) { const yy = sy + sr * (0.05 + i * 0.11) + ((t * 8) % (sr * 0.11)); ctx.fillRect(sx - sr, yy, sr * 2, 2 + i * 1.2); }
    ctx.restore();
    // skyline
    ctx.fillStyle = '#1a0630';
    for (const b of this.bld) {
      const bx = b.x * W, bw = b.w * W, bh = b.h * H;
      ctx.fillRect(bx, hz - bh, bw, bh);
    }
    for (const b of this.bld) {
      const bx = b.x * W, bw = b.w * W, bh = b.h * H;
      const R = G.rng((b.win * 1e6) | 0);
      for (let wy = hz - bh + 6; wy < hz - 4; wy += 7) for (let wx = bx + 3; wx < bx + bw - 3; wx += 6) {
        if (R() < 0.33) { ctx.fillStyle = R() < 0.5 ? 'rgba(255,90,170,.8)' : 'rgba(255,220,140,.8)'; ctx.fillRect(wx, wy, 2.5, 3); }
      }
      if (b.h > 0.2) { ctx.fillStyle = (Math.sin(t * 3 + b.x * 20) > 0) ? '#ff2d55' : '#55001a'; ctx.fillRect(bx + bw / 2 - 1.5, hz - bh - 6, 3, 3); }
    }
    // ground grid
    const gg = ctx.createLinearGradient(0, hz, 0, H);
    gg.addColorStop(0, '#2a0845'); gg.addColorStop(1, '#07010f');
    ctx.fillStyle = gg; ctx.fillRect(0, hz, W, H - hz);
    ctx.strokeStyle = 'rgba(255,45,149,.55)'; ctx.lineWidth = 1.2;
    ctx.shadowColor = '#ff2d95'; ctx.shadowBlur = 8;
    for (let i = -24; i <= 24; i++) { ctx.beginPath(); ctx.moveTo(W / 2 + i * 10, hz); ctx.lineTo(W / 2 + i * W * 0.12, H); ctx.stroke(); }
    const off = (t * 0.35) % 1;
    for (let i = 0; i < 14; i++) { const k = (i + off) / 14; const y = hz + (H - hz) * k * k; ctx.globalAlpha = k; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    // palms silhouettes
    for (const p of this.palms) {
      const px = p.x * W, base = H * 0.9, top = base - p.h * H, lx = px + p.lean * W;
      ctx.strokeStyle = '#07010f'; ctx.lineWidth = Math.max(6, W * 0.008); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(px, base); ctx.quadraticCurveTo(px, (base + top) / 2, lx, top); ctx.stroke();
      ctx.lineWidth = Math.max(4, W * 0.005);
      for (let k = 0; k < 7; k++) {
        const a = Math.PI + k * Math.PI / 6 + Math.sin(t + k) * 0.04, L = H * 0.12;
        ctx.beginPath(); ctx.moveTo(lx, top);
        ctx.quadraticCurveTo(lx + Math.cos(a) * L * 0.6, top + Math.sin(a) * L * 0.6 - 10, lx + Math.cos(a) * L, top + Math.sin(a) * L * 0.4 + L * 0.35);
        ctx.stroke();
      }
    }
    // jets
    if (Math.random() < 0.004 && this.jets.length < 2) this.jets.push({ x: -0.1, y: Math.random() * 0.3 + 0.08, v: 0.08 + Math.random() * 0.05 });
    for (const j of this.jets) {
      j.x += j.v / 60;
      ctx.save(); ctx.translate(j.x * W, j.y * H); ctx.rotate(Math.PI / 2); ctx.scale(1.1, 1.1); ctx.translate(-12, -12);
      ctx.fillStyle = '#12031f'; ctx.fill(G.path('jet')); ctx.restore();
      ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(j.x * W - 14, j.y * H); ctx.lineTo(j.x * W - 160, j.y * H); ctx.stroke();
    }
    this.jets = this.jets.filter(j => j.x < 1.2);
    // vignette
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.8);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.6)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  }
};
