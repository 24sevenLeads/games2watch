// api/matches.js — NOODVERSIE
// Haalt data rechtstreeks van iservoetbalvanavond.nl
// Morgen terugzetten naar football-data.org versie

const TV_SOURCE = 'https://www.iservoetbalvanavond.nl';

const LEAGUE_MAP = {
  'premier league':     { key: 'pl', name: 'Premier League',  flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
  'eredivisie':         { key: 'ed', name: 'Eredivisie',       flag: '🇳🇱' },
  'bundesliga':         { key: 'bl', name: 'Bundesliga',       flag: '🇩🇪' },
  'primera división':   { key: 'll', name: 'La Liga',          flag: '🇪🇸' },
  'la liga':            { key: 'll', name: 'La Liga',          flag: '🇪🇸' },
  'serie a':            { key: 'sa', name: 'Serie A',          flag: '🇮🇹' },
  'ligue 1':            { key: 'l1', name: 'Ligue 1',          flag: '🇫🇷' },
  'champions league':   { key: 'cl', name: 'Champions League', flag: '🏆' },
  'europa league':      { key: 'el', name: 'Europa League',    flag: '🏆' },
  'conference league':  { key: 'conf', name: 'Conference League', flag: '🏆' },
  'uefa conference league': { key: 'conf', name: 'Conference League', flag: '🏆' },
  'uefa champions league':  { key: 'cl', name: 'Champions League', flag: '🏆' },
  'uefa europa league':     { key: 'el', name: 'Europa League', flag: '🏆' },
};

function detectLeague(comp) {
  const c = (comp || '').toLowerCase();
  for (const [k, v] of Object.entries(LEAGUE_MAP)) {
    if (c.includes(k)) return v;
  }
  return null;
}

function normalizeChannel(raw) {
  if (!raw) return { label: '?', cls: 'other', free: false };
  const name  = raw.trim().replace(/\s+/g, ' ');
  const lower = name.toLowerCase();
  if (lower.startsWith('espn')) {
    const num = parseInt(name.replace(/\D/g, '')) || 1;
    return { label: name, cls: 'espn', free: num <= 1 };
  }
  if (lower.includes('ziggo'))   return { label: name, cls: 'ziggo',   free: false };
  if (lower.includes('viaplay')) return { label: name, cls: 'viaplay', free: lower.includes('viaplay tv') };
  if (lower.includes('prime'))   return { label: 'Prime Video', cls: 'prime', free: false };
  if (lower.startsWith('npo'))   return { label: name, cls: 'npo', free: true };
  if (lower.startsWith('rtl'))   return { label: name, cls: 'npo', free: true };
  if (lower.includes('disney'))  return { label: 'Disney+', cls: 'other', free: false };
  return { label: name, cls: 'other', free: false };
}

function dutchDayLabel(dayHeader) {
  // "Vandaag" → "Vandaag", "Morgen" → "Morgen", "Woensdag 15 april" → "Wo 15 apr"
  const h = dayHeader.trim();
  if (h.toLowerCase() === 'vandaag') {
    const d = new Date();
    const days   = ['Zo','Ma','Di','Wo','Do','Vr','Za'];
    const months = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'];
    return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
  }
  if (h.toLowerCase() === 'morgen') {
    const d = new Date(); d.setDate(d.getDate() + 1);
    const days   = ['Zo','Ma','Di','Wo','Do','Vr','Za'];
    const months = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'];
    return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
  }
  // "Woensdag 15 april" → "Wo 15 apr"
  const parts = h.split(' ');
  if (parts.length >= 3) {
    const dagMap = { maandag:'Ma', dinsdag:'Di', woensdag:'Wo', donderdag:'Do', vrijdag:'Vr', zaterdag:'Za', zondag:'Zo' };
    const maandMap = { januari:'jan', februari:'feb', maart:'mrt', april:'apr', mei:'mei', juni:'jun', juli:'jul', augustus:'aug', september:'sep', oktober:'okt', november:'nov', december:'dec' };
    const dag   = dagMap[parts[0].toLowerCase()] || parts[0].substring(0,2);
    const datum = parts[1];
    const maand = maandMap[parts[2].toLowerCase()] || parts[2].substring(0,3);
    return `${dag} ${datum} ${maand}`;
  }
  return h;
}

async function scrapeMatches() {
  const res = await fetch(TV_SOURCE, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
  });
  if (!res.ok) throw new Error(`Bron niet bereikbaar: ${res.status}`);
  const html = await res.text();

  // Converteer HTML naar leesbare structuur
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<a[^>]*href="[^"]*"[^>]*>\s*([^<]+?)\s*<\/a>/gi, '$1')
    .replace(/<h2[^>]*>/gi, '\n__DAY__')
    .replace(/<\/h2>/gi, '\n')
    .replace(/<tr[^>]*>/gi, '\n__ROW__')
    .replace(/<td[^>]*>/gi, '__TD__')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&#\d+;/g, '');

  const matches   = [];
  const COMP_KEYS = Object.keys(LEAGUE_MAP);

  let currentDay  = 'Vandaag';
  let currentTime = null;
  let currentComp = null;

  for (const line of text.split('\n')) {
    const l = line.trim();
    if (!l) continue;

    // Dagheader
    if (l.startsWith('__DAY__')) {
      currentDay  = l.replace('__DAY__', '').trim();
      currentTime = null;
      currentComp = null;
      continue;
    }

    // Tijdstip
    if (/^\d{2}:\d{2}$/.test(l)) {
      currentTime = l;
      continue;
    }

    // Competitienaam
    if (!l.startsWith('__ROW__') && COMP_KEYS.some(k => l.toLowerCase().includes(k))) {
      currentComp = l.trim();
      continue;
    }

    // Wedstrijdrij
    if (l.startsWith('__ROW__') && currentTime) {
      const cells = l.replace('__ROW__', '').split('__TD__')
        .map(c => c.replace(/\s+/g, ' ').trim())
        .filter(c => c && !c.includes('Logo') && !/^[\-\s]+$/.test(c));

      let home = null, away = null, channel = null;

      for (const cell of cells) {
        const parts = cell.split(/\s{2,}/).map(p => p.trim()).filter(p => p.length > 1);
        if (parts.length >= 2 && !home) {
          home = parts[0];
          away = parts[1];
          if (parts.length > 2) channel = parts[parts.length - 1];
        } else if (home && !channel && cell.length < 35) {
          channel = cell.split(/\s{2,}/)[0].trim();
        }
      }

      if (!home || !away || home === away) continue;

      const league = detectLeague(currentComp);
      if (!league) continue; // Alleen bekende competities

      matches.push({
        sk:        `${currentDay}_${currentTime}`,
        day:       dutchDayLabel(currentDay),
        time:      currentTime,
        comp:      league.name,
        leagueKey: league.key,
        flag:      league.flag,
        home, away,
        rH: null, rA: null,
        stakeH: 'mid', stakeA: 'mid',
        tv: normalizeChannel(channel),
      });
    }
  }

  return matches;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    const matches = await scrapeMatches();

    if (matches.length > 0) {
      res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=1800');
    } else {
      res.setHeader('Cache-Control', 'no-store');
    }

    return res.status(200).json({
      source:     'iservoetbalvanavond.nl (noodversie)',
      fetched_at: new Date().toISOString(),
      count:      matches.length,
      matches,
    });

  } catch (err) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(500).json({
      source: 'error', error: err.message, count: 0, matches: [],
    });
  }
}
