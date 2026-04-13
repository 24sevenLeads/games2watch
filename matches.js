// api/matches.js — v4
// Werkt direct met de markdown output van iservoetbalvanavond.nl
// Structuur per wedstrijd:
//   ## Vandaag / ## Morgen / ## Woensdag 15 april
//   20:00
//   Competitienaam (optioneel)
//   |  |  |  |  |
//   | Logo...  | - - | [TeamA](url)  [TeamB](url) | Zender |

const SOURCE_URL = 'https://www.iservoetbalvanavond.nl';

function normalizeChannel(raw) {
  if (!raw) return { label: '?', cls: 'other', free: false };
  const name  = raw.trim().replace(/\s+/g, ' ');
  const lower = name.toLowerCase();

  if (lower.startsWith('espn')) {
    const digits = name.replace(/\D/g, '');
    const num    = digits ? parseInt(digits) : 1;
    return { label: name, cls: 'espn', free: num <= 1 };
  }
  if (lower.includes('ziggo'))   return { label: name,          cls: 'ziggo',   free: false };
  if (lower.includes('viaplay')) return { label: 'Viaplay',     cls: 'viaplay', free: false };
  if (lower.includes('prime'))   return { label: 'Prime Video', cls: 'prime',   free: false };
  if (lower.startsWith('npo'))   return { label: name,          cls: 'npo',     free: true  };
  if (lower.startsWith('rtl'))   return { label: name,          cls: 'npo',     free: true  };
  if (lower.includes('disney'))  return { label: 'Disney+',     cls: 'other',   free: false };
  return { label: name, cls: 'other', free: false };
}

function detectLeagueKey(comp) {
  const c = (comp || '').toLowerCase();
  if (c.includes('eredivisie'))         return 'ed';
  if (c.includes('premier league'))     return 'pl';
  if (c.includes('bundesliga'))         return 'bl';
  if (c.includes('primera') || c.includes('la liga')) return 'll';
  if (c.includes('serie a'))            return 'sa';
  if (c.includes('ligue 1'))            return 'l1';
  if (c.includes('champions league'))   return 'cl';
  if (c.includes('europa league'))      return 'el';
  if (c.includes('conference league'))  return 'conf';
  return null;
}

const LEAGUE_FLAGS = {
  ed:'🇳🇱', pl:'🏴󠁧󠁢󠁥󠁮󠁧󠁿', bl:'🇩🇪', ll:'🇪🇸', sa:'🇮🇹', l1:'🇫🇷',
  cl:'🏆', el:'🏆', conf:'🏆',
};

