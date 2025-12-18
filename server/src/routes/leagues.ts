import { Router } from 'express';
import {
  createLeague,
  joinLeague,
  getLeague,
  getLeagueMembers,
  getMyLeagues,
  updateLeagueSettings,
} from '../controllers/leagueController';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

// My leagues dashboard
router.get('/my', authenticate, asyncHandler(getMyLeagues));

// League CRUD
router.post('/create', authenticate, asyncHandler(createLeague));
router.post('/join', authenticate, asyncHandler(joinLeague));
router.get('/:leagueId', authenticate, asyncHandler(getLeague));
router.get('/:leagueId/members', authenticate, asyncHandler(getLeagueMembers));
router.patch('/:leagueId/settings', authenticate, asyncHandler(updateLeagueSettings));

export default router;
