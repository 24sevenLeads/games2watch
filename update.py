#!/usr/bin/env python3
"""
update.py — dagelijkse update voor games2watch.eu/nl
"""

import json, re, sys, datetime
from pathlib import Path
from urllib.request import urlopen, Request

ROOT            = Path(__file__).parent
CONFIG_TAGS     = json.loads((ROOT / 'config/league-tags.json').read_text())
CONFIG_CHANNELS = json.loads((ROOT / 'config/channels.json').read_text())
TEMPLATE        = (ROOT / 'nl/index.html').read_text()
DRY_RUN         = '--dry-run' in sys.argv

COMP_MAP = {
    'Champions League':             ('cl',           '🏆', 'Champions League'),
    'Europa League':                ('el',           '🏆', 'Europa League'),
    'UEFA Conference League':       ('conf',         '🏆', 'Conference League'),
    'Premier League':               ('pl',           'ENG','Premier League'),
    'Football League Championship': ('champ',        'ENG','Championship'),
    'FA Cup':                       ('facup',        'ENG','FA Cup'),
    'Eredivisie':                   ('ed',           '🇳🇱', 'Eredivisie'),
    'Keuken Kampioen Divisie':      ('kkd',          '🇳🇱', 'Keuken Kampioen Divisie'),
    'KNVB Beker':                   ('knvb',         '🇳🇱', 'KNVB Beker'),
    'Bundesliga':                   ('bl',           '🇩🇪', 'Bundesliga'),
    '2. Bundesliga':                ('bl2',          '🇩🇪', '2. Bundesliga'),
    'DFB-Pokal':                    ('dfbpokal',     '🇩🇪', 'DFB-Pokal'),
    'La Liga':                      ('ll',           '🇪🇸', 'La Liga'),
    'Copa del Rey':                 ('copadelrey',   '🇪🇸', 'Copa del Rey'),
    'Serie A':                      ('sa',           '🇮🇹', 'Serie A'),
    'Coppa Italia':                 ('coppaitalia',  '🇮🇹', 'Coppa Italia'),
    'Ligue 1':                      ('l1',           '🇫🇷', 'Ligue 1'),
    'Coupe de France':              ('coupedefrance','🇫🇷', 'Coupe de France'),
    'Primeira Liga':                ('primeiraliga', '🇵🇹', 'Primeira Liga'),
    'Taça de Portugal':             ('tacaportugal', '🇵🇹', 'Taça de Portugal'),
}

SKIP_WORDS = ['youth','u19','u21','vrouwen','dames','women',
              'wk kwalificatie','league two','football league two']

JONG_TEAMS = {'Jong Ajax','Jong PSV','Jong AZ','Jong FC Utrecht','Jong Utrecht'}

STANDINGS_URLS = {
    'pl':           'https://en.wikipedia.org/wiki/2025%E2%80%9326_Premier_League',
    'champ':        'https://en.wikipedia.org/wiki/2025%E2%80%9326_EFL_Championship',
    'ed':           'https://en.wikipedia.org/wiki/2025%E2%80%9326_Eredivisie',
    'kkd':          'https://en.wikipedia.org/wiki/2025%E2%80%9326_Eerste_Divisie',
    'bl':           'https://en.wikipedia.org/wiki/2025%E2%80%9326_Bundesliga',
    'bl2':          'https://en.wikipedia.org/wiki/2025%E2%80%9326_2._Bundesliga',
    'sa':           'https://en.wikipedia.org/wiki/2025%E2%80%9326_Serie_A',
    'll':           'https://en.wikipedia.org/wiki/2025%E2%80%9326_La_Liga',
    'l1':           'https://en.wikipedia.org/wiki/2025%E2%80%9326_Ligue_1',
    'primeiraliga': 'https://en.wikipedia.org/wiki/2025%E2%80%9326_Liga_Portugal_Betclic',
}


def fetch(url):
    req = Request(url, headers={
        'User-Agent': 'Mozilla/5.0 (compatible; games2watch/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
    })
    with urlopen(req, timeout=20) as r:
        return r.read().decode('utf-8', errors='replace')


def day_label(d):
    days   = ['Zo','Ma','Di','Wo','Do','Vr','Za']
    months = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec']
    return f"{days[d.isoweekday() % 7]} {d.day} {months[d.month-1]}"


def channel_info(raw):
    if not raw:
        return {'cls': 'other', 'free': False, 'label': '?'}
    ch = CONFIG_CHANNELS['channels']
    if raw in ch: return ch[raw]
    for key, val in ch.items():
        if key.lower() == raw.lower(): return val
    matches = [(k, v) for k, v in ch.items() if k.lower() in raw.lower()]
    if matches:
        return max(matches, key=lambda x: len(x[0]))[1]
    return {'cls': 'other', 'free': False, 'label': raw}


