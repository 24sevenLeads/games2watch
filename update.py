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
    'Southampton FC':'Southampton', 'Derby County FC':'Derby County',
    'Hull City AFC':'Hull City', 'Norwich City FC':'Norwich City',
    'Bristol City FC':'Bristol City', 'Watford FC':'Watford',
    'West Bromwich Albion FC':'West Bromwich Albion',
    'Stoke City FC':'Stoke City', 'Swansea City AFC':'Swansea City',
    'Preston North End FC':'Preston North End', 'Birmingham City FC':'Birmingham City',
    'Leicester City FC':'Leicester City', 'Blackburn Rovers FC':'Blackburn Rovers',
    'Portsmouth FC':'Portsmouth', 'Oxford United FC':'Oxford United',
    'Sheffield United FC':'Sheffield United', 'Sheffield Wednesday FC':'Sheffield Wednesday',
    # Eredivisie
    'PSV Eindhoven':'PSV', 'AFC Ajax':'Ajax', 'Feyenoord Rotterdam':'Feyenoord',
    'AZ Alkmaar':'AZ',
    # Bundesliga
    'FC Bayern München':'Bayern München',
    'TSG Hoffenheim':'TSG 1899 Hoffenheim', 'TSG 1899 Hoffenheim':'TSG 1899 Hoffenheim',
    'FSV Mainz 05':'1. FSV Mainz 05', '1. FSV Mainz 05':'1. FSV Mainz 05',
    '1. FC Heidenheim 1846':'1. FC Heidenheim',
    # Serie A
    'FC Internazionale Milano':'Inter Milan', 'SSC Napoli':'Napoli',
    'Atalanta BC':'Atalanta', 'Juventus FC':'Juventus',
    'SS Lazio':'Lazio', 'AS Roma':'Roma', 'Bologna FC 1909':'Bologna F.C. 1909',
    'Hellas Verona FC':'Verona', 'Cagliari Calcio':'Cagliari',
    # La Liga
    'Real Madrid CF':'Real Madrid C.F.',
    'Club Atlético de Madrid':'Atlético Madrid',
    'Real Betis Balompié':'Real Betis', 'Real Sociedad de Fútbol':'Real Sociedad',
    # Ligue 1
    'Paris Saint-Germain FC':'Paris Saint-Germain F.C.',
    'AS Monaco FC':'AS Monaco', 'RC Lens':'Lens',
    'Stade Rennais FC 1901':'Stade Rennais F.C.',
    # Primeira Liga
    'FC Porto':'F.C. Porto', 'SL Benfica':'S.L. Benfica',
    'Sporting CP':'Sporting Clube de Portugal',
    # Bundesliga 1
    'FC St. Pauli':'FC St. Pauli',
    # Ligue 1
    'RC Lens':'Lens',
    'FC Metz':'Metz',
    'FC Nantes':'FC Nantes',
    'Stade Brestois 29':'FC Brest',
    'Angers SCO':'Angers',
    'Angers':'Angers',
    'SCO Angers':'Angers',
    # Serie A
    'Udinese Calcio':'Udinese',
    'Parma Calcio 1913':'Parma',
    'Torino FC':'Torino',
    'ACF Fiorentina':'Fiorentina',
    'Fiorentina':'Fiorentina',
    'US Lecce':'US Lecce',
    'Genoa CFC':'Genoa',
    'AC Pisa 1909':'Pisa',
    'US Cremonese':'Cremonese',
    'Cremonese':'Cremonese',
    # Primeira Liga
    'C.D. Tondela':'Tondela',
    'Tondela':'Tondela',
    'SL Benfica':'S.L. Benfica',
    # KKD - Jong teams matchen al via JONG_TEAMS filter
    # 2. Bundesliga (OpenLigaDB ShortName -> iservoetbalvanavond.nl)
    'Schalke':       'FC Schalke 04',
    'Paderborn':     'SC Paderborn 07',
    'Elversberg':    'SV Elversberg',
    'Hannover':      'Hannover 96',
    'Darmstadt':     'SV Darmstadt 98',
    'Hertha':        'Hertha BSC',
    'Kaiserslautern':'1. FC Kaiserslautern',
    'Karlsruhe':     'Karlsruher SC',
    'Nürnberg':      '1. FC Nürnberg',
    'Bochum':        'VfL Bochum',
    'Kiel':          'Holstein Kiel',
    'Dresden':       'SG Dynamo Dresden',
    'Bielefeld':     'DSC Arminia Bielefeld',
    'Düsseldorf':    'Fortuna Düsseldorf',
    'Magdeburg':     '1. FC Magdeburg',
    'Braunschweig':  'Eintracht Braunschweig',
    'Fürth':         'SpVgg Greuther Fürth',
    'Münster':       'SC Preußen Münster',
}

