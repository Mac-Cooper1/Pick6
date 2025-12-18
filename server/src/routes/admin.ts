import { Router } from 'express';
import {
  enterGameResult,
  calculateWeeklyScores,
  getGameResults,
  syncWeekEndpoint,
  syncGamesEndpoint,
  syncOddsEndpoint,
  finalizeGamesEndpoint,
  previewEspnGames,
  previewCurrentOdds,
  getGames,
  syncAllLeaguesEndpoint,
} from '../controllers/adminController';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

// For MVP, these routes are protected but don't check for admin role
// In production, you would add an admin check middleware

// Legacy manual entry endpoints (kept for backwards compatibility)
router.post('/game-result', authenticate, asyncHandler(enterGameResult));
router.post('/calculate-scores/:leagueId/:weekNumber', authenticate, asyncHandler(calculateWeeklyScores));
router.get('/game-results/:weekNumber', authenticate, asyncHandler(getGameResults));

// Automated sync endpoints
router.post('/sync-week/:leagueId/:weekNumber', authenticate, asyncHandler(syncWeekEndpoint));
router.post('/sync-games/:seasonYear/:weekNumber', authenticate, asyncHandler(syncGamesEndpoint));
router.post('/sync-odds', authenticate, asyncHandler(syncOddsEndpoint));
router.post('/finalize-games/:seasonYear/:weekNumber', authenticate, asyncHandler(finalizeGamesEndpoint));
router.post('/sync-all-leagues/:seasonYear/:weekNumber', authenticate, asyncHandler(syncAllLeaguesEndpoint));

// Preview endpoints (read-only)
router.get('/espn-games/:seasonYear/:weekNumber', authenticate, asyncHandler(previewEspnGames));
router.get('/current-odds', authenticate, asyncHandler(previewCurrentOdds));
router.get('/games/:seasonYear/:weekNumber', authenticate, asyncHandler(getGames));

export default router;
