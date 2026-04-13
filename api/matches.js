// api/matches.js — v7
// Combineert football-data.org (wedstrijden) met iservoetbalvanavond.nl (TV-info)
// Alles in één functie — geen interne API calls

const BASE_URL    = 'https://api.football-data.org/v4';
const TV_SOURCE   = 'https://www.iservoetbalvanavond.nl';

const LEAGUES = [
  { key: 'pl',  code: 'PL',  name: 'Premier League',  flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
  { key: 'ed',  code: 'DED', name: 'Eredivisie',       flag: '🇳🇱' },
  { key: 'bl',  code: 'BL1', name: 'Bundesliga',       flag: '🇩🇪' },
  { key: 'll',  code: 'PD',  name: 'La Liga',          flag: '🇪🇸' },
  { key: 'sa',  code: 'SA',  name: 'Serie A',          flag: '🇮🇹' },
  { key: 'l1',  code: 'FL1', name: 'Ligue 1',          flag: '🇫🇷' },
  { key: 'cl',  code: 'CL',  name: 'Champions League', flag: '🏆' },
];

// ── TV NORMALISATIE ──
function normalizeChannel(raw) {
  if (!raw) return null;
  const name  = raw.trim().replace(/\s+/g, ' ');
  const lower = name.toLowerCase();
  if (lower.startsWith('espn')) {
    const num = parseInt(name.replace(/\D/g, '')) || 1;
    return { label: name, cls: 'espn', free: num <= 1 };
  }
  if (lower.includes('ziggo'))   return { label: name,          cls: 'ziggo',   free: false };
  if (lower.includes('viaplay')) {
    const isTV = lower.includes('viaplay tv');
    return { label: name,          cls: 'viaplay', free: isTV };
  }
  if (lower.includes('prime'))   return { label: 'Prime Video', cls: 'prime',   free: false };
  if (lower.startsWith('npo'))   return { label: name,          cls: 'npo',     free: true  };
  if (lower.startsWith('rtl'))   return { label: name,          cls: 'npo',     free: true  };
  if (lower.includes('disney'))  return { label: 'Disney+',     cls: 'other',   free: false };
  return { label: name, cls: 'other', free: false };
}

// ── TV SCRAPER ──
// Haalt zenderinfo op van iservoetbalvanavond.nl
// Retourneert lookup: { "teamA|teamB": { label, cls, free } }
async function fetchTVLookup() {
  const res = await fetch(TV_SOURCE, {
    headers: {
      'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'nl-NL,nl;q=0.9',
    },
  });
  if (!res.ok) throw new Error(`TV source: ${res.status}`);
  const html = await res.text();

  const lookup = {};

  // Strip scripts/styles
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');

  // Bewaar ankertekst
  text = text.replace(/<a[^>]*>\s*([^<]+?)\s*<\/a>/gi, '$1');

  // Markeer structuur
  text = text
    .replace(/<tr[^>]*>/gi, '\n__TR__')
    .replace(/<td[^>]*>/gi, '__TD__')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&#\d+;/g, '');

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  for (const line of lines) {
    if (!line.startsWith('__TR__')) continue;

    const cells = line
      .replace('__TR__', '')
      .split('__TD__')
      .map(c => c.replace(/\s+/g, ' ').trim())
      .filter(c => c.length > 0 && !c.includes('Logo') && !/^[\-\s\d]+$/.test(c));

    if (cells.length < 2) continue;

    // Zoek teamcel: bevat twee namen gescheiden door 2+ spaties
    let home = null, away = null, channel = null;

    for (const cell of cells) {
      const parts = cell.split(/\s{2,}/).map(p => p.trim()).filter(p => p.length > 1);
      if (parts.length >= 2 && !home) {
        home = parts[0];
        away = parts[1];
        if (parts.length > 2) channel = parts[parts.length - 1];
      } else if (home && !channel && cell.length < 30) {
        // Pak eerste zender als er meerdere zijn (bijv "Viaplay TV  Viaplay")
        channel = cell.split(/\s{2,}/)[0].trim();
      }
    }

    if (home && away && channel) {
      const tv = normalizeChannel(channel);
      if (tv) {
        lookup[`${home.toLowerCase()}|${away.toLowerCase()}`] = tv;
      }
    }
  }

  return lookup;
}

// ── TV FALLBACK PER COMPETITIE ──
function defaultTV(leagueKey, dateStr, timeStr) {
  const hour = parseInt((timeStr || '00:00').split(':')[0]);
  const dow  = new Date((dateStr || '2026-01-01') + 'T12:00:00Z').getDay();
  if (leagueKey === 'pl') {
    if (dow === 6 && hour >= 13 && hour < 16)
      return { label: 'Prime Video', cls: 'prime', free: false };
    return { label: 'Viaplay', cls: 'viaplay', free: false };
  }
  const map = {
    bl:  { label: 'Viaplay',     cls: 'viaplay', free: false },
    ed:  { label: 'ESPN',        cls: 'espn',    free: false },
    'll': { label: 'Ziggo Sport', cls: 'ziggo',   free: false },
    sa:  { label: 'Ziggo Sport', cls: 'ziggo',   free: false },
    l1:  { label: 'Viaplay',     cls: 'viaplay', free: false },
    cl:  { label: 'Ziggo Sport', cls: 'ziggo',   free: false },
  };
  return map[leagueKey] || { label: '?', cls: 'other', free: false };
}

// ── TV LOOKUP ──
function findTV(home, away, leagueKey, dateStr, timeStr, tvLookup) {
  const h = home.toLowerCase().trim();
  const a = away.toLowerCase().trim();

  // Exacte match
  if (tvLookup[`${h}|${a}`]) return tvLookup[`${h}|${a}`];

  // Fuzzy: eerste woord van elk team
  const hw = h.split(/\s+/)[0];
  const aw = a.split(/\s+/)[0];
  for (const [k, v] of Object.entries(tvLookup)) {
    const [kh, ka] = k.split('|');
    if (kh && ka && kh.includes(hw) && ka.includes(aw)) return v;
  }

  return defaultTV(leagueKey, dateStr, timeStr);
}

// ── STANDEN ──
const STANDINGS = {
  pl: {'Arsenal':1,'Arsenal FC':1,'Manchester City':2,'Man City':2,'Manchester United':3,'Man United':3,'Aston Villa':4,'Liverpool':5,'Liverpool FC':5,'Chelsea':6,'Chelsea FC':6,'Brentford':7,'Brentford FC':7,'Everton':8,'Everton FC':8,'Fulham':9,'Fulham FC':9,'Brighton & Hove Albion':10,'Brighton':10,'Sunderland':11,'Sunderland AFC':11,'Newcastle United':12,'Newcastle':12,'AFC Bournemouth':13,'Bournemouth':13,'Crystal Palace':14,'Leeds United':15,'Leeds':15,'Nottingham Forest':16,'Tottenham Hotspur':17,'Tottenham':17,'West Ham United':18,'West Ham':18,'Burnley':19,'Burnley FC':19,'Wolverhampton Wanderers':20,'Wolves':20},
  bl: {'Bayern Munich':1,'Bayern München':1,'FC Bayern München':1,'Borussia Dortmund':2,'VfB Stuttgart':3,'RB Leipzig':4,'TSG Hoffenheim':5,'Hoffenheim':5,'Bayer Leverkusen':6,'Leverkusen':6,'Eintracht Frankfurt':7,'SC Freiburg':8,'1. FC Union Berlin':9,'Union Berlin':9,'FC Augsburg':10,'Augsburg':10,'1. FSV Mainz 05':11,'Mainz':11,'Hamburger SV':12,'Borussia Mönchengladbach':13,'SV Werder Bremen':14,'Werder Bremen':14,'1. FC Köln':15,'FC Köln':15,'FC St. Pauli':16,'St. Pauli':16,'St Pauli':16,'VfL Wolfsburg':17,'Wolfsburg':17,'1. FC Heidenheim 1846':18,'Heidenheim':18},
  ed: {'PSV':1,'PSV Eindhoven':1,'Feyenoord':2,'NEC':3,'NEC Nijmegen':3,'Ajax':4,'AFC Ajax':4,'FC Twente':5,'Twente':5,'AZ':6,'AZ Alkmaar':6,'FC Utrecht':7,'Utrecht':7,'sc Heerenveen':8,'SC Heerenveen':8,'Heerenveen':8,'Go Ahead Eagles':9,'Heracles Almelo':10,'Heracles':10,'FC Groningen':11,'Groningen':11,'Fortuna Sittard':12,'Sparta Rotterdam':13,'NAC Breda':14,'NAC':14,'Excelsior Rotterdam':15,'FC Volendam':16,'Volendam':16,'Telstar':17,'SC Telstar':17,'PEC Zwolle':18},
  ll: {'Real Madrid CF':1,'Real Madrid':1,'FC Barcelona':2,'Barcelona':2,'Club Atlético de Madrid':3,'Atletico Madrid':3,'Athletic Club':4,'Villarreal CF':5,'Villarreal':5,'Real Sociedad':6,'Real Betis Balompié':7,'Real Betis':7,'RC Celta de Vigo':8,'Sevilla FC':9,'Sevilla':9,'Getafe CF':10,'CA Osasuna':11,'Valencia CF':12,'Rayo Vallecano':13,'Girona FC':14,'Girona':14,'RCD Mallorca':15,'Mallorca':15,'Deportivo Alavés':17,'Levante UD':18,'RCD Espanyol':19,'Real Oviedo':20},
  sa: {'Inter Milan':1,'FC Internazionale Milano':1,'Inter':1,'SSC Napoli':2,'Napoli':2,'Juventus FC':3,'Juventus':3,'AC Milan':4,'Milan':4,'Atalanta BC':5,'Atalanta':5,'SS Lazio':6,'Lazio':6,'AS Roma':7,'Roma':7,'ACF Fiorentina':8,'Fiorentina':8,'Torino FC':9,'Bologna FC 1909':10,'Bologna':10,'Udinese Calcio':11,'Como 1907':12,'US Lecce':13,'Hellas Verona FC':14,'Cagliari Calcio':15,'Parma Calcio 1913':16,'US Cremonese':17,'Pisa SC':18,'Genoa CFC':19,'US Sassuolo Calcio':20},
  l1: {'Paris Saint-Germain FC':1,'PSG':1,'AS Monaco FC':2,'Monaco':2,'Olympique de Marseille':3,'LOSC Lille':4,'Lille':4,'Olympique Lyonnais':5,'Lyon':5,'OGC Nice':6,'RC Lens':7,'Lens':7,'Stade Rennais FC 1901':8,'RC Strasbourg Alsace':9,'Stade Brestois 29':10,'Toulouse FC':11,'Paris FC':12,'Le Havre AC':13,'FC Nantes':14,'Angers SCO':15,'AJ Auxerre':16,'FC Metz':17,'FC Lorient':18},
};

const STAKE_ZONES = {
  pl:[{max:1,key:'champ'},{max:4,key:'cl-direct'},{max:6,key:'cl-pre'},{max:7,key:'el-direct'},{max:8,key:'el-pre'},{max:10,key:'conf'},{rPO:17,rDir:18,total:20}],
  bl:[{max:1,key:'champ'},{max:4,key:'cl-direct'},{max:5,key:'el-direct'},{max:6,key:'el-pre'},{max:7,key:'conf'},{rPO:16,rDir:17,total:18}],
  ll:[{max:1,key:'champ'},{max:4,key:'cl-direct'},{max:6,key:'el-direct'},{max:7,key:'conf'},{rPO:18,rDir:19,total:20}],
  sa:[{max:1,key:'champ'},{max:4,key:'cl-direct'},{max:6,key:'el-direct'},{max:7,key:'conf'},{rPO:18,rDir:19,total:20}],
  l1:[{max:1,key:'champ'},{max:3,key:'cl-direct'},{max:4,key:'cl-pre'},{max:6,key:'el-direct'},{rPO:16,rDir:17,total:18}],
  ed:[{max:1,key:'champ'},{max:3,key:'cl-pre'},{max:5,key:'el-pre'},{max:7,key:'conf'},{rPO:16,rDir:17,total:18}],
};

function clubStake(leagueKey, rank) {
  const zones = STAKE_ZONES[leagueKey];
  if (!zones || !zones.length || !rank) return 'mid';
  const last = zones[zones.length - 1];
  if (rank >= (last.rDir || last.total - 1)) return 'rel-dir';
  if (rank >= (last.rPO  || last.total - 2)) return 'rel-po';
  for (const z of zones.slice(0, -1)) if (rank <= z.max) return z.key;
  return 'mid';
}

function toDateStr(d) { return d.toISOString().split('T')[0]; }

function dutchDayLabel(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  const days   = ['Zo','Ma','Di','Wo','Do','Vr','Za'];
  const months = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'];
  return `${days[d.getUTCDay()]} ${d.getUTCDate()} ${months[d.getUTCMonth()]}`;
}

async function fetchLeague(league, dateFrom, dateTo, apiKey) {
  const url = `${BASE_URL}/competitions/${league.code}/matches?dateFrom=${dateFrom}&dateTo=${dateTo}&status=SCHEDULED`;
  const res = await fetch(url, {
    headers: { 'X-Auth-Token': apiKey }
  });
  if (!res.ok) throw new Error(`football-data ${league.code}: ${res.status}`);
  const data = await res.json();
  return data.matches || [];
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  const apiKey = process.env.FOOTBALL_DATA_KEY;
  if (!apiKey) {
    return res.status(500).json({
      source: 'error',
      error: 'FOOTBALL_DATA_KEY niet ingesteld',
      count: 0, matches: [],
    });
  }

  const today  = new Date();
  const future = new Date();
  future.setDate(today.getDate() + 14);
  const dateFrom = toDateStr(today);
  const dateTo   = toDateStr(future);

  try {
    // Haal TV-info en wedstrijden parallel op
    const [tvLookup, ...leagueResults] = await Promise.allSettled([
      fetchTVLookup(),
      ...LEAGUES.map(l => fetchLeague(l, dateFrom, dateTo, apiKey)
        .then(events => ({ league: l, events }))
        .catch(err => { console.error(`[${l.key}]`, err.message); return { league: l, events: [] }; })
      )
    ]);

    const tv = tvLookup.status === 'fulfilled' ? tvLookup.value : {};
    console.log(`[matches.js] TV lookup: ${Object.keys(tv).length} entries`);

    const matches = [];

    for (const result of leagueResults) {
      if (result.status !== 'fulfilled') continue;
      const { league, events } = result.value;
      const stand = STANDINGS[league.key] || {};

      for (const ev of events) {
        const utcDate = new Date(ev.utcDate);
        const month   = utcDate.getUTCMonth() + 1;
        const offset  = (month >= 4 && month <= 10) ? 2 : 1;
        const local   = new Date(utcDate.getTime() + offset * 3600 * 1000);

        const dateStr = local.toISOString().split('T')[0];
        const timeStr = local.toTimeString().substring(0, 5);
        const home    = ev.homeTeam?.name || '';
        const away    = ev.awayTeam?.name || '';
        if (!home || !away) continue;

        const rH = stand[home] || null;
        const rA = stand[away] || null;

        matches.push({
          sk:        `${dateStr} ${timeStr}`,
          day:       dutchDayLabel(dateStr),
          time:      timeStr,
          date:      dateStr,
          comp:      league.name,
          leagueKey: league.key,
          flag:      league.flag,
          home, away, rH, rA,
          stakeH:    rH ? clubStake(league.key, rH) : 'mid',
          stakeA:    rA ? clubStake(league.key, rA) : 'mid',
          tv:        findTV(home, away, league.key, dateStr, timeStr, tv),
        });
      }
    }

    matches.sort((a, b) => a.sk.localeCompare(b.sk));

    res.status(200).json({
      source:     'football-data.org + iservoetbalvanavond.nl',
      fetched_at: new Date().toISOString(),
      count:      matches.length,
      matches,
    });

  } catch (err) {
    console.error('[matches.js] fatal:', err.message);
    res.status(500).json({
      source: 'error', error: err.message, count: 0, matches: [],
    });
  }
}
