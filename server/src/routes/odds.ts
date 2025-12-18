/**
 * Odds API Routes
 *
 * Provides cached access to The Odds API for NCAAF betting lines
 */

import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth';
import cacheService, { CACHE_TTL } from '../services/cacheService';
import {
  fetchNCAAFOdds,
  parseOddsEvents,
  isOddsApiConfigured,
  OddsEvent,
  ParsedOdds,
} from '../services/oddsClient';

const router = Router();

// Helper for async route handlers
const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) =>
  (req: Request, res: Response, next: NextFunction) => Promise.resolve(fn(req, res, next)).catch(next);

// Extended odds interface with moneyline
interface ExtendedOdds extends ParsedOdds {
  homeMoneyline: number | null;
  awayMoneyline: number | null;
}

/**
 * Parse odds with both spreads and moneylines
 */
function parseOddsWithMoneyline(events: OddsEvent[]): ExtendedOdds[] {
  return events.map((event) => {
    let spread: number | null = null;
    let homeMoneyline: number | null = null;
    let awayMoneyline: number | null = null;
    let favoriteTeam: 'home' | 'away' | null = null;
    let bookmaker: string | null = null;

    // Preferred bookmakers in order
    const preferredBookmakers = ['draftkings', 'fanduel', 'betmgm', 'pointsbetus'];

    for (const prefKey of preferredBookmakers) {
      const bm = event.bookmakers.find((b) => b.key === prefKey);
      if (bm) {
        // Get spread
        const spreadMarket = bm.markets.find((m) => m.key === 'spreads');
        if (spreadMarket && spread === null) {
          const homeOutcome = spreadMarket.outcomes.find((o) => o.name === event.home_team);
          if (homeOutcome && homeOutcome.point !== undefined) {
            spread = homeOutcome.point;
            favoriteTeam = spread < 0 ? 'home' : spread > 0 ? 'away' : null;
            bookmaker = bm.title;
          }
        }

        // Get moneyline (h2h)
        const h2hMarket = bm.markets.find((m) => m.key === 'h2h');
        if (h2hMarket && homeMoneyline === null) {
          const homeH2h = h2hMarket.outcomes.find((o) => o.name === event.home_team);
          const awayH2h = h2hMarket.outcomes.find((o) => o.name === event.away_team);
          if (homeH2h) homeMoneyline = homeH2h.price;
          if (awayH2h) awayMoneyline = awayH2h.price;
          if (!bookmaker) bookmaker = bm.title;
        }

        if (spread !== null && homeMoneyline !== null) break;
      }
    }

    // Fall back to first available bookmaker
    if ((spread === null || homeMoneyline === null) && event.bookmakers.length > 0) {
      for (const bm of event.bookmakers) {
        if (spread === null) {
          const spreadMarket = bm.markets.find((m) => m.key === 'spreads');
          if (spreadMarket) {
            const homeOutcome = spreadMarket.outcomes.find((o) => o.name === event.home_team);
            if (homeOutcome && homeOutcome.point !== undefined) {
              spread = homeOutcome.point;
              favoriteTeam = spread < 0 ? 'home' : spread > 0 ? 'away' : null;
              if (!bookmaker) bookmaker = bm.title;
            }
          }
        }

        if (homeMoneyline === null) {
          const h2hMarket = bm.markets.find((m) => m.key === 'h2h');
          if (h2hMarket) {
            const homeH2h = h2hMarket.outcomes.find((o) => o.name === event.home_team);
            const awayH2h = h2hMarket.outcomes.find((o) => o.name === event.away_team);
            if (homeH2h) homeMoneyline = homeH2h.price;
            if (awayH2h) awayMoneyline = awayH2h.price;
            if (!bookmaker) bookmaker = bm.title;
          }
        }

        if (spread !== null && homeMoneyline !== null) break;
      }
    }

    return {
      oddsEventId: event.id,
      homeTeam: event.home_team,
      awayTeam: event.away_team,
      commenceTime: new Date(event.commence_time),
      spread,
      homeMoneyline,
      awayMoneyline,
      favoriteTeam,
      bookmaker,
      timestamp: new Date(),
    };
  });
}

