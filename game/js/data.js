'use strict';
/* ===== Neon Warfront – game data ===== */

/* ---------- unit icons (24x24 svg paths) ---------- */
G.ICONS = {
  inf: 'M12 2c-2.8 0-5 1.8-5 4.2V7h10v-.8C17 3.8 14.8 2 12 2zM8 8.3c.3 2 1.9 3.4 4 3.4s3.7-1.4 4-3.4zM7 13c-1.8.6-3 2.2-3 4.2V22h16v-4.8c0-2-1.2-3.6-3-4.2l-5 4z',
  commando: 'M5 6.6C5 4 8 2 12 2s7 2 7 4.6V8H5zM8 9.2c.3 2.3 1.9 3.8 4 3.8s3.7-1.5 4-3.8zM6.2 14l5.8 3.2 5.8-3.2c1.9.8 3.2 2.4 3.2 4.4V22H3v-3.6c0-2 1.3-3.6 3.2-4.4zM12 18.4l1.2 2.1h-2.4z',
  tank: 'M3.2 15h17.6a2.4 2.4 0 010 4.8H3.2a2.4 2.4 0 010-4.8zM6 10.2h9.2l2.2 3.8H4.6zM11.5 8.4H22V10H11.5z',
  art: 'M2 18.5a3 3 0 106 0 3 3 0 10-6 0zM14.5 18.5a3 3 0 106 0 3 3 0 10-6 0zM5 14.6L19 5l1.1 1.6-10 7.6H17v3H5z',
  aa: 'M3 19h18v3H3zM6.5 15h11l1 3.6h-13zM9.2 15.2l3.6-10 1.6.6-3.2 9.6zM12.6 15.2l5-9 1.5.8-4.4 8.5z',
  heli: 'M2 3.5h20v1.7H2zM11.1 5h1.8v3.2h-1.8zM6 9h9c3 0 5.2 2 5.2 4.4S18 17.6 15 17.6H9l-3-3H2v-2h4zM15.8 17.4l2.2 3h-2.3l-1.9-3zM9 17.4l-1.6 3H5.2l1.7-3z',
  jet: 'M12 1l2 6.2 8 5V14l-8-2-.6 6 2.6 2v1.6L12 20.6l-4 1v-1.6l2.6-2-.6-6-8 2v-1.8l8-5z',
  mech: 'M8 2h8v6H8zM5 9h14v6h-3l1.2 7h-3l-1.3-6h-1.8l-1.3 6h-3L8 15H5zM1.5 9h2.4v5.5H1.5zM20.1 9h2.4v5.5h-2.4z',
  fort: 'M12 2l9 3.5v5.8c0 5.5-3.8 9.6-9 10.7-5.2-1.1-9-5.2-9-10.7V5.5z',
  mine: 'M10 2h4l1 6h-6zM8 9h8l2 13H6zM2 21h20v1.6H2z',
  coin: 'M12 2a10 10 0 110 20 10 10 0 010-20zm-1 4v1.6c-1.8.3-3 1.5-3 3 0 1.8 1.5 2.5 3.6 3 1.6.4 2 .8 2 1.4 0 .7-.8 1.2-1.8 1.2-1.1 0-2-.5-2.3-1.4L7.6 15.6c.5 1.4 1.8 2.4 3.4 2.7V20h2v-1.7c1.9-.3 3.2-1.6 3.2-3.2 0-1.9-1.4-2.6-3.6-3.1-1.6-.4-2-.7-2-1.3 0-.6.7-1.1 1.6-1.1.9 0 1.6.4 1.9 1.2l1.8-.8c-.5-1.2-1.5-2-2.9-2.3V6z',
  star: 'M12 1.8l3.1 6.5 7.1.9-5.2 4.9 1.3 7.1L12 17.8l-6.3 3.4L7 14.1 1.8 9.2l7.1-.9z',
  flask: 'M9 2h6v1.8h-1v5.4l5.6 9.6A2.2 2.2 0 0117.7 22H6.3a2.2 2.2 0 01-1.9-3.2L10 9.2V3.8H9zM8 15h8l-2.6-4.5h-2.8z',
  strike: 'M12 1l2 6.2 8 5V14l-8-2-.6 6 2.6 2v1.6L12 20.6l-4 1v-1.6l2.6-2-.6-6-8 2v-1.8l8-5z',
  shield: 'M12 2l9 3.5v5.8c0 5.5-3.8 9.6-9 10.7-5.2-1.1-9-5.2-9-10.7V5.5zm0 3.2L6 7.5v3.8c0 3.7 2.4 6.6 6 7.6 3.6-1 6-3.9 6-7.6V7.5z',
  reinf: 'M11 3h2v8h8v2h-8v8h-2v-8H3v-2h8z',
  emp: 'M13 1L4 14h7l-2 9 11-14h-7z',
  crown: 'M3 7l4.5 4L12 4l4.5 7L21 7l-2 12H5zM5 20.5h14V22H5z',
  sword: 'M19.5 2H22v2.5L11.7 14.8l1.4 1.4-1.4 1.4-1.6-1.6-3.6 3.6.9.9-1.4 1.4L3 18.9l1.4-1.4.9.9 3.6-3.6-1.6-1.6 1.4-1.4 1.4 1.4z',
  lock: 'M7 10V7a5 5 0 0110 0v3h1.5c.8 0 1.5.7 1.5 1.5v9c0 .8-.7 1.5-1.5 1.5h-13C4.7 22 4 21.3 4 20.5v-9c0-.8.7-1.5 1.5-1.5zm2 0h6V7a3 3 0 00-6 0z',
  globe: 'M12 2a10 10 0 110 20 10 10 0 010-20zm-1.5 2.2A8 8 0 004.1 11h3.4c.2-2.6.9-5 3-6.8zm3 0c2.1 1.8 2.8 4.2 3 6.8h3.4a8 8 0 00-6.4-6.8zM9.5 11h5c-.2-2.4-1-4.4-2.5-6-1.5 1.6-2.3 3.6-2.5 6zm-5.4 2a8 8 0 006.4 6.8c-2.1-1.8-2.8-4.2-3-6.8zm5.4 0c.2 2.4 1 4.4 2.5 6 1.5-1.6 2.3-3.6 2.5-6zm6.5 0c-.2 2.6-.9 5-3 6.8a8 8 0 006.4-6.8z',
  gear: 'M10.3 2h3.4l.5 2.6c.7.3 1.3.6 1.9 1.1l2.5-.9 1.7 2.9-2 1.7a7 7 0 010 2.2l2 1.7-1.7 2.9-2.5-.9c-.6.5-1.2.8-1.9 1.1l-.5 2.6h-3.4l-.5-2.6c-.7-.3-1.3-.6-1.9-1.1l-2.5.9-1.7-2.9 2-1.7a7 7 0 010-2.2l-2-1.7 1.7-2.9 2.5.9c.6-.5 1.2-.8 1.9-1.1zM12 8.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7z',
  target: 'M11 1h2v3.1A8 8 0 0119.9 11H23v2h-3.1A8 8 0 0113 19.9V23h-2v-3.1A8 8 0 014.1 13H1v-2h3.1A8 8 0 0111 4.1zm1 5a6 6 0 100 12 6 6 0 000-12zm0 4a2 2 0 110 4 2 2 0 010-4z',
  build: 'M4 21V10l8-6 8 6v11h-5v-6H9v6z',
  move: 'M12 2l4 4h-3v5h5V8l4 4-4 4v-3h-5v5h3l-4 4-4-4h3v-5H6v3l-4-4 4-4v3h5V6H8z',
  menu: 'M3 5h18v2.4H3zM3 10.8h18v2.4H3zM3 16.6h18V19H3z',
  close: 'M5.6 4.2L12 10.6l6.4-6.4 1.4 1.4-6.4 6.4 6.4 6.4-1.4 1.4-6.4-6.4-6.4 6.4-1.4-1.4 6.4-6.4-6.4-6.4z',
  list: 'M4 4h3v3H4zm5 .5h11v2H9zM4 10.5h3v3H4zm5 .5h11v2H9zM4 17h3v3H4zm5 .5h11v2H9z',
  play: 'M7 3l14 9-14 9z',
  rpg: 'M12 2.5c-2.2 0-4 1.5-4 3.5V7h8V6c0-2-1.8-3.5-4-3.5zM8.6 8.2c.3 1.8 1.7 3 3.4 3s3.1-1.2 3.4-3zM7 13c-1.6.6-2.8 2-2.8 3.8V22h15.6v-5.2c0-1.8-1.2-3.2-2.8-3.8L12 16.5zM13 9.5l9-4.5.8 1.6-9 4.5zM21.5 3.4l1.8 3.2-1.6.9-1.8-3.2z',
  sniper: 'M12 3a3.4 3.4 0 110 6.8A3.4 3.4 0 0112 3zM4 14l5-2h6l5 2v8H4zM1 10.5h22v1.4H1zM18 8.5h2v5h-2z',
  apc: 'M2 14.5l2.5-5h13l4.5 5v3.5H2zM6 11h3v2H6zm4.5 0h3v2h-3zM3 18.6a1.7 1.7 0 103.4 0 1.7 1.7 0 10-3.4 0zm5 0a1.7 1.7 0 103.4 0 1.7 1.7 0 10-3.4 0zm5 0a1.7 1.7 0 103.4 0 1.7 1.7 0 10-3.4 0zm5 0a1.7 1.7 0 103.4 0 1.7 1.7 0 10-3.4 0zM14 7h5v1.4h-5z',
  mlrs: 'M2 15h20v3.5H2zM3 19a1.6 1.6 0 103.2 0 1.6 1.6 0 10-3.2 0zm14.8 0a1.6 1.6 0 103.2 0 1.6 1.6 0 10-3.2 0zM6 13.5l11-7 1.4 2.2-11 7zM7.5 11.2l8-5 .9 1.4-8 5zM15 4.8l2.6-1.4.7 1.3-2.6 1.4z',
  drone: 'M10 10h4v4h-4zM3 4.5h6v1.6H3zm12 0h6v1.6h-6zM3 17.9h6v1.6H3zm12 0h6v1.6h-6zM5.3 6.1h1.4l4 4-1 1zm12 0h1.4l-4.4 5-1-1zM9.3 13l1 1-4 4H5.3zm5.4 0l4 5h-1.4l-3.6-4z',
  bomber: 'M12 2l1.6 6 9.4 4.5v1.8L13.6 12l-.5 6.5 3 2v1.5L12 21l-4.1 1v-1.5l3-2-.5-6.5L1 14.3v-1.8L10.4 8z',
  house: 'M3 11L12 3l9 8v10h-6v-6H9v6H3z',
  factory: 'M2 21V10l6 3.5V10l6 3.5V4h3v17zM18 4h3v17h-3z',
  office: 'M5 2h14v20h-5v-4h-4v4H5zM8 5v2h2V5zm6 0v2h2V5zM8 9v2h2V9zm6 0v2h2V9zM8 13v2h2v-2zm6 0v2h2v-2z',
  barracks: 'M2 20h20v2H2zM3 11h18v9H3zM12 2l10 7H2zM11 13h2v7h-2zM6 13h3v3H6zm9 0h3v3h-3z',
  warfactory: 'M2 21V11c0-4.4 4.5-8 10-8s10 3.6 10 8v10h-5v-6H7v6zM9 17h6v4H9z',
  airbase: 'M1 18h22v2H1zM11 3l1.4 4.8L19 11v1.5l-6.6-2-.4 4.5 2 1.5V18l-2.9-.8L8.2 18v-1.5l2-1.5-.4-4.5L3 12.5V11l6.6-3.2z'
};
G.svg = (name, cls = 'ico') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${G.ICONS[name]}"/></svg>`;
G.PATHS = {};
G.path = name => (G.PATHS[name] || (G.PATHS[name] = new Path2D(G.ICONS[name])));

