// api/tv.js
// Haalt TV-zenderinfo op van iservoetbalvanavond.nl
// Geeft een lookup terug: { "Manchester United|Leeds United": { label: "Viaplay", ... } }
// Gecached 6 uur zodat het snel is

const SOURCE_URL = 'https://www.iservoetbalvanavond.nl';

function normalizeChannel(raw) {
  if (!raw) return null;
  const name  = raw.trim().replace(/\s+/g, ' ');
  const lower = name.toLowerCase();
  if (lower.startsWith('espn')) {
    const num = parseInt(name.replace(/\D/g,'')) || 1;
    return { label: name, cls: 'espn', free: num <= 1 };
  }
  if (lower.includes('ziggo'))   return { label: name,          cls: 'ziggo',   free: false };
  if (lower.includes('viaplay')) {
    // "Viaplay TV" is de gratis lineaire zender
    const isTV = lower.includes('viaplay tv');
    return { label: name, cls: 'viaplay', free: isTV };
  }
  if (lower.includes('prime'))   return { label: 'Prime Video', cls: 'prime',   free: false };
  if (lower.startsWith('npo'))   return { label: name,          cls: 'npo',     free: true  };
  if (lower.startsWith('rtl'))   return { label: name,          cls: 'npo',     free: true  };
  if (lower.includes('disney'))  return { label: 'Disney+',     cls: 'other',   free: false };
  return { label: name, cls: 'other', free: false };
}

// Maak een lookup key van twee teamnamen
function matchKey(home, away) {
  return `${home.toLowerCase().trim()}|${away.toLowerCase().trim()}`;
}

// Parse de HTML van iservoetbalvanavond.nl
// De structuur zoals we die via markdown zien:
//   ## Vandaag / ## Morgen / ## Woensdag 15 april
//   HH:MM
//   [TeamA](url)  [TeamB](url)  → cel 3
//   Zender → cel 4 (of als link-tekst)
function parseTVData(html) {
  const lookup = {}; // key: "teamA|teamB" → tv object

  // Stap 1: strip scripts/styles
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');

  // Stap 2: bewaar ankertekst — teamnamen en zenders staan als linktekst
  // [TeamA](url) formaat
  text = text.replace(/<a[^>]*href="([^"]*)"[^>]*>\s*([^<]+?)\s*<\/a>/gi, (_, href, content) => {
    return content.trim();
  });

  // Stap 3: markeer structuur
  text = text
    .replace(/<h2[^>]*>/gi, '\n__H2__')
    .replace(/<\/h2>/gi, '\n')
    .replace(/<tr[^>]*>/gi, '\n__TR__')
    .replace(/<td[^>]*>/gi, '__TD__')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g,  '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#\d+;/g, '');

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  let currentTime = null;

  for (const line of lines) {
    // Tijdstip
    if (/^\d{2}:\d{2}$/.test(line)) {
      currentTime = line;
      continue;
    }

    // Tabelrij
    if (line.startsWith('__TR__') && currentTime) {
      // Splits op __TD__
      const cells = line
        .replace('__TR__', '')
        .split('__TD__')
        .map(c => c.trim().replace(/\s+/g, ' '))
        .filter(c => c.length > 0);

      // Zoek teamnamen: twee namen gescheiden door 2+ spaties, zonder "Logo"
      let teamPair = null;
      let channelStr = null;

      for (let i = 0; i < cells.length; i++) {
        const c = cells[i];

        // Skip logo-cellen en score-cellen
        if (c.includes('Logo') || /^[\d\s\-–]+$/.test(c)) continue;

        // Zoek cel met twee teamnamen (gescheiden door 2+ spaties)
        const parts = c.split(/\s{2,}/).map(p => p.trim()).filter(p => p.length > 1 && !p.includes('Logo'));
        if (parts.length >= 2 && !teamPair) {
          teamPair = [parts[0], parts[1]];

          // Soms staat de zender ook in dezelfde cel na de teams
          if (parts.length > 2) {
            channelStr = parts[parts.length - 1];
          }
          continue;
        }

        // Laatste bruikbare cel = zender
        if (teamPair && c.length > 0 && c.length < 40 && !c.includes('Logo')) {
          // Meerdere zenders mogelijk, gescheiden door 2+ spaties
          const channelParts = c.split(/\s{2,}/).map(p => p.trim()).filter(Boolean);
          if (channelParts.length > 0) {
            channelStr = channelParts[0]; // Pak de eerste (meest prominente)
          }
        }
      }

      if (teamPair && channelStr) {
        const tv = normalizeChannel(channelStr);
        if (tv) {
          const key = matchKey(teamPair[0], teamPair[1]);
          lookup[key] = tv;
        }
      }
    }
  }

  return lookup;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  // Cache 6 uur — TV-programmering verandert niet per uur
  res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=3600');

  try {
    const response = await fetch(SOURCE_URL, {
      headers: {
        'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'nl-NL,nl;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection':      'keep-alive',
        'Cache-Control':   'no-cache',
      },
    });

    if (!response.ok) throw new Error(`Source returned ${response.status}`);

    const html   = await response.text();
    const lookup = parseTVData(html);

    res.status(200).json({
      source:     'iservoetbalvanavond.nl',
      fetched_at: new Date().toISOString(),
      count:      Object.keys(lookup).length,
      lookup,
    });

  } catch (err) {
    console.error('[tv.js] error:', err.message);
    // Bij fout: lege lookup teruggeven zodat matches.js gewoon doorgaat
    res.status(200).json({
      source:  'error',
      error:   err.message,
      count:   0,
      lookup:  {},
    });
  }
}
