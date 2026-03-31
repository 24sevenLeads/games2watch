// api/matches.js
// Vercel serverless function
// Haalt aankomende wedstrijden live op van iservoetbalvanavond.nl
// De zendernaam (bijv. "ESPN 2", "Ziggo Sport 3") komt RECHTSTREEKS uit de bron.
// ESPN / ESPN 1 = gratis voor Ziggo-klanten
// ESPN 2–5 = betaald (ESPN Compleet)

const SOURCE_URL = 'https://www.iservoetbalvanavond.nl';

// ── ZENDER NORMALISATIE ──
function normalizeChannel(raw) {
  if (!raw) return { label: '?', cls: 'other', free: false };
  const name  = raw.trim().replace(/\s+/g, ' ');
  const lower = name.toLowerCase();

  // ESPN — gratis alleen op ESPN 1 / ESPN (zonder nummer)
  if (lower.startsWith('espn')) {
    const digits = name.replace(/\D/g, '');
    const num    = digits ? parseInt(digits) : 1;
    return { label: name, cls: 'espn', free: num <= 1 };
  }

  // Ziggo Sport (alle kanalen) — betaald
  if (lower.includes('ziggo')) {
    return { label: name, cls: 'ziggo', free: false };
  }

  // Viaplay — betaald
  if (lower.includes('viaplay')) {
    return { label: 'Viaplay', cls: 'viaplay', free: false };
  }

  // Prime Video — betaald
  if (lower.includes('prime')) {
    return { label: 'Prime Video', cls: 'prime', free: false };
  }

  // NPO — gratis
  if (lower.startsWith('npo')) {
    return { label: name, cls: 'npo', free: true };
  }

  // RTL / SBS / Veronica — gratis
  if (lower.startsWith('rtl') || lower.includes('sbs') || lower.includes('veronica')) {
    return { label: name, cls: 'npo', free: true };
  }

  // Disney+ — betaald
  if (lower.includes('disney')) {
    return { label: 'Disney+', cls: 'other', free: false };
  }

  return { label: name, cls: 'other', free: false };
}

