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

# Vertaling van football-data.org teamnamen → iservoetbalvanavond.nl teamnamen
TEAM_ALIASES = {
    # Premier League
    'Arsenal FC':                    'Arsenal',
    'Manchester City FC':            'Manchester City',
    'Manchester United FC':          'Manchester United',
    'Aston Villa FC':                'Aston Villa',
    'Liverpool FC':                  'Liverpool',
    'Chelsea FC':                    'Chelsea',
    'Brentford FC':                  'Brentford',
    'Everton FC':                    'Everton',
    'Fulham FC':                     'Fulham',
    'Brighton & Hove Albion FC':     'Brighton & Hove Albion',
    'Newcastle United FC':           'Newcastle United',
    'AFC Bournemouth':               'Bournemouth',
    'Sunderland AFC':                'Sunderland',
    'Nottingham Forest FC':          'Nottingham Forest',
    'West Ham United FC':            'West Ham United',
    'Leeds United FC':               'Leeds United',
    'Crystal Palace FC':             'Crystal Palace',
    'Tottenham Hotspur FC':          'Tottenham Hotspur',
    'Burnley FC':                    'Burnley',
    'Wolverhampton Wanderers FC':    'Wolverhampton Wanderers',
    # Championship
    'Coventry City FC':              'Coventry City',
    'Ipswich Town FC':               'Ipswich Town',
    'Middlesbrough FC':              'Middlesbrough',
    'Millwall FC':                   'Millwall',
    'Southampton FC':                'Southampton',
    'Wrexham AFC':                   'Wrexham',
    'Derby County FC':               'Derby County',
    'Hull City AFC':                 'Hull City',
    'Norwich City FC':               'Norwich City',
    'Bristol City FC':               'Bristol City',
    'Queens Park Rangers FC':        'Queens Park Rangers',
    'Watford FC':                    'Watford',
    'West Bromwich Albion FC':       'West Bromwich Albion',
    'Charlton Athletic FC':          'Charlton Athletic',
    'Stoke City FC':                 'Stoke City',
    'Swansea City AFC':              'Swansea City',
    'Preston North End FC':          'Preston North End',
    'Birmingham City FC':            'Birmingham City',
    'Leicester City FC':             'Leicester City',
    'Blackburn Rovers FC':           'Blackburn Rovers',
    'Portsmouth FC':                 'Portsmouth',
    'Oxford United FC':              'Oxford United',
    'Sheffield United FC':           'Sheffield United',
    'Sheffield Wednesday FC':        'Sheffield Wednesday',
    # Eredivisie
    'PSV Eindhoven':                 'PSV',
    'AFC Ajax':                      'Ajax',
    'Feyenoord Rotterdam':           'Feyenoord',
    'AZ Alkmaar':                    'AZ',
    'FC Twente':                     'FC Twente',
    'FC Utrecht':                    'FC Utrecht',
    'Sparta Rotterdam':              'Sparta Rotterdam',
    # Bundesliga
    'FC Bayern München':             'Bayern München',
    'Borussia Dortmund':             'Borussia Dortmund',
    'VfB Stuttgart':                 'VfB Stuttgart',
    'RB Leipzig':                    'RB Leipzig',
    'Bayer 04 Leverkusen':           'Bayer 04 Leverkusen',
    'TSG 1899 Hoffenheim':           'TSG 1899 Hoffenheim',
    'Eintracht Frankfurt':           'Eintracht Frankfurt',
    'SC Freiburg':                   'SC Freiburg',
    '1. FSV Mainz 05':               '1. FSV Mainz 05',
    'FC Augsburg':                   'FC Augsburg',
    '1. FC Union Berlin':            '1. FC Union Berlin',
    'Hamburger SV':                  'Hamburger SV',
    '1. FC Köln':                    '1. FC Köln',
    'Borussia Mönchengladbach':      'Borussia Mönchengladbach',
    'SV Werder Bremen':              'SV Werder Bremen',
    'FC St. Pauli':                  'FC St. Pauli',
    'VfL Wolfsburg':                 'VfL Wolfsburg',
    '1. FC Heidenheim 1846':         '1. FC Heidenheim',
    # Serie A
    'FC Internazionale Milano':      'Inter Milan',
    'SSC Napoli':                    'Napoli',
    'AC Milan':                      'AC Milan',
    'Atalanta BC':                   'Atalanta',
    'Juventus FC':                   'Juventus',
    'SS Lazio':                      'Lazio',
    'AS Roma':                       'Roma',
    'Bologna FC 1909':               'Bologna F.C. 1909',
    'Hellas Verona FC':              'Verona',
    'Cagliari Calcio':               'Cagliari',
    # La Liga
    'FC Barcelona':                  'FC Barcelona',
    'Real Madrid CF':                'Real Madrid C.F.',
    'Club Atlético de Madrid':       'Atlético Madrid',
    'Athletic Club':                 'Athletic Club',
    'Real Sociedad de Fútbol':       'Real Sociedad',
    'Villarreal CF':                 'Villarreal',
    'Real Betis Balompié':           'Real Betis',
    # Ligue 1
    'Paris Saint-Germain FC':        'Paris Saint-Germain F.C.',
    'Olympique de Marseille':        'Olympique de Marseille',
    'Lille OSC':                     'Lille OSC',
    'AS Monaco FC':                  'AS Monaco',
    'Olympique Lyonnais':            'Olympique Lyonnais',
    'RC Lens':                       'Lens',
    'Stade Rennais FC 1901':         'Stade Rennais F.C.',
    'FC Lorient':                    'FC Lorient',
    'Toulouse FC':                   'Toulouse FC',
    # Primeira Liga
    'FC Porto':                      'F.C. Porto',
    'SL Benfica':                    'S.L. Benfica',
    'Sporting CP':                   'Sporting Clube de Portugal',
}

