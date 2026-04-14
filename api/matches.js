// api/matches.js — v13
// Speelschema: football-data.org
// TV-info: iservoetbalvanavond.nl homepage (komende ~3 dagen)
// EL + Conference League: iservoetbalvanavond.nl seizoenspagina's (incl. heenwedstrijd scores)

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

const EL_CONF_SOURCES = [
  {
    key: 'el',
    name: 'Europa League',
    flag: '🏆',
    url: 'https://www.iservoetbalvanavond.nl/competities/uefa/europa-league-2025-2026',
  },
  {
    key: 'conf',
    name: 'Conference League',
    flag: '🏆',
    url: 'https://www.iservoetbalvanavond.nl/competities/uefa/conference-league-2025-2026',
  },
];

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
};

function normalizeChannel(raw) {
  if (!raw) return null;
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
  return { label: name, cls: 'other', free: false };
}

function defaultTV(leagueKey) {
  const map = {
    pl:   { label: 'Viaplay',     cls: 'viaplay', free: false },
    bl:   { label: 'Viaplay',     cls: 'viaplay', free: false },
    ed:   { label: 'ESPN',        cls: 'espn',    free: false },
    ll:   { label: 'Ziggo Sport', cls: 'ziggo',   free: false },
    sa:   { label: 'Ziggo Sport', cls: 'ziggo',   free: false },
    l1:   { label: 'Viaplay',     cls: 'viaplay', free: false },
    cl:   { label: 'Ziggo Sport', cls: 'ziggo',   free: false },
    el:   { label: 'Ziggo Sport', cls: 'ziggo',   free: false },
    conf: { label: 'Ziggo Sport', cls: 'ziggo',   free: false },
  };
  return map[leagueKey] || { label: '?', cls: 'other', free: false };
}

// Parse markdown-like tekst van iservoetbalvanavond.nl naar een lijst van wedstrijden
// met home, away, scoreH, scoreA, channel
function parseIsvPage(html) {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<a[^>]*>\s*([^<]+?)\s*<\/a>/gi, (_, t) => t.trim())
    .replace(/<tr[^>]*>/gi, '\nROW|')
    .replace(/<td[^>]*>/gi, 'CELL|')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&#\d+;/g, '');

  const entries = [];
  for (const line of text.split('\n')) {
    if (!line.includes('ROW|')) continue;
    const cells = line.replace('ROW|', '').split('CELL|')
      .map(c => c.replace(/\s+/g, ' ').trim())
      .filter(c => c && !c.match(/^Logo\s/) && !c.match(/^[\-\s]+$/));

    if (cells.length < 2) continue;

    // Zoek cel met twee teamnamen (gescheiden door 2+ spaties)
    let home = null, away = null, scoreH = null, scoreA = null, channel = null;

    for (const cell of cells) {
      const parts = cell.split(/\s{2,}/).map(p => p.trim()).filter(p => p.length > 1);
      if (parts.length >= 2 && !home) {
        home = parts[0];
        away = parts[1];
      }
    }

    // Zoek score cel: "1  2" of "-  -"
    for (const cell of cells) {
      const m = cell.match(/^(-|\d+)\s{1,4}(-|\d+)$/);
      if (m) {
        scoreH = m[1] === '-' ? null : parseInt(m[1]);
        scoreA = m[2] === '-' ? null : parseInt(m[2]);
      }
    }

    // Zoek zender (laatste niet-lege cel die geen naam is)
    for (const cell of cells) {
      if (cell && cell !== home && cell !== away && cell.length < 40
          && !cell.match(/^\d+\s+\d+$/) && !cell.match(/^-\s+-$/)) {
        const tv = normalizeChannel(cell);
        if (tv && tv.cls !== 'other') channel = tv;
      }
    }

    if (home && away) {
      entries.push({ home, away, scoreH, scoreA, channel });
    }
  }
  return entries;
}

