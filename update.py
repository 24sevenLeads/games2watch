def fetch_bl2_standings():
    """Haal 2.Bundesliga stand op via OpenLigaDB."""
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
            # Print alle teamnamen voor alias verificatie
            print(f"  -> bl2: {len(teams)} teams (#1: {top})")
            print(f"  -> bl2 namen: {list(teams.keys())}")
        else:
            # Dump eerste rij om structuur te zien
            print(f"  -> bl2: 0 teams, row[0]: {json.dumps(data[0] if data else {})[:300]}")
        return teams
    except Exception as e:
        print(f"  -> bl2 fout: {e}")
        return {}


