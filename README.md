# games2watch — dagelijkse update pipeline

## Architectuur

```
update.py          ← enige script dat je dagelijks draait
│
├── config/
│   ├── league-tags.json   ← HARDE DATABASE: positie → tag per competitie
│   └── channels.json      ← HARDE DATABASE: kanaalnaam → gratis/betaald/cls
│
├── data/                  ← cache (gegenereerd, niet handmatig aanpassen)
│   ├── schedule.json      ← ruwe wedstrijden van iservoetbalvanavond.nl
│   └── standings.json     ← standen per competitie van Wikipedia
│
└── nl/index.html          ← OUTPUT: wordt dagelijks overschreven
```

## Dagelijkse workflow

```bash
cd /path/to/games2watch
python3 update.py
# → haalt schema op van iservoetbalvanavond.nl
# → haalt standen op van Wikipedia per competitie
# → berekent rangpositie + tag per team op basis van league-tags.json
# → schrijft nl/index.html
# → commit + push naar GitHub → Vercel deployt automatisch
```

## Tags aanpassen

Bewerk `config/league-tags.json`. Format:
```json
"pl": {
  "1": "champ",        ← positie 1 = kampioen
  "2": "champ",
  "3": "cl-direct",
  "18": "rel-playoff",
  "19": "rel-direct",
  "20": "rel-direct"
}
```

Beschikbare tags: `champ`, `cl-direct`, `cl-pre`, `el-direct`, `el-pre`, `conf`, `mid`, `rel-playoff`, `rel-direct`

## Gratis kanalen aanpassen

Bewerk `config/channels.json`. Voeg toe of zet `free: true/false`.

## Competities toevoegen/verwijderen

In `update.py`, pas `COMP_MAP` en `WANTED` aan.
