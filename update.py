#!/usr/bin/env python3
"""
update.py — dagelijkse update voor games2watch.eu/nl
"""

import json, re, sys, datetime, os
from pathlib import Path
from urllib.request import urlopen, Request

ROOT            = Path(__file__).parent
CONFIG_TAGS     = json.loads((ROOT / 'config/league-tags.json').read_text())
CONFIG_CHANNELS = json.loads((ROOT / 'config/channels.json').read_text())
TEMPLATE        = (ROOT / 'nl/index.html').read_text()
DRY_RUN         = '--dry-run' in sys.argv

# ── Competitie mapping ───────────────────────────────────────────────────────
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

# ── Teamnaam aliases: football-data.org / Wikipedia → iservoetbalvanavond ───
TEAM_ALIASES = {
    # Premier League
    'Arsenal FC':'Arsenal', 'Manchester City FC':'Manchester City',
    'Manchester United FC':'Manchester United', 'Aston Villa FC':'Aston Villa',
    'Liverpool FC':'Liverpool', 'Chelsea FC':'Chelsea',
    'Brentford FC':'Brentford', 'Everton FC':'Everton', 'Fulham FC':'Fulham',
    'Brighton & Hove Albion FC':'Brighton & Hove Albion',
    'Newcastle United FC':'Newcastle United', 'AFC Bournemouth':'Bournemouth',
    'Sunderland AFC':'Sunderland', 'Nottingham Forest FC':'Nottingham Forest',
    'West Ham United FC':'West Ham United', 'Leeds United FC':'Leeds United',
    'Crystal Palace FC':'Crystal Palace', 'Tottenham Hotspur FC':'Tottenham Hotspur',
    'Burnley FC':'Burnley', 'Wolverhampton Wanderers FC':'Wolverhampton Wanderers',
    # Championship
    'Coventry City FC':'Coventry City', 'Ipswich Town FC':'Ipswich Town',
    'Middlesbrough FC':'Middlesbrough', 'Millwall FC':'Millwall',
    'Southampton FC':'Southampton', 'Wrexham AFC':'Wrexham',
    'Derby County FC':'Derby County', 'Hull City AFC':'Hull City',
    'Norwich City FC':'Norwich City', 'Bristol City FC':'Bristol City',
    'Queens Park Rangers FC':'Queens Park Rangers', 'Watford FC':'Watford',
    'West Bromwich Albion FC':'West Bromwich Albion',
    'Charlton Athletic FC':'Charlton Athletic', 'Stoke City FC':'Stoke City',
    'Swansea City AFC':'Swansea City', 'Preston North End FC':'Preston North End',
    'Birmingham City FC':'Birmingham City', 'Leicester City FC':'Leicester City',
    'Blackburn Rovers FC':'Blackburn Rovers', 'Portsmouth FC':'Portsmouth',
    'Oxford United FC':'Oxford United', 'Sheffield United FC':'Sheffield United',
    'Sheffield Wednesday FC':'Sheffield Wednesday',
    # Eredivisie
    'PSV Eindhoven':'PSV', 'AFC Ajax':'Ajax', 'Feyenoord Rotterdam':'Feyenoord',
    'AZ Alkmaar':'AZ',
    # Bundesliga
    'FC Bayern München':'Bayern München', 'Bayer Leverkusen':'Bayer 04 Leverkusen',
    'Bayer 04 Leverkusen':'Bayer 04 Leverkusen',
    'TSG Hoffenheim':'TSG 1899 Hoffenheim', 'TSG 1899 Hoffenheim':'TSG 1899 Hoffenheim',
    'Eintracht Frankfurt':'Eintracht Frankfurt', 'SC Freiburg':'SC Freiburg',
    'FSV Mainz 05':'1. FSV Mainz 05', '1. FSV Mainz 05':'1. FSV Mainz 05',
    'FC Augsburg':'FC Augsburg', '1. FC Union Berlin':'1. FC Union Berlin',
    'Hamburger SV':'Hamburger SV', '1. FC Köln':'1. FC Köln',
    'Borussia Mönchengladbach':'Borussia Mönchengladbach',
    'SV Werder Bremen':'SV Werder Bremen', 'FC St. Pauli':'FC St. Pauli',
    'VfL Wolfsburg':'VfL Wolfsburg', '1. FC Heidenheim 1846':'1. FC Heidenheim',
    # 2. Bundesliga (Wikipedia namen)
    'FC Schalke 04':'FC Schalke 04', 'SC Paderborn 07':'SC Paderborn 07',
    'Hannover 96':'Hannover 96', 'SV Elversberg':'SV Elversberg',
    'SV Darmstadt 98':'SV Darmstadt 98', 'Hertha BSC':'Hertha BSC',
    '1. FC Kaiserslautern':'1. FC Kaiserslautern', 'Karlsruher SC':'Karlsruher SC',
    '1. FC Nürnberg':'1. FC Nürnberg', 'VfL Bochum':'VfL Bochum',
    'SG Dynamo Dresden':'SG Dynamo Dresden', 'Holstein Kiel':'Holstein Kiel',
    'DSC Arminia Bielefeld':'DSC Arminia Bielefeld', 'FC Magdeburg':'FC Magdeburg',
    'SpVgg Greuther Fürth':'SpVgg Greuther Fürth',
    'Eintracht Braunschweig':'Eintracht Braunschweig',
    'SC Preußen Münster':'SC Preußen Münster', 'Fortuna Düsseldorf':'Fortuna Düsseldorf',
    # Serie A
    'FC Internazionale Milano':'Inter Milan', 'SSC Napoli':'Napoli',
    'AC Milan':'AC Milan', 'Atalanta BC':'Atalanta', 'Juventus FC':'Juventus',
    'SS Lazio':'Lazio', 'AS Roma':'Roma', 'Bologna FC 1909':'Bologna F.C. 1909',
    'Hellas Verona FC':'Verona', 'Cagliari Calcio':'Cagliari',
    # La Liga
    'FC Barcelona':'FC Barcelona', 'Real Madrid CF':'Real Madrid C.F.',
    'Club Atlético de Madrid':'Atlético Madrid',
    'Real Betis Balompié':'Real Betis', 'Real Sociedad de Fútbol':'Real Sociedad',
    # Ligue 1
    'Paris Saint-Germain FC':'Paris Saint-Germain F.C.',
    'Olympique de Marseille':'Olympique de Marseille', 'Lille OSC':'Lille OSC',
    'AS Monaco FC':'AS Monaco', 'Olympique Lyonnais':'Olympique Lyonnais',
    'RC Lens':'Lens', 'Stade Rennais FC 1901':'Stade Rennais F.C.',
    'FC Lorient':'FC Lorient', 'Toulouse FC':'Toulouse FC',
    # Primeira Liga
    'FC Porto':'F.C. Porto', 'SL Benfica':'S.L. Benfica',
    'Sporting CP':'Sporting Clube de Portugal',
}

