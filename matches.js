// api/matches.js — v3
// Vercel serverless function
// Haalt live data op van iservoetbalvanavond.nl via markdown-extractie
// ESPN / ESPN 1 = gratis | ESPN 2+ = betaald

const SOURCE_URL = 'https://www.iservoetbalvanavond.nl';

// ── ZENDER NORMALISATIE ──
function normalizeChannel(raw) {
  if (!raw) return null;
  const name  = raw.trim().replace(/\s+/g, ' ');
  const lower = name.toLowerCase();

  if (lower.startsWith('espn')) {
    const digits = name.replace(/\D/g, '');
    const num    = digits ? parseInt(digits) : 1;
    return { label: name, cls: 'espn', free: num <= 1 };
  }
  if (lower.includes('ziggo'))    return { label: name, cls: 'ziggo',   free: false };
  if (lower.includes('viaplay'))  return { label: 'Viaplay', cls: 'viaplay', free: false };
  if (lower.includes('prime'))    return { label: 'Prime Video', cls: 'prime', free: false };
  if (lower.startsWith('npo'))    return { label: name, cls: 'npo',     free: true  };
  if (lower.startsWith('rtl'))    return { label: name, cls: 'npo',     free: true  };
  if (lower.includes('sbs') || lower.includes('veronica'))
                                  return { label: name, cls: 'npo',     free: true  };
  if (lower.includes('disney'))   return { label: 'Disney+', cls: 'other', free: false };
  return { label: name, cls: 'other', free: false };
}

// ── COMPETITIE → KEY ──
function detectLeagueKey(comp) {
  const c = (comp || '').toLowerCase();
  if (c.includes('eredivisie'))        return 'ed';
  if (c.includes('premier league'))    return 'pl';
  if (c.includes('bundesliga'))        return 'bl';
  if (c.includes('primera división') || c.includes('la liga')) return 'll';
  if (c.includes('serie a'))           return 'sa';
  if (c.includes('ligue 1'))           return 'l1';
  if (c.includes('champions league'))  return 'cl';
  if (c.includes('europa league'))     return 'el';
  if (c.includes('conference league')) return 'conf';
  return null;
}

const LEAGUE_FLAGS = {
  ed:'🇳🇱', pl:'🏴󠁧󠁢󠁥󠁮󠁧󠁿', bl:'🇩🇪', ll:'🇪🇸', sa:'🇮🇹', l1:'🇫🇷',
  cl:'🏆', el:'🏆', conf:'🏆',
};