/* ---------- units ---------- */
// cls: inf, armor, art, aa, air
G.UNITS = {
  inf:      { name: 'רגלים',       cls: 'inf',   atk: 2,  hp: 10, cost: 50,  desc: 'זולים וגמישים. עמוד השדרה של כל צבא.' },
  commando: { name: 'קומנדו',      cls: 'inf',   atk: 4.5,hp: 14, cost: 90,  desc: 'לוחמי עילית. +40% בהגנה על הרים וערים.' },
  tank:     { name: 'טנק',         cls: 'armor', atk: 6,  hp: 30, cost: 150, desc: 'שריון כבד. חזק מאוד מול רגלים.' },
  art:      { name: 'ארטילריה',    cls: 'art',   atk: 8,  hp: 12, cost: 140, desc: 'מנטרלת ביצורים. חלשה בהגנה.' },
  aa:       { name: 'נ״מ',          cls: 'aa',    atk: 3,  hp: 20, cost: 110, desc: 'הורסת כלי טיס. פי 3 נזק לאוויר.' },
  heli:     { name: 'מסוק קרב',    cls: 'air',   atk: 9,  hp: 24, cost: 220, desc: 'צד טנקים. מתעלם משטח.' },
  jet:      { name: 'מטוס חמקן',   cls: 'air',   atk: 14, hp: 28, cost: 320, desc: 'עליונות אווירית מוחלטת.' },
  mech:     { name: 'רובוט מכ״ם',  cls: 'armor', atk: 22, hp: 85, cost: 540, desc: 'מכונת מלחמה ענקית. הנשק האולטימטיבי.' },
  rpg:      { name: 'לוחם נ״ט',    cls: 'inf',   atk: 3,  hp: 11, cost: 80,  vs: { armor: 2.2 }, desc: 'חייל עם טיל כתף. משמיד טנקים ונגמ״שים.' },
  sniper:   { name: 'צלף',          cls: 'inf',   atk: 5,  hp: 8,  cost: 110, vs: { inf: 1.9 },  desc: 'פוגע ברגלים מטווח רחוק. חלש מול שריון.' },
  apc:      { name: 'נגמ״ש',        cls: 'armor', atk: 4,  hp: 36, cost: 170, desc: 'שריון קל וזול שסופג הרבה אש.' },
  mlrs:     { name: 'משגר רקטות',   cls: 'art',   atk: 12, hp: 16, cost: 270, vs: { inf: 1.6 }, desc: 'מטח רקטות שמוחק עמדות וביצורים.' },
  drone:    { name: 'רחפן תקיפה',   cls: 'air',   atk: 7,  hp: 12, cost: 170, desc: 'כלי טיס זול ללא טייס. מהיר וקטלני.' },
  bomber:   { name: 'מפציץ',        cls: 'air',   atk: 18, hp: 34, cost: 430, vs: { armor: 1.5, art: 1.6 }, desc: 'מטיל פצצות כבדות על כל מה שמתחת.' }
};
G.UNIT_ORDER = ['inf', 'rpg', 'sniper', 'commando', 'apc', 'tank', 'aa', 'art', 'mlrs', 'drone', 'heli', 'jet', 'bomber', 'mech'];
// which production building a unit needs
G.UNIT_BUILDING = { inf: 'barracks', rpg: 'barracks', sniper: 'barracks', commando: 'barracks', apc: 'warfactory', tank: 'warfactory', aa: 'warfactory', art: 'warfactory', mlrs: 'warfactory', mech: 'warfactory', drone: 'airbase', heli: 'airbase', jet: 'airbase', bomber: 'airbase' };
// damage multiplier: attacker class -> target class
G.COUNTER = {
  inf:   { inf: 1, armor: 0.6, art: 1.2, aa: 1, air: 0.35 },
  armor: { inf: 1.5, armor: 1, art: 1.3, aa: 1.2, air: 0.3 },
  art:   { inf: 1.3, armor: 1, art: 1, aa: 1, air: 0 },
  aa:    { inf: 0.6, armor: 0.4, art: 0.6, aa: 0.6, air: 3 },
  air:   { inf: 1, armor: 1.6, art: 1.4, aa: 0.7, air: 1 }
};