/**
 * GET /api/odds/ncaaf
 *
 * Get current NCAAF odds (spreads + moneylines)
 * Heavily cached to protect free tier quota (500/month)
 */
router.get('/ncaaf', authenticate, asyncHandler(async (req: Request, res: Response) => {
  // Check if API is configured
  if (!isOddsApiConfigured()) {
    return res.status(503).json({
      error: 'Odds API not configured',
      message: 'ODDS_API_KEY environment variable is not set',
      games: [],
    });
  }

  const cacheKey = 'odds:ncaaf:all';

  // Check cache first (important for rate limiting)
  const cached = cacheService.get<ExtendedOdds[]>(cacheKey);
  if (cached) {
    console.log('[Odds] Cache hit - returning cached odds');
    return res.json({
      games: cached,
      cached: true,
      cacheExpiresIn: CACHE_TTL.ODDS_API,
    });
  }

  console.log('[Odds] Cache miss - fetching fresh odds');

  try {
    // Fetch both spreads and h2h in one call
    const events = await fetchNCAAFOdds(['spreads', 'h2h']);
    const parsedOdds = parseOddsWithMoneyline(events);

    // Cache for 15 minutes
    cacheService.set(cacheKey, parsedOdds, CACHE_TTL.ODDS_API);

    res.json({
      games: parsedOdds,
      cached: false,
      count: parsedOdds.length,
    });
  } catch (error: any) {
    console.error('[Odds] API error:', error.message);

    // Check if it's a quota error
    if (error.message.includes('401') || error.message.includes('403')) {
      return res.status(503).json({
        error: 'Odds API unavailable',
        message: 'API key may be invalid or quota exceeded',
        games: [],
      });
    }

    throw error;
  }
}));

/**
 * GET /api/odds/ncaaf/game/:homeTeam/:awayTeam
 *
 * Get odds for a specific game by team names
 */
router.get('/ncaaf/game/:homeTeam/:awayTeam', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const { homeTeam, awayTeam } = req.params;

  if (!isOddsApiConfigured()) {
    return res.status(503).json({
      error: 'Odds API not configured',
      message: 'ODDS_API_KEY environment variable is not set',
    });
  }

  // First try to get from cache
  const cacheKey = 'odds:ncaaf:all';
  let odds = cacheService.get<ExtendedOdds[]>(cacheKey);

  if (!odds) {
    // Fetch fresh data
    const events = await fetchNCAAFOdds(['spreads', 'h2h']);
    odds = parseOddsWithMoneyline(events);
    cacheService.set(cacheKey, odds, CACHE_TTL.ODDS_API);
  }

  // Find the game (fuzzy match on team names)
  const normalizeTeamName = (name: string) =>
    name.toLowerCase().replace(/[^a-z0-9]/g, '');

  const homeNorm = normalizeTeamName(homeTeam);
  const awayNorm = normalizeTeamName(awayTeam);

  const game = odds.find((g) => {
    const gHomeNorm = normalizeTeamName(g.homeTeam);
    const gAwayNorm = normalizeTeamName(g.awayTeam);

    return (
      (gHomeNorm.includes(homeNorm) || homeNorm.includes(gHomeNorm)) &&
      (gAwayNorm.includes(awayNorm) || awayNorm.includes(gAwayNorm))
    );
  });

  if (!game) {
    return res.status(404).json({
      error: 'Game not found',
      message: `No odds found for ${homeTeam} vs ${awayTeam}`,
    });
  }

  res.json(game);
}));

/**
 * GET /api/odds/status
 *
 * Get Odds API configuration status
 */
router.get('/status', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const isConfigured = isOddsApiConfigured();
  const cacheStats = cacheService.getStats();
  const oddsKeys = cacheStats.keys.filter(k => k.startsWith('odds:'));

  res.json({
    configured: isConfigured,
    cacheTTL: CACHE_TTL.ODDS_API,
    cachedGames: oddsKeys.length > 0,
  });
}));

export default router;
