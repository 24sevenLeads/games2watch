#!/usr/bin/env python3
"""
update.py — dagelijkse update voor games2watch.eu/nl
Stap 1: Haal speelschema op van iservoetbalvanavond.nl
Stap 2: Haal standen op per competitie (Wikipedia)
Stap 3: Combineer met league-tags.json → rH/rA + stakeH/stakeA
Stap 4: Schrijf nl/index.html

Gebruik: python3 update.py [--dry-run]
"""

import json, re, sys, datetime
from pathlib import Path
from urllib.request import urlopen, Request
from urllib.error import URLError

ROOT = Path(__file__).parent
CONFIG_TAGS     = json.loads((ROOT / 'config/league-tags.json').read_text())
CONFIG_CHANNELS = json.loads((ROOT / 'config/channels.json').read_text())
TEMPLATE        = (ROOT / 'nl/index.html').read_text()
DRY_RUN         = '--dry-run' in sys.argv

# ── Competitie mapping: naam op iservoetbalvanavond → leagueKey + metadata ──
COMP_MAP = {
    'Champions League':          ('cl',           '🏆', 'Champions League'),
    'Europa League':             ('el',           '🏆', 'Europa League'),
    'UEFA Conference League':    ('conf',         '🏆', 'Conference League'),
    'Premier League':            ('pl',           'ENG','Premier League'),
    'Football League Championship': ('champ',     'ENG','Championship'),
    'FA Cup':                    ('facup',        'ENG','FA Cup'),
    'Eredivisie':                ('ed',           '🇳🇱', 'Eredivisie'),
    'Keuken Kampioen Divisie':   ('kkd',          '🇳🇱', 'Keuken Kampioen Divisie'),
    'KNVB Beker':                ('knvb',         '🇳🇱', 'KNVB Beker'),
    'Bundesliga':                ('bl',           '🇩🇪', 'Bundesliga'),
    '2. Bundesliga':             ('bl2',          '🇩🇪', '2. Bundesliga'),
    'DFB-Pokal':                 ('dfbpokal',     '🇩🇪', 'DFB-Pokal'),
    'La Liga':                   ('ll',           '🇪🇸', 'La Liga'),
    'Copa del Rey':              ('copadelrey',   '🇪🇸', 'Copa del Rey'),
    'Serie A':                   ('sa',           '🇮🇹', 'Serie A'),
    'Coppa Italia':              ('coppaitalia',  '🇮🇹', 'Coppa Italia'),
    'Ligue 1':                   ('l1',           '🇫🇷', 'Ligue 1'),
    'Coupe de France':           ('coupedefrance','🇫🇷', 'Coupe de France'),
    'Primeira Liga':             ('primeiraliga', '🇵🇹', 'Primeira Liga'),
    'Taça de Portugal':          ('tacaportugal', '🇵🇹', 'Taça de Portugal'),
}

# Competities die we willen tonen (rest overslaan)
WANTED = set(COMP_MAP.keys())
SKIP_KEYWORDS = ['youth', 'u19', 'u21', 'vrouwen', 'dames', 'women', 'wk kwalificatie',
                 'football league two', 'league two']

# Wikipedia URL's voor standen per leagueKey
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
    'primeiraliga': 'https://en.wikipedia.org/wiki/2025%E2%80%9326_Liga_Portugal',
}

# Jong-teams (nooit promotiegerechtigd in KKD)
JONG_TEAMS = {'Jong Ajax', 'Jong PSV', 'Jong AZ', 'Jong FC Utrecht',
              'Jong Utrecht', 'Jong PSV', 'Jong AZ'}


def fetch(url):
    req = Request(url, headers={'User-Agent': 'Mozilla/5.0 games2watch/1.0'})
    with urlopen(req, timeout=15) as r:
        return r.read().decode('utf-8', errors='replace')


def day_label(d):
    days   = ['Zo','Ma','Di','Wo','Do','Vr','Za']
    months = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec']
    return f"{days[d.isoweekday() % 7]} {d.day} {months[d.month-1]}"


