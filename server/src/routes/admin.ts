import { Router } from 'express';
import {
  enterGameResult,
  calculateWeeklyScores,
  getGameResults,
} from '../controllers/adminController';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

// For MVP, these routes are protected but don't check for admin role
// In production, you would add an admin check middleware
router.post('/game-result', authenticate, asyncHandler(enterGameResult));
router.post('/calculate-scores/:leagueId/:weekNumber', authenticate, asyncHandler(calculateWeeklyScores));
router.get('/game-results/:weekNumber', authenticate, asyncHandler(getGameResults));

export default router;
