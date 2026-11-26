"""TheSportsDB helpers shared by build_data.py and build_basketball.py.

The free key rate-limits hard (and harder from shared CI addresses), so:
  * every run starts from the previous data and only adds to it (never loses games when the source fails);
  * only the rounds around the current one are fetched (the current round is read from the source);
  * a full season is fetched only when there is no previous data for it at all;
  * HTTP 429 waits and retries instead of being treated as "no games".
Rows are [date, time, home, away, home_score, away_score] in Israel local time."""
import json, os, sys, time, datetime, urllib.request, urllib.error
from zoneinfo import ZoneInfo

TSDB = "https://www.thesportsdb.com/api/v1/json/123"
IL = ZoneInfo("Asia/Jerusalem")
PAUSE = float(os.environ.get("TSDB_PAUSE", "2.2"))


def call(path, tries=4):
    """JSON from TheSportsDB, or None when the source keeps failing (as opposed to {} = no events)."""
    for i in range(tries):
        try:
            with urllib.request.urlopen(f"{TSDB}/{path}", timeout=30) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            wait = 40 + 30 * i if e.code == 429 else 5 + 5 * i
            print(f"  tsdb {e.code} on {path}; retry in {wait}s", file=sys.stderr)
            time.sleep(wait)
        except Exception as e:
            print(f"  tsdb error on {path}: {e}; retry", file=sys.stderr)
            time.sleep(5 + 5 * i)
    return None


def to_row(e):
    if not e.get("dateEvent") or not e.get("strHomeTeam") or not e.get("strAwayTeam"):
        return None
    hs, as_ = e.get("intHomeScore"), e.get("intAwayScore")
    status = (e.get("strStatus") or "").lower()
    done = hs not in (None, "") and as_ not in (None, "") and not any(w in status for w in ("postponed", "cancel", "not started"))
    t = (e.get("strTime") or "")[:5]
    try:  # TheSportsDB times are UTC
        dt = datetime.datetime.fromisoformat(f"{e['dateEvent']}T{t or '12:00'}:00+00:00").astimezone(IL)
        d, tl = dt.strftime("%Y-%m-%d"), (dt.strftime("%H:%M") if t else "")
    except Exception:
        d, tl = e["dateEvent"], t
    return [d, tl, e["strHomeTeam"], e["strAwayTeam"], int(hs) if done else None, int(as_) if done else None]


def current_rounds(lid, season):
    """Rounds around the current one, read from the league's next/past events; None if unknown."""
    rs = []
    for ep in ("eventsnextleague", "eventspastleague"):
        d = call(f"{ep}.php?id={lid}")
        time.sleep(PAUSE)
        for e in (d or {}).get("events") or []:
            r = str(e.get("intRound") or "")
            if r.isdigit() and (not e.get("strSeason") or e.get("strSeason") == season):
                rs.append(int(r))
    if not rs:
        return None
    return list(range(max(1, min(rs) - 3), max(rs) + 3))


def fetch_rounds(lid, season, rounds, stop_after_empty=None):
    """Rows for the given rounds. ok=False when some round could not be read (rate limit)."""
    rows, ok, empty = [], True, 0
    for r in rounds:
        d = call(f"eventsround.php?id={lid}&r={r}&s={season}")
        time.sleep(PAUSE)
        if d is None:
            ok = False
            continue
        evs = d.get("events") or []
        if not evs:
            empty += 1
            if stop_after_empty and empty >= stop_after_empty:
                break
            continue
        empty = 0
        rows += [x for x in (to_row(e) for e in evs) if x]
    return rows, ok


def merge(prev, new):
    """Union of rows; a new row replaces an older one for the same pairing within 14 days (result added or rescheduled)."""
    def dd(a, b):
        return abs((datetime.date.fromisoformat(a) - datetime.date.fromisoformat(b)).days)
    out = []
    for p in prev:
        if any(n[2] == p[2] and n[3] == p[3] and dd(n[0], p[0]) <= 14 and (p[4] is None or n[0] == p[0]) for n in new):
            continue
        out.append(p)
    seen = set()
    for n in new:
        k = (n[0], n[2], n[3])
        if k in seen:
            continue
        seen.add(k)
        out.append(n)
    out.sort(key=lambda r: (r[0], r[1]))
    return out


def season_rows(lid, season, prev_rows, is_current, label):
    """Rows for one season: previous data plus fresh rounds (current season) or a full fetch when nothing is stored."""
    if prev_rows and not is_current:
        return prev_rows
    if not prev_rows:
        rows, ok = fetch_rounds(lid, season, range(1, 60), stop_after_empty=3)
        print(f"  {label} {season}: full fetch {len(rows)} rows{'' if ok else ' (some rounds failed)'}", file=sys.stderr)
        return rows
    rounds = current_rounds(lid, season)
    if not rounds:
        print(f"  {label} {season}: current round unknown (source unavailable); keeping {len(prev_rows)} stored rows", file=sys.stderr)
        return prev_rows
    rows, ok = fetch_rounds(lid, season, rounds)
    merged = merge(prev_rows, rows)
    print(f"  {label} {season}: rounds {rounds[0]}-{rounds[-1]}, {len(rows)} fresh rows, {len(merged)} total{'' if ok else ' (some rounds failed, stored rows kept)'}", file=sys.stderr)
    return merged


def seasons():
    today = datetime.date.today()
    cy = today.year if today.month >= 7 else today.year - 1
    return cy, [(f"{cy-1}-{cy}", f"{cy-1}-07-01", f"{cy}-07-01", False), (f"{cy}-{cy+1}", f"{cy}-07-01", f"{cy+1}-07-01", True)]


def prev_paths(name):
    """Earlier copies of a data file: PREV_DIRS (colon separated) then the file in toto/data itself."""
    here = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", name)
    dirs = [d for d in os.environ.get("PREV_DIRS", "").split(":") if d]
    return [here] + [os.path.join(d, name) for d in dirs]  # later entries are newer and win
