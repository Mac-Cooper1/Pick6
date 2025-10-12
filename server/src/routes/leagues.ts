import { Router } from 'express';
import {
  createLeague,
  joinLeague,
  getLeague,
  getLeagueMembers,
} from '../controllers/leagueController';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.post('/create', authenticate, asyncHandler(createLeague));
router.post('/join', authenticate, asyncHandler(joinLeague));
router.get('/:leagueId', authenticate, asyncHandler(getLeague));
router.get('/:leagueId/members', authenticate, asyncHandler(getLeagueMembers));

export default router;