# football-data.org competition IDs
STANDINGS_IDS = {
    'pl':           2021,  # Premier League
    'champ':        2016,  # Championship
    'ed':           2003,  # Eredivisie
    'kkd':          None,  # KKD niet beschikbaar in gratis tier
    'bl':           2002,  # Bundesliga
    'bl2':          None,  # 2.Bundesliga niet in gratis tier
    'sa':           2019,  # Serie A
    'll':           2014,  # La Liga
    'l1':           2015,  # Ligue 1
    'primeiraliga': 2017,  # Primeira Liga
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
    today = datetime.date.today()
    matches = []

    for item in broadcasts:
        # Datum + tijd
        dt_utc = item.get('datetimeUtc', '')
        if not dt_utc:
            continue
        try:
            dt = datetime.datetime.fromisoformat(dt_utc.replace('Z', '+00:00'))
            # Omzet naar Nederlandse tijd (UTC+2 zomertijd)
            dt_nl = dt + datetime.timedelta(hours=2)
            match_date = dt_nl.date()
            time_str = dt_nl.strftime('%H:%M')
        except Exception:
            continue

        # Alleen vandaag en later
        if match_date < today:
            continue

        # Teamnamen
        home_obj = item.get('homeTeam', {}) or {}
        away_obj = item.get('awayTeam', {}) or {}
        home = home_obj.get('name', '')
        away = away_obj.get('name', '')
        if not home or not away:
            continue

        # Competitie
        comp_inst = item.get('competitionInstance', {}) or {}
        comp_raw = comp_inst.get('name', '') or comp_inst.get('competition', {}).get('name', '') if isinstance(comp_inst, dict) else ''
        # Probeer ook via competition key
        if not comp_raw:
            comp_obj = item.get('competition', {}) or {}
            comp_raw = comp_obj.get('name', '')

        if comp_raw not in COMP_MAP:
            continue
        if any(w in comp_raw.lower() for w in SKIP_WORDS):
            continue

        key, flag, comp_label = COMP_MAP[comp_raw]

        # Kanalen: item.get('broadcasts') is een lijst van broadcast-objecten
        # Kanaal: zit als {"channel": {"name": "Viaplay", ...}} in broadcasts lijst
        broadcasts_list = item.get('broadcasts', []) or []
        ch_raw = '?'
        for b in broadcasts_list:
            if not isinstance(b, dict): continue
            ch_obj = b.get('channel') or {}
            name = ch_obj.get('name') or ch_obj.get('abbreviation') or ''
            if name:
                ch_raw = name
                break

        ch = channel_info(ch_raw)

        matches.append({
            'sk':        f"{match_date} {time_str}",
            'day':       day_label(match_date),
            'date':      str(match_date),
            'time':      time_str,
            'comp':      comp_label,
            'leagueKey': key,
            'flag':      flag,
            'home':      home,
            'away':      away,
            'rH':        None,
            'rA':        None,
            'stakeH':    'mid',
            'stakeA':    'mid',
            'tv': {
                'label': ch.get('label', ch_raw),
                'cls':   ch.get('cls', 'other'),
                'free':  ch.get('free', False),
            },
            'legScore': None,
        })

    matches.sort(key=lambda x: x['sk'])
    print(f"  → {len(matches)} wedstrijden gevonden")
    for m in matches[:3]:
        print(f"     {m['date']} {m['time']} {m['home']} - {m['away']} [{m['tv']['label']}]")

    # Debug: print eerste raw item om competitie + kanaal structuur te zien
    if broadcasts and len(matches) == 0:
        sample = broadcasts[0]
        print(f"  DEBUG comp keys: {list((sample.get('competitionInstance') or sample.get('competition') or {}).keys())}")
        print(f"  DEBUG broadcast[0]: {json.dumps((sample.get('broadcasts') or [{}])[0])[:200]}")

    return matches


# ── Hulpfuncties voor standen zonder API ────────────────────────────────────
def fetch_kkd_standings():
    """Haal KKD stand op via keukenkampioendivisie.nl klassement pagina."""
    try:
        html = fetch('https://keukenkampioendivisie.nl/klassement')
        import json as _json
        m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.S)
        if not m:
            return {}
        data = _json.loads(m.group(1))
        # Zoek standings in de JSON
        def find_list(obj, depth=0):
            if depth > 6: return []
            if isinstance(obj, list) and len(obj) > 5:
                # Check of het een standlijst is
                if isinstance(obj[0], dict) and any(
                    k in obj[0] for k in ['position','rank','pos','plaats']
                ):
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

        page_props = data.get('props', {}).get('pageProps', {})
        rows = find_list(page_props)
        teams = {}
        for row in rows:
            if not isinstance(row, dict): continue
            pos = row.get('position') or row.get('rank') or row.get('pos')
            team_obj = row.get('team') or row.get('club') or {}
            name = (team_obj.get('name') or team_obj.get('shortName') or
                    row.get('teamName') or row.get('name') or '')
            if pos and name:
                teams[name] = int(pos)
        print(f"  -> kkd (KKD site): {len(teams)} teams")
        return teams
    except Exception as e:
        print(f"  -> kkd fout: {e}")
        return {}


