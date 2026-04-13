// api/matches.js — v12
// Wedstrijddata: football-data.org | TV-info: iservoetbalvanavond.nl
// Lege responses worden NOOIT gecached (voorkomt 24u vastzitten bij 429)

const BASE_URL  = 'https://api.football-data.org/v4';
const TV_SOURCE = 'https://www.iservoetbalvanavond.nl';

const LEAGUES = [
  { key: 'pl',  code: 'PL',  name: 'Premier League',  flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
  { key: 'ed',  code: 'DED', name: 'Eredivisie',       flag: '🇳🇱' },
  { key: 'bl',  code: 'BL1', name: 'Bundesliga',       flag: '🇩🇪' },
  { key: 'll',  code: 'PD',  name: 'La Liga',          flag: '🇪🇸' },
  { key: 'sa',  code: 'SA',  name: 'Serie A',          flag: '🇮🇹' },
  { key: 'l1',  code: 'FL1', name: 'Ligue 1',          flag: '🇫🇷' },
  { key: 'cl',  code: 'CL',  name: 'Champions League', flag: '🏆' },
];

// iservoetbalvanavond.nl naam → football-data.org naam
const NAME_MAP = {
  'manchester united': 'Manchester United FC',
  'leeds united': 'Leeds United FC',
  'liverpool': 'Liverpool FC',
  'arsenal': 'Arsenal FC',
  'chelsea': 'Chelsea FC',
  'manchester city': 'Manchester City FC',
  'tottenham hotspur': 'Tottenham Hotspur FC',
  'aston villa': 'Aston Villa FC',
  'newcastle united': 'Newcastle United FC',
  'west ham united': 'West Ham United FC',
  'everton': 'Everton FC',
  'fulham': 'Fulham FC',
  'brentford': 'Brentford FC',
  'brighton': 'Brighton & Hove Albion FC',
  'crystal palace': 'Crystal Palace FC',
  'nottingham forest': 'Nottingham Forest FC',
  'bournemouth': 'AFC Bournemouth',
  'afc bournemouth': 'AFC Bournemouth',
  'wolverhampton wanderers': 'Wolverhampton Wanderers FC',
  'sunderland': 'Sunderland AFC',
  'burnley': 'Burnley FC',
  'atlético madrid': 'Club Atlético de Madrid',
  'atletico madrid': 'Club Atlético de Madrid',
  'fc barcelona': 'FC Barcelona',
  'barcelona': 'FC Barcelona',
  'real madrid c.f.': 'Real Madrid CF',
  'real madrid': 'Real Madrid CF',
  'fc bayern münchen': 'FC Bayern München',
  'bayern münchen': 'FC Bayern München',
  'paris saint-germain f.c.': 'Paris Saint-Germain FC',
  'paris saint-germain': 'Paris Saint-Germain FC',
  'ajax': 'AFC Ajax',
  'psv': 'PSV',
  'feyenoord': 'Feyenoord',
  'az': 'AZ',
  'fc twente': 'FC Twente',
  'nec': 'NEC Nijmegen',
  'n.e.c.': 'NEC Nijmegen',
  'fc utrecht': 'FC Utrecht',
  'sc heerenveen': 'sc Heerenveen',
  'go ahead eagles': 'Go Ahead Eagles',
  'heracles almelo': 'Heracles Almelo',
  'fc groningen': 'FC Groningen',
  'fortuna sittard': 'Fortuna Sittard',
  'sparta rotterdam': 'Sparta Rotterdam',
  'nac breda': 'NAC Breda',
  'excelsior rotterdam': 'Excelsior Rotterdam',
  'fc volendam': 'FC Volendam',
  'telstar': 'Telstar 1963',
  'pec zwolle': 'PEC Zwolle',
  'levante ud': 'Levante UD',
  'getafe cf': 'Getafe CF',
  'celta de vigo': 'RC Celta de Vigo',
  'real betis': 'Real Betis Balompié',
  'sc freiburg': 'SC Freiburg',
  'fiorentina': 'ACF Fiorentina',
  'acf fiorentina': 'ACF Fiorentina',
  'lazio': 'SS Lazio',
  'ss lazio': 'SS Lazio',
  'bologna f.c. 1909': 'Bologna FC 1909',
  'bologna': 'Bologna FC 1909',
  'aston villa': 'Aston Villa FC',
  'nottingham forest': 'Nottingham Forest FC',
};

function normalizeChannel(raw) {
  if (!raw) return null;
  const name  = raw.trim().replace(/\s+/g, ' ');
  const lower = name.toLowerCase();
  if (lower.startsWith('espn')) {
    const num = parseInt(name.replace(/\D/g, '')) || 1;
    return { label: name, cls: 'espn', free: num <= 1 };
  }
  if (lower.includes('ziggo'))   return { label: name,          cls: 'ziggo',   free: false };
  if (lower.includes('viaplay')) return { label: name,          cls: 'viaplay', free: lower.includes('viaplay tv') };
  if (lower.includes('prime'))   return { label: 'Prime Video', cls: 'prime',   free: false };
  if (lower.startsWith('npo'))   return { label: name,          cls: 'npo',     free: true  };
  if (lower.startsWith('rtl'))   return { label: name,          cls: 'npo',     free: true  };
  if (lower.includes('disney'))  return { label: 'Disney+',     cls: 'other',   free: false };
  return { label: name, cls: 'other', free: false };
}

async function fetchTVLookup() {
  try {
    const res = await fetch(TV_SOURCE, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });
    if (!res.ok) return {};
    const html = await res.text();

    let md = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<a[^>]*>\s*([^<]+?)\s*<\/a>/gi, (_, t) => t.trim())
      .replace(/<tr[^>]*>/gi, '\nROW|')
      .replace(/<td[^>]*>/gi, 'CELL|')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&#\d+;/g, '');

    const lookup = {};
    for (const line of md.split('\n')) {
      if (!line.startsWith('ROW|')) continue;
      const cells = line.split('CELL|')
        .map(c => c.replace(/\s+/g, ' ').trim())
        .filter(c => c && !/^[\-\s]+$/.test(c) && !c.includes('Logo'));

      let home = null, away = null, channel = null;
      for (const cell of cells) {
        const parts = cell.split(/\s{2,}/).map(p => p.trim()).filter(p => p.length > 1);
        if (parts.length >= 2 && !home) {
          home = parts[0]; away = parts[1];
          if (parts.length > 2) channel = parts[parts.length - 1];
        } else if (home && !channel && cell.length < 35) {
          channel = cell.split(/\s{2,}/)[0].trim();
        }
      }

      if (home && away && channel) {
        const tv = normalizeChannel(channel);
        if (!tv) continue;
        const fdHome = NAME_MAP[home.toLowerCase()] || home;
        const fdAway = NAME_MAP[away.toLowerCase()] || away;
        lookup[`${fdHome.toLowerCase()}|||${fdAway.toLowerCase()}`] = tv;
      }
    }
    return lookup;
  } catch(e) {
    return {};
  }
}