# football-data.org competition IDs
STANDINGS_IDS = {
    'pl':           2021,
    'champ':        2016,
    'ed':           2003,
    'bl':           2002,
    'sa':           2019,
    'll':           2014,
    'l1':           2015,
    'primeiraliga': 2017,
    'kkd':          None,  # via keukenkampioendivisie.nl
    'bl2':          None,  # via Wikipedia
}


def fetch(url):
    req = Request(url, headers={
        'User-Agent': 'Mozilla/5.0 (compatible; games2watch/1.0)',
        'Accept': 'text/html,application/xhtml+xml,application/json',
    })
    with urlopen(req, timeout=20) as r:
        return r.read().decode('utf-8', errors='replace')


def day_label(d):
    days   = ['Zo','Ma','Di','Wo','Do','Vr','Za']
    months = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec']
    return f"{days[d.isoweekday() % 7]} {d.day} {months[d.month-1]}"


def channel_info(raw):
    if not raw or not isinstance(raw, str):
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

    data     = json.loads(m.group(1))
    pp       = data.get('props', {}).get('pageProps', {})
    broadcasts = pp.get('broadcastsResponse', [])

    today   = datetime.date.today()
    matches = []

    for item in broadcasts:
        dt_utc = item.get('datetimeUtc', '')
        if not dt_utc: continue
        try:
            dt    = datetime.datetime.fromisoformat(dt_utc.replace('Z', '+00:00'))
            dt_nl = dt + datetime.timedelta(hours=2)
            match_date = dt_nl.date()
            time_str   = dt_nl.strftime('%H:%M')
        except Exception:
            continue

        if match_date < today:
            continue

        home_obj = item.get('homeTeam') or {}
        away_obj = item.get('awayTeam') or {}
        home = home_obj.get('name', '')
        away = away_obj.get('name', '')
        if not home or not away: continue

        # Competitienaam
        ci = item.get('competitionInstance') or {}
        comp_raw = ''
        if isinstance(ci, dict):
            comp_raw = ci.get('name', '') or (ci.get('competition') or {}).get('name', '')
        if not comp_raw:
            comp_raw = (item.get('competition') or {}).get('name', '')

        if comp_raw not in COMP_MAP: continue
        if any(w in comp_raw.lower() for w in SKIP_WORDS): continue

        key, flag, comp_label = COMP_MAP[comp_raw]

        # Kanaal
        bl = item.get('broadcasts') or []
        ch_raw = '?'
        for b in bl:
            if not isinstance(b, dict): continue
            ch_obj = b.get('channel') or {}
            name = (ch_obj.get('name') or ch_obj.get('abbreviation') or '') if isinstance(ch_obj, dict) else ''
            if name:
                ch_raw = name
                break

        ch = channel_info(ch_raw)

        matches.append({
            'sk': f"{match_date} {time_str}", 'day': day_label(match_date),
            'date': str(match_date), 'time': time_str,
            'comp': comp_label, 'leagueKey': key, 'flag': flag,
            'home': home, 'away': away,
            'rH': None, 'rA': None, 'stakeH': 'mid', 'stakeA': 'mid',
            'tv': {'label': ch.get('label', ch_raw), 'cls': ch.get('cls', 'other'),
                   'free': ch.get('free', False)},
            'legScore': None,
        })

    matches.sort(key=lambda x: x['sk'])
    print(f"  → {len(matches)} wedstrijden gevonden")
    for m in matches[:3]:
        print(f"     {m['date']} {m['time']} {m['home']} - {m['away']} [{m['tv']['label']}]")
    return matches