// Haal TV lookup op van homepage (komende ~3 dagen)
async function fetchTVLookup() {
  try {
    const res = await fetch(TV_SOURCE, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; games2watch/1.0)' },
    });
    if (!res.ok) return {};
    const html = await res.text();
    const entries = parseIsvPage(html);
    const lookup = {};
    for (const { home, away, channel } of entries) {
      if (!channel) continue;
      const fdHome = NAME_MAP[home.toLowerCase()] || home;
      const fdAway = NAME_MAP[away.toLowerCase()] || away;
      lookup[`${fdHome.toLowerCase()}|||${fdAway.toLowerCase()}`] = channel;
    }
    return lookup;
  } catch(e) {
    return {};
  }
}

// Haal EL/CONF wedstrijden op van seizoenspagina
// Geeft: { upcoming: [{home, away, time, date, day, tv}], legScores: {"home|away": "sH-sA"} }
async function fetchELConfMatches(source) {
  try {
    const res = await fetch(source.url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; games2watch/1.0)' },
    });
    if (!res.ok) return { upcoming: [], legScores: {} };
    const html = await res.text();

    // Parse de pagina voor datums, tijden, teams en scores
    // De pagina heeft: ## Sectietitel, ### Rondenaam, #### Datumheader, tijdstip, gevolgd door tabelrijen
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<a[^>]*href="[^"]*"[^>]*>\s*([^<]+?)\s*<\/a>/gi, (_, t) => t.trim())
      .replace(/<h4[^>]*>/gi, '\n__DATE__')
      .replace(/<\/h4>/gi, '\n')
      .replace(/<tr[^>]*>/gi, '\nROW|')
      .replace(/<td[^>]*>/gi, 'CELL|')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&#\d+;/g, '');

    const NL_DAG = { maandag:'Ma', dinsdag:'Di', woensdag:'Wo', donderdag:'Do', vrijdag:'Vr', zaterdag:'Za', zondag:'Zo' };
    const NL_MAAND = { januari:1, februari:2, maart:3, april:4, mei:5, juni:6, juli:7, augustus:8, september:9, oktober:10, november:11, december:12 };
    const NL_MAAND_LABEL = ['','jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'];

    const today = new Date();
    const future = new Date(); future.setDate(today.getDate() + 14);

    let currentDateStr = null;
    let currentDayLabel = null;
    let currentTime = null;

    // legScores: { "home_lower|away_lower": "sH-sA" } voor gespeelde wedstrijden
    const legScores = {};
    // upcoming: aankomende wedstrijden binnen 14 dagen
    const upcoming = [];

    for (const line of text.split('\n')) {
      const l = line.trim();
      if (!l) continue;

      // Datumheader zoals "Donderdag 16 april"
      if (l.startsWith('__DATE__')) {
        const dateStr = l.replace('__DATE__', '').trim();
        const parts = dateStr.toLowerCase().split(/\s+/);
        if (parts.length >= 3) {
          const dagStr = NL_DAG[parts[0]] || parts[0].substring(0,2);
          const dag = parseInt(parts[1]);
          const maandNum = NL_MAAND[parts[2]] || 1;
          const jaar = today.getFullYear();
          const d = new Date(jaar, maandNum - 1, dag);
          // Volgend jaar als de datum al voorbij is maar het getal kleiner is dan de huidige maand
          if (d < new Date(today.getFullYear(), today.getMonth(), today.getDate() - 30)) {
            d.setFullYear(jaar + 1);
          }
          currentDateStr = d.toISOString().split('T')[0];
          currentDayLabel = `${dagStr} ${dag} ${NL_MAAND_LABEL[maandNum]}`;
        }
        currentTime = null;
        continue;
      }

      // Tijdstip
      if (/^\d{2}:\d{2}$/.test(l)) {
        currentTime = l;
        continue;
      }

      // Wedstrijdrij
      if (l.startsWith('ROW|') && currentTime && currentDateStr) {
        const cells = l.replace('ROW|', '').split('CELL|')
          .map(c => c.replace(/\s+/g, ' ').trim())
          .filter(c => c && !c.match(/^Logo\s/));

        let home = null, away = null, scoreH = null, scoreA = null;

        // Zoek teamnamen (cel met 2+ woorden, gescheiden door 2+ spaties)
        for (const cell of cells) {
          const parts = cell.split(/\s{2,}/).map(p => p.trim()).filter(p => p.length > 1);
          if (parts.length >= 2 && !home) {
            home = parts[0];
            away = parts[1];
          }
        }

        // Zoek score
        for (const cell of cells) {
          const m = cell.trim().match(/^(-|\d+)\s{1,4}(-|\d+)$/);
          if (m) {
            scoreH = m[1] === '-' ? null : parseInt(m[1]);
            scoreA = m[2] === '-' ? null : parseInt(m[2]);
          }
        }

        if (!home || !away) continue;

        const homeLow = home.toLowerCase();
        const awayLow = away.toLowerCase();

        if (scoreH !== null && scoreA !== null) {
          // Gespeelde wedstrijd → opslaan als heenwedstrijd reference
          legScores[`${homeLow}|||${awayLow}`] = `${scoreH}-${scoreA}`;
        } else {
          // Aankomende wedstrijd — check of het binnen 14 dagen is
          const matchDate = new Date(currentDateStr + 'T12:00:00Z');
          if (matchDate >= today && matchDate <= future) {
            // Zoek zender
            let tv = null;
            for (const cell of cells) {
              if (cell && cell !== home && cell !== away && cell.length < 40) {
                const attempt = normalizeChannel(cell);
                if (attempt && attempt.cls !== 'other') { tv = attempt; break; }
              }
            }

            upcoming.push({
              home, away,
              homeLow, awayLow,
              date: currentDateStr,
              day: currentDayLabel,
              time: currentTime,
              tv: tv || defaultTV(source.key),
            });
          }
        }
      }
    }

    return { upcoming, legScores };
  } catch(e) {
    return { upcoming: [], legScores: {} };
  }
}

