/**
 * College Football API Routes
 *
 * Provides cached access to ESPN scoreboard data
 */

import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth';
import cacheService, { CACHE_TTL } from '../services/cacheService';
import {
  fetchScoreboard,
  fetchScoreboardByDate,
  fetchGameSummary,
  parseScoreboardGames,
  fetchRankings,
  ParsedGame,
  RankingsResponse,
} from '../services/espnClient';

const router = Router();

// Helper for async route handlers
const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) =>
  (req: Request, res: Response, next: NextFunction) => Promise.resolve(fn(req, res, next)).catch(next);

/**
 * GET /api/cfb/scoreboard
 *
 * Query params:
 * - week: Week number (1-15+)
 * - season: Season year (default: current year)
 * - dates: YYYYMMDD or YYYYMMDD-YYYYMMDD range
 */
router.get('/scoreboard', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const { week, season, dates } = req.query;

  const seasonYear = season ? parseInt(season as string, 10) : new Date().getFullYear();
  const weekNumber = week ? parseInt(week as string, 10) : undefined;

  // Build cache key
  let cacheKey: string;
  if (dates) {
    cacheKey = `espn:scoreboard:dates:${dates}`;
  } else if (weekNumber) {
    cacheKey = `espn:scoreboard:${seasonYear}:week:${weekNumber}`;
  } else {
    cacheKey = `espn:scoreboard:${seasonYear}:current`;
  }

  // Check cache
  const cached = cacheService.get<ParsedGame[]>(cacheKey);
  if (cached) {
    console.log(`[CFB] Cache hit: ${cacheKey}`);
    return res.json({
      games: cached,
      cached: true,
      cacheKey,
    });
  }

  console.log(`[CFB] Cache miss: ${cacheKey}`);

  let games: ParsedGame[];

  if (dates) {
    // Fetch by date range
    const dateStr = dates as string;
    const [startDate, endDate] = dateStr.includes('-') ? dateStr.split('-') : [dateStr, undefined];
    const response = await fetchScoreboardByDate(startDate, endDate);
    games = parseScoreboardGames(response, seasonYear, weekNumber || 1);
  } else if (weekNumber) {
    // Fetch by week
    const response = await fetchScoreboard(seasonYear, weekNumber);
    games = parseScoreboardGames(response, seasonYear, weekNumber);
  } else {
    // Fetch current/default
    const response = await fetchScoreboardByDate(
      new Date().toISOString().slice(0, 10).replace(/-/g, '')
    );
    games = parseScoreboardGames(response, seasonYear, 1);
  }

  // Cache the result
  cacheService.set(cacheKey, games, CACHE_TTL.ESPN_SCOREBOARD);

  res.json({
    games,
    cached: false,
    season: seasonYear,
    week: weekNumber,
  });
}));

/**
 * GET /api/cfb/game/:eventId
 *
 * Get detailed game summary for a specific ESPN event
 */
router.get('/game/:eventId', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const { eventId } = req.params;

  const cacheKey = `espn:game:${eventId}`;

  // Check cache
  const cached = cacheService.get(cacheKey);
  if (cached) {
    return res.json({ ...cached, cached: true });
  }

  const summary = await fetchGameSummary(eventId);

  // Cache for shorter time since game details change frequently during live games
  cacheService.set(cacheKey, summary, 30);

  res.json({ ...summary, cached: false });
}));

/**
 * GET /api/cfb/schedule
 *
 * Get full schedule for a week (longer cache)
 */
router.get('/schedule', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const { week, season } = req.query;

  const seasonYear = season ? parseInt(season as string, 10) : new Date().getFullYear();
  const weekNumber = week ? parseInt(week as string, 10) : 1;

  const cacheKey = `espn:schedule:${seasonYear}:week:${weekNumber}`;

  // Check cache
  const cached = cacheService.get<ParsedGame[]>(cacheKey);
  if (cached) {
    return res.json({
      games: cached,
      cached: true,
      season: seasonYear,
      week: weekNumber,
    });
  }

  const response = await fetchScoreboard(seasonYear, weekNumber);
  const games = parseScoreboardGames(response, seasonYear, weekNumber);

  // Cache schedule for longer
  cacheService.set(cacheKey, games, CACHE_TTL.ESPN_SCHEDULE);

  res.json({
    games,
    cached: false,
    season: seasonYear,
    week: weekNumber,
  });
}));

/**
 * GET /api/cfb/cache-stats
 *
 * Get cache statistics (for debugging)
 */
router.get('/cache-stats', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const stats = cacheService.getStats();
  const cfbKeys = stats.keys.filter(k => k.startsWith('espn:'));

  res.json({
    totalCacheEntries: stats.size,
    cfbCacheEntries: cfbKeys.length,
    cfbCacheKeys: cfbKeys,
  });
}));

/**
 * GET /api/cfb/rankings
 *
 * Get college football rankings (AP Top 25)
 * Cached for 1 hour since rankings don't change frequently
 */
router.get('/rankings', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const cacheKey = 'espn:rankings';

  // Check cache
  const cached = cacheService.get<RankingsResponse>(cacheKey);
  if (cached) {
    console.log(`[CFB] Cache hit: ${cacheKey}`);
    return res.json({
      ...cached,
      cached: true,
    });
  }

  console.log(`[CFB] Cache miss: ${cacheKey}`);

  const rankings = await fetchRankings();

  // Cache for 1 hour - rankings don't change frequently
  cacheService.set(cacheKey, rankings, 3600);

  res.json({
    ...rankings,
    cached: false,
  });
}));

export default router;