# ── Wikipedia standings parser ───────────────────────────────────────────────
def parse_wikipedia_standings(url, max_pos=24):
    """Wikipedia standentabel parser - zoekt tabel met posities 1..N."""
    html = fetch(url)
    teams = {}

    tables = re.findall(r'<table[^>]*wikitable[^>]*>(.*?)</table>', html, re.S)

    for table in tables:
        found = {}
        rows = re.findall(r'<tr[^>]*>(.*?)</tr>', table, re.S)
        for tr in rows:
            if 'infobox-label' in tr:
                continue
            pos_m = re.search(r'<th[^>]+scope="row"[^>]*>\s*(\d+)\s*</th>', tr)
            if not pos_m:
                continue
            pos = int(pos_m.group(1))
            if pos > max_pos:
                break

            # Alle wiki-links in de rij, neem de eerste die een clubnaam is
            all_links = re.findall(r'href="/wiki/([^"#]+)"[^>]*title="([^"]+)"', tr)
            for href, title in all_links:
                tl = title.lower()
                # Skip links naar seizoenen, landen, personen
                if any(x in tl for x in ['in football', 'football in', '2025', '2026',
                                          'season', ' cup', ' league', 'association',
                                          'stadium', 'arena']):
                    continue
                name = re.sub(r'\s*\([^)]+\)\s*$', '', title).strip()
                if name and len(name) > 2 and not name.isdigit():
                    found[name] = pos
                    break

        # Goede tabel heeft minstens 10 entries en bevat positie 1
        if len(found) >= 10 and 1 in found.values():
            teams = found
            break

    return teams

def fetch_kkd_standings():
    html = fetch('https://keukenkampioendivisie.nl/klassement')
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.S)
    if not m:
        return {}
    data = json.loads(m.group(1))
    pp = data.get('props', {}).get('pageProps', {})

    # rankingsData is de sleutel
    rankings = pp.get('rankingsData', [])
    if not rankings:
        # Zoek recursief
        def find_list(obj, depth=0):
            if depth > 6: return []
            if isinstance(obj, list) and len(obj) >= 5:
                if isinstance(obj[0], dict) and 'rank' in obj[0]:
                    return obj
            if isinstance(obj, dict):
                for v in obj.values():
                    r = find_list(v, depth+1)
                    if r: return r
            elif isinstance(obj, list):
                for item in obj:
                    r = find_list(item, depth+1)
                    if r: return r
            return []
        rankings = find_list(pp)

    teams = {}
    for row in rankings:
        if not isinstance(row, dict): continue
        pos  = row.get('rank') or row.get('position')
        name = (row.get('contestantName') or row.get('contestantShortName') or
                row.get('contestantClubName') or '')
        if not name:
            t = row.get('team') or row.get('club') or {}
            name = (t.get('name') or t.get('shortName') or '') if isinstance(t, dict) else ''
        if pos and name:
            teams[name] = int(pos)

    if teams:
        print(f"  → kkd: {len(teams)} teams (#1: {min(teams, key=teams.get)})")
    else:
        print("  → kkd: geen teams gevonden")
    return teams


