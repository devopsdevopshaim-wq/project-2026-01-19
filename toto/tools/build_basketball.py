#!/usr/bin/env python3
"""Build toto/data/basketball.json: Israeli Basketball Premier League + EuroLeague (TheSportsDB, round by round)
and NBA (ESPN, month by month). Format: {"built", "leagues": {code: {"name", "teams": [names], "m": [[date, time, h, a, hs, as], ...]}}}
Scores are final scores (overtime included when the source includes it); null for games not played yet."""
import json, sys, os, time, datetime, urllib.request
from zoneinfo import ZoneInfo

IL = ZoneInfo("Asia/Jerusalem")
TSDB = "https://www.thesportsdb.com/api/v1/json/123"
ESPN = "https://site.api.espn.com/apis/site/v2/sports/basketball"
today = datetime.date.today()
cy = today.year if today.month >= 7 else today.year - 1
SEASONS = [f"{cy-1}-{cy}", f"{cy}-{cy+1}"]

def get(url, tries=3):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"Accept-Encoding": "identity"})
            with urllib.request.urlopen(req, timeout=40) as r:
                return json.load(r)
        except Exception:
            time.sleep(3 + 5 * i)
    return {}

def local(date, t):
    try:
        dt = datetime.datetime.fromisoformat(f"{date}T{(t or '12:00')[:5]}:00+00:00").astimezone(IL)
        return dt.strftime("%Y-%m-%d"), (dt.strftime("%H:%M") if t else "")
    except Exception:
        return date, (t or "")[:5]

out = {"built": today.isoformat(), "leagues": {}}

def add(code, name, rows):
    teams, idx, m, seen = [], {}, [], set()
    def ti(n):
        if n not in idx: idx[n] = len(teams); teams.append(n)
        return idx[n]
    for d, t, h, a, hs, as_ in sorted(rows, key=lambda r: (r[0], r[1])):
        k = (d, h, a)
        if k in seen: continue
        seen.add(k)
        m.append([d, t, ti(h), ti(a), hs, as_])
    out["leagues"][code] = {"name": name, "teams": teams, "m": m}
    done = [r for r in m if r[4] is not None]
    print(f"{code}: {len(m)} games, {len(done)} played, last {done[-1][0] if done else '-'}, {len(teams)} teams", file=sys.stderr)

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tsdb as T
_cy, SEAS = T.seasons()

def prev_bsk(code):
    rows = []
    for pth in T.prev_paths("basketball.json"):
        try:
            with open(pth) as f:
                L = json.load(f).get("leagues", {}).get(code)
        except Exception:
            continue
        if not L:
            continue
        tm = L["teams"]
        rows = T.merge(rows, [[r[0], r[1], tm[r[2]], tm[r[3]], r[4], r[5]] for r in L["m"]])
    return rows

for code, lid, name in [("bsk.isr", "4474", "ליגת העל בכדורסל"), ("bsk.euro", "4546", "יורוליג")]:
    prev = prev_bsk(code)
    rows = []
    for season, s0, s1, cur in SEAS:
        rows += T.season_rows(lid, season, [r for r in prev if s0 <= r[0] < s1], cur, code)
    add(code, name, rows)

# NBA: month by month (a year query is capped at 1000 games)
rows = []
start = datetime.date(cy - 1, 10, 1)
mth = start
end = today + datetime.timedelta(days=40)
while mth <= end:
    ym = mth.strftime("%Y%m")
    d = get(f"{ESPN}/nba/scoreboard?dates={ym}&limit=500")
    for ev in d.get("events", []):
        c = (ev.get("competitions") or [{}])[0]
        comp = c.get("competitors") or []
        if len(comp) != 2: continue
        H = next((x for x in comp if x.get("homeAway") == "home"), comp[0])
        A = next((x for x in comp if x.get("homeAway") == "away"), comp[1])
        st = (c.get("status") or {}).get("type") or {}
        done = bool(st.get("completed"))
        dt = datetime.datetime.fromisoformat(ev["date"].replace("Z", "+00:00")).astimezone(IL)
        sc = lambda x: int(float(x.get("score"))) if done and x.get("score") not in (None, "") else None
        rows.append([dt.strftime("%Y-%m-%d"), dt.strftime("%H:%M"), H["team"]["displayName"], A["team"]["displayName"], sc(H), sc(A)])
    mth = (mth.replace(day=28) + datetime.timedelta(days=5)).replace(day=1)
add("bsk.nba", "NBA", rows)

dst = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "basketball.json")
with open(dst, "w") as f:
    json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
print("wrote", os.path.getsize(dst), "bytes", file=sys.stderr)