/* ---------- factions ---------- */
G.PLAYER_FACTION = { name: 'כוח הפניקס', color: '#22d8ff' };
G.AI_FACTIONS = [
  { name: 'קרטל הצפע', color: '#ff2d6f', pers: 'aggressive' },
  { name: 'השושלת הכתומה', color: '#ff9f1c', pers: 'balanced' },
  { name: 'מסדר הפלדה', color: '#a66bff', pers: 'turtle' },
  { name: 'לגיון הצל', color: '#3dff8f', pers: 'aggressive' },
  { name: 'תאגיד אומגה', color: '#ffe14d', pers: 'balanced' }
];
G.NEUTRAL_COLOR = '#a8a4b8';

/* ---------- worlds ---------- */
G.WORLDS = [
  {
    name: 'חוף הניאון', sub: 'שקיעה נצחית מעל מפרצי הדקלים',
    brief: 'הקרטלים השתלטו על החוף הזהוב. הנחת את הכוחות הראשונים שלך על החוף – הגיע הזמן לכבוש את המפרץ, מדינה אחר מדינה.',
    W: 36, H: 26, terr: 46, ai: 2, tier: ['inf', 'rpg', 'tank', 'apc'], aiStart: 1,
    countries: ['רפובליקת קורל', 'איי הסאנסט', 'מדינת מרינה', 'חוף הדקלים'],
    pre: ['פאלם', 'אושן', 'סאנסט', 'קורל', 'מרינה', 'לגונה', 'ריף', 'ויסטה', 'נובה', 'סול'],
    suf: ['ביץ׳', 'היל', 'פוינט', 'ביי', 'דרייב', 'פארק', 'הייטס', 'וויו', 'קוב', 'גארדנס'],
    sky: ['#1b0a3c', '#6b1a7a', '#e2447f', '#ff8a5c', '#ffd27a'],
    sea: ['#062a52', '#0b5a8a', '#2fe0d0'], night: 0.15,
    terrain: {
      plain:    { top: '#86d36c', side: '#3f7d3a' },
      forest:   { top: '#3fae63', side: '#235f3a' },
      beach:    { top: '#f6dca8', side: '#b9935a' },
      mountain: { top: '#a6a38e', side: '#5f5c50' },
      city:     { top: '#d4cfe3', side: '#7c7697' },
      resource: { top: '#c7b46a', side: '#7a6a33' }
    },
    feat: 'palm', accent: '#ff4fa3'
  },
  {
    name: 'מדבר הזהב', sub: 'חולות אינסופיים ושדות נפט בוערים',
    brief: 'מתחת לחולות מסתתר הנפט שמניע את המלחמה. ארבעה כוחות נלחמים על כל באר. השמש לא סולחת – גם אתה לא.',
    W: 40, H: 28, terr: 58, ai: 3, tier: ['inf', 'rpg', 'sniper', 'commando', 'apc', 'tank', 'art'], aiStart: 1.12,
    countries: ['ממלכת החולות', 'אמירות הנחושת', 'סולטנות התמר', 'נווה הסופה', 'ארץ הענבר'],
    pre: ['באר', 'תל', 'עין', 'נווה', 'רמת', 'מצד', 'קריית', 'גבעת', 'שער', 'נחל'],
    suf: ['זהב', 'חול', 'שמש', 'סופה', 'ענבר', 'נחושת', 'תמר', 'אש', 'רוח', 'מלח'],
    sky: ['#2a1206', '#7a3311', '#d9741f', '#f6b24d', '#ffe6ad'],
    sea: ['#0c3b4a', '#13697a', '#3fd3c0'], night: 0,
    terrain: {
      plain:    { top: '#eec074', side: '#a8702d' },
      forest:   { top: '#7cbf6a', side: '#3f7a35' },
      beach:    { top: '#f7dfa6', side: '#b8925a' },
      mountain: { top: '#b8693a', side: '#6e3a1d' },
      city:     { top: '#e6d2b0', side: '#94795a' },
      resource: { top: '#3b3029', side: '#1e1712' }
    },
    feat: 'dune', accent: '#ffb340'
  },
  {
    name: 'רכס הקרח', sub: 'סופות שלג, מבצרים ופסגות קפואות',
    brief: 'בצפון הקפוא, האוויר דליל והשריון קופא. האויב משתמש במסוקים – תצטרך הגנה נגד מטוסים כדי לשרוד.',
    W: 40, H: 28, terr: 60, ai: 3, tier: ['inf', 'rpg', 'sniper', 'commando', 'apc', 'tank', 'art', 'aa', 'drone', 'heli', 'mlrs'], aiStart: 1.25,
    countries: ['ממלכת הצפון', 'קונפדרציית השלג', 'נסיכות הכפור', 'שבטי הזאב', 'רפובליקת הבדולח'],
    pre: ['פסגת', 'עמק', 'מפרץ', 'צוק', 'שדה', 'מעבר', 'נמל', 'מבצר', 'אגם', 'רכס'],
    suf: ['הקרח', 'השלג', 'הכפור', 'הסערה', 'הזאב', 'הדוב', 'הצפון', 'הבדולח', 'הערפל', 'הלבן'],
    sky: ['#06142e', '#14365f', '#3f7fb5', '#9fd0ef', '#eaf6ff'],
    sea: ['#061d33', '#0d4569', '#62c4e8'], night: 0.1,
    terrain: {
      plain:    { top: '#eef4fb', side: '#93a9c2' },
      forest:   { top: '#4f8a76', side: '#264a41' },
      beach:    { top: '#cfdbe6', side: '#8296ab' },
      mountain: { top: '#c9dcee', side: '#6d849e' },
      city:     { top: '#d9dfea', side: '#7d879b' },
      resource: { top: '#8fd7f0', side: '#3d7f9a' }
    },
    feat: 'pine', accent: '#7fe3ff'
  },
  {
    name: 'ארץ הגעש', sub: 'נהרות לבה ושמיים בוערים',
    brief: 'הר הגעש התעורר, וחמישה צבאות נלחמים על האדמה החרוכה. מטוסי החמקן של האויב שולטים בשמיים – הגיע הזמן לשריון כבד.',
    W: 42, H: 30, terr: 68, ai: 4, tier: ['inf', 'rpg', 'sniper', 'commando', 'apc', 'tank', 'art', 'aa', 'drone', 'heli', 'mlrs', 'jet'], aiStart: 1.38,
    countries: ['אימפריית האפר', 'שושלת הלבה', 'מסדר הבזלת', 'ממלכת הגחלים', 'ברית הגופרית', 'מדינת הרעם'],
    pre: ['לוע', 'מכתש', 'שדה', 'הר', 'נהר', 'עמק', 'מצודת', 'גשר', 'שער', 'כור'],
    suf: ['האפר', 'הגעש', 'הלבה', 'האש', 'הבזלת', 'הגופרית', 'השחור', 'הדם', 'הרעם', 'הגחלים'],
    sky: ['#080104', '#2a0610', '#6e1014', '#c23a1a', '#ff7a2b'],
    sea: ['#12060c', '#2e0d18', '#ff5a1f'], night: 0.35, lavaSea: true,
    terrain: {
      plain:    { top: '#6a5a55', side: '#2f2422' },
      forest:   { top: '#4a5a3a', side: '#262e1d' },
      beach:    { top: '#3d3433', side: '#1c1615' },
      mountain: { top: '#4b3b3b', side: '#221818' },
      city:     { top: '#7a6f75', side: '#3a3237' },
      resource: { top: '#ff6a2a', side: '#7a2410' }
    },
    feat: 'lava', accent: '#ff5a1f'
  },
  {
    name: 'מטרופולין 2099', sub: 'עיר-על אינסופית של ניאון וכרום',
    brief: 'העתיד הגיע. תאגידי-על שולטים בעיר הענקית עם רובוטי מלחמה. זו המערכה האחרונה – מי שישלוט במטרופולין, ישלוט בכל העולמות.',
    W: 42, H: 30, terr: 74, ai: 4, tier: ['inf', 'rpg', 'sniper', 'commando', 'apc', 'tank', 'art', 'aa', 'drone', 'heli', 'mlrs', 'jet', 'bomber', 'mech'], aiStart: 1.5,
    countries: ['תאגיד נקסוס', 'סקטור אומגה', 'רובעי הניאון', 'מתחם קוונט', 'רשת הכרום', 'ברית זנית'],
    pre: ['רובע', 'מגדל', 'סקטור', 'מתחם', 'צומת', 'נמל', 'תחנת', 'שכונת', 'מרכז', 'גשר'],
    suf: ['ניאון', 'אומגה', 'קוונט', 'סייבר', 'כרום', 'פלזמה', 'אלפא', 'זנית', 'הולו', 'נקסוס'],
    sky: ['#03010b', '#130733', '#3a0f6b', '#a01a8c', '#ff2d95'],
    sea: ['#03041a', '#0a1250', '#3d6bff'], night: 0.5,
    terrain: {
      plain:    { top: '#4c5070', side: '#23253b' },
      forest:   { top: '#2f7a5a', side: '#173d2d' },
      beach:    { top: '#3d4160', side: '#1d1f33' },
      mountain: { top: '#6a6e94', side: '#2f3150' },
      city:     { top: '#5f6290', side: '#2a2c4a' },
      resource: { top: '#3a3f5c', side: '#1a1c2c' }
    },
    feat: 'neon', accent: '#ff2d95'
  }
];