function defaultTV(leagueKey, dateStr, timeStr) {
  const hour = parseInt((timeStr || '00:00').split(':')[0]);
  const dow  = new Date((dateStr || '2026-01-01') + 'T12:00:00Z').getDay();
  if (leagueKey === 'pl') {
    if (dow === 6 && hour >= 13 && hour < 16) return { label: 'Prime Video', cls: 'prime', free: false };
    return { label: 'Viaplay', cls: 'viaplay', free: false };
  }
  const map = {
    bl: { label: 'Viaplay',     cls: 'viaplay', free: false },
    ed: { label: 'ESPN',        cls: 'espn',    free: false },
    ll: { label: 'Ziggo Sport', cls: 'ziggo',   free: false },
    sa: { label: 'Ziggo Sport', cls: 'ziggo',   free: false },
    l1: { label: 'Viaplay',     cls: 'viaplay', free: false },
    cl: { label: 'Ziggo Sport', cls: 'ziggo',   free: false },
  };
  return map[leagueKey] || { label: '?', cls: 'other', free: false };
}

function findTV(home, away, leagueKey, dateStr, timeStr, tvLookup) {
  const h = home.toLowerCase();
  const a = away.toLowerCase();
  if (tvLookup[`${h}|||${a}`]) return tvLookup[`${h}|||${a}`];
  const hw = h.split(/[\s\-]+/)[0];
  const aw = a.split(/[\s\-]+/)[0];
  for (const [k, v] of Object.entries(tvLookup)) {
    const [kh, ka] = k.split('|||');
    if (kh && ka && kh.startsWith(hw) && ka.startsWith(aw)) return v;
  }
  return defaultTV(leagueKey, dateStr, timeStr);
}

