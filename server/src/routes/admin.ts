import { Router } from 'express';
import {
  syncCurrentEndpoint,
  syncCalendarEndpoint,
  resetPasswordEndpoint,
  syncWeekEndpoint,
  syncGamesEndpoint,
  syncOddsEndpoint,
  finalizeGamesEndpoint,
  gameOverrideEndpoint,
  previewEspnGames,
  previewCurrentOdds,
  getGames,
  syncAllLeaguesEndpoint,
} from '../controllers/adminController';
import { requireAdmin } from '../middleware/adminAuth';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

// Every admin route requires either the ADMIN_SECRET header (scheduled jobs)
// or a JWT belonging to a league commissioner (in-app controls).
router.use(asyncHandler(requireAdmin));

// The scheduled-sync entry point (GitHub Actions hits this)
router.post('/sync-current', asyncHandler(syncCurrentEndpoint));

// Season calendar (D6)
router.post('/sync-calendar/:seasonYear', asyncHandler(syncCalendarEndpoint));

// Granular sync endpoints (manual/diagnostic)
router.post('/sync-week/:leagueId/:weekNumber', asyncHandler(syncWeekEndpoint));
router.post('/sync-games/:seasonYear/:weekNumber', asyncHandler(syncGamesEndpoint));
router.post('/sync-odds', asyncHandler(syncOddsEndpoint));
router.post('/finalize-games/:seasonYear/:weekNumber', asyncHandler(finalizeGamesEndpoint));
router.post('/sync-all-leagues/:seasonYear/:weekNumber', asyncHandler(syncAllLeaguesEndpoint));

// Commissioner escape hatches
router.post('/game-override', asyncHandler(gameOverrideEndpoint));
router.post('/reset-password', asyncHandler(resetPasswordEndpoint));

// Preview endpoints (read-only)
router.get('/espn-games/:seasonYear/:weekNumber', asyncHandler(previewEspnGames));
router.get('/current-odds', asyncHandler(previewCurrentOdds));
router.get('/games/:seasonYear/:weekNumber', asyncHandler(getGames));

export default router;