/* ---------- territory types ---------- */
G.TTYPES = {
  plain:    { name: 'מישור',      inc: 15, def: 0 },
  forest:   { name: 'יער',        inc: 15, def: 0.15 },
  beach:    { name: 'חוף',        inc: 18, def: 0 },
  mountain: { name: 'הרים',       inc: 10, def: 0.3 },
  city:     { name: 'עיר',        inc: 35, def: 0.15 },
  resource: { name: 'משאבים',     inc: 30, def: 0 }
};

/* ---------- research tree (persistent) ---------- */
G.RESEARCH = [
  // units
  { id: 'u_commando', br: 0, name: 'קומנדו', desc: 'פותח את יחידת הקומנדו', cost: 3, req: [] },
  { id: 'u_aa',       br: 0, name: 'הגנה אווירית', desc: 'פותח סוללות נ״מ', cost: 4, req: [] },
  { id: 'u_art',      br: 0, name: 'ארטילריה', desc: 'פותח ארטילריה כבדה', cost: 4, req: ['u_commando'] },
  { id: 'u_heli',     br: 0, name: 'מסוקי קרב', desc: 'פותח מסוקי תקיפה', cost: 7, req: ['u_aa'] },
  { id: 'u_jet',      br: 0, name: 'מטוסי חמקן', desc: 'פותח מטוסי חמקן', cost: 10, req: ['u_heli'] },
  { id: 'u_rpg',      br: 0, name: 'לוחמי נ״ט', desc: 'פותח לוחמי נ״ט עם טילי כתף', cost: 2, req: [] },
  { id: 'u_apc',      br: 0, name: 'נגמ״שים', desc: 'פותח נגמ״שים משוריינים', cost: 3, req: [] },
  { id: 'u_sniper',   br: 0, name: 'צלפים', desc: 'פותח יחידות צלפים', cost: 4, req: ['u_commando'] },
  { id: 'u_drone',    br: 0, name: 'רחפני תקיפה', desc: 'פותח רחפנים מתאבדים ותוקפים', cost: 6, req: ['u_aa'] },
  { id: 'u_mlrs',     br: 0, name: 'משגרי רקטות', desc: 'פותח משגרי רקטות מרובי קנים', cost: 8, req: ['u_art'] },
  { id: 'u_bomber',   br: 0, name: 'מפציצים', desc: 'פותח מפציצים אסטרטגיים', cost: 12, req: ['u_jet'] },
  { id: 'u_mech',     br: 0, name: 'רובוט מכ״ם', desc: 'פותח את מכונת המלחמה האולטימטיבית', cost: 16, req: ['u_jet', 'u_art'] },
  // economy
  { id: 'eco1',  br: 1, name: 'מסחר שחור', desc: '+10% הכנסה', cost: 3, req: [] },
  { id: 'cash1', br: 1, name: 'קרן מלחמה', desc: '+150 קרדיטים בתחילת קרב', cost: 3, req: [] },
  { id: 'mine1', br: 1, name: 'כרייה עמוקה', desc: 'מכרות זולים ב-30% ומניבים +5', cost: 5, req: ['eco1'] },
  { id: 'eco2',  br: 1, name: 'ברוני הנפט', desc: '+20% הכנסה (סה״כ)', cost: 7, req: ['eco1'] },
  { id: 'cash2', br: 1, name: 'אוצר מלחמה', desc: '+300 קרדיטים בתחילת קרב (סה״כ)', cost: 7, req: ['cash1'] },
  { id: 'eco3',  br: 1, name: 'אימפריה כלכלית', desc: '+35% הכנסה (סה״כ)', cost: 13, req: ['eco2', 'mine1'] },
  // military
  { id: 'atk1', br: 2, name: 'תחמושת חודרת', desc: '+10% כוח התקפה', cost: 4, req: [] },
  { id: 'def1', br: 2, name: 'שריון קרמי', desc: '+10% חוסן ליחידות', cost: 4, req: [] },
  { id: 'fort1',br: 2, name: 'הנדסה קרבית', desc: 'ביצורים זולים ב-30% ורמה 4', cost: 5, req: ['def1'] },
  { id: 'atk2', br: 2, name: 'מערכות מכוונות', desc: '+20% כוח התקפה (סה״כ)', cost: 8, req: ['atk1'] },
  { id: 'def2', br: 2, name: 'שריון ננו', desc: '+20% חוסן (סה״כ)', cost: 8, req: ['def1'] },
  { id: 'vet',  br: 2, name: 'כוח עילית', desc: 'מתחיל כל קרב עם 2 טנקים ו-3 קומנדו נוספים', cost: 11, req: ['atk2', 'def2'] },
  // abilities
  { id: 'ab_strike',  br: 3, name: 'תקיפה אווירית', desc: 'הפצצת שטח אויב: משמיד 35% מהכוחות', cost: 5, req: [] },
  { id: 'ab_reinf',   br: 3, name: 'תגבורת', desc: 'הנחתת 4 רגלים וטנק בשטח שלך', cost: 5, req: [] },
  { id: 'ab_shield',  br: 3, name: 'כיפת מגן', desc: 'שטח חסין להתקפות לתור אחד', cost: 7, req: ['ab_reinf'] },
  { id: 'ab_strike2', br: 3, name: 'מפציצים כבדים', desc: 'תקיפה אווירית: 55% והורסת ביצור', cost: 9, req: ['ab_strike'] },
  { id: 'ab_emp',     br: 3, name: 'פצצת EMP', desc: 'משמיד 75% מהכוחות ומשתק שטח', cost: 16, req: ['ab_strike2', 'ab_shield'] }
];
G.BRANCHES = ['יחידות', 'כלכלה', 'צבא', 'יכולות מיוחדות'];

