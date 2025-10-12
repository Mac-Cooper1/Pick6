import { Router } from 'express';
import {
  getAllTeams,
  getDraftPicks,
  draftTeam,
  getAvailableTeams,
} from '../controllers/draftController';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.get('/teams', authenticate, asyncHandler(getAllTeams));
router.get('/:leagueId/picks', authenticate, asyncHandler(getDraftPicks));
router.post('/:leagueId/pick', authenticate, asyncHandler(draftTeam));
router.get('/:leagueId/available', authenticate, asyncHandler(getAvailableTeams));

export default router;
