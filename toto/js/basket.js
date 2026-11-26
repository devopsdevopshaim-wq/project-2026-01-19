// Basketball: data, rating model (time-weighted offence/defence + home edge per league) and Winner Sal style markets.
'use strict';

const BSK_LEAGUES = { 'bsk.isr': 'ליגת העל בכדורסל', 'bsk.euro': 'יורוליג', 'bsk.nba': 'NBA' };
const BSK = { leagues: {}, built: null, ok: false };
const BSK_HE = {
  // Israel
  'maccabi tel aviv': 'מכבי תל אביב', 'hapoel tel aviv': 'הפועל תל אביב', 'hapoel jerusalem': 'הפועל ירושלים', 'hapoel holon': 'הפועל חולון',
  'maccabi rishon lezion': 'מכבי ראשון לציון', 'hapoel beer sheva': 'הפועל באר שבע', 'hapoel eilat': 'הפועל אילת', 'bnei herzliya': 'בני הרצליה',
  'hapoel galil elyon': 'הפועל גליל עליון', 'ironi ness ziona': 'עירוני נס ציונה', 'maccabi ironi ramat gan': 'מכבי עירוני רמת גן', 'ironi kiryat ata': 'עירוני קריית אתא',
  'hapoel haifa': 'הפועל חיפה', 'maccabi haifa': 'מכבי חיפה', 'elitzur netanya': 'אליצור נתניה', 'hapoel afula': 'הפועל עפולה', 'ironi nahariya': 'עירוני נהריה',
  'maccabi raanana': 'מכבי רעננה', 'hapoel gilboa galil': 'הפועל גלבוע גליל', 'hapoel hevel modiin': 'הפועל חבל מודיעין',
  // EuroLeague
  'real madrid baloncesto': 'ריאל מדריד', 'real madrid': 'ריאל מדריד', 'barcelona': 'ברצלונה', 'panathinaikos': 'פנאתינייקוס', 'olympiacos': 'אולימפיאקוס',
  'fenerbahce': "פנרבחצ'ה", 'anadolu efes': 'אנדולו אפס', 'crvena zvezda': 'הכוכב האדום', 'partizan': 'פרטיזן', 'zalgiris': "ז'לגיריס",
  'olimpia milano': 'אולימפיה מילאנו', 'ea7 emporio armani milano': 'אולימפיה מילאנו', 'virtus bologna': 'וירטוס בולוניה', 'bayern munchen': 'באיירן מינכן', 'bayern munich': 'באיירן מינכן',
  'asvel': 'וילרבאן', 'ldlc asvel': 'וילרבאן', 'monaco': 'מונאקו', 'paris basketball': 'פריז', 'baskonia': 'בסקוניה', 'valencia basket': 'ולנסיה',
  'dubai basketball': 'דובאי', 'alba berlin': 'אלבה ברלין',
  // NBA
  'boston celtics': 'בוסטון סלטיקס', 'brooklyn nets': 'ברוקלין נטס', 'new york knicks': 'ניו יורק ניקס', 'philadelphia 76ers': "פילדלפיה 76'", 'toronto raptors': 'טורונטו ראפטורס',
  'chicago bulls': "שיקגו בולס", 'cleveland cavaliers': 'קליבלנד קאבלירס', 'detroit pistons': 'דטרויט פיסטונס', 'indiana pacers': 'אינדיאנה פייסרס', 'milwaukee bucks': 'מילווקי באקס',
  'atlanta hawks': 'אטלנטה הוקס', 'charlotte hornets': "שארלוט הורנטס", 'miami heat': 'מיאמי היט', 'orlando magic': 'אורלנדו מג׳יק', 'washington wizards': 'וושינגטון וויזארדס',
  'denver nuggets': 'דנבר נאגטס', 'minnesota timberwolves': 'מינסוטה טימברוולבס', 'oklahoma city thunder': 'אוקלהומה סיטי ת׳אנדר', 'portland trail blazers': 'פורטלנד טרייל בלייזרס', 'utah jazz': "יוטה ג'אז",
  'golden state warriors': "גולדן סטייט ווריורס", 'los angeles clippers': 'לוס אנג׳לס קליפרס', 'la clippers': 'לוס אנג׳לס קליפרס', 'los angeles lakers': 'לוס אנג׳לס לייקרס', 'phoenix suns': 'פיניקס סאנס', 'sacramento kings': 'סקרמנטו קינגס',
  'dallas mavericks': 'דאלאס מאבריקס', 'houston rockets': 'יוסטון רוקטס', 'memphis grizzlies': 'ממפיס גריזליס', 'new orleans pelicans': 'ניו אורלינס פליקנס', 'san antonio spurs': 'סן אנטוניו ספרס',
};
const BSK_STOP = new Set('bc kk bk sk bb basket basketball baloncesto club fc'.split(' '));
function bskKey(n) {
  let k = String(n || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’'.]/g, '').replace(/[-/()]/g, ' ');
  return k.split(/\s+/).filter(t => t && !BSK_STOP.has(t)).join(' ');
}
function bskHe(n) {
  const k = bskKey(n);
  if (BSK_HE[k]) return BSK_HE[k];
  for (const hk of Object.keys(BSK_HE)) if (keySimilarity(k, hk) >= 0.8) return BSK_HE[hk];
  return n;
}

async function loadBasketball() {
  try {
    const d = await fetchData('basketball.json');
    BSK.built = d.built;
    for (const [code, src] of Object.entries(d.leagues)) {
      BSK.leagues[code] = {
        code, name: src.name || BSK_LEAGUES[code],
        teams: src.teams.map(n => ({ name: n, he: bskHe(n), key: bskKey(n) })),
        m: src.m.map(r => ({ d: r[0], t: r[1] || '', h: r[2], a: r[3], hs: r[4], as: r[5] })),
        _fit: null,
      };
    }
    BSK.ok = true;
  } catch (e) { /* basketball data missing: page explains */ }
}

// Rating fit: home pts = mu + adv/2 + off[h] - def[a]; away pts = mu - adv/2 + off[a] - def[h].
function bskFit(L, asOf) {
  asOf = asOf || todayISO();
  if (L._fit && L._fit.asOf === asOf) return L._fit;
  const from = addDays(asOf, -730);
  const ms = L.m.filter(x => x.hs != null && x.d < asOf && x.d >= from).map(x => ({ ...x, w: Math.pow(0.5, daysBetween(x.d, asOf) / 100) }));
  const n = L.teams.length, off = new Float64Array(n), def = new Float64Array(n), games = new Float64Array(n);
  let sw = 0, sp = 0, sm = 0;
  for (const x of ms) { sw += x.w; sp += x.w * (x.hs + x.as) / 2; sm += x.w * (x.hs - x.as); games[x.h] += x.w; games[x.a] += x.w; }
  let mu = sw ? sp / sw : 80, adv = sw ? sm / sw : 3;
  const LAM = 2.5;
  for (let it = 0; it < 30; it++) {
    const no = new Float64Array(n), nd = new Float64Array(n), wo = new Float64Array(n), wd = new Float64Array(n);
    for (const x of ms) {
      // offence of h: residual of home points without off[h]
      no[x.h] += x.w * (x.hs - (mu + adv / 2 - def[x.a])); wo[x.h] += x.w;
      no[x.a] += x.w * (x.as - (mu - adv / 2 - def[x.h])); wo[x.a] += x.w;
    }
    for (let i = 0; i < n; i++) off[i] = no[i] / (wo[i] + LAM);
    for (const x of ms) {
      nd[x.a] += x.w * ((mu + adv / 2 + off[x.h]) - x.hs); wd[x.a] += x.w;
      nd[x.h] += x.w * ((mu - adv / 2 + off[x.a]) - x.as); wd[x.h] += x.w;
    }
    for (let i = 0; i < n; i++) def[i] = nd[i] / (wd[i] + LAM);
    let rs = 0, rm = 0;
    for (const x of ms) {
      const eh = off[x.h] - def[x.a], ea = off[x.a] - def[x.h];
      rs += x.w * ((x.hs + x.as) / 2 - mu - (eh + ea) / 2);
      rm += x.w * ((x.hs - x.as) - adv - (eh - ea));
    }
    if (sw) { mu += rs / sw; adv += rm / sw; }
  }
  let vm = 0, vt = 0;
  for (const x of ms) {
    const ph = mu + adv / 2 + off[x.h] - def[x.a], pa = mu - adv / 2 + off[x.a] - def[x.h];
    vm += x.w * ((x.hs - x.as) - (ph - pa)) ** 2; vt += x.w * ((x.hs + x.as) - (ph + pa)) ** 2;
  }
  const sdm = Math.max(9, Math.sqrt(sw ? vm / sw : 144)), sdt = Math.max(12, Math.sqrt(sw ? vt / sw : 324));
  L._fit = { asOf, mu, adv, off, def, games, sdm, sdt, n: ms.length };
  return L._fit;
}

function normCdf(z) { // Abramowitz–Stegun
  const t = 1 / (1 + 0.2316419 * Math.abs(z)), d = 0.3989423 * Math.exp(-z * z / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}
// Discrete normal: P(X < k), P(X = k), P(X > k) for an integer-valued quantity around mean m, sd s, line k.
function lineProbs(m, s, k) {
  const isInt = Math.abs(k - Math.round(k)) < 1e-9;
  if (!isInt) { const pu = normCdf((k - m) / s); return { below: pu, exact: 0, above: 1 - pu }; }
  const lo = normCdf((k - 0.5 - m) / s), hi = normCdf((k + 0.5 - m) / s);
  return { below: lo, exact: hi - lo, above: 1 - hi };
}

// Markets. Winner-style 1/X/2 is decided at the end of regulation time (no overtime).
function bskPredict(code, h, a, asOf, opt) {
  const L = BSK.leagues[code], F = bskFit(L, asOf);
  const ph = F.mu + F.adv / 2 + F.off[h] - F.def[a], pa = F.mu - F.adv / 2 + F.off[a] - F.def[h];
  const m = ph - pa, t = ph + pa;
  const reg = lineProbs(m, F.sdm, 0); // 1 = home leads after regulation, X = tie, 2 = away
  const winOT = 1 - normCdf(-m / F.sdm);
  const out = { ph, pa, m, t, sdm: F.sdm, sdt: F.sdt, p1: reg.above, px: reg.exact, p2: reg.below, winOT, reliability: Math.min(F.games[h], F.games[a]) };
  if (opt && opt.type === 'spread' && opt.line !== '' && opt.line != null && !isNaN(+opt.line)) {
    // home must win by more than the line (negative line = away is favoured)
    const q = lineProbs(m, F.sdm, +opt.line);
    Object.assign(out, { p1: q.above, px: q.exact, p2: q.below, market: `הפרש: הבית מנצח ביותר מ־${+opt.line}` });
  } else if (opt && opt.type === 'total' && opt.line !== '' && opt.line != null && !isNaN(+opt.line)) {
    const q = lineProbs(t, F.sdt, +opt.line); // 1 = under, X = exact, 2 = over (Winner convention)
    Object.assign(out, { p1: q.below, px: q.exact, p2: q.above, market: `סך נקודות: 1 פחות מ־${+opt.line}, 2 יותר` });
  }
  return out;
}

function bskStandings(L) {
  const ss = `${seasonStartYear(todayISO())}-07-01`, tab = {};
  for (const x of L.m) {
    if (x.d < ss) continue;
    for (const t of [x.h, x.a]) tab[t] = tab[t] || { t, p: 0, w: 0, l: 0, pf: 0, pa: 0, form: [] };
    if (x.hs == null) continue;
    const H = tab[x.h], A = tab[x.a];
    H.p++; A.p++; H.pf += x.hs; H.pa += x.as; A.pf += x.as; A.pa += x.hs;
    if (x.hs > x.as) { H.w++; A.l++; H.form.push('W'); A.form.push('L'); } else { A.w++; H.l++; A.form.push('W'); H.form.push('L'); }
  }
  const list = Object.values(tab).sort((a, b) => b.w / (b.p || 1) - a.w / (a.p || 1) || (b.pf - b.pa) - (a.pf - a.pa));
  list.forEach((r, i) => { r.pos = i + 1; r.form = r.form.slice(-5); });
  return list;
}
