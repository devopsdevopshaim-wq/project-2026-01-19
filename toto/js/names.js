// Team-name normalisation (must stay close to tools/build_data.py) and Hebrew display names.
'use strict';

const STOP = new Set('fc afc cf sc ac ssc sv vfl vfb tsg fsv rc ud cd sd rcd ca as ogc losc stade club de and sk fk bv sl sad calcio 1 04 05 1846 1899 1900 1907 1909 1910 1913 1919 hsc us ss acf bsc rb'.split(' '));

// Spelling variants -> canonical key (openfootball keys + common ESPN spellings).
const ALIAS = {
  'betis balompie': 'betis', 'celta vigo': 'celta', 'deportivo alaves': 'alaves', 'rayo vallecano madrid': 'rayo vallecano',
  'sociedad futbol': 'sociedad', 'espanyol': 'espanyol barcelona', 'atletico': 'atletico madrid', 'athletic bilbao': 'athletic',
  'atalanta bc': 'atalanta', 'internazionale milano': 'inter', 'internazionale': 'inter', 'lazio roma': 'lazio', 'uc sampdoria': 'sampdoria',
  'delfino pescara': 'pescara', 'genoa cfc': 'genoa', 'verona': 'hellas verona',
  'bor monchengladbach': 'borussia monchengladbach', 'spvgg greuther furth 1903': 'spvgg greuther furth', 'bochum 1848': 'bochum',
  'paderborn 07': 'paderborn', 'bayern munich': 'bayern munchen', 'bayern': 'bayern munchen', 'hamburg': 'hamburger', 'cologne': 'koln',
  'es troyes': 'troyes', 'estac troyes': 'troyes', 'racing lens': 'lens', 'rennais 1901': 'rennais', 'rennes': 'rennais',
  'strasbourg alsace': 'strasbourg', 'psg': 'paris saint germain', 'marseille': 'olympique marseille', 'lyon': 'olympique lyonnais',
  'lille': 'lille osc', 'brest': 'brestois 29', 'angers': 'angers sco', 'auxerre': 'aj auxerre', 'paris fc': 'paris',
  'az alkmaar': 'az', 'cambuur leeuwarden': 'cambuur', 'feyenoord rotterdam': 'feyenoord', 'nec nijmegen': 'nec', 'psv eindhoven': 'psv',
  'sbv vitesse': 'vitesse', 'twente 65': 'twente', 'willem ii tilburg': 'willem ii',
  'sport lisboa e benfica': 'benfica', 'sporting clube braga': 'sporting braga', 'braga': 'sporting braga',
  'sporting clube portugal': 'sporting cp', 'sporting': 'sporting cp', 'gd estoril praia': 'gd estoril', 'estoril': 'gd estoril',
  'atiker konyaspor': 'konyaspor', 'gazisehir gaziantep': 'gaziantep',
  'anderlecht': 'rsc anderlecht', 'club brugge': 'brugge kv', 'genk': 'krc genk', 'gent': 'kaa gent', 'antwerp': 'royal antwerp',
  'man united': 'manchester united', 'man city': 'manchester city', 'spurs': 'tottenham hotspur', 'wolves': 'wolverhampton wanderers',
  'brighton': 'brighton hove albion', 'west brom': 'west bromwich albion', 'qpr': 'queens park rangers',
};

const GENERIC = new Set('real city united town athletic manchester sporting hapoel maccabi olympique borussia eintracht racing rovers wanderers albion county inter ironi bnei beitar sheffield west'.split(' '));