G.ABILITIES = {
  strike: { name: 'תקיפה אווירית', icon: 'strike', req: 'ab_strike', cd: 3, target: 'enemy' },
  reinf:  { name: 'תגבורת', icon: 'reinf', req: 'ab_reinf', cd: 3, target: 'own' },
  shield: { name: 'כיפת מגן', icon: 'shield', req: 'ab_shield', cd: 4, target: 'own' },
  emp:    { name: 'פצצת EMP', icon: 'emp', req: 'ab_emp', cd: 6, target: 'enemy' }
};

G.RANKS = ['טוראי', 'רב״ט', 'סמל', 'סגן', 'סרן', 'רב-סרן', 'סגן-אלוף', 'אלוף-משנה', 'תת-אלוף', 'אלוף', 'רב-אלוף', 'קיסר'];

G.ACHIEVEMENTS = [
  { id: 'first_blood', name: 'דם ראשון', desc: 'נצח בקרב הראשון' },
  { id: 'first_win', name: 'כובש', desc: 'נצח במשימה הראשונה' },
  { id: 'three_star', name: 'מושלם', desc: 'השג 3 כוכבים במשימה' },
  { id: 'world1', name: 'שליט החוף', desc: 'כבוש את כל חוף הניאון' },
  { id: 'world5', name: 'קיסר העולמות', desc: 'כבוש את מטרופולין 2099' },
  { id: 'mech', name: 'ענק הפלדה', desc: 'גייס רובוט מכ״ם' },
  { id: 'warlord', name: 'אדון המלחמה', desc: 'נצח 100 קרבות' },
  { id: 'scientist', name: 'מדען מטורף', desc: 'השלם 12 מחקרים' }
];

