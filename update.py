def fetch_bl2_standings():
    """Haal 2.Bundesliga stand op via OpenLigaDB."""
    try:
        data = json.loads(fetch('https://api.openligadb.de/getbltable/bl2/2025'))
        print(f"  -> bl2 OpenLigaDB: {len(data)} rijen, eerste keys: {list(data[0].keys())[:6] if data else []}")
        teams = {}
        for i, row in enumerate(data):
            # OpenLigaDB gebruikt hoofdletters: TeamName, ShortName
            name = (row.get('TeamName') or row.get('teamName') or
                    row.get('ShortName') or row.get('shortName') or '')
            if name:
                teams[name] = i + 1
        if teams:
            top = min(teams, key=teams.get)
            print(f"  -> bl2: {len(teams)} teams (#1: {top})")
        else:
            print(f"  -> bl2: geen teams, voorbeeld row: {json.dumps(data[0])[:200] if data else 'leeg'}")
        return teams
    except Exception as e:
        print(f"  -> bl2 fout: {e}")
        return {}