const STANDINGS = {
  pl:{'Arsenal':1,'Arsenal FC':1,'Manchester City':2,'Manchester United':3,'Aston Villa':4,'Liverpool':5,'Liverpool FC':5,'Chelsea':6,'Chelsea FC':6,'Brentford':7,'Brentford FC':7,'Everton':8,'Everton FC':8,'Fulham':9,'Fulham FC':9,'Brighton':10,'Brighton & Hove Albion':10,'Sunderland':11,'Sunderland AFC':11,'Newcastle':12,'Newcastle United':12,'Bournemouth':13,'AFC Bournemouth':13,'Crystal Palace':14,'Leeds United':15,'Leeds':15,'Nottingham Forest':16,'Tottenham':17,'Tottenham Hotspur':17,'West Ham':18,'West Ham United':18,'Burnley':19,'Burnley FC':19,'Wolves':20,'Wolverhampton Wanderers':20},
  bl:{'Bayern Munich':1,'Bayern München':1,'Borussia Dortmund':2,'VfB Stuttgart':3,'RB Leipzig':4,'TSG Hoffenheim':5,'Bayer Leverkusen':6,'Eintracht Frankfurt':7,'SC Freiburg':8,'Union Berlin':9,'FC Augsburg':10,'FSV Mainz':11,'Hamburger SV':12,'Borussia Monchengladbach':13,'Werder Bremen':14,'1. FC Cologne':15,'FC St. Pauli':16,'VFL Wolfsburg':17,'1. FC Heidenheim':18},
  ed:{'PSV':1,'Feyenoord':2,'NEC':3,'Ajax':4,'FC Twente':5,'AZ':6,'FC Utrecht':7,'sc Heerenveen':8,'Heerenveen':8,'Go Ahead Eagles':9,'Heracles Almelo':10,'Heracles':10,'FC Groningen':11,'Groningen':11,'Fortuna Sittard':12,'Fortuna':12,'Sparta Rotterdam':13,'Sparta':13,'NAC Breda':14,'NAC':14,'Excelsior Rotterdam':15,'Excelsior':15,'FC Volendam':16,'Volendam':16,'Telstar':17,'PEC Zwolle':18,'PEC':18},
  ll:{'Real Madrid':1,'Real Madrid C.F.':1,'FC Barcelona':2,'Barcelona':2,'Atletico Madrid':3,'Atlético Madrid':3,'Athletic Bilbao':4,'Athletic Club':4,'Villarreal':5,'Villarreal CF':5,'Real Sociedad':6,'Real Betis':7,'Celta Vigo':8,'Celta de Vigo':8,'Sevilla':9,'Sevilla FC':9,'Getafe':10,'Getafe CF':10,'Osasuna':11,'CA Osasuna':11,'Valencia':12,'Valencia CF':12,'Rayo Vallecano':13,'Girona':14,'Girona FC':14,'Mallorca':15,'RCD Mallorca':15,'Elche':16,'Elche CF':16,'Alaves':17,'Deportivo Alaves':17,'Levante':18,'Levante UD':18,'Espanyol':19,'Oviedo':20,'Real Oviedo':20},
  sa:{'Inter':1,'Inter Milano':1,'Napoli':2,'SSC Napoli':2,'Juventus':3,'AC Milan':4,'Milan':4,'Atalanta':5,'Atalanta BC':5,'Lazio':6,'Lazio Rome':6,'Roma':7,'AS Roma':7,'Fiorentina':8,'ACF Fiorentina':8,'Torino':9,'Bologna':10,'Bologna FC':10,'Bologna F.C. 1909':10,'Udinese':11,'Como':12,'Como 1907':12,'Lecce':13,'US Lecce':13,'Verona':14,'Hellas Verona':14,'Cagliari':15,'Parma':16,'Cremonese':17,'US Cremonese':17,'Pisa':18,'Genoa':19,'Sassuolo':20},
  l1:{'PSG':1,'Paris Saint-Germain':1,'Paris Saint-Germain F.C.':1,'Monaco':2,'AS Monaco':2,'Marseille':3,'Olympique Marseille':3,'Lille':4,'Lille OSC':4,'Lyon':5,'Olympique Lyon':5,'Nice':6,'OGC Nice':6,'Lens':7,'Racing Club De Lens':7,'Rennes':8,'Stade Rennais FC':8,'Strasbourg':9,'Strasbourg Alsace':9,'Brest':10,'Stade Brest 29':10,'Toulouse':11,'Toulouse FC':11,'Paris FC':12,'Le Havre':13,'Le Havre AC':13,'Nantes':14,'FC Nantes':14,'Angers':15,'Angers SCO':15,'Auxerre':16,'AJ Auxerre':16,'Metz':17,'FC Metz':17,'Lorient':18,'FC Lorient':18},
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

// ── COMPETITION KEYWORDS voor herkenning ──
const COMP_KEYWORDS = [
  'Eredivisie','Premier League','Bundesliga','Primera División','La Liga',
  'Serie A','Ligue 1','Champions League','Europa League','Conference League',
  'Keuken Kampioen','KNVB Beker','FA Cup','DFB Pokal','Copa del Rey',
  'Nations League','WK Kwalificatie','Football League',
];

// ── PARSER ──
// Werkt op de ruwe HTML — converteert zelf naar een doorzoekbare structuur
function parseMatches(html) {
  const matches = [];

  // Stap 1: verwijder scripts en styles
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');

  // Stap 2: converteer ankertekst naar gewone tekst maar bewaar de tekst
  // [TeamA](url)  [TeamB](url) → TeamA  TeamB
  text = text.replace(/<a[^>]*>([^<]*)<\/a>/gi, '$1');

  // Stap 3: markeer dag-headers
  text = text.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_, inner) => {
    const clean = inner.replace(/<[^>]+>/g, '').trim();
    return `\n__DAY__${clean}\n`;
  });

  // Stap 4: tabelrijen → één regel per rij
  text = text.replace(/<tr[^>]*>/gi, '\n__ROW__');
  text = text.replace(/<td[^>]*>/gi, '__CELL__');

  // Stap 5: strip resterende HTML
  text = text
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g,  '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#\d+;/g, '');

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  let currentDay  = 'Vandaag';
  let currentTime = null;
  let currentComp = null;

  for (const line of lines) {
    // Dag-header
    if (line.startsWith('__DAY__')) {
      currentDay  = line.replace('__DAY__', '').trim();
      currentTime = null;
      currentComp = null;
      continue;
    }

    // Tijdstip (losse regel, bijv "20:00")
    if (/^\d{2}:\d{2}$/.test(line)) {
      currentTime = line;
      continue;
    }

    // Competitienaam (losse regel, geen tabelrij)
    if (!line.startsWith('__ROW__') && COMP_KEYWORDS.some(k => line.includes(k))) {
      currentComp = line.trim();
      continue;
    }

    // Tabelrij
    if (line.startsWith('__ROW__') && currentTime) {
      const cells = line
        .replace('__ROW__', '')
        .split('__CELL__')
        .map(c => c.trim())
        .filter(Boolean);

      // De structuur van iservoetbalvanavond per rij:
      // cel 0: "Logo XLogo X  Logo YLogo Y"  (vlaggen/logo's - skip)
      // cel 1: "- -"  (score placeholder - skip)
      // cel 2: "TeamA  TeamB"  (teamnamen)
      // cel 3: "Zender" of "Zender1  Zender2"

      // Zoek de cel met teamnamen: bevat twee woorden gescheiden door 2+ spaties
      // maar geen "Logo" en geen "- -"
      let teamCell = null;
      let channelCell = null;

      for (let i = 0; i < cells.length; i++) {
        const c = cells[i];
        if (c.includes('Logo') || /^[-\s]+$/.test(c)) continue;

        // Laatste bruikbare cel = zender
        if (i === cells.length - 1 || (i > 1 && !teamCell)) {
          // Als dit de enige overgebleven cel is, is het de zender
          if (teamCell) {
            channelCell = c;
          } else {
            teamCell = c;
          }
        } else {
          teamCell = c;
        }
      }

      // Teamnamen zitten gescheiden door meerdere spaties
      if (!teamCell) continue;
      const teamParts = teamCell.split(/\s{2,}/).map(t => t.trim()).filter(t => t.length > 1);
      if (teamParts.length < 2) continue;

      const home = teamParts[0];
      const away = teamParts[1];
      if (!home || !away || home === away) continue;

      // Zender: pak de laatste cel die geen teamnamen bevat
      // Soms staat de zender ook achter dubbele spatie in dezelfde cel als de teams
      let rawChannel = channelCell;
      if (!rawChannel && teamParts.length > 2) {
        rawChannel = teamParts[teamParts.length - 1];
      }

      // Probeer ook uit de oorspronkelijke cellen de zender te vinden
      if (!rawChannel) {
        const lastUseful = cells.filter(c => !c.includes('Logo') && !/^[-\s]+$/.test(c));
        if (lastUseful.length >= 2) rawChannel = lastUseful[lastUseful.length - 1];
      }

      // Split op dubbele spatie voor meerdere zenders, pak de eerste
      const channelOptions = (rawChannel || '').split(/\s{2,}/).map(c => c.trim()).filter(Boolean);
      // Kies de meest specifieke (bijv. "Ziggo Sport 2" boven "Ziggo Sport")
      const bestChannel = channelOptions.sort((a, b) => b.length - a.length)[0];
      const tv = normalizeChannel(bestChannel);

      const leagueKey = detectLeagueKey(currentComp);
      const stand     = leagueKey ? (STANDINGS[leagueKey] || {}) : {};
      const rH        = stand[home] || null;
      const rA        = stand[away] || null;

      matches.push({
        day:    currentDay,
        time:   currentTime,
        comp:   currentComp || '',
        leagueKey,
        flag:   LEAGUE_FLAGS[leagueKey] || '🌍',
        home, away,
        rH: rH || null,
        rA: rA || null,
        stakeH: leagueKey && rH ? clubStake(leagueKey, rH) : 'mid',
        stakeA: leagueKey && rA ? clubStake(leagueKey, rA) : 'mid',
        tv,
      });
    }
  }

  return matches;
}

// ── HANDLER ──
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate');

  try {
    const response = await fetch(SOURCE_URL, {
      headers: {
        'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'nl-NL,nl;q=0.9',
      },
    });

    if (!response.ok) throw new Error(`Source returned ${response.status}`);

    const html    = await response.text();
    const all     = parseMatches(html);
    const matches = all.filter(m => m.home && m.away && m.home !== m.away);

    res.status(200).json({
      source:     'live',
      fetched_at: new Date().toISOString(),
      count:      matches.length,
      matches,
    });

  } catch (err) {
    console.error('[matches.js] error:', err.message);
    res.status(500).json({
      source:  'error',
      error:   err.message,
      count:   0,
      matches: [],
    });
  }
}