# ── Stap 2: Standen ─────────────────────────────────────────────────────────
def fetch_standings():
    print("Stap 2: Standen ophalen...")
    standings = {}

    # API key
    api_key = os.environ.get('FOOTBALL_DATA_API_KEY', '')
    if not api_key:
        sf = ROOT / 'config/settings.json'
        if sf.exists():
            api_key = json.loads(sf.read_text()).get('FOOTBALL_DATA_API_KEY', '')
    print(f"  API key: {'OK' if api_key else 'ONTBREEKT'} ({len(api_key)} tekens)")

    for league_key, comp_id in STANDINGS_IDS.items():
        try:
            if league_key == 'kkd':
                standings['kkd'] = fetch_kkd_standings()
                continue

            if league_key == 'bl2':
                teams = parse_wikipedia_standings(
                    'https://en.wikipedia.org/wiki/2025%E2%80%9326_2._Bundesliga', 18)
                if teams:
                    top = min(teams, key=teams.get)
                    print(f"  → bl2 (Wikipedia): {len(teams)} teams (#1: {top})")
                else:
                    print("  → bl2: geen teams gevonden")
                standings['bl2'] = teams
                continue

            if not api_key:
                print(f"  → {league_key}: skip (geen API key)")
                continue

            url = f"https://api.football-data.org/v4/competitions/{comp_id}/standings"
            req = Request(url, headers={
                'X-Auth-Token': api_key,
                'User-Agent': 'games2watch/1.0',
            })
            with urlopen(req, timeout=15) as r:
                data = json.loads(r.read())

            teams = {}
            for table in data.get('standings', []):
                if table.get('type') != 'TOTAL': continue
                for row in table.get('table', []):
                    pos  = row.get('position')
                    name = row.get('team', {}).get('name', '')
                    if pos and name and name not in teams:
                        teams[name] = pos

            # Aliases toepassen
            teams = {TEAM_ALIASES.get(k, k): v for k, v in teams.items()}

            if teams:
                print(f"  → {league_key}: {len(teams)} teams (#1: {min(teams, key=teams.get)})")
            else:
                print(f"  → {league_key}: geen teams")
            standings[league_key] = teams

        except Exception as e:
            print(f"  → {league_key}: fout ({e})")

    # Pas Wikipedia aliases toe op bl2
    if 'bl2' in standings:
        standings['bl2'] = {TEAM_ALIASES.get(k, k): v for k, v in standings['bl2'].items()}

    return standings


# ── Stap 3: Tags ─────────────────────────────────────────────────────────────
def apply_tags(matches, standings):
    print("Stap 3: Tags toepassen...")
    for m in matches:
        key = m['leagueKey']
        lt  = CONFIG_TAGS.get(key, {})
        ls  = standings.get(key, {})
        for side in ('H', 'A'):
            team = m['home'] if side == 'H' else m['away']
            if key == 'kkd' and team in JONG_TEAMS:
                m[f'stake{side}'] = 'mid'; m[f'r{side}'] = None; continue
            pos = ls.get(team)
            m[f'r{side}']     = pos
            m[f'stake{side}'] = lt.get(str(pos), 'mid') if pos else 'mid'
    tagged = sum(1 for m in matches if m['stakeH'] != 'mid' or m['stakeA'] != 'mid')
    ranked = sum(1 for m in matches if m.get('rH') or m.get('rA'))
    print(f"  → {tagged}/{len(matches)} met tags, {ranked}/{len(matches)} met positie")
    return matches


# ── Stap 4: HTML ─────────────────────────────────────────────────────────────
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


# ── Main ─────────────────────────────────────────────────────────────────────
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
