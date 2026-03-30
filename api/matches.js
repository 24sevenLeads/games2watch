// api/matches.js
// Vercel serverless function
// Fetches upcoming fixtures from iservoetbalvanavond.nl and enriches with
// NL broadcaster info + per-club stake labels based on current standings.

const SOURCE_URL = 'https://www.iservoetbalvanavond.nl';

// ── NL BROADCASTER MAP ──
// Based on verified rights as of 2025/26 season
const TV_BY_LEAGUE = {
  eredivisie:        { label: 'ESPN',        cls: 'espn',    free: false },
  'premier league':  { label: 'Viaplay',     cls: 'viaplay', free: false },
  bundesliga:        { label: 'Viaplay',     cls: 'viaplay', free: false },
  'la liga':         { label: 'Ziggo Sport', cls: 'ziggo',   free: false },
  'serie a':         { label: 'Ziggo Sport', cls: 'ziggo',   free: false },
  'ligue 1':         { label: 'Viaplay',     cls: 'viaplay', free: false },
  'champions league':{ label: 'Ziggo Sport', cls: 'ziggo',   free: false },
  'europa league':   { label: 'Ziggo Sport', cls: 'ziggo',   free: false },
  'conference league':{ label: 'Ziggo Sport',cls: 'ziggo',   free: false },
  // Zaterdag middag PL → Prime Video (handled in frontend logic)
};

// Premier League zaterdag 13:00–16:00 → Prime Video
function resolveTV(compName, day, time) {
  const comp = compName.toLowerCase();
  const base = TV_BY_LEAGUE[comp];
  if (!base) return { label: compName, cls: 'other', free: false };

  // PL saturday afternoon exception
  if (comp === 'premier league') {
    const isSat = /zaterdag|saturday/i.test(day);
    const hour  = parseInt(time);
    if (isSat && hour >= 13 && hour < 16) {
      return { label: 'Prime Video', cls: 'prime', free: false };
    }
  }
  return base;
}

// ── STANDINGS (kept server-side, updated each deploy) ──
const STANDINGS = {
  pl: {'Arsenal FC':1,'Manchester City':2,'Manchester United':3,'Aston Villa':4,'Liverpool FC':5,'Chelsea FC':6,'Brentford FC':7,'Everton FC':8,'Fulham FC':9,'Brighton & Hove Albion':10,'Sunderland AFC':11,'Newcastle United':12,'AFC Bournemouth':13,'Crystal Palace':14,'Leeds United':15,'Nottingham Forest':16,'Tottenham Hotspur':17,'West Ham United':18,'Burnley FC':19,'Wolverhampton Wanderers':20},
  bl: {'Bayern Munich':1,'Borussia Dortmund':2,'VfB Stuttgart':3,'RB Leipzig':4,'TSG Hoffenheim':5,'Bayer Leverkusen':6,'Eintracht Frankfurt':7,'SC Freiburg':8,'Union Berlin':9,'FC Augsburg':10,'FSV Mainz':11,'Hamburger SV':12,'Borussia Monchengladbach':13,'Werder Bremen':14,'1. FC Cologne':15,'FC St. Pauli':16,'VFL Wolfsburg':17,'1. FC Heidenheim':18},
  ed: {'PSV':1,'Feyenoord':2,'NEC':3,'Ajax':4,'FC Twente':5,'AZ':6,'FC Utrecht':7,'sc Heerenveen':8,'Go Ahead Eagles':9,'Heracles Almelo':10,'FC Groningen':11,'Fortuna Sittard':12,'Sparta Rotterdam':13,'NAC Breda':14,'Excelsior Rotterdam':15,'FC Volendam':16,'Telstar':17,'PEC Zwolle':18},
  ll: {'Real Madrid':1,'FC Barcelona':2,'Atletico Madrid':3,'Athletic Bilbao':4,'Villarreal CF':5,'Real Sociedad':6,'Real Betis':7,'Celta Vigo':8,'Sevilla FC':9,'Getafe CF':10,'CA Osasuna':11,'Valencia CF':12,'Rayo Vallecano':13,'Girona FC':14,'RCD Mallorca':15,'Elche CF':16,'Deportivo Alaves':17,'Levante UD':18,'Espanyol':19,'Real Oviedo':20},
  sa: {'Inter Milano':1,'SSC Napoli':2,'Juventus Turin':3,'AC Milan':4,'Atalanta BC':5,'Lazio Rome':6,'AS Roma':7,'ACF Fiorentina':8,'Torino FC':9,'Bologna FC':10,'Udinese Calcio':11,'Como 1907':12,'US Lecce':13,'Hellas Verona':14,'Cagliari Calcio':15,'Parma Calcio':16,'US Cremonese':17,'Pisa SC':18,'Genoa CFC':19,'Sassuolo Calcio':20},
  l1: {'Paris Saint-Germain':1,'AS Monaco':2,'Olympique Marseille':3,'Lille OSC':4,'Olympique Lyon':5,'OGC Nice':6,'Racing Club De Lens':7,'Stade Rennais FC':8,'Strasbourg Alsace':9,'Stade Brest 29':10,'Toulouse FC':11,'Paris FC':12,'Le Havre AC':13,'FC Nantes':14,'Angers SCO':15,'AJ Auxerre':16,'FC Metz':17,'FC Lorient':18},
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
  if (!zones) return 'mid';
  const last = zones[zones.length - 1];
  if (rank >= (last.rDir || last.total - 1)) return 'rel-dir';
  if (rank >= (last.rPO  || last.total - 2)) return 'rel-po';
  for (const z of zones.slice(0, -1)) if (rank <= z.max) return z.key;
  return 'mid';
}

