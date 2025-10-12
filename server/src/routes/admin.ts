import { Router } from 'express';
import {
  enterGameResult,
  calculateWeeklyScores,
  getGameResults,
} from '../controllers/adminController';
import { authenticate } from '../middleware/auth';

const router = Router();

// For MVP, these routes are protected but don't check for admin role
// In production, you would add an admin check middleware
router.post('/game-result', authenticate, enterGameResult);
router.post('/calculate-scores/:leagueId/:weekNumber', authenticate, calculateWeeklyScores);
router.get('/game-results/:weekNumber', authenticate, getGameResults);

export default router;
