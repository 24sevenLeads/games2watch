# games2watch.eu

Europese voetbal TV-gids voor Nederland.

## Stack
- Frontend: vanilla HTML/CSS/JS op Vercel
- Wedstrijddata: football-data.org (gratis API)
- TV-info: iservoetbalvanavond.nl (live scrape)

## Environment variables (Vercel)
- `FOOTBALL_DATA_KEY` — API key van football-data.org

## Bestanden
- `index.html` — redirect naar /nl
- `nl/index.html` — Nederlandse frontend
- `api/matches.js` — Vercel serverless function
- `vercel.json` — Vercel routing config
