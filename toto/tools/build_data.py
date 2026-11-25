#!/usr/bin/env python3
"""Build toto/data/history.json from openfootball/football.json (public domain).

Output format (compact):
{
  "built": "YYYY-MM-DD",
  "leagues": { code: {"name": str, "teams": [names], "m": [[date, h, a, hg, ag, time], ...]} }
}
hg/ag are null for fixtures not yet played. h/a index into teams.
"""
import json, sys, urllib.request, datetime, os, re, unicodedata

BASE = "https://raw.githubusercontent.com/openfootball/football.json/master"
LEAGUES = {
    "en.1": "פרמייר ליג (אנגליה)",
    "en.2": "צ'מפיונשיפ (אנגליה)",
    "es.1": "לה ליגה (ספרד)",
    "it.1": "סרייה A (איטליה)",
    "de.1": "בונדסליגה (גרמניה)",
    "fr.1": "ליג 1 (צרפת)",
    "nl.1": "ארדיביזי (הולנד)",
    "pt.1": "ליגה פורטוגל",
    "tr.1": "סופר ליג (טורקיה)",
    "be.1": "ליגה בלגית",
}
STOP = set("fc afc cf sc ac ssc sv vfl vfb tsg fsv rc ud cd sd rcd ca as ogc losc stade club de and sk fk bv sl sad calcio 1 04 05 1846 1899 1900 1907 1909 1910 1913 1919 hsc us ss acf bsc rb real".split())
ALIAS = {
 "betis balompie":"betis","celta vigo":"celta","deportivo alaves":"alaves","rayo vallecano madrid":"rayo vallecano","sociedad futbol":"sociedad",
 "atalanta bc":"atalanta","internazionale milano":"inter","lazio roma":"lazio","uc sampdoria":"sampdoria","delfino pescara":"pescara","genoa cfc":"genoa",
 "bor monchengladbach":"borussia monchengladbach","spvgg greuther furth 1903":"spvgg greuther furth","bochum 1848":"bochum","paderborn 07":"paderborn",
 "es troyes":"troyes","estac troyes":"troyes","racing lens":"lens","rennais 1901":"rennais","strasbourg alsace":"strasbourg",
 "az alkmaar":"az","cambuur leeuwarden":"cambuur","feyenoord rotterdam":"feyenoord","nec nijmegen":"nec","psv eindhoven":"psv","sbv vitesse":"vitesse","twente 65":"twente","willem ii tilburg":"willem ii",
 "sport lisboa e benfica":"benfica","sporting clube braga":"sporting braga","sporting clube portugal":"sporting cp","gd estoril praia":"gd estoril",
 "atiker konyaspor":"konyaspor","gazisehir gaziantep":"gaziantep",
}
def key(n):
    n = unicodedata.normalize("NFKD", n).encode("ascii", "ignore").decode().lower()
    n = re.sub(r"[.'&\-/()]", " ", n)
    k = " ".join(t for t in n.split() if t not in STOP)
    return ALIAS.get(k, k)

STOP = set("fc afc cf sc ac ssc sv vfl vfb tsg fsv rc ud cd sd rcd ca as ogc losc stade club de and sk fk bv sl sad calcio 1 04 05 1846 1899 1900 1907 1909 1910 1913 1919 hsc us ss acf bsc rb real".split())
ALIAS = {
 "betis balompie":"betis","celta vigo":"celta","deportivo alaves":"alaves","rayo vallecano madrid":"rayo vallecano","sociedad futbol":"sociedad",
 "atalanta bc":"atalanta","internazionale milano":"inter","lazio roma":"lazio","uc sampdoria":"sampdoria","delfino pescara":"pescara","genoa cfc":"genoa",
 "bor monchengladbach":"borussia monchengladbach","spvgg greuther furth 1903":"spvgg greuther furth","bochum 1848":"bochum","paderborn 07":"paderborn",
 "es troyes":"troyes","estac troyes":"troyes","racing lens":"lens","rennais 1901":"rennais","strasbourg alsace":"strasbourg",
 "az alkmaar":"az","cambuur leeuwarden":"cambuur","feyenoord rotterdam":"feyenoord","nec nijmegen":"nec","psv eindhoven":"psv","sbv vitesse":"vitesse","twente 65":"twente","willem ii tilburg":"willem ii",
 "sport lisboa e benfica":"benfica","sporting clube braga":"sporting braga","sporting clube portugal":"sporting cp","gd estoril praia":"gd estoril",
 "atiker konyaspor":"konyaspor","gazisehir gaziantep":"gaziantep",
}
def key(n):
    n = unicodedata.normalize("NFKD", n).encode("ascii", "ignore").decode().lower()
    n = re.sub(r"[.'&\-/()]", " ", n)
    k = " ".join(t for t in n.split() if t not in STOP)
    return ALIAS.get(k, k)

first, last = 2010, datetime.date.today().year + (1 if datetime.date.today().month >= 7 else 0)
seasons = [f"{y}-{str(y+1)[2:]}" for y in range(first, last)]

