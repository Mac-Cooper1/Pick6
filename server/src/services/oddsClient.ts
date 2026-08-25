/**
 * The Odds API Client for NCAAF Betting Lines
 *
 * Fetches spread data to determine favorites/underdogs for upset detection.
 *
 * API Docs: https://the-odds-api.com/
 * Sport key: americanfootball_ncaaf
 */

const ODDS_API_BASE_URL = 'https://api.the-odds-api.com/v4';
const NCAAF_SPORT_KEY = 'americanfootball_ncaaf';

// Get API key from environment
function getApiKey(): string {
  const key = process.env.ODDS_API_KEY;
  if (!key) {
    throw new Error('ODDS_API_KEY environment variable is not set');
  }
  return key;
}

export interface OddsTeam {
  name: string;
}

export interface OddsOutcome {
  name: string;
  price: number;
  point?: number; // Spread value (e.g., -7.5 or +7.5)
}

export interface OddsMarket {
  key: string; // 'spreads', 'h2h', 'totals'
  outcomes: OddsOutcome[];
}

export interface OddsBookmaker {
  key: string;
  title: string;
  last_update: string;
  markets: OddsMarket[];
}

export interface OddsEvent {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: OddsBookmaker[];
}

export interface ParsedOdds {
  oddsEventId: string;
  homeTeam: string;
  awayTeam: string;
  commenceTime: Date;
  spread: number | null; // Home team spread (negative = home favored)
  favoriteTeam: 'home' | 'away' | null;
  bookmaker: string | null;
  timestamp: Date;
}

/**
 * Fetch odds for NCAAF games
 * @param markets - Array of markets to fetch (default: spreads)
 * @param regions - Regions for bookmakers (default: us)
 */
export async function fetchNCAAFOdds(
  markets: string[] = ['spreads'],
  regions: string = 'us'
): Promise<OddsEvent[]> {
  const apiKey = getApiKey();

  const url = new URL(`${ODDS_API_BASE_URL}/sports/${NCAAF_SPORT_KEY}/odds`);
  url.searchParams.set('apiKey', apiKey);
  url.searchParams.set('regions', regions);
  url.searchParams.set('markets', markets.join(','));
  url.searchParams.set('oddsFormat', 'american');

  console.log(`[Odds API] Fetching NCAAF odds...`);

  const response = await fetch(url.toString());

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Odds API error: ${response.status} - ${errorText}`);
  }

  // Log remaining quota from headers
  const remaining = response.headers.get('x-requests-remaining');
  const used = response.headers.get('x-requests-used');
  if (remaining) {
    console.log(`[Odds API] Quota: ${used} used, ${remaining} remaining`);
  }

  const data = await response.json();
  return data as OddsEvent[];
}

/**
 * Fetch spreads only
 */
export async function fetchNCAAFSpreads(): Promise<OddsEvent[]> {
  return fetchNCAAFOdds(['spreads']);
}

/**
 * Parse odds events into normalized format
 */
export function parseOddsEvents(events: OddsEvent[]): ParsedOdds[] {
  return events.map((event) => {
    // Find the first bookmaker with spread data
    let spread: number | null = null;
    let favoriteTeam: 'home' | 'away' | null = null;
    let bookmaker: string | null = null;

    // Preferred bookmakers in order
    const preferredBookmakers = ['draftkings', 'fanduel', 'betmgm', 'pointsbetus'];

    for (const prefKey of preferredBookmakers) {
      const bm = event.bookmakers.find((b) => b.key === prefKey);
      if (bm) {
        const spreadMarket = bm.markets.find((m) => m.key === 'spreads');
        if (spreadMarket) {
          const homeOutcome = spreadMarket.outcomes.find((o) => o.name === event.home_team);
          if (homeOutcome && homeOutcome.point !== undefined) {
            spread = homeOutcome.point;
            // Negative spread means that team is favored
            favoriteTeam = spread < 0 ? 'home' : spread > 0 ? 'away' : null;
            bookmaker = bm.title;
            break;
          }
        }
      }
    }

    // Fall back to first available bookmaker
    if (spread === null && event.bookmakers.length > 0) {
      for (const bm of event.bookmakers) {
        const spreadMarket = bm.markets.find((m) => m.key === 'spreads');
        if (spreadMarket) {
          const homeOutcome = spreadMarket.outcomes.find((o) => o.name === event.home_team);
          if (homeOutcome && homeOutcome.point !== undefined) {
            spread = homeOutcome.point;
            favoriteTeam = spread < 0 ? 'home' : spread > 0 ? 'away' : null;
            bookmaker = bm.title;
            break;
          }
        }
      }
    }

    return {
      oddsEventId: event.id,
      homeTeam: event.home_team,
      awayTeam: event.away_team,
      commenceTime: new Date(event.commence_time),
      spread,
      favoriteTeam,
      bookmaker,
      timestamp: new Date(),
    };
  });
}

/**
 * Convenience function to get parsed spreads
 */
export async function getNCAAFSpreads(): Promise<ParsedOdds[]> {
  const events = await fetchNCAAFSpreads();
  return parseOddsEvents(events);
}

/**
 * Check if Odds API is configured
 */
export function isOddsApiConfigured(): boolean {
  return !!process.env.ODDS_API_KEY;
}

/**
 * Get available sports (useful for debugging)
 */
export async function getAvailableSports(): Promise<any[]> {
  const apiKey = getApiKey();
  const url = `${ODDS_API_BASE_URL}/sports?apiKey=${apiKey}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Odds API error: ${response.status}`);
  }

  return response.json() as Promise<any[]>;
}