STANDINGS_IDS = {
    'pl':           2021,
    'champ':        2016,
    'ed':           2003,
    'bl':           2002,
    'sa':           2019,
    'll':           2014,
    'l1':           2015,
    'primeiraliga': 2017,
    'kkd':          None,
    'bl2':          None,
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

    data       = json.loads(m.group(1))
    pp         = data.get('props', {}).get('pageProps', {})
    broadcasts = pp.get('broadcastsResponse', [])
    today      = datetime.date.today()
    matches    = []

    for item in broadcasts:
        dt_utc = item.get('datetimeUtc', '')
        if not dt_utc: continue
        try:
            dt     = datetime.datetime.fromisoformat(dt_utc.replace('Z', '+00:00'))
            dt_nl  = dt + datetime.timedelta(hours=2)
            match_date = dt_nl.date()
            time_str   = dt_nl.strftime('%H:%M')
        except Exception:
            continue

        if match_date < today: continue

        home_obj = item.get('homeTeam') or {}
        away_obj = item.get('awayTeam') or {}
        home = home_obj.get('name', '')
        away = away_obj.get('name', '')
        if not home or not away: continue

        ci = item.get('competitionInstance') or {}
        comp_raw = ''
        if isinstance(ci, dict):
            comp_raw = ci.get('name', '') or (ci.get('competition') or {}).get('name', '')
        if not comp_raw:
            comp_raw = (item.get('competition') or {}).get('name', '')

        if comp_raw not in COMP_MAP: continue
        if any(w in comp_raw.lower() for w in SKIP_WORDS): continue

        key, flag, comp_label = COMP_MAP[comp_raw]

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
    print(f"  -> {len(matches)} wedstrijden gevonden")
    for m in matches[:3]:
        print(f"     {m['date']} {m['time']} {m['home']} - {m['away']} [{m['tv']['label']}]")
    return matches


# ── KKD standings ─────────────────────────────────────────────────────────────
def fetch_kkd_standings():
    try:
        html = fetch('https://keukenkampioendivisie.nl/klassement')
        m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.S)
        if not m:
            print("  -> kkd: geen __NEXT_DATA__")
            return {}
        data     = json.loads(m.group(1))
        pp       = data.get('props', {}).get('pageProps', {})
        rankings = pp.get('rankingsData', [])

        teams = {}
        for row in rankings:
            if not isinstance(row, dict): continue
            pos  = row.get('rank') or row.get('position')
            name = (row.get('contestantName') or row.get('contestantShortName') or
                    row.get('contestantClubName') or '')
            if pos and name:
                teams[name] = int(pos)

        if teams:
            print(f"  -> kkd: {len(teams)} teams (#1: {min(teams, key=teams.get)})")
        else:
            print("  -> kkd: geen teams gevonden")
        return teams
    except Exception as e:
        print(f"  -> kkd fout: {e}")
        return {}


# ── 2.Bundesliga standings via OpenLigaDB ─────────────────────────────────────
def fetch_bl2_standings():
    try:
        data = json.loads(fetch('https://api.openligadb.de/getbltable/bl2/2025'))
        teams = {}
        for i, row in enumerate(data):
            name = (row.get('TeamName') or row.get('shortName') or
                    row.get('teamName') or row.get('ShortName') or '')
            if name:
                teams[name] = i + 1
        if teams:
            top = min(teams, key=teams.get)
            print(f"  -> bl2: {len(teams)} teams (#1: {top})")
            print(f"  -> bl2 namen: {list(teams.keys())}")
        else:
            print(f"  -> bl2: 0 teams, row[0]: {json.dumps(data[0] if data else {})[:300]}")
        return teams
    except Exception as e:
        print(f"  -> bl2 fout: {e}")
        return {}


# ── Stap 2: Standen ─────────────────────────────────────────────────────────
def fetch_standings():
    print("Stap 2: Standen ophalen...")
    standings = {}

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
                raw = fetch_bl2_standings()
                standings['bl2'] = {TEAM_ALIASES.get(k, k): v for k, v in raw.items()}
                continue

            if not api_key:
                print(f"  -> {league_key}: skip (geen API key)")
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

            teams = {TEAM_ALIASES.get(k, k): v for k, v in teams.items()}

            if teams:
                print(f"  -> {league_key}: {len(teams)} teams (#1: {min(teams, key=teams.get)})")
            else:
                print(f"  -> {league_key}: geen teams")
            standings[league_key] = teams

        except Exception as e:
            print(f"  -> {league_key}: fout ({e})")

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
    print(f"  -> {tagged}/{len(matches)} met tags, {ranked}/{len(matches)} met positie")
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
