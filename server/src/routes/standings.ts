import { Router } from 'express';
import {
  getWeeklyStandings,
  getOverallStandings,
} from '../controllers/standingsController';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.get('/:leagueId/week/:weekNumber', authenticate, asyncHandler(getWeeklyStandings));
router.get('/:leagueId/overall', authenticate, asyncHandler(getOverallStandings));

export default router;