def get(url):
    try:
        with urllib.request.urlopen(url, timeout=30) as r:
            return json.load(r)
    except Exception:
        return None

out = {"built": datetime.date.today().isoformat(), "source": "openfootball/football.json + ESPN", "leagues": {}}
for code, name in LEAGUES.items():
    teams, idx, rows, seen = [], {}, [], set()
    def t(n):
        k = key(n)
        if k not in idx:
            idx[k] = len(teams); teams.append([n, k])
        else:
            teams[idx[k]][0] = n  # keep the most recent spelling
        return idx[k]
    got = 0
    for s in seasons:
        d = get(f"{BASE}/{s}/{code}.json")
        if not d: continue
        got += 1
        for m in d.get("matches", []):
            if not m.get("date") or not m.get("team1") or not m.get("team2"): continue
            sc = m.get("score")
            if isinstance(sc, dict): ft = sc.get("ft")
            elif isinstance(sc, list): ft = sc
            elif "score1" in m and m.get("score1") is not None: ft = [m.get("score1"), m.get("score2")]
            else: ft = None
            mk = (m["date"], key(m["team1"]), key(m["team2"]))
            if mk in seen: continue
            seen.add(mk)
            hg, ag = (ft[0], ft[1]) if ft and len(ft) == 2 else (None, None)
            rows.append([m["date"], t(m["team1"]), t(m["team2"]), hg, ag, (m.get("time") or "")[:5]])
    rows.sort(key=lambda r: r[0])
    out["leagues"][code] = {"name": name, "teams": teams, "m": rows}
    print(f"{code}: {got} seasons, {len(rows)} matches, {len(teams)} teams", file=sys.stderr)

# ---- ESPN (current results + leagues openfootball lacks) ----
from zoneinfo import ZoneInfo
ESPN = "https://site.api.espn.com/apis/site/v2/sports/soccer"
ESPN_SLUG = {"en.1": "eng.1", "en.2": "eng.2", "es.1": "esp.1", "it.1": "ita.1", "de.1": "ger.1", "fr.1": "fra.1",
             "nl.1": "ned.1", "pt.1": "por.1", "tr.1": "tur.1", "be.1": "bel.1",
             "isr.1": "isr.1", "sco.1": "sco.1", "ucl": "uefa.champions", "uel": "uefa.europa", "uecl": "uefa.europa.conf"}
ESPN_ONLY = {"isr.1": "ליגת העל (ישראל)", "sco.1": "פרמיירשיפ (סקוטלנד)", "ucl": "ליגת האלופות", "uel": "הליגה האירופית", "uecl": "הקונפרנס ליג"}
IL = ZoneInfo("Asia/Jerusalem")
this_year = datetime.date.today().year

def espn_year(slug, year):
    req = urllib.request.Request(f"{ESPN}/{slug}/scoreboard?dates={year}&limit=1000", headers={"Accept-Encoding": "identity"})
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            d = json.load(r)
    except Exception as e:
        print("  espn fail", slug, year, e, file=sys.stderr); return []
    rows = []
    for ev in d.get("events", []):
        c = (ev.get("competitions") or [{}])[0]
        comp = c.get("competitors") or []
        if len(comp) != 2: continue
        home = next((x for x in comp if x.get("homeAway") == "home"), comp[0])
        away = next((x for x in comp if x.get("homeAway") == "away"), comp[1])
        st = ((c.get("status") or {}).get("type") or {})
        done = bool(st.get("completed")) and not any(w in (st.get("name") or "") for w in ("POSTPONED", "CANCEL", "ABANDON"))
        dt = datetime.datetime.fromisoformat(ev["date"].replace("Z", "+00:00")).astimezone(IL)
        def sc(v):
            try: return int(float(v if not isinstance(v, dict) else v.get("value")))
            except Exception: return None
        rows.append([dt.strftime("%Y-%m-%d"), dt.strftime("%H:%M"), home["team"].get("displayName"), away["team"].get("displayName"),
                     sc(home.get("score")) if done else None, sc(away.get("score")) if done else None])
    return rows

for code, slug in ESPN_SLUG.items():
    years = range(2019, this_year + 1) if code in ESPN_ONLY else range(this_year - 1, this_year + 1)
    seen, rows = set(), []
    for y in years:
        for r in espn_year(slug, y):
            k = (r[0], r[2], r[3])
            if k not in seen: seen.add(k); rows.append(r)
    rows.sort(key=lambda r: (r[0], r[1]))
    if code not in out["leagues"]:
        out["leagues"][code] = {"name": ESPN_ONLY[code], "teams": [], "m": []}
    out["leagues"][code]["espn"] = rows
    done = [r for r in rows if r[4] is not None]
    print(f"espn {code}: {len(rows)} events, last result {done[-1][0] if done else '-'}", file=sys.stderr)

dst = os.path.join(os.path.dirname(__file__), "..", "data", "history.json")
with open(dst, "w") as f:
    json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
print("wrote", os.path.getsize(dst), "bytes", file=sys.stderr)
