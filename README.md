# games2watch.eu

Europese voetbal TV-gids voor Nederland. Toont aankomende wedstrijden voor de komende 14 dagen met inzetkleuren per club en TV-zenderinfo.

---

## Architectuur

### Hosting
- **Vercel** (gratis hobby plan) — serverless hosting + CDN
- **GitHub** — broncode, Vercel deployt automatisch bij elke push naar `main`
- **Domein** — `games2watch.eu` via United Domains, gekoppeld via A-record (`216.198.79.1`) en CNAME (`607b96e3cf033d2d.vercel-dns-017.com`)

### Bestanden
```
games2watch/
├── index.html          → redirect naar /nl
├── vercel.json         → cleanUrls + trailingSlash config
├── nl/
│   └── index.html      → volledige NL frontend (vanilla HTML/CSS/JS)
└── api/
    └── matches.js      → Vercel serverless function (Node.js ESM)
```

---

## Databronnen

### 1. Speelschema's — football-data.org
- **URL:** `https://api.football-data.org/v4/competitions/{code}/matches`
- **Authenticatie:** API key via HTTP header `X-Auth-Token`
- **Vercel env var:** `FOOTBALL_DATA_KEY`
- **Gratis plan:** 10 requests/minuut, top competities gratis voor altijd
- **Competitiecodes:** PL, DED, BL1, PD, SA, FL1, CL
- **Filter:** `dateFrom` t/m `dateTo` (vandaag + 14 dagen), `status=SCHEDULED`
- **Tijdzone:** API geeft UTC terug → wordt omgezet naar CEST (UTC+2 apr-okt) / CET (UTC+1)

### 2. Europa League & Conference League — iservoetbalvanavond.nl
- **URL:** `https://www.iservoetbalvanavond.nl/competities/europa-league` etc.
- **Methode:** HTML scraping
- **Wat we ophalen:** wedstrijden + TV-zender + heenwedstrijd score (voor KO-rondes)

### 3. TV-zenderinfo — iservoetbalvanavond.nl *(tijdelijk)*
- **URL:** `https://www.iservoetbalvanavond.nl`
- **Methode:** HTML scraping homepage
- **Wat we ophalen:** teamnamen + zendernaam per wedstrijd voor komende 2-3 dagen
- **Matching:** teamnamen via `NAME_MAP` vertaald naar football-data.org namen
- **Fallback:** als geen match → standaard zender per competitie (zonder gratis/betaald)
- **Cache:** 24 uur op Vercel CDN (`s-maxage=86400`)

**Gewenste verbetering: officiële bronnen per zender**
| Zender | Competities | Officiële bron |
|--------|------------|----------------|
| ESPN | Eredivisie | espn.nl/eredivisie (Next.js, moeilijk te scrapen) |
| Viaplay | Premier League, Bundesliga, Ligue 1 | viaplay.com (authenticatie vereist) |
| Ziggo Sport | La Liga, Serie A, CL | ziggo.nl (Next.js) |
| Prime Video | Premier League (za 13:30) | amazon.nl (geen publieke API) |

---

## Caching strategie
- Succesvolle response (count > 0) → `s-maxage=86400` (24 uur Vercel CDN cache)
- Lege of foutieve response → `no-store` (nooit cachen, anders zit je 24u vast)

## Rate limiting football-data.org
- Gratis plan: 10 calls/minuut
- Bij 429: response bevat `errors` array, matches blijft leeg, niet gecached
- Normaal gebruik: 7 calls/dag (eenmalig bij cache-miss), ruim binnen limiet

---

## Inzet-badges (ranglijst)
Standen worden hardcoded bijgehouden in `STANDINGS` object in `matches.js`.
Update aan begin van elk seizoen en na grote wijzigingen.

Zones per competitie in `STAKE_ZONES`:
- **champ** — Kampioenschap
- **cl-direct** — Champions League direct
- **cl-pre** — Champions League voorronde
- **el-direct** — Europa League direct
- **el-pre** — Europa League voorronde
- **conf** — Conference League
- **rel-po** — Degradatie play-off
- **rel-dir** — Directe degradatie

---

## To do / verbeteringen
- [ ] Officiële TV-bronnen per zender integreren (ESPN, Viaplay, Ziggo) voor exacte kanaalnummers en gratis/betaald verder vooruit dan 2-3 dagen
- [ ] Competitie-pagina's van iservoetbalvanavond.nl scrapen (bijv. `/competities/premier-league`) voor TV-info verder vooruit
- [ ] Standen automatisch ophalen via football-data.org API i.p.v. hardcoded bijhouden
- [ ] Seizoensupdate standen bij start nieuw seizoen (augustus)