# ── Stap 1: Speelschema ─────────────────────────────────────────────────────
def fetch_schedule():
    print("Stap 1: Speelschema ophalen...")
    html = fetch('https://www.iservoetbalvanavond.nl')

    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.S)
    if not m:
        print("  FOUT: __NEXT_DATA__ niet gevonden")
        return []

    data = json.loads(m.group(1))
    page_props = data.get('props', {}).get('pageProps', {})

    # broadcastsResponse bevat de wedstrijden
    broadcasts = page_props.get('broadcastsResponse', [])
    print(f"  broadcastsResponse type: {type(broadcasts).__name__}, len: {len(broadcasts) if isinstance(broadcasts, list) else 'n/a'}")

    # Dump eerste item voor debugging
    if isinstance(broadcasts, list) and broadcasts:
        print(f"  DUMP item[0]: {json.dumps(broadcasts[0])[:800]}")
    elif isinstance(broadcasts, dict):
        print(f"  DUMP dict keys: {list(broadcasts.keys())[:10]}")
        first_val = next(iter(broadcasts.values()), None)
        if first_val:
            print(f"  DUMP first_val[0]: {json.dumps(first_val[0] if isinstance(first_val, list) else first_val)[:800]}")

    return []


# ── Stap 2: Standen ─────────────────────────────────────────────────────────
def fetch_standings():
    print("Stap 2: Standen ophalen...")
    standings = {}

    for league_key, url in STANDINGS_URLS.items():
        try:
            html = fetch(url)
            teams = {}
            rows = re.findall(
                r'scope="row"[^>]*>\s*(\d+)\s*</th>(.*?)</tr>',
                html, re.S
            )
            for pos_str, row_html in rows:
                pos = int(pos_str)
                if pos > 24: break
                # Zoek alle title attributen, neem de eerste die geen disambiguatie heeft
                titles = re.findall(r'title="([^"]+)"', row_html)
                for t in titles:
                    t = t.strip()
                    if t and '(' not in t and len(t) > 2 and t not in teams:
                        teams[t] = pos
                        break

            if teams:
                top = min(teams, key=teams.get)
                standings[league_key] = teams
                print(f"  → {league_key}: {len(teams)} teams (#1: {top})")
            else:
                print(f"  → {league_key}: geen teams gevonden")
        except Exception as e:
            print(f"  → {league_key}: fout ({e})")

    return standings


# ── Stap 3-4 ongewijzigd ────────────────────────────────────────────────────
def apply_tags(matches, standings):
    print("Stap 3: Tags toepassen...")
    for m in matches:
        key         = m['leagueKey']
        league_tags = CONFIG_TAGS.get(key, {})
        league_st   = standings.get(key, {})
        for side in ('H', 'A'):
            team = m['home'] if side == 'H' else m['away']
            if key == 'kkd' and team in JONG_TEAMS:
                m[f'stake{side}'] = 'mid'
                m[f'r{side}']     = None
                continue
            pos = league_st.get(team)
            m[f'r{side}']     = pos
            m[f'stake{side}'] = league_tags.get(str(pos), 'mid') if pos else 'mid'
    tagged = sum(1 for m in matches if m['stakeH'] != 'mid' or m['stakeA'] != 'mid')
    ranked = sum(1 for m in matches if m.get('rH') or m.get('rA'))
    print(f"  → {tagged}/{len(matches)} met tags, {ranked}/{len(matches)} met positie")
    return matches


def write_html(matches):
    now_dt    = datetime.datetime.now()
    nl_days   = ['ma','di','wo','do','vr','za','zo']
    nl_months = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec']
    now_str   = (f"{nl_days[now_dt.weekday()]} {now_dt.day} "
                 f"{nl_months[now_dt.month-1]} {now_dt.strftime('%H:%M')}")

    html = re.sub(
        r'let MATCHES = \[.*?\];',
        'let MATCHES = ' + json.dumps(matches, ensure_ascii=False) + ';',
        TEMPLATE, flags=re.S
    )
    html = re.sub(
        r"textContent='Speelschema bijgewerkt: [^']+'",
        f"textContent='Speelschema bijgewerkt: {now_str}'",
        html
    )

    out = ROOT / 'nl/index.html'
    if not DRY_RUN:
        out.write_text(html)
    print(f"Stap 4: nl/index.html geschreven ({now_str})")
    return html


if __name__ == '__main__':
    print(f"=== games2watch update {datetime.datetime.now():%Y-%m-%d %H:%M} ===")
    if DRY_RUN: print("[DRY RUN]")

    matches   = fetch_schedule()
    standings = fetch_standings()
    matches   = apply_tags(matches, standings)
    write_html(matches)

    if not DRY_RUN:
        (ROOT / 'data/schedule.json').write_text(
            json.dumps(matches, ensure_ascii=False, indent=2))
        (ROOT / 'data/standings.json').write_text(
            json.dumps(standings, ensure_ascii=False, indent=2))
        print("Cache: data/ opgeslagen")

    print("=== Klaar ===")