# ── Stap 1: Speelschema van iservoetbalvanavond.nl ───────────────────────────
def fetch_schedule():
    print("Stap 1: Speelschema ophalen...")
    html = fetch('https://www.iservoetbalvanavond.nl')

    matches = []
    # Dag headers: ## Vandaag / ## Morgen / ## Vrijdag 17 april / etc.
    day_pattern = re.compile(r'##\s+(.+?)(?=\n)', re.M)
    section_pattern = re.compile(
        r'##\s+(.+?)\n(.*?)(?=\n##\s|\Z)', re.S)

    # Parse datum uit header
    today = datetime.date.today()
    NL_DAYS = {'maandag':0,'dinsdag':1,'woensdag':2,'donderdag':3,
               'vrijdag':4,'zaterdag':5,'zondag':6}
    NL_MONTHS = {'januari':1,'februari':2,'maart':3,'april':4,'mei':5,
                 'juni':6,'juli':7,'augustus':8,'september':9,
                 'oktober':10,'november':11,'december':12}

    def parse_date(header):
        h = header.lower().strip()
        if 'vandaag' in h: return today
        if 'morgen' in h:  return today + datetime.timedelta(days=1)
        # "Vrijdag 17 april"
        m = re.search(r'(\d+)\s+(\w+)', h)
        if m:
            day_num = int(m.group(1))
            month_num = NL_MONTHS.get(m.group(2))
            if month_num:
                year = today.year
                d = datetime.date(year, month_num, day_num)
                if d < today - datetime.timedelta(days=1):
                    d = datetime.date(year+1, month_num, day_num)
                return d
        return None

    # Splits HTML in dagblokken
    sections = section_pattern.findall(html)
    for header, content in sections:
        match_date = parse_date(header)
        if not match_date:
            continue

        # Verwijder Youth League etc
        content_lower = content.lower()
        if any(k in content_lower for k in SKIP_KEYWORDS):
            # Verwijder alleen die competitieblokken — simpelweg skip hele dag als vol ervan
            pass  # we filteren per wedstrijd hieronder

        # Per competitie in deze dag
        comp_blocks = re.split(r'\n(?=\d{2}:\d{2}\s*\n)', content)

        # Alternatieve parse: zoek tijden + teams direct
        # Format in markdown: tijd, comp, | ... | team1 | ... | team2 | ... | kanaal |
        time_blocks = re.split(r'\n(?=\d{2}:\d{2}\n)', content)

        for block in time_blocks:
            lines = [l.strip() for l in block.strip().splitlines() if l.strip()]
            if not lines: continue
            time_match = re.match(r'^(\d{2}:\d{2})$', lines[0])
            if not time_match: continue
            time_str = time_match.group(1)

            # Competitienaam is de volgende niet-tabel lijn
            comp_name = None
            for l in lines[1:]:
                if not l.startswith('|') and not l.startswith('-'):
                    comp_name = l.strip()
                    break

            if not comp_name or comp_name not in WANTED:
                continue
            if any(k in comp_name.lower() for k in SKIP_KEYWORDS):
                continue

            # Parse tabelrijen: | ... | team1 | ... | team2 | ... | kanaal |
            table_rows = [l for l in lines if l.startswith('|') and '---' not in l]
            # Elke 2 rijen = 1 wedstrijd (home + away)
            i = 0
            while i < len(table_rows) - 1:
                row1 = [c.strip() for c in table_rows[i].split('|') if c.strip()]
                row2 = [c.strip() for c in table_rows[i+1].split('|') if c.strip()]

                # Team staat als link: [Naam](url "Naam")
                def extract_team(cells):
                    for c in cells:
                        m = re.search(r'\[([^\]]+)\]\(', c)
                        if m: return m.group(1)
                    return None

                def extract_channel(cells):
                    for c in cells:
                        if re.search(r'(ESPN|Ziggo|Viaplay|NPO|Prime|Star|RTL)', c, re.I):
                            # Haal kanaalnaam op
                            m = re.search(r'\[([^\]]+)\]', c)
                            if m: return m.group(1)
                            return c.strip()
                    return '?'

                home = extract_team(row1)
                away = extract_team(row2)
                if not home or not away:
                    i += 2
                    continue

                channel_raw = extract_channel(row1) or extract_channel(row2)

                # Leg Score ophalen (leg staat apart in tabel of als tekst)
                leg_score = None
                # Soms staat "heen: 1-0" in content boven de tabel
                leg_m = re.search(r'heen.*?(\d+[-–]\d+)', block, re.I)
                if leg_m:
                    leg_score = leg_m.group(1).replace('–', '-')

                key, flag, comp_label = COMP_MAP[comp_name]

                # Kanaal lookup
                ch_info = CONFIG_CHANNELS['channels'].get(
                    channel_raw,
                    CONFIG_CHANNELS.get('_default', {'cls':'other','free':False})
                )

                matches.append({
                    'sk':       f"{match_date} {time_str}",
                    'day':      day_label(match_date),
                    'date':     str(match_date),
                    'time':     time_str,
                    'comp':     comp_label,
                    'leagueKey': key,
                    'flag':     flag,
                    'home':     home,
                    'away':     away,
                    'rH':       None,
                    'rA':       None,
                    'stakeH':   'mid',
                    'stakeA':   'mid',
                    'tv': {
                        'label': ch_info.get('label', channel_raw),
                        'cls':   ch_info.get('cls', 'other'),
                        'free':  ch_info.get('free', False),
                    },
                    'legScore': leg_score,
                })
                i += 2

    matches.sort(key=lambda x: x['sk'])
    print(f"  → {len(matches)} wedstrijden gevonden")
    return matches