function findTV(home, away, leagueKey, tvLookup) {
  const h = home.toLowerCase();
  const a = away.toLowerCase();
  if (tvLookup[`${h}|||${a}`]) return tvLookup[`${h}|||${a}`];
  const hw = h.split(/[\s\-]+/)[0];
  const aw = a.split(/[\s\-]+/)[0];
  for (const [k, v] of Object.entries(tvLookup)) {
    const [kh, ka] = k.split('|||');
    if (kh && ka && kh.startsWith(hw) && ka.startsWith(aw)) return v;
  }
  return defaultTV(leagueKey);
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
  if (!zones || !rank) return 'mid';
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
    // Start alle fetches parallel
    const tvPromise      = fetchTVLookup();
    const elConfPromises = EL_CONF_SOURCES.map(s => fetchELConfMatches(s));

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

    const [tvLookup, ...elConfResults] = await Promise.all([tvPromise, ...elConfPromises]);
    const matches = [];
    const errors  = [];

    // Verwerk football-data.org competities
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
          tv: findTV(home, away, league.key, tvLookup),
          legScore: null,
        });
      }
    }

    // Verwerk EL + Conference League
    for (let i = 0; i < EL_CONF_SOURCES.length; i++) {
      const source = EL_CONF_SOURCES[i];
      const { upcoming, legScores } = elConfResults[i];

      for (const m of upcoming) {
        // Zoek heenwedstrijd score: de retourwedstrijd heeft home/away omgedraaid t.o.v. heen
        const legKey = `${m.awayLow}|||${m.homeLow}`;
        const legScore = legScores[legKey] || null;

        // Zoek ook in de TV lookup van de homepage
        const tvFromHome = tvLookup[`${m.homeLow}|||${m.awayLow}`];

        matches.push({
          sk: `${m.date} ${m.time}`,
          day: m.day,
          time: m.time, date: m.date,
          comp: source.name, leagueKey: source.key, flag: source.flag,
          home: m.home, away: m.away,
          rH: null, rA: null,
          stakeH: 'mid', stakeA: 'mid',
          tv: tvFromHome || m.tv,
          legScore,  // bijv. "3-0" of "1-1" of null
        });
      }
    }

    matches.sort((a, b) => a.sk.localeCompare(b.sk));

    if (matches.length > 0) {
      res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=3600');
    } else {
      res.setHeader('Cache-Control', 'no-store');
    }

    return res.status(200).json({
      source:     'football-data.org + iservoetbalvanavond.nl',
      fetched_at: new Date().toISOString(),
      count:      matches.length,
      ...(errors.length > 0 ? { errors } : {}),
      matches,
    });

  } catch (err) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(500).json({ source: 'error', error: err.message, count: 0, matches: [] });
  }
}
