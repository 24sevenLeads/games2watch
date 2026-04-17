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


# ── Stap 2: Standen ─────────────────────────────────────────────────────────
def fetch_standings():
    print("Stap 2: Standen ophalen...")
    standings = {}

    for league_key, url in STANDINGS_URLS.items():
        try:
            html = fetch(url)
            teams = {}

            # Wikipedia raw HTML: standtabel bevat rijen als:
            # <tr>
<th scope="row">1</th>
<td>...</td>
<td><a href="/wiki/X" title="Club">Club</a>
            # Zoek alle <tr> blokken die een scope="row" positie bevatten
            tr_blocks = re.findall(r'<tr[^>]*>(.*?)</tr>', html, re.S)

            for tr in tr_blocks:
                # Positie
                pos_m = re.search(r'scope="row"[^>]*>\s*(\d+)\s*<', tr)
                if not pos_m:
                    continue
                pos = int(pos_m.group(1))
                if pos > 24:
                    break

                # Teamnaam: zoek <a> link met /wiki/ die NIET naar een persoon/stad linkt
                # Wikipedia teamlinks hebben title="Clubnaam F.C." of gewoon "Clubnaam"
                links = re.findall(r'href="/wiki/([^"#]+)"[^>]*title="([^"]+)"', tr)
                for href, title in links:
                    title = title.strip()
                    # Skip: disambiguation, personen, steden etc.
                    # Teamlinks hebben meestal geen haakjes in title
                    if '(' in title:
                        # Verwijder "(association football)" etc
                        clean = re.sub(r'\s*\([^)]+\)', '', title).strip()
                    else:
                        clean = title
                    # Skip lege, te korte, of cijfer-achtige titels
                    if clean and len(clean) > 2 and not clean.isdigit():
                        if clean not in teams:
                            teams[clean] = pos
                        break

            if teams:
                top = min(teams, key=teams.get)
                standings[league_key] = teams
                print(f"  → {league_key}: {len(teams)} teams (#1: {top})")
            else:
                # Debug: toon eerste tr met scope=row
                sample = next((t for t in tr_blocks if 'scope="row"' in t), '')
                print(f"  → {league_key}: geen teams — sample: {sample[:200]}")
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