# ── Stap 2: Standen ophalen van Wikipedia ───────────────────────────────────
def fetch_standings():
    print("Stap 2: Standen ophalen...")
    standings = {}

    for league_key, url in STANDINGS_URLS.items():
        try:
            html = fetch(url)
            # Wikipedia tabel heeft: scope="row">POS</th> ... title="TEAMNAAM"
            # Patroon: rij met positienummer + teamlink
            teams = {}
            # Zoek tabel met standaard wikipedia-tabel structuur
            # Iedere rij: <tr> ... <th scope="row">N</th> ... title="Team">
            rows = re.findall(
                r'scope="row"[^>]*>(\d+)</th>.*?title="([^"(]+)"',
                html, re.S
            )
            for pos_str, team_raw in rows:
                pos = int(pos_str)
                team = team_raw.strip()
                if team not in teams:  # eerste keer = juiste positie
                    teams[team] = pos
                if pos > 24: break  # max 24 teams

            if teams:
                standings[league_key] = teams
                print(f"  → {league_key}: {len(teams)} teams")
            else:
                print(f"  → {league_key}: geen teams gevonden (skip)")
        except Exception as e:
            print(f"  → {league_key}: fout ({e})")

    return standings


# ── Stap 3: Tags berekenen op basis van positie ─────────────────────────────
def apply_tags(matches, standings):
    print("Stap 3: Tags toepassen...")
    tags_config = CONFIG_TAGS

    for m in matches:
        key = m['leagueKey']
        league_tags = tags_config.get(key, {})
        league_standings = standings.get(key, {})

        for side in ('H', 'A'):
            team = m['home'] if side == 'H' else m['away']

            # Jong-teams in KKD nooit promotiegerechtigd
            if key == 'kkd' and team in JONG_TEAMS:
                m[f'stake{side}'] = 'mid'
                m[f'r{side}'] = None
                continue

            pos = league_standings.get(team)
            m[f'r{side}'] = pos

            if pos:
                tag = league_tags.get(str(pos), 'mid')
                m[f'stake{side}'] = tag
            else:
                m[f'stake{side}'] = 'mid'

    tagged = sum(1 for m in matches
                 if m['stakeH'] != 'mid' or m['stakeA'] != 'mid')
    ranked = sum(1 for m in matches if m.get('rH') or m.get('rA'))
    print(f"  → {tagged}/{len(matches)} wedstrijden met tags, "
          f"{ranked}/{len(matches)} met rangpositie")
    return matches


# ── Stap 4: HTML genereren ───────────────────────────────────────────────────
def write_html(matches):
    now_dt = datetime.datetime.now()
    NL_DAYS = ['ma','di','wo','do','vr','za','zo']
    NL_MONTHS = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec']
    now = f"{NL_DAYS[now_dt.weekday()]} {now_dt.day} {NL_MONTHS[now_dt.month-1]} {now_dt.strftime('%H:%M')}"
    matches_json = json.dumps(matches, ensure_ascii=False)

    # Vervang MATCHES en tijdstempel in template
    html = re.sub(
        r'let MATCHES = \[.*?\];',
        f'let MATCHES = {matches_json};',
        TEMPLATE, flags=re.S
    )
    html = re.sub(
        r"textContent='Speelschema bijgewerkt: \d{2}:\d{2}'",
        f"textContent='Speelschema bijgewerkt: {now}'",
        html
    )

    out = ROOT / 'nl/index.html'
    if not DRY_RUN:
        out.write_text(html)
        print(f"Stap 4: nl/index.html geschreven ({now})")
    else:
        print(f"Stap 4: [dry-run] zou schrijven naar {out} ({now})")

    return html


# ── Main ─────────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    print(f"=== games2watch update {datetime.datetime.now():%Y-%m-%d %H:%M} ===")
    if DRY_RUN:
        print("[DRY RUN]")

    matches   = fetch_schedule()
    standings = fetch_standings()
    matches   = apply_tags(matches, standings)
    write_html(matches)

    # Sla ook ruwe data op als cache
    if not DRY_RUN:
        (ROOT / 'data/schedule.json').write_text(
            json.dumps(matches, ensure_ascii=False, indent=2))
        (ROOT / 'data/standings.json').write_text(
            json.dumps(standings, ensure_ascii=False, indent=2))
        print("Cache opgeslagen in data/")

    print("=== Klaar ===")