// ── STANDEN (april 2026) ──
const STANDINGS = {
  pl:{'Arsenal FC':1,'Manchester City':2,'Manchester United':3,'Aston Villa':4,'Liverpool FC':5,'Chelsea FC':6,'Brentford FC':7,'Everton FC':8,'Fulham FC':9,'Brighton & Hove Albion':10,'Sunderland AFC':11,'Newcastle United':12,'AFC Bournemouth':13,'Crystal Palace':14,'Leeds United':15,'Nottingham Forest':16,'Tottenham Hotspur':17,'West Ham United':18,'Burnley FC':19,'Wolverhampton Wanderers':20},
  bl:{'Bayern Munich':1,'Bayern München':1,'Borussia Dortmund':2,'VfB Stuttgart':3,'RB Leipzig':4,'TSG Hoffenheim':5,'Bayer Leverkusen':6,'Eintracht Frankfurt':7,'SC Freiburg':8,'Union Berlin':9,'FC Augsburg':10,'FSV Mainz':11,'Hamburger SV':12,'Borussia Monchengladbach':13,'Werder Bremen':14,'1. FC Cologne':15,'FC St. Pauli':16,'VFL Wolfsburg':17,'1. FC Heidenheim':18},
  ed:{'PSV':1,'Feyenoord':2,'NEC':3,'Ajax':4,'FC Twente':5,'AZ':6,'FC Utrecht':7,'sc Heerenveen':8,'Go Ahead Eagles':9,'Heracles Almelo':10,'FC Groningen':11,'Fortuna Sittard':12,'Sparta Rotterdam':13,'NAC Breda':14,'Excelsior Rotterdam':15,'FC Volendam':16,'Telstar':17,'PEC Zwolle':18},
  ll:{'Real Madrid':1,'Real Madrid C.F.':1,'FC Barcelona':2,'Atletico Madrid':3,'Atlético Madrid':3,'Athletic Bilbao':4,'Villarreal CF':5,'Real Sociedad':6,'Real Betis':7,'Celta Vigo':8,'Celta de Vigo':8,'Sevilla FC':9,'Getafe CF':10,'CA Osasuna':11,'Valencia CF':12,'Rayo Vallecano':13,'Girona FC':14,'RCD Mallorca':15,'Elche CF':16,'Deportivo Alaves':17,'Levante UD':18,'Espanyol':19,'Real Oviedo':20},
  sa:{'Inter Milano':1,'SSC Napoli':2,'Juventus Turin':3,'Juventus':3,'AC Milan':4,'Atalanta BC':5,'Lazio Rome':6,'AS Roma':7,'Roma':7,'ACF Fiorentina':8,'Fiorentina':8,'Torino FC':9,'Bologna FC':10,'Bologna F.C. 1909':10,'Udinese Calcio':11,'Como 1907':12,'US Lecce':13,'Hellas Verona':14,'Cagliari Calcio':15,'Parma Calcio':16,'US Cremonese':17,'Pisa SC':18,'Genoa CFC':19,'Sassuolo Calcio':20},
  l1:{'Paris Saint-Germain':1,'AS Monaco':2,'Olympique Marseille':3,'Lille OSC':4,'Olympique Lyon':5,'OGC Nice':6,'Racing Club De Lens':7,'Stade Rennais FC':8,'Strasbourg Alsace':9,'Stade Brest 29':10,'Toulouse FC':11,'Paris FC':12,'Le Havre AC':13,'FC Nantes':14,'Angers SCO':15,'AJ Auxerre':16,'FC Metz':17,'FC Lorient':18},
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

// ── PARSER ──
// De markdown-extractie geeft ons:
//   ## Vandaag / ## Morgen / ## Woensdag 15 april
//   20:00
//   Competitienaam
//   | [TeamA](url)  [TeamB](url) | - - | ... | Zender |
function parseMatches(markdown) {
  const matches = [];
  const lines   = markdown.split('\n').map(l => l.trim()).filter(Boolean);

  const COMP_KEYWORDS = [
    'Eredivisie','Premier League','Bundesliga','Primera División','La Liga',
    'Serie A','Ligue 1','Champions League','Europa League','Conference League',
    'Keuken Kampioen','KNVB Beker','FA Cup','DFB Pokal','Copa del Rey',
    'Nations League','WK Kwalificatie',
  ];

  // Regex: [Team naam](url)
  const TEAM_RE = /\[([^\]]+)\]\([^)]+\)/g;

  let currentDay  = 'Vandaag';
  let currentTime = null;
  let currentComp = null;

  for (const line of lines) {
    // ── Dag-header: ## Vandaag / ## Morgen / ## Woensdag 15 april
    if (/^##\s/.test(line)) {
      currentDay  = line.replace(/^##\s*/, '').trim();
      currentTime = null;
      currentComp = null;
      continue;
    }

    // ── Tijdstip: 20:00
    if (/^\d{2}:\d{2}$/.test(line)) {
      currentTime = line;
      continue;
    }

    // ── Competitienaam
    if (COMP_KEYWORDS.some(k => line.includes(k)) && !line.startsWith('|')) {
      currentComp = line.trim();
      continue;
    }

    // ── Tabelrij: begint met |
    if (line.startsWith('|') && currentTime) {
      // Extraheer alle teamnamen uit markdown links
      const teamMatches = [...line.matchAll(TEAM_RE)];
      const teams = teamMatches.map(m => m[1].trim());

      // Zendernaam: laatste cel van de tabelrij, na de laatste |
      // Iservoetbalvanavond heeft soms meerdere zenders: "Viaplay TV  Viaplay"
      // We pakken de eerste herkenbare zender
      const cells = line.split('|').map(c => c.trim()).filter(Boolean);
      const lastCell = cells[cells.length - 1];

      // Splits op dubbele spatie — meerdere zenders mogelijk
      const channelParts = lastCell.split(/\s{2,}/).map(p => p.trim()).filter(Boolean);
      // Normaliseer alle gevonden zenders, pak de meest specifieke (met kanaalnummer)
      const tvOptions = channelParts
        .map(p => normalizeChannel(p))
        .filter(Boolean);

      // Kies de meest informatieve: bij meerdere neem de eerste die geen 'Viaplay TV' is
      const tv = tvOptions.find(t => t.label !== 'Viaplay TV') || tvOptions[0];

      // Verwerk per paar teams (iservoetbalvanavond toont soms meerdere wedstrijden per rij-blok)
      // Elke twee teams = één wedstrijd
      for (let i = 0; i + 1 < teams.length; i += 2) {
        const home = teams[i];
        const away = teams[i + 1];
        if (!home || !away || home === away) continue;

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
          rH: rH || '?',
          rA: rA || '?',
          stakeH: leagueKey && rH ? clubStake(leagueKey, rH) : 'mid',
          stakeA: leagueKey && rA ? clubStake(leagueKey, rA) : 'mid',
          tv: tv || { label: '?', cls: 'other', free: false },
        });
      }
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
        'User-Agent':      'Mozilla/5.0 (compatible; Games2WatchBot/1.0; +https://games2watch.eu)',
        'Accept':          'text/html,application/xhtml+xml',
        'Accept-Language': 'nl-NL,nl;q=0.9',
        'Cache-Control':   'no-cache',
      },
    });

    if (!response.ok) throw new Error(`Source returned ${response.status}`);

    const html = await response.text();

    // Converteer HTML naar markdown (zoals de web_fetch tool doet)
    const markdown = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      // Bewaar ankertekst als markdown link: [tekst](url)
      .replace(/<a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi, '[$2]($1)')
      .replace(/<h2[^>]*>/gi, '\n## ')
      .replace(/<\/h2>/gi, '\n')
      .replace(/<tr[^>]*>/gi, '\n')
      .replace(/<td[^>]*>/gi, ' | ')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g,  '&')
      .replace(/&nbsp;/g, ' ')
      .replace(/&#\d+;/g, '')
      .replace(/[ \t]{3,}/g, '  ')
      .trim();

    const all = parseMatches(markdown);

    // Filter: geen "Vandaag" als dat al voorbij is — altijd vanaf nu
    // Sla "Uitslagen"-sectie over (valt buiten de dag-headers op de hoofdpagina)
    const filtered = all.filter(m => m.home && m.away);

    res.status(200).json({
      source:     'iservoetbalvanavond.nl',
      fetched_at: new Date().toISOString(),
      count:      filtered.length,
      matches:    filtered,
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
