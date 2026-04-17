#!/usr/bin/env python3
"""
update.py — dagelijkse update voor games2watch.eu/nl
Parset iservoetbalvanavond.nl via __NEXT_DATA__ JSON (Next.js)
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
    # Exacte match
    if raw in ch:
        return ch[raw]
    # Case-insensitieve match
    for key, val in ch.items():
        if key.lower() == raw.lower():
            return val
    # Gedeeltelijke match (langste key die matcht)
    matches = [(k, v) for k, v in ch.items() if k.lower() in raw.lower()]
    if matches:
        return max(matches, key=lambda x: len(x[0]))[1]
    return {'cls': 'other', 'free': False, 'label': raw}


# ── Stap 1: Speelschema via __NEXT_DATA__ ───────────────────────────────────
def fetch_schedule():
    print("Stap 1: Speelschema ophalen...")
    html = fetch('https://www.iservoetbalvanavond.nl')

    # Zoek __NEXT_DATA__ JSON in de HTML
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.S)
    if not m:
        print("  FOUT: __NEXT_DATA__ niet gevonden — fallback naar HTML parser")
        return fetch_schedule_html(html)

    try:
        data = json.loads(m.group(1))
    except json.JSONDecodeError as e:
        print(f"  FOUT: JSON parse fout: {e}")
        return fetch_schedule_html(html)

    # Doorzoek de JSON structuur naar wedstrijddata
    # Dump de structuur om te begrijpen hoe het is opgebouwd
    raw_str = json.dumps(data)
    print(f"  __NEXT_DATA__ gevonden ({len(raw_str)} chars)")

    # Probeer verschillende mogelijke structuren
    matches = []
    page_props = data.get('props', {}).get('pageProps', {})
    
    # Log de keys op het hoogste niveau
    print(f"  pageProps keys: {list(page_props.keys())[:10]}")

    # Zoek naar lijsten met wedstrijddata
    def find_matches(obj, depth=0):
        if depth > 5: return []
        results = []
        if isinstance(obj, list):
            for item in obj:
                results += find_matches(item, depth+1)
        elif isinstance(obj, dict):
            # Check of dit een wedstrijd is
            keys = set(obj.keys())
            if any(k in keys for k in ['home','away','homeTeam','awayTeam','teams']):
                results.append(obj)
            else:
                for v in obj.values():
                    results += find_matches(v, depth+1)
        return results

    raw_matches = find_matches(page_props)
    print(f"  Wedstrijd-objecten gevonden: {len(raw_matches)}")

    if raw_matches:
        print(f"  Voorbeeld: {json.dumps(raw_matches[0])[:200]}")

    # Als we niets vinden, fallback naar HTML parser
    if not raw_matches:
        print("  Geen wedstrijden in JSON gevonden — fallback naar HTML parser")
        return fetch_schedule_html(html)

    return matches


def fetch_schedule_html(html):
    """Fallback: parse HTML direct met regex op anchor tags en structuur."""
    print("  HTML parser actief...")
    today = datetime.date.today()
    NL_MONTHS = {
        'januari':1,'februari':2,'maart':3,'april':4,'mei':5,'juni':6,
        'juli':7,'augustus':8,'september':9,'oktober':10,'november':11,'december':12
    }

    def parse_date_str(s):
        s = s.lower().strip()
        if 'vandaag' in s: return today
        if 'morgen'  in s: return today + datetime.timedelta(days=1)
        m = re.search(r'(\d+)\s+(\w+)', s)
        if m:
            dn = int(m.group(1))
            mn = NL_MONTHS.get(m.group(2))
            if mn:
                year = today.year
                d = datetime.date(year, mn, dn)
                if d < today - datetime.timedelta(days=1):
                    d = datetime.date(year+1, mn, dn)
                return d
        return None

    matches = []

    # Zoek dag-headers: <h2>Vandaag</h2> of ## Vandaag
    # Splits HTML op dag-secties
    # Patroon: h2 tag gevolgd door wedstrijdblokken
    sections = re.split(r'<h2[^>]*>', html)

    for section in sections[1:]:  # sla eerste (voor eerste h2) over
        header_m = re.match(r'([^<]+)</h2>', section)
        if not header_m:
            continue
        match_date = parse_date_str(header_m.group(1))
        if not match_date:
            continue

        print(f"  Dag: {header_m.group(1).strip()} → {match_date}")

        # Zoek tijden + competities + teams in deze sectie
        # Tijden staan in <p> of <div> tags
        # Teams staan als <a href="/clubs-en-teams/...">Teamnaam</a>
        
        # Zoek alle tijden
        times = re.findall(r'(\d{2}:\d{2})', section[:50000])
        # Zoek alle teamlinks
        team_links = re.findall(
            r'href="/clubs-en-teams/[^"]*"[^>]*>([^<]+)</a>', section)
        # Zoek competitienamen (staan tussen tijd en teams)
        comp_names = re.findall(
            r'<(?:h3|h4|p|div)[^>]*>\s*([^<]{3,50})\s*</(?:h3|h4|p|div)>',
            section)

        print(f"    Tijden: {times[:5]}, Teams: {team_links[:6]}")

    print(f"  → {len(matches)} wedstrijden gevonden via HTML")
    return matches


# ── Stap 2: Standen ─────────────────────────────────────────────────────────
def fetch_standings():
    print("Stap 2: Standen ophalen...")
    standings = {}

    for league_key, url in STANDINGS_URLS.items():
        try:
            html = fetch(url)
            teams = {}
            # Wikipedia tabel: <th scope="row">1</th>...<a title="Teamname">
            rows = re.findall(
                r'scope="row"[^>]*>\s*(\d+)\s*</th>(.*?)</tr>',
                html, re.S
            )
            for pos_str, row_html in rows:
                pos = int(pos_str)
                if pos > 24: break
                tm = re.search(r'title="([^"(]+?)(?:\s*\(football\)|\s*F\.C\.\s*\(|")',
                               row_html)
                if not tm:
                    tm = re.search(r'title="([^"]+)"', row_html)
                if tm:
                    team = tm.group(1).strip()
                    # Filter Wikipedia disambiguatie
                    if '(' not in team and team not in teams:
                        teams[team] = pos

            if teams:
                top = min(teams, key=teams.get)
                standings[league_key] = teams
                print(f"  → {league_key}: {len(teams)} teams (#1: {top})")
            else:
                print(f"  → {league_key}: geen teams gevonden")
        except Exception as e:
            print(f"  → {league_key}: fout ({e})")

    return standings


# ── Stap 3: Tags ────────────────────────────────────────────────────────────
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


# ── Stap 4: HTML ────────────────────────────────────────────────────────────
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


# ── Main ────────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    print(f"=== games2watch update {datetime.datetime.now():%Y-%m-%d %H:%M} ===")
    if DRY_RUN:
        print("[DRY RUN]")

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
