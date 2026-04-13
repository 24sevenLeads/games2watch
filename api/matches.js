// api/matches.js — v5
// Haalt speelschema's op van TheSportsDB (gratis, geen API key nodig)
// TV-info wordt bepaald op basis van NL uitzendrechten per competitie

const LEAGUES = [
  { key: 'pl', id: '4328', name: 'Premier League',  flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
  { key: 'ed', id: '4337', name: 'Eredivisie',       flag: '🇳🇱' },
  { key: 'bl', id: '4331', name: 'Bundesliga',       flag: '🇩🇪' },
  { key: 'll', id: '4335', name: 'La Liga',           flag: '🇪🇸' },
  { key: 'sa', id: '4332', name: 'Serie A',           flag: '🇮🇹' },
  { key: 'l1', id: '4334', name: 'Ligue 1',           flag: '🇫🇷' },
];

// NL TV-rechten per competitie (seizoen 2025/26)
// Premier League za 13:00-16:00 → Prime Video, rest → Viaplay
function getTV(leagueKey, dateStr, timeStr) {
  const hour = timeStr ? parseInt(timeStr.split(':')[0]) : 0;
  const dow   = new Date(dateStr).getDay(); // 0=zo, 6=za

  if (leagueKey === 'pl') {
    if (dow === 6 && hour >= 13 && hour < 16)
      return { label: 'Prime Video', cls: 'prime', free: false };
    return { label: 'Viaplay', cls: 'viaplay', free: false };
  }
  if (leagueKey === 'bl') return { label: 'Viaplay',     cls: 'viaplay', free: false };
  if (leagueKey === 'ed') return { label: 'ESPN',        cls: 'espn',    free: false };
  if (leagueKey === 'll') return { label: 'Ziggo Sport', cls: 'ziggo',   free: false };
  if (leagueKey === 'sa') return { label: 'Ziggo Sport', cls: 'ziggo',   free: false };
  if (leagueKey === 'l1') return { label: 'Viaplay',     cls: 'viaplay', free: false };
  return { label: '?', cls: 'other', free: false };
}

// Standen (april 2026) — voor inzet-badges
const STANDINGS = {
  pl: {'Arsenal':1,'Arsenal FC':1,'Manchester City':2,'Man City':2,'Manchester United':3,'Man United':3,'Aston Villa':4,'Liverpool':5,'Liverpool FC':5,'Chelsea':6,'Chelsea FC':6,'Brentford':7,'Brentford FC':7,'Everton':8,'Everton FC':8,'Fulham':9,'Fulham FC':9,'Brighton':10,'Brighton & Hove Albion':10,'Sunderland':11,'Sunderland AFC':11,'Newcastle':12,'Newcastle United':12,'Bournemouth':13,'AFC Bournemouth':13,'Crystal Palace':14,'Leeds United':15,'Leeds':15,'Nottingham Forest':16,'Tottenham':17,'Tottenham Hotspur':17,'West Ham':18,'West Ham United':18,'Burnley':19,'Burnley FC':19,'Wolves':20,'Wolverhampton Wanderers':20},
  bl: {'Bayern Munich':1,'Bayern München':1,'Borussia Dortmund':2,'VfB Stuttgart':3,'RB Leipzig':4,'TSG Hoffenheim':5,'Hoffenheim':5,'Bayer Leverkusen':6,'Leverkusen':6,'Eintracht Frankfurt':7,'Frankfurt':7,'SC Freiburg':8,'Freiburg':8,'Union Berlin':9,'1. FC Union Berlin':9,'FC Augsburg':10,'Augsburg':10,'FSV Mainz':11,'Mainz':11,'Mainz 05':11,'Hamburger SV':12,'Hamburg':12,'HSV':12,'Borussia Monchengladbach':13,'Monchengladbach':13,'Mönchengladbach':13,'Borussia Mönchengladbach':13,'Werder Bremen':14,'Bremen':14,'1. FC Cologne':15,'FC Köln':15,'Köln':15,'Koln':15,'1. FC Köln':15,'FC St. Pauli':16,'St Pauli':16,'St. Pauli':16,'VFL Wolfsburg':17,'Wolfsburg':17,'VfL Wolfsburg':17,'1. FC Heidenheim':18,'Heidenheim':18},
  ed: {'PSV':1,'PSV Eindhoven':1,'Feyenoord':2,'NEC':3,'NEC Nijmegen':3,'Ajax':4,'AFC Ajax':4,'FC Twente':5,'Twente':5,'AZ':6,'AZ Alkmaar':6,'FC Utrecht':7,'Utrecht':7,'sc Heerenveen':8,'SC Heerenveen':8,'Heerenveen':8,'Go Ahead Eagles':9,'Heracles Almelo':10,'Heracles':10,'FC Groningen':11,'Groningen':11,'Fortuna Sittard':12,'Fortuna':12,'Sparta Rotterdam':13,'Sparta':13,'NAC Breda':14,'NAC':14,'Excelsior Rotterdam':15,'Excelsior':15,'FC Volendam':16,'Volendam':16,'Telstar':17,'SC Telstar':17,'PEC Zwolle':18,'PEC':18},
  ll: {'Real Madrid':1,'Real Madrid CF':1,'FC Barcelona':2,'Barcelona':2,'Atletico Madrid':3,'Atlético Madrid':3,'Club Atletico de Madrid':3,'Athletic Bilbao':4,'Athletic Club':4,'Villarreal':5,'Villarreal CF':5,'Real Sociedad':6,'Real Betis':7,'Real Betis Balompie':7,'Celta Vigo':8,'Celta de Vigo':8,'RC Celta':8,'Sevilla':9,'Sevilla FC':9,'Getafe':10,'Getafe CF':10,'Osasuna':11,'CA Osasuna':11,'Valencia':12,'Valencia CF':12,'Rayo Vallecano':13,'Girona':14,'Girona FC':14,'Mallorca':15,'RCD Mallorca':15,'Elche':16,'Elche CF':16,'Alaves':17,'Deportivo Alaves':17,'Deportivo Alavés':17,'Levante':18,'Levante UD':18,'Espanyol':19,'RCD Espanyol':19,'Oviedo':20,'Real Oviedo':20},
  sa: {'Inter':1,'Inter Milan':1,'Inter Milano':1,'Internazionale':1,'Napoli':2,'SSC Napoli':2,'Juventus':3,'Juventus FC':3,'AC Milan':4,'Milan':4,'Atalanta':5,'Atalanta BC':5,'Lazio':6,'SS Lazio':6,'Lazio Rome':6,'Roma':7,'AS Roma':7,'Fiorentina':8,'ACF Fiorentina':8,'Torino':9,'Torino FC':9,'Bologna':10,'Bologna FC':10,'Udinese':11,'Udinese Calcio':11,'Como':12,'Como 1907':12,'Lecce':13,'US Lecce':13,'Verona':14,'Hellas Verona':14,'Cagliari':15,'Cagliari Calcio':15,'Parma':16,'Parma Calcio':16,'Cremonese':17,'US Cremonese':17,'Pisa':18,'SC Pisa':18,'Genoa':19,'Genoa CFC':19,'Sassuolo':20,'US Sassuolo':20},
  l1: {'PSG':1,'Paris Saint-Germain':1,'Paris Saint-Germain FC':1,'Monaco':2,'AS Monaco':2,'Marseille':3,'Olympique Marseille':3,'Olympique de Marseille':3,'Lille':4,'Lille OSC':4,'LOSC Lille':4,'Lyon':5,'Olympique Lyon':5,'Olympique Lyonnais':5,'Nice':6,'OGC Nice':6,'Lens':7,'RC Lens':7,'Racing Club De Lens':7,'Rennes':8,'Stade Rennais':8,'Stade Rennais FC':8,'Strasbourg':9,'RC Strasbourg':9,'Brest':10,'Stade Brest':10,'Stade Brestois':10,'Toulouse':11,'Toulouse FC':11,'Paris FC':12,'Le Havre':13,'Le Havre AC':13,'Nantes':14,'FC Nantes':14,'Angers':15,'Angers SCO':15,'Auxerre':16,'AJ Auxerre':16,'Metz':17,'FC Metz':17,'Lorient':18,'FC Lorient':18},
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

// Dag-label in Nederlandse stijl
function dutchDayLabel(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  const days = ['Zo','Ma','Di','Wo','Do','Vr','Za'];
  const months = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'];
  return `${days[d.getUTCDay()]} ${d.getUTCDate()} ${months[d.getUTCMonth()]}`;
}

// Sorteersleutel: "2026-04-13 21:00"
function sortKey(dateStr, timeStr) {
  return `${dateStr} ${timeStr || '00:00'}`;
}

async function fetchLeague(league) {
  const url = `https://www.thesportsdb.com/api/v1/json/123/eventsnextleague.php?id=${league.id}`;
  const res  = await fetch(url, {
    headers: { 'User-Agent': 'Games2Watch/1.0 (+https://games2watch.eu)' }
  });
  if (!res.ok) throw new Error(`TheSportsDB ${league.id}: ${res.status}`);
  const data = await res.json();
  return (data.events || []);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=1800');

  try {
    // Haal alle competities parallel op
    const results = await Promise.allSettled(
      LEAGUES.map(l => fetchLeague(l))
    );

    const matches = [];
    const today   = new Date().toISOString().split('T')[0];

    LEAGUES.forEach((league, i) => {
      const result = results[i];
      if (result.status !== 'fulfilled') {
        console.error(`[${league.key}] failed:`, result.reason?.message);
        return;
      }

      const events = result.value;
      const stand  = STANDINGS[league.key] || {};

      events.forEach(ev => {
        const dateStr = ev.dateEvent;
        const timeStr = (ev.strTime || '00:00').substring(0, 5);

        // Sla al gespeelde wedstrijden over
        if (dateStr < today) return;
        // Sla wedstrijden zonder datum over
        if (!dateStr) return;

        const home   = ev.strHomeTeam;
        const away   = ev.strAwayTeam;
        const rH     = stand[home] || null;
        const rA     = stand[away] || null;

        // Tijdstip is in UTC — omzetten naar CEST (UTC+2 in zomer)
        const kickoffUTC  = new Date(`${dateStr}T${timeStr}:00Z`);
        const kickoffCEST = new Date(kickoffUTC.getTime() + 2 * 3600 * 1000);
        const localTime   = kickoffCEST.toTimeString().substring(0, 5);
        const localDate   = kickoffCEST.toISOString().split('T')[0];

        matches.push({
          sk:       sortKey(localDate, localTime),
          day:      dutchDayLabel(localDate),
          time:     localTime,
          date:     localDate,
          comp:     league.name,
          leagueKey: league.key,
          flag:     league.flag,
          home, away,
          rH, rA,
          stakeH:   league.key && rH ? clubStake(league.key, rH) : 'mid',
          stakeA:   league.key && rA ? clubStake(league.key, rA) : 'mid',
          tv:       getTV(league.key, localDate, localTime),
        });
      });
    });

    // Chronologisch sorteren
    matches.sort((a, b) => a.sk.localeCompare(b.sk));

    res.status(200).json({
      source:     'thesportsdb.com',
      fetched_at: new Date().toISOString(),
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