const STANDINGS = {
  pl: {'Arsenal FC':1,'Manchester City FC':2,'Manchester United FC':3,'Aston Villa FC':4,'Liverpool FC':5,'Chelsea FC':6,'Brentford FC':7,'Everton FC':8,'Fulham FC':9,'Brighton & Hove Albion FC':10,'Sunderland AFC':11,'Newcastle United FC':12,'AFC Bournemouth':13,'Crystal Palace FC':14,'Leeds United FC':15,'Nottingham Forest FC':16,'Tottenham Hotspur FC':17,'West Ham United FC':18,'Burnley FC':19,'Wolverhampton Wanderers FC':20},
  bl: {'FC Bayern München':1,'Borussia Dortmund':2,'VfB Stuttgart':3,'RB Leipzig':4,'TSG 1899 Hoffenheim':5,'Bayer 04 Leverkusen':6,'Eintracht Frankfurt':7,'SC Freiburg':8,'1. FC Union Berlin':9,'FC Augsburg':10,'1. FSV Mainz 05':11,'Hamburger SV':12,'Borussia Mönchengladbach':13,'SV Werder Bremen':14,'1. FC Köln':15,'FC St. Pauli 1910':16,'VfL Wolfsburg':17,'1. FC Heidenheim 1846':18},
  ed: {'PSV':1,'Feyenoord':2,'NEC Nijmegen':3,'AFC Ajax':4,'FC Twente':5,'AZ':6,'FC Utrecht':7,'sc Heerenveen':8,'Go Ahead Eagles':9,'Heracles Almelo':10,'FC Groningen':11,'Fortuna Sittard':12,'Sparta Rotterdam':13,'NAC Breda':14,'Excelsior Rotterdam':15,'FC Volendam':16,'Telstar 1963':17,'PEC Zwolle':18},
  ll: {'Real Madrid CF':1,'FC Barcelona':2,'Club Atlético de Madrid':3,'Athletic Club':4,'Villarreal CF':5,'Real Sociedad de Fútbol':6,'Real Betis Balompié':7,'RC Celta de Vigo':8,'Sevilla FC':9,'Getafe CF':10,'CA Osasuna':11,'Valencia CF':12,'Rayo Vallecano de Madrid':13,'Girona FC':14,'RCD Mallorca':15,'Elche CF':16,'Deportivo Alavés':17,'Levante UD':18,'RCD Espanyol de Barcelona':19,'Real Oviedo':20},
  sa: {'FC Internazionale Milano':1,'SSC Napoli':2,'Juventus FC':3,'AC Milan':4,'Atalanta BC':5,'SS Lazio':6,'AS Roma':7,'ACF Fiorentina':8,'Torino FC':9,'Bologna FC 1909':10,'Udinese Calcio':11,'Como 1907':12,'US Lecce':13,'Hellas Verona FC':14,'Cagliari Calcio':15,'Parma Calcio 1913':16,'US Cremonese':17,'AC Pisa 1909':18,'Genoa CFC':19,'US Sassuolo Calcio':20},
  l1: {'Paris Saint-Germain FC':1,'AS Monaco FC':2,'Olympique de Marseille':3,'LOSC Lille':4,'Olympique Lyonnais':5,'OGC Nice':6,'Racing Club de Lens':7,'Stade Rennais FC 1901':8,'RC Strasbourg Alsace':9,'Stade Brestois 29':10,'Toulouse FC':11,'Paris FC':12,'Le Havre AC':13,'FC Nantes':14,'Angers SCO':15,'AJ Auxerre':16,'FC Metz':17,'FC Lorient':18},
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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const apiKey = process.env.FOOTBALL_DATA_KEY;
  if (!apiKey) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(500).json({ source: 'error', error: 'FOOTBALL_DATA_KEY niet ingesteld', count: 0, matches: [] });
  }

  const today  = new Date();
  const future = new Date();
  future.setDate(today.getDate() + 14);
  const dateFrom = toDateStr(today);
  const dateTo   = toDateStr(future);

  try {
    const tvPromise = fetchTVLookup();

    const leagueResults = await Promise.all(
      LEAGUES.map(async (league) => {
        try {
          const url = `${BASE_URL}/competitions/${league.code}/matches?dateFrom=${dateFrom}&dateTo=${dateTo}&status=SCHEDULED`;
          const r = await fetch(url, { headers: { 'X-Auth-Token': apiKey } });
          if (!r.ok) return { league, events: [], status: r.status };
          const data = await r.json();
          return { league, events: data.matches || [], status: 200 };
        } catch(e) {
          return { league, events: [], error: e.message };
        }
      })
    );

    const tvLookup = await tvPromise;
    const matches  = [];
    const errors   = [];

    for (const { league, events, status, error } of leagueResults) {
      if (error || (status && status !== 200)) {
        errors.push(`${league.code}: ${error || status}`);
        continue;
      }
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
          sk: `${dateStr} ${timeStr}`,
          day: dutchDayLabel(dateStr),
          time: timeStr, date: dateStr,
          comp: league.name, leagueKey: league.key, flag: league.flag,
          home, away, rH, rA,
          stakeH: rH ? clubStake(league.key, rH) : 'mid',
          stakeA: rA ? clubStake(league.key, rA) : 'mid',
          tv: findTV(home, away, league.key, dateStr, timeStr, tvLookup),
        });
      }
    }

    matches.sort((a, b) => a.sk.localeCompare(b.sk));

    // Nooit een lege response cachen — anders zit je 24u vast
    if (matches.length > 0) {
      res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=3600');
    } else {
      res.setHeader('Cache-Control', 'no-store');
    }

    return res.status(200).json({
      source: 'football-data.org + iservoetbalvanavond.nl',
      fetched_at: new Date().toISOString(),
      count: matches.length,
      ...(errors.length > 0 ? { errors } : {}),
      matches,
    });

  } catch (err) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(500).json({ source: 'error', error: err.message, count: 0, matches: [] });
  }
}