def fetch_bl2_standings():
    """Haal 2.Bundesliga stand op via bundesliga.com."""
    try:
        html = fetch('https://www.bundesliga.com/en/2bundesliga/table')
        # Zoek teamposities in de HTML tabel
        teams = {}
        rows = re.findall(r'<tr[^>]*>(.*?)</tr>', html, re.S)
        for tr in rows:
            pos_m = re.search(r'>\s*(\d+)\s*<', tr)
            name_m = re.search(r'(?:alt|title)="([^"]{3,40})"', tr)
            if pos_m and name_m:
                pos  = int(pos_m.group(1))
                name = name_m.group(1).strip()
                if 1 <= pos <= 18 and name not in teams:
                    teams[name] = pos
        # Fallback: zoek in __NEXT_DATA__
        if not teams:
            m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.S)
            if m:
                import json as _json
                data = _json.loads(m.group(1))
                print("  -> bl2 NEXT_DATA keys: " + str(list(data.get("props",{}).get("pageProps",{}).keys())[:5]))
        print(f"  -> bl2 (bundesliga.com): {len(teams)} teams")
        return teams
    except Exception as e:
        print(f"  -> bl2 fout: {e}")
        return {}


# ── Stap 2: Standen via football-data.org ───────────────────────────────────
def fetch_standings():
    print("Stap 2: Standen ophalen via football-data.org...")
    standings = {}

    # Probeer key uit environment, dan uit config/settings.json
    api_key = os.environ.get('FOOTBALL_DATA_API_KEY', '')
    if not api_key:
        settings_file = ROOT / 'config/settings.json'
        if settings_file.exists():
            settings = json.loads(settings_file.read_text())
            api_key = settings.get('FOOTBALL_DATA_API_KEY', '')
    print(f"  API key aanwezig: {bool(api_key)}, lengte: {len(api_key)}")
    if not api_key:
        print("  FOUT: geen API key gevonden")
        return standings

    for league_key, comp_id in STANDINGS_IDS.items():
        if comp_id is None:
            if league_key == 'kkd':
                standings['kkd'] = fetch_kkd_standings()
            elif league_key == 'bl2':
                standings['bl2'] = fetch_bl2_standings()
            continue
        try:
            url = f"https://api.football-data.org/v4/competitions/{comp_id}/standings"
            req = Request(url, headers={
                'X-Auth-Token': api_key,
                'User-Agent': 'games2watch/1.0',
            })
            with urlopen(req, timeout=15) as r:
                data = json.loads(r.read())

            teams = {}
            # API geeft standings als lijst van tabellen (TOTAL, HOME, AWAY)
            for table in data.get('standings', []):
                if table.get('type') != 'TOTAL':
                    continue
                for row in table.get('table', []):
                    pos  = row.get('position')
                    team = row.get('team', {}).get('name', '')
                    if pos and team and team not in teams:
                        teams[team] = pos

            # Pas aliases toe: football-data naam → iservoetbalvanavond naam
            aliased = {}
            for name, pos in teams.items():
                canonical = TEAM_ALIASES.get(name, name)
                aliased[canonical] = pos
            teams = aliased

            if teams:
                top = min(teams, key=teams.get)
                standings[league_key] = teams
                print(f"  -> {league_key}: {len(teams)} teams (#1: {top})")
            else:
                print(f"  -> {league_key}: geen teams gevonden")
        except Exception as e:
            print(f"  -> {league_key}: fout ({e})")

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
