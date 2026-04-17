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
    req = Request(url, headers={'User-Agent': 'Mozilla/5.0 games2watch/1.0'})
    with urlopen(req, timeout=20) as r:
        return r.read().decode('utf-8', errors='replace')


def day_label(d):
    days   = ['Zo','Ma','Di','Wo','Do','Vr','Za']
    months = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec']
    return f"{days[d.isoweekday() % 7]} {d.day} {months[d.month-1]}"


def channel_info(raw):
    ch = CONFIG_CHANNELS['channels']
    if raw in ch:
        return ch[raw]
    for key, val in ch.items():
        if key.lower() == raw.lower():
            return val
    # Gedeeltelijke match
    for key, val in ch.items():
        if key.lower() in raw.lower() or raw.lower() in key.lower():
            return val
    return {'cls': 'other', 'free': False, 'label': raw}


# ── Stap 1: Speelschema ─────────────────────────────────────────────────────
def fetch_schedule():
    print("Stap 1: Speelschema ophalen...")
    html = fetch('https://www.iservoetbalvanavond.nl')

    today = datetime.date.today()
    NL_MONTHS = {
        'januari':1,'februari':2,'maart':3,'april':4,'mei':5,'juni':6,
        'juli':7,'augustus':8,'september':9,'oktober':10,'november':11,'december':12
    }

    def parse_date(header):
        h = header.lower().strip()
        if 'vandaag' in h: return today
        if 'morgen'  in h: return today + datetime.timedelta(days=1)
        m = re.search(r'(\d+)\s+(\w+)', h)
        if m:
            day_num   = int(m.group(1))
            month_num = NL_MONTHS.get(m.group(2))
            if month_num:
                year = today.year
                d = datetime.date(year, month_num, day_num)
                if d < today - datetime.timedelta(days=1):
                    d = datetime.date(year + 1, month_num, day_num)
                return d
        return None

    skip_words = ['youth','u19','u21','vrouwen','dames','women',
                  'wk kwalificatie','league two','football league two']

    matches = []
    day_blocks = re.split(r'\n(?=## )', html)

    for block in day_blocks:
        header_m = re.match(r'## (.+)', block)
        if not header_m:
            continue
        match_date = parse_date(header_m.group(1))
        if not match_date:
            continue

        # Splits op tijdblokken
        time_blocks = re.split(r'\n(?=\d{2}:\d{2}\n)', block)

        for tb in time_blocks:
            lines = tb.strip().splitlines()
            if not lines:
                continue

            # Eerste regel = tijd
            time_m = re.match(r'^(\d{2}:\d{2})$', lines[0].strip())
            if not time_m:
                continue
            time_str = time_m.group(1)

            # Eerste niet-lege regel na tijd = competitienaam
            comp_name = ''
            for l in lines[1:]:
                if l.strip() and not l.strip().startswith('|'):
                    comp_name = l.strip()
                    break

            if comp_name not in COMP_MAP:
                continue
            if any(w in comp_name.lower() for w in skip_words):
                continue

            key, flag, comp_label = COMP_MAP[comp_name]

            # Tabelrijen
            table_rows = [l for l in lines
                          if l.strip().startswith('|') and '---' not in l]

            i = 0
            while i + 1 < len(table_rows):
                row1 = table_rows[i]
                row2 = table_rows[i + 1]

                def get_team(row):
                    # Link met title attribuut: [Naam](url "Naam")
                    m = re.search(r'\[([^\]]+)\]\([^)]*"[^"]*"\)', row)
                    if m: return m.group(1)
                    # Gewone link: [Naam](url)
                    m2 = re.search(r'\[([^\]]+)\]\(https?://[^)]+\)', row)
                    return m2.group(1) if m2 else None

                def get_channel(row):
                    cells = [c.strip() for c in row.split('|') if c.strip()]
                    if not cells: return '?'
                    last = cells[-1]
                    # Link: [Kanaal](url)
                    m = re.search(r'\[([^\]]+)\]', last)
                    if m: return m.group(1)
                    # Meerdere kanalen (neem eerste)
                    parts = re.split(r'\s{2,}', last)
                    return parts[0].strip() if parts else last

                home = get_team(row1)
                away = get_team(row2)

                if not home or not away:
                    i += 2
                    continue

                ch_raw = get_channel(row1)
                if not ch_raw or ch_raw in ['-', '']:
                    ch_raw = get_channel(row2)

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
                    'legScore':  None,
                })
                i += 2

    matches.sort(key=lambda x: x['sk'])
    print(f"  → {len(matches)} wedstrijden gevonden")
    for m in matches[:3]:
        print(f"     {m['date']} {m['time']} {m['home']} - {m['away']} [{m['tv']['label']}]")
    return matches


# ── Stap 2: Standen ─────────────────────────────────────────────────────────
def fetch_standings():
    print("Stap 2: Standen ophalen...")
    standings = {}

    for league_key, url in STANDINGS_URLS.items():
        try:
            html = fetch(url)

            # Methode 1: wikitabel scope="row" patroon
            teams = {}
            rows = re.findall(
                r'scope="row"[^>]*>\s*(\d+)\s*</th>(.*?)</tr>',
                html, re.S
            )
            for pos_str, row_html in rows:
                pos = int(pos_str)
                if pos > 24: break
                # Zoek teamnaam in title attribuut van link
                tm = re.search(r'title="([^"(]+?)(?:\s*\(|")', row_html)
                if tm:
                    team = tm.group(1).strip()
                    if team not in teams:
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
        key          = m['leagueKey']
        league_tags  = CONFIG_TAGS.get(key, {})
        league_stand = standings.get(key, {})

        for side in ('H', 'A'):
            team = m['home'] if side == 'H' else m['away']

            if key == 'kkd' and team in JONG_TEAMS:
                m[f'stake{side}'] = 'mid'
                m[f'r{side}']     = None
                continue

            pos = league_stand.get(team)
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