function detectLeagueKey(compName) {
  const c = compName.toLowerCase();
  if (c.includes('eredivisie'))         return 'ed';
  if (c.includes('premier league'))     return 'pl';
  if (c.includes('bundesliga'))         return 'bl';
  if (c.includes('la liga'))            return 'll';
  if (c.includes('serie a'))            return 'sa';
  if (c.includes('ligue 1'))            return 'l1';
  return null;
}

function parseMatches(text) {
  const matches = [];
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  let currentDay = 'Vandaag';
  let currentTime = null;
  let currentComp = null;

  for (const line of lines) {
    if (/^##\s/.test(line)) { currentDay = line.replace(/^##\s*/, ''); continue; }
    if (/^\d{2}:\d{2}$/.test(line)) { currentTime = line; continue; }

    // Match row: [Team A](url)  [Team B](url) | Broadcaster
    const m = line.match(/\[([^\]]+)\]\([^)]+\)\s+\[([^\]]+)\]\([^)]+\)\s*\|\s*([^|]+)/);
    if (m && currentTime) {
      const leagueKey = detectLeagueKey(currentComp || '');
      const stand = leagueKey ? (STANDINGS[leagueKey] || {}) : {};
      const home = m[1].trim(), away = m[2].trim();
      const rH = stand[home] || 9, rA = stand[away] || 9;
      const tv = resolveTV(currentComp || '', currentDay, currentTime);
      matches.push({
        day:     currentDay,
        time:    currentTime,
        comp:    currentComp || '',
        leagueKey,
        home, away, rH, rA,
        stakeH:  leagueKey ? clubStake(leagueKey, rH) : 'mid',
        stakeA:  leagueKey ? clubStake(leagueKey, rA) : 'mid',
        tv,
      });
    }

    // Competition label between time and teams
    if (currentTime && !/^\|/.test(line) && line.length > 3 && line.length < 60) {
      const knownComps = ['eredivisie','premier league','bundesliga','la liga','serie a','ligue 1','champions league','europa league','conference league'];
      if (knownComps.some(c => line.toLowerCase().includes(c))) {
        currentComp = line.replace(/^\|+\s*/, '').trim();
      }
    }
  }
  return matches;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate');

  try {
    const response = await fetch(SOURCE_URL, {
      headers: {
        'User-Agent':      'Mozilla/5.0 (compatible; Games2WatchBot/1.0)',
        'Accept':          'text/html,application/xhtml+xml',
        'Accept-Language': 'nl-NL,nl;q=0.9',
      },
    });

    if (!response.ok) throw new Error(`Source returned ${response.status}`);

    const html = await response.text();

    // Strip scripts/styles, convert links + table cells to readable text
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi, '[$2]($1)')
      .replace(/<td[^>]*>/gi, ' | ')
      .replace(/<tr[^>]*>/gi, '\n')
      .replace(/<h2[^>]*>/gi, '\n## ')
      .replace(/<h3[^>]*>/gi, '\n### ')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&#\d+;/g, '')
      .replace(/[ \t]{3,}/g, '  ')
      .trim();

    const matches = parseMatches(text).filter(m => m.leagueKey); // only known leagues

    res.status(200).json({
      source:     'iservoetbalvanavond.nl',
      fetched_at: new Date().toISOString(),
      count:      matches.length,
      matches,
    });

  } catch (err) {
    console.error('Fetch error:', err.message);
    // Return empty so frontend falls back to static data
    res.status(200).json({
      source:     'fallback',
      fetched_at: new Date().toISOString(),
      count:      0,
      matches:    [],
      error:      err.message,
    });
  }
}