/* ---------- buildings (per territory) ---------- */
G.BUILDINGS = {
  house:      { name: 'שכונת מגורים',   icon: 'house',      max: 2, cost: [80, 150],   inc: 10, desc: '+10 הכנסה לכל רמה (מסים מתושבים)' },
  factory:    { name: 'מפעל תעשייה',    icon: 'factory',    max: 2, cost: [220, 380],  inc: 28, desc: '+28 הכנסה לכל רמה' },
  office:     { name: 'מגדל משרדים',    icon: 'office',     max: 1, cost: [200],       inc: 15, desc: '+15 הכנסה, ונקודת מחקר כל 4 תורות' },
  barracks:   { name: 'בסיס טירונים',    icon: 'barracks',   max: 1, cost: [140],       inc: 0,  desc: 'מאפשר גיוס חיילים: רגלים, נ״ט, צלפים, קומנדו' },
  warfactory: { name: 'מפעל רכב צבאי',  icon: 'warfactory', max: 1, cost: [320],       inc: 0,  desc: 'מאפשר ייצור טנקים, נגמ״שים, ארטילריה ורובוטים' },
  airbase:    { name: 'בסיס חיל אוויר', icon: 'airbase',    max: 1, cost: [460],       inc: 0,  desc: 'מאפשר מסוקים, רחפנים, מטוסים ומפציצים' }
};
G.BUILD_ORDER = ['barracks', 'warfactory', 'airbase', 'house', 'factory', 'office'];
G.buildSlots = T => 4 + (T.type === 'city' ? 2 : T.type === 'resource' ? 1 : 0);
