// api/matches.js — v6
// Gebruikt football-data.org (gratis, API key vereist)
// Haalt wedstrijden op voor de komende 14 dagen voor alle competities
// API key opgeslagen als FOOTBALL_DATA_KEY in Vercel environment variables

const BASE_URL = 'https://api.football-data.org/v4';

// Competities met hun football-data.org codes
const LEAGUES = [
  { key: 'pl',  code: 'PL',  name: 'Premier League', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
  { key: 'ed',  code: 'DED', name: 'Eredivisie',      flag: '🇳🇱' },
  { key: 'bl',  code: 'BL1', name: 'Bundesliga',      flag: '🇩🇪' },
  { key: 'll',  code: 'PD',  name: 'La Liga',         flag: '🇪🇸' },
  { key: 'sa',  code: 'SA',  name: 'Serie A',         flag: '🇮🇹' },
  { key: 'l1',  code: 'FL1', name: 'Ligue 1',         flag: '🇫🇷' },
  { key: 'cl',  code: 'CL',  name: 'Champions League',flag: '🏆' },
];

// NL TV-rechten per competitie (seizoen 2025/26)
function getTV(leagueKey, dateStr, timeStr) {
  const hour = timeStr ? parseInt(timeStr.split(':')[0]) : 0;
  const dow  = new Date(dateStr + 'T12:00:00Z').getDay(); // 0=zo, 6=za

  if (leagueKey === 'pl') {
    // Zaterdagmiddag 13:00-16:00 lokale tijd → Prime Video
    if (dow === 6 && hour >= 13 && hour < 16)
      return { label: 'Prime Video', cls: 'prime', free: false };
    return { label: 'Viaplay', cls: 'viaplay', free: false };
  }
  if (leagueKey === 'bl')  return { label: 'Viaplay',     cls: 'viaplay', free: false };
  if (leagueKey === 'ed')  return { label: 'ESPN',        cls: 'espn',    free: false };
  if (leagueKey === 'll')  return { label: 'Ziggo Sport', cls: 'ziggo',   free: false };
  if (leagueKey === 'sa')  return { label: 'Ziggo Sport', cls: 'ziggo',   free: false };
  if (leagueKey === 'l1')  return { label: 'Viaplay',     cls: 'viaplay', free: false };
  if (leagueKey === 'cl')  return { label: 'Ziggo Sport', cls: 'ziggo',   free: false };
  return { label: '?', cls: 'other', free: false };
}

// Standen (april 2026) — voor inzet-badges
const STANDINGS = {
  pl: {'Arsenal':1,'Arsenal FC':1,'Manchester City':2,'Man City':2,'Manchester United':3,'Man United':3,'Aston Villa':4,'Liverpool':5,'Liverpool FC':5,'Chelsea':6,'Chelsea FC':6,'Brentford':7,'Brentford FC':7,'Everton':8,'Everton FC':8,'Fulham':9,'Fulham FC':9,'Brighton & Hove Albion':10,'Brighton':10,'Sunderland':11,'Sunderland AFC':11,'Newcastle United':12,'Newcastle':12,'AFC Bournemouth':13,'Bournemouth':13,'Crystal Palace':14,'Leeds United':15,'Leeds':15,'Nottingham Forest':16,'Tottenham Hotspur':17,'Tottenham':17,'West Ham United':18,'West Ham':18,'Burnley':19,'Burnley FC':19,'Wolverhampton Wanderers':20,'Wolves':20},
  bl: {'Bayern Munich':1,'Bayern München':1,'FC Bayern München':1,'Borussia Dortmund':2,'BVB':2,'VfB Stuttgart':3,'Stuttgart':3,'RB Leipzig':4,'Leipzig':4,'TSG Hoffenheim':5,'Hoffenheim':5,'Bayer Leverkusen':6,'Leverkusen':6,'Eintracht Frankfurt':7,'Frankfurt':7,'SC Freiburg':8,'Freiburg':8,'1. FC Union Berlin':9,'Union Berlin':9,'FC Augsburg':10,'Augsburg':10,'1. FSV Mainz 05':11,'Mainz':11,'Hamburger SV':12,'Hamburg':12,'Borussia Mönchengladbach':13,'Mönchengladbach':13,'SV Werder Bremen':14,'Werder Bremen':14,'1. FC Köln':15,'FC Köln':15,'Köln':15,'FC St. Pauli':16,'St. Pauli':16,'St Pauli':16,'VfL Wolfsburg':17,'Wolfsburg':17,'1. FC Heidenheim 1846':18,'Heidenheim':18},
  ed: {'PSV':1,'PSV Eindhoven':1,'Feyenoord':2,'NEC':3,'NEC Nijmegen':3,'Ajax':4,'AFC Ajax':4,'FC Twente':5,'Twente':5,'AZ':6,'AZ Alkmaar':6,'FC Utrecht':7,'Utrecht':7,'sc Heerenveen':8,'SC Heerenveen':8,'Heerenveen':8,'Go Ahead Eagles':9,'Heracles Almelo':10,'Heracles':10,'FC Groningen':11,'Groningen':11,'Fortuna Sittard':12,'Sparta Rotterdam':13,'NAC Breda':14,'NAC':14,'Excelsior Rotterdam':15,'Excelsior':15,'FC Volendam':16,'Volendam':16,'Telstar':17,'SC Telstar':17,'PEC Zwolle':18},
  ll: {'Real Madrid CF':1,'Real Madrid':1,'FC Barcelona':2,'Barcelona':2,'Club Atlético de Madrid':3,'Atletico Madrid':3,'Athletic Club':4,'Athletic Bilbao':4,'Villarreal CF':5,'Villarreal':5,'Real Sociedad':6,'Real Betis Balompié':7,'Real Betis':7,'RC Celta de Vigo':8,'Celta Vigo':8,'Sevilla FC':9,'Sevilla':9,'Getafe CF':10,'Getafe':10,'CA Osasuna':11,'Osasuna':11,'Valencia CF':12,'Valencia':12,'Rayo Vallecano':13,'Girona FC':14,'Girona':14,'RCD Mallorca':15,'Mallorca':15,'Elche CF':16,'Elche':16,'Deportivo Alavés':17,'Alaves':17,'Levante UD':18,'Levante':18,'RCD Espanyol':19,'Espanyol':19,'Real Oviedo':20,'Oviedo':20},
  sa: {'Inter Milan':1,'FC Internazionale Milano':1,'Inter':1,'SSC Napoli':2,'Napoli':2,'Juventus FC':3,'Juventus':3,'AC Milan':4,'Milan':4,'Atalanta BC':5,'Atalanta':5,'SS Lazio':6,'Lazio':6,'AS Roma':7,'Roma':7,'ACF Fiorentina':8,'Fiorentina':8,'Torino FC':9,'Torino':9,'Bologna FC 1909':10,'Bologna':10,'Udinese Calcio':11,'Udinese':11,'Como 1907':12,'Como':12,'US Lecce':13,'Lecce':13,'Hellas Verona FC':14,'Verona':14,'Cagliari Calcio':15,'Cagliari':15,'Parma Calcio 1913':16,'Parma':16,'US Cremonese':17,'Cremonese':17,'Pisa SC':18,'Pisa':18,'Genoa CFC':19,'Genoa':19,'US Sassuolo Calcio':20,'Sassuolo':20},
  l1: {'Paris Saint-Germain FC':1,'PSG':1,'Paris Saint-Germain':1,'AS Monaco FC':2,'Monaco':2,'Olympique de Marseille':3,'Marseille':3,'LOSC Lille':4,'Lille':4,'Olympique Lyonnais':5,'Lyon':5,'OGC Nice':6,'Nice':6,'RC Lens':7,'Lens':7,'Stade Rennais FC 1901':8,'Rennes':8,'RC Strasbourg Alsace':9,'Strasbourg':9,'Stade Brestois 29':10,'Brest':10,'Toulouse FC':11,'Toulouse':11,'Paris FC':12,'Le Havre AC':13,'Le Havre':13,'FC Nantes':14,'Nantes':14,'Angers SCO':15,'Angers':15,'AJ Auxerre':16,'Auxerre':16,'FC Metz':17,'Metz':17,'FC Lorient':18,'Lorient':18},
};

const STAKE_ZONES = {
  pl:[{max:1,key:'champ'},{max:4,key:'cl-direct'},{max:6,key:'cl-pre'},{max:7,key:'el-direct'},{max:8,key:'el-pre'},{max:10,key:'conf'},{rPO:17,rDir:18,total:20}],
  bl:[{max:1,key:'champ'},{max:4,key:'cl-direct'},{max:5,key:'el-direct'},{max:6,key:'el-pre'},{max:7,key:'conf'},{rPO:16,rDir:17,total:18}],
  ll:[{max:1,key:'champ'},{max:4,key:'cl-direct'},{max:6,key:'el-direct'},{max:7,key:'conf'},{rPO:18,rDir:19,total:20}],
  sa:[{max:1,key:'champ'},{max:4,key:'cl-direct'},{max:6,key:'el-direct'},{max:7,key:'conf'},{rPO:18,rDir:19,total:20}],
  l1:[{max:1,key:'champ'},{max:3,key:'cl-direct'},{max:4,key:'cl-pre'},{max:6,key:'el-direct'},{rPO:16,rDir:17,total:18}],
  ed:[{max:1,key:'champ'},{max:3,key:'cl-pre'},{max:5,key:'el-pre'},{max:7,key:'conf'},{rPO:16,rDir:17,total:18}],
  cl:[],
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

// Datum helpers
function toDateStr(date) {
  return date.toISOString().split('T')[0];
}

function dutchDayLabel(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  const days   = ['Zo','Ma','Di','Wo','Do','Vr','Za'];
  const months = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'];
  return `${days[d.getUTCDay()]} ${d.getUTCDate()} ${months[d.getUTCMonth()]}`;
}

// Haal wedstrijden op voor één competitie
async function fetchLeague(league, dateFrom, dateTo, apiKey) {
  const url = `${BASE_URL}/competitions/${league.code}/matches?dateFrom=${dateFrom}&dateTo=${dateTo}&status=SCHEDULED`;
  const res = await fetch(url, {
    headers: {
      'X-Auth-Token': apiKey,
      'User-Agent': 'Games2Watch/1.0 (+https://games2watch.eu)',
    },
  });

  if (res.status === 429) throw new Error('Rate limit bereikt');
  if (!res.ok) throw new Error(`football-data.org ${league.code}: HTTP ${res.status}`);

  const data = await res.json();
  return data.matches || [];
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  // Cache 24 uur op Vercel's CDN — iedereen krijgt dezelfde gecachte response
  // stale-while-revalidate: terwijl de cache ververst wordt, krijgt de bezoeker de oude data
  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=3600');

  const apiKey = process.env.FOOTBALL_DATA_KEY;
  if (!apiKey) {
    return res.status(500).json({
      source: 'error',
      error:  'FOOTBALL_DATA_KEY niet ingesteld in Vercel environment variables',
      count:  0,
      matches: [],
    });
  }

  // Datumrange: vandaag t/m 14 dagen vooruit
  const today  = new Date();
  const future = new Date();
  future.setDate(today.getDate() + 14);
  const dateFrom = toDateStr(today);
  const dateTo   = toDateStr(future);

  try {
    // Haal alle competities sequentieel op (rate limit: 10 calls/minuut)
    const matches = [];

    for (const league of LEAGUES) {
      try {
        const events = await fetchLeague(league, dateFrom, dateTo, apiKey);
        const stand  = STANDINGS[league.key] || {};

        for (const ev of events) {
          // football-data.org geeft UTC tijdstip
          const utcDate = new Date(ev.utcDate);

          // Omzetten naar CEST (UTC+2 zomer, UTC+1 winter)
          // Simpele benadering: detecteer zomertijd op basis van datum
          const month = utcDate.getUTCMonth() + 1;
          const offset = (month >= 4 && month <= 10) ? 2 : 1; // CEST of CET
          const local  = new Date(utcDate.getTime() + offset * 3600 * 1000);

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
            home, away,
            rH, rA,
            stakeH:    rH ? clubStake(league.key, rH) : 'mid',
            stakeA:    rA ? clubStake(league.key, rA) : 'mid',
            tv:        getTV(league.key, dateStr, timeStr),
          });
        }

        // Kleine pauze tussen calls om rate limit te respecteren
        await new Promise(r => setTimeout(r, 200));

      } catch (leagueErr) {
        console.error(`[${league.key}] error:`, leagueErr.message);
        // Doorgaan met de rest van de competities
      }
    }

    // Chronologisch sorteren
    matches.sort((a, b) => a.sk.localeCompare(b.sk));

    res.status(200).json({
      source:     'football-data.org',
      fetched_at: new Date().toISOString(),
      date_from:  dateFrom,
      date_to:    dateTo,
      count:      matches.length,
      matches,
    });

  } catch (err) {
    console.error('[matches.js] fatal:', err.message);
    res.status(500).json({
      source:  'error',
      error:   err.message,
      count:   0,
      matches: [],
    });
  }
}
