import { Router } from 'express';
import {
  getWeeklyStandings,
  getOverallStandings,
} from '../controllers/standingsController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.get('/:leagueId/week/:weekNumber', authenticate, getWeeklyStandings);
router.get('/:leagueId/overall', authenticate, getOverallStandings);

export default router;