// ── COMPETITIE → LEAGUE KEY ──
function detectLeagueKey(comp) {
  const c = (comp || '').toLowerCase();
  if (c.includes('eredivisie'))        return 'ed';
  if (c.includes('premier league'))    return 'pl';
  if (c.includes('bundesliga'))        return 'bl';
  if (c.includes('la liga'))           return 'll';
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

// ── STANDEN (april 2026) — update elk nieuw seizoen ──
const STANDINGS = {
  pl:{'Arsenal FC':1,'Manchester City':2,'Manchester United':3,'Aston Villa':4,'Liverpool FC':5,'Chelsea FC':6,'Brentford FC':7,'Everton FC':8,'Fulham FC':9,'Brighton & Hove Albion':10,'Sunderland AFC':11,'Newcastle United':12,'AFC Bournemouth':13,'Crystal Palace':14,'Leeds United':15,'Nottingham Forest':16,'Tottenham Hotspur':17,'West Ham United':18,'Burnley FC':19,'Wolverhampton Wanderers':20},
  bl:{'Bayern Munich':1,'Borussia Dortmund':2,'VfB Stuttgart':3,'RB Leipzig':4,'TSG Hoffenheim':5,'Bayer Leverkusen':6,'Eintracht Frankfurt':7,'SC Freiburg':8,'Union Berlin':9,'FC Augsburg':10,'FSV Mainz':11,'Hamburger SV':12,'Borussia Monchengladbach':13,'Werder Bremen':14,'1. FC Cologne':15,'FC St. Pauli':16,'VFL Wolfsburg':17,'1. FC Heidenheim':18},
  ed:{'PSV':1,'Feyenoord':2,'NEC':3,'Ajax':4,'FC Twente':5,'AZ':6,'FC Utrecht':7,'sc Heerenveen':8,'Go Ahead Eagles':9,'Heracles Almelo':10,'FC Groningen':11,'Fortuna Sittard':12,'Sparta Rotterdam':13,'NAC Breda':14,'Excelsior Rotterdam':15,'FC Volendam':16,'Telstar':17,'PEC Zwolle':18},
  ll:{'Real Madrid':1,'FC Barcelona':2,'Atletico Madrid':3,'Athletic Bilbao':4,'Villarreal CF':5,'Real Sociedad':6,'Real Betis':7,'Celta Vigo':8,'Sevilla FC':9,'Getafe CF':10,'CA Osasuna':11,'Valencia CF':12,'Rayo Vallecano':13,'Girona FC':14,'RCD Mallorca':15,'Elche CF':16,'Deportivo Alaves':17,'Levante UD':18,'Espanyol':19,'Real Oviedo':20},
  sa:{'Inter Milano':1,'SSC Napoli':2,'Juventus Turin':3,'AC Milan':4,'Atalanta BC':5,'Lazio Rome':6,'AS Roma':7,'ACF Fiorentina':8,'Torino FC':9,'Bologna FC':10,'Udinese Calcio':11,'Como 1907':12,'US Lecce':13,'Hellas Verona':14,'Cagliari Calcio':15,'Parma Calcio':16,'US Cremonese':17,'Pisa SC':18,'Genoa CFC':19,'Sassuolo Calcio':20},
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
  if (!zones) return 'mid';
  const last = zones[zones.length - 1];
  if (rank >= (last.rDir || last.total - 1)) return 'rel-dir';
  if (rank >= (last.rPO  || last.total - 2)) return 'rel-po';
  for (const z of zones.slice(0, -1)) if (rank <= z.max) return z.key;
  return 'mid';
}

// ── HTML PARSER ──
// iservoetbalvanavond.nl structuur:
//   <h2>Datum</h2>
//   HH:MM
//   [optioneel: Competitienaam]
//   <tr><td>vlaggen</td><td>- -</td><td>Team A  Team B</td><td>Zender</td></tr>

function parseMatches(html) {
  // Stap 1: strip scripts/styles
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');

  // Stap 2: bewaar ankertekst (zendernamen staan soms in links)
  text = text.replace(/<a[^>]*>([^<]*)<\/a>/gi, '$1');

  // Stap 3: markeer structurele elementen
  text = text
    .replace(/<h2[^>]*>/gi,  '\n[DAY] ')
    .replace(/<\/h2>/gi,      '\n')
    .replace(/<tr[^>]*>/gi,   '\n[ROW] ')
    .replace(/<td[^>]*>/gi,   '[TD]')
    .replace(/<[^>]+>/g,      '')
    .replace(/&amp;/g,  '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#\d+;/g, '');

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  const matches   = [];
  const COMP_NAMES = ['Eredivisie','Premier League','Bundesliga','La Liga','Serie A',
    'Ligue 1','Champions League','Europa League','Conference League',
    'Keuken Kampioen','KNVB Beker','FA Cup','DFB Pokal','Copa del Rey',
    'WK Kwalificatie','Nations League'];

  let currentDay  = 'Komend';
  let currentTime = null;
  let currentComp = null;

  for (const line of lines) {
    // Dag-header
    if (line.startsWith('[DAY]')) {
      currentDay  = line.replace('[DAY]', '').trim();
      currentTime = null;
      continue;
    }

    // Tijdstip
    if (/^\d{2}:\d{2}$/.test(line)) {
      currentTime = line;
      continue;
    }

    // Competitienaam
    if (COMP_NAMES.some(p => line.includes(p))) {
      currentComp = line.trim();
      continue;
    }

    // Tabelrij met wedstrijdinfo
    if (line.startsWith('[ROW]') && currentTime) {
      const cells = line
        .replace('[ROW]', '')
        .split('[TD]')
        .map(c => c.trim())
        .filter(c => c.length > 0 && !c.match(/^[-\s]+$/) && !c.includes('Vlag') && !c.includes('Logo'));

      // Zoek teamcel (bevat twee teamnamen gescheiden door dubbele spatie of newline)
      let home = null, away = null, broadcaster = null;

      for (let i = 0; i < cells.length; i++) {
        const cell = cells[i];

        // Teamcel: bevat '  ' (dubbele spatie) of newline tussen twee namen
        const parts = cell.split(/\s{2,}|\n/).map(p => p.trim()).filter(p => p.length > 1);
        if (parts.length >= 2 && !home) {
          home = parts[0];
          away = parts[1];
          continue;
        }

        // Broadcaster: laatste cel, kort, geen teamachtige inhoud
        if (i === cells.length - 1 && cell.length < 30 && cell.length > 1) {
          broadcaster = cell;
        }
      }

      // Fallback: als er geen duidelijke teamcel was, pak eerste twee losse cellen als teamnamen
      if (!home && cells.length >= 2) {
        home        = cells[0];
        away        = cells[1];
        broadcaster = cells[cells.length - 1] !== home ? cells[cells.length - 1] : null;
      }

      if (home && away && home !== away && home.length > 1) {
        const leagueKey = detectLeagueKey(currentComp);
        const stand     = leagueKey ? (STANDINGS[leagueKey] || {}) : {};
        const rH        = stand[home] || 9;
        const rA        = stand[away] || 9;
        const tv        = normalizeChannel(broadcaster);

        matches.push({
          day:    currentDay,
          time:   currentTime,
          comp:   currentComp || '',
          leagueKey,
          flag:   LEAGUE_FLAGS[leagueKey] || '🌍',
          home, away, rH, rA,
          stakeH: leagueKey ? clubStake(leagueKey, rH) : 'mid',
          stakeA: leagueKey ? clubStake(leagueKey, rA) : 'mid',
          tv,
        });
      }
    }
  }

  return matches;
}

// ── HANDLER ──
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate');

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

    const html    = await response.text();
    const all     = parseMatches(html);

    // Alleen toekomstige wedstrijden — filter dagheaders die op het verleden wijzen
    const PAST_MARKERS = ['gisteren', 'eerder', 'vorige'];
    const upcoming = all.filter(m =>
      !PAST_MARKERS.some(p => m.day.toLowerCase().includes(p))
    );

    res.status(200).json({
      source:     'iservoetbalvanavond.nl',
      fetched_at: new Date().toISOString(),
      count:      upcoming.length,
      matches:    upcoming,
    });

  } catch (err) {
    console.error('[matches.js] error:', err.message);
    res.status(200).json({
      source:     'error',
      fetched_at: new Date().toISOString(),
      count:      0,
      matches:    [],
      error:      err.message,
    });
  }
}