function teamKey(name) {
  let n = String(name || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
  n = n.replace(/[’']/g, '').replace(/[.&\-/()]/g, ' ');
  const k = n.split(/\s+/).filter(t => t && !STOP.has(t)).join(' ');
  return ALIAS[k] || k;
}

function tokMatch(x, y) {
  if (x === y) return true;
  const m = Math.min(x.length, y.length), M = Math.max(x.length, y.length);
  return m >= 4 && m / M >= 0.6 && (x.startsWith(y) || y.startsWith(x));
}

// Similarity 0..1 between two normalised keys; generic words (city, united…) weigh little.
// Club-type words that tell clubs from the same city apart (Hapoel vs Maccabi, City vs United).
const DISC = new Set('hapoel maccabi beitar bnei sektzia moadon city united real atletico athletic sporting inter rovers wanderers albion county town'.split(' '));

function keySimilarity(a, b) {
  if (a === b) return 1;
  const A = a.split(' '), B = b.split(' ');
  const dA = A.filter(t => DISC.has(t)), dB = B.filter(t => DISC.has(t));
  if (dA.length && dB.length && !dA.some(t => dB.includes(t))) return 0;
  const wt = t => (GENERIC.has(t) ? 0.3 : 1);
  let hit = 0;
  for (const x of A) if (B.some(y => tokMatch(x, y))) hit += wt(x);
  const tot = Math.max(A.reduce((s, t) => s + wt(t), 0), B.reduce((s, t) => s + wt(t), 0));
  let score = tot ? hit / tot : 0;
  // One name fully inside the other ("excelsior" / "sbv excelsior", "ajax" / "ajax amsterdam").
  const [S, Lg] = A.length <= B.length ? [A, B] : [B, A];
  if (S.some(t => !GENERIC.has(t) && t.length >= 3) && S.every(x => Lg.some(y => tokMatch(x, y)))) score = Math.max(score, 0.85);
  return score;
}

const HE = {
  // Israel
  'maccabi tel aviv': 'מכבי תל אביב', 'hapoel beer': 'הפועל באר שבע', 'hapoel kiryat shmona': 'עירוני קריית שמונה', 'ironi kiryat shmona': 'עירוני קריית שמונה',
  'maccabi raina': 'מכבי בני ריינה', 'moadon sport ashdod': 'מ.ס. אשדוד', 'hapoel nof hagalil': 'הפועל נוף הגליל', 'ironi tiberias': 'עירוני טבריה', 'hapoel tel aviv': 'הפועל תל אביב', 'maccabi haifa': 'מכבי חיפה', 'hapoel haifa': 'הפועל חיפה',
  'hapoel beer sheva': 'הפועל באר שבע', 'hapoel be er sheva': 'הפועל באר שבע', 'beitar jerusalem': 'בית"ר ירושלים',
  'hapoel jerusalem': 'הפועל ירושלים', 'maccabi netanya': 'מכבי נתניה', 'bnei sakhnin': 'בני סכנין', 'sakhnin': 'בני סכנין',
  'ashdod': 'מ.ס. אשדוד', 'hapoel petah tikva': 'הפועל פתח תקווה', 'hapoel petach tikva': 'הפועל פתח תקווה',
  'maccabi petah tikva': 'מכבי פתח תקווה', 'maccabi petach tikva': 'מכבי פתח תקווה', 'kiryat shmona': 'עירוני קריית שמונה',
  'bnei reineh': 'מכבי בני ריינה', 'hapoel hadera': 'הפועל חדרה', 'bnei yehuda': 'בני יהודה', 'hapoel kfar saba': 'הפועל כפר סבא',
  'hapoel raanana': 'הפועל רעננה', 'tiberias': 'עירוני טבריה', 'maccabi herzliya': 'מכבי הרצליה', 'hapoel rishon lezion': 'הפועל ראשון לציון',
  'nof hagalil': 'הפועל נוף הגליל', 'hapoel afula': 'הפועל עפולה', 'hapoel akko': 'הפועל עכו', 'hapoel acre': 'הפועל עכו',
  'umm al fahm': 'הפועל אום אל פאחם', 'maccabi jaffa': 'מכבי יפו', 'hapoel ramat gan': 'הפועל רמת גן', 'kfar shalem': 'הפועל כפר שלם',
  'hapoel ramat hasharon': 'הפועל רמת השרון', 'hapoel nir ramat hasharon': 'הפועל רמת השרון', 'maccabi kabilio jaffa': 'מכבי יפו',
  'hapoel kfar kana': 'הפועל כפר קנא', 'kafr qasim': 'הפועל כפר קאסם', 'hapoel kafr qasim': 'הפועל כפר קאסם', 'sektzia nes tziona': 'סקציה נס ציונה',
  'hapoel iksal': 'הפועל איכסאל', 'hapoel kiryat yam': 'הפועל קריית ים', 'maccabi kiryat gat': 'מכבי קריית גת', 'maccabi akhi nazareth': 'מכבי אחי נצרת', 'ironi modiin': 'עירוני מודיעין', 'hapoel ironi karmiel': 'הפועל כרמיאל', 'hapoel nazareth illit': 'הפועל נוף הגליל',
  // England
  'arsenal': 'ארסנל', 'chelsea': "צ'לסי", 'liverpool': 'ליברפול', 'manchester city': "מנצ'סטר סיטי", 'manchester united': "מנצ'סטר יונייטד",
  'tottenham hotspur': 'טוטנהאם', 'newcastle united': 'ניוקאסל', 'aston villa': 'אסטון וילה', 'west ham united': 'ווסטהאם', 'everton': 'אברטון',
  'brighton hove albion': 'ברייטון', 'crystal palace': 'קריסטל פאלאס', 'fulham': 'פולהאם', 'brentford': 'ברנטפורד',
  'wolverhampton wanderers': 'וולבס', 'nottingham forest': 'נוטינגהאם פורסט', 'bournemouth': "בורנמות'", 'leeds united': 'לידס',
  'sunderland': 'סנדרלנד', 'burnley': 'ברנלי', 'leicester city': 'לסטר', 'southampton': "סאות'המפטון", 'ipswich town': "איפסוויץ'",
  'coventry city': 'קובנטרי', 'hull city': 'האל סיטי', 'west bromwich albion': 'ווסט ברום', 'norwich city': "נוריץ'",
  'sheffield united': 'שפילד יונייטד', 'sheffield wednesday': 'שפילד וונסדיי', 'middlesbrough': 'מידלסברו', 'stoke city': 'סטוק סיטי',
  'watford': 'ווטפורד', 'wrexham': 'רקסהאם', 'derby county': 'דרבי קאונטי', 'swansea city': 'סוונסי', 'cardiff city': 'קרדיף',
  'queens park rangers': 'קווינס פארק ריינג\'רס', 'millwall': 'מילוול', 'bristol city': 'בריסטול סיטי', 'blackburn rovers': 'בלקברן',
  'preston north end': 'פרסטון', 'portsmouth': "פורטסמות'", 'luton town': 'לוטון', 'birmingham city': 'בירמינגהאם', 'charlton athletic': "צ'רלטון",
  'oxford united': 'אוקספורד', 'bolton wanderers': 'בולטון', 'barnsley': 'בארנסלי', 'rotherham united': "רות'רהאם", 'peterborough united': 'פיטרבורו', 'lincoln city': 'לינקולן', 'doncaster rovers': 'דונקסטר', 'wycombe wanderers': 'וויקומב', 'milton keynes dons': 'מילטון קינס', 'plymouth argyle': 'פלימות\'', 'reading': 'רדינג', 'wigan athletic': 'ויגאן',
  // Spain
  'madrid': 'ריאל מדריד', 'barcelona': 'ברצלונה', 'atletico madrid': 'אתלטיקו מדריד', 'sevilla': 'סביליה', 'valencia': 'ולנסיה',
  'villarreal': 'ויאריאל', 'betis': 'בטיס', 'sociedad': 'ריאל סוסיאדד', 'athletic': 'אתלטיק בילבאו', 'celta': 'סלטה ויגו',
  'osasuna': 'אוסאסונה', 'getafe': 'חטאפה', 'girona': "ג'ירונה", 'mallorca': 'מיורקה', 'rayo vallecano': 'ראיו ואייקאנו',
  'alaves': 'אלאבס', 'espanyol barcelona': 'אספניול', 'elche': "אלצ'ה", 'levante': 'לבנטה', 'oviedo': 'ריאל אוביידו',
  'las palmas': 'לאס פאלמאס', 'valladolid': 'ויאדוליד', 'leganes': 'לגאנס', 'cadiz': 'קאדיס', 'granada': 'גרנדה', 'almeria': 'אלמריה',
  // Italy
  'inter': 'אינטר', 'milan': 'מילאן', 'juventus': 'יובנטוס', 'napoli': 'נאפולי', 'roma': 'רומא', 'lazio': 'לאציו', 'atalanta': 'אטאלנטה',
  'fiorentina': 'פיורנטינה', 'bologna': 'בולוניה', 'torino': 'טורינו', 'genoa': "ג'נואה", 'udinese': 'אודינזה', 'como': 'קומו',
  'lecce': "לצ'ה", 'cagliari': 'קליארי', 'sassuolo': 'סאסואולו', 'parma': 'פארמה', 'cremonese': 'קרמונזה', 'pisa': 'פיזה',
  'hellas verona': 'ורונה', 'empoli': 'אמפולי', 'monza': 'מונצה', 'venezia': 'ונציה', 'salernitana': 'סלרניטנה', 'sampdoria': 'סמפדוריה',
  // Germany
  'bayern munchen': 'באיירן מינכן', 'borussia dortmund': 'דורטמונד', 'bayer leverkusen': 'באייר לברקוזן', 'leipzig': 'לייפציג',
  'eintracht frankfurt': 'איינטרכט פרנקפורט', 'stuttgart': 'שטוטגרט', 'wolfsburg': 'וולפסבורג', 'freiburg': 'פרייבורג',
  'borussia monchengladbach': 'מנשנגלדבאך', 'werder bremen': 'ורדר ברמן', 'union berlin': 'אוניון ברלין', 'hoffenheim': 'הופנהיים',
  'mainz': 'מיינץ', 'augsburg': 'אאוגסבורג', 'koln': 'קלן', 'hamburger': 'המבורג', 'st pauli': 'סנט פאולי', 'heidenheim': 'היידנהיים',
  'bochum': 'בוכום', 'holstein kiel': 'הולשטיין קיל', 'darmstadt 98': 'דרמשטאדט', 'hertha': 'הרטה ברלין', 'schalke': 'שאלקה',
  '07 elversberg': 'אלברסברג', 'paderborn': 'פאדרבורן',
  // France
  'paris saint germain': "פ.ס.ז'", 'olympique marseille': 'מארסיי', 'olympique lyonnais': 'ליון', 'monaco': 'מונאקו', 'lille osc': 'ליל',
  'lens': 'לאנס', 'rennais': 'רן', 'nice': 'ניס', 'nantes': 'נאנט', 'strasbourg': 'שטרסבורג', 'toulouse': 'טולוז', 'brestois 29': 'ברסט',
  'le havre': 'לה האבר', 'angers sco': "אנז'ה", 'aj auxerre': 'אוסר', 'lorient': 'לוריין', 'metz': 'מץ', 'paris': 'פריז FC',
  'montpellier': 'מונפלייה', 'reims': 'ריימס', 'saint etienne': 'סנט אטיין',
  // Netherlands / Portugal / Turkey / Belgium / Scotland / others
  'ajax': 'אייאקס', 'psv': 'פ.ס.וו איינדהובן', 'feyenoord': 'פיינורד', 'az': 'א.ז. אלקמאר', 'twente': 'טוונטה', 'utrecht': 'אוטרכט',
  'benfica': 'בנפיקה', 'porto': 'פורטו', 'sporting cp': 'ספורטינג ליסבון', 'sporting braga': 'בראגה', 'vitoria guimaraes': 'ויטוריה גימאראייש',
  'galatasaray': 'גלאטסראיי', 'fenerbahce': "פנרבחצ'ה", 'besiktas': 'בשיקטאש', 'trabzonspor': 'טרבזונספור', 'istanbul basaksehir': 'באשקשהיר',
  'rsc anderlecht': 'אנדרלכט', 'brugge kv': "קלאב ברוז'", 'krc genk': 'גנק', 'kaa gent': 'חנט', 'royal antwerp': 'אנטוורפן',
  'union saint gilloise': "יוניון סן ז'יל", 'standard liege': "סטנדרד ליאז'",
  'celtic': 'סלטיק', 'rangers': "ריינג'רס", 'olympiacos': 'אולימפיאקוס', 'panathinaikos': 'פנאתינייקוס', 'paok': 'פאוק',
  'red bull salzburg': 'זלצבורג', 'salzburg': 'זלצבורג', 'dinamo zagreb': 'דינמו זאגרב', 'crvena zvezda': 'הכוכב האדום', 'red star belgrade': 'הכוכב האדום',
  'slavia praha': 'סלביה פראג', 'sparta praha': 'ספרטה פראג', 'young boys': 'יאנג בויז', 'basel': 'באזל', 'ferencvaros': 'פרנצווארוש',
  'copenhagen': 'קופנהגן', 'aek athens': 'א.א.ק אתונה', 'lask linz': 'לאסק לינץ', 'slovan bratislava': 'סלובאן ברטיסלבה', 'slavia prague': 'סלביה פראג',
  'sabah': 'סבאח', 'viking': 'ויקינג', 'heart of midlothian': 'הארטס', 'hibernian': 'היברניאן', 'aberdeen': 'אברדין', 'kilmarnock': 'קילמרנוק', 'motherwell': 'מאת\'רוול',
  'st mirren': 'סנט מירן', 'st johnstone': 'סנט ג\'ונסטון', 'dundee': 'דנדי', 'falkirk': 'פולקירק', 'ludogorets': 'לודוגורץ', 'midtjylland': 'מידטיילנד', 'malmo': 'מאלמו', 'fcsb': 'סטאוה',
  'legia warszawa': 'לגיה ורשה', 'legia warsaw': 'לגיה ורשה', 'lech poznan': 'לך פוזנן', 'rapid wien': 'ראפיד וינה', 'sturm graz': 'שטורם גראץ', 'olympique lyon': 'ליון', 'nottm forest': 'נוטינגהאם פורסט', 'bodo glimt': 'בודו גלימט', 'qarabag': 'קרבאך', 'shakhtar donetsk': 'שחטאר דונייצק',
};
const HE_KEYS = Object.keys(HE);

function heName(name, key) {
  const k = key || teamKey(name);
  if (HE[k]) return HE[k];
  let best = null, bs = 0;
  for (const hk of HE_KEYS) {
    const s = keySimilarity(k, hk);
    if (s > bs) { bs = s; best = hk; }
  }
  return bs >= 0.75 ? HE[best] : name.replace(/\s+(FC|AFC|CF)$/i, '');
}
