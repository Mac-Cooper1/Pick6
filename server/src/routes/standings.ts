import { Router } from 'express';
import {
  getWeeklyStandings,
  getOverallStandings,
  getSeasonGrid,
  getWeekDetail,
} from '../controllers/standingsController';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.get('/:leagueId/weeks', authenticate, asyncHandler(getSeasonGrid));
router.get('/:leagueId/week/:weekNumber/detail', authenticate, asyncHandler(getWeekDetail));
router.get('/:leagueId/week/:weekNumber', authenticate, asyncHandler(getWeeklyStandings));
router.get('/:leagueId/overall', authenticate, asyncHandler(getOverallStandings));

export default router;
